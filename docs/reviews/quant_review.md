# Quant review: predictit SPX/SPY intraday options decision platform

Reviewer role: options market-microstructure quant. Basis: README, docs/ARCHITECTURE.md, docs/EVIDENCE-LEDGER.md,
docs/VALIDATION.md, docs/CLOSING-WINDOW.md, the two research memos, packages/engine/src, apps/worker/src/market.ts,
packages/adapters/src, research/harness/src, research/results. The live app was not used.

Snapshot note: the tree was being edited during the review (engine files with mtimes 19:11-19:16 on 2026-11-06;
`context.ts`/`families.ts`/`ensemble.ts`/`decide.ts`/`market.ts` were re-read after the refactor that made SPY a
first-class instrument). All `file:line` references are to that snapshot. Nothing was modified.

## 0. Verdict in brief

The engineering discipline is unusually good for a private tool: explicit source stamps, as-of frames, a
completed-bar guard, an insert-only ledger, Wilson intervals everywhere, "unvalidated" stamped on every output, and
two research memos that correctly identify what is folklore. The weak points are not plumbing; they are the
statistics and the pricing model in the two places where the platform claims to learn:

1. The closing-window module's "edge" is built from three separately upward-biased estimates of fair value
   (a straddle-to-sigma conversion that is wrong when spot sits between strikes, a settlement-noise term that double
   counts what the market straddle already prices, and a momentum drift the literature does not support in positive
   gamma). It will recommend buys on most sessions for reasons unrelated to any real edge.
2. Both learners (closing parameters, ensemble weights) update on heavily pseudo-replicated outcomes: one record every
   20 s inside the closing window, one prediction per minute per instrument with overlapping 15/60-minute horizons,
   SPX and SPY sharing one weight vector. "10 graded sessions" and "300-decision burn-in" are reached inside a single
   afternoon. The bounded updates are bounded per step, not per day; the one-day lean replay in
   `research/results/lean_replay_2026-11-06.txt` already shows weights falling from 0.8 to 0.26 in one session.
3. Several mechanics are feed-dependent in ways the docs do not state: the GEX universe (±2.2 %, 8 days under Schwab
   vs ±10 %, 95 days under Cboe), the official-settlement source (only exists when Cboe is polled), and the
   price path used by the strike-flip pattern classifier (1-minute closes plus one quote, not the "ticks ≤ 5 s" the
   strategy declares it needs).

None of this is fatal. All of it is fixable with modest code and, more importantly, with a measurement plan that can
kill the closing-window hypothesis within roughly 60 sessions instead of letting it drift for a year.

## 1. Correctness risks in the math and mechanics

### 1.1 Straddle-to-sigma conversion is biased whenever spot is not exactly on a strike (material)

`packages/engine/src/closing/strikeFlip.ts:223-228` sets
`sigmaIvPts = max(0, straddleMid − |spot − K_atm|) · sqrt(pi/2)`. The intent is sigma = E|X|·sqrt(pi/2) for a
zero-mean normal, with the intrinsic offset removed. But E|S_T − K| for S_T ~ N(S, sigma²) is
`sigma·sqrt(2/pi)·exp(−d²/2) + (S−K)(2Φ(d)−1)`, d = (S−K)/sigma, and subtracting |S−K| from that is not the
same as removing the offset. Numerically (offset in points, sigma in points):

| true sigma | offset | straddle | code sigma | ratio |
|---|---|---|---|---|
| 8.5 (15:50) | 1.0 | 6.83 | 7.31 | 0.86 |
| 8.5 | 2.5 | 7.07 | 5.73 | 0.67 |
| 3.8 (15:58) | 1.0 | 3.14 | 2.68 | 0.70 |
| 3.8 | 2.5 | 3.67 | 1.46 | 0.38 |
| 2.5 (15:59) | 2.5 | 2.92 | 0.52 | 0.21 |

With 5-point strikes the offset is uniform on [0, 2.5], so the implied sigma is underestimated by 15-60 % on average,
worst exactly where the module operates. The same subtraction appears in `features/chain.ts:150`
(`straddleAbsMoveToClose`). Fix: solve the Bachelier straddle equation for sigma (monotone in sigma, bisection in
10 iterations), or interpolate the two bracketing straddles in K as the memo recommends
(`docs/research/ensemble_and_seasonality.md` §4, "Strike interpolation"). The downstream consequence is in 1.2.

### 1.2 The closing module stacks three upward biases on fair value, so "edge ≥ 0.25 pt" fires too often

- `strikeFlip.ts:233`: `sigmaCore = max(sigmaIvPts, sigmaRvPts)`. The max of two noisy estimates is biased upward;
  because Bachelier option value is increasing in sigma for every strike (ATM: dC/dsigma = φ(0) ≈ 0.40 pt per point
  of sigma), this inflates every "fair" value against the market's own price. With the underestimate in 1.1 the
  realized-vol leg (×1.5 seasonality) wins most of the time, so the module is effectively pricing options off
  10-minute realized vol × 1.5 and calling the difference to the ask "edge".
