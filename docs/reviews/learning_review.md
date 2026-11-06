# Review: self-learning and validation in predictit

Scope: `packages/engine/src/lean/ensemble.ts`, `decisions/grading.ts`, `closing/learning.ts`, `replay/replay.ts`,
`research/harness/src/*.ts`, `apps/worker/src/market.ts` (evaluate loop, gradeSweep, prediction ledger, weight
persistence), `docs/VALIDATION.md`, `docs/EVIDENCE-LEDGER.md`, `docs/research/ensemble_and_seasonality.md`,
`research/results/*`. Line numbers are from the working tree as of this review (the ensemble and worker files were
edited while I read them; references below are to the post-edit versions).

Summary verdict. The scaffolding is honest: as-of frames, Wilson intervals, "unvalidated" labels, burn-in gates,
hard clamps. The learning logic underneath it is not yet sound, and most of the problems share one root cause:
the unit of learning is a *record* (one every 5 s to 60 s) while the unit of evidence is an *episode* or a
*session*. Every n in the code (burn-in 300, minN 10 "sessions", 20 outcomes per pattern, Wilson n) is therefore
inflated by one to two orders of magnitude relative to what the docs and the research memo assume. Secondary
problems: the ensemble update is a sign-agreement rule, not the Brier/Hedge rule the memo specifies, so it moves
weights ~3x in one session; the closing learner double-counts sessions and calibrates a multiplier that often has
no effect; the grader picks exits with a two-minute look-ahead window. None of this is hard to fix, and the
proposals below reuse the existing tables and harness.

---

## 1. The ensemble update rule

### What the code does

- Votes v_j in [-1, 1] (tanh of return/ATR etc., `ensemble.ts:138, 151-160`), null = unavailable, 0 = "no opinion".
- Lean = sum(w_j v_j) / sum(w_j over available) (`ensemble.ts:295-303`); direction if |score| >= 0.12 (`:308`).
- Predictions every minute at 15 and 60 min (`market.ts:671-675`), now for SPX *and* SPY (`market.ts:648`).
- On resolution (`ensemble.ts:360-410`): y in {-1,0,+1} with a 2 bp flat band (`:377`). For each indicator that
  voted non-zero: loss = (1 - v y)/2, w <- w * exp(-eta (loss - 0.5) * 2) = w * exp(eta v y) (`:394-396`), then
  w <- prior + 0.998 (w - prior) (`:397`), then clamp to [0.25, 3] x prior (`:398`). eta = 0.04 (`:66`).
- Ensemble Brier on prob = 0.5 + 0.5 score, only when |score| >= 0.12 (`:383-389`); per-indicator Brier on
  0.5 + 0.5 v (`:402`).
- Learned weights replace priors after 300 scored non-abstain predictions (`:286`); "calibrated probability"
  after 300 (`:440, 448-451`) and is literally 0.5 + 0.5 score, i.e. not calibrated.

### Findings

1. **Loss is improper and effectively 5-10x hotter than the memo's design.** exp(eta v y) rewards sign
   agreement scaled by |v|. Expected loss (1 - v E[y])/2 is linear in v, so it is minimised by always voting at
   full magnitude: an indicator that shouts is preferred to one that is calibrated. The memo (`ensemble_and_
   seasonality.md:254-259, 460`) specifies Brier for updates; the comment at `ensemble.ts:63-65` claims eta
   follows the Hedge rate for Brier losses, but v y ranges over [-1, 1] (width 2) whereas realistic per-decision
   Brier differences between experts are 0.05-0.1. Observed consequence in `research/results/lean_replay_
   2026-11-06.txt:5-10`: after 55 correlated outcomes on one chop day, vwapSide is at 0.33x prior, mom30 at
   0.36x, gammaMom at 0.56x. The memo's worked example (`:292-298`) says 20 decisions should move an expert by
   ~4%. The code moves it by ~65%.

2. **Decay toward the prior is the wrong strength for the step size.** Per update the pull is 0.2% of the
   deviation (`:397`), the step is up to 4% (`:396`). Half-life of the deviation is ln2/0.002 = 347 updates; with
   2 instruments x 2 horizons x ~0.7 non-flat predictions per minute that is ~2 hours of market time. So the
   weights reflect the last two hours of outcomes, with no steady state reached before the clamp on a trending or
   chopping afternoon. The clamps [0.25, 3] are therefore not "never dominate", they are routinely hit.

