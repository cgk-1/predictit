import { loadCboeDay } from "./load-cboe.ts";
import { frameAt, buildContext, decide, runReplay, performance as perf, fmtEt, etToMs } from "@predictit/engine";

const dir = process.argv[2]!;
const snaps = loadCboeDay(dir, { every: 1, replay: process.argv.includes("--replay") });
console.log("snapshots", snaps.length, "from", fmtEt(snaps[0]!.receivedAt), "to", fmtEt(snaps[snaps.length - 1]!.receivedAt));
const asOf = snaps[snaps.length - 1]!.receivedAt;
const frame = frameAt(snaps, asOf);
const t0 = performance.now();
const ctx = buildContext(frame);
const rec = decide({ ctx, positions: [], previous: null, realizedToday: 0 });
console.log(`decide in ${(performance.now() - t0).toFixed(0)}ms`);
console.log("asOf", fmtEt(asOf), "phase", ctx.clock.phase, "mode", ctx.mode, "spot", frame.spx?.last, "spot age s", (ctx.staleness.quoteMs ?? NaN) / 1000);
console.log("regime", { trend: ctx.regime.trend, structure: ctx.regime.structure, vol: ctx.regime.volatility, liq: ctx.regime.liquidity, gamma: ctx.regime.gamma, conf: ctx.regime.dataConfidence });
console.log("evidence:", ctx.regime.evidence);
console.log("STATE", rec.state, "| pass:", rec.passReasons, "| whyWait:", rec.whyWait);
console.log("candidates:", rec.candidates.map((c) => `${c.name} ${c.direction} ${c.lifecycle} inval=${c.invalidationLevel.toFixed(1)} target=${c.targetLevel?.toFixed(1)}`));
console.log("waits:", rec.waits.map((w) => `${w.family}: ${w.reason}`));
console.log("levels:", ctx.levels.map((l) => `${l.kind}=${l.level.toFixed(1)}`).join(" "));
console.log("notes:", rec.dataNotes.map((n) => `[${n.level}] ${n.message}`));
// replay the whole morning at 1-minute cadence, forcing LIVE-like behaviour by treating delayed data as replay (study mode)
const t1 = performance.now();
const res = runReplay(snaps, { stepMs: 60_000, closingStepMs: 10_000, slippagePts: 0.05, requireSize: true, latencyMs: 2000, qty: 1 });
console.log(`replay ${res.decisions} decisions in ${(performance.now() - t1).toFixed(0)}ms`, res.byState, "trades", res.trades.length, "fillFailures", res.fillFailures);
console.log(perf(res.trades));