- `strikeFlip.ts:234`: `sigmaUsed = sqrt(sigmaCore² + settlementNoise²)`. The ATM straddle is the market's price of
  E|S_set − K| where S_set is the official settlement, so a straddle-derived sigma already contains auction noise.
  Adding 1.5 pt in quadrature double counts it (≈ +0.05 pt ATM at sigma = 8.5, more at 15:58 when sigma ≈ 3.8:
  sqrt(3.8²+1.5²) − 3.8 = 0.29 pt of sigma ≈ +0.11 pt of fair value). The noise term belongs only on the
  realized-vol leg, which is measured on the index path.
- `strikeFlip.ts:235-236, 258`: drift = 0.5 × 3-minute speed × remaining minutes, applied to the mean of the
  settlement distribution and therefore to P(ITM) (`:251`) and to `fairWithDrift`. The candidate filter (`:392`)
  and sort (`:395`) use `edgeWithDrift`. Evidence for continuation at 3-10 minute horizons into the close is absent in
  the memos; the closest evidence (Adams et al. via `gex_and_literature.md` §4.6, §5.10) is *negative* HF momentum
  when net gamma is high, which Cboe says is the usual state on expiry days. The drift is a hypothesis dressed as a
  fair-value adjustment.

Taken together, a strike whose call is quoted at the market's fair value will show positive "edge" on most quiet
afternoons. The default `minEdgePts: 0.25` (`:63`) is $25 per contract against spreads of 0.10-0.40 and a per-side cost of
$1.35; it is inside the model error. Recommendation: define edge relative to the *market* (fair = mid of the same
contract, or the interpolated straddle-implied digital), report the model values as sensitivities, and require the
edge to clear a stated multiple of the half-spread plus a sigma-uncertainty term.

### 1.3 The pattern classifier runs on a 1-minute close path, not ticks

`decisions/context.ts:99-104` builds `path` from completed-bar closes plus the single latest quote; `decide.ts:91`
passes that path to the closing module, which runs `levelInteraction` with `holdMs: 60_000`, `touchTol: 0.75` and
`pinCrossings: 4` (`strikeFlip.ts:245`). So inside the window the classifier sees ~15 points, "break-hold" means one
close beyond the strike followed by the next close on the same side, "touches" count only closes within 0.75 pt
(intra-minute highs/lows are ignored), and "pinning" needs four close-to-close crossings in ten minutes. The strategy
registry says the family needs "SPX ticks ≤ 5 s" (`strategies/families.ts:90`). The worker does have 5-second
quotes (`market.ts:426`) and stores them (`:594` persists quotes every 5 s, every tick inside the window) but
they never reach the path. Fix: keep an in-memory tick buffer for the session (or at least the last 30 minutes) and
pass it as `path`; then re-tune `holdMs`/`touchTol` on the tick scale. Until then every pattern statistic is a
statistic about 1-minute closes.

### 1.4 Resale mode is priced as if it were hold-to-settlement

`strikeFlip.ts:391` sets `mode = "resale"` when resale is feasible but the candidate's edge (`:392`) and the sort
(`:395`) use `edgeWithDrift`, i.e. expected *intrinsic at settlement* minus ask. The resale exit plan (`:409-411`)
sells on a touch of the next strike or 60 s before the close, at a bid that will be below expected intrinsic by the
remaining time value and by half a (widening) spread. There is no model of the exit price, so resale P&L is
overstated by construction. Minimal fix: for resale, fair = E[intrinsic at t_exit] − halfSpread(t_exit) with a spread
curve logged from the platform's own 3-second chain snapshots in the window (spread as a function of seconds-to-close
and |S−K|/sigma).

### 1.5 Closing-window learner: n is records, not sessions (pseudo-replication)

`decide.ts:191,199` gives closing-window records a 20-second TTL and `shouldPersist` (`:226-237`) writes a new record
on expiry or on any state/contract change, so one session yields roughly 30 records from 15:50 to 16:00. The grade sweep
(`market.ts:841-858`) grades every record and folds every grade into the learner. In `closing/learning.ts:109` `s.n++`
is per grade; `:118-123` adds every ladder strike's pattern outcome per record; `:132` applies learned parameters at
`minN: 10`; `:150` trusts a pattern at 20 outcomes. All of those thresholds are reached in one session, from outcomes
that share a single settlement print. The RMS-z used for `seasonalityMultiplier` (`:133-136`) is an average of 30
nearly identical z's. docs/VALIDATION.md and docs/EVIDENCE-LEDGER.md §3b describe this as "10 graded sessions / 20
outcomes per pattern", which the code does not implement. Fix: key the learner by session; fold one grade per session
(the last record before 15:58, or one per sub-window at most), and count pattern outcomes once per (session, strike).

### 1.6 Official settlement never arrives under Schwab; the "last tick" is the first post-close print

