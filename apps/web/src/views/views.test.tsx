/**
 * Render smoke test: every view is rendered to a string against a ServerState produced by the real engine from
 * synthetic data, so a runtime null-dereference in any view fails the suite. Effects (fetches) do not run in SSR,
 * so sections fed by secondary endpoints are rendered directly with a GradesResponse fixture.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { RankedContract } from "@predictit/engine";
import { StaticServerProvider, projectState } from "../api/context";
import type { ServerConnection } from "../api/useServerState";
import { gradesFixture, syntheticFixture } from "../test/fixture";
import { TodayView } from "./Today";
import { SetupsView } from "./Setups";
import { GammaView } from "./Gamma";
import { ClosingView } from "./Closing";
import { PositionsView } from "./Positions";
import { ReplayView } from "./Replay";
import { PerformanceView } from "./Performance";
import { Budgets, SettingsView } from "./Settings";
import { LeanView } from "./Lean";
import { DashView } from "./Dash";
import { fmtNum } from "../lib/format";
import { PriceChart } from "../components/PriceChart";
import { GexChart } from "../components/GexChart";
import { GexProfile } from "../components/GexProfile";
import { StrikeLadder } from "../components/StrikeLadder";
import { StatusBar } from "../components/StatusBar";
import { MarketStrip } from "../components/MarketStrip";
import { ChangesFeed, isSystemEvent } from "../components/ChangesFeed";
import { ContractsTable } from "../components/ContractsTable";
import { CandidateCard, gradeChipText } from "../components/CandidateCard";
import { ClosingLearning, LearningBox, SelfGrading } from "../components/Grades";
import { SummaryCard } from "../components/SummaryCard";

function conn(state: ServerConnection["state"], extra: Partial<ServerConnection> = {}): ServerConnection {
  return { state, error: null, consecutiveErrors: 0, lastOkAt: Date.now(), offsetMs: 0, loading: false, refresh: () => {}, ...extra };
}

const VIEWS: Array<[string, () => React.ReactElement]> = [
  ["today", () => <TodayView />],
  ["setups", () => <SetupsView />],
  ["gamma", () => <GammaView />],
  ["closing", () => <ClosingView />],
  ["positions", () => <PositionsView />],
  ["replay", () => <ReplayView />],
  ["performance", () => <PerformanceView />],
  ["settings", () => <SettingsView theme="dark" setTheme={() => {}} />],
  ["lean", () => <LeanView />],
];

function render(el: React.ReactElement, c: ServerConnection, now: number): string {
  return renderToString(<StaticServerProvider conn={c} now={now}>{el}</StaticServerProvider>).replace(/<!-- -->/g, "");
}

function renderAll(c: ServerConnection, now: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, make] of VIEWS) out[name] = render(make(), c, now);
  return out;
}

describe("views render against engine output", () => {
  const mid = syntheticFixture("2026-11-06", 11, 5, { withPosition: true });

  it("mid-session state renders every view", () => {
    const html = renderAll(conn(mid.state), mid.asOf + 4000);
    expect(html.today).toContain(mid.decision.state);
    expect(html.today).toContain("decision v1");
    expect(html.today).toContain("Key levels");
    expect(html.today).toContain("What changed?");
    expect(html.setups).toContain("Ranked contracts");
    expect(html.gamma).toContain("Gamma exposure");
    expect(html.gamma).toContain("OI as of prior close");
    expect(html.closing).toContain("Closing window");
    expect(html.positions).toContain("Open positions");
    expect(html.positions).toContain("fixture");
    expect(html.replay).toContain("Loading recorded dates");
    expect(html.performance).toContain("Loading");
    expect(html.settings).toContain("Schwab");
    expect(html.settings).toContain("copy the FULL URL");
    expect(html.lean).toContain("Market lean");
    for (const v of Object.values(html)) expect(v).not.toContain("undefined");
  });

  it("status bar shows the mode badge, ET clock and feed chips", () => {
    const html = renderToString(<StatusBar conn={conn(mid.state)} now={mid.asOf + 2000} menuOpen={false} onToggleMenu={() => {}} />).replace(/<!-- -->/g, "");
    expect(html).toContain("LIVE");
    expect(html).toContain("11:05:02");
    expect(html).toContain("Schwab");
    expect(html).toContain("Cboe delayed");
  });

  it("charts and the strike ladder render with real engine data", () => {
    const bars = mid.frame.spxBars!.bars.filter((b) => b.t + 60_000 <= mid.asOf);
    expect(renderToString(<PriceChart bars={bars} levels={mid.state.levels} spot={mid.state.spx!.last} />)).toContain("<svg");
    const g = mid.state.gex!;
    expect(renderToString(<GexChart rows={g.byStrike} spot={g.spot} flip={g.flip.level} callWall={g.walls.callWall} putWall={g.walls.putWall} largest0dte={g.walls.largest0dte} />)).toContain("call GEX");
    expect(renderToString(<GexProfile profile={g.flip.profile} profile0dte={g.flip.profile0dte} spot={g.spot} flip={g.flip.level} flip0dte={g.flip.level0dte} />)).toContain("<path");
    const closing = syntheticFixture("2026-11-06", 15, 53);
    expect(closing.state.closing).not.toBeNull();
    const ladder = renderToString(<StrikeLadder ladder={closing.state.closing!.ladder} recommendedStrike={closing.state.closing!.recommendation.strike} recommendedRight={null} />);
    expect(ladder).toContain("P(close above)");
  });

  it("closing-window state renders the ladder, scenarios and countdown", () => {
    const f = syntheticFixture("2026-11-06", 15, 53);
    const html = renderAll(conn(f.state), f.asOf + 1000);
    expect(html.closing).toContain("Nearby strikes");
    expect(html.closing).toContain("Remaining move");
    expect(html.closing).toContain("3:50–3:55");
    expect(html.today).toContain(f.decision.state);
  });

  it("premarket and no-state render without market numbers", () => {
    const pre = syntheticFixture("2026-11-06", 8, 30);
    const html = renderAll(conn(pre.state), pre.asOf);
    expect(html.today).toContain("PASS");
    expect(html.closing).toContain("Preview");
    const none = renderAll(conn(null, { loading: true }), Date.now());
    expect(none.today).toContain("Connecting");
    expect(none.gamma).toContain("Connecting");
  });

  it("an expired decision shows the expiry message", () => {
    const html = renderAll(conn(mid.state), mid.decision.expiresAt + 5000);
    expect(html.today).toContain("EXPIRED — awaiting refresh");
  });
});

describe("Today hierarchy", () => {
  const mid = syntheticFixture("2026-11-06", 11, 5, { withPosition: true });
  const html = render(<TodayView />, conn(mid.state), mid.asOf + 4000);

  it("has one hero with the summary, then collapsed record and open market detail", () => {
    expect(html.match(/class="panel decision decision-[a-z]+ hero"/g)?.length).toBe(1);
    const record = /<details class="disclosure"([^>]*)data-section="decision-record"/.exec(html);
    expect(record).not.toBeNull();
    expect(record![1]).not.toContain("open");
    const detail = /<details class="disclosure"([^>]*)data-section="market-detail"/.exec(html);
    expect(detail).not.toBeNull();
    expect(detail![1]).toContain("open");
    expect(html).toContain("Decision record");
    expect(html).toContain("Market detail");
    expect(html).toContain("SPX, 1-minute");
    expect(html).toContain("Regime");
  });

  it("the hero carries the clean answer: headline, expected move, ladders, why/risks, gap and calendar facts, weights mode", () => {
    const s = mid.decision.summary;
    expect(html).toContain(s.action);
    expect(html).toContain("Expected move to close");
    expect(html).toContain("Resistance above");
    expect(html).toContain("Support below");
    expect(html).toContain("Why");
    expect(html).toContain("Key risks");
    expect(html).toContain("Gap</b>");
    expect(html).toContain("Week to date</b>");
    expect(html).toContain("Prior close loc</b>");
    expect(html).toContain(mid.decision.lean.weightsMode === "learned" ? "learned weights" : "prior weights (burn-in)");
    if (s.expectedMove.straddleAbsMoveToClose !== null) expect(html).toContain("Straddle-implied |move| to close");
  });

  it("the hero checks the contract against the per-contract budget", () => {
    const f = syntheticFixture("2026-11-06", 15, 53);
    const s = f.decision.summary;
    const hero = render(<SummaryCard summary={s} lean={f.decision.lean} now={f.asOf} budgetUsd={200} />, conn(f.state), f.asOf);
    if (s.contract) {
      expect(hero).toContain(s.contract.riskUsd <= 200 ? "within $200 budget" : "over $200 budget");
      expect(hero).toContain(`Contract (${s.contract.instrument})`);
    } else {
      expect(hero).not.toContain("within $200 budget");
      expect(hero).not.toContain("over $200 budget");
    }
    const over = render(<SummaryCard summary={{ ...s, contract: { instrument: "SPY", osi: "SPY   261106C00600000", label: "SPY 2026-11-06 600C", bid: 2.9, ask: 3.1, riskUsd: 310, breakeven: 603.1, entryCondition: "test" } }} lean={f.decision.lean} now={f.asOf} budgetUsd={200} />, conn(f.state), f.asOf);
    expect(over).toContain("over $200 budget");
    expect(over).toContain("Contract (SPY)");
  });
});

describe("market strip", () => {
  it("shows SPX with change, SPY, VIX, expected move and the TICK placeholder without a live TICK feed", () => {
    const mid = syntheticFixture("2026-11-06", 11, 5);
    const html = renderToString(<MarketStrip state={mid.state} />).replace(/<!-- -->/g, "");
    expect(html).toContain(mid.state.spx!.last.toFixed(2));
    expect(html).toContain("needs Schwab live");
    expect(html).toContain("VIX");
    expect(html).toContain("Expected move to close");
    expect(html).toMatch(/\d+ min/);
    expect(html).not.toContain("undefined");
  });

  it("renders TICK last, 10-minute average and label from engine features when the TICK feed is live", () => {
    const live = syntheticFixture("2026-11-06", 11, 5, { withTick: true });
    expect(live.state.tickFeatures.label).not.toBe("n/a");
    const html = renderToString(<MarketStrip state={live.state} />).replace(/<!-- -->/g, "");
    expect(html).toContain("+412");
    expect(html).toContain("10m +");
    expect(html).toContain(live.state.tickFeatures.label.replace(/-/g, " "));
    expect(html).toContain("14.62");
    // the three TICK indicators vote through the ensemble
    const votes = live.decision.lean.votes.filter((v) => v.id.startsWith("tick"));
    expect(votes.length).toBe(3);
    expect(votes.every((v) => v.vote !== null)).toBe(true);
    const lean = render(<LeanView />, conn(live.state), live.asOf);
    expect(lean).toContain("TICK 10-min average");
    expect(lean).toContain("TICK vs price divergence");
    expect(lean).toContain("prior weights (burn-in)");
  });

  it("marks unavailable indicator rows as quiet in the Lean view", () => {
    const mid = syntheticFixture("2026-11-06", 11, 5);
    const lean = render(<LeanView />, conn(mid.state), mid.asOf);
    expect(lean).toContain('class="row-quiet"');
    expect(lean).toContain("unavailable");
    expect(lean).not.toContain("row-bad");
  });
});

describe("change feed", () => {
  const base = syntheticFixture("2026-11-06", 11, 5).asOf;
  const changes = Array.from({ length: 14 }, (_, i) => ({ at: base - i * 60_000, kind: "level" as const, text: `${10 + i}:00 SPX crossed level ${i}.` }));
  const system = [
    { at: base - 30_000, kind: "data" as const, text: "11:04 Tick error: fetch failed" },
    { at: base - 20_000, kind: "data" as const, text: "11:04 Grading sweep failed: boom" },
  ];

  it("shows the newest 10 with a show-all toggle and hides system events by default", () => {
    const html = renderToString(<ChangesFeed changes={[...changes, ...system]} />).replace(/<!-- -->/g, "");
    expect(html.match(/class="feed-row/g)?.length).toBe(10);
    expect(html).toContain("Show all 14");
    expect(html).toContain("Show system events");
    expect(html).toContain("2 system");
    expect(html).not.toContain("Tick error");
    expect(html).not.toContain("Grading sweep failed");
    expect(html).toContain("4 older events hidden");
    expect(isSystemEvent(system[0]!)).toBe(true);
    expect(isSystemEvent(changes[0]!)).toBe(false);
  });

  it("omits the toggles when there is nothing to toggle", () => {
    const html = renderToString(<ChangesFeed changes={changes.slice(0, 3)} />);
    expect(html).not.toContain("Show all");
    expect(html).not.toContain("system events");
  });
});

describe("setups: budget and grades", () => {
  const mid = syntheticFixture("2026-11-06", 11, 5);
  const grades = gradesFixture();

  it("the contracts table shows instrument and budget columns and dims over-budget rows", () => {
    const c: RankedContract = {
      instrument: "SPX",
      withinBudget: true,
      osi: "SPXW  261106C06000000",
      root: "SPXW",
      expiry: "2026-11-06",
      right: "C",
      strike: 6000,
      is0dte: true,
      bid: 1.8,
      ask: 1.9,
      spread: 0.1,
      spreadPct: 0.05,
      bidSize: 10,
      askSize: 10,
      quoteAgeMs: 900,
      entry: 1.9,
      riskUsd: 190,
      iv: 0.15,
      delta: 0.45,
      gamma: 0.01,
      thetaPerMin: -0.01,
      breakevenAtExpiry: 6002,
      atTarget: null,
      atFlat: { exit: 1.4, ret: -0.26 },
      atInvalidation: { exit: 0.5, ret: -0.74 },
      rewardRisk: null,
      breakevenWinRate: null,
      eligible: true,
      reasons: [],
      tradeoff: "near-ATM",
    };
    const over: RankedContract = { ...c, osi: "SPY   261106C00600000", root: "SPY", instrument: "SPY", withinBudget: false, eligible: false, ask: 3.1, entry: 3.1, riskUsd: 310, reasons: ["premium $310 > budget"] };
    const html = renderToString(<ContractsTable contracts={[c, over]} asOf={mid.asOf} budgetUsd={200} />).replace(/<!-- -->/g, "");
    expect(html).toContain("Inst.");
    expect(html).toContain("Budget");
    expect(html).toContain(">SPY<");
    expect(html).toContain('class="row-dim"');
    expect(html).toContain("over budget (premium $310 &gt; budget)");
    expect(html).toContain("within");
  });

  it("the setups view states the budget and the candidate cards carry a grade chip", () => {
    const html = render(<SetupsView />, conn(mid.state), mid.asOf);
    expect(html).toContain("Budget: $200 per contract");
    expect(gradeChipText(grades.summary.byFamily["orb"])).toBe("graded n=4, 50% direction, −4% avg");
    expect(gradeChipText(grades.summary.byFamily["range-rejection"])).toBe("graded n=1, 100% direction, avg n/a");
    expect(gradeChipText(null)).toBe("not yet graded");
    const c = mid.decision.candidates[0];
    if (c) {
      const card = renderToString(<CandidateCard c={c} now={mid.asOf} grade={grades.summary.byFamily[c.family] ?? null} />);
      expect(card).toContain(gradeChipText(grades.summary.byFamily[c.family]));
      const noGrades = renderToString(<CandidateCard c={c} now={mid.asOf} />);
      expect(noGrades).not.toContain("graded");
    }
  });
});

describe("self-grading and closing-window learning", () => {
  const g = gradesFixture();

  it("the grades fixture goes through the real engine summarisers", () => {
    expect(g.summary.n).toBe(7);
    expect(g.summary.byFamily["orb"]!.n).toBe(4);
    expect(g.closing.learner.gradedSessions).toBe(12);
    expect(g.closing.learner.rmsZ).not.toBeNull();
    expect(g.closing.learner.parameters.seasonalityMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("renders the self-grading section with summary, by-family and recent tables", () => {
    const html = renderToString(<SelfGrading g={g} />).replace(/<!-- -->/g, "");
    expect(html).toContain("Self-grading");
    expect(html).toContain("7 graded recommendations");
    expect(html).toContain("Direction hit rate");
    expect(html).toContain("95% Wilson");
    expect(html).toContain("Invalidated first");
    expect(html).toContain("orb");
    expect(html).toContain("trend-pullback");
    expect(html).toContain("Recent grades");
    expect(html).toContain("yes (no exit quote yet)");
    expect(html).toContain(g.summary.note.slice(0, 20));
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("renders the closing-window learning section and the learning box", () => {
    const html = renderToString(<ClosingLearning g={g} />).replace(/<!-- -->/g, "");
    expect(html).toContain("Closing-window learning");
    expect(html).toContain("RMS z");
    expect(html).toContain("Drift slope");
    expect(html).toContain("Per pattern");
    expect(html).toContain("Per sub-window");
    expect(html).toContain("Parameters applied vs base");
    expect(html).toContain("Seasonality multiplier");
    expect(html).toContain("Recent closing grades");
    expect(html).toContain(g.closing.learner.note);
    expect(html).toContain("provisional");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
    const box = renderToString(<LearningBox learner={g.closing.learner} />).replace(/<!-- -->/g, "");
    expect(box).toContain("12 graded sessions");
    expect(box).toContain("Settlement noise (pts)");
  });

  it("an empty grades response renders n/a rather than NaN", () => {
    const empty = { ...g, grades: [], summary: { ...g.summary, n: 0, directionHitRate: NaN, directionCi: [NaN, NaN] as [number, number], invalidationRate: NaN, avgWouldHaveRetPct: null, medianWouldHaveRetPct: null, byFamily: {} } };
    const html = renderToString(<SelfGrading g={empty} />).replace(/<!-- -->/g, "");
    expect(html).not.toContain("NaN");
    expect(html).toContain("no grades yet");
  });
});

describe("settings", () => {
  it("labels the per-contract budget and shows the current value", () => {
    const mid = syntheticFixture("2026-11-06", 11, 5);
    const html = renderToString(<Budgets s={mid.settings} save={async () => {}} />).replace(/<!-- -->/g, "");
    expect(html).toContain("Max premium per contract, USD — applies to SPX and SPY ranking and to the closing window");
    expect(html).toContain("Current value on the server: $200");
  });
});

describe("Dash", () => {
  const withActions = (f: ReturnType<typeof syntheticFixture>, spx: "BUY CALL" | "BUY PUT" | "WAIT", spy: "BUY CALL" | "BUY PUT" | "WAIT") => {
    const st = f.state;
    const inst = st.instruments!;
    const patch = (pack: typeof inst.SPX, action: typeof spx) => ({ ...pack, decision: { ...pack.decision!, summary: { ...pack.decision!.summary, action } } });
    return { ...st, instruments: { SPX: patch(inst.SPX, spx), SPY: patch(inst.SPY, spy) }, decision: patch(inst.SPX, spx).decision };
  };
  const renderDash = (state: ReturnType<typeof withActions>, inst: "SPX" | "SPY", now: number) =>
    renderToString(
      <StaticServerProvider conn={conn(projectState(state, inst))} now={now}>
        <DashView />
      </StaticServerProvider>,
    ).replace(/<!-- -->/g, "");

  it("shows the raw SPX and SPY quotes in the market tile whichever instrument is selected", () => {
    const f = syntheticFixture("2026-11-06", 11, 5);
    const html = renderDash(withActions(f, "WAIT", "WAIT"), "SPY", f.asOf);
    expect(html).toContain("Action · SPY");
    expect(html).toContain(`<b>SPX</b> <span class="mono">${fmtNum(f.state.spx!.last, 2)}</span>`);
    expect(html).toContain(`<b>SPY</b> <span class="mono">${fmtNum(f.state.spy!.last)}</span>`);
  });

  it("flags when the other instrument's own setup disagrees, and says so when it agrees", () => {
    const f = syntheticFixture("2026-11-06", 11, 5);
    const dis = renderDash(withActions(f, "BUY CALL", "BUY PUT"), "SPY", f.asOf);
    expect(dis).toContain("SPX BUY CALL — disagrees");
    const agree = renderDash(withActions(f, "BUY PUT", "BUY PUT"), "SPX", f.asOf);
    expect(agree).toContain("SPY BUY PUT — agrees");
    const none = renderDash(withActions(f, "BUY PUT", "WAIT"), "SPX", f.asOf);
    expect(none).not.toContain("disagrees");
    expect(none).toContain("SPY WAIT");
  });
});
