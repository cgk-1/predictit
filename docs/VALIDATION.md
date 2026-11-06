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

## What would change a label from "unvalidated"

≥ 60 sessions of LIVE as-of data, positive net expectancy after costs in the untouched test period, not driven by
the top 1–2 winners (top-winner share < 40%), and stable across the two halves of the sample.