`market.ts:865-870` takes the official close from the latest chain's `prevClose`. Only the Cboe adapter sets it
(`adapters/cboe.ts:372`); `parseSchwabChain` (`adapters/schwab.ts:151-207`) never does. With Schwab connected, Cboe is
polled only on Schwab errors (`market.ts:~500`), so official grades, the settlement-gap RMS and the `gapN ≥ 5` branch
of the learner (`learning.ts:144-148`) silently never run. Separately, `lastSpxAtOrAfter` (`market.ts:872-876`)
returns the first quote observed at or after 16:00:00. For `$SPX` that print already contains some closing-auction
constituents and then drifts toward the official value over several minutes, so it is neither the 15:59:59 tick nor
the settlement. `research/scripts/settlement_gap.py` uses a third definition (the 15:59 bar close). Define three
quantities and log all three: `S_1559` = last print with t < 16:00:00, `S_1600` = first print with t ≥ 16:00:00,
`S_set` = official close (from Cboe's settlement page, the next day's `prev_day_close`, or the Schwab `$SPX` quote's
`closePrice` on the next session, which `parseSchwabQuote` already reads at `schwab.ts:144`).

### 1.7 GEX: formula is fine; the universe, filters and interpretation are not

- Formula and units (`gex/gex.ts:171,184,308`): `Γ·OI·100·S` per point and `×S/100` per 1 % match the memo's
  convention. Sign models (`:106-119`) and the trading-time vendor-IV conversion (`:121-128`) are correct. The flip is a
  spot-reprice profile (`:196-204`), which is the right algorithm, but only the nearest root is reported (`:206-217`);
  the memo asks for all roots and the slope at spot, and the regime label at `:318-323` flips to "near-flip" on a 0.25 %
  band without any slope/robustness check.
- Universe is feed-dependent. Schwab chains are fetched with `strikeCount: 60` and `toDate = now + 8 days`
  (`market.ts:467-468`), i.e. ±~2 % of spot and ≤ 8 calendar days; Cboe chains are ±10 % and 95 days
  (`DEFAULT_GEX_CONFIG`, `gex.ts:51-52`). The ±4 % profile grid (`:53`) therefore extends beyond the data under Schwab,
  walls restricted to ±5 % (`:270-271`) see different strike sets, and `totals.net` (the regime label) is a different
  quantity on the two feeds. Either fetch the same window on both feeds or state the universe on the chart.
- No moneyness/liquidity filter. The memo's §2.12 recommends `k_std ∈ [−6, 3]` and dropping zero-bid-zero-volume
  rows; `contractGammas` keeps anything with OI or volume (`:138`) and fabricates `mid = ask/2` when bid is zero
  (`:160`). If the own solve fails it falls back to the vendor IV; for Schwab the convention is "unknown"
  (`schwab.ts:197`) and the value is used as if it were trading-time (`gex.ts:166`), which can inflate gamma on those
  rows by ~2×.
- Interpretation. The default model excludes 0DTE from the signed net, which is the right call. But the regime label
  drives two signals that assume *reversal* in positive gamma: `families.ts:336-337`
  (`continuation = gamma === "negative"`, else fade the day) and `ensemble.ts:173` (`gammaMom = −0.5·m15` when
  positive). Baltussen's Table 7 (memo §5.8) shows β ≈ 0.82 with t ≈ 1.03 when NGE ≥ 0: no predictability, not
  reversal. Since naive NGE is positive on most days (memo §2.3, footnote 8), the afternoon family will mostly be a
  fade-the-day rule with no evidence behind it. Also both use open→now rather than Baltussen's prior-close→15:30
  return and a 15:30→16:00 target.

### 1.8 Expected move and IV near expiry

`features/chain.ts:149` scales the front ATM IV by `sqrt(minutes/390)`; `decisions/summary.ts:45` does the same for
the horizon. Both memos say to use a cumulative intraday variance profile; the flat clock understates the remaining
variance late in the day by roughly 30-40 % (memo §4). Separately, solving IV from mids with T = minutes/98 280 at
15:59 (`chain.ts:62-80`) produces unstable numbers from 0.05-wide quotes; the closing module rightly uses the straddle
directly, but the regime's `rvOverIv` (`regime/regime.ts:94`) and the summary's expected move keep using the solved IV
into the close. Use the straddle (interpolated) as the model-free remaining-move estimate everywhere after ~15:30.

### 1.9 Ranking economics

`ranking/contracts.ts:137-142` exits at Black-Scholes value with the entry IV minus half the *current* spread. Over a
30-45 minute 0DTE horizon the IV is not constant (time-of-day periodicity, memo §6.2) and the spread is not either;
the scenario returns are optimistic. `retOf` (`:143`) charges `2·(commission + fees)` and ignores
`indexFeePerContract` that `payoff.ts:19-21` includes; the harness default `DEFAULT_COSTS` (`payoff.ts:13`) is
$0.75/side while the worker uses $1.35/side (`market.ts:143`), so replay reports are cheaper than the live ledger.
`breakevenWinRate` (`:150`) is the binary target/invalidation formula and ignores the most common outcome, the time
stop at `atFlat`. The sort (`:189-199`) puts `withinBudget` ahead of reward/risk; with `maxPremiumPerContract: 200`
(`context.ts:54`) and SPX near 6 800, a 0.12-0.75-delta SPX 0DTE rarely costs ≤ $200 before mid-afternoon, so under the
native-chain-only ranking (`decide.ts:147-149`) SPX setups will mostly PASS as "no contract within budget" and the
SPY instrument will carry the recommendations. That is a product decision, but it should be explicit: the budget is
the instrument selector.

