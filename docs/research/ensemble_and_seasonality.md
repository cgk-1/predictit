# Research memo: a transparent, adaptive directional "market lean" ensemble for an SPX/SPY intraday options tool, and the calendar/seasonality features it should condition on

Prepared 2026-11-06. All URLs were accessed on 2026-11-06 unless stated otherwise.

## 0. How to read this memo (scope, method, labels)

**Labels on every claim**

- **[A]** established mechanics: contract specifications, release schedules, closed-form results, algorithm statements with proofs.
- **[B]** published empirical finding, with the sample period and the effect size the source actually reports.
- **[C]** practitioner folklore or hypothesis: plausible, widely repeated, but not (or not verifiably) established in the sources reached here.

**Method and its limits (please read).** The shared web-search budget for this session was exhausted before this task began, so this memo was built *without* any web-search calls. Every source below was reached by fetching a URL I already knew (arXiv, FRBNY, NBER, Cboe, CME, BLS, Fed, JMLR, Theory of Computing, GitHub, Wikipedia) or by resolving a DOI through the Crossref and OpenAlex metadata APIs (which return the publisher's abstract) and, for a few Elsevier papers, the Semantic Scholar DOI endpoint. Consequences:

1. SSRN (403), ScienceDirect, Wiley, Taylor & Francis and PM-Research (403) blocked direct page fetches. Where only the title could be verified through Crossref, the entry says **"title verified; abstract not opened"** and the claim is limited to what the title and widely cited summary support, labelled accordingly.
2. Three primary PDFs were downloaded and parsed locally in full text: Lucca–Moench (FRBNY SR 512), Boyarchenko–Larsen–Whelan (FRBNY SR 917, "The Overnight Drift"), Osler (FRBNY EPR 2000), plus the SqueezeMetrics GEX white paper, Arora–Hazan–Kale (MWU survey), Niculescu-Mizil–Caruana (calibration), Hoeting et al. (BMA tutorial) and Zinkevich (OGD). Numbers quoted from these are from the documents themselves.
3. Some things I could not reach: reputable gap-fill statistics blogs (bot-walled), the 0DTE academic literature hosted only on SSRN (Beckmeyer–Branger–Gayda; Dim–Eraker–Vilkov; Brogaard–Han–Won), Timmermann's chapter text (UCSD host returned 503), Birru (2018) abstract. These are flagged in "Uncertainties" rather than paraphrased from memory.
4. Where a number comes from my own computation (binomial confidence intervals, random-walk gap-fill baseline, Black–Scholes 0DTE decay profile), it is labelled **[A, computed here]** and the formula is given so it can be reproduced.

**Bottom line up front.**

- The *only* intraday-horizon return regularities in S&P 500 index products with peer-reviewed, post-2015 evidence and economically meaningful size are: (i) the last-30-minute continuation of the rest-of-day move ("market intraday momentum"), which Baltussen et al. tie to gamma hedging and show across 60+ futures 1974–2020 [B]; (ii) the scheduled-macro-announcement premium (Savor–Wilson; Ai–Bansal), which is mostly earned *before* and *overnight into* the release, not intraday after it [B]; (iii) the overnight/intraday asymmetry (overnight positive, intraday roughly flat-to-negative) and its 2:00–3:00 ET concentration [B]; and (iv) turn-of-the-month returns, which survive out-of-sample through 2005 in McConnell–Xu [B] but have no clean post-2015 SPX-intraday test I could reach.
- The pre-FOMC drift (49 bp in the 2pm-to-2pm window, Sept 1994–Mar 2011) is the single most-cited calendar effect, and the best post-sample evidence says it **essentially disappeared after 2015** [B]. Treat it as a regime-conditional feature, not a standing lean.
- Day-of-week and pre-holiday effects in large-cap indices are, on the evidence reachable here, dead or too small to trade after costs since roughly 1990 [B/C]. Keep them as *features the ensemble can learn to ignore*, not as priors.
- Support/resistance has real but modest evidence: in FX, published S/R levels produced a 60.8% bounce rate versus 56.2% for arbitrary levels (Osler 2000, 1996–98) [B]; round-number barriers exist in the DJIA (Donaldson–Kim 1993) [B]; S&P futures trade prices cluster at .00/.50 [B]; expiration-day pinning at strikes has peer-reviewed evidence in single stocks and S&P futures [B]. The honest effect size is "a few percentage points above a ~55–60% base rate of *something* reversing at *any* level," which is why validation must compare to random levels.
- For combining many weak indicators: use Hedge/multiplicative weights (or exponentiated gradient on log loss) with a *small, capped* learning rate, strong shrinkage toward equal weights, fixed-share forgetting for regime change, Brier/log-loss scoring, held-out calibration (Platt below ~1,000 samples), and binomial confidence intervals that are *not hidden*. With n=100 trades you cannot distinguish a 58% hit rate from a coin flip at the 5% level; with n=300, 54.7%; with n=1000, 52.6% [A, computed here].
- Expected move: the 0DTE ATM straddle mid-price *is* the market's risk-neutral E|S_close − S_now| [A]. Use it directly; scale the remaining-session variance with an intraday U-shape estimated from your own 1-minute data, not with calendar time [A/B].
- Long-premium exits: under Black–Scholes with a flat intraday clock, a 0DTE ATM option retains only 39% of its value at 3:00 pm and 28% at 3:30 pm [A, computed here]; the U-shape pushes the decay later but makes the last 30 minutes steeper. Every "when to sell" heuristic should be stated as a testable rule on (remaining-variance fraction, realized-move/expected-move ratio), not on clock time alone.

---

## 1. Calendar and seasonality effects relevant intraday (S&P 500 / SPX / ES)

### 1.1 Day-of-week (Monday / Friday), and the 2022+ daily-0DTE era

- **[B] Original evidence (pre-1990).** Lakonishok & Smidt (RFS 1988), 90 years of DJIA daily data (1897–1986): "persistently anomalous returns around the turn of the week, around the turn of the month, around the turn of the year, and around holidays." https://doi.org/10.1093/rfs/1.4.403 (abstract via Crossref, accessed 2026-11-06).
- **[B] Cross-sectional, modern.** Birru (JFE 2018), "Day of the week and the cross-section of returns," https://doi.org/10.1016/j.jfineco.2018.06.008 — title verified via Crossref; abstract not opened (Semantic Scholar 404/429). Do not rely on it for *index-level* direction; its subject is the cross-section (speculative vs. safe stocks).
- **[B, secondary] Decline of calendar effects.** Quantpedia's summary of Hansen & Lunde, "Testing the significance of calendar effects," reports that for the DJIA and broad/large-cap indices, calendar effects (day-of-week included) are "largely absent after the late 1980s or early 1990s," with small-cap effects more robust (https://quantpedia.com/strategies/pre-holiday-effect/, accessed 2026-11-06). The underlying working paper was not opened.
- **[A] The 0DTE-era structural change.** Cboe's own history: SPX Weeklys with Friday expirations in 2005; Wednesday and Monday Weeklys in 2016; "By 2022, Cboe had listed an SPX Weeklys option with an expiration for each day of the week" (Doar, Cboe Insights, 2023-08-03, https://www.cboe.com/insights/posts/the-evolution-of-same-day-options-trading). 0DTE share of SPX volume: ~5% in 2016 → >40% after Tue/Thu expiries → ~50% in Aug 2023 (Xu, Cboe Insights, 2023-09-08, https://www.cboe.com/insights/posts/volatility-insights-evaluating-the-market-impact-of-spx-0-dte-options/); Cboe's 0DTE product page shows 59% of SPX volume (undated, accessed 2026-11-06, https://www.cboe.com/tradable-products/0dte); Cboe's Q3 2026 industry note reports 0DTE index-options ADV of 3.4m contracts = 56% of index flow (Schwartz, 2026-10-19, https://www.cboe.com/insights/posts/state-of-the-options-industry-q-3-2026-volume-growth-concentrated-in-index-and-etf-options).
- **[B] Does daily expiration create a new day-of-week return pattern?** No peer-reviewed evidence reached here. Cboe's analysis (Xu 2023) finds *no* increase in intraday-vs-close-to-close realized-vol spread (2.7 vol points YTD 2023 = 10-year average) and no increase in 2-sigma one-minute moves including in the last hour; net market-maker gamma is small relative to ES liquidity (0.04–0.17% of daily futures liquidity on average; 3:30 pm median +$173mm; 25th–75th percentile −$1.1bn to +$2.4bn; extremes −$5bn to +$7.7bn = 1.3–1.9% of daily ES notional). These are exchange-produced, not peer-reviewed, and Cboe has an interest in the conclusion; label **[B, exchange research]**.
- **[C] Practitioner claims** ("Mondays gap and fade," "Friday afternoon melt-up," "Thursday is the new OPEX") have no source I could verify. Treat as hypotheses to test.

**Design implication.** Encode day-of-week as a categorical *context* feature available at 00:00 ET. Expect the learned weight to be near zero for SPX; its main legitimate use is to interact with event flags (NFP is a Friday; most CPI prints are Tue–Thu; monthly OPEX is a Friday).

### 1.2 Turn-of-the-month (TOM)

- **[B] McConnell & Xu (FAJ 2008)**, https://doi.org/10.2469/faj.v64.n2.11 (abstract via Crossref): 1926–2005, U.S. equities. "On average, investors received no reward for bearing market risk except at turns of the month." Not confined to small caps, year-ends or quarter-ends; found in 31 of 35 countries; *not* explained by month-end volume or fund flows. Quantpedia's extraction of the paper's Table (https://quantpedia.com/strategies/turn-of-the-month-in-equity-indexes/, accessed 2026-11-06): TOM window = last trading day through third trading day of next month; large-cap TOM days averaged **+0.15%/day vs +0.01% on other days (t = 7.81)**; holds in the 1987–2005 post-discovery sample. Transaction costs not reported.
- **[B] Etula, Rinne, Suominen & Vaittinen (RFS 2020), "Dash for Cash,"** https://doi.org/10.1093/rfs/hhz054 (abstract via Crossref): the monthly payment cycle induces "temporary increases in the costs of debt and equity capital that coincide with key dates associated with month-end cash needs," globally, with institutions (including mutual funds) as the source. This is the mechanism paper behind "sell into month-end, buy the turn."
- **[B] Lakonishok & Smidt (1988)** as above.
- **Post-2015 / intraday evidence:** none reached. The effect is documented at the *daily close-to-close* level; nothing above tells you whether the TOM premium accrues overnight or intraday (see §1.8: for most daily anomalies the answer has been "overnight").

**Design implication.** TOM flag (days −1 to +3) as a mild bullish prior on the *close-to-close* horizon only; for an intraday tool, treat it as a weak feature and let the ensemble learn whether any of it shows up 9:30–16:00.

### 1.3 Pre-holiday

- **[B] Ariel (JF 1990)**, https://doi.org/10.1111/j.1540-6261.1990.tb03731.x (abstract via Crossref): 1963–1982, pre-holiday days show mean returns **9–14× the mean of other days**; >1/3 of total market return accrued on the ~8 pre-holiday days per year; "hourly pre-holiday stock returns reveal high returns throughout the day"; post-test 1983–1986 also examined.
- **[B] Chong, Hudson, Keasey & Littler (JIMF 2005)**, "Pre-holiday effects: International evidence on the decline and reversal of a stock market anomaly," https://doi.org/10.1016/j.jimonfin.2005.08.015 — title verified; abstract not opened. The title and the Hansen–Lunde summary above both point the same way: **decline after the late 1980s** [B].
- **[C]** Anything about pre-holiday behavior in the 2020s is folklore.

**Design implication.** Pre-holiday flag (NYSE early close or full-day closure next session) is worth keeping only because *early closes change the session clock* (1:00 pm ET close for SPXW on half days per Cboe spec, https://www.cboe.com/tradable-products/sp-500/spx-options/spx-specifications) and therefore the expected-move and theta schedules [A]. As a directional lean it is weak at best.

### 1.4 FOMC day and the pre-FOMC announcement drift

- **[A] Mechanics.** FOMC 2026 meeting dates: Jan 27–28, Mar 17–18, Apr 28–29, Jun 16–17, Jul 28–29, Sep 15–16, Oct 27–28, Dec 8–9 (https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm). Statements are released at 2:00 pm ET on the second day (the Fed calendar page does not print the time; Lucca–Moench document the 2:15 pm regime Sept 1994–Mar 2011 and note that since April 2011 release times varied between 12:30 and 2:00 pm on press-conference days).
- **[B] Lucca & Moench (FRBNY SR 512, Sept 2011 rev. Aug 2013; JF 2015).** Full text parsed locally from https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr512.pdf (landing page https://www.newyorkfed.org/research/staff_reports/sr512.html; journal https://doi.org/10.1111/jofi.12196). Sample Sept 1994–Mar 2011, S&P 500 intraday. Findings, verbatim-supported: "the 24-hour return right before the FOMC meeting has on average been 49 basis points, with a t-statistic of more than 4.5 based on Huber-White standard errors"; the window is **2 pm the day before to 2 pm on announcement day**; mean excess return on all other 2pm-to-2pm windows "less than .5 basis points"; "since 1994 about 80% of realized excess stock returns" are accounted for by the pre-FOMC window; a buy-at-2pm-day-before strategy had an annualized Sharpe of 1.14; the close-to-close FOMC-day return is ~33 bp. Conditioning: a 1-SD higher VIX (two days before) is associated with +31 bp pre-FOMC return; a 1-SD steeper yield-curve slope lowers it by ~19 bp. Post-announcement (2 pm to close) returns are *not* the source of the drift.
- **[B] Kurov, Wolfe & Gilbert (FRL 2021), "The disappearing pre-FOMC announcement drift,"** https://doi.org/10.1016/j.frl.2020.101781 (abstract via Semantic Scholar): sample extended to Dec 2019; "the pre-FOMC drift essentially disappeared after 2015 in both announcements accompanied by press conferences and announcements not accompanied by press conferences"; proposed explanation: reduced uncertainty.
- **[B] Hu, Pan, Wang & Zhu (JFE 2022), "Premium for heightened uncertainty,"** https://doi.org/10.1016/j.jfineco.2021.09.015 (abstract via Semantic Scholar): "large overnight returns with no abnormal variance before nonfarm payrolls, ISM, and GDP announcements, similar to the pre-FOMC returns"; the return is tied to the build-up and resolution of uncertainty (VIX) *before* the release.
- **[B] Cieslak, Morse & Vissing-Jorgensen (JF 2019), "Stock returns over the FOMC cycle,"** https://doi.org/10.1111/jofi.12818 (abstract via Crossref): since 1994 the equity premium is "earned entirely in weeks 0, 2, 4, and 6 in FOMC cycle time." This is a multi-day pattern, not an intraday one, but it is the right "FOMC-cycle week parity" feature if you want one.

**Design implications.**
1. Encode `pre_fomc_window` (2 pm day-before → 2 pm announcement day) and `fomc_cycle_week_parity`. Give the pre-FOMC lean a **prior weight of zero** and let it earn weight only from post-2016 data; the published effect is a 1994–2011 phenomenon that the best follow-up says is gone.
2. The *post*-announcement window (2:00–4:00 pm) has no directional lean in any source; it has a *variance* lean (see §4 on event-day expected move).
3. If you do use the VIX conditioning, note it is the *level two days before*, not the same-day change.

### 1.5 CPI / NFP / other scheduled macro days

- **[A] Mechanics.** CPI and the Employment Situation are released at 08:30 (BLS schedule pages; time zone not printed, ET in practice): CPI 2026-11-10 and 2026-12-10 (https://www.bls.gov/schedule/news_release/cpi.htm); Employment Situation 2026-11-06 and 2026-12-04 (https://www.bls.gov/schedule/news_release/empsit.htm). Both land one hour before the cash open, so for a 9:30–16:00 tool the *reaction* is already in the opening print; what remains is the post-open drift/reversal.
- **[B] Savor & Wilson (JFQA 2013)**, https://doi.org/10.1017/S002210901300015X (Cambridge page): 1958–2009; scheduled inflation/unemployment/interest-rate announcement days earn **11.4 bp vs 1.1 bp** on other days; >60% of the cumulative annual equity premium on those days; Sharpe ratio 10× higher.
- **[B] Ai & Bansal (Econometrica 2018)**, https://doi.org/10.3982/ECTA14607 (abstract via Crossref): 1961–2014, ~55% of the entire equity premium on ~30 announcement days per year; "the market equity premium typically rises prior to the announcement and falls immediately afterwards."
- **[B] Kurov, Sancetta, Strasser & Wolfe (JFQA 2019)**, https://doi.org/10.1017/S0022109018000625 (Cambridge page): stock-index and Treasury futures around 30 U.S. macro releases; 9 of the 20 market-moving releases show drift in the "correct" direction starting ~30 minutes before release; pre-release drift ≈ **40% of the total price adjustment**. (Sample period not on the page.)
- **[B] Gao, Han, Li & Zhou (2018)** (§1.11) find intraday momentum is *stronger* on major macro-news days.
- **[B] Hu et al. (2022)**: the NFP/ISM/GDP premium is *overnight before* the release.

**Design implications.** For an intraday tool, macro days are primarily a **variance regime** (wider expected move; see §4) and secondarily a **momentum regime** (first-half-hour → last-half-hour continuation is stronger). They are *not* a standing directional lean after 9:30: the documented premium is realized before the open. Feature: `macro_day ∈ {CPI, NFP, FOMC, ISM, GDP, PCE, other}` plus `minutes_since_release`.

### 1.6 Monthly OPEX (third Friday), triple witching, end-of-month rebalancing

- **[A] Mechanics.** Standard (third-Friday) SPX options are AM-settled: trading "will ordinarily cease on the business day (usually a Thursday) preceding" settlement; SPXW (incl. 0DTE) trade until 4:00 pm ET on expiration day (1:00 pm half days) (https://www.cboe.com/tradable-products/sp-500/spx-options/spx-specifications). So on third Fridays the *monthly* open interest settles off the 9:30 opening prints, while the day's 0DTE flow settles at the close.
- **[B] Stoll & Whaley (FAJ 1987)**, https://doi.org/10.2469/faj.v43.n2.16 (abstract via Crossref): 1984–85 quarterly expirations; last-hour volume substantially higher; price-change volatility significantly higher on expiration days "with the stock market tending to fall"; average reversal next morning ≈ **0.4% of the closing index value**. (Pre-dates AM settlement; mechanics have changed.)
- **[B] Ni, Pearson & Poteshman (JFE 2005)**, "Stock price clustering on option expiration dates," https://doi.org/10.1016/j.jfineco.2004.08.005 — title verified; abstract not opened. Widely cited as showing optionable stocks cluster at strikes on expiration Fridays; magnitude not quoted here.
- **[B] Golez & Jackwerth (JFE 2012)**, "Pinning in the S&P 500 futures," https://doi.org/10.1016/j.jfineco.2012.06.010 — title verified; abstract not opened. This is the index-futures pinning paper to read before building any "max pain" feature.
- **[B] Avellaneda & Lipkin (Quant. Finance 2003)**, https://doi.org/10.1088/1469-7688/3/6/301 (abstract via Crossref): a model in which delta-hedging of unusually large open interest "can impact the stock price and drive it to the strike"; pinning probability depends on volatility, time-to-maturity, open interest and a price-impact constant.
- **[B] Ni, Pearson, Poteshman & White (RFS 2021)**, https://doi.org/10.1093/rfs/hhaa082 (abstract via Crossref): "a noninformational channel through which option market maker hedge rebalancing affects stock return volatility and the probability of large stock price moves."
- **[B] End-of-month flows:** Etula et al. (2020) above. **[C]** "Pension rebalancing sells equities into month-end after an up month" is a bank-desk estimate repeated in media; no primary source reached.
- **[C] "OPEX week is weak / post-OPEX reversal"** — folklore.

**Design implications.** Features: `is_monthly_opex`, `is_quarterly_witching`, `is_eom_rebal_window` (last 2 sessions), plus the *level* features derived from open interest (§2). Prior weight zero on direction; non-zero on variance and on the *strength of pin levels*.

### 1.7 Gap fill statistics

- **[B] Caporale & Plastun (Investment Analysts Journal 2017)**, https://doi.org/10.1080/10293523.2017.1333563 (abstract via Crossref): 2000–2015, daily data, stocks/FX/commodities; "in most cases the observed price behaviour is not inconsistent with market efficiency, the exception being FOREX." **Plastun, Sibande, Gupta & Wohar (NAJEF 2020)**, "Price gap anomaly in the US stock market: The whole story," https://doi.org/10.1016/j.najef.2020.101177 — title verified; abstract not opened.
- **Reputable blog statistics:** not reachable (quantifiedstrategies.com is bot-walled; Quantpedia has no gap page I could find). I do not reproduce any number from memory.
- **[A, computed here] The null benchmark every gap statistic must beat.** For a driftless continuous random walk, the probability that price *touches* a level at distance g within a window of standard deviation σ_session is, by the reflection principle, P = 2·(1 − Φ(g/σ_session)). Hence a "gap fill" is *expected* for small gaps even with zero information:

  | |gap| / σ_session | P(fill within session), no information |
  |---|---|
  | 0.10 | 0.92 |
  | 0.25 | 0.80 |
  | 0.50 | 0.62 |
  | 0.75 | 0.45 |
  | 1.00 | 0.32 |
  | 1.50 | 0.13 |
  | 2.00 | 0.05 |

  Blog claims such as "70% of gaps fill the same day" are uninformative unless the gap-size distribution and the σ_session are stated; with a typical gap of 0.3–0.5 σ_session the naïve baseline already gives 60–75%. Use this table as the *baseline* in your reliability diagram for any gap-fill indicator.

**Design implication.** Feature `gap_z = (open − prior_close) / σ_session_forecast` (available 9:30:00), and the indicator's probability should be reported *as an excess over the reflection baseline*, not raw.

### 1.8 Overnight vs intraday decomposition; prior-day close → next morning

- **[B] Boyarchenko, Larsen & Whelan, "The Overnight Drift" (FRBNY SR 917, Feb 2020 rev. Aug 2022; full PDF parsed locally)**, https://www.newyorkfed.org/research/staff_reports/sr917.html. E-mini S&P 500 futures, mid-quotes, **5 Jan 1998 – 31 Dec 2020**. Average close-to-close log return 5.9% p.a.; overnight session (16:15→9:30) **3.6% p.a.**, i.e., more than half; the **2:00–3:00 am ET** hour alone averages **3.7% p.a. (1.48 bp/day, t = 7.1)**, positive in 20 of 23 years, significant in 17, significant on every weekday and in 9 of 12 months, and the only hour that survives Bonferroni/Benjamini–Yekutieli multiple-testing adjustment in full sample and subsamples. Intraday: "Thirty minutes prior to the opening of the cash market at 9:30 equity returns are initially large and negative and become smaller in magnitude but remain persistently negative until 12:00 … a flat return profile until 15:00, which is followed by a sequence of positive returns." The **9:00–10:00 'opening hour' return is −1.2 bp/day (t = 2.6)** but is "large and negative … only during recessionary periods (2000–2003, 2007–2008 & 2009) and flat otherwise"; the 17:00–18:00 return is −0.43 bp (t = −3.6); "the remaining ID returns are flat and statistically indistinguishable from zero." Mechanism: the drift is linked to order imbalance at the prior U.S. close, with **asymmetry: selloffs generate robust positive overnight reversals, rallies only modest reversals.** The 1998–2010 and 2011–2020 subsamples differ (opening-hour negativity is a first-subsample phenomenon).
- **[B] Lou, Polk & Skouras (JFE 2019), "A tug of war,"** https://doi.org/10.1016/j.jfineco.2019.03.011 (abstract via Semantic Scholar): firm-level overnight and intraday return *continuation* with an offsetting cross-period *reversal*, persisting for years; for 14 trading strategies, profits are earned "either … entirely overnight (for reversal and a variety of momentum strategies) or entirely intraday, typically with profits of opposite signs across these components"; the smoothed overnight-minus-intraday spread forecasts a strategy's subsequent close-to-close performance.
- **[B] Bogousslavsky (JFE 2021), "The cross-section of intraday and overnight returns,"** https://doi.org/10.1016/j.jfineco.2020.07.020; **Hendershott, Livdan & Rösch (JFE 2020), "Asset pricing: A tale of night and day,"** https://doi.org/10.1016/j.jfineco.2020.06.006 — titles verified; abstracts not opened. Both are part of the same literature: beta/risk premia are earned overnight.
- **[B/C] Knuteson** — arXiv:2010.01727 "Strikingly Suspicious Overnight and Intraday Returns" (2020, https://arxiv.org/abs/2010.01727): abstract says overnight returns on major indices "have been wildly positive" and intraday "disturbingly negative" over decades, cause unknown; arXiv:2201.00223 "They Still Haven't Told You" (2022, https://arxiv.org/abs/2201.00223) attributes it to one or more large quant firms expanding positions early in the day and contracting later; arXiv:1912.01708 (2019, https://arxiv.org/abs/1912.01708). The *pattern* is [B] and agrees with the Fed paper; the *manipulation explanation* is [C] (the author's hypothesis; no magnitudes in the abstracts).
- **[B] Last-30-minute return → next day.** Baltussen et al. (2021) report that the last-30-minute continuation "reverts over the next days" (abstract). Boyarchenko et al. tie closing-order-imbalance to the overnight reversal (above). Together: a strong closing-30-minute move in the direction of the day's trend is *more likely to retrace overnight than to continue*, with the asymmetry that selloffs retrace more. No paper reached here reports a clean "last-30-min return vs next-morning 9:30–10:00 return" regression for SPX post-2015; this is a gap to fill in-house.
- **[B] Heston, Korajczyk & Sadka (JF 2010)**, https://doi.org/10.1111/j.1540-6261.2010.01573.x (abstract via Crossref): return continuation at half-hour intervals that are exact multiples of a trading day (i.e., the same half-hour on subsequent days), lasting ≥40 days; cross-sectional, driven by predictable institutional order flow. **Bogousslavsky (JF 2016)**, https://doi.org/10.1111/jofi.12436: infrequent rebalancing explains autocorrelations that "switch sign and become positive at the rebalancing horizon."

**Design implications.**
1. `overnight_ret = open/prior_close − 1` and `prior_last30_ret` are both available at 9:30:00. The published direction of the conditional lean is: large prior-day selloff → positive overnight (already realized by 9:30) and *negative-to-flat opening hour in stressed regimes*; the opening-hour negativity is regime-dependent and should be gated by a stress/recession proxy (e.g., VIX > threshold), not applied unconditionally.
2. Do not import *daily-close* anomalies (TOM, pre-holiday, FOMC-cycle) as intraday leans without first decomposing them; the tug-of-war literature says most daily anomaly returns are overnight.

### 1.9 Weekly momentum / reversal at short horizons

- **[B] Lehmann (QJE 1990)**, https://doi.org/10.2307/2937816, and **Jegadeesh (JF 1990)**, https://doi.org/10.1111/j.1540-6261.1990.tb05110.x (abstracts via Crossref): one-week and one-month *cross-sectional* reversals in individual stocks (Jegadeesh: 2.49%/month extreme-decile spread, 1934–1987). **Nagel (RFS 2012)**, https://doi.org/10.1093/rfs/hhs066: reversal returns are liquidity-provision returns and are predictable with VIX.
- **[B] Moskowitz, Ooi & Pedersen (JFE 2012)**, https://doi.org/10.1016/j.jfineco.2011.11.003: *time-series* momentum in equity-index futures at 1–12 month horizons; nothing at the one-week horizon.
- **Index-level one-week autocorrelation for SPX/ES post-2015:** no source reached. **[C]** My prior is that it is indistinguishable from zero after costs; the ensemble can include `ret_5d` as a feature with zero prior weight and let it prove itself.

### 1.10 Time-of-day seasonality: returns, volatility, volume; the shift of volume to the close; lunch lull

- **[B] Wood, McInish & Ord (JF 1985)**, https://doi.org/10.1111/j.1540-6261.1985.tb04996.x (abstract via Crossref): minute-by-minute NYSE market returns; "unusually high returns and standard deviations of returns are found at the beginning and the end of the trading day"; the middle-of-day distribution is approximately normal. **Harris (JFE 1986)**, https://doi.org/10.1016/0304-405X(86)90044-9, and **Andersen & Bollerslev (JEF 1997)**, "Intraday periodicity and volatility persistence," https://doi.org/10.1016/S0927-5398(97)00004-2 — titles verified; abstracts not opened; both are the standard references for the U-shaped intraday volatility/volume profile. **Admati & Pfleiderer (RFS 1988)**, https://doi.org/10.1093/rfs/1.1.3: theory of endogenous concentrated trading. **French & Roll (JFE 1986)**, https://doi.org/10.1016/0304-405X(86)90004-8 — title verified; abstract not opened; the widely cited finding is that per-hour return variance is much higher during trading hours than non-trading hours, which is why *trading-time* (not calendar-time) scaling is correct (§4).
- **[B] Hour-by-hour ES returns 1998–2020** (Boyarchenko et al., §1.8): only the opening hour (recession-conditional), the 17:00–18:00 hour and the 2:00–3:00 am hour have non-zero means; **all other regular-session hours are flat.** This is the most important time-of-day *return* fact for a directional tool: there is no reliable unconditional "lunch fade" or "power-hour lean" in 23 years of futures data.
- **[B] Volume at the close.** Bogousslavsky & Muravyev (J. Financial Markets 2023), "Who trades at the close? Implications for price discovery and liquidity," https://doi.org/10.1016/j.finmar.2023.100852 — title verified; abstract not opened (Elsevier/SSRN blocked). **[C]** The widely reported figure that roughly a third of U.S. equity volume now prints in the closing auction (2023–2025) comes from media/exchange commentary I could not reach; treat as plausible but unverified here. Cboe's Q3 2026 note documents a different structural shift: overnight Global Trading Hours in SPX/XSP/VIX/RUT reached ~288k contracts/day (~3% of index-options activity) and pre-market options trading (7:30–9:25 am ET) launched on 27 underlyings (https://www.cboe.com/insights/posts/state-of-the-options-industry-q-3-2026-volume-growth-concentrated-in-index-and-etf-options).
- **[C] Lunchtime lull.** Volume/volatility trough ~12:00–14:00 ET is consistent with the U-shape literature, but no paper reached gives a *return* lean for it.

**Design implications.** Time-of-day enters the model (i) as the *variance clock* (§4), (ii) as an interaction gate (intraday momentum is a *last-30-minutes* phenomenon), and (iii) as a *liquidity* feature. It should not enter as a standalone directional prior.

### 1.11 First-hour reversal/continuation, opening-range breakout, "power hour," and market intraday momentum

- **[B] Gao, Han, Li & Zhou (JFE 2018), "Market intraday momentum,"** https://doi.org/10.1016/j.jfineco.2018.05.009 (abstract via Semantic Scholar): SPY high-frequency data **1993–2013**; the **first half-hour return predicts the last half-hour return**, "both statistically and economically significant," stronger on volatile days, high-volume days, recession days and major macro-news days; also strong in ten other liquid ETFs and two international index futures. (The abstract does not quote the R² or hit rate; the body of the paper — not opened — reports in-sample R² on the order of 1–2% and out-of-sample gains; I do not quote figures I did not read.)
- **[B] Baltussen, Da, Lammers & Martens (JFE 2021), "Hedging demand and market intraday momentum,"** https://doi.org/10.1016/j.jfineco.2021.04.029 (abstract via Semantic Scholar): **60+ futures (equities, bonds, commodities, currencies), 1974–2020**; "the return during the last 30 minutes before the market close is positively predicted by the return during the rest of the day (from previous market close to the last 30 minutes)"; predictive power "economically and statistically highly significant, and **reverts over the next days**"; linked to gamma-hedging demand of options market makers and leveraged ETFs. This is the gamma-conditional version: the effect should be stronger when dealers are net short gamma and on high-|move| days.
- **[B, exchange research] Cboe (Xu 2023)**: on 15 Aug 2023 market makers were ~$2bn *long* gamma at 3 pm when the sell-off began and only turned short (~−$500mm) around 3:30 pm; Cboe's point is that 0DTE dealer hedging did not cause the move. Use as a caution: real-time dealer gamma sign is not observable to you and third-party GEX estimates (§2) rest on strong assumptions.
- **[B, working paper / practitioner] Zarattini & Aziz (Concretum), "Can Day Trading Really Be Profitable?"** (SSRN 4416622; summary page https://concretumgroup.com/can-day-trading-really-be-profitable/, accessed 2026-11-06): opening-range-breakout on QQQ with TQQQ for leverage, **2016–2023**, total return 1,484% vs 169% passive QQQ, "annualized alpha 33% net of commissions." The 1,484% is a 3×-leveraged figure; no Sharpe/MDD/win rate on the page. **Zarattini, Aziz & Barbon, "Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY)"** (SSRN 4824172; https://concretumgroup.com/beat-the-market-an-effective-intraday-momentum-strategy-for-sp500-etf-spy/): **2007–early 2024**, 19.6% annualized, Sharpe 1.33, "net of costs" (commissions and slippage); rules described only loosely on the page (trend entries on "abnormal demand and supply imbalances," dynamic trailing stops). **Zarattini & Aziz, VWAP strategy on QQQ**, 2 Jan 2018–28 Sep 2023, Sharpe 2.1, MDD 9.4%, 671% total return net of commissions (https://concretumgroup.com/volume-weighted-average-price-vwap-the-holy-grail-for-day-trading-systems/). These are not peer-reviewed, the pages are promotional, and the SSRN PDFs were not opened; treat all three as **[B-weak]** and as *strategy hypotheses to replicate*, not as established facts.
- **[C] "First-hour reversal"** (fade the 9:30–10:30 move) — no source; conflicts with the intraday-momentum evidence on high-volatility days. **[C] "Power hour" (3–4 pm trend)** — the only sourced version is the last-30-minute continuation above.

**Design implications.**
1. The single best-supported intraday directional feature is `rest_of_day_ret = P(15:30)/P(prior close) − 1` (Baltussen) and its early-day proxy `first30_ret` (Gao et al.), applied to the **last 30 minutes only**, with weight scaled up on high-|move| / high-volume / macro days, and with an *expectation of reversal the next day*.
2. ORB and VWAP-trend rules deserve a slot as *indicators* (binary: above/below opening range; above/below VWAP) but their public performance claims are unaudited and leveraged.

### 1.12 Consolidated evidence scorecard (sample, magnitude, post-2020 status, costs)

"Survives costs?" is judged for a *long-option* implementation with a stated spread; "post-2020" says whether any source reached tests 2020+ data.

| Effect | Best source(s) | Sample | Magnitude reported | Post-2020 evidence | Survives option costs? | Label |
|---|---|---|---|---|---|---|
| Overnight > intraday; 2–3 am ET drift | Boyarchenko–Larsen–Whelan SR917 | ES 1998–2020 | ON 3.6%/yr of 5.9% total; 2–3 am 1.48 bp/day (t=7.1) | Through 2020 only | Not tradable in RTH options; informs priors only | [B] |
| Opening-hour (9–10) negative return | SR917 | ES 1998–2020 | −1.2 bp/day (t=2.6), recession-only; flat 2011–2020 | 2011–2020 subsample flat | No (≈1 bp vs spreads of several bp of premium) | [B] |
| Last-30-min continuation of rest-of-day | Baltussen et al. 2021; Gao et al. 2018 | 60+ futures 1974–2020; SPY 1993–2013 | "Economically and statistically highly significant"; reverts next days | To 2020 | Plausibly, on high-|move| days only; must be tested with 15:30 0DTE spreads | [B] |
| Pre-FOMC drift (2pm→2pm) | Lucca–Moench; Kurov–Wolfe–Gilbert | SPX 1994–2011; to 2019 | 49 bp; ~80% of excess returns; gone after 2015 | To 2019: disappeared | Was; probably not now | [B] |
| Macro-announcement-day premium | Savor–Wilson; Ai–Bansal; Hu et al. | 1958–2009; 1961–2014 | 11.4 vs 1.1 bp/day; ~55–60% of premium | No | Mostly pre-open/overnight; not capturable 9:30–16:00 | [B] |
| Pre-release 30-min drift | Kurov et al. 2019 | index & Treasury futures, 30 releases | ~40% of adjustment before release; 9/20 releases | Not stated | Only for 10:00 releases in RTH; unclear | [B] |
| Turn-of-month | McConnell–Xu; Etula et al. | 1926–2005; global | +0.15%/day TOM vs +0.01% | No | Daily horizon; intraday share unknown | [B] |
| Pre-holiday | Ariel; Chong et al.; Hansen–Lunde (via Quantpedia) | 1963–86; declining post-1980s | 9–14× mean day in 1963–82; largely absent after ~1990 | No | No | [B→weak] |
| Day-of-week (index) | Lakonishok–Smidt; Hansen–Lunde | 1897–1986; to 2002 | Present pre-1990; absent after | No | No | [B→weak] |
| OPEX / witching | Stoll–Whaley; Golez–Jackwerth (title) | 1984–85 | Last-hour vol up; ~0.4% next-morning reversal | No | Unknown; mechanics changed (AM settlement, daily 0DTE) | [B, stale] |
| Gap fill | Caporale–Plastun; reflection baseline | 2000–2015 daily | Stocks: consistent with efficiency | No | Baseline explains most "fill" rates | [B]/[A] |
| S/R bounce at published levels | Osler 2000 | FX 1996–98 | 60.8% vs 56.2% random (+4–6 pp) | No; FX only | Marginal: +4 pp × bounce size vs spread | [B] |
| Round-number barriers | Donaldson–Kim; BHJ; SVV | DJIA pre-1993; stocks; S&P futures | Restraint at 100s; faster after break; clustering ↑ with vol | No | Marginal | [B] |
| Pinning at strikes (expiry) | NPP 2005 (title); Golez–Jackwerth (title); Avellaneda–Lipkin | single stocks; S&P futures | Not quoted here | No | Only last hour of expiry; 0DTE untested | [B, not quantified here] |
| GEX "walls" | SqueezeMetrics white paper | undated | Vol: 0.55% vs 0.85% 1-day SD by GEX quartile | No | Not a directional edge | [C] |
| ORB / VWAP-trend day trading | Zarattini–Aziz (Concretum) | 2016–2023; 2018–2023; 2007–2024 | 33%/yr alpha (3× lev.); Sharpe 2.1; Sharpe 1.33 net | Yes, to 2023–24 | Claimed net of commissions; unaudited, promotional | [B-weak] |
| 0DTE share and dealer gamma | Cboe (Xu 2023, 2025; product page; Q3 2026) | 2016–2026 | 5%→59% of SPX volume; net MM gamma ≤0.2% of liquidity | Yes | n/a (regime facts) | [B, exchange] |

---

## 2. Support / resistance: evidence, scoring, validation

### 2.1 What the evidence actually says

- **[B] Osler (FRBNY EPR 2000), "Support for Resistance" (full PDF parsed locally)**, https://www.newyorkfed.org/research/epr/00v06n2/0007osle.html. Data: S/R levels published daily by six FX firms, **Jan 1996–Mar 1998**, DEM/JPY/GBP vs USD, one-minute indicative quotes 9 am–4 pm NY. Definition: a "hit" is the bid/ask coming within 0.01% of the level; a "bounce" is a trend interruption within 15 minutes (alternative gaps 0.00%/0.02% and alternative windows tried). Results: exchange rates "bounced off arbitrary support and resistance levels **56.2 percent** of the time on average. By contrast, they bounced off the published levels **60.8 percent** of the time"; the excess is **+4.2 pp (mark), +5.6 pp (yen), +4.0 pp (pound)**; in all 16 firm-currency pairs the published levels beat 10,000 sets of artificial levels; the best firm's yen levels beat arbitrary by 9.2 pp; predictive power "lasted at least five business days"; **more than 70% of published levels end in 0 and 96% in 0 or 5** (vs 10–20% if random). Firms agree with each other only ~30% of the time.
- **[B] Osler (JF 2003), "Currency orders and exchange rate dynamics,"** https://doi.org/10.1111/1540-6261.00588 (abstract via Crossref): take-profit orders cluster at round numbers (explains reversals at levels); stop-loss orders cluster just beyond round numbers (explains fast moves after breaks).
- **[B] Donaldson & Kim (JFQA 1993), "Price barriers in the DJIA,"** https://doi.org/10.2307/2331416 (abstract via Crossref): the DJIA "is indeed restrained by 'support' and 'resistance' levels at multiples of 100 … but that, having broken through a 100-level, the DJIA then moves by more than otherwise warranted"; Monte Carlo-confirmed; not necessarily inefficiency.
- **[B] Bhattacharya, Holden & Jacobsen (Mgmt Sci 2012)**, https://doi.org/10.1287/mnsc.1110.1364 (abstract via Crossref): >100m stock transactions; excess buying one penny *below* and selling one penny *above* round numbers; imbalance monotonic in "roundness"; much stronger when the quote *reaches* the integer than when it *crosses* it; 24-hour returns vary by price point.
- **[B] Schwartz, Van Ness & Van Ness (J. Futures Markets 2004)**, https://doi.org/10.1002/fut.10129 (abstract via Crossref): S&P 500 futures trade prices cluster at x.00 and x.50; clustering increases with volatility and decreases with volume/open interest; high clustering in daily opening and closing prices.
- **[B] Lo, Mamaysky & Wang (NBER WP 7613 / JF 2000)**, https://www.nber.org/papers/w7613: kernel-regression pattern recognition on U.S. stocks 1962–1996; "several technical indicators do provide incremental information" — conditional return distributions differ from unconditional; this is *informativeness*, not profitability, and it concerns chart patterns rather than horizontal levels.
- **[B] Option-strike clustering / pinning:** Ni–Pearson–Poteshman (2005), Golez–Jackwerth (2012, S&P 500 futures), Avellaneda–Lipkin (2003) — §1.6. **GEX walls [C]:** the SqueezeMetrics white paper (Mar 2016, rev. Dec 2017; https://squeezemetrics.com/monitor/download/pdf/white_paper.pdf, parsed locally) defines GEX from SPX open interest under four stated assumptions (all options are dealer-facilitated, etc.) and reports that the highest and second-highest GEX quartiles are followed by 1-day SPX return SDs of **0.55% vs 0.85%** (vs 0.51% / 0.66% for the two lowest VIX quartiles) — a *volatility* claim, from a vendor, with no sample dates in the document, not a support/resistance claim. No peer-reviewed study of "GEX walls as intraday S/R" was reached.
- **VWAP / anchored VWAP as S/R:** no academic evidence reached. The Concretum VWAP study (§1.11) is a *trend* rule (long above / short below), not a reversion-at-VWAP rule, and is [B-weak].
- **Prior-day high/low/close, opening range, prior-week levels:** no direct academic tests reached. They are natural *clustering points* for stops and take-profits (Osler 2003 mechanism), which is the best argument for them [C→B by mechanism].

### 2.2 Proposed scoring of level "strength"

Define for each candidate level L at time t (all computable from your own 1-minute ES/SPX data plus the option chain):

```
strength(L,t) = w_touch · f(touches_L)             # number of prior "hits" (within tol) that were followed by a bounce, decayed by age
              + w_conf  · n_confluent(L)           # count of distinct level families within tol: prior-day H/L/C, opening range H/L, prior-week H/L, round number (50/100), VWAP/AVWAP, high-OI strike, pin/max-pain strike
              + w_rec   · exp(−age_L / τ)          # recency; Osler: FX S/R information persisted ≥5 business days
              + w_round · roundness(L)             # 0 for non-round, 1 for xx50, 2 for xx00, 3 for x000 (BHJ monotonicity)
              + w_oi    · log(1 + OI_L / median_OI) # for strikes; Avellaneda–Lipkin: pin probability ↑ with OI, ↓ with σ√τ
```

with `tol` = max(0.5 ES points, 0.02% of price) at the start and then calibrated (Osler used 0.01% in FX). Start with **all w = 1 and z-score each term** (equal-weight prior; §3.4). Produce two outputs per level: `P(bounce | hit)` and `P(fast continuation | break)` — Osler (2003) and Donaldson–Kim both imply the *second* is as real as the first.

### 2.3 Validation protocol (what "it works" must mean)

1. **Baseline:** replicate Osler's artificial-level test. For each session draw 10,000 random levels from the session's realized range; compute bounce frequency at random levels (expect ~55–60%). Your level set must beat this with a binomial test *per month* (Osler used months as trials to avoid dependence), not pooled.
2. **Conditional reversal probability at level vs baseline**, bucketed by strength score decile; report the reliability diagram (§3.6) with Wilson intervals (§3.7).
3. **Horizon:** define the bounce window (Osler: 15 minutes) and the continuation window (e.g., 30 minutes after a break) *before* looking at the data; report both.
4. **Decay:** re-estimate using levels aged 1, 2, …, 10 sessions; Osler found ≥5 days in FX.
5. **Regime split:** low-VIX vs high-VIX; Schwartz et al. show clustering rises with volatility, so round-number effects should too.
6. **Costs:** a 4-pp edge over a 56% base rate is worth ~0.04 × (expected bounce size) per trade; with a 0.25-point ES tick and 0DTE option spreads of 0.05–0.20 of premium, most such edges are inside the spread. Report expected value *after* a stated spread model.

---

## 3. Indicator ensembles and online weighting

### 3.1 The algorithms, stated precisely

- **[A] Multiplicative weights / Hedge.** Arora, Hazan & Kale (Theory of Computing 8, 2012, pp. 121–164; https://theoryofcomputing.org/articles/v008a006/, PDF parsed locally). MWU (Fig. 1): with n experts, weights w_i(1)=1, play p(t)=w(t)/Σw(t), observe costs m_i(t)∈[−1,1], update **w_i(t+1) = w_i(t)(1 − η m_i(t))**, with η ≤ 1/2. Theorem 2.1: Σ_t m(t)·p(t) ≤ Σ_t m_i(t) + η Σ_t |m_i(t)| + (ln n)/η for every i. Hedge (Theorem 2.3) uses **w_i(t+1) = w_i(t)·exp(−η m_i(t))** with η ≤ 1 and bound Σ m·p ≤ Σ m_i + η Σ (m(t))²·p(t) + (ln n)/η. Balancing the two terms gives η ≈ √(ln n / T) and regret O(√(T ln n)) (also stated on https://en.wikipedia.org/wiki/Multiplicative_weight_update_method). Original: Freund & Schapire, JCSS 55 (1997), https://doi.org/10.1006/jcss.1997.1504 (title verified; abstract not opened); Littlestone & Warmuth's weighted majority is the ancestor.
- **[A] Parameter-free Hedge.** de Rooij, van Erven, Grünwald & Koolen, "Follow the Leader If You Can, Hedge If You Must," JMLR 15 (2014) 1281–1316, https://jmlr.org/papers/v15/rooij14a.html: **AdaHedge** tunes η online without knowing the loss range or T; **FlipFlop** alternates AdaHedge with follow-the-leader to get constant regret on easy (stochastic) data while keeping worst-case guarantees. Weights are invariant to rescaling/shifting of losses; negative losses (gains) allowed.
- **[A] Exponentiated gradient.** Kivinen & Warmuth, Information and Computation 132 (1997), https://doi.org/10.1006/inco.1996.2612 (title verified; abstract not opened). EG is MWU applied to linear-predictor weights on the simplex; its loss bound grows logarithmically in dimension, so it beats gradient descent when the target is sparse (few relevant indicators among many) — this is the standard statement of the paper and the reason to prefer EG over OGD for "many weak indicators."
- **[A] Online gradient descent.** Zinkevich, ICML 2003, "Online Convex Programming and Generalized Infinitesimal Gradient Ascent," https://cdn.aaai.org/ICML/2003/ICML03-120.pdf (parsed locally): Theorem 1 gives O(√T) regret for projected gradient steps with η_t = t^{−1/2}. Hazan, "Introduction to Online Convex Optimization," arXiv:1909.05207 (v3 2023), https://arxiv.org/abs/1909.05207 is the modern textbook; Cesa-Bianchi & Lugosi, *Prediction, Learning, and Games* (CUP 2006), https://www.cambridge.org/core/books/prediction-learning-and-games/A05C9F6ABC752FAB8954C885D0065C8F covers the exponentially weighted average forecaster and its regret bounds.
- **[A] Tracking a changing best expert.** Herbster & Warmuth, "Tracking the Best Expert," Machine Learning 32 (1998), https://doi.org/10.1023/A:1007424614876 (title verified; publisher page redirected to a login). **Fixed-Share**: after each Hedge update, mix a fraction α of total weight uniformly across experts, w_i ← (1−α)w_i + (α/n)Σ_j w_j. This bounds regret against the best *sequence* of experts with k switches by roughly (k+1)·ln n/η + k·ln(1/α) + …, and is the principled way to add "forgetting."
- **[A] Bayesian model averaging.** Hoeting, Madigan, Raftery & Volinsky, Statistical Science 14(4) 1999, 382–417 (PDF parsed locally from https://www.stat.colostate.edu/~jah/papers/statsci.pdf): posterior-probability-weighted averaging over models; "BMA provides improved out-of-sample predictive performance." With a uniform prior and i.i.d. log-likelihoods, BMA weights are exactly Hedge weights with η = 1 on log loss — so BMA is the *most aggressive* member of this family, and the forecast-combination literature below explains why that is usually too aggressive.

### 3.2 Forecast combination: why equal weights are hard to beat

- **[B] Stock & Watson (J. Forecasting 2004)**, https://doi.org/10.1002/for.928 (abstract via Crossref): seven countries, 1959–1999, up to 73 predictors; individual forecasts unstable and on average worse than an AR benchmark; combinations often beat it; "the most successful combination forecasts, like the mean, are the **least sensitive to the recent performance of the individual forecasts**" — difficult to explain with stationary theory.
- **[B] Timmermann, "Forecast Combinations," Handbook of Economic Forecasting vol. 1 ch. 4 (2006)**, https://doi.org/10.1016/S1574-0706(05)01004-9 — title verified via Crossref; chapter text not opened (UCSD host down). The chapter's well-known conclusion, consistent with Stock–Watson, is that estimation error in combination weights usually swamps the gain from optimal weighting, so simple averages or weights shrunk toward equality dominate.
- **[B] Diebold & Shin (IJF 2019), "Machine learning for regularized survey forecast combination: Partially-egalitarian LASSO,"** https://doi.org/10.1016/j.ijforecast.2018.09.006 — title verified; abstract not opened. The method selects a subset of forecasters and shrinks the survivors toward *equal* weights; it is the right template for "many indicators, few that matter."
- **[C, practitioner, open source] Carver / pysystemtrade** (https://github.com/robcarver17/pysystemtrade, docs https://github.com/robcarver17/pysystemtrade/blob/master/docs/backtesting.md, accessed 2026-11-06): forecasts are *scaled* so the cross-sectional median absolute forecast is 10, **capped at ±20**, combined by weighted average with **equal weights as default**, optional estimation by shrinkage "toward equal Sharpe ratios and equal correlations" or by "handcrafting," then multiplied by a forecast-diversification multiplier derived from correlations (negative correlations floored at zero, EWMA-smoothed, capped at 2.5). The docs mark in-sample fitting "(never!)" and warn "beware of implicit overfitting!"

### 3.3 "Adjust but not too much": learning rate, caps, forgetting

- **[A]** The regret bound's (ln n)/η + ηT structure says the *theoretically* optimal η scales as √(ln n / T). For n = 30 indicators and a horizon of T = 1,000 decisions, η ≈ 0.058; for T = 250, η ≈ 0.12. With Hedge on per-decision losses in [0,1], η = 0.05 means a single bad day changes an expert's weight by at most ~5%.
- **[A]** AdaHedge removes the need to pick η; FlipFlop additionally exploits easy data. If you want one knob fewer, use AdaHedge; if you want transparency, use fixed η with the √(ln n/T) rule and *state it on screen*.
- **[A] Clamping.** Bound each weight in [w_min, w_max] (e.g., [0.2/n, 5/n]) after every update and renormalize. This is a hard version of fixed-share and guarantees no indicator can ever dominate or be silenced; it costs an additive constant in regret.
- **[A] Forgetting.** Fixed-share with α ≈ 1/(expected regime length in decisions), e.g., α = 0.01 for ~100-decision regimes. Alternatively exponential decay of cumulative losses with half-life h (losses weighted (1/2)^{age/h}); h of 60–120 trading days is a sensible starting range for seasonal/regime drift, but it is a hyperparameter you must tune out-of-sample (§3.8).
- **[C]** Tetlock-style "update, but not too much" is the same advice in words; the formal content is the η choice above.

### 3.4 Shrinkage toward equal weights (the single most important design choice)

Combine the Hedge weights with the equal-weight prior: **w_final = λ·(1/n) + (1−λ)·w_hedge**, with λ ∈ [0.3, 0.7] and *decreasing* only as the out-of-sample record lengthens (e.g., λ = max(0.3, 1 − T_oos/2000)). This encodes Stock–Watson/Timmermann directly, keeps the display interpretable ("indicator X is at 1.7× its default weight"), and limits the damage from a lucky streak.

### 3.5 Scoring rules

- **[A] Brier (1950)**, Monthly Weather Review 78(1):1–3, https://doi.org/10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2; BS = (1/N)Σ(f_t − o_t)², and the **Murphy (1973) decomposition BS = Reliability − Resolution + Uncertainty** (https://en.wikipedia.org/wiki/Brier_score). For a 50/50 base rate, Uncertainty = 0.25; an indicator that always says 0.5 scores exactly 0.25.
- **[A] Log loss** (negative log-likelihood) is the scoring rule under which Hedge weights equal Bayesian posteriors; it punishes confident errors without bound, so **clip probabilities to [0.02, 0.98]** before scoring if you use it for weights.
- **[A] Gneiting & Raftery (JASA 2007)**, https://doi.org/10.1198/016214506000001437 (abstract via Crossref): a scoring rule is *proper* if truthful reporting maximizes expected score; both Brier and log are strictly proper; proper rules "derive from convex functions and relate to … Bregman divergences." Use a proper rule for *weight updates*; never use hit rate (improper: it rewards reporting 0/1).
- **Recommendation:** Brier for weight updates (bounded, so Hedge's [−1,1] cost condition holds trivially) and log loss as a *displayed* diagnostic.

### 3.6 Calibration

- **[B] Niculescu-Mizil & Caruana (ICML 2005), "Predicting Good Probabilities with Supervised Learning"** (https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf, PDF parsed locally): Platt scaling fixes sigmoid-shaped distortion; isotonic regression corrects any monotone distortion but "is more prone to overfitting, and thus performs worse than Platt Scaling, when data is scarce"; their experiments calibrate on independent samples of 1,000 cases. **Platt (1999)** fits p = 1/(1+exp(A f + B)) by maximum likelihood on held-out data; **Zadrozny & Elkan (KDD 2002)**, https://doi.org/10.1145/775047.775151, introduced isotonic calibration for ranking classifiers.
- **[A] scikit-learn guidance** (https://scikit-learn.org/stable/modules/calibration.html): reliability diagram = binned mean predicted vs observed frequency; sigmoid for small data, isotonic for "roughly >1000 samples"; calibrate on data the model never trained on; Brier/log loss mix calibration and resolution, so always show the diagram.
- **Recommendation:** Platt-calibrate the *ensemble* output on a rolling, strictly out-of-sample window of the most recent 250–500 decisions; refit weekly; show the reliability diagram with Wilson bands.

### 3.7 Minimum sample sizes before reporting hit rates [A, computed here]

Wilson 95% intervals (https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval) and one-sided 5% detection thresholds against p = 0.5:

| n | 95% Wilson interval if p̂ = 0.50 | half-width | p̂ needed to reject p = 0.5 (one-sided 5%) |
|---|---|---|---|
| 30 | [0.332, 0.668] | ±0.168 | ≥ 0.650 |
| 50 | [0.366, 0.634] | ±0.134 | ≥ 0.616 |
| 100 | [0.404, 0.596] | ±0.096 | ≥ 0.582 |
| 300 | [0.444, 0.556] | ±0.056 | ≥ 0.547 |
| 1000 | [0.469, 0.531] | ±0.031 | ≥ 0.526 |
| 3000 | [0.482, 0.518] | ±0.018 | ≥ 0.515 |

Sample size for 80% power (one-sided 5%) to detect a true hit rate of 0.53 vs 0.50: **n ≈ 1,715**; 0.55: **≈ 616**; 0.58: **≈ 239**; 0.60: **≈ 152**. At one decision per session, a 55% indicator needs ~2.5 years of out-of-sample trading to be *detectable*. Therefore: display hit rates only with the interval; grey-out any indicator with n < 100; never rank indicators by raw hit rate.

### 3.8 Multiple testing and the base-rate / cost problem

- **[B/A] White (Econometrica 2000), "A Reality Check for Data Snooping,"** https://doi.org/10.1111/1468-0262.00152; **Hansen (JBES 2005), "A Test for Superior Predictive Ability,"** https://doi.org/10.1198/073500105000000063 (studentized, less sensitive to poor alternatives); **Harvey, Liu & Zhu (RFS 2016)**, https://doi.org/10.1093/rfs/hhv059: after accounting for the number of tried factors, "a new factor needs to clear … a t-statistic greater than 3.0"; **Bailey & López de Prado (JPM 2014), "The Deflated Sharpe Ratio,"** https://doi.org/10.3905/jpm.2014.40.5.094: corrects for selection bias under multiple testing and non-normality; **Harvey & Liu (JPM 2015), "Backtesting,"** https://doi.org/10.3905/jpm.2015.42.1.013: a haircut for any reported Sharpe given the number of trials.
- **Practical rule:** keep a *registry* of every indicator ever tried (including discarded variants); report the DSR with that count; demand t > 3 (HLZ) or the SPA p-value < 0.05 against the "always 0.5" benchmark before an indicator gets non-zero prior weight.
- **[A] Base rate.** Direction over a 9:30–16:00 or shorter window is ~50/50 and the mean move is ≪ the standard deviation; the *option* P&L is dominated by the bid–ask spread and by the gamma/theta trade-off, so a 53% directional edge is economically zero unless the expected |move| conditional on the signal exceeds the premium paid plus spread. Always evaluate the ensemble on **option P&L after a stated spread model**, not on directional hit rate.

### 3.9 Redundancy: effective number of indicators

- **[A]** Compute the correlation matrix R of indicator *outputs* (signed probabilities) over the trailing window; the **effective number** N_eff = (Σλ_i)² / Σλ_i² of its eigenvalues (participation ratio), or the entropy version exp(−Σ p_i ln p_i) with p_i = λ_i/Σλ_j. If N_eff ≪ n, the equal-weight prior is secretly concentrated. Either (a) cluster indicators (hierarchical clustering on 1−|ρ|), average within clusters, and Hedge *across clusters*; or (b) rescale the combined forecast by a diversification multiplier as Carver does (capped). Report N_eff on screen next to n.

### 3.10 Worked example of the update (so the display can be explained in one sentence) [A, computed here]

Five experts, η = 0.1, fixed-share α = 0.01, equal start. Suppose over 20 decisions the decayed Brier losses are L = (4.0, 4.4, 4.8, 5.2, 6.0) — i.e., the best expert has averaged 0.20 per decision (a well-calibrated ~60% forecaster), the worst 0.30 (worse than always saying 0.5, which scores 0.25).
- Hedge weights ∝ exp(−0.1·L) = (0.670, 0.644, 0.619, 0.595, 0.549) → normalized (0.217, 0.208, 0.200, 0.192, 0.177).
- After fixed-share: (0.217, 0.208, 0.200, 0.192, 0.178) (barely changed, by design).
- After shrinkage with λ = 0.5: (0.208, 0.204, 0.200, 0.196, 0.189).
The best expert ends at 1.04× default, the worst at 0.95× default. That is the intended behaviour at n = 20 decisions: the display *moves*, but a 60%-vs-45% gap over 20 observations is inside the Wilson band (§3.7) and the weights say so. With η = 1 (BMA-like) the same losses give (0.52, 0.35, 0.23, 0.16, 0.07)/1.33 → the best expert at 1.9× default after 20 decisions, which the forecast-combination evidence says will usually be regretted.

---

## 4. Expected move: how to state it

- **[A] The 0DTE ATM straddle is E|move|.** The price of an ATM straddle expiring at the close is the risk-neutral expectation of |S_close − K| discounted; for K = S_now it is the market's E|S_close − S_now| up to a (negligible for hours) interest adjustment and a small skew/convexity correction. Use the **mid** of the nearest-to-the-money SPXW straddle (interpolate across the two bracketing strikes if the forward is between them). SPXW 0DTE trade to 4:00 pm ET and settle on closing prices (Cboe spec page above).
- **[A] Normal-model conversion.** For a normal move with SD σ, E|X| = σ·√(2/π) ≈ **0.798σ**; so σ_implied,to-close ≈ straddle/0.798, and the 1-SD range is ±1.25× the straddle. The classic ATM approximation σ ≈ C/(0.4·S·√T) is Brenner & Subrahmanyam, FAJ 44(5) 1988, https://doi.org/10.2469/faj.v44.n5.80 (title verified via Crossref), i.e., ATM call ≈ 0.4 S σ √T and straddle ≈ 0.8 S σ √T, which is the same 0.798 factor.
- **[A] Strike interpolation.** With SPXW strikes 5 points apart and the forward F between strikes K₁ < F < K₂, the ATM straddle is well approximated by linear interpolation of the two straddle mids in K; equivalently take the call at K₁ plus the put at K₂ minus (K₂ − K₁)·(fraction of the gap), which removes the intrinsic component. Use the *mid* (never the last trade) and reject quotes whose bid–ask exceeds 15% of the mid in the first five minutes.
- **[A/B] Trading-time vs calendar scaling, and the U-shape.** Variance accrues in trading time (French & Roll 1986, title verified) and *within* the session in a U-shape (Wood–McInish–Ord 1985 [B]; Andersen–Bollerslev 1997, title verified). So for a *realized-vol-based* expected move, do **not** use σ_daily·√(hours_left/6.5). Estimate the cumulative intraday variance share s(t) ∈ [0,1] from your own 1-minute ES/SPY squared returns by half-hour bucket (median across the last 60–120 sessions, separately for macro vs non-macro days), and use σ_remaining(t) = σ_session·√(1 − s(t)). Illustration [A, computed here, with *illustrative* weights — replace with your estimate]: if the first half-hour carries ~17% of session variance and the last ~12%, then at 12:00 the uniform clock says 62% of variance remains while the U-clock says 55%; at 15:00 the uniform clock says 15% remains while the U-clock says 21%.
- **[B, exchange] Implied vs realized intraday.** Cboe (Xu 2023) reports the spread between close-to-close and intraday (open-to-close) realized vol averaged 2.7 vol points in 2023 YTD, equal to the 10-year average. No source reached gives a 0DTE implied-vs-realized ratio; **[C]** desk lore is that 0DTE ATM implieds run above subsequent realized on quiet days and below on event days. Compute your own ratio: realized |move to close| / straddle at entry time, bucketed by time of day and macro flag; it will become your best single calibration diagnostic.
- **Event days.** Macro-day expected moves should be read off the straddle (it already embeds the event). Lucca–Moench's VIX conditioning and Hu et al.'s pre-announcement variance *build-up* mean that the straddle will typically *fall* after the release even if realized vol is high; a long-premium position opened before a release pays that crush.

**Statement format recommended on screen:** "Expected |move| to close: $X (straddle mid) ≈ 1-SD ±$1.25X; realized/implied last 60 sessions at this time-of-day: r = …, n = …"

---

## 5. Exit timing for long options intraday (0DTE / short-dated)

- **[A, computed here] The theoretical decay profile.** Under Black–Scholes an ATM option's value ∝ √(remaining variance). On a *uniform* intraday clock (6.5-hour session), the fraction of 9:30 value remaining is: 10:00 0.96; 11:00 0.88; 12:00 0.78; 13:00 0.68; 14:00 0.56; **15:00 0.39; 15:30 0.28; 15:45 0.20**; 16:00 0. Half the value is gone by ~13:45; a quarter of the session (the last ~97 minutes) destroys half of what remains at that point. With a U-shaped variance clock (illustrative weights, §4) the mid-day decay is *faster* than uniform before 13:00 and *slower* after (15:00 ≈ 0.46 instead of 0.39), because the last half-hour still carries ~12% of the day's variance. The last-hour non-linearity is therefore mostly a √ effect: value falls as √(remaining variance), so the *rate* of decay per unit variance explodes near zero remaining variance.

  Hour-by-hour value fraction of a 9:30 ATM 0DTE option (ATM value ∝ √ remaining variance) [A, computed here]:

  | Clock time | Uniform clock: var. remaining | value remaining | U-shape (illustrative): var. remaining | value remaining |
  |---|---|---|---|---|
  | 10:00 | 0.92 | 0.96 | 0.85 | 0.92 |
  | 11:00 | 0.77 | 0.88 | 0.67 | 0.82 |
  | 12:00 | 0.62 | 0.78 | 0.55 | 0.74 |
  | 13:00 | 0.46 | 0.68 | 0.45 | 0.67 |
  | 14:00 | 0.31 | 0.56 | 0.35 | 0.59 |
  | 15:00 | 0.15 | 0.39 | 0.21 | 0.46 |
  | 15:30 | 0.08 | 0.28 | 0.11 | 0.33 |
  | 15:45 | 0.04 | 0.20 | ~0.06 | ~0.24 |
  | 16:00 | 0 | 0 | 0 | 0 |

  Two consequences for a long-premium tool: (i) a directional lean that is right on *sign* but needs more than ~half a session to play out loses to theta unless the realized |move| exceeds roughly the straddle at entry; (ii) the marginal theta per minute in the last 30 minutes is 3–4× the mid-day rate under either clock, so time stops should be stated in *remaining-variance* units (s_rem) rather than minutes.

- **[B, exchange] Cboe (Schwartz 2025)**, https://www.cboe.com/insights/posts/henry-schwartzs-zero-day-spx-iron-condor-strategy-a-deep-dive: "theta becomes extreme in the final hours," gamma "increases exponentially at expiration" — a position up ~$150 five minutes before the close can lose $400–500 on a small move. The article's short-premium rules (enter after morning volatility settles / after 8:30 data, avoid Fed days, leave a standing 10-cent bid, hold to settlement) are the mirror image of what a *long*-premium trader must avoid: do not be long premium into the last 30–60 minutes unless the position is already deep ITM (delta → 1, theta → 0).
- **[B] Retail outcomes.** Beckmeyer, Branger & Gayda, "Retail Traders Love 0DTE Options … But Should They?" (SSRN; blocked here, not opened) is the usual citation for retail 0DTE losses; I do not quote its numbers. Cboe (Xu 2025) estimates retail at 50–60% of SPX 0DTE volume.
- **Testable "when to sell" rules** (each is a hypothesis; none is established in the sources reached):
  1. **Variance-budget stop:** exit when the fraction of remaining session variance s_rem(t) falls below a threshold (e.g., 0.25) *unless* |delta| > 0.8. Rationale: value ∝ √s_rem.
  2. **Realized/expected target:** exit when the realized move since entry ≥ k × (straddle at entry), k ∈ {0.8, 1.0, 1.25}; test k on a grid, report DSR for the grid size.
  3. **Signal-decay stop:** exit when the ensemble probability crosses back through 0.5 (or 0.55) — this is the only exit that uses the lean itself; test whether it beats a pure time stop.
  4. **Trailing in delta space:** trail a stop at (peak option value − m × current gamma-implied 1-SD move); m ∈ {1, 1.5}.
  5. **Hard time stop at 15:30** for anything not ITM, motivated by the decay table and by Baltussen's last-30-minute momentum (which is a reason to be *short* gamma, not long, in the last half hour unless you are already on the right side).
  Evaluate each on option P&L after spread, by time-of-entry bucket and by macro flag, with the n-thresholds of §3.7.

---

## 6. Public repos and references for online-learning signal ensembles

| Resource | What it is | Reusable for this tool | Caveats |
|---|---|---|---|
| **Marigold/universal-portfolios** https://github.com/Marigold/universal-portfolios | Python collection of 24 online-portfolio-selection algorithms incl. **Exponential Gradient, AdaHedge, Soft-Bayes, ONS, Universal Portfolios, OLMAR, PAMR, CORN** with a common `Algo` base class; pip-installable | EG/AdaHedge/ONS implementations as reference code for weight updates on a simplex; `Algo` pattern for pluggable experts | README itself says datasets are survivor-biased, costs often ignored, some parameters tuned on test data, "educational"; license not shown on page |
| **OLPS/OLPS** https://github.com/OLPS/OLPS | MATLAB/Octave toolbox (Li, Sahoo, Hoi), Apache-2.0, v1.1.0 June 2015 | Algorithm catalogue and benchmark harness | Unmaintained since 2015; MATLAB |
| **online-ml/river** https://github.com/online-ml/river | Python online ML (BSD-3): `learn_one/predict_one`, online **logistic regression** with pluggable optimizers, **drift detection**, bagging/boosting/stacking, progressive validation, online metrics | Online logistic stacker on indicator outputs; drift detectors to trigger α (fixed-share) bursts; rolling metrics | General-purpose; no finance-specific evaluation |
| **VowpalWabbit/vowpal_wabbit** https://github.com/VowpalWabbit/vowpal_wabbit | C++ online learner with bindings; sparse SGD, reductions, contextual bandits | If you later want to treat "which indicator to trust today" as a contextual bandit | Heavier dependency; license not shown on page |
| **robcarver17/pysystemtrade** https://github.com/robcarver17/pysystemtrade (GPL-3; now maintained under pst-group) | Full systematic-futures stack implementing Carver's *Systematic Trading*: forecast scaling to |10|, cap ±20, equal-weight default, shrinkage/handcrafting weights, forecast diversification multiplier | The forecast-scaling/capping/combination conventions are directly transplantable to a directional-lean display | Daily-frequency futures, not intraday options; GPL |
| **Arora–Hazan–Kale survey** https://theoryofcomputing.org/articles/v008a006/ | The MWU/Hedge reference with proofs | Cite the exact theorem for your η choice | — |
| **de Rooij et al. AdaHedge/FlipFlop (JMLR 2014)** https://jmlr.org/papers/v15/rooij14a.html | Parameter-free Hedge; code was released with the paper (not fetched) | Drop-in replacement for fixed-η Hedge | — |
| **scikit-learn calibration module** https://scikit-learn.org/stable/modules/calibration.html | `CalibratedClassifierCV`, `calibration_curve`, `FrozenEstimator` | Platt/isotonic on held-out window; reliability plots | — |

No public repository implementing "Hedge over trading signals with fixed-share forgetting and Platt calibration" as a packaged library was found by direct URL; the components above cover it in <300 lines.

---

## 6A. Source list (all accessed 2026-11-06)

Primary documents parsed in full text locally:
- Lucca & Moench, "The Pre-FOMC Announcement Drift," FRBNY Staff Report 512 (Sept 2011, rev. Aug 2013). https://www.newyorkfed.org/research/staff_reports/sr512.html ; PDF https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr512.pdf ; JF 2015 https://doi.org/10.1111/jofi.12196 [B]
- Boyarchenko, Larsen & Whelan, "The Overnight Drift," FRBNY Staff Report 917 (Feb 2020, rev. Aug 2022). https://www.newyorkfed.org/research/staff_reports/sr917.html ; PDF https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr917.pdf [B]
- Osler, "Support for Resistance: Technical Analysis and Intraday Exchange Rates," FRBNY EPR July 2000. https://www.newyorkfed.org/research/epr/00v06n2/0007osle.html ; PDF https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf [B]
- Arora, Hazan & Kale, "The Multiplicative Weights Update Method," Theory of Computing 8 (2012). https://theoryofcomputing.org/articles/v008a006/ [A]
- Zinkevich, "Online Convex Programming and Generalized Infinitesimal Gradient Ascent," ICML 2003. https://cdn.aaai.org/ICML/2003/ICML03-120.pdf [A]
- Niculescu-Mizil & Caruana, "Predicting Good Probabilities with Supervised Learning," ICML 2005. https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf [B]
- Hoeting, Madigan, Raftery & Volinsky, "Bayesian Model Averaging: A Tutorial," Statistical Science 14(4) 1999. https://www.stat.colostate.edu/~jah/papers/statsci.pdf [A]
- SqueezeMetrics, "Gamma Exposure (GEX)," white paper, Mar 2016 rev. Dec 2017. https://squeezemetrics.com/monitor/download/pdf/white_paper.pdf [C]

Abstracts read (Crossref / OpenAlex / Semantic Scholar DOI lookups, or publisher/arXiv pages):
- Lou, Polk & Skouras, JFE 2019. https://doi.org/10.1016/j.jfineco.2019.03.011 [B]
- Gao, Han, Li & Zhou, JFE 2018. https://doi.org/10.1016/j.jfineco.2018.05.009 [B]
- Baltussen, Da, Lammers & Martens, JFE 2021. https://doi.org/10.1016/j.jfineco.2021.04.029 [B]
- Kurov, Wolfe & Gilbert, FRL 2021. https://doi.org/10.1016/j.frl.2020.101781 [B]
- Hu, Pan, Wang & Zhu, JFE 2022. https://doi.org/10.1016/j.jfineco.2021.09.015 [B]
- Cieslak, Morse & Vissing-Jorgensen, JF 2019. https://doi.org/10.1111/jofi.12818 [B]
- Savor & Wilson, JFQA 2013. https://doi.org/10.1017/S002210901300015X [B]
- Ai & Bansal, Econometrica 2018. https://doi.org/10.3982/ECTA14607 [B]
- Kurov, Sancetta, Strasser & Wolfe, JFQA 2019. https://doi.org/10.1017/S0022109018000625 [B]
- Lakonishok & Smidt, RFS 1988. https://doi.org/10.1093/rfs/1.4.403 [B]
- McConnell & Xu, FAJ 2008. https://doi.org/10.2469/faj.v64.n2.11 [B]; Quantpedia summary https://quantpedia.com/strategies/turn-of-the-month-in-equity-indexes/ [B, secondary]
- Etula, Rinne, Suominen & Vaittinen, RFS 2020. https://doi.org/10.1093/rfs/hhz054 [B]
- Ariel, JF 1990. https://doi.org/10.1111/j.1540-6261.1990.tb03731.x [B]
- Quantpedia, "Pre-Holiday Effect" (Hansen & Lunde summary). https://quantpedia.com/strategies/pre-holiday-effect/ [B, secondary]
- Heston, Korajczyk & Sadka, JF 2010. https://doi.org/10.1111/j.1540-6261.2010.01573.x [B]
- Bogousslavsky, JF 2016. https://doi.org/10.1111/jofi.12436 [B]
- Wood, McInish & Ord, JF 1985. https://doi.org/10.1111/j.1540-6261.1985.tb04996.x [B]
- Admati & Pfleiderer, RFS 1988. https://doi.org/10.1093/rfs/1.1.3 [B]
- Stoll & Whaley, FAJ 1987. https://doi.org/10.2469/faj.v43.n2.16 [B]
- Avellaneda & Lipkin, Quant. Finance 2003. https://doi.org/10.1088/1469-7688/3/6/301 [B]
- Ni, Pearson, Poteshman & White, RFS 2021. https://doi.org/10.1093/rfs/hhaa082 [B]
- Caporale & Plastun, Investment Analysts Journal 2017. https://doi.org/10.1080/10293523.2017.1333563 [B]
- Osler, JF 2003. https://doi.org/10.1111/1540-6261.00588 [B]
- Donaldson & Kim, JFQA 1993. https://doi.org/10.2307/2331416 [B]
- Bhattacharya, Holden & Jacobsen, Management Science 2012. https://doi.org/10.1287/mnsc.1110.1364 [B]
- Schwartz, Van Ness & Van Ness, J. Futures Markets 2004. https://doi.org/10.1002/fut.10129 [B]
- Lo, Mamaysky & Wang, NBER WP 7613 (2000). https://www.nber.org/papers/w7613 [B]
- Lehmann, QJE 1990. https://doi.org/10.2307/2937816 [B]; Jegadeesh, JF 1990. https://doi.org/10.1111/j.1540-6261.1990.tb05110.x [B]; Moskowitz, Ooi & Pedersen, JFE 2012. https://doi.org/10.1016/j.jfineco.2011.11.003 [B]; Nagel, RFS 2012. https://doi.org/10.1093/rfs/hhs066 [B]
- Knuteson, arXiv:2010.01727 (2020) https://arxiv.org/abs/2010.01727 ; arXiv:2201.00223 (2022) https://arxiv.org/abs/2201.00223 ; arXiv:1912.01708 (2019) https://arxiv.org/abs/1912.01708 [B pattern / C explanation]
- Stock & Watson, J. Forecasting 2004. https://doi.org/10.1002/for.928 [B]
- Gneiting & Raftery, JASA 2007. https://doi.org/10.1198/016214506000001437 [A]
- Brier, MWR 1950. https://doi.org/10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2 [A]; Murphy decomposition via https://en.wikipedia.org/wiki/Brier_score [A]
- Zadrozny & Elkan, KDD 2002. https://doi.org/10.1145/775047.775151 [A]
- White, Econometrica 2000. https://doi.org/10.1111/1468-0262.00152 [A]; Hansen, JBES 2005. https://doi.org/10.1198/073500105000000063 [A]; Harvey, Liu & Zhu, RFS 2016. https://doi.org/10.1093/rfs/hhv059 [B]; Bailey & López de Prado, JPM 2014. https://doi.org/10.3905/jpm.2014.40.5.094 [A]; Harvey & Liu, JPM 2015. https://doi.org/10.3905/jpm.2015.42.1.013 [A]
- de Rooij, van Erven, Grünwald & Koolen, JMLR 2014. https://jmlr.org/papers/v15/rooij14a.html [A]
- Hazan, arXiv:1909.05207. https://arxiv.org/abs/1909.05207 [A]; Cesa-Bianchi & Lugosi (CUP 2006). https://www.cambridge.org/core/books/prediction-learning-and-games/A05C9F6ABC752FAB8954C885D0065C8F [A]
- Wikipedia, Multiplicative weight update method. https://en.wikipedia.org/wiki/Multiplicative_weight_update_method [A]; Binomial proportion confidence interval. https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval [A]
- scikit-learn, Probability calibration. https://scikit-learn.org/stable/modules/calibration.html [A]

Exchange / official pages:
- Cboe, Xu, "Volatility Insights: Much Ado About 0DTEs" (2023-09-08). https://www.cboe.com/insights/posts/volatility-insights-evaluating-the-market-impact-of-spx-0-dte-options/ [B, exchange]
- Cboe, Xu, "0DTEs Decoded" (2025-05-02). https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact [B, exchange]
- Cboe, Doar, "The Evolution of Same Day Options Trading" (2023-08-03). https://www.cboe.com/insights/posts/the-evolution-of-same-day-options-trading [A/B]
- Cboe, "Henry Schwartz's Zero-Day SPX Iron Condor Strategy" (2025-10-01). https://www.cboe.com/insights/posts/henry-schwartzs-zero-day-spx-iron-condor-strategy-a-deep-dive [C/B]
- Cboe, 0DTE product page. https://www.cboe.com/tradable-products/0dte [A]
- Cboe, "State of the Options Industry Q3 2026" (2026-10-19). https://www.cboe.com/insights/posts/state-of-the-options-industry-q-3-2026-volume-growth-concentrated-in-index-and-etf-options [A]
- Cboe, SPX contract specifications. https://www.cboe.com/tradable-products/sp-500/spx-options/spx-specifications [A]
- Cboe, daily market statistics (2026-11-05 SPX+SPXW volume 8,287,109; P/C 1.24). https://www.cboe.com/us/options/market_statistics/daily/ [A]
- Federal Reserve, FOMC calendars (2026 dates). https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm [A]
- BLS, CPI release schedule. https://www.bls.gov/schedule/news_release/cpi.htm [A]; Employment Situation schedule. https://www.bls.gov/schedule/news_release/empsit.htm [A]

Practitioner / working papers (pages read; PDFs not opened):
- Concretum Group papers index. https://concretumgroup.com/papers/ ; Zarattini & Aziz, "Can Day Trading Really Be Profitable?" https://concretumgroup.com/can-day-trading-really-be-profitable/ (SSRN 4416622) ; Zarattini, Aziz & Barbon, "Beat the Market" https://concretumgroup.com/beat-the-market-an-effective-intraday-momentum-strategy-for-sp500-etf-spy/ (SSRN 4824172) ; Zarattini & Aziz, VWAP https://concretumgroup.com/volume-weighted-average-price-vwap-the-holy-grail-for-day-trading-systems/ [B-weak]

Repositories:
- https://github.com/Marigold/universal-portfolios ; https://github.com/OLPS/OLPS ; https://github.com/online-ml/river ; https://github.com/VowpalWabbit/vowpal_wabbit ; https://github.com/robcarver17/pysystemtrade (docs: https://github.com/robcarver17/pysystemtrade/blob/master/docs/backtesting.md)

Titles verified via Crossref only (abstract/body not opened in this session):
- Birru, JFE 2018 https://doi.org/10.1016/j.jfineco.2018.06.008 ; Chong, Hudson, Keasey & Littler, JIMF 2005 https://doi.org/10.1016/j.jimonfin.2005.08.015 ; Golez & Jackwerth, JFE 2012 https://doi.org/10.1016/j.jfineco.2012.06.010 ; Ni, Pearson & Poteshman, JFE 2005 https://doi.org/10.1016/j.jfineco.2004.08.005 ; Plastun, Sibande, Gupta & Wohar, NAJEF 2020 https://doi.org/10.1016/j.najef.2020.101177 ; Bogousslavsky, JFE 2021 https://doi.org/10.1016/j.jfineco.2020.07.020 ; Hendershott, Livdan & Rösch, JFE 2020 https://doi.org/10.1016/j.jfineco.2020.06.006 ; Bogousslavsky & Muravyev, JFM 2023 https://doi.org/10.1016/j.finmar.2023.100852 ; French & Roll, JFE 1986 https://doi.org/10.1016/0304-405X(86)90004-8 ; Harris, JFE 1986 https://doi.org/10.1016/0304-405X(86)90044-9 ; Andersen & Bollerslev, JEF 1997 https://doi.org/10.1016/S0927-5398(97)00004-2 ; Timmermann, Handbook of Economic Forecasting 2006 https://doi.org/10.1016/S1574-0706(05)01004-9 ; Diebold & Shin, IJF 2019 https://doi.org/10.1016/j.ijforecast.2018.09.006 ; Freund & Schapire, JCSS 1997 https://doi.org/10.1006/jcss.1997.1504 ; Kivinen & Warmuth, Inf. & Comp. 1997 https://doi.org/10.1006/inco.1996.2612 ; Herbster & Warmuth, Machine Learning 1998 https://doi.org/10.1023/A:1007424614876 ; Brenner & Subrahmanyam, FAJ 1988 https://doi.org/10.2469/faj.v44.n5.80

Not reachable in this session (not relied upon): SSRN pages for Beckmeyer–Branger–Gayda, Dim–Eraker–Vilkov, Brogaard–Han–Won; quantifiedstrategies.com gap pages (bot wall); Quantpedia "market intraday momentum"/"FOMC drift" pages (404/500); CME E-mini specification pages (503 at time of access — ES Globex hours are described in Boyarchenko et al. as Sunday 18:00 to Friday 17:00 ET with a daily maintenance halt); Nasdaq closing-cross page (503); Timmermann chapter PDF (UCSD 503); Alpha Architect summary (403).

## 6B. Reproduction notes for the computed numbers

- Wilson interval: w± = [p̂ + z²/2n ± z√(p̂(1−p̂)/n + z²/4n²)] / (1 + z²/n), z = 1.96. One-sided threshold: p̂ ≥ 0.5 + 1.645·√(0.25/n). Power: n = ((1.645·0.5 + 0.842·√(p₁(1−p₁)))/(p₁ − 0.5))².
- Gap-fill null: P(touch within session) = 2(1 − Φ(g/σ_session)); driftless Brownian motion, reflection principle.
- 0DTE decay: value_fraction(t) = √(1 − s(t)), s(t) = cumulative share of session variance; uniform clock s(t) = elapsed/6.5h; U-shape weights per half-hour were illustrative (first 17%, last 12%) and must be replaced by estimates from 1-minute data.
- Hedge η: η = √(ln n / T); n = 25, T = 2000 → 0.040; T = 250 → 0.113.

---

## 7. Recommended ensemble design (concrete)

### 7.1 Objects

- **Decision instants.** Fixed grid: 9:35, 10:00, 10:30, 11:00, 12:00, 13:00, 14:00, 15:00, 15:30 ET (nine per session). A "decision" at instant t is a probability p_t that SPX closes (or reaches a stated horizon h ∈ {30 min, 60 min, close}) above the price at t. Using a fixed grid, not every bar, keeps the sample-size arithmetic (§3.7) honest and makes decisions roughly independent across instants.
- **Experts (indicators).** Each expert j emits a probability q_{j,t} ∈ [0.02, 0.98] for the *same* event, or abstains (q = 0.5 with an `abstain` flag; abstentions receive zero loss so they neither gain nor lose weight). Target 15–30 experts in 6 families: (a) calendar/event flags, (b) overnight/prior-session features, (c) intraday momentum/ORB/VWAP state, (d) level proximity (§2), (e) volatility/variance-budget state, (f) option-flow proxies (put/call, 0DTE straddle change, GEX-style estimate). Every expert is a *transparent rule* with ≤3 parameters, written down in a registry with its first-seen date (for DSR counting).
- **Losses.** Brier loss ℓ_{j,t} = (q_{j,t} − y_t)² ∈ [0,1], with y_t the realized direction. Report log loss as a diagnostic only.

### 7.2 Weighting (Hedge + shrinkage + fixed-share + clamp)

```
# per expert j, per decision t
L_j(t)   = (1 - 1/h) * L_j(t-1) + ℓ_{j,t}              # exponentially decayed cumulative Brier loss, half-life h decisions (start h = 500 ≈ 55 sessions × 9 instants)
w_j      = exp(-η * L_j(t))                             # Hedge; η = sqrt(ln n / T_target), T_target = 2000 → η ≈ 0.04 for n = 25   [A: AHK Thm 2.3]
w_j      = (1-α) * w_j / Σw  +  α / n                   # fixed-share, α = 0.01                                                     [A: Herbster–Warmuth]
w_j      = clip(w_j, 0.2/n, 5/n); renormalize           # clamp
w_j_disp = λ/n + (1-λ) * w_j, λ = max(0.3, 1 - T_oos/2000)  # shrink toward equal weights                                          [B: Stock–Watson; Timmermann]
```

- Combined forecast: **logit pooling** p̃_t = σ(Σ_j w_j_disp · logit(q_{j,t})) — pools evidence multiplicatively and keeps abstainers neutral. (Linear pooling Σ w q is acceptable and easier to explain; it is less sharp. Pick one and never switch mid-record.)
- **Calibration:** p_t = Platt(p̃_t) fitted on the trailing 500 out-of-sample decisions, refit weekly; switch to isotonic only when the trailing window exceeds ~1,000 decisions *and* the reliability diagram shows non-sigmoid distortion.
- **Clustering first:** compute N_eff on the trailing 500 decisions; if N_eff < n/2, hierarchical-cluster experts at |ρ| > 0.7, average q within clusters, run Hedge over clusters. Display both n and N_eff.
- **Context gating (the only "non-linearity"):** a small set of *hard-coded* gates that switch experts on/off by time-of-day or event flag, each justified by a [B] source: intraday-momentum experts active only at the 15:00 and 15:30 instants (Baltussen; Gao et al.); pre-FOMC expert active only inside the 2pm→2pm window; opening-hour-fade expert active only when a stress proxy (VIX ≥ 25, or trailing 20-day realized vol in top quartile) is on (Boyarchenko et al. subsample result); macro-day experts active only on macro days. Gates are documented and immutable for the record period.

### 7.3 Display ("transparent")

For each decision: the pooled p_t with its Wilson-based 95% band from the calibration window; the list of active experts with q_j, w_j_disp, w_j_disp/(1/n) ("× default"), n_j and the Wilson interval of its own hit rate; N_eff; the current Brier of the ensemble vs the 0.25 constant-0.5 benchmark and vs the best single expert *in hindsight* (Hedge regret, shown as a number); the expected move (§4) and the variance-remaining fraction s_rem(t); the registry count used in the DSR.

### 7.4 Evaluation plan before any weight is trusted

1. **Burn-in:** run the full stack live-paper for ≥ 300 decisions (≈ 35 sessions) with λ = 1 (pure equal weights) before letting Hedge move the display.
2. **Benchmarks:** (i) constant 0.5; (ii) equal-weight pool; (iii) best-single-expert-in-hindsight; (iv) prior-day-direction. The ensemble must beat (i) and (ii) on Brier with a block-bootstrap p < 0.05 (White/Hansen SPA against the registry) before λ drops below 1.
3. **Economic test:** translate p_t into a long-call/long-put/no-trade decision with a stated spread model (e.g., pay 1.5× half-spread on entry and exit) and the exit rules of §5; report P&L per decision with its own interval. A Brier improvement that does not survive this step is not actionable.
4. **Out-of-sample discipline:** every hyperparameter (η, h, α, clamp, λ schedule, gate thresholds, tol for levels) is chosen on data before a declared cutoff date and frozen; subsequent changes are logged as new "trials" in the registry.

### 7.5 Full online loop (reference pseudocode)

```
registry  = load_registry()            # every expert ever tried, with first-seen date → used for DSR/haircut
experts   = registry.active()          # n experts, each: rule(features, t) -> q in [0.02,0.98] or ABSTAIN
L         = zeros(n)                   # decayed cumulative Brier loss
T_oos     = 0
calib     = PlattCalibrator(window=500)

for session in sessions:
    f_day = build_day_features(session)              # dow, tom_flag, macro_day, opex_flag, vix_level, s(t) profile, OI walls ...
    for t in DECISION_GRID:                          # 9:35 ... 15:30
        f = f_day | build_intraday_features(t)       # overnight_ret, first30_ret, rest_of_day_ret, orb_state, vwap_state, level_prox, straddle_em ...
        active = [j for j in experts if gate(j, f, t)]           # hard-coded, documented gates (§7.2)
        q = {j: experts[j].rule(f, t) for j in active}
        w = {j: exp(-eta * L[j]) for j in active}; w = normalize(w)
        w = {j: (1-alpha)*w[j] + alpha/len(active) for j in active}            # fixed-share
        w = clip_and_renormalize(w, lo=0.2/len(active), hi=5/len(active))      # clamp
        lam = max(0.3, 1 - T_oos/2000)
        w_disp = {j: lam/len(active) + (1-lam)*w[j] for j in active}           # shrink to equal
        p_raw = logit_pool(q, w_disp)                                          # or linear pool; fixed for the record
        p = calib.transform(p_raw)
        n_eff = effective_number(trailing_outputs(500))
        display(p, wilson_band(calib), q, w_disp, n_eff, straddle_em(t), s_rem(t), registry.count())
        decisions.append((t, q, w_disp, p_raw, p))

    # after the horizon resolves (e.g., at the close)
    for (t, q, w_disp, p_raw, p) in decisions:
        y = realized_direction(t, horizon)
        for j in q: 
            if q[j] != ABSTAIN:
                L[j] = (1 - 1/h) * L[j] + (q[j] - y)**2
        calib.update(p_raw, y)
        T_oos += 1
    report_weekly(brier_vs_benchmarks, regret_vs_best_expert, reliability_diagram, DSR(registry.count()))
```

Parameters frozen before the live record: `eta = sqrt(ln n / 2000)`, `alpha = 0.01`, `h = 500`, clamp [0.2/n, 5/n], `lam` schedule as shown, Platt window 500, decision grid and horizon.

### 7.6 In-house experiments the literature leaves open (specify before running; log each as a trial)

1. **Last-30-minute return → next-morning return.** Regress 9:30→10:00 ES return on prior 15:30→16:00 return, 2015–2026, with and without a stress gate (VIX ≥ 25) and separately for up vs down closes (Boyarchenko asymmetry). Report slope, t (HAC), and the hit rate with Wilson interval; n ≈ 2,800 sessions.
2. **Intraday momentum in the 0DTE era.** Replicate Baltussen's last-30-minute regression on ES 2016–2026, split pre/post May 2022 (Tue/Thu expirations) and by sign of a GEX-style estimate; test whether the coefficient changed.
3. **TOM intraday decomposition.** For days −1…+3 vs others, split the close-to-close return into overnight and 9:30–16:00 components; the literature predicts the intraday share is small or negative.
4. **Gap-fill vs reflection baseline.** For each session compute gap_z and whether the prior close was touched; plot empirical fill rate by gap_z decile against 2(1−Φ(gap_z)); any excess is the real "gap-fill edge."
5. **S/R random-level test in ES.** Implement Osler's procedure (hit tolerance, 15-minute bounce window, 10,000 random levels per month) for each level family in §2.2 separately, then for confluence deciles.
6. **0DTE realized/implied ratio by time of day.** |close − S_t| / straddle_t at each decision instant, macro vs non-macro days, 2022–2026; this calibrates the expected-move display and the exit rules in §5.
7. **Exit-rule tournament.** Rules 1–5 of §5 on a grid, evaluated on option P&L after spread, with the DSR computed for the grid size; pre-register the grid.
8. **Pre-FOMC window 2020–2026.** Replicate the 2pm→2pm return with t-stats; eight observations per year means ≥5 years for any power — report the interval, not a verdict.

---

## 8. Feature list with definitions, availability time, and failure cases

Times are ET. "Avail." is the earliest instant the feature is final.

| # | Feature | Definition | Avail. | Evidence | Known failure cases |
|---|---|---|---|---|---|
| 1 | `dow` | Day of week (Mon–Fri) | 00:00 | §1.1 [B: dead/weak for large caps post-1990] | Holidays shift the week; Mondays after 3-day weekends are not "Mondays" in the original sense |
| 2 | `tom_flag` | 1 if session is in [last trading day of month, 3rd trading day of next month] | 00:00 | McConnell–Xu [B: +0.15%/day vs +0.01%, 1926–2005] | Documented close-to-close, not intraday; quarter-end rebalancing can reverse the sign on day −1 (Etula et al.) |
| 3 | `pre_holiday` / `early_close` | 1 if next session is a market holiday; 1 if today closes at 13:00 | 00:00 | Ariel [B, 1963–82]; decline post-1980s [B] | Early close changes the variance clock and SPXW expiry time (13:00) — a mechanical feature, not a lean |
| 4 | `pre_fomc_window` | 1 between 14:00 the day before a scheduled FOMC statement and 14:00 on statement day | 14:00 D−1 | Lucca–Moench [B: 49 bp, 1994–2011]; Kurov et al. [B: gone after 2015] | Unscheduled meetings; release-time changes (12:30–14:00 since 2011); the effect may not exist in your sample |
| 5 | `fomc_cycle_week` | Weeks since last FOMC meeting, parity | 00:00 | Cieslak et al. [B, since 1994, multi-day] | Not intraday; meeting-schedule irregularities |
| 6 | `macro_day` | Categorical {CPI, NFP, FOMC, ISM, GDP, PCE, other, none} with release time | 00:00 | Savor–Wilson [B: 11.4 vs 1.1 bp/day]; Hu et al. [B: premium is overnight before]; Kurov et al. 2019 [B: 30-min pre-release drift] | 8:30 releases are pre-open: by 9:30 the premium is realized; variance, not direction, is what remains |
| 7 | `opex_flag` / `witching_flag` | 1 on third Friday; 1 on quarterly third Friday | 00:00 | Stoll–Whaley [B, 1984–85, stale mechanics]; Golez–Jackwerth [title only] | AM settlement moved the monthly pin to the open; 0DTE pins are at the close every day now |
| 8 | `overnight_ret` | open / prior close − 1 | 09:30:00 | Boyarchenko et al. [B]; LPS [B] | Opening print noise; use 9:30:30 mid of ES rather than the cash print |
| 9 | `gap_z` | overnight_ret / σ_session forecast | 09:30 | §1.7 [A baseline] | Blog gap statistics ignore the reflection baseline; σ forecast error |
| 10 | `prior_last30_ret` | prior session 15:30→16:00 return | prior close | Baltussen (reverts next days) [B]; Boyarchenko (closing imbalance → overnight reversal, asymmetric) [B] | Asymmetry: selloffs reverse more than rallies; reversal is mostly *overnight* and may be spent by 9:30 |
| 11 | `prior_day_ret`, `ret_5d` | Close-to-close returns | prior close | §1.9 [C for index] | Zero prior weight; expect nothing |
| 12 | `first30_ret` | 9:30→10:00 return | 10:00 | Gao et al. [B: predicts last 30 min, 1993–2013] | Target is the *last* half hour, not the next bar; weaker on quiet days |
| 13 | `rest_of_day_ret` | prior close → 15:30 return | 15:30 | Baltussen et al. [B: 60+ futures 1974–2020] | Only valid for the 15:30→16:00 horizon; reverts next day |
| 14 | `orb_state` | Price vs first-5/15/30-min range (above/inside/below) | 09:35/09:45/10:00 | Zarattini–Aziz [B-weak, promotional, leveraged] | Range width scales with σ; use range/σ_session; breakouts in the first minutes are often noise |
| 15 | `vwap_state`, `avwap_state` | Sign(price − VWAP), distance in σ; same anchored at prior-day close / FOMC / CPI | continuous | Concretum VWAP [B-weak]; no academic S/R evidence | Early-session VWAP is unstable (few prints); anchor choice is a researcher degree of freedom (count it) |
| 16 | `level_prox` | Distance to nearest level in strength deciles (§2.2); `at_level` if within tol | continuous | Osler [B: +4–6 pp]; Donaldson–Kim [B]; SVV [B: clustering] | Level sets overlap at round numbers → confluence double-counts; tolerance choice; break vs bounce are both real |
| 17 | `round_prox` | Distance to nearest 50/100-point SPX level | continuous | BHJ [B: imbalance monotonic in roundness]; Donaldson–Kim [B] | Effects documented at the DJIA 100s and penny grid; SPX 50s are an extrapolation |
| 18 | `vix_level`, `rv20`, `stress` | VIX close D−1; 20-day realized vol; stress = top quartile | prior close | Lucca–Moench (VIX conditioning) [B]; Boyarchenko (opening hour negative only in recessions) [B]; Nagel [B] | Regime flags are slow; VIX term-structure inversions matter more than level on event days |
| 19 | `s_rem(t)` | Fraction of session variance remaining from the U-shape estimate | continuous | §4 [A/B] | Must be re-estimated for macro days and half days; stale on regime change |
| 20 | `straddle_em` | 0DTE ATM straddle mid (E\|move\| to close); and its change since 9:35 | continuous (quotes) | §4 [A] | Wide quotes at 9:30–9:35; strike granularity near the money; use mid, never last |
| 21 | `rv_iv_ratio` | Trailing realized \|move to close\| / straddle at the same time-of-day bucket | prior close | §4 [C → your own data] | Needs ≥60 sessions per bucket; event days separate |
| 22 | `pcr_0dte`, `pcr_all` | SPX put/call volume ratio (Cboe daily shows 1.24 on 2026-11-05) | 15-min lag | Cboe stats [A] | Intraday series are vendor-dependent; the Cboe page is EOD |
| 23 | `gex_est` | GEX-style net dealer gamma estimate from OI × gamma × sign assumptions | prior close | SqueezeMetrics [C]; NPPW [B: hedge rebalancing affects volatility]; Baltussen [B] | Sign assumptions unverifiable; Cboe (2023, 2025) says net MM gamma is small vs ES liquidity; use only as a *variance/momentum gate*, not direction |
| 24 | `oi_wall` | Strikes with top-decile 0DTE OI within ±1 straddle of spot | 09:30 + updates | Avellaneda–Lipkin [B model]; Golez–Jackwerth [title] | Pinning is an *expiration* effect — relevant only for the last hour; OI updates lag |
| 25 | `minutes_since_release` | Minutes since the last scheduled release today | continuous | Kurov et al. 2019 [B: drift ends at release] | Only meaningful for 10:00 releases (ISM, consumer sentiment) in a 9:30+ tool |
| 26 | `time_of_day` | Decision-instant index | continuous | §1.10 [B: regular-session hourly means are flat] | Never a standalone lean; use as gate and variance clock |

---

## 9. What NOT to do (pitfalls)

1. **Do not ship the pre-FOMC drift as a standing lean.** The 49-bp result is 1994–2011; the follow-up says it essentially vanished after 2015. If it is in the ensemble, it starts at zero prior weight and must earn it.
2. **Do not import close-to-close anomalies (TOM, holiday, day-of-week, FOMC cycle) as 9:30–16:00 leans.** The tug-of-war and overnight-drift literature says most of those returns accrue overnight; the intraday residual is often opposite in sign.
3. **Do not use hit rate as the scoring rule or ranking statistic.** It is improper and, at n < 300, almost pure noise (§3.7). Use Brier for updates and show Wilson intervals.
4. **Do not let BMA/Hedge with η ≈ 1 drive the display.** Posterior weights collapse onto the lucky expert within a few dozen decisions; Stock–Watson/Timmermann say the mean is hard to beat precisely because learned weights chase recent performance.
5. **Do not estimate combination weights in-sample, ever** (Carver's "(never!)"); do not re-tune η/α/λ after seeing live results without logging a new trial.
6. **Do not count only surviving indicators in the DSR.** The registry must include every rule variant ever evaluated; with 50 trials the expected maximum t-stat of pure noise is already ~2.2.
7. **Do not treat a GEX sign as observable.** Dealer positioning is inferred under strong assumptions; Cboe's transaction-level analysis puts net MM gamma at ≤0.2% of SPX daily liquidity on average. Use it, if at all, as a volatility-regime gate.
8. **Do not quote "gaps fill 70% of the time" style statistics without the reflection baseline** (§1.7); a 0.3σ gap fills ~77% of the time with zero information.
9. **Do not validate support/resistance against "no level."** Validate against 10,000 random levels (Osler); the base bounce rate at *any* level is ~55–60% in FX data and will be similar in ES.
10. **Do not scale volatility by calendar time or by a flat intraday clock.** Use the U-shape estimated from your data; the error at 15:00 is on the order of 30–40% of the remaining variance (§4 illustration).
11. **Do not hold long 0DTE premium into the last 30–60 minutes on a directional lean alone.** Value ∝ √(remaining variance); the only exception is deep-ITM (delta → 1).
12. **Do not read "last-30-minute momentum" as a next-morning lean.** It reverts over the following days (Baltussen) and the closing imbalance reverses overnight, asymmetrically (Boyarchenko).
13. **Do not trust promotional day-trading backtests** (ORB/VWAP 1,000%+ figures) without the PDF, the leverage, and the cost model; treat them as hypotheses.
14. **Do not switch pooling rule, calibration method, or decision grid mid-record**; each switch invalidates the running Brier/regret comparison.
15. **Do not display an indicator's weight without its n and interval**; "weight 2.3× default, n = 41" is the honest form.

---

## 10. Uncertainties

1. **Post-2020 magnitude of intraday momentum in SPX/ES is unquantified here.** Gao et al. end in 2013; Baltussen et al. end in 2020. Whether the 0DTE regime (2022+) strengthened (more gamma hedging) or weakened (Cboe says dealers are mostly balanced) the last-30-minute effect is an open empirical question; the two mechanisms point in opposite directions.
2. **Pre-FOMC drift in 2020–2026.** Kurov et al. end in Dec 2019; the 2022–2023 hiking cycle and 2024–2026 are untested in anything reached here. Hu et al. suggest the drift is a function of *uncertainty build-up*, so it may reappear episodically.
3. **Turn-of-month and pre-holiday post-2015.** No out-of-sample test beyond 2005 (TOM) or the early 1990s (holidays) was reached.
4. **Gap-fill statistics.** No reputable published distribution of same-day fill probability by gap size for SPY/ES was reachable; the reflection-principle baseline is the only number in this memo, and it assumes zero drift and constant volatility.
5. **Support/resistance in index futures specifically.** Osler is FX (1996–98); Donaldson–Kim is DJIA 100-levels (pre-1993); Schwartz et al. is price *clustering*, not reversal. There is no peer-reviewed bounce-frequency study of prior-day H/L, opening range, VWAP or GEX walls in ES that I could reach. The scoring in §2.2 is a proposal, not an estimate.
6. **Volume migration to the close (2023–2026).** The "~one-third at the close" figure is unverified here; Bogousslavsky–Muravyev (2023) abstract was not opened.
7. **0DTE academic literature.** Beckmeyer–Branger–Gayda, Dim–Eraker–Vilkov, Brogaard–Han–Won and related SSRN papers were not opened (403). Their findings on retail losses, intraday timing of 0DTE flow, and volatility propagation are *not* reflected above; Cboe's exchange research is the only 0DTE source used, and Cboe has an interest in the "0DTE is benign" conclusion.
8. **Birru (2018), Chong et al. (2005), Golez–Jackwerth (2012), Ni–Pearson–Poteshman (2005), Bogousslavsky (2021), Hendershott et al. (2020), French–Roll (1986), Harris (1986), Andersen–Bollerslev (1997), Timmermann (2006), Diebold–Shin (2019), Freund–Schapire (1997), Kivinen–Warmuth (1997), Herbster–Warmuth (1998)** — titles verified via Crossref DOIs; abstracts/bodies not opened in this session. Where I describe them, it is the standard characterization; magnitudes are deliberately omitted.
9. **Gao et al.'s R² / hit rate and Baltussen's per-market effect sizes** are in the paper bodies, not the abstracts; they are not quoted.
10. **Illustrative U-shape weights** in §4/§5 are placeholders; the decay table shifts materially with the true intraday variance profile, which differs on macro days and half days.
11. **Hyperparameters (η, h, α, clamp, λ schedule)** are reasoned defaults from regret theory and the forecast-combination literature, not fitted values; they must be chosen on a pre-cutoff sample and frozen.
12. **Learning-rate theory assumes bounded, adversarial losses and a known horizon**; AdaHedge removes the horizon assumption, but nothing in the theory speaks to *economic* performance after option spreads. That is the §7.4 step 3 test, and it has not been run.

---
