# Roadmap (prioritised)

1. **Connect Schwab** (you): paste credentials/URL in Settings → LIVE quotes, chains, multi-day bars (enables gap,
   prior-day, weekly features and real-time closing-window evaluation). Upgrade to Workers Paid for a reliable loop.
2. **Run the prospective ledger** for ≥ 60 sessions: decisions, paper positions, ensemble predictions. Nothing is
   validated until then; the Performance and Lean views report hit rates with confidence intervals as they accrue.
3. **Closing-window measurement**: record 15:50–16:00 ticks at 3 s, the 15:59 print and the official settlement
   (Cboe publishes the SPX close; SET history for AM series) to estimate settlement noise (`settlementNoisePts`) and
   the strike-magnet hit rate; replace the default seasonality multiplier with the measured last-10-minute variance.
4. **Walk-forward validation** with `research/harness` once data exists: per family, per phase, per regime; ablations
   (GEX on/off, calendar on/off, ensemble on/off); cost sensitivity; deflated statistics for repeated searches.
5. **Streaming** (requires adding Accounts and Trading to the Schwab app): sub-second SPX/SPY/option quotes in the
   closing window; ES futures (`/ES`) confirmation.
6. **Historical execution-level backtest** of the strike-flip module: Databento OPRA CMBP-1 (2023-03→) or ThetaData
   tick NBBO + SPX 1 s; purchase decision pending (see docs/PROVIDERS.md).
7. **Closing imbalance data** (Massive NYSE imbalances $49/mo, NYSE-listed only) — evaluate whether it improves the
   15:50–16:00 module before buying.
8. Cloudflare Access onboarding (one-time, dashboard) and removal of the passphrase fallback.
9. Optional: LLM explanation of recorded decisions (narration only), alerts (push/e-mail) on state changes.
10. Explicitly out of scope until validated: option selling, spreads, automatic order submission.