3. **Burn-in of 300 is reached in ~2 hours, not ~35 sessions.** `:286` counts scored predictions across horizons
   and (since the SPX/SPY change) instruments. Predictions at every minute with 15- and 60-minute horizons overlap
   almost entirely: consecutive 60-minute predictions share 59/60 of the outcome window. Effective independent
   sample per session is roughly 390/60 ~ 6 at 60 min and ~26 at 15 min, before accounting for the SPX/SPY
   duplication (`market.ts:655-664`: SPY outcomes update the same `weights` object as SPX outcomes, and SPY is
   >0.98 correlated with SPX at these horizons, so every event is counted twice). VALIDATION.md:38 ("learned
   weights after a 300-decision burn-in") and the memo §7.4 ("300 decisions ~ 35 sessions") describe a grid of 9
   non-overlapping instants per session; the implementation does not.

4. **Zero votes dilute but do not learn.** `:296-301` adds w to the denominator when v = 0 (walls "not near a
   wall", expansion, rsi30, tickExtreme, intradayMom outside the last 30 min, gapFill when filled, dow on
   Tue/Wed/Fri, prevDayRet/prevClose/tom off) but `:350` excludes v = 0 from the update. About 10 indicators with
   prior mass ~4.5 of ~22 sit at 0 most of the day, shrinking |score| by ~20% and so shifting the 0.12/0.3/0.5
   strength thresholds. Either treat 0 as abstain (out of the denominator, the sleeping-experts convention the
   update already uses) or treat it as a 0.5 forecast and score it with Brier loss 0.25. Pick one.

5. **Correlated experts are each rewarded for the same event.** mom5/15/30, trend60, accel, tf5/10/30, tfAlign,
   expansion, spyConfirm and gammaMom-under-negative-gamma are ~12 variants of "sign of the recent return".
   Per-expert Hedge updates them independently, so on a trend day all 12 go up together and on a chop day all go
   down together; the lean becomes a momentum vote whatever the priors said. The 26% hit rate at 15 min in the
   replay is this cluster failing in unison.

6. **No per-horizon weights.** `w[id]` is shared by the 15- and 60-minute predictions (`:360-399`). The signal
   structure differs (short continuation, longer reversion), and the ensemble-level stats are already per horizon.

7. **The "calibrated probability" is not calibrated.** `:448-451` returns the raw affine map once n >= 300. The
   gate buys nothing; the number is a score, not a probability.

8. **Silent drops.** Predictions without a price within 2 minutes of dueAt are dropped after 10 minutes with no
   counter (`:371-375`). Data gaps correlate with volatility and feed trouble; count them and show them.

### What I would change (formulas)

Replace per-expert Hedge with an online logistic pool updated by exponentiated gradient on log loss. Keep the
transparent "weight x vote" display.

```
# per horizon h (15, 60), per instrument-independent decision t on a fixed grid (see §5)
A_t        = { j : v_j(t) != null and v_j(t) != 0 }                        # awake experts
s_t        = sum_{j in A_t} w_{h,j} v_j(t) / sum_{j in A_t} pi_j           # normalise by awake prior mass
p_t        = sigmoid(kappa * s_t),  kappa = 2  (fixed, stated on screen)    # raw probability of UP
# on resolution, y in {0,1}, skip flat (|ret| < band)
g_j        = (p_t - y) * v_j(t)                                             # d(logloss)/d w_j up to kappa
w_{h,j}   <- w_{h,j} * exp(-eta * g_j),            eta = 0.1
w_{h,j}   <- pi_j + (w_{h,j} - pi_j) * (1 - 1/H),  H = 500 grid decisions   # forgetting toward the prior
w_{h,j}   <- clip(w_{h,j}, 0.25 pi_j, 3 pi_j)
w_disp    = lambda pi_j + (1 - lambda) w_{h,j},    lambda = max(0.3, 1 - T_indep/2000)
```

Why this and not Hedge-with-Brier: the gradient of a *pooled* forecast contains (p_t - y). Once the pool is
calibrated, E[(p - y) v_j] ~ 0 for every j, so twelve momentum clones stop being rewarded twelve times for one
event; the update learns the marginal contribution, which is what the display claims to show. Per-expert Hedge
can never do this. Log loss is proper; p is clipped to [0.03, 0.97] before scoring. eta = 0.1 with |v| <= 1 and
|p - y| <= 0.97 bounds one step at exp(0.097) ~ 10%, and the typical step (p near 0.5) at ~5%, which is the
"not too much" behaviour the tests at `ensemble.test.ts:49-50` want.

Burn-in and lambda must count *independent* decisions: T_indep = number of grid decisions resolved (not records,
not instruments, not horizons). Burn-in 300 grid decisions at 9 per session ~ 33 sessions, as the memo intended.

Per horizon: yes, two weight vectors, two leans ("15-min lean", "60-min lean"), two Brier lines. It doubles 31
parameters, which is cheap, and it stops a 60-minute reversal from penalising a 15-minute continuation signal.
Consider replacing 60 with 30 or 45 minutes: the strategy horizons are 25-45 minutes (`families.ts:144, 170,
210, 243, 287, 317`) and nothing consumes a 60-minute lean.

Per regime / per time-of-day: not as free parameters at these sample sizes. Keep regime awareness inside the
indicators as hard gates (rangeLoc only in range regime `:162`, intradayMom only in the last 30 min `:236`,
gammaMom conditioned on gamma sign `:173`). If later wanted: hierarchical multipliers w_{h,j,c} = w_{h,j} m_{j,c},
m learned with eta/3, clamp [0.5, 2], contexts c in {open 9:30-10:30, mid, last hour} x {gamma neg, pos}, only
after >= 1000 independent decisions per cell. That is years away; do not build it now.

Correlated indicators (effective n): compute the correlation matrix R of votes over the trailing 500 grid
decisions, N_eff = (sum lambda_i)^2 / sum lambda_i^2 of its eigenvalues, and show "n = 31, N_eff = 9" on the Lean
view. Then either cluster at |rho| > 0.7 and average votes within a cluster (one expert per cluster), or divide
each prior by its cluster size. With the logistic update the clustering matters less for learning, but it still
matters for the *prior* lean, which is what the user sees for the first 33 sessions.

Non-stationarity: the current pull toward the prior is fixed-share toward the prior rather than toward uniform,
which is a fine choice; keep it, but set H in independent decisions (500 ~ 55 sessions) and state it. Abstention
is already handled as sleeping experts (no update when v is null); extend the same rule to v = 0 (finding 4).
Flat outcomes: keep "no update" but count them per horizon (already done at `:405`).

Brier: report the ensemble Brier on *all* predictions with abstentions scored at p = 0.5 (so the constant-0.5
baseline is comparable on the same sample), plus the non-abstain subset separately; report the climatology
baseline as ybar(1 - ybar) on the same sample, not a fixed 0.25; add log loss with clipping as a diagnostic.
Per-indicator Brier on 0.5 + 0.5 v (`:402`) is fine as a display diagnostic but not as a ranking: the votes are
not probabilities, so an indicator with |v| = 1 and 55% accuracy scores 0.45 and looks terrible.

---

## 2. The grading pipeline

### What the code does

`gradeDecision` (`grading.ts:48-113`) grades every persisted CALL/PUT SETUP record at asOf + horizon: p0 = first
path point at or after asOf (`:56`); pH = last path point at or before horizon + 2 min (`:57`); invalidation =
any tick at or beyond the invalidation level (`:63-70`); contract = first eligible at decision time with entry =
its ask then (`:71, :90`); exit bid = the bid in the *last* chain received in [exitAt - 2 min, exitAt + 2 min]
(`:76-83`), else the last chain in the window (`:84-87`); MFE over the window (`:80`). `summarizeGrades`
(`:126-154`) pools everything into one Wilson interval. `gradeSweep` (`market.ts:800-829`) runs every 60 s on
today's records only (`:804`) and inserts one grade per decision id (`:826`).

### Biases

1. **Pseudo-replication: one setup becomes many records.** `shouldPersist` (`decide.ts:226-237`) writes a new
   record when state, primary id, lifecycle, top contract OSI, closing contract, mode or lean direction changes, or
   when the TTL expires (20 s in the closing window, otherwise min(setup expiry, 5 min); `decide.ts:191`). The
   loop runs every 5 s LIVE (`market.ts:156`). The top contract OSI changes whenever spot crosses a 5-point strike
   boundary; the lean direction flips around the 0.12 threshold. One ORB call that stays triggered for 15 minutes
   produces 5-20 records with distinct ids (`decide.ts:194` includes asOf), each graded as an independent trial.
   The Wilson interval at `grading.ts:129` is computed over records, so it is far too narrow, and the per-family
   hit rate is weighted by how long each setup lived. The SPX/SPY change doubles this again: SPY records are graded
   on the SPY path (`market.ts:808-813`) and pooled into the same summary (`market.ts:879-882`).

2. **Exit-bid look-ahead and asymmetric latency.** The exit uses the last chain up to two minutes *after* the
   exit instant (`:76-81`). For invalidation exits that is two minutes after the stop was hit, on a path that is
   by construction moving against the position: pessimistic. For horizon exits it is a random quote within +-2 min:
   noisy. Entry, by contrast, is the ask at decision time with no latency and no slippage (`:90`), while the
   replay harness charges latency 2 s and slippage 0.05 on both sides (`replay.ts:152-156, 177-181`). Grades and
   replay therefore disagree on cost by construction. Use the first chain received at or after exitAt + latency,
   bid - slippage, and the first chain at or after asOf + latency, ask + slippage, mirroring `replay.ts`.

3. **Invalidation definition mismatch.** The families define invalidation as a 1-minute *close* beyond the level
   (`families.ts:142, 168`); the grader tests every tick (`:65`). Tick-touch invalidations are strictly more
   frequent, so `invalidationRate` overstates what the rule would do, and "invalidation-first" exits happen earlier
   and worse than the rule. Grade the rule as written, and record both the tick-touch time and the close-breach
   time for study.

4. **Spot at horizon can silently be the decision spot.** `:57` takes the last path point at or before
   horizon + 2 min with no lower bound. After a feed gap the chosen point can be minutes before the horizon, in the
   limit p0 itself, giving ret = 0 and `directionHit = false` for both directions (`:108` uses strict inequalities).
   Require pH.t >= horizonEnd - 60 s, else leave the record ungraded and count it as "no outcome".

5. **Survivorship in what gets graded.** Only today's records (`market.ts:804`); a record whose sweep is missed
   (eviction, cron gap after the close) is never graded once the ET date rolls. Triggered setups that PASS on
   execution filters (`decide.ts:166-169`) are not graded although the directional signal is identical; this
   selects on liquidity, which correlates with time of day and volatility. DELAYED mode never produces SETUP
   states (`decide.ts:103`), so there are no grades at all on delayed days, fine, but it means the first weeks
   of the ledger will be LIVE-only and short.

6. **Time-of-day and direction confounds.** Direction hit rate is pooled across phases and directions. On an
   up-drifting day every call "hits". The replay harness has matched always-call/always-put/random baselines
   (`cli.ts:26-64`); the live grades have none. Compute, for each graded episode, the matched null: the same
   direction, same entry time, same horizon, and the session's realised drift; report hit rate minus the
   always-same-direction base rate per phase.

7. **Dead code and doc drift.** `grading.ts:54-55` (spot0) does nothing; the record's own decision spot should be
   stored and used. `familyTrust` (`grading.ts:157-168`) is unused outside its test, yet ARCHITECTURE.md:31 says
   family trust is folded into the learners. It is also a poor estimator (1 + mean return clamped; one +300%
   0DTE winner in 30 grades moves it by 0.1). Delete it or replace it with a shrunk median.

### Proposed "decision -> outcome" schema and dedup rule

Add two tables beside `decisions`/`grades` (`market.ts:220-235`). The decision ledger stays insert-only and
unchanged; grading reads from `episodes`.

```
episodes(
  episode_id TEXT PRIMARY KEY,       -- hash(instrument, date, family, direction, round(trigger_level / (0.5*ATR)))
  instrument, date, family, direction, phase, regime_trend, regime_gamma, lean_dir_at_open,
  opened_at INTEGER,                 -- asOf of the first record in the episode
  closed_at INTEGER,                 -- asOf of the last record (NULL while open)
  n_records INTEGER,
  first_decision_id TEXT,            -- the record that is graded
  spot_at_open REAL, spot_source TEXT, spot_quote_age_ms INTEGER,
  horizon_end INTEGER,
  invalidation_level REAL, invalidation_rule TEXT,   -- "close" | "touch"
  target_level REAL,
  contract_osi TEXT, entry_ask REAL, entry_quote_age_ms INTEGER, entry_latency_ms INTEGER, entry_slippage REAL
)
outcomes(
  episode_id TEXT PRIMARY KEY,
  grader_version INTEGER, graded_at INTEGER, provisional INTEGER,
  spot_at_horizon REAL, spot_at_horizon_t INTEGER,       -- must satisfy t in [horizon_end - 60s, horizon_end + 120s]
  ret_underlying REAL, direction_hit INTEGER,
  invalidated INTEGER, invalidated_at INTEGER,           -- by invalidation_rule
  invalidated_touch_at INTEGER,                          -- diagnostic
  exit_reason TEXT, exit_at INTEGER, exit_bid REAL, exit_quote_t INTEGER, exit_quote_age_ms INTEGER,
  pnl_usd REAL, ret_pct REAL, mfe_bid REAL, mae_bid REAL,
  null_same_dir_hit INTEGER                               -- always-this-direction at this time/horizon
)
```

Dedup rule (episode boundary): a record joins the open episode with the same (instrument, family, direction) if
it arrives before the episode's horizon_end and its invalidation level is within 0.5 ATR of the episode's;
otherwise a new episode opens. Only `first_decision_id` is graded; the rest are provenance. For the ensemble the
same principle applies in a simpler form: predictions are made on a fixed grid (every 15 minutes for the 15-minute
horizon, every 30 or 60 for the longer one), so no two scored predictions share an outcome window. Keep the
per-minute lean for display; score only the grid.

Reporting unit for every Wilson interval, bootstrap and burn-in counter becomes `episodes`, with `n_records`
shown beside it so the user sees "41 episodes from 612 records".

---

## 3. The closing-window learner

### What the code does

Each closing record (every 20 s from 15:50, `decide.ts:191`) is graded against the last SPX print after the close
(provisional) and against the next session's `prevClose` (official) (`market.ts:832-861`). `updateClosingLearner`
(`learning.ts:107-158`) increments n per grade (`:109`), accumulates z^2 (`:110`), a through-origin regression of
realised move on assumed drift (`:112-113`), official-minus-last-tick gap^2 (`:114-117`), pattern hits for every
ladder strike (`:118-123`), then after n >= 10 nudges seasonalityMultiplier toward base x RMS(z) (`:133-136`),
driftPersistence toward base x slope (`:137-142`), settlementNoisePts toward RMS gap after 5 gaps (`:144-148`),
and pattern trust from Wilson bounds after 20 outcomes (`:149-155`).

### Findings

1. **n counts records, not sessions.** The config comment says "minimum graded sessions" (`:98`) and VALIDATION.md:
   36-37 says "after 10 graded sessions / 20 outcomes per pattern". One session's window has up to 30 records
   (10 min / 20 s), more when the recommendation flips. All thresholds are met on day one. The z's within a
   session share the same settlement and nearly the same spot, so RMS z is a one-session number.

2. **Sessions are folded twice.** On day d the provisional grade is folded (`market.ts:855` passes because no
   official row exists yet). On day d+1 the official grade is folded again (`official` true). Nothing subtracts the
   provisional contribution; the comment at `:853-854` describes a replacement that does not exist. n, sumZ2 and
   the pattern counts are doubled with two slightly different settlements.

3. **The seasonality multiplier is not identified.** It only scales the realised-vol branch (`strikeFlip.ts:232`)
   and sigma_used = max(sigma_iv, sigma_rv) (`:233`). Whenever the straddle-implied branch is binding, changing the
   multiplier changes nothing, yet the learner keeps pushing it toward base x RMS(z) until it hits 3, at which
   point the RV branch suddenly takes over. Also z is (settlement - spot)/sigma_used (`learning.ts:51-52`) with the
   drift *not* subtracted, so a biased drift inflates sigma.

4. **RMS on heavy tails.** Closing-auction moves are fat-tailed (index rebalances, MOC imbalances). RMS z and RMS
   gap are dominated by a handful of sessions; `step: 0.2` toward a clamped RMS does not fix that.

5. **"Last tick" is the first print after the close.** `lastSpxAtOrAfter` (`market.ts:872-877`) takes the first
   quote with observed_at >= 16:00:00, which already contains closing prints; the gap official - lastTick is
   understated. The quantity a trader could act on is the last print before 16:00:00.

6. **Pattern hit rate vs 50% is the wrong null.** A break-hold with spot 2 pts above the strike and 8 minutes
   left already has P(settle above) ~ 0.7 from the sigma model alone. Comparing the hit rate to 0.5 credits the
   pattern with the position. And each record contributes a pattern outcome for every ladder strike (`:53-55`),
   all resolved by one settlement.

7. **Trust is applied as minEdge / trust** (`strikeFlip.ts:388-392`). With trust in [0.5, 1.5] this halves or
   raises the edge hurdle by 50% on a Wilson bound that, given finding 1 and 6, is meaningless.

### Better estimators

Unit of learning: one session per (sub-window, pattern, strike). Recompute the learner state from the
`closing_grades` table on every sweep (prefer official rows, fall back to provisional), rather than accumulating
in place. That removes the double fold and makes the learner idempotent and replayable.

Sigma profile. Replace the single multiplier with an empirical remaining-move profile by minutes-to-close.
For each session and each m in {10, 8, 6, 4, 3, 2, 1, 0.5} record x_m = settlement - S(16:00 - m). Keep per-m
robust scale sigma_hat(m) = median(|x_m|)/0.6745 and the empirical quantiles q50, q80, q95 of |x_m|. Use

```
sigma_used(m) = sqrt( (k(m) * sigma_ref)^2 + noise^2 ),   k(m) = sigma_hat(m) / sigma_hat(10)
```

where sigma_ref is the straddle-implied sigma at the record (`strikeFlip.ts:224-227`) and k is the learned
shape, shrunk toward sqrt(m/10) (the flat-clock prior) with weight n/(n + 30): k = (n k_emp + 30 sqrt(m/10))/(n+30).
The ratio form is scale-free so it survives vol-regime changes; the quantiles are shown next to the model so the
user can see the tails directly. Calibration check per bucket: share of |z| <= 0.674 (target 50%) and <= 1.645
(target 90%), with Wilson bands.

Settlement noise. noise = 1.4826 x median|official - last_pre_16:00 print| over sessions, shrunk toward 1.5 pts
with weight n/(n + 20); also keep the 90% quantile and flag rebalance/expiry days separately. `research/scripts/
settlement_gap.py` already computes the raw gap; make its CSV the source for this parameter rather than the DO's
running sums, and use the 15:59 bar close as the pre-close reference, not the first post-close print.

Drift persistence. Fit realised = beta x (speed3 x remainMin) + e across sessions (one observation per session per
sub-window, using the record closest to the sub-window midpoint), with ridge shrinkage toward beta = 0 and HC
standard errors; apply drift = beta_shrunk x speed3 x remainMin only when the 90% CI excludes 0, else 0; cap
|drift| <= sigma_used. The literature prior for last-minute momentum is weak and sign-dependent, so the prior is 0,
not the current 0.5 (`strikeFlip.ts:62`).

Pattern trust. Score each pattern by its information beyond the sigma model: r = mean over sessions of
(hit - pCloseAbove_model) and its bootstrap CI; trust = 1 + clip(r_shrunk, -0.25, +0.25) with r shrunk toward 0
by n/(n + 30). This is a calibration residual, so the position of spot relative to the strike is already accounted
for.

Minimum data before any learned closing parameter replaces a default: 30 sessions for the sigma profile and
noise, 60 for drift and per-pattern trust (a 10-pp calibration residual needs ~60 sessions to clear a 90% CI).
Until then display the measured statistics with their n and keep the defaults.

---

## 4. Calibration and reporting

What is shown now: direction hit rate with a Wilson band (`apps/web/src/components/Grades.tsx:22`), per-family hit
and average return (`:56-57`), per-horizon hit rate with Brier vs 0.25 (`views/Lean.tsx:166`), "calibrated
probability: withheld" (`:168`), per-indicator weight vs prior and hit rate (`:201-209`). This is better than most
retail tooling, but it will still be over-read, for four reasons: the n is records, the baseline is 50%, the
average return is a heavy-tailed mean, and the Brier is on a confidence-selected subset.

Show, in this order, on both Grades and Lean:

1. n as episodes (grid decisions), with records in parentheses; the number of sessions covered; the count of
   dropped/ungraded outcomes.
2. Base rates on the same sample: the always-call and always-put hit rate at the same instants and horizons, by
   phase; the session drift. Display "hit 58% vs 54% for always-call at these times" rather than "58%".
3. Brier skill score BSS = 1 - BS/BS_clim with BS_clim = ybar(1 - ybar) on the same sample, with a block-bootstrap
   90% interval (blocks = sessions). A single Brier number next to "0.25" invites "below 0.25 = skill"; the
   interval and the climatology do not.
4. Log loss (clipped) as a second proper score; the hindsight-best single expert's Brier (Hedge regret) so the
   user sees whether the pool is better than its best member.
5. Reliability: 5 bins of the raw p (not score), each with observed frequency, n, Wilson band; the expected
   calibration error. Grey-out below 30 episodes per bin.
6. Returns: median, trimmed mean (10%), net expectancy with a session-block bootstrap interval, full-loss share,
   top-winner share (VALIDATION.md:52-53 already names the 40% rule; show it live), and the break-even slippage.
7. The multiple-testing haircut: number of registered trials (indicators + families + exit variants), and the
   deflated statistic (§5).
8. The minimum-detectable-effect line that `ensemble.ts:443` already prints; keep it.

When a calibrated probability may be displayed. Fit Platt scaling p = sigmoid(a p_raw_logit + b) prequentially:
the probability shown at t uses parameters fitted on grid decisions resolved before t (trailing window 300-500
independent decisions); never on the same decisions the weights learned from in the same window is not achievable
online, so use the prequential test instead. Display p when all of: (a) >= 300 resolved grid decisions for that
horizon and instrument; (b) prequential BSS > 0 with the bootstrap lower bound > -0.02; (c) ECE over 5 bins
< 0.05; (d) each bin used has n >= 30. Otherwise show "no skill detected (BSS x, CI [lo, hi])" and no number
above 50%. Always print the band from the calibration window beside the probability. Replace
`calibratedProbability` (`ensemble.ts:448-451`) with this; the current function should not ship under that name.

---

## 5. Experiment protocol

The harness (`research/harness/src/cli.ts`) replays days through `runReplay` with explicit slippage, latency and
size rules (`:96`), runs matched baselines (`:26-64`) and writes a markdown report (`:115-118`). `lean-replay.ts`
exercises the online weight update over one day from fresh priors (`:15`), so multi-day learning is not tested.
Replay calls `decide` without weights (`replay.ts:167`) so the lean in replay is always the prior lean; since the
lean never enters, trades are unaffected, but the ensemble's economic test (memo §7.4 step 3) is not run anywhere.

Protocol:

1. **Split.** Accumulate sessions; the final 20 sessions (or 25%) are declared the untouched test period in a
   dated note before anyone looks at them; `cli.ts` gets `--train A..B --test C..D` and refuses to print test
   results unless `--unlock-test` is passed with a reason that is written into the report header.
2. **Day-grouped CV on the train part.** Blocks of 5 sessions, leave-one-block-out, with a 1-session embargo on
   each side (horizons are < 1 h so one session is ample). Everything learnable (ensemble weights, closing
   parameters, any threshold anyone tunes) is fitted on the train blocks and frozen for the held-out block.
3. **Multiple-testing control.** Write `research/registry.json`: every indicator (31 in `INDICATORS`), every
   family (9), every exit-rule and parameter variant ever replayed, with first-seen date and status. With ~45
   registered trials the expected maximum |t| of pure noise is ~2.3. Test families and the ensemble as a set with
   Hansen's SPA / Romano-Wolf stepdown using a stationary block bootstrap of daily P&L (block = 1 session, 2000
   resamples) against the no-trade benchmark and against the matched random baseline; report the deflated Sharpe
   with N = registry count and the observed skew/kurtosis; BH FDR at 10% for screening only. A family with t < 3
   (HLZ) stays "unvalidated" whatever its raw hit rate.
