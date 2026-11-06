/**
 * Offline exercise of the market-lean ensemble: replay a collected day minute by minute, make predictions at each
 * minute, score them when due (15 m / 60 m), update weights with the bounded rule, and report prospective-style
 * statistics. Tiny samples: this is a pipeline check, not evidence.
 * Usage: npx tsx src/lean-replay.ts <dataDir/YYYY-MM-DD>
 */
import { loadCboeDay } from "./load-cboe.ts";
import { frameAt, buildContext, computeLean, makePredictions, scorePredictions, initialWeights, leanStats, fmtEt, type PendingPrediction, type PricePoint } from "@predictit/engine";

const dir = process.argv[2]!;
const snaps = loadCboeDay(dir, { replay: true });
if (!snaps.length) throw new Error("no snapshots");
const t0 = Math.ceil(snaps[0]!.receivedAt / 60_000) * 60_000;
const tEnd = snaps[snaps.length - 1]!.receivedAt;
let weights = initialWeights(t0);
let pending: PendingPrediction[] = [];
const path: PricePoint[] = [];
let n = 0;
const leans: Array<{ t: number; score: number; dir: string }> = [];
for (let t = t0; t <= tEnd; t += 60_000) {
  const frame = frameAt(snaps, t);
  if (!frame.spx || !frame.spxBars) continue;
  const ctx = buildContext(frame);
  // extend the price path with the as-of quote (what the live loop does with each tick)
  path.push({ t: frame.spx.quoteTime, p: frame.spx.last });
  const sc = scorePredictions(pending, path, t, weights);
  pending = sc.pending;
  weights = sc.weights;
  const lean = computeLean(ctx, ctx.calendar, weights);
  leans.push({ t, score: lean.score, dir: lean.direction });
  pending.push(...makePredictions(lean, frame.spx.last));
  n++;
}
const st = leanStats(weights);
console.log(`minutes evaluated ${n} (${fmtEt(t0)} → ${fmtEt(tEnd)}); pending unscored ${pending.length}`);
for (const [h, s] of Object.entries(st.horizons)) console.log(`${h}: n=${s.n} hit=${(s.hitRate * 100).toFixed(0)}% CI[${(s.ci[0] * 100).toFixed(0)},${(s.ci[1] * 100).toFixed(0)}] brier=${s.brier.toFixed(3)} (baseline 0.25) flat=${s.flat}`);
console.log(st.note);
console.log("weights moved most:", st.indicators.map((i) => ({ id: i.id, w: +i.weight.toFixed(3), prior: i.prior, n: i.n, hit: i.hitRate === null ? null : +(i.hitRate * 100).toFixed(0) })).sort((a, b) => Math.abs(b.w / b.prior - 1) - Math.abs(a.w / a.prior - 1)).slice(0, 6));
const dirs = leans.reduce((a, l) => ({ ...a, [l.dir]: (a[l.dir] ?? 0) + 1 }), {} as Record<string, number>);
console.log("lean direction distribution:", dirs);
