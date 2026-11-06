/**
 * Research CLI: replay collected days through the engine with explicit execution assumptions and compare
 * against baselines. Usage:
 *   npx tsx src/cli.ts replay <dataDir> [--days 2026-11-06,...] [--slippage 0.05] [--latency 2000] [--qty 1] [--only strike-flip]
 *   npx tsx src/cli.ts baselines <dataDir>
 * Data dir layout: <dataDir>/<YYYY-MM-DD>/{spx_chain_near,spx_intraday}/*.json.gz (from research/collectors/cboe_delayed_collector.py)
 * All delayed snapshots are re-stamped to the time they would have been available live (see load-cboe.ts).
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCboeDay } from "./load-cboe.ts";
import { runReplay, performance as perf, frameAt, buildContext, fmtEt, etToMs, sessionClock, intrinsic, DEFAULT_COSTS, resalePnl, settlementPnl, type StoredSnapshot, type ChainSnapshot, type ReplayTrade } from "@predictit/engine";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function days(dataDir: string): string[] {
  const want = arg("days");
  const all = readdirSync(dataDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return want ? want.split(",") : all;
}

/** Baselines: always-call / always-put / random at fixed times with the same exit rules (30-minute time stop) and costs. */
function baselines(snaps: StoredSnapshot[], date: string, seed = 7): Record<string, ReplayTrade[]> {
  const out: Record<string, ReplayTrade[]> = { "always-call": [], "always-put": [], random: [] };
  let rnd = seed;
  const next = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let h = 10; h <= 15; h++) {
    for (const m of [0, 30]) {
      const t = etToMs(date, h, m);
      if (sessionClock(t).minutesToClose < 35) continue;
      const f = frameAt(snaps, t);
      const chain = f.spxChain;
      const spot = f.spx?.last;
      // require fresh data at entry and exit (no stale frames beyond the recorded window)
      if (!chain || !spot || t - chain.stamp.observedAt > 3 * 60_000) continue;
      const exitT = t + 30 * 60_000;
      const f2 = frameAt(snaps, exitT);
      const chain2 = f2.spxChain;
      if (!chain2 || exitT - chain2.stamp.observedAt > 3 * 60_000) continue;
      const pick = (right: "C" | "P") => {
        const today = chain.options.filter((o) => o.right === right && o.expiry === date && o.ask > 0.3);
        if (!today.length) return null;
        // nearest OTM strike
        const cands = today.filter((o) => (right === "C" ? o.strike >= spot : o.strike <= spot)).sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
        return cands[0] ?? null;
      };
      const trade = (right: "C" | "P", family: string) => {
        const o = pick(right);
        if (!o) return;
        const q2 = chain2.options.find((x) => x.osi === o.osi);
        const exitPx = q2 && q2.bid > 0 ? q2.bid : f2.spx ? intrinsic(right, o.strike, f2.spx.last) : 0;
        const pnl = resalePnl({ entryPremium: o.ask, exitPremium: exitPx, qty: 1, costs: DEFAULT_COSTS }).net;
        out[family]!.push({ id: `${family}-${t}`, date, family, direction: right === "C" ? "call" : "put", osi: o.osi, entryAt: t, entrySpot: spot, entryPremium: o.ask, exitAt: exitT, exitPremium: exitPx, exitReason: "time stop 30m", pnlUsd: pnl, retPct: pnl / (o.ask * 100), phase: sessionClock(t).phase, regime: "n/a", fillFailed: false });
      };
      trade("C", "always-call");
      trade("P", "always-put");
      trade(next() < 0.5 ? "C" : "P", "random");
    }
  }
  return out;
}

function fmtReport(label: string, trades: ReplayTrade[]): string {
  const p = perf(trades);
  const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");
  return `| ${label} | ${p.n} | ${f(p.netExpectancyUsd, 0)} | ${f(p.medianRetPct * 100, 0)}% | ${f(p.winRate * 100, 0)}% | ${f(p.payoffRatio)} | ${f(p.fullLossRate * 100, 0)}% | ${f(p.maxDrawdownUsd, 0)} | ${p.longestLosingStreak} | ${f(p.totalUsd, 0)} |`;
}

