# Closing window module (15:50–16:00 ET, SPX)

**Scope.** PM-settled SPXW contracts expiring today (and only those: AM-settled SPX/SPXO are never eligible; the
module checks the root). Trading in expiring SPXW stops at 16:00:00 ET; settlement is the official S&P 500 close
built from constituent closing-auction prices, published after 16:00 and generally different from the last index
print. Both facts are encoded and surfaced on the screen.

**Definitions.**
- *Strike flip*: the index crossing, or failing to cross, a listed strike into settlement (which flips the expiring
  call/put at that strike between worthless and intrinsic).
- *Gamma flip*: the spot level at which modelled dealer gamma changes sign. Unrelated; shown on the Gamma view.

**What is evaluated for each nearby strike (±4 strikes, 5-point ladder).**
- Position and distance; interaction over the last 15 minutes (crossings, dwell on the current side, touches) and a
  pattern label: break-hold, failed-cross, reclaim, rejection, pinning (≥4 crossings in 10 min → "no directional
  edge"), accelerating-toward (speed and ETA vs time left).
- Approach dynamics: 1-minute and 3-minute speed (pts/min), acceleration, ETA to the strike.
- Remaining-move distribution: σ = max(ATM 0DTE straddle-implied, realized 10-minute vol × seasonality multiplier)
  combined with a settlement-noise term (default 1.5 pts, to be measured). Model P(close above strike) uses a drift
  of half the recent speed over the remaining minutes (momentum hypothesis) — shown with and without the drift.
- Quote economics for the call and the put at the strike: bid/ask/size/age, breakeven settlement including costs,
  required move, model P(ITM), expected intrinsic (fair value, Bachelier) vs ask → edge after costs, settlement P&L
  scenarios at −2σ…+2σ.
- Execution feasibility by sub-window, with an assumed entry delay (default 8 s):
  - 15:50–15:55: resale and hold both feasible.
  - 15:55–15:58: resale "risky" (less than two minutes after entry), hold feasible.
  - 15:58–15:59: resale infeasible; hold only; spread and size requirements tightened.
  - 15:59–16:00: **PASS for new entries** (entry delay, quote changes, broker cut-offs, no exit). Always.
- Confirmation: 3-minute direction of SPY (and ES when connected) vs SPX.

**Modes.** `resale` (sell on a touch of the next strike or at a fixed number of seconds before the close, whichever
first; sell immediately on invalidation) or `hold-to-settlement` (P&L = 100 × (intrinsic − premium) − fees; no
practical exit; the settlement-noise term matters).

**PASS rules (any one is sufficient).** Market closed; before 15:50; no PM-settled expiring contract; DELAYED or
missing data; SPX quote older than 5 s; final minute; fewer than 60 s left; and, per contract, wide spread, small
size, stale quote.

**Recommendation.** The best feasible contract by modelled edge (with drift) relative to its ask among strikes with
a directional pattern; entry condition, invalidation (SPX back through the strike for >30 s or spread blow-out), exit
plan, rationale and the strongest counterargument are recorded immutably with a 20-second expiry.

**Status.** Unvalidated. The required prospective measurements (settlement vs 15:59:59 print, last-10-minute
variance seasonality, strike-magnet hit rate, fill feasibility at 15:58) start accruing once Schwab is connected.
The research memo found no published study of this window for SPXW 0DTE; the measurement design is in
`docs/research/gex_and_literature.md` §8.
