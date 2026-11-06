import { useMemo } from "react";
import { api } from "../api/client";
import { useInstrument, useServer, useServerNow } from "../api/context";
import { useFetch } from "../lib/useFetch";
import { ChangesFeed } from "../components/ChangesFeed";
import { Collapsible } from "../components/Collapsible";
import { DecisionCard } from "../components/DecisionCard";
import { LevelsLadder } from "../components/LevelsLadder";
import { MarketStrip } from "../components/MarketStrip";
import { Empty, Panel } from "../components/Panel";
import { PriceChart } from "../components/PriceChart";
import { RegimePanel } from "../components/RegimePanel";
import { TimeframesTable } from "../components/Timeframes";
import { ModeBadge } from "../components/Badges";
import { SummaryCard } from "../components/SummaryCard";
import { fmtAgo, fmtTime } from "../lib/format";

/** Phone width at or below which secondary sections start collapsed. */
export const PHONE_PX = 640;

export function TodayView() {
  const { state: s, loading } = useServer();
  const now = useServerNow();
  const [inst] = useInstrument();
  const bars = useFetch((sig) => api.bars(inst, sig), `${inst}-bars`, 30_000);
  const minute = Math.floor(now / 60_000) * 60_000;
  const completed = useMemo(() => (bars.data?.bars ?? []).filter((b) => b.t + 60_000 <= minute), [bars.data, minute]);

  if (!s) {
    return <Empty>{loading ? "Connecting to the server…" : "No state received yet. The status bar shows the connection state; retrying automatically."}</Empty>;
  }
  const q = inst === "SPY" ? s.spy : s.spx;
  const spot = q?.last ?? null;
  const spotTime = q?.quoteTime ?? null;
  const d = s.decision;
  return (
    <>
      <MarketStrip state={s} />
      {d ? (
        <>
          <SummaryCard summary={d.summary} lean={d.lean} now={now} budgetUsd={s.settings.engine.maxPremiumPerContract} />
          <DecisionCard decision={d} now={now} />
        </>
      ) : (
        <Empty>
          No decision yet — the engine has not evaluated a frame ({s.mode === "NONE" ? "no market data has arrived" : "waiting for the first evaluation"}). Feeds and the Schwab connection are on the Settings page.
        </Empty>
      )}
      <Collapsible
        id="market-detail"
        title="Market detail"
        defaultOpen
        collapseBelowPx={PHONE_PX}
        meta={
          <>
            {s.regime ? <span>regime {s.regime.trend.replace(/-/g, " ")}, gamma {s.regime.gamma}</span> : <span>regime n/a</span>}
            <span>{s.levels.length} key levels</span>
          </>
        }
      >
        <div className="grid-2">
          <RegimePanel regime={s.regime} now={now} />
          <LevelsLadder levels={s.levels} spot={spot} spotTime={spotTime} />
          <Panel title="Timeframes" meta={d?.summary.timeframes ? d.summary.timeframes.alignment.text : "n/a"} className="grid-span-2">
            <TimeframesTable mtf={d?.summary.timeframes ?? null} />
          </Panel>
        </div>
        <Panel
          title={`${inst}, 1-minute`}
          meta={
            bars.data ? (
              <>
                <span>
                  bars as of {fmtTime(bars.data.stamp.observedAt)} ET ({fmtAgo(now - bars.data.stamp.observedAt)})
                </span>
                <ModeBadge mode={bars.data.stamp.mode} />
                <span>{completed.length} completed bars</span>
              </>
            ) : bars.error ? (
              <span>bars unavailable: {bars.error}</span>
            ) : (
              <span>loading bars…</span>
            )
          }
        >
          <PriceChart bars={completed} levels={s.levels} spot={spot} />
          <p className="xs muted">Completed bars only (a bar is drawn once its minute has ended on the server clock). Dashed lines are key levels from the ladder; round numbers are omitted.</p>
        </Panel>
      </Collapsible>
      <ChangesFeed changes={s.changes} />
    </>
  );
}