4. **Ablations**, each a replay run with a settings flag: gex off (gammaMom/flipSide/walls null, GEX regime
   unknown), calendar off, TICK off, momentum cluster only, mean-reversion only, ensemble priors vs learned vs
   equal weights, closing module with and without drift, with default vs learned sigma. Report the delta in net
   expectancy with its bootstrap interval; an ablation that does not move the interval is a feature to remove.
5. **Cost sensitivity grid**: slippage {0, 0.05, 0.10, 0.20}, latency {1, 2, 5, 10 s}, requireSize {on, off},
   fees {default, +50%}; show per-family break-even slippage. The 0DTE literature says costs decide the sign, so
   this grid is the headline table, not an appendix.
6. **Economic test of the lean**: a `lean-trade` mode that buys the nearest-OTM 0DTE in the lean direction on the
   grid when p >= 0.58 and holds to the horizon with the replay's fill rules; compare with always-call/put/random
   on the same instants. This is the only test that converts Brier into dollars.
7. **Baselines** must be re-seeded (`cli.ts:26` seed = 7 fixed): run 200 random seeds and report the random
   strategy's distribution, so "engine beats random" is a percentile, not a comparison with one draw.

Running it with the existing code: `runReplay` already accepts `settings` and `only`; add an `ablate` set to
`EngineSettings` consumed in `buildContext`, add `weights`/`closingSettings` pass-through to `decide` in
`replay.ts:167` so learned state can be injected and frozen, make `lean-replay.ts` carry weights across days and
accept `--freeze-after <date>`, and have `cli.ts` emit a JSON sidecar per run so a small Python script in
`research/scripts` can do the bootstrap/SPA/DSR arithmetic. Everything else is report plumbing.

