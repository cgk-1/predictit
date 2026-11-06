import type { QuoteEval, StrikeAnalysis } from "@predictit/engine";
import { fmtClock, fmtMs, fmtPct, fmtPremium, fmtPts, fmtSignedPts, fmtStrike } from "../lib/format";

function Side({ q }: { q: QuoteEval | null }) {
  if (!q) {
    return (
      <>
        <td className="num na" colSpan={10}>
          no quote
        </td>
      </>
    );
  }
  const feas = q.feasibility;
  const feasCls = feas.hold === "blocked" ? "chip chip-bad" : feas.resale === "ok" ? "chip chip-ok" : feas.resale === "risky" ? "chip chip-wait" : "chip chip-neutral";
  return (
    <>
      <td className="num">
        {fmtPremium(q.bid)} / {fmtPremium(q.ask)}
      </td>
      <td className="num">{fmtPremium(q.spread)}</td>
      <td className="num">
        {q.bidSize}×{q.askSize}
      </td>
      <td className="num">{fmtMs(q.quoteAgeMs)}</td>
      <td className="num">{fmtPts(q.breakevenSettle, 2)}</td>
      <td className="num">{fmtSignedPts(q.requiredMovePts)}</td>
      <td className="num">{fmtPct(q.pItm, 0)}</td>
      <td className="num">
        {fmtPremium(q.fairNoDrift)} / {fmtPremium(q.fairWithDrift)}
      </td>
      <td className={`num ${q.edgeWithDrift > 0 ? "pos" : "neg"}`}>{fmtSignedPts(q.edgeWithDrift, 2)}</td>
      <td className="wrap">
        <span className={feasCls} title={feas.reasons.join("; ") || "no blocking reasons"}>
          resale {feas.resale}, hold {feas.hold}
        </span>
        {feas.reasons.length ? <div className="xs muted">{feas.reasons.join("; ")}</div> : null}
      </td>
    </>
  );
}

const SIDE_HEADERS = ["bid / ask", "spread", "size", "age", "breakeven", "req. move", "P(ITM)", "fair nd / wd", "edge wd", "feasibility"];

export function StrikeLadder({ ladder, recommendedStrike, recommendedRight }: { ladder: StrikeAnalysis[]; recommendedStrike: number | null; recommendedRight: "C" | "P" | null }) {
  if (!ladder.length) return <p className="muted small">n/a — ladder not computed (no spot).</p>;
  const nearest = ladder.reduce((a, b) => (Math.abs(b.distance) < Math.abs(a.distance) ? b : a));
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th scope="colgroup" colSpan={10} className="group">
              Strike and approach
            </th>
            <th scope="colgroup" colSpan={10} className="group">
              Call{recommendedRight === "C" ? " (recommended side)" : ""}
            </th>
            <th scope="colgroup" colSpan={10} className="group">
              Put{recommendedRight === "P" ? " (recommended side)" : ""}
            </th>
          </tr>
          <tr>
            <th scope="col" className="num">
              strike
            </th>
            <th scope="col">side</th>
            <th scope="col" className="num">
              dist
            </th>
            <th scope="col">pattern</th>
            <th scope="col" className="num">
              crossings
            </th>
            <th scope="col" className="num">
              dwell
            </th>
            <th scope="col" className="num">
              speed 1m / 3m
            </th>
            <th scope="col" className="num">
              accel
            </th>
            <th scope="col" className="num">
              ETA
            </th>
            <th scope="col" className="num">
              P(close above)
            </th>
            {SIDE_HEADERS.map((h) => (
              <th key={`c-${h}`} scope="col" className={`num${h === "bid / ask" ? " col-sep" : ""}`}>
                {h}
              </th>
            ))}
            {SIDE_HEADERS.map((h) => (
              <th key={`p-${h}`} scope="col" className={`num${h === "bid / ask" ? " col-sep" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ladder.map((s) => {
            const isRec = recommendedStrike !== null && s.strike === recommendedStrike;
            const cls = isRec ? "row-rec" : s === nearest ? "row-spot" : "";
            return (
              <tr key={s.strike} className={cls}>
                <td className="num">
                  <strong>{fmtStrike(s.strike)}</strong>
                </td>
                <td>{s.side === "above" ? "spot above" : s.side === "below" ? "spot below" : "at"}</td>
                <td className="num">{fmtSignedPts(s.distance)}</td>
                <td className="wrap">
                  {s.bias ? <span className={`chip chip-${s.bias}`}>{s.pattern}</span> : <span className="chip chip-neutral">{s.pattern}</span>}
                  <div className="xs muted">{s.patternText}</div>
                </td>
                <td className="num">{s.interaction.crossings}</td>
                <td className="num">{fmtMs(s.interaction.dwellMs)}</td>
                <td className="num">
                  {fmtSignedPts(s.approach.speed1)} / {fmtSignedPts(s.approach.speed3)}
                </td>
                <td className="num">{fmtSignedPts(s.approach.accel)}</td>
                <td className="num">{s.approach.etaSec !== null ? fmtClock(s.approach.etaSec) : "—"}</td>
                <td className="num">{fmtPct(s.pCloseAbove, 0)}</td>
                <Side q={s.call} />
                <Side q={s.put} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
