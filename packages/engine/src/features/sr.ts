/**
 * Support / resistance from the key-level set, scored for strength using only past interactions:
 * touches (approaches within tolerance without a decisive break), confluence (other levels within 0.08%),
 * recency of the last interaction and the level's type. Returns the nearest supports below and resistances
 * above spot. Strength is a transparent heuristic score (0–100), not a probability.
 */
import type { KeyLevel } from "../decisions/context";
import { levelInteraction, type PricePoint } from "./levels";

export interface SRLevel extends KeyLevel {
  role: "support" | "resistance";
  distancePts: number;
  distancePct: number;
  touches: number;
  crossings: number;
  lastInteractionAgoMs: number | null;
  confluence: string[];
  strength: number;
  strengthText: string;
}

const TYPE_PRIOR: Record<KeyLevel["kind"], number> = {
  "prior-high": 18,
  "prior-low": 18,
  "prior-close": 14,
  "or-high": 14,
  "or-low": 14,
  "session-high": 12,
  "session-low": 12,
  vwap: 12,
  twap: 8,
  "gex-flip": 10,
  "call-wall": 12,
  "put-wall": 12,
  "largest-gex": 10,
  round: 6,
  "gap-fill": 14,
  "prior-week-high": 16,
  "prior-week-low": 16,
  "high-oi-strike": 10,
};

export function supportResistance(levels: KeyLevel[], spot: number, path: PricePoint[], asOf: number, maxEach = 4): { support: SRLevel[]; resistance: SRLevel[] } {
  const scored: SRLevel[] = [];
  for (const l of levels) {
    if (!Number.isFinite(l.level) || l.level <= 0) continue;
    const dist = l.level - spot;
    if (Math.abs(dist) / spot > 0.02) continue;
    const li = levelInteraction(path, l.level, asOf, { lookbackMs: 4 * 3600_000, touchTol: Math.max(0.75, spot * 0.0002), holdMs: 90_000, pinCrossings: 6 });
    const confluence = levels.filter((o) => o !== l && Math.abs(o.level / l.level - 1) <= 0.0008).map((o) => o.label);
    let strength = TYPE_PRIOR[l.kind] ?? 8;
    strength += Math.min(30, li.touches * 6);
    strength += Math.min(20, confluence.length * 8);
    if (li.lastCross) strength -= Math.min(15, li.crossings * 4); // levels that get crossed often are weaker
    if (li.lastCross && asOf - li.lastCross.t < 15 * 60_000) strength += 5; // fresh reclaim/break has attention
    strength = Math.max(0, Math.min(100, strength));
    const role: SRLevel["role"] = dist <= 0 ? "support" : "resistance";
    const txt = [`${li.touches} touch${li.touches === 1 ? "" : "es"}`, `${li.crossings} crossing${li.crossings === 1 ? "" : "s"} (4h)`, confluence.length ? `confluence: ${confluence.join(", ")}` : "no confluence"].join("; ");
    scored.push({ ...l, role, distancePts: dist, distancePct: dist / spot, touches: li.touches, crossings: li.crossings, lastInteractionAgoMs: li.lastCross ? asOf - li.lastCross.t : null, confluence, strength, strengthText: txt });
  }
  // merge near-duplicates (within 0.05%) keeping the strongest
  const merged: SRLevel[] = [];
  for (const s of scored.sort((a, b) => b.strength - a.strength)) {
    if (merged.some((m) => Math.abs(m.level / s.level - 1) <= 0.0005)) continue;
    merged.push(s);
  }
  const support = merged.filter((m) => m.role === "support").sort((a, b) => b.level - a.level).slice(0, maxEach);
  const resistance = merged.filter((m) => m.role === "resistance").sort((a, b) => a.level - b.level).slice(0, maxEach);
  return { support, resistance };
}