### 1.10 SPY specifics

- `contracts/series.ts:149-157` puts SPY's expiry instant at 16:00 while `lastTradeMs` (`:124-131`) correctly returns
  16:15. `positions/positions.ts:367,384-386` therefore raises "under 2 minutes to expiration" for SPY at 15:58, and
  time-to-expiry for SPY is 15 minutes short all day.
- Dividends: `q = 0.012` everywhere (`chain.ts:62`, `contracts.ts:84`, `gex.ts:50`). For 0-1 DTE SPY calls the
  thing that matters is the discrete ex-dividend date (third Friday of Mar/Jun/Sep/Dec): ITM calls are exercised early
  the day before, bids collapse to intrinsic, and the "would-have" grade at the bid is wrong on those days. Add the
  ex-dividend calendar to `time/calendar.ts` and flag SPY calls on D−1.
- SPY VWAP is computed with the wrong volume. `market.ts:535` stores the quote's cumulative day volume in the live
  minute bar (comment: "differenced at read time if needed"), history candles carry per-minute volume, `mergeBars`
  (`:543-549`) mixes the two, and `features/bars.ts:93-103` weights by `b.v` as if per-minute. The SPY VWAP level and
  the `vwapSide` vote for the SPY instrument are biased toward late prices. Difference the cumulative volume in
  `appendLiveBar`.
- Physical settlement and assignment are documented as ignored; fine for a decision aid, but the SPY closing-window
  question (16:00 vs 16:15, stock close at 16:00) is a different problem from SPXW and the module correctly does not run
  for SPY (`decide.ts:85`).

### 1.11 Time, calendar and leakage

- Trading-time convention is applied consistently (`pricing/tte.ts`); holidays/early closes 2024-2027 look right;
  DST via Intl; the closing window scales to 12:50-13:00 on half days. `tte.ts:185` counts early-close days between
  now and a later expiry as full days (documented, rare). `isTurnOfMonth` (`ensemble.ts:252-262`) uses weekdays only.
- Leakage guards are sound: `completedBars` (`bars.ts:11-13`), `frameAt` ordered by `receivedAt` (`replay.ts:69-104`),
  `normalizeForReplay` never moves data earlier (`harness/src/load-cboe.ts:13-26`), bars trimmed to completed
  (`:23`). Two caveats: replay relabels DELAYED as REPLAY, and `decide` treats REPLAY as executable, so Cboe
  1-minute snapshots produce "LIVE-like" fills the data cannot support (the report says so, `cli.ts:114`); and
  `closing-replay.ts:22` forces `mode: "LIVE"`, so its feasibility output is not evidence about anything.
- Multi-timeframe (`features/mtf.ts`): bucket alignment to 09:30 is right and the forming bucket is dropped
  (`:37-42`). The trend rule uses the same slope threshold 0.005 %/bar on every timeframe (`:103,131-132`), so the
  30-minute frame is "up" or "down" on a 0.015 % drift over 90 minutes while the 1-minute frame needs 0.005 % per
  minute. Scale the threshold by ATR of the frame (you already compute `strength` that way at `:130`).

### 1.12 Ensemble mechanics (statistics, not design)

- `ensemble.ts:394` uses a linear loss `(1 − v·y)/2`, not Brier on a probability; `:383-389` computes Brier on
  `0.5 + 0.5·score`, which is not a probability. `calibratedProbability` (`:447-451`) returns that same affine map with
  no calibration at all; the name is misleading and the UI will show it after 300 scored predictions.
- Overlap: `market.ts:671-676` makes a 15-minute and a 60-minute prediction every minute for each instrument, and
  `:655-666` applies the updates from both instruments to the same `weights`. SPX and SPY 15-minute returns have the
  same sign ~95 % of the time, so each outcome is counted twice; adjacent 15-minute windows overlap 14/15. The
  effective number of independent 15-minute outcomes per day is ~26, not 780. With `eta: 0.04` per update and
  `decay: 0.998` (`:66`), one day gives a maximal ±(0.04·780) in log-weight before clamping and a decay of
  0.998^780 ≈ 0.21 toward the prior, so the weights are a function of roughly the last session. The unit test's
  "< 5 % per update" bound (`ensemble.test.ts:49-50`) says nothing about a day.
- `burnIn: 300` and `minScoredForProbability: 300` (`:66`) are reached before 11:00 on the first live day.

## 2. Signal design

### 2.1 Inventory and redundancy (35 indicators in `ensemble.ts:68-104`, 9 families in `families.ts`)

Group the votes by what they are functions of:

- Recent-return cluster (one underlying quantity, the last 5-60 minutes of SPX returns): `mom5`, `mom15`, `mom30`,
  `trend60`, `accel`, `expansion`, `tf5`, `tf10`, `tf30`, `tfAlign`, `spyConfirm` (sign-gated `mom15`),
  `crossAgree` (sign of `primaryRet15` times agreement), `gammaMom` (re-signed `mom15`), `tickTrend`, `vixChange`
  (VIX and SPX 15-minute changes correlate about −0.7 to −0.8, so this is another momentum vote), `vwapSide` (SPX has
  no volume, so this is price vs the session's time-weighted mean, i.e. cumulative session momentum), `orSide`,
  `priorClose`. That is 18 of 35 votes with pairwise correlations that will sit well above 0.7 on most days. The
  memo's N_eff (§3.9) is probably 4-6, not 35, and the equal-weight prior is secretly a momentum prior.
- Mean-reversion cluster: `rangeLoc`, `rsi30`, `tickExtreme`, `tickDivergence`, `gapFill`.
- Positioning: `flipSide` (a constant ±0.3 all day), `walls` (±0.5 within 0.3 %).
- Flow: `pcVol`, `optVolTilt` (Cboe-only input).
- Cross-sectional: `breadthRs`, `smallCap`.
- Calendar: `dow`, `tom`, `prevDayRet`, `prevWeek`, `prevClose` (constant for the whole day).
- The one [B]-class intraday signal: `intradayMom` (active last 30 minutes).

Likely noise at the horizons used (15 and 60 minutes): the five calendar votes. The strongest in-sample effect in
`research/results/daily_calendar_study.md` is Monday 2023-2026 at +19 bp/day (n = 181). Spread over 26 fifteen-minute
intervals that is < 1 bp per interval against a 15-minute standard deviation of 20-30 bp; the per-decision
signal-to-noise is ~0.03, undetectable with 10⁴ decisions, and the votes will random-walk in weight. The memo itself
says these are daily-close effects that mostly accrue overnight (§1.8, §9 item 2). Keep them as *features for a daily
horizon* if you want, but not as 15-minute voters. `flipSide` and `pcVol` have no evidence in either memo and
`walls` has only vendor folklore (memo §2.6, §2.10 item 9).

Among the strategy families, `trend-pullback`, `momentum-participation`, `compression-expansion` (triggered branch),
`eod-auction` and the `orb` breakout branch are all "continue the recent move" with different lookbacks; they will fire
together on trend days and their grades are not independent. `afternoon-continuation-reversal` is discussed in 1.7.

### 2.2 What is missing that has evidence

From `ensemble_and_seasonality.md`:
1. The Baltussen/Gao signal defined the way the papers define it: `r_ROD = S(15:30)/S(prev close) − 1` (not open),
   predicting the 15:30-16:00 return, with the weight scaled up on high-|move|/high-volume/macro days (§1.11), and
   gated by the gamma sign only in the "negative → stronger" direction.
2. A remaining-variance clock `s_rem(t)` estimated from the platform's own 1-minute data by half-hour bucket, separately
   for macro and non-macro days (§4), used as (a) the scale for all return-based votes instead of ATR14 and
   (b) the exit-timing variable for long premium (§5 rules 1-2).
3. The straddle-implied expected move as the normaliser for every vote and for the gap-fill null (the summary
   already computes `nullFillProb` at `summary.ts:91`; the `gapFill` vote at `ensemble.ts:168` still votes raw).
4. Osler-style level validation (§2.3): strength scores exist (`features/sr.ts:197-244`) but no level has a measured
   bounce rate against 10 000 random levels; until then the S/R display is a prior, not an estimate.
5. Macro-day flags (CPI/NFP/FOMC/ISM/GDP/PCE with release times) as variance-regime gates; today `events` are
   user-entered only (`market.ts:609`). The memo's §1.4-1.5 is explicit that these are variance, not direction, features.
6. A stress gate (VIX level or 20-day RV quartile) for the opening-hour fade (§1.8).

From `gex_and_literature.md`:
7. For the last 10 minutes, the relevant positioning quantity is charm/digital exposure at the one or two strikes
   bracketing spot, signed by an unknown dealer position (§6.4b, H4), not the all-expiry net. The module already has
   `abs0dte` per strike; add per-strike OI × ∂Δ/∂t for the bracketing strikes and *test* both signs rather than assume.
8. The settlement-gap model (H6) and the σ-calibration test (H5) are prerequisites for everything else in the window.

### 2.3 Hedge updates and burn-in vs best practice

The memo's §7.2 design (fixed decision grid, Brier loss, decayed cumulative loss with half-life ~500 decisions,
η = sqrt(ln n/T) with T the number of *independent* decisions, fixed-share α = 0.01, clamp, and a shrinkage schedule
λ = max(0.3, 1 − T_oos/2000) toward equal weights) is the right template. The implementation keeps the clamp and a
decay-to-prior but drops the grid, the proper loss, the shrinkage schedule and N_eff. The consequence is in 1.12.
Concretely: score at most 9 instants per session per instrument with non-overlapping horizons (9:35, 10:00, 10:30,
11:00, 12:00, 13:00, 14:00, 15:00, 15:30 → the close, plus 15:30 → 16:00 for `intradayMom`); score SPX only (SPY is the
same outcome); use Brier on a calibrated probability; cluster first and Hedge over clusters; keep λ ≥ 0.3.

### 2.4 Preventing overfitting with 35 indicators

