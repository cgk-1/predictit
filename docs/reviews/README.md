# Independent reviews (2026-11-06)

Three reviewer agents assessed the codebase and docs without modifying anything. Their memos are kept verbatim;
the items acted on immediately are listed below, the rest are tracked in `docs/ROADMAP.md`.

| Memo | Focus |
|---|---|
| `quant_review.md` | Mechanics and math: closing-window σ/drift/edge, GEX universe, evidence mismatches, SPY specifics, kill tests |
| `learning_review.md` | Unit of learning (records vs sessions), update rule, grader biases, closing learner estimators, reporting, experiment protocol |
| `product_review.md` | Information hierarchy, Dash, closing workspace, alerting, accessibility, polling payload, API/UI mismatches |

## Acted on the same day

- σ solved from the straddle offset-aware (`pricing/bs.ts: sigmaFromStraddle`); market-implied σ primary; drift off
  by default; recommendation gate = pattern + feasibility + breakeven ≤ 0.75σ; P(ITM) without drift.
- Positive dealer gamma → no directional claim (ensemble `gammaMom`, afternoon family waits); rest-of-day return from
  the prior close.
- Ensemble: Brier-based multiplicative update, per-horizon weights, family weight caps, 5-minute decision grid,
  600-decision burn-in, climatology and Brier skill score reported.
- Grader: entry at ask + slippage after latency, exit at the last bid at or before the exit instant (no look-ahead),
  provisional when the horizon price is stale; episode dedup in the sweep.
- Closing learner rebuilt from the grade ledger, one record per session (official close preferred); 30-session minimum.
- Official close under Schwab from the next session's quote `closePrice`; "last tick" = last print at or before 16:00:00.
- GEX universe decoupled from the execution chain (broad chain every 5 minutes).
- SPY expiry instant 16:15 for time value; harness and worker costs aligned.
- Dash: instrument-consistent spot, plan tiles only for live setups, σ vs E|move| labelled, neutral pre-window state,
  GEX detail moved to its own endpoint to shrink the state payload.
