# Evidence ledger

Every claim the platform relies on is filed under exactly one heading. Items move down this list only when the
replay harness or the prospective paper ledger produces the evidence. Sources with access dates are in
`docs/research/`.

## 1. Established market mechanics (verified from primary sources, 2026-11-06)

- SPXW (PM-settled) contracts expiring today stop trading at **16:00:00 ET** (13:00 on early-close days); non-expiring
  SPX series trade to 16:15 plus a curb session; settlement = official S&P 500 close computed from constituent
  closing-auction prices, published after 16:00 — it is not the 15:59:59 tick. (contracts.md §1, §5)
- Standard SPX (3rd Friday) and the new **SPXO** weekday series (launch 2026-11-09) are **AM-settled to SET** and do
  not trade on their expiration day; the same date can list SPX, SPXO and SPXW — settlement is keyed by root.
- SPY options are American, physically settled, expire every weekday, and trade to **16:15 ET** including expiration day.
- Multiplier 100 for all; SPX ticks $0.05 under $3 / $0.10 above; 0DTE SPXW strikes at 5-point spacing near spot.
- Holidays/early closes 2026–2027 encoded in `packages/engine/src/time/calendar.ts`; DST handled by Intl.
- Schwab Market Data: 120 requests/min, access token 30 min, refresh token 7 days (manual re-login), callback must be
  HTTPS; streaming needs the Accounts and Trading product. (schwab.md)
- NYSE MOC/LOC cutoff 15:50, D-order cutoff 15:59:50; Nasdaq MOC 15:55 / LOC 15:58, NOII every second from 15:55;
  Arca (SPY) closing freeze 15:59. Imbalance feeds are not available from the connected sources. (brokers_and_auction.md)
- Fees (Nov 2026): Schwab $0.65/contract + SPX pass-through (~$0.36–0.45 Cboe + $0.025 OCC + $0.0125 ORF); default
  cost model uses $0.65 + $0.70 per contract per side.

## 2. Research hypotheses (published or practitioner; not yet tested on our data)

- Dealer-gamma sign conditions intraday momentum (Baltussen et al. 2021): negative gamma → continuation; positive →
  reversion. The `gammaMom` indicator votes both ways with a low prior weight. The afternoon strategy family acts
  only under negative gamma (continuation of the prior-close-anchored move); the positive-gamma reversal half was
  removed from the family after the quant review because the published effect is weaker and our sign inference for
  0DTE-heavy days is the least reliable part of the chain (see `naive-ex-0dte`).
- Naive OI-sign GEX is least reliable for 0DTE (Cboe 2023/2025 flow reports show balanced customer flow); default
  model therefore excludes 0DTE from the signed net (`naive-ex-0dte`) and shows a sensitivity table.
- Buying 0DTE has negative expected return and a heavy right tail; OTM calls worst; costs dominate retail losses
  (Beckmeyer et al.; Cboe). Consequence: PASS/abstention is the default state; contracts are ranked after costs.
- Intraday momentum (first hours → last hour; Gao et al.) — small, decaying effect; `intradayMom` indicator.
- Pinning for cash-settled index options is weak/absent in the literature; the closing module treats repeated
  crossings as "pinning: no directional edge".
- NYSE TICK as participation: persistently signed 10-minute TICK marks broad participation (continuation); readings
  beyond ±1000 mark exhaustion; price moving without TICK support reverts. Practitioner folklore ([C]); three ensemble
  indicators, the regime's participation label and the momentum-participation family use it; weights adapt prospectively.
- Cross-index confirmation: agreement of the NDX / RUT / DJI (and QQQ / IWM) 15-minute signs with the analysed index,
  equal-weight vs cap-weight breadth (RSP vs SPY), small-cap lead and the VIX change feed three ensemble indicators and
  the regime's participation label when no TICK feed exists. Practitioner evidence only ([C]); low prior weights;
  signs only — no level is ever derived from another instrument.
- SPX and SPY are analysed natively, each from its own quote, bars and chain. SPX↔SPY ratio arithmetic is not used
  anywhere: the two diverge intraday (dividends, ETF premium/discount, 16:00 vs 16:15 trading) and the evidence for one
  does not transfer to the other. Each instrument has its own decision ledger ids, predictions and grades.
- Daily calendar effects from our own in-sample study (research/results/daily_calendar_study.md): Monday positive
  2023–2026 (n=181), mild next-day reversion after ±1% days, stronger weeks after down weeks — low prior weights.

## 3. Implemented but unvalidated strategies (all of them, as of 2026-11-06)

trend-pullback, orb, range-rejection, compression-expansion, level-reclaim-reject, momentum-participation,
afternoon-continuation-reversal, eod-auction, strike-flip (closing window), and the market-lean ensemble.
Each has precise definitions in `packages/engine/src/strategies/families.ts` and `closing/strikeFlip.ts`, replays
without hindsight, and reports results in `research/results/`. None may be called profitable.

## 3b. Continuous self-grading (how "unvalidated" turns into evidence)

- Every CALL/PUT SETUP is graded at its horizon (underlying move, invalidation-first exit, the recommended contract's
  would-have return: entry at the first ask seen ≥ 2 s after the decision plus 0.05 slippage, exit at the bid at or
  before the exit instant minus slippage; `provisional` while the horizon price is stale); summaries by family with
  Wilson intervals are shown on Performance. Repeated ticks of the same setup within 5 minutes form one episode, so a
  setup that persists for 20 ticks counts once, not twenty times.
- Every closing-window record is graded at settlement, provisionally against the last SPX print and then against the
  official close (the next session's `prev_day_close`); per-pattern hit rates, per-sub-window P&L, σ calibration
  (RMS z), drift persistence and the official-close-vs-last-tick gap feed bounded parameter updates
  (`packages/engine/src/closing/learning.ts`). The learner is rebuilt from one record per session (the record nearest
  15:56, official grade preferred) so a session with many closing records is still one sample; parameters move only
  after 30 graded sessions.
- The ensemble scores its own directional predictions at 15 and 60 minutes (one prediction set per instrument on a
  5-minute grid) and adapts weights within clamps [0.25×, 3×] of the prior with decay toward the prior; prior weights
  are used until 600 predictions have been scored; per-family weight caps stop many momentum indicators from acting as
  one large vote. Brier skill against the session climatology (BSS) is reported on Lean.

## 4. Out-of-sample findings

None yet. Required before any strategy is labelled validated: ≥ 60 trading days of as-of data, chronological
walk-forward with an untouched final period, day-grouped samples, costs/slippage/fill-failure modelled, comparison
against always-call / always-put / random / no-trade, and ablations (GEX, flow, calendar features).