- A trial registry: every indicator id, parameter version and first-seen date, including removed ones; compute the
  deflated Sharpe / HLZ t > 3 hurdle against the registry count (memo §3.8). The `inputsDigest` (`decide.ts:190`)
  hashes inputs, not the model version; add an engine/feature version string to every record.
- Fixed, documented gates instead of learned ones (time-of-day, macro flag, stress).
- Freeze hyperparameters before a declared cutoff date; any change is a new trial.
- Report N_eff next to n on the Lean view; grey out anything with n < 100 independent outcomes.
- Never rank or weight by hit rate (improper); Brier for updates, hit rate with Wilson for display only.

### 2.5 Sample sizes before trusting anything (from memo §3.7, translated to this platform's cadence)

- Directional ensemble, 9 independent instants/day: 300 decisions ≈ 33 sessions (to see anything at all); 616 ≈ 70
  sessions to detect 55 % vs 50 % at 80 % power; 1 715 ≈ 190 sessions for 53 %.
- Strategy families: at ~3-5 triggered setups per family per week, 100 graded recommendations per family is 5-8
  months; at that n the Wilson half-width is ±9.6 pp. Pool by family only after checking the families are not the same
  trade (2.1).
- Closing window: one independent outcome per session. The memo's power calculation (§8) says ~200 conditioned
  sessions for a 0.2σ magnet effect; the σ-calibration test needs ~60 sessions for a ±35 % confidence interval on the
  variance ratio; the settlement-gap scale needs ~20.
- The paper P&L test (`docs/VALIDATION.md` "What would change a label") with top-winner share < 40 % needs at least
  100 trades per family to be meaningful given the heavy right tail of 0DTE returns (memo §4.13).

## 3. The 15:50-16:00 strike-flip module

### 3.1 Pattern definitions

`strikeFlip.ts:313-330` maps every directional pattern to "bias = the side spot is currently on": break-hold,
reclaim, failed-cross and rejection all resolve to `li.side`. `accelerating-toward` is the only pattern that bets on
crossing. So the module's directional content is "spot is above K and has been for ≥ 60 s (one minute bar), or spot
bounced off K; therefore settlement > K". Against a market-implied P(S_set > K) that is already ~0.6-0.8 for a strike
2-4 points below spot with 8 minutes left, this has no information beyond what the option price contains unless the
hold/touch statistics predict *excess* probability. That is the test (3.4), and the defaults (`touchTol 0.75`,
`holdMs 60 s`, `pinCrossings 4`) are unmeasured parameters on the wrong time scale (1.3). `pinning → no bias` is the
right default and matches the literature's "anti-cross-pinning or nothing" reading (memo §5.6).

### 3.2 Feasibility rules

Entry delay 8 s, resale requires ≥ 120 s after entry, hard PASS in the final minute and below 60 s
(`strikeFlip.ts:50-66, 262-280, 347-354`) are sensible and conservative. Missing: a spread model by seconds-to-close
(the memo and Beckmeyer et al. note spreads widen near expiry; the platform's own 3-second chain snapshots can
measure this within a week); quote size relative to intended quantity (minSize 5 is fine for 1 lot); and an explicit
statement that the broker's own 0DTE cut-offs are unknown and must be measured on paper fills. `closingWindowLastEntryMinutes`
exists in settings (`context.ts:41,56`) but is never read by the engine.

### 3.3 Resale vs hold; last tick vs settlement

Resale economics are not modelled (1.4). Hold-to-settlement P&L arithmetic is right (`payoff.ts:28-44`, one side of
costs; `strikeFlip.ts:281-285` consistent). The settlement-noise handling double counts (1.2) and the only
measurement that could calibrate it never runs under Schwab (1.6). The provisional grade uses the first post-close
print (1.6). For a hold-to-settlement call 2 points ITM at 15:58 with sigma ≈ 3.8 pt and a settlement gap of
unknown scale, the recommendation's P(ITM) is dominated by exactly the two quantities the platform has not measured.

### 3.4 Fastest measurements and tests (ordered by how quickly they can kill the module)

1. Settlement gap (needs ~20 sessions, no options data): log `S_1559`, `S_1600`, `S_set` daily; report quantiles of
   `S_set − S_1559` and `S_set − S_1600` and their ratio to `sigma_straddle(15:59)`. If the median |gap| exceeds ~1
   point, hold-to-settlement on anything within 2 points of a strike is a coin flip and the sub-window 3:58-3:59
   recommendations should be removed, not tuned.
2. σ calibration (H5, ~60 sessions): at t ∈ {15:50, 15:55, 15:58}, `z_t = (S_set − S_t)/sigma_straddle(t)` with sigma
   solved correctly (1.1). Report Var(z) with a chi-square interval. If Var(z) ≤ 1 the straddle is fair or rich, and any
   "fair value above the ask" from the module's inflated sigma is model error. This single test invalidates the
   current edge definition if it comes back ≤ 1.
