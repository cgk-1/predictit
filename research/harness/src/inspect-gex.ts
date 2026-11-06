// Quick inspection of GEX + chain features on a collected Cboe snapshot (real, delayed data).
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseCboeChain, parseCboeIntraday } from "@predictit/adapters";
import { gexSummary, chainFeatures, fmtGexUsd, barFeatures, sessionClock, etDate, fmtEt, gexRegimeLabel } from "@predictit/engine";

const chainPath = process.argv[2]!;
const intradayPath = process.argv[3];
const raw = JSON.parse(gunzipSync(readFileSync(chainPath)).toString("utf8"));
const receivedAt = Date.parse(raw._received_utc);
const chain = parseCboeChain(raw, receivedAt, { maxDays: 95, strikePct: 0.1 });
const asOf = chain.stamp.observedAt;
console.log("spot", chain.spot, "observed", fmtEt(asOf), "received", fmtEt(receivedAt), "options", chain.options.length);
const t0 = performance.now();
const g = gexSummary(chain, asOf);
const t1 = performance.now();
console.log(`gex computed in ${(t1 - t0).toFixed(0)}ms over ${g.contractsUsed} contracts`);
console.log("totals", { net: fmtGexUsd(g.totals.net), call: fmtGexUsd(g.totals.call), put: fmtGexUsd(g.totals.put), net0dte: fmtGexUsd(g.totals.net0dte), per1pct: fmtGexUsd(g.totals.netPer1pct), volGamma0dte: fmtGexUsd(g.totals.volGamma0dte) });
console.log("flip", g.flip.level?.toFixed(1), "flip0dte", g.flip.level0dte?.toFixed(1), "walls", g.walls, "near1pct share", g.nearSpot.within1pctShare.toFixed(2));
console.log("regime", gexRegimeLabel(g));
console.log("sensitivity", g.sensitivity.map((s) => ({ model: s.model, net: fmtGexUsd(s.net), net0: fmtGexUsd(s.net0dte), flip: s.flip?.toFixed(0) })));
console.log("top strikes by |net|:", [...g.byStrike].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 8).map((r) => `${r.strike}: ${fmtGexUsd(r.net)} (0dte ${fmtGexUsd(r.net0dte)})`));
console.log("notes", g.notes.map((n) => n.message));
const clock = sessionClock(asOf);
const cf = chainFeatures(chain, asOf, clock.minutesToClose, etDate(asOf));
console.log("chain features: front", cf.front, "expMoveToClose", cf.expectedMoveToClose?.toFixed(1), "liq", cf.liquidity, "pcVol0", cf.pcVolume0dte?.toFixed(2), "pcOi0", cf.pcOi0dte?.toFixed(2));
console.log("term", cf.expiries.map((e) => `${e.expiry} atmIv=${e.atmIv?.toFixed(3)} skew=${e.skew25?.toFixed(3)} straddle=${e.straddleMid?.toFixed(1)}`));
if (intradayPath) {
  const iraw = JSON.parse(gunzipSync(readFileSync(intradayPath)).toString("utf8"));
  const bars = parseCboeIntraday(iraw, Date.parse(iraw._received_utc));
  const bf = barFeatures(bars.bars, asOf, etDate(asOf), clock.session.openMs);
  console.log("bar features", { n: bf.nBars, last: bf.last, ret5: bf.ret5, ret30: bf.ret30, rv30: bf.rv30?.toFixed(3), park30: bf.park30?.toFixed(3), atr14: bf.atr14?.toFixed(2), er60: bf.er60?.toFixed(2), comp15: bf.compression15?.toFixed(2), or15: bf.or15, sessHL: [bf.sessHigh, bf.sessLow], twap: bf.twap?.toFixed(1), vwap: bf.vwap, calls: bf.callsVolToday, puts: bf.putsVolToday });
}
