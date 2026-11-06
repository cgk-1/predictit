import { memo, useMemo, useRef } from "react";
import { fmtGexUsd } from "@predictit/engine";
import { useWidth } from "../lib/useWidth";
import { fmtPts } from "../lib/format";

const H = 220;
const M = { top: 14, right: 70, bottom: 24, left: 8 };

type Pt = { spot: number; net: number };

export interface GexProfileProps {
  profile: Pt[];
  profile0dte: Pt[];
  spot: number;
  flip: number | null;
  flip0dte: number | null;
}

export const GexProfile = memo(function GexProfile({ profile, profile0dte, spot, flip, flip0dte }: GexProfileProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const width = useWidth(ref, 720);
  const m = useMemo(() => {
    if (profile.length < 2) return null;
    const s0 = profile[0]!.spot;
    const s1 = profile[profile.length - 1]!.spot;
    let maxAbs = 0;
    for (const p of profile) maxAbs = Math.max(maxAbs, Math.abs(p.net));
    for (const p of profile0dte) maxAbs = Math.max(maxAbs, Math.abs(p.net));
    if (maxAbs <= 0) maxAbs = 1;
    const pw = width - M.left - M.right;
    const ph = H - M.top - M.bottom;
    const x = (s: number) => M.left + ((s - s0) / (s1 - s0)) * pw;
    const y = (v: number) => M.top + ((maxAbs - v) / (2 * maxAbs)) * ph;
    const path = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.spot).toFixed(1)},${y(p.net).toFixed(1)}`).join(" ");
    const xTicks: number[] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) xTicks.push(s0 + ((s1 - s0) * i) / n);
    return { x, y, d: path(profile), d0: profile0dte.length > 1 ? path(profile0dte) : null, maxAbs, xTicks };
  }, [profile, profile0dte, width]);

  if (!m) {
    return (
      <div ref={ref} className="chart">
        <p className="muted small">n/a — profile not computed.</p>
      </div>
    );
  }
  const { x, y, d, d0, maxAbs, xTicks } = m;
  return (
    <div ref={ref} className="chart">
      <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label="Net dealer gamma as a function of spot">
        {[-maxAbs, 0, maxAbs].map((v) => (
          <g key={v}>
            <line className="grid" x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--text-3)" : undefined} />
            <text className="axis" x={width - M.right + 6} y={y(v) + 3.5}>
              {fmtGexUsd(v)}
            </text>
          </g>
        ))}
        {xTicks.map((s) => (
          <text key={s} className="axis" x={x(s)} y={H - 7} textAnchor="middle">
            {fmtPts(s, 0)}
          </text>
        ))}
        <path d={d} fill="none" stroke="var(--text)" strokeWidth={1.5} />
        {d0 ? <path d={d0} fill="none" stroke="var(--replay)" strokeWidth={1.2} strokeDasharray="4 3" /> : null}
        <line x1={x(spot)} x2={x(spot)} y1={M.top} y2={H - M.bottom} stroke="var(--text-2)" strokeDasharray="2 3" />
        <text x={x(spot) + 3} y={M.top + 9} className="lbl" fontSize={9.5}>
          spot {fmtPts(spot, 1)}
        </text>
        {flip !== null ? (
          <g>
            <circle cx={x(flip)} cy={y(0)} r={4} fill="var(--replay)" />
            <text x={x(flip) + 6} y={y(0) - 6} fill="var(--replay)" fontSize={9.5} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}>
              zero crossing {fmtPts(flip, 0)}
            </text>
          </g>
        ) : null}
        {flip0dte !== null ? <circle cx={x(flip0dte)} cy={y(0)} r={3} fill="none" stroke="var(--replay)" /> : null}
      </svg>
      <div className="chart-legend">
        <span>
          <span className="legend-swatch" style={{ background: "var(--text)" }} />
          all expiries (profile set: OI &gt; 0, ±6%, ≤45 trading days)
        </span>
        <span>
          <span className="legend-swatch" style={{ border: "1px dashed var(--replay)" }} />
          0DTE only
        </span>
        <span>● nearest zero crossing (zero-gamma estimate)</span>
      </div>
    </div>
  );
});