3. Excess hit rate vs market-implied (per session, per pattern, ~100 sessions): for every ladder strike with a
   pattern, record realized 1[S_set > K] and the market-implied digital `(C(K) − C(K+5))/5` (or Φ from the
   straddle-implied sigma) at the same instant. The test statistic is mean(realized − implied) with a block bootstrap by
   session. Positive and significant → the pattern carries information; otherwise kill the pattern. This uses data the
   ledger already stores (`closing_grades.body.patternOutcomes`) plus the ladder quotes.
4. Drift (momentum) test: regress `S_set − S_t` on `speed3(t) × remainMin` across sessions. With sigma_rem ≈ 8 pt and
   drift ≈ 1 pt, the standard error on the slope is ≈ 8/sqrt(n), so a slope of 0.5 needs n ≈ 1 000 sessions for
   t = 2. It cannot be learned online in any reasonable time (`learning.ts:137-142` will track noise). Test it instead
   on historical ES 1-second or 1-minute data 2022-2026 pooled across the window, or set `driftPersistence = 0` and
   treat momentum as a displayed scenario.
5. Economic kill switch: paper P&L of the recommended contract at the recorded ask vs settlement, by sub-window, after
   100 recommendations. If the upper 95 % bootstrap bound of mean P&L is below +$10/contract, the module stops
   recommending and keeps measuring.
6. Pattern-stability diagnostic (memo §2.12 item 10): per session, how often `largest0dte`, walls and the nearest root
   change between 15:30 and 15:50. If they change most sessions, the "magnet" concept is not a level.

## 4. Learning honestly

### 4.1 What to log per decision (beyond what the ledger holds now)

- The full raw feature vector (not only non-zero votes, `ensemble.ts:349-350`): returns, ATR, straddle-implied sigma,
  `s_rem(t)`, regime labels, GEX totals under all sign models, cross-market returns, calendar flags, the engine/feature
  version.
- Quotes for every ranked contract at decision time and at each subsequent chain snapshot until the horizon (already
  stored at 30 s / 3 s cadence; make the grade record cite the exact snapshot used for `exitBid`).
- For closing-window records: the ladder quotes (bid/ask/size) for all 9 strikes, the three settlement quantities (1.6),
  the straddle, the solved sigma, and the market-implied digital per strike.
- Per session: the realized per-minute variance profile and the 15:50-16:00 share of daily variance (memo §8 item 7).
- The trial registry and the frozen hyperparameters in force.

### 4.2 What to fit online, and what not to

Fit online (slow, bounded, one observation per independent outcome):
- Calibration: Platt scaling of the ensemble score, `p = 1/(1 + exp(A·logit(p̃) + B))`, fitted by maximum likelihood
  on the trailing 300-500 *grid* decisions, refit weekly, reliability diagram with Wilson bands displayed.
- σ-calibration ratio by time-of-day bucket: `c_b = sqrt(EWMA[(S_T − S_t)²] / EWMA[sigma_t²])` with half-life ≈ 60
  sessions; use `sigma_used = c_b · sigma_straddle` instead of `max(IV, RV × 1.5)`.
- Settlement-gap RMS: `g² = EWMA[(S_set − S_1559)²]`, same half-life; add it to the *realized-vol* sigma only.
- A closing-window spread curve: `halfSpread(τ, m)` for τ = seconds to close, m = |S − K|/sigma, as a lookup table
  updated nightly from stored snapshots.
- Hedge over clusters on the fixed grid: `L_j ← (1 − 1/h)·L_j + (q_j − y)²`, `w_j ∝ exp(−η L_j)`, η = sqrt(ln n / T)
  with T = 2 000 grid decisions (η ≈ 0.04 for n ≈ 25 but applied ~9 times per day, not 780), fixed-share
  `w_j ← (1 − α) w_j + α/n` with α = 0.01, clamp [0.2/n, 5/n], display `w = λ/n + (1 − λ) w_j` with
  λ = max(0.3, 1 − T_oos/2000).

Do not fit online: `driftPersistence` (SNR, 3.4 item 4); `patternTrust` below ~100 independent outcomes per pattern;
per-indicator weights from overlapping predictions or from two instruments; any GEX sign; `familyTrust`
(`grading.ts:267-278`, currently unused, and a multiplier of `1 + avgRet` from 30 trades is noise).

### 4.3 Decay and regimes

Use fixed-share plus a half-life of ~500 grid decisions (≈ 55 sessions) for the ensemble, ~60 sessions for the σ and
gap estimators. Regimes should be hard-coded gates with a citation (time-of-day for `intradayMom`, macro flag for the
variance clock, VIX/RV stress for the opening fade) rather than learned switches; the memo's §7.2 "context gating" list
is enough. Log a change-point diagnostic (rolling Brier vs the equal-weight pool) but do not act on it automatically.

### 4.4 Avoiding the learner chasing noise

One update per independent outcome; shrink to equal weights; never let weights leave the burn-in until the ensemble
beats constant-0.5 and the equal-weight pool on Brier with a block-bootstrap p < 0.05 by session; show n and N_eff next
to every weight; freeze hyperparameters; and keep an economic test as the final arbiter: P&L after a stated spread
model, not Brier.

### 4.5 Validation protocol (what "validated" should require)