Data still missing: more than one partial delayed day (`research/results/replay_2026-11-06_2026-11-06.md`);
official settlement values joined to intraday paths (`settlement_gap.py` exists, no CSV yet); 15:50-16:00 quotes
at a few seconds' cadence (the DO stores every tick in the window, `market.ts:594`, but only once Schwab is
connected); NYSE TICK history (live-only); ES; prior-day bars on delayed days (calendar features report coverage
< 2, `context.ts:122`); an economic-events file; OPRA NBBO for fill realism in the closing window; the registry
file itself.

---

## 6. Top 10 improvements, ordered by value / effort

1. **Grade episodes, not records** (`decisions/grading.ts`, `apps/worker/src/market.ts:800-829`). Add the
   `episodes`/`outcomes` tables and the 0.5-ATR boundary rule from §2; make every n, Wilson band and burn-in
   counter count episodes. Low effort; removes the largest bias in the system.
2. **Fix the closing learner's double fold and per-record n** (`closing/learning.ts:107-158`,
   `market.ts:850-858`). Recompute state from `closing_grades` with official preferred, one unit per session per
   sub-window; fix "last tick" to the last pre-16:00:00 print (`market.ts:872-877`). Low effort.
3. **Put ensemble predictions on a fixed grid and separate instruments/horizons** (`lean/ensemble.ts:348-352`,
   `market.ts:671-675`). Score only grid instants (15-min grid for the 15-min horizon, 30- or 60-min grid for the
   other); SPY predictions do not update SPX weights (either drop SPY from learning or give it its own vector);
   per-horizon `w[h][id]`. Burn-in and `minScoredForProbability` in grid decisions. Low effort.
