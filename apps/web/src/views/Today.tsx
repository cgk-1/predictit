import { useMemo } from "react";
import { api } from "../api/client";
import { useServer, useServerNow } from "../api/context";
import { useFetch } from "../lib/useFetch";
import { ChangesFeed } from "../components/ChangesFeed";
import { DecisionCard } from "../components/DecisionCard";
import { LevelsLadder } from "../components/LevelsLadder";
import { Empty, Panel } from "../components/Panel";
import { PriceChart } from "../components/PriceChart";
import { RegimePanel } from "../components/RegimePanel";
import { ModeBadge } from "../components/Badges";
import { fmtAgo, fmtPts, fmtTime } from "../lib/format";

export function TodayView() {
  const { state: s, loading } = useServer();
  const now = useServerNow();
  const bars = useFetch((sig) => api.bars("SPX", sig), "spx-bars", 30_000);
  const minute = Math.floor(now / 60_000) * 60_000;
  const completed = useMemo(() => (bars.data?.bars ?? []).filter((b) => b.t + 60_000 <= minute), [bars.data, minute]);

  if (!s) {
    return <Empty>{loading ? "Connecting to the server…" : "No state received yet. The status bar shows the connection state; retrying automatically."}</Empty>;
  }
  const spot = s.spx?.last ?? null;
  const spotTime = s.spx?.quoteTime ?? null;
  return (
    <>
      {s.decision ? (
        <DecisionCard decision={s.decision} now={now} />
      ) : (
        <Empty>
          No decision yet — the engine has not evaluated a frame ({s.mode === "NONE" ? "no market data has arrived" : "waiting for the first evaluation"}). Feeds and the Schwab connection are on the Settings page.
        </Empty>
      )}
      <div className="grid-2">
        <RegimePanel regime={s.regime} now={now} />
        <LevelsLadder levels={s.levels} spot={spot} spotTime={spotTime} />
      </div>
      <Panel
        title="SPX, 1-minute"
        meta={
          bars.data ? (
            <>
              <span>
                bars as of {fmtTime(bars.data.stamp.observedAt)} ET ({fmtAgo(now - bars.data.stamp.observedAt)})
              </span>
              <ModeBadge mode={bars.data.stamp.mode} />
              <span>{completed.length} completed bars</span>
              {spot !== null ? <span>spot {fmtPts(spot, 2)} at {fmtTime(spotTime)}</span> : null}
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
      <ChangesFeed changes={s.changes} />
    </>
  );
}
