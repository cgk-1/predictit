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
- Remaining-move distribution: σ from the ATM 0DTE straddle mid under the normal model (offset-aware, so a spot
  between strikes does not understate it); when no straddle is quotable, realized 10-minute vol × the seasonality
  multiplier, combined with a settlement-noise term (default 1.5 pts, to be measured). Model P(close above strike)
  is driftless by default (`driftPersistence: 0`); the drifted value is shown as a hypothesis only.
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

**Recommendation.** Among strikes with a directional pattern, the feasible contract with the highest model P(ITM)
(driftless), tighter spread as the tie-break, subject to these gates:

- the breakeven must be reachable within 0.75 σ of the remaining move (× learned pattern trust);
- **side margin**: when the best call-biased and best put-biased candidates differ by less than 10 points of P(ITM),
  the window has no side and the module WAITs, naming both candidates;
- **flip suppression**: a direction flip against a setup issued within the last 90 s needs a ≥10-point P(ITM)
  margin over the old side, otherwise WAIT ("whipsaw guard");
- **exit band**: a setup already issued on the same strike and side keeps its gate up to 1.0 σ (0.75 × 1.33), so a
  one-point wobble does not drop and re-issue it every tick;
- **hold-to-settlement** (15:58 onward, no practical exit): only the option at the pattern strike itself, and only
  with model P(ITM) ≥ 50%; an out-of-the-money neighbour is never a hold recommendation.

Entry condition, invalidation (SPX back through the strike for >30 s or spread blow-out), exit plan, rationale and
the strongest counterargument are recorded immutably with a 20-second expiry.

**Status.** Unvalidated. The first LIVE session (2026-11-06, Schwab, 3-second ticks) is written up in
`docs/VALIDATION.md`; it produced 40 in-window records and 11 setups, exposed a side-flip chatter problem at an
at-the-money strike in 15:58–15:59 (fixed by the side-margin, flip-suppression and hold rules above) and gave the
first σ calibration point (RMS z 0.62 against the last print; the official close was not yet published). The
prospective measurements (settlement vs 15:59:59 print, last-10-minute variance seasonality, strike-magnet hit rate,
fill feasibility at 15:58) accrue from here; the learner moves parameters only after 30 graded sessions. The research
memo found no published study of this window for SPXW 0DTE; the measurement design is in
`docs/research/gex_and_literature.md` §8.
