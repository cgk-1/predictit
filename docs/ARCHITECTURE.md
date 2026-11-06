# Architecture

```
apps/web        React 19 + Vite SPA (static assets served by the Worker; no CDN, strict CSP)
apps/worker     Cloudflare Worker: auth gate → /api router → MarketSession Durable Object; cron watchdog
packages/engine Pure TypeScript analytics (no I/O): time, contracts, pricing, GEX, features, regime, strategies,
                closing window, ranking, decisions, ensemble, positions, replay. Shared by the Worker, the UI and the
                research harness.
packages/adapters Schwab Market Data + Cboe delayed JSON → timestamped data contracts
research/       Collector (Cboe delayed), replay/validation CLI, daily calendar study, results
docs/           Research memos (sources dated 2026-11-06), evidence ledger, provider comparison, roadmap
```

## Data contracts

Every observation carries `SourceStamp { source, mode: LIVE|DELAYED|REPLAY, observedAt, receivedAt }`. There is no
DEMO mode anywhere: when no feed is available the mode is `NONE` and the UI shows n/a. Option quotes keep vendor
IV/greeks under `vendor.*` (provider estimates); our own IV, greeks, GEX and probabilities are computed from bid/ask
mids and labelled as inferred.

## Live loop (Durable Object `MarketSession`)

1. Alarm fires (5 s LIVE / 60 s DELAYED during 08:00–16:35 ET; 5 min otherwise; a 1-minute cron re-arms it).
2. Fetch: Schwab quotes every tick (`$SPX, SPY, $TICK, $VIX, $NDX, $RUT, $DJI, QQQ, IWM, RSP`), near SPX and SPY
   chains every 10 s (3 s in the last ten minutes), broad SPX/SPY chains (±120/±80 strikes, 45 days) every 5 min for
   GEX, minute history every 5 min; or Cboe delayed SPX chain + intraday bars every 60 s.
3. Normalize → store gzip snapshots (SQLite, by `receivedAt`; bars at most every 60 s, chains every 30 s, quotes every
   5 s, everything in the closing window) → build the as-of `MarketFrame` → for each instrument (SPX, then SPY)
   `buildContext(frame, settings, positions, instrument)` (features, GEX from that instrument's own chain, regime,
   calendar, levels, S/R, TICK, multi-timeframe, cross-index) → score that instrument's due ensemble predictions and
   update the shared weights (bounded) → `decide` (strategies, ranking on the native chain only, closing window for SPX
   only, lean, summary) → append `DecisionRecord` (`dec_<INST>_…`, instrument-tagged) to the insert-only ledger when
   material → diff → change feed (SPY lines prefixed) → optional Discord alert on a setup change.
4. Every 60 s a grading sweep scores past recommendations (horizon grades), closing-window records (settlement grades,
   provisional then official) and folds them into the bounded learners (closing parameters, family trust, ensemble weights).
5. `/api/state` returns the latest evaluation for both instruments (`instruments.SPX`, `instruments.SPY`, compact GEX
   without per-strike detail) with server time; clients poll every 3 s. `/api/gex?instrument=` serves the per-strike
   GEX profile; `/api/lean`, `/api/grades`, `/api/replay?instrument=` and `/api/alerts/status` are separate.

## Decision model

- Five states: CALL SETUP, PUT SETUP, WAIT, PASS, MANAGE EXISTING POSITION. A setup has a lifecycle
  (forming → armed → triggered → invalidated/expired); a triggered setup only becomes a CALL/PUT SETUP when a contract
  passes execution filters (spread, size, quote age, budget) — direction alone is never a trade.
- Strategy families are evaluated separately with explicit trigger, invalidation, horizon and exit rules; they are
  not blended into a score. The separate "market lean" ensemble weights many weak indicators transparently and adapts
  from scored predictions with bounded updates; it informs, it does not enter.
- The closing-window module (last ten minutes) owns the strike-flip logic with sub-window feasibility rules and
  resale vs hold-to-settlement modes; the final minute always PASSes.
- Records are immutable and versioned (`previousId`, `inputsDigest`); replay reconstructs any instant from stored
  snapshots received at or before that instant.
- Instruments are independent: SPX and SPY are analysed from their own data with their own key levels (round-number
  step 5 for SPY, 50 for SPX; native VWAP for SPY, TWAP for SPX), contracts are ranked only on the native chain, and
  no price level is ever derived by scaling the other index. The companion index contributes sign agreement only.

## Leakage guards

`completedBars` excludes the forming bar; `frameAt` ignores snapshots received after `asOf`; regime labels use only
session-to-date statistics; OI is prior-close by construction; the replay harness re-stamps delayed data to its live
availability time and never earlier; settlement in replay is flagged as "last SPX value, not official".

## Security

Server-side auth on every path; strict CSP (`script-src 'self'`), no external assets; same-origin enforcement on
mutating requests; secrets only in Worker secrets or Durable Object storage (write-only: Schwab client credentials
and tokens, the Discord webhook URL); `x-robots-tag: noindex`; no secrets in the repo (CI greps for known prefixes).
