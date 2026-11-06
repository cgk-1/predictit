import type { MtfSummary, TfIndicators } from "@predictit/engine";
import { fmtNum, fmtPts } from "../lib/format";

export function trendGlyph(t: TfIndicators["trend"]): string {
  return t === "up" ? "↑" : t === "down" ? "↓" : t === "flat" ? "→" : "·";
}

export function alignmentText(label: MtfSummary["alignment"]["label"]): string {
  switch (label) {
    case "aligned-up":
      return "aligned up";
    case "aligned-down":
      return "aligned down";
    case "pullback-in-uptrend":
      return "pullback in uptrend";
    case "bounce-in-downtrend":
      return "bounce in downtrend";
    case "mixed":
      return "mixed";
    default:
      return "n/a";
  }
}

/** Compact row: 1m ↑ · 5m ↑ · 10m → · 30m ↑ — aligned up */
export function TimeframesCompact({ mtf }: { mtf: MtfSummary | null }) {
  if (!mtf) return <span className="muted">n/a</span>;
  return (
    <div className="tf-compact">
      {mtf.frames.map((f) => (
        <span key={f.tf} className={`tf-pill tf-${f.trend}`} title={f.text}>
          <span className="tf-name">{f.tf}m</span>
          <span className="tf-glyph">{trendGlyph(f.trend)}</span>
        </span>
      ))}
      <span className={`tf-align tf-align-${mtf.alignment.label}`}>{alignmentText(mtf.alignment.label)}</span>
    </div>
  );
}

/** Full table for the Today view. */
export function TimeframesTable({ mtf }: { mtf: MtfSummary | null }) {
  if (!mtf) return <p className="muted">No bar data.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>TF</th>
            <th>Trend</th>
            <th className="num">Strength</th>
            <th className="num">Last bar</th>
            <th className="num">ROC3</th>
            <th className="num">EMA9</th>
            <th className="num">EMA21</th>
            <th className="num">Slope %/bar</th>
            <th className="num">RSI14</th>
            <th className="num">ATR14</th>
            <th className="num">Range pos</th>
            <th>Structure</th>
            <th className="num">Bars</th>
          </tr>
        </thead>
        <tbody>
          {mtf.frames.map((f) => (
            <tr key={f.tf} className={f.trend === "n/a" ? "row-quiet" : undefined}>
              <td className="mono">{f.tf}m</td>
              <td className={`tf-${f.trend}`}>
                {trendGlyph(f.trend)} {f.trend}
              </td>
              <td className="num">{f.trend === "n/a" ? "—" : `${Math.round(f.strength * 100)}%`}</td>
              <td className={`num ${f.lastBarRetPct !== null && f.lastBarRetPct < 0 ? "neg" : "pos"}`}>{f.lastBarRetPct === null ? "—" : `${f.lastBarRetPct >= 0 ? "+" : ""}${f.lastBarRetPct.toFixed(2)}%`}</td>
              <td className="num">{f.roc3Pct === null ? "—" : `${f.roc3Pct >= 0 ? "+" : ""}${f.roc3Pct.toFixed(2)}%`}</td>
              <td className="num">{fmtPts(f.ema9)}</td>
              <td className="num">{fmtPts(f.ema21)}</td>
              <td className="num">{f.ema21SlopePctPerBar === null ? "—" : f.ema21SlopePctPerBar.toFixed(3)}</td>
              <td className="num">{f.rsi14 === null ? "—" : f.rsi14.toFixed(0)}</td>
              <td className="num">{fmtNum(f.atr14, 1)}</td>
              <td className="num">{f.rangePos20 === null ? "—" : `${Math.round(f.rangePos20 * 100)}%`}</td>
              <td>{f.structure}</td>
              <td className="num">{f.bars}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">{mtf.alignment.text}</p>
    </div>
  );
}
