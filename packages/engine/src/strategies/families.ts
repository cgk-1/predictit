/**
 * Baseline definitions for each setup family. Each is a precise, simple rule so it can be evaluated in replay
 * before any added complexity. All inputs come from EngineContext (as-of safe). Nothing here claims an edge;
 * the validation field is "unvalidated" until the harness says otherwise.
 */
import type { EngineContext } from "../decisions/context";
import type { Evidence } from "../types";
import { levelInteraction, DEFAULT_LEVEL_OPTS } from "../features/levels";
import type { SetupCandidate, StrategyMeta, StrategyOutput, WaitReason } from "./types";

const ev = (ctx: EngineContext, label: string, value: string, at?: number): Evidence => ({
  label,
  value,
  at: at ?? ctx.asOf,
  source: ctx.quote?.stamp.source ?? "replay",
  mode: ctx.quote?.stamp.mode ?? "REPLAY",
});

export const STRATEGY_META: Record<string, StrategyMeta> = {
  "trend-pullback": {
    family: "trend-pullback",
    name: "Trend continuation after pullback",
    phases: ["morning", "midday", "afternoon", "final-hour"],
    validation: "unvalidated",
    hypothesis: "In an efficient 60-minute trend, a shallow pullback that resumes continues for 30-45 minutes more often than it reverses.",
    dataRequirements: ["SPX 1m bars (≥61 completed)", "ATR"],
  },
  orb: {
    family: "orb",
    name: "Opening-range breakout / failure",
    phases: ["morning"],
    validation: "unvalidated",
    hypothesis: "A close beyond the 30-minute opening range continues; a quick return inside the range after a break reverses.",
    dataRequirements: ["SPX 1m bars through 10:00"],
  },
  "range-rejection": {
    family: "range-rejection",
    name: "Range rejection / mean reversion",
    phases: ["morning", "midday", "afternoon"],
    validation: "unvalidated",
    hypothesis: "In a low-efficiency session, a rejection at the session extreme reverts toward the session mean.",
    dataRequirements: ["SPX 1m bars", "session high/low", "TWAP"],
  },
  "compression-expansion": {
    family: "compression-expansion",
    name: "Compression → expansion",
    phases: ["morning", "midday", "afternoon", "final-hour"],
    validation: "unvalidated",
    hypothesis: "A 15-minute range well below the session's typical range precedes an expansion in the direction of the first close outside the box.",
    dataRequirements: ["SPX 1m bars (≥30)"],
  },
  "level-reclaim-reject": {
    family: "level-reclaim-reject",
    name: "Key-level reclaim / rejection",
    phases: ["opening", "morning", "midday", "afternoon", "final-hour"],
    validation: "unvalidated",
    hypothesis: "Reclaims of prior-day/opening-range/VWAP/GEX levels that hold ≥90 s continue; rejections from below reverse.",
    dataRequirements: ["SPX price path", "prior-day levels", "GEX levels (prior-close OI)"],
  },
  "momentum-participation": {
    family: "momentum-participation",
    name: "Momentum confirmed by participation",
    phases: ["morning", "midday", "afternoon"],
    validation: "unvalidated",
    hypothesis: "15-minute SPX momentum confirmed by SPY (same sign, elevated volume) persists for 20-30 minutes.",
    dataRequirements: ["SPX bars", "SPY bars with volume (breadth unavailable → proxy only)"],
  },
  "afternoon-continuation-reversal": {
    family: "afternoon-continuation-reversal",
    name: "Afternoon continuation / reversal",
    phases: ["afternoon", "final-hour"],
    validation: "unvalidated",
    hypothesis: "The rest-of-day return continues into the last hour when dealer gamma is negative (Baltussen et al. 2021); under positive gamma there is no documented predictability, so the family waits.",
    dataRequirements: ["SPX bars", "GEX regime"],
  },
  "eod-auction": {
    family: "eod-auction",
    name: "End-of-day / closing-auction drift",
    phases: ["final-hour"],
    validation: "unvalidated",
    hypothesis: "The 15:00-15:40 move continues into 15:55 when no imbalance data contradicts it (imbalance feed not connected).",
    dataRequirements: ["SPX bars", "closing imbalance feed (not available)"],
  },
  "strike-flip": {
    family: "strike-flip",
    name: "Near-expiration strike flip",
    phases: ["final-ten"],
    validation: "unvalidated",
    hypothesis: "In the last ten minutes, a strike that is broken and held, or reclaimed with acceleration, resolves in that direction into settlement more often than the option price implies.",
    dataRequirements: ["SPX ticks ≤5 s", "0DTE SPXW quotes with size", "ES/SPY confirmation"],
  },
};