4. **Replace the sign-agreement update with the logistic/EG rule of §1** (`ensemble.ts:383-404`), treat v = 0
   as abstain in the denominator (`:296-301`), add the lambda display shrink, count dropped predictions. Medium.
5. **Mirror the replay's fill model in the grader** (`grading.ts:56-90`): entry at the first chain after
   asOf + latency plus slippage, exit at the first chain after exitAt + latency minus slippage, invalidation by
   the family's rule (bar close), pH constrained to the horizon window. Low effort.
6. **Sigma profile, robust noise and shrunk drift for the closing module** (`closing/strikeFlip.ts:231-236`,
   `closing/learning.ts`, `research/scripts/settlement_gap.py`): the quantile profile and ridge drift of §3 with
   30/60-session gates. Medium.
7. **Reporting** (`apps/web/src/components/Grades.tsx`, `views/Lean.tsx`, `ensemble.ts:428-451`): episodes vs
   records, matched base rates, BSS with block-bootstrap bands, reliability bins, N_eff, trimmed/median returns,
   top-winner share; rename or remove `calibratedProbability` until prequential Platt passes the §4 gates. Medium.
8. **Registry and deflation** (`research/registry.json`, new `research/scripts/deflate.py`, `cli.ts`): list every
   trial with its first-seen date; DSR and SPA against the registry count from the replay JSON. Low effort for
   the registry, medium for SPA.
9. **Walk-forward command** (`cli.ts`, `replay.ts:167`, `lean-replay.ts`): train/test split with a locked test
   period, day-grouped CV with embargo, ablation flags, cost grid, re-seeded baselines, JSON output. Medium-high;
   worth it only once 30+ sessions exist, but the flags should be in place before the data arrives so nothing is
   tuned by hand in the meantime.
10. **Effective-n and clustering of votes** (`ensemble.ts:140-250`, `views/Lean.tsx`): correlation matrix on the
    trailing window, N_eff on screen, cluster-averaged momentum vote for the prior lean. Medium; mostly affects
    what the user sees during burn-in.

Housekeeping while in those files: delete `spot0` (`grading.ts:54-55`); delete or fix `familyTrust`
(`grading.ts:157-168`) and ARCHITECTURE.md:31; correct VALIDATION.md:36-38 and `learning.ts:98` to say what the
counters actually count until items 1-3 land.
