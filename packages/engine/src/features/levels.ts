/**
 * Price/level interaction history from a tick (or bar-close) path. Used by key-level strategies and the
 * closing-window strike ladder. Pure and as-of safe: pass only points with t <= asOf.
 */
export interface PricePoint { t: number; p: number }

export interface LevelInteraction {
  level: number;
  side: "above" | "below" | "at";
  /** ms since the last crossing of this level (or since the window start if never crossed) */
  dwellMs: number;
  /** crossings inside the lookback window */
  crossings: number;
  lastCross: { t: number; dir: "up" | "down" } | null;
  /** max distance above / below the level inside the window (points) */
  maxAbove: number;
  maxBelow: number;
  /** did price come within `touchTol` of the level without crossing, in the window */
  touches: number;
  /** classification of the latest behaviour at this level */
  pattern: "none" | "break-hold" | "failed-break" | "reclaim" | "rejection" | "pinning" | "approaching";
  patternText: string;
}

export interface LevelOptions {
  lookbackMs: number;
  /** points within which a bar counts as touching */
  touchTol: number;
  /** minimum dwell (ms) on the new side for a crossing to be a "hold" */
  holdMs: number;
  /** crossings count at/above which the level is considered pinning */
  pinCrossings: number;
}

export const DEFAULT_LEVEL_OPTS: LevelOptions = { lookbackMs: 30 * 60_000, touchTol: 1.0, holdMs: 90_000, pinCrossings: 4 };

export function levelInteraction(path: PricePoint[], level: number, asOf: number, opts: LevelOptions = DEFAULT_LEVEL_OPTS): LevelInteraction {
  const pts = path.filter((x) => x.t <= asOf && x.t >= asOf - opts.lookbackMs);
  const empty: LevelInteraction = { level, side: "at", dwellMs: 0, crossings: 0, lastCross: null, maxAbove: 0, maxBelow: 0, touches: 0, pattern: "none", patternText: "No price history in window." };
  if (!pts.length) return empty;
  const sideOf = (p: number): "above" | "below" | "at" => (p > level ? "above" : p < level ? "below" : "at");
  let crossings = 0;
  let lastCross: LevelInteraction["lastCross"] = null;
  let prevSide: "above" | "below" | null = null;
  let maxAbove = 0;
  let maxBelow = 0;
  let touches = 0;
  const crossTimes: Array<{ t: number; dir: "up" | "down" }> = [];
  for (const x of pts) {
    const s = sideOf(x.p);
    maxAbove = Math.max(maxAbove, x.p - level);
    maxBelow = Math.max(maxBelow, level - x.p);
    if (Math.abs(x.p - level) <= opts.touchTol) touches++;
    if (s === "at") continue;
    if (prevSide && s !== prevSide) {
      crossings++;
      lastCross = { t: x.t, dir: s === "above" ? "up" : "down" };
      crossTimes.push(lastCross);
    }
    prevSide = s;
  }
  const last = pts[pts.length - 1]!;
  const side = sideOf(last.p);
  const lvl = Number.isInteger(level) ? String(level) : level.toFixed(1);
  const dwellMs = lastCross ? asOf - lastCross.t : asOf - pts[0]!.t;
  // pattern classification (latest behaviour)
  let pattern: LevelInteraction["pattern"] = "none";
  let text = "";
  const recent = crossTimes.filter((c) => c.t >= asOf - Math.min(opts.lookbackMs, 10 * 60_000));
  if (recent.length >= opts.pinCrossings) {
    pattern = "pinning";
    text = `${recent.length} crossings of ${lvl} in the last ${Math.round(Math.min(opts.lookbackMs, 600000) / 60000)} min — oscillating around the strike.`;
  } else if (lastCross) {
    const held = dwellMs >= opts.holdMs;
    const prior = crossTimes.length >= 2 ? crossTimes[crossTimes.length - 2]! : null;
    if (held) {
      // crossed and stayed: reclaim if there was an earlier opposite cross (i.e. lost then regained), else break-hold
      if (prior && prior.dir !== lastCross.dir) {
        pattern = "reclaim";
        text = `${lastCross.dir === "up" ? "Reclaimed above" : "Lost below"} ${lvl} ${fmtAgo(dwellMs)} ago and held (${fmtAgo(dwellMs)}).`;
      } else {
        pattern = "break-hold";
        text = `Broke ${lastCross.dir === "up" ? "above" : "below"} ${lvl} ${fmtAgo(dwellMs)} ago and held.`;
      }
    } else {
      // crossed very recently: unknown hold yet
      if (prior && prior.dir !== lastCross.dir && lastCross.t - prior.t < opts.holdMs) {
        pattern = "failed-break";
        text = `Crossed ${prior.dir === "up" ? "above" : "below"} ${lvl} then reversed within ${fmtAgo(lastCross.t - prior.t)} — failed break.`;
      } else {
        pattern = "approaching";
        text = `Just crossed ${lastCross.dir === "up" ? "above" : "below"} ${lvl} (${fmtAgo(dwellMs)} ago); hold not yet established.`;
      }
    }
  } else if (touches > 0) {
    pattern = "rejection";
    text = `Touched ${lvl} ${touches} time(s) without crossing; price remains ${side}.`;
  } else {
    pattern = "none";
    text = `Price ${side} ${lvl} for the whole window (no interaction).`;
  }
  return { level, side, dwellMs, crossings, lastCross, maxAbove, maxBelow, touches, pattern, patternText: text };
}

export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60 ? ` ${s % 60}s` : ""}`;
}

/** Strike ladder helper: strikes at `step` spacing covering spot ± n steps. */
export function strikeLadder(spot: number, step: number, n: number): number[] {
  const base = Math.round(spot / step) * step;
  const out: number[] = [];
  for (let i = -n; i <= n; i++) out.push(base + i * step);
  return out;
}
