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

## Continuous self-grading (live, prospective)

- Intraday recommendations: graded at the horizon (direction hit, invalidation-first, would-have return at ask/bid
  with costs; max favourable excursion when chain snapshots exist). Per-family hit rate with Wilson intervals.
- Closing window: graded at settlement (provisional on the last print, official on the next session's prev-close);
  per-pattern and per-sub-window statistics; bounded parameter learning (σ seasonality [1,3], drift persistence [0,1],
  settlement noise [0.5,5] pts, pattern trust [0.5,1.5]) after 10 graded sessions / 20 outcomes per pattern.
- Ensemble: 15/60-minute direction predictions scored with Brier and hit rate; learned weights after a 300-decision burn-in.

## Planned tests (from docs/research/ensemble_and_seasonality.md)

- Level strength: Osler-style protocol — conditional bounce rate at our S/R levels vs 10,000 random levels, by level
  type and strength bucket.
- Gap fill: realized fill rate vs the reflection-principle null 2·(1−Φ(gap/σ_session)).
- Ensemble: 300-decision burn-in at prior weights, Brier with half-life ≈500, Platt calibration on a trailing
  out-of-sample window, SPA/deflated-Sharpe hurdle against the fixed trial registry, option-P&L-after-spread as the
  economic test.
- Intraday momentum: rest-of-day return → last-30-minute return, conditional on the dealer-gamma sign.

## What would change a label from "unvalidated"

≥ 60 sessions of LIVE as-of data, positive net expectancy after costs in the untouched test period, not driven by
the top 1–2 winners (top-winner share < 40%), and stable across the two halves of the sample.
