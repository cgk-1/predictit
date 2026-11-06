import { memo, useMemo, useRef } from "react";
import type { StrikeRow } from "@predictit/engine";
import { fmtGexUsd } from "@predictit/engine";
import { useWidth } from "../lib/useWidth";
import { fmtPts } from "../lib/format";

const H = 320;
const M = { top: 34, right: 70, bottom: 26, left: 8 };

export interface GexChartProps {
  rows: StrikeRow[];
  spot: number;
  flip: number | null;
  callWall: number | null;
  putWall: number | null;
  largest0dte: number | null;
}

export const GexChart = memo(function GexChart({ rows, spot, flip, callWall, putWall, largest0dte }: GexChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const width = useWidth(ref, 720);
  const m = useMemo(() => {
    if (!rows.length) return null;
    const strikes = rows.map((r) => r.strike);
    let step = Infinity;
    for (let i = 1; i < strikes.length; i++) step = Math.min(step, strikes[i]! - strikes[i - 1]!);
    if (!Number.isFinite(step) || step <= 0) step = 5;
    const k0 = Math.min(strikes[0]!, spot) - step;
    const k1 = Math.max(strikes[strikes.length - 1]!, spot) + step;
    let maxAbs = 0;
    for (const r of rows) maxAbs = Math.max(maxAbs, Math.abs(r.callGex), Math.abs(r.putGex), r.abs0dte);
    if (maxAbs <= 0) maxAbs = 1;
    const pw = width - M.left - M.right;
    const ph = H - M.top - M.bottom;
    const x = (k: number) => M.left + ((k - k0) / (k1 - k0)) * pw;
    const y = (v: number) => M.top + ((maxAbs - v) / (2 * maxAbs)) * ph;
    const slot = (step / (k1 - k0)) * pw;
    const bw = Math.max(1.5, Math.min(9, slot * 0.4));
    const labelEvery = Math.max(1, Math.ceil(46 / Math.max(slot, 1)));
    const yTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
    return { x, y, bw, labelEvery, yTicks, maxAbs };
  }, [rows, spot, width]);

  if (!m) {
    return (
      <div ref={ref} className="chart">
        <p className="muted small">n/a — no strikes with open interest in the ±5% window.</p>
      </div>
    );
  }
  const { x, y, bw, labelEvery, yTicks } = m;
  const raw: Array<{ k: number | null; label: string; color: string; dash?: string }> = [
    { k: spot, label: `spot ${fmtPts(spot, 1)}`, color: "var(--text)" },
    { k: flip, label: `zero-γ ${fmtPts(flip, 0)}`, color: "var(--replay)", dash: "4 3" },
    { k: callWall, label: `call wall ${callWall ?? ""}`, color: "var(--call)", dash: "2 3" },
    { k: putWall, label: `put wall ${putWall ?? ""}`, color: "var(--put)", dash: "2 3" },
    { k: largest0dte, label: `largest 0DTE ${largest0dte ?? ""}`, color: "var(--replay)", dash: "1 3" },
  ];
  // assign label rows so labels whose x positions are within ~80px do not overlap
  const placed: Array<{ x: number; row: number }> = [];
  const markers = raw
    .filter((mk): mk is typeof mk & { k: number } => mk.k !== null)
    .sort((a, b) => a.k - b.k)
    .map((mk) => {
      const mx = x(mk.k);
      let row = 0;
      while (placed.some((p) => p.row === row && Math.abs(p.x - mx) < 84)) row++;
      placed.push({ x: mx, row });
      return { ...mk, row: row % 3 };
    });
  return (
    <div ref={ref} className="chart">
      <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label="Gamma exposure by strike">
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--text-3)" : undefined} />
            <text className="axis" x={width - M.right + 6} y={y(v) + 3.5}>
              {fmtGexUsd(v)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = x(r.strike);
          return (
            <g key={r.strike}>
              <rect x={cx - bw - 0.5} y={Math.min(y(0), y(r.callGex))} width={bw} height={Math.abs(y(r.callGex) - y(0))} fill="var(--call)" opacity={0.9}>
                <title>{`${r.strike} call GEX ${fmtGexUsd(r.callGex)} (OI ${r.callOi})`}</title>
              </rect>
              <rect x={cx + 0.5} y={Math.min(y(0), y(r.putGex))} width={bw} height={Math.abs(y(r.putGex) - y(0))} fill="var(--put)" opacity={0.9}>
                <title>{`${r.strike} put GEX ${fmtGexUsd(r.putGex)} (OI ${r.putOi})`}</title>
              </rect>
              {r.abs0dte > 0 ? (
                <rect x={cx - bw * 0.3} y={y(r.abs0dte)} width={bw * 0.6} height={Math.abs(y(r.abs0dte) - y(0))} fill="none" stroke="var(--replay)" strokeWidth={1}>
                  <title>{`${r.strike} 0DTE unsigned gamma ${fmtGexUsd(r.abs0dte)}`}</title>
                </rect>
              ) : null}
              {i % labelEvery === 0 ? (
                <text className="axis" x={cx} y={H - 8} textAnchor="middle">
                  {r.strike}
                </text>
              ) : null}
            </g>
          );
        })}
        {markers.map((mk) => (
          <g key={mk.label}>
            <line x1={x(mk.k)} x2={x(mk.k)} y1={M.top - 4} y2={H - M.bottom} stroke={mk.color} strokeDasharray={mk.dash} strokeWidth={1} />
            <text x={x(mk.k) + 3} y={M.top - 22 + mk.row * 10} fill={mk.color} fontSize={9.5} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}>
              {mk.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <span className="legend-swatch" style={{ background: "var(--call)" }} />
          call GEX (signed, per 1 pt)
        </span>
        <span>
          <span className="legend-swatch" style={{ background: "var(--put)" }} />
          put GEX (signed, per 1 pt)
        </span>
        <span>
          <span className="legend-swatch" style={{ border: "1px solid var(--replay)" }} />
          0DTE unsigned |Γ|·OI (concentration, no sign assumption)
        </span>
      </div>
    </div>
  );
});
