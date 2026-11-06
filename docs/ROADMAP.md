# Roadmap (prioritised)

Done since the first cut: Schwab connected (LIVE), Workers Paid with the 30 s CPU limit, native SPY analysis with the
SPX/SPY toggle, TICK and cross-index inputs, multi-timeframe features, the terse Dash, continuous self-grading
(intraday and closing window), the Brier-weighted ensemble with burn-in and caps, Discord alerts, three reviews
(docs/reviews) and the comparable-tools survey (docs/research/comparable_tools.md).

1. **Run the prospective ledger** for ≥ 60 sessions: decisions, paper positions, ensemble predictions, closing-window
   grades. Nothing is validated until then; Performance and Lean report hit rates with intervals as they accrue.
2. **Closing-window measurement**: the 15:50–16:00 ticks are already stored at full resolution with the 15:59 print and
   the official settlement; after 30 sessions the learner starts moving `settlementNoisePts`, the σ seasonality
   multiplier and pattern trust. Compare the learned values against the Cboe daily-close study in research/results.
3. **Walk-forward validation CLI** over archived days (R2 JSONL) once data exists: per instrument, family, phase and
   regime; ablations (GEX on/off, calendar on/off, TICK/cross on/off, ensemble on/off); cost sensitivity; a written
   trial registry so repeated searches are deflated (SPA / deflated Sharpe) instead of cherry-picked.
4. **Wire family trust**: `familyTrust` (engine, from graded would-have returns after 30 episodes per family) is computed
   but not yet applied; apply it as a bounded multiplier on each family's setup confidence and show it on Performance.
5. **Level-strength test** (Osler protocol): conditional bounce rate at our S/R levels vs 10,000 random levels, by
   level type and strength bucket, per instrument. Until then S/R strength is a heuristic score.
6. **Reporting**: a nightly per-session report (grades, BSS, closing outcome, feed health) archived to R2 and surfaced
   on Performance; e-mail/push delivery after Discord.
7. **ES futures feed** (`/ES`) as the overnight and closing-window confirmation: requires adding Accounts and Trading to
   the Schwab app for streaming; without it the companion-sign logic stays on SPY/NDX/RUT.
8. **Historical execution-level backtest** of the strike-flip module: Databento OPRA CMBP-1 (2023-03→) or ThetaData
   tick NBBO + SPX 1 s; purchase decision pending (see docs/PROVIDERS.md).
9. **Closing imbalance data** (Massive NYSE imbalances, NYSE-listed only) — evaluate whether it improves the
   15:50–16:00 module before buying.
10. Cloudflare Access onboarding (one-time, dashboard) and removal of the passphrase fallback.
11. Explicitly out of scope until validated: option selling, spreads, automatic order submission.
