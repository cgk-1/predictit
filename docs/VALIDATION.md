# Validation status and method

**Status (2026-11-06): no strategy is validated.** The platform ships with an as-of replay harness, baselines and
a prospective paper ledger; results accrue from here. The first replay (one partial delayed day) is in
`research/results/replay_2026-11-06_2026-11-06.md` and exists only to prove the pipeline runs without hindsight.

## Method (research/harness)

- Data: snapshots ordered by `receivedAt`; for delayed sources, re-stamped to live availability (never earlier).
- Decision cadence: 60 s, 10 s inside the closing window. Each decision sees only data received at or before its instant.
- Fills: entry at ask + slippage, exit at bid − slippage, latency parameter, fill fails when quoted size < qty;
  settlement uses the last SPX value and is flagged (official settlement feed to be added).
- Metrics: net expectancy, median return, win rate, payoff ratio, full-premium-loss rate, max drawdown, longest losing
  streak, top-winner share, p10/p90, by family / phase / regime; abstention share.
- Baselines: always-call, always-put, random (matched times/contracts), and implicitly no-trade (0).
- Ensemble: prospective hit rate per horizon with Wilson intervals and Brier vs 0.25; calibrated probabilities are
  withheld below 200 scored predictions.
- Overfitting controls: chronological walk-forward with an untouched final period; samples grouped by trading day;
  ablations; the number of strategy variants is fixed and documented, and any later search will be reported with the
  number of trials.

## First pipeline checks (2026-11-06, one partial delayed session — not evidence)

- `research/results/replay_2026-11-06_2026-11-06.md`: engine replay produced 1 trade and the baselines ran under
  identical costs.
- `research/results/lean_replay_2026-11-06.txt`: the ensemble learner scored ~50 fifteen-minute predictions on a
  low-efficiency (chop) session; momentum-type indicators were wrong most of the time and their weights fell within
  the clamps, while the wall-proximity indicator scored best. One day proves nothing except that scoring, bounded
  updates, abstention and interval reporting work end-to-end on real data.

## First LIVE session (2026-11-06, Schwab, in-sample, not evidence)

- The first full LIVE session produced ~200 prospective intraday grades (direction hit rate ≈ 39%, most SETUPs
  from the level-reclaim-reject family). Those numbers are reported on Performance but are **not** evidence: the
  engine changed several times during the session (native SPY analysis, grader latency/slippage, episode dedup,
  closing σ), early records were ranked across both chains, and one chop session is one sample.
- SPX and SPY were both evaluated natively from ~14:00 ET with multi-timeframe frames over 11 sessions of Schwab
  minute history, TICK, VIX and the cross-index set flowing.

## Closing window, first LIVE session (2026-11-06; one session, not evidence)

Source: the deployed ledger (`/api/decisions?date=2026-11-06`, 888 records, 87 with a closing assessment) and the
provisional closing grades against the last SPX print (7376.51; Cboe had not published the official close when this
was written, so the official grade and the settlement-gap measurement follow on the next session).

- 40 in-window records (15:50:35–15:59:56), 11 setups: 4 would have finished in the money, 7 not. Held to settlement,
  the 11 sum to −$619 per contract; the two early 7380 puts (15:50, spot ≈7385, accelerating-toward) and the two
  late 7380 puts were the winners, the five 7375 put resale setups (15:54–15:57, spot 7375–7378) all finished 1–2
  points out of the money. Resale exits are not graded yet (needs the option tick path), so these are hold-to-
  settlement figures for contracts recommended as resales.
- σ calibration: RMS z = 0.62 over the 40 records (realized remaining moves smaller than the modelled σ); max |z| 1.33.
  One session: no parameter is moved before 30.
- Defect found and fixed: between 15:58:19 and 15:58:46 the module alternated 7380 put → 7380 call → 7380 call → 7380
  put within 27 seconds, each with model P(ITM) 44–53%, because adjacent strikes carried opposite biases and the
  ranking by P(ITM) picked whichever side a one-point wobble favoured. Fix (engine, tests added): side-margin rule,
  flip suppression within 90 s, exit band for an active setup, and hold-to-settlement restricted to the pattern
  strike with P(ITM) ≥ 50%. None of the four 15:58 setups qualifies under the new rules: three had model P(ITM) of
  44–49%, below the 50% hold floor, and the fourth (53%) was the out-of-the-money neighbour of the pattern strike.
- Defect found and fixed: decisions were stamped with the tick's start time while the quotes they used arrived up to
  a second later, so a hindsight-free replay at a record's exact `asOf` saw the previous tick's quote and reproduced 2
  of 5 sampled closing records. Decisions are now stamped after the fetches. Replay-equals-live is a standing check
  from the next session on.
- Intraday (all families): 365 graded episodes, direction hit rate 42%, invalidation rate 40%, median would-have
  return −0.32% after costs. The engine changed repeatedly during the session (native SPY, grader, σ), so these are
  pipeline checks, not performance.
- The sandbox Cboe collector stopped at 12:52 ET (process killed), so the delayed-data closing replay could not be
  run; the LIVE ledger above is the better source anyway.

## Continuous self-grading (live, prospective)

- Intraday recommendations: graded at the horizon (direction hit, invalidation-first, would-have return at the ask
  after a 2 s latency plus 0.05 pt slippage, exit at the bid minus slippage, costs included; max favourable excursion
  when chain snapshots exist; `provisional` while the horizon price is stale). Repeated ticks within 5 minutes are one
  episode. Per-family hit rate with Wilson intervals.
- Closing window: graded at settlement (provisional on the last print, official on the next session's prev-close);
  per-pattern and per-sub-window statistics; bounded parameter learning (σ seasonality [1,3], drift persistence [0,1],
  settlement noise [0.5,5] pts, pattern trust [0.5,1.5]) from one record per session, after 30 graded sessions.
- Ensemble: 15/60-minute direction predictions on a 5-minute grid per instrument, scored with Brier and hit rate
  against the session climatology (BSS); learned weights after a 600-prediction burn-in; clamps [0.25×, 3×] of the
  prior, decay toward the prior, per-family weight caps.
- Guards that are implemented and automatic: the ensemble uses prior weights until 600 predictions are scored and
  falls back to the priors whenever the stored weight vector no longer matches the indicator registry
  (`reconcileWeights`); the closing module PASSes when the required move exceeds 0.75 σ of the remaining window, and
  its learned parameters stay at the defaults until 30 sessions are graded. Not yet wired: `familyTrust` (a per-family
  multiplier from graded would-have returns after 30 episodes) is computed by the engine but does not yet gate the
  strategy families; see ROADMAP.

## Planned tests (from docs/research/ensemble_and_seasonality.md)

- Level strength: Osler-style protocol — conditional bounce rate at our S/R levels vs 10,000 random levels, by level
  type and strength bucket.
- Gap fill: realized fill rate vs the reflection-principle null 2·(1−Φ(gap/σ_session)).
- Ensemble: 600-prediction burn-in at prior weights (implemented), Platt calibration on a trailing out-of-sample
  window, SPA/deflated-Sharpe hurdle against a fixed trial registry (the registry itself is still to be written down;
  see ROADMAP), option-P&L-after-spread as the economic test.
- Walk-forward CLI over archived days (R2 JSONL) per instrument, per family and per regime, with the untouched final
  period reported separately.
- Intraday momentum: rest-of-day return → last-30-minute return, conditional on the dealer-gamma sign.

## What would change a label from "unvalidated"

≥ 60 sessions of LIVE as-of data, positive net expectancy after costs in the untouched test period, not driven by
the top 1–2 winners (top-winner share < 40%), and stable across the two halves of the sample.
