import { PHASE_LABEL } from "@predictit/engine";
import type { ServerState } from "../api/types";
import { fmtPts, fmtSignedPct, fmtSignedPts } from "../lib/format";

function Item({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <div className="market-item">
      <span className="market-label">{label}</span>
      <span className="market-value">
        {value}
        {extra ? <small>{extra}</small> : null}
      </span>
    </div>
  );
}

/** One quiet line of the numbers a trader glances at: SPX, SPY, TICK, VIX, expected move, time to close. */
export function MarketStrip({ state: s }: { state: ServerState }) {
  const spx = s.spx?.last ?? null;
  const prevClose = s.spx?.prevClose ?? s.decision?.summary?.gap.fillLevel ?? null;
  const chg = spx !== null && prevClose !== null && prevClose > 0 ? spx - prevClose : null;
  const tk = s.tickFeatures;
  const tickValue = tk.label === "n/a" || tk.last === null ? "n/a" : fmtSignedPts(tk.last, 0);
  const tickExtra = tk.label === "n/a" ? "needs Schwab live" : `10m ${fmtSignedPts(tk.avg10, 0)} ${tk.label.replace(/-/g, " ")}`;
  const emToClose = s.decision?.summary?.expectedMove.toCloseSigmaPts ?? s.chainFeatures?.expectedMoveToClose ?? null;
  const toClose = s.clock.isRegularSession ? `${Math.max(0, Math.floor(s.clock.minutesToClose))} min` : PHASE_LABEL[s.clock.phase];
  return (
    <div className="market-strip" role="group" aria-label="Market snapshot">
      <Item label="SPX" value={fmtPts(spx, 2)} extra={chg !== null ? `${fmtSignedPts(chg, 1)} (${fmtSignedPct(chg / prevClose!, 2)})` : undefined} />
      <Item label="SPY" value={fmtPts(s.spy?.last ?? null, 2)} />
      <Item label="TICK" value={tickValue} extra={tickExtra} />
      <Item label="VIX" value={fmtPts(s.vix?.last ?? null, 2)} />
      <Item label="Expected move to close" value={emToClose !== null ? `±${fmtPts(emToClose, 1)}` : "n/a"} extra={emToClose !== null ? "1σ pts" : undefined} />
      <Item label="To close" value={toClose} />
    </div>
  );
}
