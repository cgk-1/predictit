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
