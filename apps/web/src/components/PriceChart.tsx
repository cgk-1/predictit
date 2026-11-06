import { memo, useMemo, useRef } from "react";
import type { Bar1m, KeyLevel } from "@predictit/engine";
import { etDate, etToMs } from "@predictit/engine";
import { useWidth } from "../lib/useWidth";
import { fmtPts, fmtTimeShort } from "../lib/format";

const H = 300;
const M = { top: 12, right: 64, bottom: 24, left: 8 };

function niceStep(range: number, target = 6): number {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

const SHORT: Record<string, string> = {
  "prior-high": "PDH",
  "prior-low": "PDL",
  "prior-close": "PDC",
  "or-high": "ORH",
  "or-low": "ORL",
  "session-high": "HOD",
  "session-low": "LOD",
  vwap: "VWAP",
  twap: "TWAP",
  "gex-flip": "γ-flip",
  "call-wall": "call wall",
  "put-wall": "put wall",
  "largest-gex": "0DTE γ",
  round: "",
  "gap-fill": "gap",
  "prior-week-high": "PWH",
  "prior-week-low": "PWL",
  "high-oi-strike": "high OI",
};

function levelColor(kind: KeyLevel["kind"]): string {
  switch (kind) {
    case "gex-flip":
    case "largest-gex":
    case "high-oi-strike":
      return "var(--replay)";
    case "call-wall":
      return "var(--call)";
    case "put-wall":
      return "var(--put)";
    case "or-high":
    case "or-low":
      return "var(--wait)";
    case "session-high":
    case "session-low":
    case "vwap":
    case "twap":
      return "var(--manage)";
    case "round":
      return "var(--border-strong)";
    default:
      return "var(--text-2)";
  }
}

export interface PriceChartProps {
  /** completed bars only (the parent filters by the current minute) */
  bars: Bar1m[];
  levels: KeyLevel[];
  spot: number | null;
}

export const PriceChart = memo(function PriceChart({ bars: allBars, levels, spot }: PriceChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const width = useWidth(ref, 720);
  const model = useMemo(() => {
    if (!allBars.length) return null;
    // the series may carry prior sessions (price history); draw the latest session only
    const date = etDate(allBars[allBars.length - 1]!.t);
    const bars = allBars.filter((b) => etDate(b.t) === date);
    const first = bars[0]!;
    const open = etToMs(date, 9, 30);
    const close = etToMs(date, 16, 0);
    const lastEnd = bars[bars.length - 1]!.t + 60_000;
    const x0 = Math.min(open, first.t);
    const x1 = Math.max(close, lastEnd);
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of bars) {
      lo = Math.min(lo, b.l);
      hi = Math.max(hi, b.h);
    }
    if (spot !== null) {
      lo = Math.min(lo, spot);
      hi = Math.max(hi, spot);
    }
    const range0 = Math.max(hi - lo, 1);
    const shown = levels.filter((l) => l.kind !== "round" && l.level >= lo - range0 * 0.35 && l.level <= hi + range0 * 0.35);
    for (const l of shown) {
      lo = Math.min(lo, l.level);
      hi = Math.max(hi, l.level);
    }
    const pad = (hi - lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;
    const pw = width - M.left - M.right;
    const ph = H - M.top - M.bottom;
    const x = (t: number) => M.left + ((t - x0) / (x1 - x0)) * pw;
    const y = (p: number) => M.top + ((hi - p) / (hi - lo)) * ph;
    const step = niceStep(hi - lo);
    const yTicks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
    const xTicks: number[] = [];
    for (let t = etToMs(date, 10, 0); t <= x1; t += 30 * 60_000) xTicks.push(t);
    const cw = Math.max(1, Math.min(8, pw / ((x1 - x0) / 60_000) - 1));
    // labels: merge levels at (almost) the same price, then push apart vertically so none overlap
    const merged: Array<{ level: number; kinds: KeyLevel["kind"][]; text: string }> = [];
    for (const l of [...shown].sort((a, b) => b.level - a.level)) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.level - l.level) < (hi - lo) * 0.004) {
        last.kinds.push(l.kind);
        last.text = `${last.text} / ${SHORT[l.kind] || l.kind}`;
      } else merged.push({ level: l.level, kinds: [l.kind], text: SHORT[l.kind] || l.kind });
    }
    const labels: Array<{ level: number; kind: KeyLevel["kind"]; text: string; ly: number }> = [];
    let prevY = -Infinity;
    for (const m of merged) {
      const ly = Math.max(y(m.level) - 3, prevY + 11);
      labels.push({ level: m.level, kind: m.kinds[0]!, text: `${m.text} ${fmtPts(m.level, 1)}`, ly });
      prevY = ly;
    }
    return { x, y, yTicks, xTicks, cw, lo, hi, shown, pw, ph, x0, x1, bars, labels };
  }, [allBars, levels, spot, width]);

  if (!model) {
    return (
      <div ref={ref} className="chart">
        <p className="muted small">n/a — no completed 1-minute SPX bars yet.</p>
      </div>
    );
  }
  const { x, y, yTicks, xTicks, cw, shown, bars, labels } = model;
  return (
    <div ref={ref} className="chart">
      <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label="SPX one-minute candles with key levels">
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} />
            <text className="axis" x={width - M.right + 6} y={y(v) + 3.5}>
              {fmtPts(v, 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t}>
            <line className="grid" x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} />
            <text className="axis" x={x(t)} y={H - 7} textAnchor="middle">
              {fmtTimeShort(t)}
            </text>
          </g>
        ))}
        {shown.map((l, i) => (
          <line key={`${l.kind}-${i}`} x1={M.left} x2={width - M.right} y1={y(l.level)} y2={y(l.level)} stroke={levelColor(l.kind)} strokeDasharray="4 3" strokeWidth={1} opacity={0.8} />
        ))}
        {labels.map((l) => (
          <text key={`lbl-${l.level}`} x={width - M.right - 4} y={l.ly} textAnchor="end" fill={levelColor(l.kind)} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}>
            {l.text}
          </text>
        ))}
        {bars.map((b) => {
          const up = b.c >= b.o;
          const col = up ? "var(--candle-up)" : "var(--candle-down)";
          const cx = x(b.t + 30_000);
          const top = y(Math.max(b.o, b.c));
          const bot = y(Math.min(b.o, b.c));
          return (
            <g key={b.t}>
              <line x1={cx} x2={cx} y1={y(b.h)} y2={y(b.l)} stroke={col} strokeWidth={1} />
              <rect x={cx - cw / 2} y={top} width={cw} height={Math.max(1, bot - top)} fill={col} />
            </g>
          );
        })}
        {spot !== null ? (
          <g>
            <line x1={M.left} x2={width - M.right} y1={y(spot)} y2={y(spot)} stroke="var(--text)" strokeWidth={1} />
            <rect x={width - M.right + 2} y={y(spot) - 8} width={M.right - 4} height={16} fill="var(--text)" rx={2} />
            <text x={width - M.right + 6} y={y(spot) + 3.5} fill="var(--bg)" fontWeight={700}>
              {fmtPts(spot, 1)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
});
