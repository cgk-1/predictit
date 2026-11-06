/**
 * Replay the closing-window module over a collected day's 15:40–16:00 ET snapshots (delayed data re-stamped to
 * live availability) and print how the ladder, patterns and recommendation evolved. Pipeline check and study aid.
 * Usage: npx tsx src/closing-replay.ts <dataDir/YYYY-MM-DD> [--step 30]
 */
import { loadCboeDay } from "./load-cboe.ts";
import { frameAt, buildContext, assessClosingWindow, fmtEtTime, etToMs } from "@predictit/engine";

const dir = process.argv[2]!;
const stepSec = Number(process.argv.includes("--step") ? process.argv[process.argv.indexOf("--step") + 1] : 30);
const snaps = loadCboeDay(dir, { replay: true });
const date = dir.slice(-10);
const start = etToMs(date, 15, 40);
const end = etToMs(date, 16, 0, 30);
console.log(`snapshots ${snaps.length}; replaying ${fmtEtTime(start)}–${fmtEtTime(end)} ET every ${stepSec}s`);
let last = "";
for (let t = start; t <= end; t += stepSec * 1000) {
  const frame = frameAt(snaps, t);
  if (!frame.spx || !frame.spxChain) continue;
  const ctx = buildContext(frame);
  // treat the replayed data as LIVE for the module's feasibility logic (we are studying mechanics, not executing)
  const a = assessClosingWindow({ clock: ctx.clock, spx: frame.spx, spy: frame.spy ?? null, es: null, path: ctx.path, spyPath: ctx.companion.path ?? [], esPath: [], chain: frame.spxChain, mode: "LIVE" });
  const r = a.recommendation;
  const row = `${fmtEtTime(t)} ${a.subWindow.padEnd(10)} spot ${a.spot.toFixed(1)} age ${(a.spotAgeMs / 1000).toFixed(0)}s σ ${a.remaining.sigmaUsedPts.toFixed(1)} (iv ${a.remaining.sigmaIvPts?.toFixed(1) ?? "n/a"} rv ${a.remaining.sigmaRvPts?.toFixed(1) ?? "n/a"}) drift ${a.remaining.driftPts.toFixed(1)} → ${r.state}${r.contract ? ` ${r.contract.osi.trim()} ask ${r.contract.ask} edge ${r.contract.edgeWithDrift.toFixed(2)} ${r.mode}` : ""}`;
  const patterns = a.ladder.filter((s) => s.pattern !== "none").map((s) => `${s.strike}:${s.pattern}${s.bias ? "/" + s.bias : ""}`).join(" ");
  const line = row + (patterns ? `\n      patterns: ${patterns}` : "") + (a.passReasons.length ? `\n      pass: ${a.passReasons.join("; ")}` : "");
  if (line !== last) console.log(line);
  last = line;
}