async function main() {
  const cmd = process.argv[2];
  const dataDir = process.argv[3];
  if (!cmd || !dataDir) {
    console.error("usage: cli.ts replay|baselines <dataDir> [--days a,b] [--slippage 0.05] [--latency 2000] [--qty 1] [--only family]");
    process.exit(1);
  }
  const slippage = Number(arg("slippage", "0.05"));
  const latency = Number(arg("latency", "2000"));
  const qty = Number(arg("qty", "1"));
  const only = arg("only");
  const ds = days(dataDir);
  const lines: string[] = [`# Replay report`, ``, `Generated ${new Date().toISOString()} over ${ds.length} day(s): ${ds.join(", ")}.`, ``, `Execution assumptions: entry at ask + ${slippage} slippage, exit at bid − ${slippage}, latency ${latency} ms, fill requires quoted size ≥ ${qty}, costs ${DEFAULT_COSTS.commissionPerContract + DEFAULT_COSTS.feesPerContract} USD/contract/side. Delayed snapshots re-stamped to their live-availability time (REPLAY mode). Settlement in replay uses the last available SPX value, NOT the official settlement — flagged.`, ``];
  const allTrades: ReplayTrade[] = [];
  const allBase: Record<string, ReplayTrade[]> = {};
  let decisions = 0;
  const byState: Record<string, number> = {};
  for (const d of ds) {
    const dir = join(dataDir, d);
    if (!existsSync(join(dir, "spx_chain_near"))) continue;
    const snaps = loadCboeDay(dir, { replay: true });
    if (!snaps.length) continue;
    console.error(`day ${d}: ${snaps.length} snapshots ${fmtEt(snaps[0]!.receivedAt)} → ${fmtEt(snaps[snaps.length - 1]!.receivedAt)}`);
    if (cmd === "replay" || cmd === "all") {
      const r = runReplay(snaps, { stepMs: 60_000, closingStepMs: 10_000, slippagePts: slippage, requireSize: true, latencyMs: latency, qty, only });
      decisions += r.decisions;
      for (const [k, v] of Object.entries(r.byState)) byState[k] = (byState[k] ?? 0) + v;
      allTrades.push(...r.trades);
      console.error(`  decisions ${r.decisions} ${JSON.stringify(r.byState)} trades ${r.trades.length} fillFailures ${r.fillFailures}`);
    }
    const b = baselines(snaps, d);
    for (const [k, v] of Object.entries(b)) (allBase[k] = allBase[k] ?? []).push(...v);
  }
  lines.push(`## Engine (as-of replay)`, ``, `Decisions: ${decisions}; by state: ${JSON.stringify(byState)}; abstention (WAIT+PASS share): ${decisions ? (((byState["WAIT"] ?? 0) + (byState["PASS"] ?? 0)) / decisions * 100).toFixed(0) : "n/a"}%`, ``);
  const hdr = `| strategy | n | net expectancy $ | median ret | win rate | payoff | full-loss | max DD $ | losing streak | total $ |\n|---|---|---|---|---|---|---|---|---|---|`;
  lines.push(hdr, fmtReport("engine (all families)", allTrades));
  const fams = [...new Set(allTrades.map((t) => t.family))];
  for (const f of fams) lines.push(fmtReport(`engine: ${f}`, allTrades.filter((t) => t.family === f)));
  lines.push(``, `## Baselines (30-minute holds at 10:00–15:30 every 30 min, nearest-OTM 0DTE, same costs)`, ``, hdr);
  for (const [k, v] of Object.entries(allBase)) lines.push(fmtReport(k, v));
  lines.push(``, `## Trades`, ``, `| date | family | dir | contract | entry ET | entry | exit ET | exit | reason | P&L $ | ret |`, `|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const t of allTrades) lines.push(`| ${t.date} | ${t.family} | ${t.direction} | ${t.osi.trim()} | ${fmtEt(t.entryAt).slice(11, 19)} | ${t.entryPremium.toFixed(2)} | ${Number.isFinite(t.exitAt) ? fmtEt(t.exitAt).slice(11, 19) : "open"} | ${Number.isFinite(t.exitPremium) ? t.exitPremium.toFixed(2) : "n/a"} | ${t.exitReason} | ${t.pnlUsd.toFixed(0)} | ${(t.retPct * 100).toFixed(0)}% |`);
  lines.push(``, `## Caveats`, ``, `- Sample is tiny (${ds.length} day(s)); nothing here is statistically meaningful. The purpose is to exercise the pipeline end-to-end without hindsight.`, `- Delayed Cboe data: quotes are one-minute snapshots; intra-minute fills are not observable; results are optimistic on fill timing and pessimistic on quote freshness.`, `- Baselines include no selection; they bound what "no skill" looks like under identical costs.`);
  const outDir = arg("out", "../results")!;
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `replay_${ds[0]}_${ds[ds.length - 1]}.md`);
  writeFileSync(outPath, lines.join("\n"));
  console.error(`wrote ${outPath}`);
  console.log(lines.slice(0, 20).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
