/**
 * Render smoke test: every view is rendered to a string against a ServerState produced by the real engine from
 * synthetic data, so a runtime null-dereference in any view fails the suite. Effects (fetches) do not run in SSR.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticServerProvider } from "../api/context";
import type { ServerConnection } from "../api/useServerState";
import { syntheticFixture } from "../test/fixture";
import { TodayView } from "./Today";
import { SetupsView } from "./Setups";
import { GammaView } from "./Gamma";
import { ClosingView } from "./Closing";
import { PositionsView } from "./Positions";
import { ReplayView } from "./Replay";
import { PerformanceView } from "./Performance";
import { SettingsView } from "./Settings";
import { LeanView } from "./Lean";
import { PriceChart } from "../components/PriceChart";
import { GexChart } from "../components/GexChart";
import { GexProfile } from "../components/GexProfile";
import { StrikeLadder } from "../components/StrikeLadder";
import { StatusBar } from "../components/StatusBar";

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

function renderAll(c: ServerConnection, now: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, make] of VIEWS) out[name] = renderToString(<StaticServerProvider conn={c} now={now}>{make()}</StaticServerProvider>).replace(/<!-- -->/g, "");
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