function base(ctx: EngineContext, family: SetupCandidate["family"], direction: SetupCandidate["direction"], anchor: string): Pick<SetupCandidate, "id" | "family" | "name" | "direction" | "validation" | "dataNotes"> {
  const meta = STRATEGY_META[family]!;
  return { id: `${ctx.today}:${family}:${direction}:${anchor}`, family, name: meta.name, direction, validation: meta.validation, dataNotes: [] };
}

function minutes(n: number): number {
  return n * 60_000;
}

export function evaluateStrategies(ctx: EngineContext): StrategyOutput {
  const out: StrategyOutput = { candidates: [], waits: [] };
  const b = ctx.bars;
  const phase = ctx.clock.phase;
  const last = b?.last ?? ctx.quote?.last ?? null;
  if (!b || last === null || !ctx.clock.isRegularSession) {
    out.waits.push({ family: "trend-pullback", reason: ctx.clock.isRegularSession ? `No ${ctx.instrument} bar data.` : "Outside the regular session." });
    return out;
  }
  const atr = b.atr14 ?? 2;
  const wait = (family: WaitReason["family"], reason: string) => out.waits.push({ family, reason });

  // 1. Trend pullback — multi-timeframe definition when 30-minute bars exist (30m trend, 5m pullback, 1m resumption);
  //    falls back to the 60-minute efficiency definition otherwise.
  if (STRATEGY_META["trend-pullback"]!.phases.includes(phase)) {
    const f30 = ctx.mtf?.frames.find((f) => f.tf === 30);
    const f5 = ctx.mtf?.frames.find((f) => f.tf === 5);
    const f1 = ctx.mtf?.frames.find((f) => f.tf === 1);
    const mtfOk = f30 && f30.trend !== "n/a" && f5 && f1;
    const upMtf = mtfOk ? (f30!.trend === "up" ? true : f30!.trend === "down" ? false : null) : null;
    if (mtfOk && upMtf === null) wait("trend-pullback", `30-minute trend flat (${f30!.text}).`);
    else if (!mtfOk && (b.er60 === null || b.ret60 === null)) wait("trend-pullback", "Needs 61 completed bars (or 30-minute history).");
    else if (!mtfOk && (b.er60! < 0.3 || Math.abs(b.ret60!) < 0.002)) wait("trend-pullback", `No efficient trend (ER60 ${b.er60!.toFixed(2)}, 60m ${(b.ret60! * 100).toFixed(2)}%).`);
    else {
      const up = mtfOk ? upMtf! : b.ret60! > 0;
      const r5 = mtfOk ? (f5!.lastBarRetPct ?? 0) / 100 : b.ret5 ?? 0;
      const pulledBack = up ? r5 < -0.0005 : r5 > 0.0005; // counter-trend last 5 minutes
      const resumed = up ? (b.ret1 ?? 0) > 0 : (b.ret1 ?? 0) < 0;
      const lifecycle = pulledBack && !resumed ? "armed" : pulledBack && resumed ? "triggered" : "forming";
      const inval = up ? last - 2.5 * atr : last + 2.5 * atr;
      out.candidates.push({
        ...base(ctx, "trend-pullback", up ? "call" : "put", up ? "up" : "down"),
        lifecycle,
        evidence: mtfOk
          ? [ev(ctx, "30m trend", f30!.text), ev(ctx, "5m last bar", `${(r5 * 100).toFixed(2)}%`), ev(ctx, "1m", `${((b.ret1 ?? 0) * 100).toFixed(2)}%`), ev(ctx, "ATR14 (1m)", atr.toFixed(2))]
          : [ev(ctx, "60m efficiency", b.er60!.toFixed(2)), ev(ctx, "60m return", `${(b.ret60! * 100).toFixed(2)}%`), ev(ctx, "5m return", `${(r5 * 100).toFixed(2)}%`), ev(ctx, "ATR14", atr.toFixed(2))],
        triggerCondition: mtfOk ? `30-minute EMA trend ${up ? "up" : "down"}; a counter-trend 5-minute bar; then a 1-minute close back in the trend direction.` : `After a ≥0.05% counter-trend pullback over 5 min, a 1-minute close back in the trend direction.`,
        entryZone: up ? { low: last - atr, high: last + 0.5 * atr } : { low: last - 0.5 * atr, high: last + atr },
        invalidationLevel: inval,
        invalidationText: `1-minute close ${up ? "below" : "above"} ${inval.toFixed(1)} (2.5× ATR against).`,
        targetLevel: up ? (b.sessHigh ?? last) : (b.sessLow ?? last),
        horizonMinutes: 40,
        exitRules: ["Time stop at 40 minutes", "Exit on invalidation close", "Scale out at session extreme / +1.5× ATR×3"],
        preferredExpiry: ctx.clock.minutesToClose > 90 ? "0DTE" : "1-3DTE",
        counterargument: mtfOk ? `A 5-minute pullback can be the start of a 30-minute reversal; RSI on 30m is ${f30!.rsi14?.toFixed(0) ?? "n/a"} and structure ${f30!.structure}.` : `Trend may already be exhausted: 60m move is ${(Math.abs(b.ret60 ?? 0) * 100).toFixed(2)}% and the last 5m is counter-trend; a failed resumption prints a lower high/higher low.`,
        expiresAt: ctx.asOf + minutes(5),
        priority: 2,
      });
    }
  }

  // 2. Opening range breakout / failure (after OR30 complete, until 11:30)
  if (phase === "morning" && b.or30?.complete) {
    const { high, low } = b.or30;
    const w = high - low;
    const orH = levelInteraction(ctx.path, high, ctx.asOf, { ...DEFAULT_LEVEL_OPTS, lookbackMs: 20 * 60_000 });
    const orL = levelInteraction(ctx.path, low, ctx.asOf, { ...DEFAULT_LEVEL_OPTS, lookbackMs: 20 * 60_000 });
    const mk = (dir: "call" | "put", kind: "breakout" | "failure", lvl: number, li: typeof orH) =>
      out.candidates.push({
        ...base(ctx, "orb", dir, `${kind}-${lvl.toFixed(0)}`),
        lifecycle: li.pattern === "break-hold" || li.pattern === "failed-break" ? "triggered" : li.pattern === "approaching" ? "armed" : "forming",
        evidence: [ev(ctx, "OR30", `${low.toFixed(1)}–${high.toFixed(1)} (${w.toFixed(1)} pts)`), ev(ctx, `Level ${lvl.toFixed(0)}`, li.patternText)],
        triggerCondition: kind === "breakout" ? `1-minute close ${dir === "call" ? "above" : "below"} ${lvl.toFixed(1)} that holds ≥90 s.` : `Break of ${lvl.toFixed(1)} that returns inside the range within 90 s.`,
        entryZone: kind === "breakout" ? (dir === "call" ? { low: lvl, high: lvl + 0.5 * w } : { low: lvl - 0.5 * w, high: lvl }) : dir === "call" ? { low: lvl, high: lvl + 0.3 * w } : { low: lvl - 0.3 * w, high: lvl },
        invalidationLevel: kind === "breakout" ? (dir === "call" ? lvl - 0.25 * w : lvl + 0.25 * w) : dir === "call" ? lvl - 0.25 * w : lvl + 0.25 * w,
        invalidationText: kind === "breakout" ? `Close back inside the range beyond ${(dir === "call" ? lvl - 0.25 * w : lvl + 0.25 * w).toFixed(1)}.` : `Close beyond the failed level by 25% of the range.`,
        targetLevel: kind === "breakout" ? (dir === "call" ? lvl + w : lvl - w) : dir === "call" ? high : low,
        horizonMinutes: 45,
        exitRules: ["Time stop 45 min", "Measured move = range width", "Invalidation close"],
        preferredExpiry: "0DTE",
        counterargument: kind === "breakout" ? "Opening-range breaks fail often when the range is narrow relative to ATR; this range is " + (w / (atr * 5) < 1 ? "narrow" : "wide") + "." : "A failed break can simply be a retest before continuation.",
        expiresAt: ctx.asOf + minutes(5),
        priority: 2,
      });
    if (orH.pattern === "break-hold") mk("call", "breakout", high, orH);
    else if (orH.pattern === "failed-break") mk("put", "failure", high, orH);
    else if (orH.pattern === "approaching" && last > high) mk("call", "breakout", high, orH);
    if (orL.pattern === "break-hold") mk("put", "breakout", low, orL);
    else if (orL.pattern === "failed-break") mk("call", "failure", low, orL);
    else if (orL.pattern === "approaching" && last < low) mk("put", "breakout", low, orL);
    if (orH.pattern === "none" && orL.pattern === "none") wait("orb", `Price inside/away from the opening range (${low.toFixed(1)}–${high.toFixed(1)}).`);
  } else if (phase === "morning") wait("orb", "Opening range (30m) not complete yet.");

  // 3. Range rejection (range regime, at extremes)
  if (STRATEGY_META["range-rejection"]!.phases.includes(phase)) {
    if (ctx.regime.trend !== "range") wait("range-rejection", `Regime is ${ctx.regime.trend}, not range.`);
    else if (b.sessHigh === null || b.sessLow === null || b.twap === null) wait("range-rejection", "Session extremes unavailable.");
    else {
      const range = b.sessHigh - b.sessLow;
      const nearHigh = b.sessHigh - last <= 0.15 * range;
      const nearLow = last - b.sessLow <= 0.15 * range;
      if (range < 3 * atr) wait("range-rejection", "Session range too small relative to ATR.");
      else if (!nearHigh && !nearLow) wait("range-rejection", `Price mid-range (${last.toFixed(1)} in ${b.sessLow.toFixed(1)}–${b.sessHigh.toFixed(1)}).`);
      else {
        const dir = nearHigh ? "put" : "call";
        const lvl = nearHigh ? b.sessHigh : b.sessLow;
        const li = levelInteraction(ctx.path, lvl, ctx.asOf);
        const rejected = li.pattern === "rejection" || li.pattern === "failed-break";
        out.candidates.push({
          ...base(ctx, "range-rejection", dir, nearHigh ? "high" : "low"),
          lifecycle: rejected ? "triggered" : "armed",
          evidence: [ev(ctx, "Regime", "range (ER60 " + (b.er60 ?? 0).toFixed(2) + ")"), ev(ctx, "Session range", `${b.sessLow.toFixed(1)}–${b.sessHigh.toFixed(1)}`), ev(ctx, `Level ${lvl.toFixed(1)}`, li.patternText)],
          triggerCondition: `Rejection (touch without hold) at the session ${nearHigh ? "high" : "low"} ${lvl.toFixed(1)}.`,
          entryZone: nearHigh ? { low: lvl - 0.1 * range, high: lvl } : { low: lvl, high: lvl + 0.1 * range },
          invalidationLevel: nearHigh ? lvl + 0.1 * range : lvl - 0.1 * range,
          invalidationText: `Close beyond the extreme by 10% of the session range.`,
          targetLevel: b.twap,
          horizonMinutes: 30,
          exitRules: ["Target TWAP/mid-range", "Time stop 30 min", "Invalidation close"],
          preferredExpiry: "0DTE",
          counterargument: "Range extremes break eventually; a rejection can precede a breakout if volume/participation expands (not observable for SPX).",
          expiresAt: ctx.asOf + minutes(5),
          priority: 3,
        });
      }
    }
  }

  // 4. Compression → expansion
  if (STRATEGY_META["compression-expansion"]!.phases.includes(phase)) {
    if (b.compression15 === null) wait("compression-expansion", "Needs ≥30 completed bars.");
    else if (b.compression15 > 0.55) wait("compression-expansion", `No compression (15m range ratio ${b.compression15.toFixed(2)}).`);
    else {
      const sess = ctx.rawBars.filter((x) => x.t + 60_000 <= ctx.asOf).slice(-15);
      const boxH = Math.max(...sess.map((x) => x.h));
      const boxL = Math.min(...sess.map((x) => x.l));
      const brokeUp = last > boxH;
      const brokeDn = last < boxL;
      const dir: "call" | "put" | null = brokeUp ? "call" : brokeDn ? "put" : null;
      const dirs: Array<"call" | "put"> = dir ? [dir] : ["call", "put"];
      for (const d of dirs) {
        out.candidates.push({
          ...base(ctx, "compression-expansion", d, "box"),
          lifecycle: dir ? "triggered" : "armed",
          evidence: [ev(ctx, "15m compression", `${b.compression15.toFixed(2)}× median`), ev(ctx, "Box", `${boxL.toFixed(1)}–${boxH.toFixed(1)}`)],
          triggerCondition: `1-minute close ${d === "call" ? "above" : "below"} the compression box (${d === "call" ? boxH.toFixed(1) : boxL.toFixed(1)}).`,
          entryZone: d === "call" ? { low: boxH, high: boxH + (boxH - boxL) } : { low: boxL - (boxH - boxL), high: boxL },
          invalidationLevel: d === "call" ? boxL : boxH,
          invalidationText: "Close back through the opposite side of the box.",
          targetLevel: d === "call" ? boxH + 2 * (boxH - boxL) : boxL - 2 * (boxH - boxL),
          horizonMinutes: 30,
          exitRules: ["2× box height target", "Time stop 30 min", "Invalidation"],
          preferredExpiry: "0DTE",
          counterargument: "Compression late in the session or near a GEX wall often resolves as noise; expansions in positive-gamma regimes are smaller.",
          expiresAt: ctx.asOf + minutes(5),
          priority: dir ? 2 : 4,
        });
      }
    }
  }

  // 5. Level reclaim / rejection on key levels within 0.4% of price
  if (STRATEGY_META["level-reclaim-reject"]!.phases.includes(phase)) {
    const near = ctx.levels.filter((l) => l.kind !== "round" && Math.abs(l.level / last - 1) <= 0.004);
    if (!near.length) wait("level-reclaim-reject", "No key level within 0.4% of price.");
    for (const l of near.slice(0, 4)) {
      const li = levelInteraction(ctx.path, l.level, ctx.asOf);
      let dir: "call" | "put" | null = null;
      let lifecycle: SetupCandidate["lifecycle"] = "forming";
      if (li.pattern === "reclaim" || li.pattern === "break-hold") {
        dir = li.side === "above" ? "call" : "put";
        lifecycle = "triggered";
      } else if (li.pattern === "rejection") {
        dir = li.side === "above" ? "call" : "put"; // rejected from the other side -> continue on current side
        lifecycle = "triggered";
      } else if (li.pattern === "failed-break") {
        dir = li.side === "above" ? "call" : "put";
        lifecycle = "triggered";
      } else if (li.pattern === "approaching") {
        dir = li.side === "above" ? "call" : "put";
        lifecycle = "armed";
      } else if (li.pattern === "pinning") {
        wait("level-reclaim-reject", `${l.label} ${l.level.toFixed(1)}: pinning (${li.crossings} crossings) — no directional edge.`);
      }
      if (!dir) continue;
      out.candidates.push({
        ...base(ctx, "level-reclaim-reject", dir, l.kind === "twap" || l.kind === "vwap" ? l.kind : `${l.kind}-${l.level.toFixed(0)}`),
        lifecycle,
        evidence: [ev(ctx, l.label, l.level.toFixed(1) + " (" + l.source + ")"), ev(ctx, "Interaction", li.patternText)],
        triggerCondition: `${li.pattern} at ${l.label} holding ≥90 s on the ${li.side} side.`,
        entryZone: dir === "call" ? { low: l.level, high: l.level + 1.5 * atr } : { low: l.level - 1.5 * atr, high: l.level },
        invalidationLevel: dir === "call" ? l.level - 1.5 * atr : l.level + 1.5 * atr,
        invalidationText: `Close back ${dir === "call" ? "below" : "above"} ${l.label} by 1.5× ATR.`,
        targetLevel: null,
        horizonMinutes: 35,
        exitRules: ["Next key level", "Time stop 35 min", "Invalidation close"],
        preferredExpiry: ctx.clock.minutesToClose > 75 ? "0DTE" : "1-3DTE",
        counterargument: l.kind.startsWith("gex") || l.kind.endsWith("wall") ? "GEX levels are built from prior-close OI; today's positioning may differ, and the level can be stale." : "Level interactions on a 1-minute path are noisy; a reclaim can be a stop-run.",
        expiresAt: ctx.asOf + minutes(5),
        priority: lifecycle === "triggered" ? 2 : 4,
      });
    }
  }

  // 6. Momentum + participation (NYSE TICK when live; SPY agreement as a weak proxy otherwise)
  if (STRATEGY_META["momentum-participation"]!.phases.includes(phase)) {
    const s = ctx.companion.bars;
    const tk = ctx.tick;
    const tickLive = tk.label !== "n/a" && tk.avg10 !== null;
    if (b.ret15 === null || (!tickLive && (!s || s.ret15 === null))) wait("momentum-participation", `Needs NYSE TICK (Schwab live) or ${ctx.companion.instrument} bars.`);
    else if (Math.abs(b.ret15) < 0.002) wait("momentum-participation", `15m SPX move ${(b.ret15 * 100).toFixed(2)}% below 0.20% threshold.`);
    else if (tickLive && ((b.ret15 > 0 && tk.label !== "broad-up") || (b.ret15 < 0 && tk.label !== "broad-down"))) wait("momentum-participation", `TICK does not show broad participation (${tk.label}, 10-min avg ${tk.avg10!.toFixed(0)}).`);
    else if (!tickLive && s && s.ret15 !== null && Math.sign(s.ret15) !== Math.sign(b.ret15)) wait("momentum-participation", `${ctx.companion.instrument} does not agree in sign (no TICK).`);
    else {
      const dir = b.ret15 > 0 ? "call" : "put";
      out.candidates.push({
        ...base(ctx, "momentum-participation", dir, "15m"),
        lifecycle: "triggered",
        evidence: tickLive ? [ev(ctx, `${ctx.instrument} 15m`, `${(b.ret15 * 100).toFixed(2)}%`), ev(ctx, "NYSE TICK", tk.text)] : [ev(ctx, `${ctx.instrument} 15m`, `${(b.ret15 * 100).toFixed(2)}%`), ev(ctx, `${ctx.companion.instrument} 15m`, `${((s?.ret15 ?? 0) * 100).toFixed(2)}%`)],
        triggerCondition: tickLive ? `15m ${ctx.instrument} move ≥0.20% with broad NYSE TICK participation in the same direction.` : `15m ${ctx.instrument} move ≥0.20% with ${ctx.companion.instrument} same sign (weak proxy; TICK unavailable).`,
        entryZone: dir === "call" ? { low: last - atr, high: last + atr } : { low: last - atr, high: last + atr },
        invalidationLevel: dir === "call" ? last - 2 * atr : last + 2 * atr,
        invalidationText: "Give-back of 2× ATR from entry.",
        targetLevel: null,
        horizonMinutes: 25,
        exitRules: ["Time stop 25 min", "Trail by 1.5× ATR after +2× ATR"],
        preferredExpiry: "0DTE",
        counterargument: tickLive ? "Short-horizon momentum mean-reverts often; TICK extremes above +1000 / below −1000 can mark exhaustion rather than continuation." : "Short-horizon momentum in index futures mean-reverts at 15-30 minute horizons in many samples; without breadth this is a weak proxy.",
        dataNotes: tickLive ? [] : [{ level: "warn", message: `NYSE TICK unavailable; ${ctx.companion.instrument} sign agreement used as proxy.` }],
        expiresAt: ctx.asOf + minutes(5),
        priority: 3,
      });
    }
  }

  // 7. Afternoon continuation / reversal conditioned on gamma
  if (STRATEGY_META["afternoon-continuation-reversal"]!.phases.includes(phase) && ctx.clock.minutesToClose > 12) {
    const open = b.sessOpen;
    if (open === null || ctx.regime.gamma === "unknown") wait("afternoon-continuation-reversal", "Needs session open and a GEX regime.");
    else {
      const anchor = ctx.calendar?.prior?.close ?? open; // rest-of-day return from the prior close when known (Baltussen)
      const dayRet = last / anchor - 1;
      if (ctx.regime.gamma !== "negative") wait("afternoon-continuation-reversal", `Gamma ${ctx.regime.gamma}: continuation evidence exists only under negative dealer gamma.`);
      else if (Math.abs(dayRet) < 0.003) wait("afternoon-continuation-reversal", `Rest-of-day move ${(dayRet * 100).toFixed(2)}% too small (<0.30%).`);
      else {
        const continuation = true;
        const dir = dayRet > 0 ? "call" : "put";
        out.candidates.push({
          ...base(ctx, "afternoon-continuation-reversal", dir, continuation ? "cont" : "rev"),
          lifecycle: ctx.clock.phase === "final-hour" ? "triggered" : "armed",
          evidence: [ev(ctx, "Day move (open→now)", `${(dayRet * 100).toFixed(2)}%`), ev(ctx, "Gamma regime", ctx.regime.gamma)],
          triggerCondition: continuation ? "Negative-gamma session: continue the rest-of-day direction (prior close → now) from 15:00." : "",
          entryZone: { low: last - atr, high: last + atr },
          invalidationLevel: dir === "call" ? last - 2.5 * atr : last + 2.5 * atr,
          invalidationText: "2.5× ATR against entry.",
          targetLevel: null,
          horizonMinutes: Math.min(45, Math.max(10, ctx.clock.minutesToClose - 12)),
          exitRules: ["Exit by 15:48 at the latest", "Invalidation close"],
          preferredExpiry: "0DTE",
          counterargument: "The intraday-momentum effect is small per day and regime labels are from prior-close OI; this is a weak, slow signal.",
          expiresAt: ctx.asOf + minutes(10),
          priority: 4,
        });
      }
    }
  }

  // 8. EOD drift (data-limited: no imbalance feed)
  if (phase === "final-hour" && ctx.clock.minutesToClose <= 25 && ctx.clock.minutesToClose > 12) {
    const r30 = b.ret30;
    if (r30 === null || Math.abs(r30) < 0.0015) wait("eod-auction", "No ≥0.15% move over the last 30 min.");
    else {
      const dir = r30 > 0 ? "call" : "put";
      out.candidates.push({
        ...base(ctx, "eod-auction", dir, "drift"),
        lifecycle: "armed",
        evidence: [ev(ctx, "30m return", `${(r30 * 100).toFixed(2)}%`)],
        triggerCondition: "Continuation of the 30-minute move into 15:55 (closing imbalance feed not connected).",
        entryZone: { low: last - atr, high: last + atr },
        invalidationLevel: dir === "call" ? last - 2 * atr : last + 2 * atr,
        invalidationText: "2× ATR against.",
        targetLevel: null,
        horizonMinutes: Math.max(5, ctx.clock.minutesToClose - 5),
        exitRules: ["Exit by 15:55", "Invalidation"],
        preferredExpiry: "0DTE",
        counterargument: "Without imbalance data this is pure momentum; closing flows can reverse the drift abruptly.",
        dataNotes: [{ level: "warn", message: "Closing-auction imbalance data is not available from connected feeds." }],
        expiresAt: ctx.asOf + minutes(5),
        priority: 5,
      });
    }
  }

  out.candidates.sort((a, b2) => lifecycleRank(a.lifecycle) - lifecycleRank(b2.lifecycle) || a.priority - b2.priority);
  return out;
}

export function lifecycleRank(l: SetupCandidate["lifecycle"]): number {
  return l === "triggered" ? 0 : l === "armed" ? 1 : l === "forming" ? 2 : 3;
}