1. ≥ 60 LIVE sessions of stored 5-second quotes and 3-30-second chains, with the three settlement quantities logged.
2. Chronological walk-forward with a frozen final 20 sessions; samples grouped by session; one decision per grid instant.
3. Baselines: always-call, always-put, random (matched contracts), no-trade, equal-weight ensemble, best-single-indicator
   in hindsight; SPA test against the registry.
4. Economic evaluation at ask/bid with the measured spread curve and fill-failure rule; cost sensitivity at 1× and 2×.
5. Ablations: GEX on/off, calendar on/off, cross-market on/off, drift on/off, settlement-noise on/off.
6. Report by family, phase, regime; top-winner share; longest losing streak; Wilson intervals; DSR with the trial count.
7. Pre-register H1-H8 from `gex_and_literature.md` §9 with Benjamini-Hochberg at 10 %.

## 5. Top 10 changes, prioritised

| # | Change | Where | Impact | Effort |
|---|---|---|---|---|
| 1 | Fix straddle→sigma: solve the Bachelier straddle for sigma or interpolate bracketing straddles; remove the offset subtraction | `closing/strikeFlip.ts:223-228`, `features/chain.ts:150` | Removes a 15-60 % sigma bias at the core of every closing-window P(ITM) and fair value | Small (20 lines + test) |
| 2 | Redefine closing "edge" against the market (mid / implied digital); drop `max(IV, RV×1.5)`; put settlement noise only on the RV leg; set `driftPersistence` default 0 and show drift as a scenario | `strikeFlip.ts:232-236, 257-258, 301-302, 392-395` | Stops the module recommending buys on model inflation; makes the ledger's "edge" interpretable | Small-medium |
| 3 | De-replicate the learners: one closing grade per session (and per sub-window at most), pattern outcomes once per (session, strike); ensemble scored on a fixed 9-instant grid, SPX only, Brier loss, shrinkage schedule | `closing/learning.ts:109-155`, `market.ts:841-858`, `lean/ensemble.ts:348-410`, `market.ts:655-676` | Turns both learners from one-day noise trackers into something that can converge; makes the documented thresholds true | Medium |
| 4 | Log and use three settlement quantities (`S_1559`, `S_1600`, `S_set`); source `S_set` from the next-day Schwab `$SPX` `closePrice` or Cboe; enable official grades under Schwab | `market.ts:865-876`, `adapters/schwab.ts:151-207`, `research/scripts/settlement_gap.py` | Unblocks the only two measurements (H5, H6) that can validate or kill the module | Small |
| 5 | Feed a 5-second tick buffer into the closing-window path; re-tune `holdMs`/`touchTol` on that scale; make `dataRequirements` true | `decisions/context.ts:99-104`, `decide.ts:91`, `strikeFlip.ts:245`, `market.ts:426-440` | Pattern labels become what the docs say they are | Medium |
| 6 | Make the GEX universe feed-independent (same strike window and horizon on Schwab and Cboe), add the `k_std`/zero-bid filter, report all roots + slope, label 0DTE in per-1σ units | `market.ts:467-468`, `gex/gex.ts:138-141,160,206-217,318-323` | Regime label stops changing with the data source; walls/flip become comparable across days | Small-medium |
| 7 | Correct the positive-gamma branch: no reversal leg in `afternoon-continuation-reversal` and `gammaMom`; use prior-close→15:30 return and a 15:30→16:00 target for `intradayMom` | `strategies/families.ts:329-356`, `lean/ensemble.ts:173, 241-245` | Aligns the one [B]-class signal with its evidence; removes an unsupported fade rule | Small |
| 8 | Replace the flat variance clock with an empirical `s_rem(t)` profile (per macro/non-macro), use it for expected move, vote scaling and exit timing; switch to straddle-implied sigma after 15:30 | `features/chain.ts:149`, `decisions/summary.ts:45`, `lean/ensemble.ts:144`, new feature | 30-40 % error in late-day expected move removed; exits stated in variance units | Medium |
| 9 | Prune/cluster the ensemble: drop the five calendar voters and `flipSide`/`pcVol` from the 15-minute lean (keep as daily features), cluster the momentum block, show N_eff; rename `calibratedProbability` until Platt exists | `lean/ensemble.ts:68-104, 447-451`, Lean view | Honest "n" and no momentum prior disguised as 35 experts | Small-medium |
| 10 | SPY fixes: expiry instant 16:15, ex-dividend calendar flag, difference cumulative volume before VWAP, unify cost defaults between harness and worker | `contracts/series.ts:149-157`, `positions/positions.ts:367,384`, `market.ts:535-549`, `features/bars.ts:93-103`, `contracts/payoff.ts:13` | Correct marks and levels for the instrument that will carry most recommendations under the $200 budget | Small |

Two further items are worth doing but are measurements rather than code: run the settlement-gap and σ-calibration
tests for 20 and 60 sessions respectively before touching any closing-window parameter; and replicate Baltussen's
last-30-minute regression on ES minute data 2016-2026 split at May 2022, because the platform's single best-evidenced
signal may have weakened in the daily-0DTE era (memo §10 item 1) and that is cheaper to learn from history than from
the paper ledger.
