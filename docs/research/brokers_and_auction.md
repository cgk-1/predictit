# Research memo: US retail-broker rules for expiring (0DTE) SPX/SPY options, and NYSE/Nasdaq/Arca closing-auction mechanics + S&P 500 close computation

Prepared: 2026-11-06 (all URLs accessed 2026-11-06)
Scope: inputs for a private SPX/SPY options decision tool that acts in the 3:50-4:00 pm ET window.

## 0. How to read this memo

- Every factual bullet carries a [source](url) (accessed 2026-11-06). Where a page was read in full, exact policy text is quoted in "double quotes".
- Verification status tags:
  - VERIFIED: the official page/PDF was fetched and read in this session.
  - SNIPPET: the official page could not be fetched in this session (HTTP 403/503/404 from the host), and the text comes from search-engine excerpts of that official page. Treat as probably-correct but re-check before coding hard constants.
  - UNVERIFIED: no official source found; forum/third-party/anecdote only, or a figure that could not be confirmed.
- Hosts that refused this session's fetches (so their content is SNIPPET at best): interactivebrokers.com / ibkr.info / ibkb.interactivebrokers.com (403), us.etrade.com (503/empty reply), tastytrade help center (old freshdesk URLs 404; new help center is JS-only), spglobal.com methodology PDFs (403), theocc.com (403; OCC fee text was taken from the SEC-filed exhibit instead), schwab.com (WAF "unable to authorize" page; the official April 2026 Pricing Guide PDF was obtained from disclosures.schwab.com instead).
- The web-search budget for this session was exhausted near the end; a short list of follow-up searches is in the Uncertainties section.

---

## 1. Executive summary (numbers a 3:50-3:59 pm SPX module must respect)

- Expiring SPXW (PM-settled weeklys incl. 0DTE) stop trading at 4:00:00 pm ET ("3:00 pm CT") on expiration day; non-expiring SPX/SPXW trade to 4:15 pm ET plus curb to 5:00 pm ET. VERIFIED, Cboe spec.
- SPXW exercise-settlement value "is calculated using the closing sales price in the primary market of each component security on the expiration date" (i.e., the official closing-auction prints, not the 4:00:00 index tick). Cash is delivered "on the business day following expiration". VERIFIED, Cboe spec.
- Regulatory exercise cut-off for expiring options: 5:30 pm ET (FINRA Rule 2360(b)(23)(A)); brokers may set earlier. VERIFIED. House cut-offs found: Fidelity 4:20 pm ET (VERIFIED, agreement), Webull 4:30 pm ET (VERIFIED), Robinhood 5:00 pm ET DNE (VERIFIED), E*TRADE 5:30 pm ET platform DNE (SNIPPET), tastytrade 3:30 pm CT = 4:30 pm ET DNE (SNIPPET), Schwab: not found (UNVERIFIED), IBKR 5:25 pm ET exercise cut-off (SNIPPET).
- Broker cut-offs for OPENING same-day-expiring positions: Robinhood 3:30 pm ET for stock/ETF options (VERIFIED; index options excluded from the closeout process, and no SPX opening cut-off stated); Webull 3:40 pm ET single-leg / 3:00 pm ET multi-leg (VERIFIED; does not distinguish index); tastytrade blocks sell-to-open with a short leg in the last 30 minutes for equity/ETF options (SNIPPET); Fidelity reserves the right to restrict/cancel opening orders on expiration day with "timing ... may vary" (VERIFIED); Schwab/thinkorswim: no published cut-off found (UNVERIFIED); IBKR, E*TRADE: no published opening cut-off found (UNVERIFIED).
- Forced-liquidation timing for at-risk expiring positions: Robinhood from 3:30 pm ET (3:45 pm for late-close ETF options) - not applied to index options (VERIFIED); E*TRADE "two hours prior to the market close" (SNIPPET); tastytrade "before the market close" with risk-team discretion (SNIPPET); Webull reserves right, no time stated (VERIFIED); IBKR liquidates/lapses based on projected post-expiration exposure, time unstated (SNIPPET); Schwab: anecdotal reports of liquidation ~50 minutes before the close (UNVERIFIED); Fidelity: may close positions / instruct OCC not to exercise when assets insufficient, no time stated (VERIFIED).
- Fee stack per SPX/SPXW contract (customer, Nov 2026): Cboe exchange fee CS $0.36 (premium < $1.00) / CT $0.45 (premium >= $1.00), schedule "Effective November 2, 2026" (VERIFIED, Cboe fee page); Cboe ORF $0.01248 per contract side from July 1, 2026 and only on Cboe executions (VERIFIED, SEC-filed exhibit; before that $0.0023); OCC clearing $0.025/contract (VERIFIED, SEC-filed OCC exhibit); FINRA TAF does not apply to index options and SEC Section 31 fee ($20.60/million, from April 4, 2026) does not apply to index options (VERIFIED via SEC advisory + Robinhood fee page); broker commission $0.65 (Schwab, Fidelity, E*TRADE standard, IBKR top tier), $1.00 open/$0 close (tastytrade), $0.50 ($0.35 Gold) + per-product fee (Robinhood), $0.50 (Webull).
- NYSE closing auction: MOC/LOC entry cutoff 3:50 pm; imbalance published every 1 second from 3:50; after 3:50 only offsetting MOC/LOC; cancels rejected; Closing D Orders may not be entered/modified after 3:59:50; auction at 4:00. VERIFIED (nyse.com).
- Nasdaq closing cross: MOC by 3:55; LOC by 3:58 (late LOCs 3:55-3:58 re-priced); IO until the cross; no cancel/modify after 3:50; NOII every 10 s 3:50-3:55 then every 1 s 3:55-4:00; cross at 4:00 sets NOCP. VERIFIED (Nasdaq 2025 FAQ).
- NYSE Arca (SPY's listing exchange): imbalance publication begins 3:00 pm; Closing Freeze at 3:59 pm (only offsetting MOC/LOC accepted); auction at 4:00 within collars; imbalance "updated at least every second". VERIFIED (nyse.com; FR notice Sept 2025).
- Closing auctions = ~9-10% of a normal day's US volume ($55.5bn/day, 9.44% of notional in Q2 2024; NYSE auction 10.52% of NYSE-listed volume), ~20% on rebalance/expiration days, 34% on Russell reconstitution. VERIFIED (NYSE, BMLL).
- Retail-accessible imbalance data: Massive (ex-Polygon) "NYSE Order Imbalances" add-on $49/month, NYSE-listed only (no SPY, no Nasdaq) (VERIFIED); Databento NYSE/Arca/American imbalance feeds need Plus ($1,750/mo) or Unlimited ($4,500/mo) plus exchange licensing ("start at $1,000/month") (VERIFIED); Nasdaq NOII via TotalView-ITCH (Databento XNAS.ITCH) (VERIFIED); nothing found at Schwab/thinkorswim or IBKR (UNVERIFIED).
- The FINRA pattern-day-trader designation and the $25,000 minimum were eliminated effective June 4, 2026 (phase-in to Oct 20, 2027). VERIFIED (FINRA Regulatory Notice 26-10).

---

## Part A - Broker rules for expiring options

### A.0 Regulatory and exchange baseline that binds every broker

- OCC exercise-by-exception: expiring equity options $0.01 or more ITM are auto-exercised unless instructed otherwise (restated by every broker page below; e.g., Fidelity agreement: "exercise any in-the-money options that remain in your account on their expiration day, so long as they are in-the-money by $0.01 or greater"). VERIFIED via broker pages; OCC text not fetched.
- FINRA exercise cut-off: "until 5:30 p.m. Eastern Time (ET) on the day of expiration"; rule reference FINRA Rule 2360(b)(23)(A); "Members may establish an earlier time to accept exercise instructions for customer or non-customer accounts". [FINRA Information Notice 2/3/21](https://www.finra.org/rules-guidance/notices/information-notice-020321) (accessed 2026-11-06). VERIFIED.
- FINRA periodically issues modified cut-offs for early-close days (e.g., 10:00 am ET on Jan 9, 2025 for the national day of mourning). [FINRA Information Notice 1/3/25](https://www.finra.org/rules-guidance/notices/information-notice-20250103) (accessed 2026-11-06). VERIFIED. Implication: a 0DTE tool needs a holiday/early-close calendar.
- Cboe SPX/SPXW product spec (VERIFIED, [ww2.cboe.com spec page](https://ww2.cboe.com/tradable_products/sp_500/spx_options/specifications) and [cboe.com spec page](https://cboe.com/tradable-products/sp-500/spx-options/spx-specifications), accessed 2026-11-06):
  - Trading hours: "Regular Hours: 8:30 a.m. to 3:15 p.m. (CT)" = 9:30 am-4:15 pm ET; curb 4:15-5:00 pm ET; Global Trading Hours 8:15 pm-9:25 am ET.
  - "SPXW expiring options trade until 3:00 p.m. (CT) on their expirations." / "Trading in SPXW options will ordinarily cease on the day of expiration, 4:00 pm ET" and "1:00 pm ET for any half day holiday".
  - Exercise style: "European - SPX/SPXW options generally may be exercised only on the expiration date."
  - Settlement value, SPXW (PM): "The exercise-settlement value is calculated using the closing sales price in the primary market of each component security on the expiration date."
  - Settlement value, SPX (AM monthly): "The exercise-settlement value, SET, is calculated using the opening sales price in the primary market of each component security on the expiration date." (AM SPX stops trading the prior business day.)
  - "Exercise will result in delivery of cash on the business day following expiration."
  - Multiplier 100; SPX Weeklys expire "Mon., Tue., Wed., Th., Fri., 3rd Fri. and Last Trading Day of Month", "PM", Cash, European. [Cboe SPX Weeklys page](https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/specifications/) (accessed 2026-11-06). VERIFIED.
- SPXPM (PM-settled third-Friday SPX, approved 2023) value is "derived from closing prices on the last trading day prior to expiration". [SEC Release 34-98454, 88 FR 66103](https://www.govinfo.gov/content/pkg/FR-2023-09-26/html/2023-20810.htm) (accessed 2026-11-06). VERIFIED.
- Pattern day trading: see A.11.

### A.1 Charles Schwab / thinkorswim (primary broker)

Status: schwab.com and help.streetsmart.schwab.com could not be fetched from this session (WAF/unresolvable host); the official April 2026 Pricing Guide PDF was obtained from disclosures.schwab.com. Expiration-policy text on schwab.com remains UNVERIFIED.

(1) Opening buy-to-open on same-day-expiring SPX/SPXW/SPY
- No Schwab/thinkorswim published cut-off time for opening 0DTE positions was found in any search. UNVERIFIED. (Searches that returned Schwab-adjacent material only surfaced third-party broker pages: TradeZero 3:30 pm ET equity/ETF and 3:45 pm ET cash-settled index; Syfe 3:15/3:30 pm. These are NOT Schwab policy.) [TradeZero support](https://tradezero.com/en-us/support/questions/tradezero-america-what-is-the-cutoff-time-to-trade-options-on-expiration-day) (accessed 2026-11-06).
- A third-party broker directory states Schwab "allows contracts that expire the same day" with no cut-off given. [QuantWheel Schwab page](https://quantwheel.com/marketplace/brokers/schwab) (accessed 2026-11-06). UNVERIFIED.

(2) Forced liquidation / do-not-exercise cut-off
- Schwab DNE cut-off: not found on any Schwab page. A Motley Fool forum poster reports a Schwab broker saying buyer and market maker are "subject to the same time, 1.5 hours after closing" (i.e., 5:30 pm ET, the FINRA limit). [discussion.fool.com thread](https://discussion.fool.com/t/another-first-for-me-expired-while-in-the-money/118189?page=3) (accessed 2026-11-06). UNVERIFIED.
- Forced liquidation timing: EliteTrader users report Schwab "has liquidated ITM options as early as 50 minutes before the close, no phone call or email", and that Schwab "doesn't usually liquidate if you are logged in and look like you are paying attention". [EliteTrader "Options auto-liquidation times"](https://elitetrader.com/et/threads/options-auto-liquidation-times.363753/) (accessed 2026-11-06). UNVERIFIED (anecdote).
- The caller's hypothesis of a 4:30 pm ET Schwab DNE cut-off could not be confirmed or refuted. UNVERIFIED.

(3) SPX cash settlement handling / posting
- No Schwab-specific page found. Exchange rule: cash on the business day following expiration (Cboe spec, VERIFIED above). Schwab Pricing Guide: "There are no commissions or per-contract fees assessed on transactions resulting from options exercises and assignments." [Schwab Pricing Guide for Individual Investors, April 2026 (PDF)](https://disclosures.schwab.com/SchwabDashboard/61330/REG23060.pdf) (accessed 2026-11-06). VERIFIED.

(4) Commissions and fees (VERIFIED from the April 2026 Pricing Guide PDF above)
- "Option Commissions per Executed Trade - Online $0 base commission, plus $0.65 per-contract fee; Automated Phone $5, plus $0.65 per-contract fee; Broker-Assisted $25, plus $0.65 per-contract fee".
- "Per-contract fees are waived for buy-to-close options trades executed online for $0.05 or less."
- Pass-throughs are bundled as an "Industry Fee": "Schwab collects an Industry Fee to offset an array of charges assessed on us directly or indirectly by self-regulatory organizations ... The Industry Fee is collected to offset, as applicable, some or all the following SRO and foreign government fees: Section 31 Fee; FINRA Trading Activity Fee; Options Regulatory Fee; Proprietary Index Options Fee; Foreign Transaction Tax on ADRs".
- Footnote 7: "The Options Clearing Corporation collects an Options Regulatory Fee ("ORF") that is assessed by each options exchange. The amount of the ORF varies by options exchange, where an options trade executes, and whether the broker who's responsible for the trade is a member of a particular exchange."
- Footnote 8: "An options exchange, such as Cboe, may charge a proprietary index option fee on select index options (such as on the SPX, OEX, and VIX) that only trade on their exchange."
- Important for cost modelling: "Schwab will determine the amount of its Industry Fee in its sole and reasonable discretion, and such fee may differ from or exceed the actual fees properly paid by Schwab in connection with any transaction or series of transactions." So the Schwab-side SPX pass-through is not a published constant; it must be read off confirmations.
- Public pricing page (international mirror) restates "$0.65 per options contract" and that "Additional regulatory and exchange fees may apply". [international.schwab.com costs page](https://international.schwab.com/resource-center/insights/costs-of-investing) (accessed 2026-11-06; 403 on direct fetch, SNIPPET).

(5) Cash account / option levels
- Schwab StreetSmart help (official, host unreachable from this session; SNIPPET): Level 0 = covered calls, covered puts, buy-writes, unwinds, covered rollouts; Level 1 adds long calls, long puts, long straddles, long combinations; Level 2 = spreads; naked = higher tier. [Schwab StreetSmart "Option Approval Levels"](https://help.streetsmart.schwab.com/pro/4.36/Content/Option_Approval_Levels.htm) (accessed 2026-11-06). Buying SPX calls/puts therefore needs Level 1 at minimum. Whether cash (non-margin) accounts can buy SPX options at Level 1: not stated on any fetched page. UNVERIFIED (industry practice is yes for long options; confirm with Schwab).

(6) PDT - see A.11 (FINRA rule repealed; Schwab's house implementation during the phase-in is UNVERIFIED).

(7) Trading stop and order handling after 3:59:xx; latency
- Exchange side: expiring SPXW stops at 4:00:00 pm ET (Cboe, VERIFIED). Whether thinkorswim rejects at 3:59:xx vs forwards to Cboe: no Schwab text found. UNVERIFIED.
- Latency: no measured 2026 data found. Older forum reports: orders "taking up to 5 seconds or even longer to get filled" after previously ~2 seconds; a futures-status lag thread; "only TD rep's have the ability to see the 'ping' metric". [NexusFi thread](https://nexusfi.com/showthread.php?p=152318), [EliteTrader thread](https://elitetrader.com/et/threads/thinkofswim-not-adjusting-futures-orders.385500/), [NinjaTrader forum](https://forum.ninjatrader.com/forum/ninjatrader-8/platform-technical-support-aa/1083431-td-ameritrade-thinkorswim-issues-after-ninjatrader-8-update-8-0-20-1-64-bit?p=1083433) (all accessed 2026-11-06). UNVERIFIED and dated; measure acknowledgement latency empirically before relying on it.

### A.2 Fidelity

Sources: Fidelity Options Agreement (form 1.734349.120, PDF) [fidelity.com option_agreement.pdf](https://fidelity.com/accounts/mando/option_agreement.pdf) (accessed 2026-11-06) VERIFIED; [Fidelity commissions page](https://www.fidelity.com/trading/commissions-margin-rates) (accessed 2026-11-06) VERIFIED.

(1) Opening on expiration day
- "Purchasing Expiring Options: On the expiration date of an equity option, Fidelity may (i) restrict your ability to place new opening transactions and (ii) cancel any unexecuted opening transactions. The timing of these actions may vary." (No fixed clock time; applies to "equity option"; silence on index options.)

(2) Exercise / DNE / liquidation
- "in the absence of any instructions from you, you authorize us to exercise any in-the-money options that remain in your account on their expiration day, so long as they are in-the-money by $0.01 or greater or in accordance with Fidelity's policies then in effect".
- "If you do not want us to exercise any expiring options, you must notify us by 4:20 p.m. Eastern time on the expiration date by calling Fidelity at 800-343-3548."
- "If sufficient assets and/or other positions are not available to cover the exercise or assignment of an option, you authorize Fidelity to take the following actions while charging the Rep-Assisted commission rate: place an order to close option positions; place an order to minimize market risk ...; instruct the OCC not to exercise valuable options on or prior to the last trading day". No clock time for these liquidations is given.

(3) Index/cash settlement
- "Index options have special characteristics and risks. Index option exercises are settled with cash, not securities. In addition, because the exercise price of an index option is always based on the closing index value, an index option that is in the money during trading hours may be out of the money when the closing value is calculated - a risk to consider whenever you place an exercise order before the closing value is known." (Directly relevant to the 3:50-4:00 decision problem.)
- Posting time of SPX cash: not stated by Fidelity; exchange rule = next business day.

(4) Fees
- "Online options trades are subject to a fee of $0.65 per contract." Buy-to-close orders of $0.65 or less: $0. "Certain proprietary exchange-traded options are subject to additional fees." "There is an Options Regulatory Fee that applies to both options buy and sell transactions. The fee is subject to change." Professional Options Traders: "additional fee of $0.50 per contract". Exercise/assignment fees: not stated on the page (an older fee schedule PDF says exercises/assignments are commission-free, SNIPPET: [Brokerage Commissions Fee Schedule](https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/Brokerage_Commissions_Fee_Schedule.pdf)).

(5) Levels / cash accounts: not fetched. UNVERIFIED.

### A.3 Interactive Brokers (IBKR)

Status: every IBKR host returned 403 to this session. All items SNIPPET from search excerpts of the official pages; URLs given for re-verification.

(1) Opening cut-off for 0DTE: none found. UNVERIFIED.

(2) Expiration-risk liquidation - [IBKR KB article 1767 "Expiration & Corporate Action Related Liquidations"](https://ibkb.interactivebrokers.com/article/1767) (redirects to https://www.ibkr.info/article/1767) (accessed 2026-11-06, 403): excerpts state that IBKR estimates the stock that could be delivered and checks whether the account can absorb it; if exposure is too large IBKR can "liquidate options prior to expiration; 2) allow the options to lapse; and/or 3) allow delivery and liquidate the underlying at any time"; clients may avoid this if they "roll the contract forward or close the position prior to the Close-Out Deadline specific to that contract". SNIPPET. Also "If the option is in-the-money at expiration by 0.01 or more, it will be automatically exercised on your behalf (unless you previously chose to lapse the option) by the Options Clearing Corporation (OCC)". SNIPPET. [IBKR "What happens to the USD equity option that I am long at expiration?"](https://ibkb.interactivebrokers.com/ja/node/221) (accessed 2026-11-06). No clock time for the expiration-day liquidation sweep is given in the excerpts. For cash-settled SPX there is no delivery exposure, so the delivery-based liquidation logic should not trigger; IBKR text on this point was not retrievable. UNVERIFIED.
- Exercise cut-off: "5:25 p.m. EST for US equity options" per search excerpt of [IBKR Delivery, Exercise and Corporate Actions](https://www.interactivebrokers.com/en/trading/delivery-exercise-actions.php) (accessed 2026-11-06, 403). SNIPPET.
- Liquidation trades count as day trades per IBKR KB title "Do liquidation trades executed by IBKR count as day trades?" [IBKR KB tag page](https://ibkb.interactivebrokers.com/de/tag/position-liquidations?page=1) (accessed 2026-11-06). SNIPPET (title only).

(3) SPX cash settlement posting: not retrieved. Exchange rule next business day.

(4) Fees - [IBKR US options commissions](https://www.interactivebrokers.com/en/pricing/commissions-options.php) (accessed 2026-11-06, 403; SNIPPET): Tiered, <=10,000 contracts/month: $0.65/contract for premium >= $0.10; $0.50 for $0.05-$0.10; $0.25 for < $0.05; third-party fees listed as "SEC Transaction Fee, FINRA Trading Activity Fee, FINRA CAT fees, and OCC Clearing Fees of 0.025/contract"; "transaction fees are only charged for sell orders"; IBKR warns tiered pricing is "not intended to be a direct pass-through of exchange and third-party fees" and pass-throughs "may be greater than the costs paid by IBKR". ORF shown as "USD 0.01915/contract" and TAF "USD 0.00279" or "USD 0.00329 * Quantity Sold" on different regional snapshots (inconsistent). IBKR Lite: fixed-rate on first 1,000 US option contracts/month then Pro tiered. SNIPPET.
- Cboe pass-through page lists "Surcharge - SPX, SPXW USD 0.20" in some columns, tier unknown. [IBKR Cboe options fees](https://investors.interactivebrokers.com/en/accounts/fees/CBOEoptfee.php) (accessed 2026-11-06, 403). UNVERIFIED.
- A Singapore-entity page mentions a "Fee Holiday of Trading Activity Fee for trades from Oct 1, 2026 through Dec 31, 2026" (consistent with the Robinhood TAF pause below). [IBKR SG commissions](https://www.interactivebrokers.com.sg/en/index.php?f=49623) (accessed 2026-11-06). SNIPPET.

(5) Levels / cash accounts: not retrieved. UNVERIFIED.
(6)/(7): no IBKR-specific data retrieved. UNVERIFIED.

### A.4 tastytrade

Status: tastytrade's legacy freshdesk help URLs now 404 and the new help center (support.tastytrade.com) renders only via JavaScript; text below is SNIPPET from search excerpts of those official articles. Pricing page VERIFIED.

(1) Opening cut-off
- "Any equity or ETF options order with a short leg (sell to open) will be prohibited during the last 30 minutes of trading before the market closes" on expiration day; buy-to-open is not mentioned as blocked. [tastytrade "Why did the risk team close my position?"](https://tastyworks.freshdesk.com/support/solutions/articles/43000484765-expiration-risk-closed-out-of-position-) (accessed 2026-11-06, 404). SNIPPET. Index-option treatment of this rule: not stated. UNVERIFIED.

(2) Risk-team closeouts / DNE
- "If our risk team determines that an account is subject to expiration risk, then the option(s) position may be closed out before the market close on the expiration day." "The Risk team monitors potential expiration risk throughout the day ... as the end of the day approaches, our Risk team may start closing positions that pose excessive risks." "If you indicate that you are monitoring your positions, our risk team may still close positions on your behalf." "You must click I'm Monitoring each expiration day". Best efforts to close "generally run only until the last 15-20 minutes of trading" (excerpt). "Any position(s) closed by our Risk team will count towards your day trade count." Same freshdesk sources plus [tastytrade "My position was automatically closed"](https://tastyworks.freshdesk.com/support/solutions/articles/43000484774) (accessed 2026-11-06, 404). SNIPPET.
- DNE: "Customer 'Do Not Exercise' instructions are due by 3:30 PM CT" (= 4:30 pm ET). [tastytrade DNE article](https://tastyworks.freshdesk.com/support/solutions/articles/43000472843-do-not-exercise-request-dne-) (accessed 2026-11-06). SNIPPET.
- The "monitoring requests made after 2:00 pm Central ... best efforts" line appears on IG's US-options help page (IG white-labels tastytrade) and may or may not be tastytrade's current wording. [IG help](https://ig.com/uk/help-and-support/us-options-and-futures/product-details-and-trading/what-risk-team-procedures-are-in-place-for-options-) (accessed 2026-11-06). UNVERIFIED for tastytrade.
- The caller's hypothesis of a tastytrade 3:00-3:30 pm closeout time: not supported by any found tastytrade text (the only 3:00 pm ET figures were SogoTrade and Options AI). UNVERIFIED.

(3) SPX settlement: tastytrade "Monthly/Weekly Summary" and "How are cash-settled options handled at expiration?" articles exist ([43000435289](https://tastyworks.freshdesk.com/support/solutions/articles/43000435289), [43000435308](https://tastyworks.freshdesk.com/support/solutions/articles/43000435308), accessed 2026-11-06, 404); excerpt: cash movement "shows in the account the next trading day". SNIPPET.

(4) Fees - VERIFIED from [tastytrade pricing](https://tastytrade.com/pricing/) (accessed 2026-11-06): "Stock & ETF Options: $1 per contract, $10 max per leg (opening); $0 per contract (closing)"; "Broad-Based Index Options: $1 per contract (opening); $0 (closing)" with no cap stated; "Applicable exchange, clearing, and regulatory fees still apply to all opening and closing trades." Third-party reviews quote an SPX exchange fee of $0.60/contract and clearing $0.10/contract at tastytrade - UNVERIFIED ([StockBrokers.com review](https://stockbrokers.com/review/tastytrade), accessed 2026-11-06).

(5)/(6): not retrieved. UNVERIFIED.

### A.5 Robinhood

All VERIFIED from official support pages (accessed 2026-11-06): [Options trading hours](https://robinhood.com/us/en/support/articles/options-trading-hours), [Expiration, exercise, and assignment](https://robinhood.com/us/en/support/articles/expiration-exercise-and-assignment), [Index options](https://robinhood.com/us/en/support/articles/index-options), [Trading fees on Robinhood](https://robinhood.com/us/en/support/articles/trading-fees-on-robinhood).

(1) Opening cut-off
- Same-day-expiring stock and ETF options: with expiration-date trading enabled, "until 3:30 PM ET to open positions in same-day expiring contracts".
- Index options: no opening cut-off stated. PM-expiring index options: "Trading stops at 4 PM ET (or 1 PM ET for half-days) on the expiration date." AM-expiring: "Trading stops at 4:15 PM ET on the last trading day before the expiration date." SPX/VIX/XSP/RUT hours: Sunday-Friday 9:30 AM-5 PM ET plus 8:15 PM-9:25 AM ET.
- Late-close ETF options (e.g., SPY): "Options on certain exchange traded products trade until 4:15 PM ET."

(2) Closeout / DNE
- "Starting at 3:30 PM ET" Robinhood will "attempt to close out any expiring, at-risk positions"; 3:45 PM ET for late-close options; "This standard closeout process doesn't apply for index options." Robinhood "cannot guarantee" closeouts and may act outside that window based on market conditions.
- At-risk definition: "Robinhood will calculate an estimated upper and lower bound for the underlying security's close price on the expiration date ... If the strike price falls within these parameters, we may place an order to close your position."
- "the cut-off time for submitting a DNE request is 5 PM ET"; exercise requests: "On expiration day, you won't be able to submit an early exercise request in the app or on the web after 4:15 PM ET"; "We'll try to accommodate exercise requests until 5 PM ET on a best-effort basis."

(3) Index settlement
- "Index options cannot be exercised or assigned early." ITM-at-settlement index options are "automatically exercised or assigned"; "Cash credit or debit will be determined by the strike price when compared to the settlement value of the index"; expiration "based on settlement values, not closing prices" (Robinhood's wording for the Cboe settlement value). Posting time not stated.

(4) Fees
- Commission-free; "Index options contract fee: $0.35 per contract (Gold) / $0.50 (without Gold)" plus product exchange fees: SPX $0.57 (< $1 premium) / $0.66 (>= $1); SPXW $0.50 / $0.59; XSP $0 (< 10 contracts) / $0.07 (>= 10).
- Pass-throughs: combined ORF + OCC clearing "$0.04 per contract" (effective Jan 10, 2025); FINRA TAF "$0.00329 per contract" on options sells, capped $9.79/trade (effective Jan 1, 2026), "Not charged from October 1, 2026, through December 31, 2026"; SEC fee "$20.60 per $1 million" on sells (effective April 4, 2026); CAT "$0.0003 per options contract"; "Index options are not charged the SEC fee or the TAF."

(5)/(6): account-level requirements for index options not stated on fetched pages. UNVERIFIED.

### A.6 E*TRADE (Morgan Stanley)

Status: us.etrade.com returned 503/empty reply to every fetch; items are SNIPPET from search excerpts of official pages: [Expiration Process and Risks](https://us.etrade.com/l/h/options/expiration-process-risk), [Understanding expiration](https://us.etrade.com/knowledge/library/options/understanding-expiration), [Navigating expiration](https://us.etrade.com/knowledge/library/options/navigating-expiration) (all accessed 2026-11-06).

- Auto-exercise: "The Options Clearing Corporation (OCC) will automatically exercise any expiring options that close $0.01 in-the-money or more on Expiration Day." Sub-penny ITM: "may still be exercised, but you are required to provide an exercise request before 5:30 EST". SNIPPET.
- DNE: "entering do-not-exercise instructions through the E*TRADE platform before 4:30 PM CT / 5:30 PM ET on the Expiration Date"; phone instructions best-efforts. SNIPPET.
- Liquidation: "E*TRADE initiates expiration-related liquidations two hours prior to the market close but does reserve the right to begin the process sooner or later if conditions warrant any alteration"; "E*TRADE reserves the right to liquidate or cover expiring option positions which would result in undue risk and/or margin deficit." SNIPPET. (For cash-settled SPX there is no delivery risk; E*TRADE text on index options not retrieved. UNVERIFIED.)
- Opening cut-off for 0DTE: none found. UNVERIFIED.
- Fees: $0.65/contract standard; $0.50 with 30+ trades/quarter; exercise/assignment $0 (third-party pages; official pricing page 503). [Schwab comparison table](https://www.schwab.com/node/14936), [BrokerChooser E*TRADE fees](https://brokerchooser.com/broker-reviews/e-trade-review/e-trade-fees) (accessed 2026-11-06). SNIPPET/UNVERIFIED.

### A.7 Webull

VERIFIED from [Webull FAQ 10614 "Option Expiration, Exercise, Assignment, and Potential Risks"](https://www.webull.com/help/faq/10614), [Webull FAQ 659 "Exercising an Option Contract"](https://www.webull.com/help/faq/659-Options-Exercise), [Webull options page](https://www.webull.com/options), [Webull pricing](https://www.webull.com/pricing), [Webull FAQ 10793](https://www.webull.com/help/faq/10793-[Webull-Omnibus-What-are-the-trading-fees-on-Webull-Are-you-commission-free) (all accessed 2026-11-06).

(1) Opening cut-off (expiration day): "Single-leg options cannot be opened after 3:40 PM ET, and multi-leg strategies cannot be opened after 3:00 PM ET." Orders after these times are rejected/cancelled. No index-option exception stated.
(2) DNE/exercise: "you must submit a Do-Not-Exercise instruction via the in-app Help Center or by speaking with a broker by 4:30 PM EST"; expiration-day exercise requests due 4:30 PM EST (market close on half days); instructions "accepted up until 4:00 PM EST or market close" on expiration day (two statements on the same page; treat 4:00 pm as the safe deadline); requests after 5:30 PM EST rejected. Liquidation: Webull "reserves the right to close any options positions that pose a risk if exercised or assigned"; ITM options lacking equity "may be automatically liquidated before the trading day ends"; the DNE toggle does not prevent auto-liquidation ("the contract may still be auto-liquidated on expiration day"). No clock time given.
(3) Index settlement: not addressed beyond "the OCC ... will automatically exercise it using the official closing price" (equity wording).
(4) Fees: "$0.50 per contract on Index options" (options page and pricing page; the FAQ table excerpt shows $0.55 for SPX/SPXW/VIX - discrepancy, UNVERIFIED which is current); "$0.10 per contract for all option orders above 500 contracts, except for Index options"; "Relevant regulatory and exchange fees may apply" (ORF/OCC not itemised); SEC fee "$0.0000206 x total trade volume, sells only"; CAT "$0.000003 x total trade volume".
(5)/(6): not stated. UNVERIFIED.

### A.8 Comparison table (expiration-day constraints)

| Broker | Open 0DTE cut-off (equity/ETF) | Open 0DTE cut-off (SPX) | Forced-close window | DNE / exercise cut-off | Status |
|---|---|---|---|---|---|
| Schwab/thinkorswim | none published found | none published found | anecdote: ~50 min before close | not found (forum: 5:30 pm ET) | UNVERIFIED |
| Fidelity | "may restrict ... timing may vary" | silent | when assets insufficient; no time | 4:20 pm ET (phone) | VERIFIED |
| IBKR | none found | none found | projected-exposure based; "Close-Out Deadline" | 5:25 pm ET (equity) | SNIPPET |
| tastytrade | sell-to-open blocked last 30 min | silent | "before the market close", risk-team discretion | 3:30 pm CT (4:30 pm ET) | SNIPPET |
| Robinhood | 3:30 pm ET | none stated | from 3:30 pm (3:45 late-close); not index | DNE 5 pm ET; exercise UI 4:15 pm | VERIFIED |
| E*TRADE | none found | none found | starts ~2 h before close | 5:30 pm ET platform | SNIPPET |
| Webull | 3:40 pm single-leg / 3:00 pm multi-leg | same (no exception) | reserves right; no time | 4:30 pm ET (4:00 pm safe) | VERIFIED |

### A.9 Per-contract fee stack for one SPX/SPXW contract (customer), Nov 2026

Exchange and clearing layer (independent of broker):
- Cboe SPX/SPXW customer transaction fee: fee code CS "Customer, Premium <$1.00, SPX" 0.36; CT "Customer, Premium >= $1.00 or Premium Recalculated After Market Close, SPX" 0.45 (units: USD per contract); schedule "Effective November 2, 2026". [Cboe Options fee schedule page](https://www.cboe.com/us/options/membership/fee_schedule/cone/) (accessed 2026-11-06). VERIFIED. (The April 2026 filing SR-CBOE-2026-031 showed CS $0.36 / CT $0.40, so CT rose during 2026: [SR-CBOE-2026-031](https://cdn.cboe.com/resources/regulation/rule_filings/approved/2026/SR-CBOE-2026-031.pdf), accessed 2026-11-06, SNIPPET.) Note "Premium Recalculated After Market Close" in CT: an order priced below $1 can be re-bucketed - relevant to 0DTE cheap-premium trades.
- Cboe ORF: through June 30, 2026 "$0.0023 per contract side" assessed on customer-range clears "regardless of the exchange on which the transaction occurs"; "Effective as of July 1, 2026 ... $0.01248 per contract side" assessed only "for executions that occur on Cboe Options" (SPX trades only on Cboe, so it always applies). [SEC Exhibit 5 to SR-CBOE-2026-058, Fees Schedule July 1, 2026](https://www.sec.gov/files/rules/sro/cboe/2026/34-105902-ex5.pdf) (accessed 2026-11-06). VERIFIED. Earlier notice: [Cboe ORF update effective Jan 2, 2026 (PDF)](https://cdn.cboe.com/resources/fee_schedule/2026/Cboe-Options-Exchanges-Regulatory-Fee-Update-Effective-January-2-2026.pdf) (accessed 2026-11-06). VERIFIED.
- OCC clearing fee: "All Transactions $0.025/contract" (effective Nov 30, 2025; Dec 2025 fee holiday; reverted Jan 2026). [OCC Schedule of Fees, Exhibit 5A to SR-OCC-2025-019](https://www.sec.gov/files/rules/sro/occ/2025/34-104274-ex5a.pdf) (accessed 2026-11-06). VERIFIED. (theocc.com itself returned 403: [OCC schedule of fees](https://www.theocc.com/membership/schedule-of-fees/).)
- FINRA TAF (options): Schedule A footnote on finra.org reads "$0.00279 per contract for each sale of an option" while Robinhood's page states $0.00329/contract capped at $9.79 from Jan 1, 2026 and a pause Oct 1-Dec 31, 2026; the FINRA page shows rule versions "Jan 01, 2026 - Sep 30, 2026" and "Oct 01, 2026 - Dec 31, 2026", consistent with a 2026 change plus a Q4-2026 holiday. [FINRA By-Laws Schedule A Section 1](https://www.finra.org/rules-guidance/rulebooks/corporate-organization/section-1-member-regulatory-fees) (accessed 2026-11-06) VERIFIED-page/ambiguous rate; [Robinhood fees](https://robinhood.com/us/en/support/articles/trading-fees-on-robinhood) VERIFIED. TAF applies to sales of covered securities (equity/ETF options such as SPY) and not to index options per Robinhood. UNVERIFIED which rate FINRA's current text applies.
- SEC Section 31: "$20.60 per million dollars" from "April 4, 2026", remains in effect "until 60 calendar days after legislation is enacted" setting the FY2027 appropriation. [SEC Fee Rate Advisory 2026-2](https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2) (accessed 2026-11-06). VERIFIED. Applies to SPY option sells (on premium principal), not to SPX per Robinhood.
- CAT fee: Robinhood $0.0003/contract; Webull "$0.000003 x total trade volume". VERIFIED (broker pages).

Broker layer (commission + what they pass through), per contract:
| Broker | Commission | SPX-specific pass-through | ORF/OCC/other | Source status |
|---|---|---|---|---|
| Schwab | $0.65 (waived BTC <= $0.05) | "Proprietary Index Options Fee" inside discretionary "Industry Fee" | ORF, TAF, Sec.31 inside Industry Fee | VERIFIED |
| Fidelity | $0.65 (BTC <= $0.65 free) | "Certain proprietary exchange-traded options are subject to additional fees" | ORF on buys and sells | VERIFIED |
| IBKR Pro tiered | $0.65 / $0.50 / $0.25 by premium | "Surcharge - SPX, SPXW USD 0.20" (tier unclear) + Cboe fee pass-through | OCC $0.025; ORF ~$0.019; TAF; SEC | SNIPPET |
| tastytrade | $1.00 open / $0 close (no cap on index) | exchange fees "still apply" (3rd-party: $0.60 SPX) | clearing (3rd-party $0.10), regulatory | VERIFIED commission; fees UNVERIFIED |
| Robinhood | $0 + index contract fee $0.50 ($0.35 Gold) | SPX $0.57/$0.66; SPXW $0.50/$0.59 | ORF+OCC $0.04 combined; no TAF/SEC on index | VERIFIED |
| E*TRADE | $0.65 ($0.50 at 30+ trades/qtr) | not retrieved | not retrieved | SNIPPET |
| Webull | $0.50 index contract fee ($0.55 per one FAQ excerpt) | "regulatory and exchange fees may apply" | not itemised | VERIFIED page / discrepancy |

Worked example (Robinhood without Gold, one SPXW contract, premium >= $1, round trip): 2 x ($0.50 + $0.59 + $0.04) = $2.26. Schwab round trip: 2 x ($0.65 + Industry Fee); the Industry Fee for SPX should approximate Cboe CT $0.45 + ORF $0.01248 + OCC $0.025 = ~$0.49 but is set "in its sole and reasonable discretion" (VERIFIED language) - read confirmations.

### A.10 Options approval levels and cash accounts (buying SPX calls/puts)
- Long calls/puts are the second-lowest tier at Schwab (Level 1) per SNIPPET of Schwab help (A.1). Fidelity, IBKR, E*TRADE, Webull level pages not fetched. UNVERIFIED generally; long index options in a cash account are industry-standard but confirm per broker. Robinhood index options page does not state an account-type restriction (VERIFIED absence).

### A.11 Pattern day trading
- FINRA Regulatory Notice 26-10: amendments to Rule 4210 replace "in their entirety the outdated day trading margin requirements"; this removes the day-trade-count test for designating a "pattern day trader" and the $25,000 minimum equity requirement; "Effective date: June 4, 2026"; members needing more time "may phase in implementation over 18 months, until October 20, 2027"; new intraday margin deficit standard (no real-time monitoring required; a single intraday calculation suffices; deficits satisfied "as promptly as possible"; 90-day restriction for habitual non-payment); "assignment or exercise of an option and the liquidation of such position during the same day" may be treated as simultaneous. [FINRA Regulatory Notice 26-10](https://www.finra.org/rules-guidance/notices/26-10) (accessed 2026-11-06). VERIFIED.
- Consequence: the old "options count as day trades; SPX cash-settled" question is moot at the FINRA level, but individual brokers may keep house day-trade counters during the phase-in (tastytrade's "closed by our Risk team will count towards your day trade count" is legacy wording). UNVERIFIED per broker.

### A.12 When trading stops and whether brokers reject at 3:59:xx; acknowledgement latency
- Cboe: expiring SPXW last trade 4:00:00 pm ET; orders resting at 4:00:00 are not executable thereafter. VERIFIED (spec). SPY options (late-close ETF class) trade to 4:15 pm ET (Robinhood hours page, VERIFIED; Cboe rule text not fetched).
- Broker-side rejection before 4:00:00: Webull rejects opening orders after 3:40/3:00 pm (VERIFIED); Robinhood rejects stock/ETF 0DTE opens after 3:30 pm (VERIFIED); tastytrade blocks sell-to-open last 30 min (SNIPPET); Schwab/IBKR/E*TRADE/Fidelity: no published 3:59:xx reject rule found (UNVERIFIED).
- Schwab/thinkorswim acknowledgement latency: anecdotal only (A.1(7)). UNVERIFIED.

---

## Part B - Closing auctions and the S&P 500 close

### B.1 NYSE closing auction (Rule 7.35B, DMM-facilitated)

VERIFIED from [NYSE Auctions page](https://www.nyse.com/trade/auctions), [NYSE "The Close"](https://www.nyse.com/theclose), [NYSE Closing Auction Insider's Guide](https://nyse.com/article/nyse-closing-auction-insiders-guide), [NYSE Opening and Closing Auctions Fact Sheet (2024 PDF)](https://www.nyse.com/publicdocs/nyse/NYSE_Auctions_Closing_Process_Fact_Sheet.pdf) (all accessed 2026-11-06).

Timeline (ET):
- 3:50 pm: "Cutoff time for Market on Close/Limit on Close (MOC/LOC) order entry"; "Systemic publication of MOC/LOC Significant Imbalance is released"; "Thereafter only offsetting MOC/LOC orders allowed"; cancel requests for MOC/LOC and Closing Offset orders are rejected.
- 3:50 pm until the stock closes: "Informational imbalance publication is disseminated every 1 second if different from the previous publication - Includes the paired quantity, unpaired quantity, total imbalance quantity, closing only interest price, and continuous book clearing price". The Auctions page: imbalance publication "updating every 1 second until the auction completes".
- 3:59:50 pm: "D orders may no longer be entered or modified" (Closing D Orders: "Limit Order Only ... Will exercise discretion in the Closing Auction to a designated undisplayed price ... May only be entered by a Floor broker").
- 4:00 pm: "Closing auction process begins" / "Closing process begins".
Order types:
- MOC/LOC: "Can be entered, modified or canceled until 3:50 p.m. After 3:50 p.m. can be entered only on the contra-side of a MOC/LOC Significant Imbalance until 4:00 p.m. After 3:50 p.m. cannot be modified or canceled".
- Closing Offset (CO): "Limit order only; No validation against any imbalance publication (any size, price or side allowed); Yields to all other interest in closing auction; Follows same cancellation rules as MOC/LOC; Executes only against the opposite side of an imbalance; never adds to an imbalance".
2024 rule change (SR-NYSE-2024-13, filed March 1, 2024; notice March 12, 2024): "align the definition of Imbalance Reference Price for a Closing Imbalance; replace the Regulatory Closing Imbalance with an enhanced Significant Closing Imbalance; and include Closing D Orders in the Total Imbalance calculation ten minutes before" the close; "Beginning five minutes before the end of Core Trading Hours, Closing D Orders are" included at their discretionary price; "in the third quarter of 2021, D Orders constituted 36.6% of volume in the Closing Auction. As of the third quarter of 2023, D Orders comprised 42.7% of Closing Auction volume, more than any" other order type. [SEC Release 34-99719](https://www.sec.gov/files/rules/sro/nyse/2024/34-99719.pdf) (accessed 2026-11-06). VERIFIED. (The Insider's Guide confirms the current operative timeline: imbalance from 3:50, D Orders in the imbalance at their discretionary range from 3:55, D-order cutoff 3:59:50.)
Historical: MOC/LOC cutoff moved from 3:45 to 3:50 pm in 2018-19 ([NYSE MOC/LOC cutoff change PDF](https://www.nyse.com/publicdocs/nyse/markets/nyse/NYSE_MOC_LOC_Cutoff_Time_Change.pdf), accessed 2026-11-06, SNIPPET); the earlier 3:50-3:58 "legitimate error" cancellation window was removed by a 2021-22 filing ([SEC 34-93849](https://sec.gov/rules/sro/nyse/2021/34-93849.pdf), accessed 2026-11-06, SNIPPET) - today's official pages state cancels are rejected after 3:50.

### B.2 Nasdaq closing cross (Rule 4754)

VERIFIED from [Nasdaq Opening and Closing Crosses FAQ, 2025 (PDF, doc 1608-25)](https://www.nasdaqtrader.com/content/productsservices/trading/crosses/openclose_faqs.pdf), [Nasdaq Closing Cross FAQ 2019 (PDF)](https://www.nasdaqtrader.com/content/productsservices/Trading/ClosingCrossfaq.pdf), [Nasdaq Trader open/close page](https://www.nasdaqtrader.com/Trader.aspx?id=OpenClose), [Nasdaq closing cross factsheet (2006 PDF)](https://www.nasdaqtrader.com/content/ProductsServices/Trading/Crosses/ccfactsheet.pdf) (all accessed 2026-11-06).

Timeline (ET), 2025 FAQ:
- "Market-on-close (MOC) orders must be received prior to 3:55 p.m."
- "Limit-on-close (LOC) received after 3:55 p.m. will be accepted at its limit price, unless its limit price is more aggressive than the 3:50 p.m. or the 3:55 p.m. Reference Prices in which case the Late LOC order will re-price to the more aggressive of the two Prices. LOC orders must be received prior to 3:58 p.m." "If there is no crossing interest ... and thus no 3:55 p.m. Reference Price, LOC orders received after 3:55 p.m. will not be accepted."
- "MOOs (MOCs) entered after the cut-off at 9:28 a.m. (3:55 p.m.), are not accepted." "LOCs entered after the cut-off at 3:58 p.m., regardless of TIF, are not accepted."
- IO orders: "Must be priced (limit); no market IO orders"; "Re-priced to the best bid/ask ... on the Nasdaq book prior to the execution of the Closing Cross"; per the 2019 FAQ "IO orders may be entered until 4:00 p.m. ET"; "IO orders may be submitted but not updated or canceled" after 3:50.
- "Orders can be modified or cancelled ... for the closing cross prior to 3:50 p.m."
- NOII: "Between 9:25 and 9:28 a.m. and 3:50 and 3:55 p.m., Nasdaq disseminates the following information every 10 seconds via Nasdaq TotalView ITCH" (Current Reference Price, Paired Shares, Imbalance Shares, Imbalance Side); "Between 9:28 and 9:30 a.m. and 3:55 and 4:00 p.m., Nasdaq disseminates the above and the following information every second" (Near and Far Indicative Clearing Prices). "The NOII is available via Nasdaq TotalView ITCH." (The 2006 factsheet's "every 5 seconds" is obsolete.)
- "At 4:00 p.m., the Closing Cross is initiated"; "The Closing Cross sets the Nasdaq Official Closing Price (NOCP). If a stock does not have a closing cross, the last regular way last-sale eligible trade reported prior to 4:00 p.m. is used as the NOCP."
- Nasdaq-listed ETP without a cross: "a time-weighted average of the midpoint of the NBBO during the time frame 15:58:00-15:59:55".
- Price algorithm: "1. Maximize the number of shares executed. 2. Minimize the imbalance of Cross orders. 3. Minimize the distance from the Nasdaq inside bid-ask midpoint."
- Volume: "Almost 10% of Nasdaq's average daily volume occurs in the closing auction" (2019 FAQ).

### B.3 NYSE Arca closing auction (Rule 7.35-E) - SPY's primary market

- SPY is listed on NYSE Arca: the Trust prospectus names "NYSE Arca, Inc." as the "Principal U.S. Listing Exchange" under the symbol "SPY". [SPDR S&P 500 ETF Trust prospectus (Form 497, Jan 2026)](https://www.sec.gov/Archives/edgar/data/884394/000119312526022775/d77353d497.htm) (accessed 2026-11-06). VERIFIED.
- NYSE Arca closing auction timeline per the official NYSE Auctions page (VERIFIED): 3:00 pm "Imbalance Publication Begins"; 3:59 pm "Closing Freeze Period Begins; only offsetting MOC/LOC order accepted"; 4:00 pm "Closing Auction occurs within Auction Collars". No separate MOC/LOC cutoff before 3:59 and no D-order equivalent are listed. (NYSE Texas mirrors Arca; NYSE American freezes at 3:50.)
- 2018 SEC order confirms Arca's "Closing Auction Imbalance Freeze" for all MOC and LOC Orders at 3:59 p.m. (Rule 7.35-E(d)(2)). [SEC 34-84804](https://www.sec.gov/files/rules/sro/nyse/2018/34-84804.pdf) (accessed 2026-11-06). SNIPPET.
- Sept 2025 amendment (SR-NYSEARCA-2025-67, filed Aug 27, 2025, immediately effective): "Auction Imbalance Information is updated at least every second, unless there is no change to the information and is disseminated via proprietary data feed"; includes "Total Imbalance, Market Imbalance, Indicative Match Price, Matched Volume, Auction Reference Price, Auction Collar, Book Clearing Price, Far Clearing Price, Imbalance Freeze Indicator, and Auction Indicator"; the filing switches the published imbalance to be calculated at the Auction Reference Price rather than the Indicative Match Price. [90 FR 43676 (Sept 10, 2025)](https://www.govinfo.gov/content/pkg/FR-2025-09-10/pdf/2025-17337.pdf) (accessed 2026-11-06). VERIFIED.
- Databento ARCX.PILLAR: "Closing: 15:00 to 16:00 ET for all UTP securities"; "During auction periods, an imbalance message will be published every 1 second, if changed from the previous second." [Databento ARCX.PILLAR docs](https://databento.com/docs/datasets/arcx-pillar) (accessed 2026-11-06). VERIFIED.
- Implication: for SPY, the only hard pre-close event on its primary market is the 3:59:00 freeze; imbalance data exists from 3:00 pm but the decisive flow (offsetting MOC/LOC) can arrive until 4:00.

### B.4 Cboe BZX closing auction (Rule 11.23) - Cboe-listed ETPs only

- MOC cutoff moved 3:59 -> 3:55 pm by SR-CboeBZX-2025-058 (Release 34-102990, May 5, 2025; filed for immediate effectiveness): "Users may submit MOC orders until 3:55 p.m., at which time any additional MOC orders submitted will be rejected." [SEC 34-102990 Exhibit 5](https://www.sec.gov/file/34-102990-ex5), [Federal Register 2025-08114](https://public-inspection.federalregister.gov/2025-08114.pdf) (accessed 2026-11-06). SNIPPET (approval/operative date not confirmed, but the Nov 2025 Cboe notice below presumes it).
- Cboe notice effective Nov 7, 2025 (Reference C2025102400): "LOC cutoff time will remain at 3:59 p.m."; "LOC orders cannot be canceled or modified after 3:55 p.m."; Late-LOC (LLOC) "accepted beginning at 3:55 p.m."; LLOC continuously re-priced to the less aggressive of its limit or the NBB/NBO; for BZX-listed ETPs late LOCs 3:55-3:59 accepted at any limit price. [Cboe notice 56904](https://www.cboe.com/notices/content/?id=56904) (accessed 2026-11-06). VERIFIED.
- Imbalance dissemination: a third-party summary says BZX publishes closing auction information every 5 s from 3:00 to 3:59 pm and every 1 s from 3:59 to 4:00 pm. [PolicyRisk summary of 2025-08114](https://policyrisk.com/federal-register/2025-08114) (accessed 2026-11-06). UNVERIFIED (Cboe auction spec page fetched only its introduction: [Cboe Titanium auction process](https://www.cboe.com/document/tech-spec/content/technical-specifications/cboe-titanium-u.s.-equities-auction-process)).
- Relevance: SPY is Arca-listed, so BZX's auction matters only for Cboe-listed ETPs.

### B.5 How the S&P 500 closing value is computed; SPXW settlement vs the 4:00 pm index tick

- S&P DJI methodology PDFs (Index Mathematics; S&P U.S. Indices; Equity Indices Policies & Practices) returned HTTP 403 to this session: [methodology-index-math.pdf](https://www.spglobal.com/spdji/en/documents/methodologies/methodology-index-math.pdf), [methodology-sp-us-indices.pdf](https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf) (accessed 2026-11-06). The statement "official close = sum over constituents of (official closing price on primary listing exchange x shares x IWF) / divisor" is therefore UNVERIFIED against S&P's own text in this session, though it is the only reading consistent with the exchange, Cboe and fund documents below.
- Cboe (VERIFIED): SPXW exercise-settlement value "is calculated using the closing sales price in the primary market of each component security on the expiration date". Since each primary market's official closing price is the closing-auction print (NYSE Rule 7.35B; Nasdaq NOCP; Arca auction), the SPXW settlement value is an auction-based number, not the 4:00:00 index tick.
- SPY Trust (VERIFIED, 2026 prospectus): portfolio securities are "valued at the last sale price or official closing price, as applicable, on the primary market"; NAV is struck "At the close of the market" and "the closing time of the regular trading session on the NYSE" is "ordinarily 4:00 p.m., New York time"; the bid/ask price used for premium/discount is "the midpoint of the best bid and best offer prices on NYSE Arca at the time the Trust's NAV is calculated, ordinarily 4:00 p.m."
- Timing of the official close vs the 4:00:00 "last": the index's real-time value at 4:00:00 is built from last-sale prices in continuous trading; constituent closing-auction prints arrive from 4:00:00 onward (Nasdaq cross "at 4:00 p.m."; NYSE "Closing auction process begins" at 4:00 pm, with DMM-facilitated closes completing over the following seconds to minutes). The S&P official close is therefore published after the last auction print; S&P's exact publication time was not retrievable (UNVERIFIED). Empirically the Nasdaq FAQ and BMLL note price convergence of indicative prices to the close by 3:57-3:58 on Nasdaq, slower and "more volatile" on NYSE, and "fluctuates throughout the final minutes" on NYSE Arca. [BMLL "Into the Close" (June 24, 2025)](https://www.bmlltech.com/news/market-insight/into-the-close-unpacking-u-s-closing-auction-dynamics-and-the-impact-of-the-russell-reconstitution) (accessed 2026-11-06). VERIFIED.
- Magnitude of the gap between the 3:59:59 SPX print and the SPXW settlement value: no published statistic found. UNVERIFIED. (Fidelity's agreement warns of exactly this risk: "an index option that is in the money during trading hours may be out of the money when the closing value is calculated".)
- Early closes: settlement uses the 1:00 pm ET close on half days (Cboe spec "1:00 pm ET for any half day holiday"). VERIFIED.

### B.6 Market-data products carrying closing-imbalance data, and retail access/cost

| Product | Venues | Content | Cadence | Access / cost | Status |
|---|---|---|---|---|---|
| NYSE Pillar Integrated / NYSE Order Imbalances feed (via Databento XNYS.PILLAR) | NYSE-listed | ref price, paired qty, total imbalance, side, indicative clearing price, collars | every 1 s from 3:50 if changed | Databento "Plus or Unlimited subscription ... with the required licensing"; NYSE "Order Imbalances feeds start at $1,000/month"; full Integrated "upwards of $7,500/month ... non-display" | VERIFIED |
| NYSE Arca Integrated (Databento ARCX.PILLAR) | Arca-listed (SPY) + UTP closing | same schema; closing window 15:00-16:00 | every 1 s if changed | same Databento tiers/licensing | VERIFIED |
| NYSE American (Databento XASE.PILLAR) | American-listed | same | same | same | VERIFIED |
| Nasdaq TotalView-ITCH NOII (Databento XNAS.ITCH; Nasdaq Data Link / NCDS) | Nasdaq-listed | paired, imbalance, side, ref price, near/far price, cross type | every 10 s 15:50-15:55, every 1 s after 15:55 | Databento (TotalView licensing); Nasdaq Data Link pricing not found | VERIFIED (Databento); Nasdaq pricing UNVERIFIED |
| Massive (formerly Polygon.io) "NOI" websocket | NYSE-listed only | imbalance qty, paired qty, book clearing price, auction time/type | event-driven | "NYSE Order Imbalances $49/month" add-on; real-time only, no history; "stocks listed on Nasdaq, NYSE Arca, NYSE American or Cboe BZX get no imbalance messages" (so no SPY) | VERIFIED |
| Cboe BZX auction feed | BZX-listed | auction info | 5 s / 1 s (unverified) | not researched | UNVERIFIED |
| Schwab/thinkorswim | - | no imbalance product found | - | - | UNVERIFIED (absence) |
| IBKR TWS | - | no imbalance subscription found; base US bundle USD 10/mo (snippet) | - | - | UNVERIFIED |

Sources (accessed 2026-11-06): [Databento imbalance schema](https://databento.com/docs/schemas/imbalance); [Databento XNYS.PILLAR](https://databento.com/docs/datasets/xnys-pillar); [Databento XNAS.ITCH](https://databento.com/docs/datasets/xnas-itch); [Databento ARCX.PILLAR](https://databento.com/docs/datasets/arcx-pillar); [Databento blog: NYSE imbalance feeds (Aug 14, 2025)](https://databento.com/blog/NYSE-imbalance-feeds); [Databento pricing](https://databento.com/pricing) (Standard $199/mo; Plus $1,750/mo license fees, annual; Unlimited $4,500/mo; "Usage-based live data is not available for Databento US Equities"); [Massive NOI docs](https://massive.com/docs/websocket/stocks/imbalances); [Massive KB: Nasdaq vs NYSE imbalance](https://massive.com/knowledge-base/article/does-massive-have-nasdaq-order-imbalance-data-or-only-nyse); [Massive pricing](https://massive.com/pricing); [Nasdaq TotalView product page](https://www.nasdaq.com/products/data/equities/nasdaq-totalview) (SNIPPET); [IBKR market data considerations](https://ibkb.interactivebrokers.com/fr/node/2840) (SNIPPET).
Databento schema fields (VERIFIED): ts_recv, ts_event, auction_time, ref_price, cont_book_clr_price, auct_interest_clr_price, ssr_filling_price, ind_match_price, upper_collar, lower_collar, paired_qty, total_imbalance_qty, market_imbalance_qty, unpaired_qty (closing only), auction_type, side, auction_status, freeze_status, num_extensions, unpaired_side, significant_imbalance; "Due to differences in the data disseminated by the exchange, different fields are used for Nasdaq and NYSE".
Practical note: for an SPX-level signal one needs imbalances across ~500 names on three listing venues (NYSE, Nasdaq, Arca for a few ETP-like names is irrelevant; Arca matters for SPY itself). The cheapest retail path covering NYSE-listed constituents only is Massive at $49/month; Nasdaq-listed constituents require TotalView NOII (Databento or Nasdaq); Arca (SPY) requires Databento ARCX.PILLAR.

### B.7 Empirical facts: closing-auction volume share and 3:50-4:00 price dynamics

- NYSE (Aug 29, 2024, Q2 2024 data): "Closing auctions within US equity markets matched $55.5bn per day", "9.44% of total US equity notional value traded" (record), and "The NYSE Closing Auction rose by +1.39% to 10.52% of total NYSE-listed trading volume". [NYSE Data Insights](https://nyse.com/data-insights/nyse-closing-auction-price-discovery-opportunities-reach-new-highs) (accessed 2026-11-06). VERIFIED.
- BMLL (June 24, 2025): closing auction "roughly 9% of total daily trading volume" in 2024; "about 20% of daily volume" on index-rebalance or option-expiration days; "over 34 percent of total daily notional volume" on the 2024 Russell reconstitution; "On Nasdaq, we observe clear price convergence between 3:57 and 3:58"; NYSE convergence "slower and more volatile", attributed to D-Order activity; on NYSE Arca the indicative price "fluctuates throughout the final minutes"; "51% of D-Order insert volume across the 10 sampled NYSE stocks came in the last three minutes". (Same BMLL URL as B.5.) VERIFIED.
- Nasdaq: "Almost 10% of Nasdaq's average daily volume occurs in the closing auction" (2019 FAQ). VERIFIED.
- NYSE filing: D Orders were 42.7% of NYSE closing-auction volume in Q3 2023 (B.1). VERIFIED.
- Academic baseline: closing auction share 7.5% of daily volume in 2018 vs 3.1% in 2010 (NBER working paper "Vestigial Tails? Floor Brokers at the Close"). [NBER conference paper](https://conference.nber.org/conf_papers/f145281.pdf) (accessed 2026-11-06). SNIPPET.
- Implication: on monthly/quarterly expiration days (which are also SPXW expiration days) roughly a fifth of the day's volume prints at 4:00:00+, and the NYSE imbalance picture is incomplete until D Orders are frozen at 3:59:50.

### B.8 SPY vs SPX in the 3:50-4:00 window; SPY close vs NAV

- SPY trades continuously on NYSE Arca (and all UTP venues) until 4:00 pm; Arca's auction imbalance is published from 3:00 pm and frozen for MOC/LOC at 3:59 pm; the SPY official closing price is the Arca closing auction price "within Auction Collars" at 4:00 pm (B.3). VERIFIED.
- SPY NAV is struck at "ordinarily 4:00 p.m." using "the last sale price or official closing price ... on the primary market" of each holding, i.e., the same auction prints that determine the SPXW settlement value; the SPY market price used for premium/discount is the Arca NBBO midpoint at 4:00 pm. Therefore SPY's auction close can differ from NAV (premium/discount) while SPXW settles on constituents' closes, not on SPY. (Prospectus, VERIFIED.)
- SPY options (physically settled, American) trade until 4:15 pm ET on expiration day at Robinhood (late-close ETF class) and are subject to the 3:30/3:45 pm broker closeout regimes; SPXW expiring options stop at 4:00:00 pm ET and are not subject to Robinhood's closeout. VERIFIED (Robinhood pages; Cboe spec).
- SPX index "last": the index is disseminated in real time through 4:00 pm; after 4:00 the value moves from the 4:00:00 last-trade composite to the official close as auction prints are incorporated (S&P text UNVERIFIED; see B.5). Non-expiring SPX options keep trading to 4:15 pm (plus curb to 5:00 pm) against that post-4:00 information, which is one observable proxy for the gap between the 4:00:00 tick and the official close.

---

### B.9 Consolidated minute-by-minute timeline, 3:00-4:15 pm ET (regular day)

| Time (ET) | NYSE (Rule 7.35B) | Nasdaq (Rule 4754) | NYSE Arca (7.35-E) - SPY | Cboe BZX (11.23) | Cboe SPX/SPXW | Broker house rules | Status |
|---|---|---|---|---|---|---|---|
| 3:00:00 | - | - | Imbalance publication begins (every 1 s if changed) | auction info published (5 s cadence, unverified) | regular session | Webull: no multi-leg 0DTE opens after this | NYSE/Arca VERIFIED; BZX UNVERIFIED |
| 3:30:00 | - | - | - | - | - | Robinhood: last time to open same-day stock/ETF options; at-risk closeouts begin; tastytrade: sell-to-open with short leg blocked (last 30 min, SNIPPET) | VERIFIED (RH) |
| 3:40:00 | - | - | - | - | - | Webull: no single-leg 0DTE opens after this | VERIFIED |
| 3:45:00 | - | - | - | - | - | Robinhood closeouts for late-close ETF options begin | VERIFIED |
| 3:50:00 | MOC/LOC entry cutoff; Significant Imbalance published; per-second informational imbalance begins; cancels rejected; only offsetting MOC/LOC accepted | NOII begins (every 10 s: ref price, paired, imbalance, side); MOC/LOC/IO can no longer be cancelled/modified | - | - | - | - | VERIFIED |
| 3:55:00 | Closing D Orders included in published imbalance at their discretionary range | MOC cutoff; NOII every 1 s incl. near/far clearing prices; late LOCs accepted but re-priced if more aggressive than 3:50/3:55 reference prices | - | MOC cutoff; LOC cannot be cancelled/modified; LLOC accepted | - | - | VERIFIED (BZX from Cboe notice) |
| 3:58:00 | - | LOC entry cutoff; IO still accepted | - | - | - | tastytrade "best efforts" closes generally end 15-20 min before close (SNIPPET) | VERIFIED |
| 3:59:00 | - | - | Closing Freeze: only offsetting MOC/LOC accepted | LOC cutoff; cadence to 1 s (unverified) | - | - | VERIFIED (Arca) |
| 3:59:50 | D Orders may no longer be entered or modified | - | - | - | - | - | VERIFIED |
| 4:00:00 | Closing auction process begins (DMM closes each stock; prints follow) | Closing Cross executes; NOCP set | Closing Auction within collars | Closing auction | Expiring SPXW last trade; non-expiring SPX/SPXW continue | Webull: expiration-day exercise instructions until 4:00 | VERIFIED |
| 4:00-4:15 | official closing prices disseminated as each auction completes | - | after-hours trading | - | SPX trades to 4:15; SPY options trade to 4:15 (late-close class) | Robinhood: exercise requests in app until 4:15 | VERIFIED |
| 4:15-5:00 | - | - | - | - | SPX curb session | Fidelity DNE 4:20; Webull/tastytrade DNE 4:30; Robinhood DNE 5:00; E*TRADE DNE 5:30 (SNIPPET); IBKR 5:25 (SNIPPET); FINRA ceiling 5:30 | mixed |
| T+1 | - | - | - | - | SPXW cash delivered | - | VERIFIED |

### B.10 Early-close (half-day) handling

- Cboe: expiring SPXW trading ceases "1:00 pm ET for any half day holiday"; the settlement value then uses the 1:00 pm official closes. VERIFIED (Cboe spec).
- Robinhood: PM-expiring index options stop "1 PM ET for half-days"; SPX/VIX/XSP/RUT regular session ends "1:15 PM ET on some half-days". VERIFIED.
- Webull: DNE/exercise deadlines move to "market close on half days" / "30 minutes after market close on half days". VERIFIED.
- FINRA: exercise cut-off moves with the early close and FINRA publishes modified cut-off notices (e.g., 10:00 am ET on Jan 9, 2025). VERIFIED.
- NYSE/Nasdaq/Arca: the rules are defined relative to "the scheduled end of Core Trading Hours" (NYSE freeze "10 minutes before"), so on a 1:00 pm close the NYSE MOC/LOC cutoff is 12:50, D-order cutoff 12:59:50, Nasdaq MOC 12:55 / LOC 12:58, Arca freeze 12:59. The relative-time construction is VERIFIED for NYSE ([SEC 34-99719](https://www.sec.gov/files/rules/sro/nyse/2024/34-99719.pdf): "at the Closing Auction Imbalance Freeze Time (e.g., 3:50 p.m. Eastern Time)"; [90 FR 43676](https://www.govinfo.gov/content/pkg/FR-2025-09-10/pdf/2025-17337.pdf)); the specific half-day clock values are inferred, UNVERIFIED.
- Module consequence: parametrize every cutoff as an offset from the scheduled close rather than as an absolute clock time; load the NYSE holiday/early-close calendar; treat FINRA special notices as overrides for exercise cut-offs.

### A.13 Worked round-trip cost examples (one SPXW contract, buy to open then sell to close before 4:00)

Assumptions: exchange/clearing layer from B/A.9 (Cboe CS $0.36 if premium < $1.00, CT $0.45 if >= $1.00; ORF $0.01248 per side; OCC $0.025 per side); no SEC fee or TAF on index options (Robinhood statement, VERIFIED). Broker pass-through behaviour per A.9.

| Broker | Commission (2 sides) | Exchange + ORF + OCC (2 sides) | Round-trip total, premium >= $1 | Round-trip total, premium < $1 | Notes / status |
|---|---|---|---|---|---|
| Schwab | 2 x $0.65 = $1.30 | "Industry Fee" (discretionary; expected ~2 x $0.49) | ~ $2.28 | ~ $2.10 | pass-through is not a published constant; VERIFIED language, estimate UNVERIFIED |
| Fidelity | $1.30 (sell leg) + $0.65 or $0 (buy-to-close rule does not apply to a buy-to-open) = $1.30 | ORF + "proprietary exchange-traded options ... additional fees" (amount unpublished) | ~ $2.28 | ~ $2.10 | amounts UNVERIFIED |
| IBKR Pro tiered | 2 x $0.65 (premium >= $0.10) | Cboe fee pass-through + ORF ~$0.019 + OCC $0.025, plus possible SPX surcharge $0.20 | ~ $2.3-2.7 | ~ $2.1-2.5 | SNIPPET |
| tastytrade | $1.00 open + $0 close = $1.00 | exchange ($0.60 SPX per 3rd party) + clearing ($0.10 per 3rd party) + regulatory, both sides | ~ $2.4 | ~ $2.4 | commission VERIFIED; fees UNVERIFIED |
| Robinhood (no Gold) | 2 x $0.50 = $1.00 | 2 x ($0.59 SPXW + $0.04) = $1.26 | $2.26 | 2 x ($0.50 + $0.50 + $0.04) = $2.08 | VERIFIED |
| Robinhood (Gold) | 2 x $0.35 = $0.70 | $1.26 | $1.96 | $1.78 | VERIFIED |
| Webull | 2 x $0.50 = $1.00 | "regulatory and exchange fees may apply" (unpublished) | ~ $2.0 + | ~ $1.8 + | VERIFIED commission; pass-through UNVERIFIED |

Reading: on a $0.50-premium 0DTE SPXW ($50 notional premium), a ~$2.1 round trip is ~4% of premium; on a $0.10 premium it is ~20%. The fee stack therefore shifts the break-even of cheap-premium 3:5x entries materially and must sit inside the edge threshold.

### A.14 Verbatim quote bank for the module's rule table

Each quote is the exact policy sentence to cite in code comments/config; status as in Section 0.

- Cboe SPXW last trade: "Trading in SPXW options will ordinarily cease on the day of expiration, 4:00 pm ET" ... "1:00 pm ET for any half day holiday". VERIFIED. https://cboe.com/tradable-products/sp-500/spx-options/spx-specifications
- Cboe SPXW settlement: "The exercise-settlement value is calculated using the closing sales price in the primary market of each component security on the expiration date." VERIFIED. https://ww2.cboe.com/tradable_products/sp_500/spx_options/specifications
- Cboe settlement delivery: "Exercise will result in delivery of cash on the business day following expiration." VERIFIED (same URL).
- FINRA: "until 5:30 p.m. Eastern Time (ET) on the day of expiration" ... "Members may establish an earlier time to accept exercise instructions". VERIFIED. https://www.finra.org/rules-guidance/notices/information-notice-020321
- Fidelity: "you must notify us by 4:20 p.m. Eastern time on the expiration date by calling Fidelity at 800-343-3548." VERIFIED. https://fidelity.com/accounts/mando/option_agreement.pdf
- Fidelity: "On the expiration date of an equity option, Fidelity may (i) restrict your ability to place new opening transactions and (ii) cancel any unexecuted opening transactions. The timing of these actions may vary." VERIFIED (same URL).
- Fidelity: "an index option that is in the money during trading hours may be out of the money when the closing value is calculated". VERIFIED (same URL).
- Robinhood: "until 3:30 PM ET to open positions in same-day expiring contracts"; "Starting at 3:30 PM ET" ... "attempt to close out any expiring, at-risk positions"; "This standard closeout process doesn't apply for index options." VERIFIED. https://robinhood.com/us/en/support/articles/options-trading-hours
- Robinhood: "the cut-off time for submitting a DNE request is 5 PM ET". VERIFIED. https://robinhood.com/us/en/support/articles/expiration-exercise-and-assignment
- Robinhood: "Index options are not charged the SEC fee or the TAF." VERIFIED. https://robinhood.com/us/en/support/articles/trading-fees-on-robinhood
- Webull: "Single-leg options cannot be opened after 3:40 PM ET, and multi-leg strategies cannot be opened after 3:00 PM ET." VERIFIED. https://www.webull.com/help/faq/10614
- Webull: "you must submit a Do-Not-Exercise instruction via the in-app Help Center or by speaking with a broker by 4:30 PM EST". VERIFIED (same URL).
- Webull: "the contract may still be auto-liquidated on expiration day." VERIFIED. https://www.webull.com/help/faq/659-Options-Exercise
- tastytrade: "Any equity or ETF options order with a short leg (sell to open) will be prohibited during the last 30 minutes of trading before the market closes." SNIPPET. https://tastyworks.freshdesk.com/support/solutions/articles/43000484765-expiration-risk-closed-out-of-position-
- tastytrade: "If our risk team determines that an account is subject to expiration risk, then the option(s) position may be closed out before the market close on the expiration day." SNIPPET (same URL).
- tastytrade: "Customer 'Do Not Exercise' instructions are due by 3:30 PM CT." SNIPPET. https://tastyworks.freshdesk.com/support/solutions/articles/43000472843-do-not-exercise-request-dne-
- E*TRADE: "E*TRADE initiates expiration-related liquidations two hours prior to the market close but does reserve the right to begin the process sooner or later if conditions warrant any alteration." SNIPPET. https://us.etrade.com/l/h/options/expiration-process-risk
- E*TRADE: "do-not-exercise instructions through the E*TRADE platform before 4:30 PM CT / 5:30 PM ET on the Expiration Date". SNIPPET. https://us.etrade.com/knowledge/library/options/understanding-expiration
- IBKR: "liquidate options prior to expiration; 2) allow the options to lapse; and/or 3) allow delivery and liquidate the underlying at any time" ... "roll the contract forward or close the position prior to the Close-Out Deadline specific to that contract". SNIPPET. https://ibkb.interactivebrokers.com/article/1767
- Schwab: "$0 base commission, plus $0.65 per-contract fee"; "Per-contract fees are waived for buy-to-close options trades executed online for $0.05 or less."; "There are no commissions or per-contract fees assessed on transactions resulting from options exercises and assignments."; "Schwab will determine the amount of its Industry Fee in its sole and reasonable discretion, and such fee may differ from or exceed the actual fees properly paid by Schwab". VERIFIED. https://disclosures.schwab.com/SchwabDashboard/61330/REG23060.pdf
- NYSE: "Cutoff time for MOC/LOC order entry" (3:50); "Informational imbalance publication is disseminated every 1 second if different from the previous publication"; "D orders may no longer be entered or modified" (3:59:50); "Closing auction process begins" (4:00). VERIFIED. https://www.nyse.com/trade/auctions ; https://www.nyse.com/publicdocs/nyse/NYSE_Auctions_Closing_Process_Fact_Sheet.pdf
- NYSE Arca: "Imbalance Publication Begins" (3:00); "Closing Freeze Period Begins; only offsetting MOC/LOC order accepted" (3:59); "Closing Auction occurs within Auction Collars" (4:00). VERIFIED. https://www.nyse.com/trade/auctions
- NYSE Arca: "Auction Imbalance Information is updated at least every second, unless there is no change to the information and is disseminated via proprietary data feed". VERIFIED. https://www.govinfo.gov/content/pkg/FR-2025-09-10/pdf/2025-17337.pdf
- Nasdaq: "Market-on-close (MOC) orders must be received prior to 3:55 p.m."; "LOC orders must be received prior to 3:58 p.m."; "Orders can be modified or cancelled ... for the closing cross prior to 3:50 p.m."; "Between ... 3:50 and 3:55 p.m., Nasdaq disseminates the following information every 10 seconds"; "Between ... 3:55 and 4:00 p.m., Nasdaq disseminates the above and the following information every second"; "If a stock does not have a closing cross, the last regular way last-sale eligible trade reported prior to 4:00 p.m. is used as the NOCP." VERIFIED. https://www.nasdaqtrader.com/content/productsservices/trading/crosses/openclose_faqs.pdf
- Nasdaq (2019 FAQ): "IO orders may be entered until 4:00 p.m. ET"; "Almost 10% of Nasdaq's average daily volume occurs in the closing auction". VERIFIED. https://www.nasdaqtrader.com/content/productsservices/Trading/ClosingCrossfaq.pdf
- Cboe BZX: "LOC cutoff time will remain at 3:59 p.m."; "LOC orders cannot be canceled or modified after 3:55 p.m." VERIFIED. https://www.cboe.com/notices/content/?id=56904
- SPY Trust: "valued at the last sale price or official closing price, as applicable, on the primary market"; "the midpoint of the best bid and best offer prices on NYSE Arca at the time the Trust's NAV is calculated, ordinarily 4:00 p.m."; "NYSE Arca, Inc." is the "Principal U.S. Listing Exchange". VERIFIED. https://www.sec.gov/Archives/edgar/data/884394/000119312526022775/d77353d497.htm
- OCC: "All Transactions $0.025/contract". VERIFIED. https://www.sec.gov/files/rules/sro/occ/2025/34-104274-ex5a.pdf
- Cboe ORF: "$0.01248 per contract side" effective July 1, 2026, "for executions that occur on Cboe Options". VERIFIED. https://www.sec.gov/files/rules/sro/cboe/2026/34-105902-ex5.pdf
- SEC: "$20.60 per million dollars" from "April 4, 2026". VERIFIED. https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2
- FINRA 26-10: "Effective date: June 4, 2026"; phase-in "over 18 months, until October 20, 2027". VERIFIED. https://www.finra.org/rules-guidance/notices/26-10
- Databento: "Nasdaq begins disseminating imbalance data at 9:25 ET for the Opening Cross and 15:50 ET for the Closing Cross"; "After 9:28 and 15:55, imbalance data is sent every 1 second". VERIFIED. https://databento.com/docs/datasets/xnas-itch
- Databento: "During auction periods, an imbalance message will be published every 1 second, if changed from the previous second."; "Closing: 15:00 to 16:00 ET for all UTP securities". VERIFIED. https://databento.com/docs/datasets/arcx-pillar
- Databento: NYSE "Order Imbalances feeds start at $1,000/month"; full Integrated "upwards of $7,500/month in exchange fees for non-display use"; "Plus or Unlimited subscription". VERIFIED. https://databento.com/blog/NYSE-imbalance-feeds
- Massive: "Focused on NYSE listed securities"; "NYSE Order Imbalances $49/month"; no historical imbalances. VERIFIED. https://massive.com/docs/websocket/stocks/imbalances ; https://massive.com/pricing
- NYSE: "$55.5bn per day"; "9.44% of total US equity notional value traded"; "10.52% of total NYSE-listed trading volume". VERIFIED. https://nyse.com/data-insights/nyse-closing-auction-price-discovery-opportunities-reach-new-highs
- BMLL: "roughly 9% of total daily trading volume"; "about 20% of daily volume" on rebalance/expiration days; "over 34 percent" on Russell reconstitution; "On Nasdaq, we observe clear price convergence between 3:57 and 3:58". VERIFIED. https://www.bmlltech.com/news/market-insight/into-the-close-unpacking-u-s-closing-auction-dynamics-and-the-impact-of-the-russell-reconstitution

### Appendix C. Evidence log - what was actually read vs. blocked (2026-11-06)

| URL / document | Fetch result | How used |
|---|---|---|
| disclosures.schwab.com REG23060.pdf (Schwab Pricing Guide April 2026) | PDF downloaded, text extracted | VERIFIED Schwab fees |
| schwab.com/legal/... pricing guide, schwab.com/pricing, schwab.com/options/trade-options | WAF page "unable to authorize your request" | not usable |
| help.streetsmart.schwab.com Option_Approval_Levels | host not resolvable from session | SNIPPET only |
| fidelity.com option_agreement.pdf | PDF downloaded, text extracted | VERIFIED |
| fidelity.com commissions page | HTML read | VERIFIED |
| ibkb.interactivebrokers.com/article/1767 -> ibkr.info | 301 then 403 | SNIPPET |
| interactivebrokers.com pricing / delivery pages; .ca/.com.au mirrors; ibkrguides | 403 | SNIPPET |
| tastytrade.com/pricing | HTML read | VERIFIED |
| tastyworks.freshdesk.com articles | 404 | SNIPPET |
| support.tastytrade.com articles | JS-only shell ("CSS Error") | not usable |
| robinhood.com support (hours, expiration, index options, fees) | HTML read | VERIFIED |
| us.etrade.com (3 pages, via WebFetch and curl http/1.1) | 503 / empty reply | SNIPPET |
| webull.com FAQ 10614, 659, 10793; /options; /pricing | HTML read | VERIFIED |
| cboe.com fee schedule page (cone) | HTML read | VERIFIED |
| cdn.cboe.com ORF notice Jan 2026 | PDF downloaded, text extracted | VERIFIED |
| sec.gov 34-105902-ex5 (Cboe fee schedule July 1, 2026) | PDF downloaded, text extracted | VERIFIED |
| sec.gov 34-104274-ex5a (OCC fees) | PDF downloaded, text extracted | VERIFIED |
| theocc.com schedule of fees | 403 | replaced by SEC exhibit |
| cboe.com SPX spec (ww2 + cboe.com + weeklys) | HTML read | VERIFIED |
| finra.org notices 020321, 20250103, 26-10; Schedule A | HTML read | VERIFIED |
| sec.gov fee rate advisory 2026-2 | HTML read | VERIFIED |
| nyse.com/trade/auctions, /theclose, insiders guide, closing fact sheet PDF | HTML/PDF read | VERIFIED |
| sec.gov 34-99719 (NYSE 2024 filing) | PDF downloaded, text extracted | VERIFIED |
| govinfo 2025-17337 (NYSE Arca Sept 2025) | PDF downloaded, text extracted | VERIFIED |
| nasdaqtrader.com openclose_faqs.pdf (2025), ClosingCrossfaq.pdf (2019), ccfactsheet.pdf (2006), Trader.aspx OpenClose | PDFs/HTML read | VERIFIED |
| listingcenter.nasdaq.com rulebook | 403 | FAQ used instead |
| cboe.com notice 56904 (BZX) | HTML read | VERIFIED |
| cboe.com/us/equities/trading/auctions | 404 | not usable |
| spglobal.com methodology PDFs, sp-500 index page | 403 | UNVERIFIED |
| sec.gov SPY Form 497 (Jan 2026) | HTML read (two segments) | VERIFIED |
| nyse.com data insights (closing auction record) | HTML read | VERIFIED |
| bmlltech.com Into the Close | HTML read | VERIFIED |
| databento.com schema, xnas-itch, arcx-pillar, blog, pricing | HTML read | VERIFIED |
| massive.com docs, KB, pricing | HTML read | VERIFIED |
| govinfo 2023-20810 (SPXPM order) | HTML read | VERIFIED |

## Source index (accessed 2026-11-06)

Brokers
- Schwab Pricing Guide for Individual Investors, April 2026: https://disclosures.schwab.com/SchwabDashboard/61330/REG23060.pdf
- Schwab StreetSmart Option Approval Levels: https://help.streetsmart.schwab.com/pro/4.36/Content/Option_Approval_Levels.htm
- Schwab international costs page: https://international.schwab.com/resource-center/insights/costs-of-investing
- Fidelity Options Agreement (1.734349.120): https://fidelity.com/accounts/mando/option_agreement.pdf
- Fidelity commissions: https://www.fidelity.com/trading/commissions-margin-rates
- IBKR KB 1767: https://ibkb.interactivebrokers.com/article/1767 ; https://www.ibkr.info/article/1767
- IBKR delivery/exercise: https://www.interactivebrokers.com/en/trading/delivery-exercise-actions.php
- IBKR options commissions: https://www.interactivebrokers.com/en/pricing/commissions-options.php
- IBKR Cboe fees: https://investors.interactivebrokers.com/en/accounts/fees/CBOEoptfee.php
- tastytrade pricing: https://tastytrade.com/pricing/
- tastytrade expiration risk (legacy URLs): https://tastyworks.freshdesk.com/support/solutions/articles/43000484765-expiration-risk-closed-out-of-position- ; https://tastyworks.freshdesk.com/support/solutions/articles/43000484774 ; https://tastyworks.freshdesk.com/support/solutions/articles/43000472843-do-not-exercise-request-dne- ; https://tastyworks.freshdesk.com/support/solutions/articles/43000435308
- Robinhood: https://robinhood.com/us/en/support/articles/options-trading-hours ; https://robinhood.com/us/en/support/articles/expiration-exercise-and-assignment ; https://robinhood.com/us/en/support/articles/index-options ; https://robinhood.com/us/en/support/articles/trading-fees-on-robinhood
- E*TRADE: https://us.etrade.com/l/h/options/expiration-process-risk ; https://us.etrade.com/knowledge/library/options/understanding-expiration ; https://us.etrade.com/knowledge/library/options/navigating-expiration
- Webull: https://www.webull.com/help/faq/10614 ; https://www.webull.com/help/faq/659-Options-Exercise ; https://www.webull.com/options ; https://www.webull.com/pricing
- TradeZero (comparison only): https://tradezero.com/en-us/support/questions/tradezero-america-what-is-the-cutoff-time-to-trade-options-on-expiration-day
- Forum anecdotes (UNVERIFIED): https://elitetrader.com/et/threads/options-auto-liquidation-times.363753/ ; https://discussion.fool.com/t/another-first-for-me-expired-while-in-the-money/118189?page=3

Regulators, clearing, exchange fees
- FINRA Info Notice 2/3/21 (5:30 pm cut-off): https://www.finra.org/rules-guidance/notices/information-notice-020321
- FINRA Info Notice 1/3/25: https://www.finra.org/rules-guidance/notices/information-notice-20250103
- FINRA Regulatory Notice 26-10 (PDT repeal): https://www.finra.org/rules-guidance/notices/26-10
- FINRA Schedule A Section 1 (TAF): https://www.finra.org/rules-guidance/rulebooks/corporate-organization/section-1-member-regulatory-fees
- SEC Fee Rate Advisory 2026-2: https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2
- OCC fee exhibit (SR-OCC-2025-019): https://www.sec.gov/files/rules/sro/occ/2025/34-104274-ex5a.pdf
- Cboe Options fee schedule page: https://www.cboe.com/us/options/membership/fee_schedule/cone/
- Cboe ORF exhibit (SR-CBOE-2026-058): https://www.sec.gov/files/rules/sro/cboe/2026/34-105902-ex5.pdf
- Cboe ORF notice Jan 2026: https://cdn.cboe.com/resources/fee_schedule/2026/Cboe-Options-Exchanges-Regulatory-Fee-Update-Effective-January-2-2026.pdf
- Cboe SR-CBOE-2026-031: https://cdn.cboe.com/resources/regulation/rule_filings/approved/2026/SR-CBOE-2026-031.pdf
- Cboe SPX spec: https://ww2.cboe.com/tradable_products/sp_500/spx_options/specifications ; https://cboe.com/tradable-products/sp-500/spx-options/spx-specifications ; https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/specifications/
- SEC order on SPXPM (88 FR 66103): https://www.govinfo.gov/content/pkg/FR-2023-09-26/html/2023-20810.htm

Auctions and index
- NYSE Auctions: https://www.nyse.com/trade/auctions ; https://www.nyse.com/theclose ; https://nyse.com/article/nyse-closing-auction-insiders-guide ; https://www.nyse.com/publicdocs/nyse/NYSE_Auctions_Closing_Process_Fact_Sheet.pdf
- NYSE SR-NYSE-2024-13: https://www.sec.gov/files/rules/sro/nyse/2024/34-99719.pdf
- NYSE Arca SR-NYSEARCA-2025-67: https://www.govinfo.gov/content/pkg/FR-2025-09-10/pdf/2025-17337.pdf ; SEC 34-84804: https://www.sec.gov/files/rules/sro/nyse/2018/34-84804.pdf
- Nasdaq FAQs: https://www.nasdaqtrader.com/content/productsservices/trading/crosses/openclose_faqs.pdf ; https://www.nasdaqtrader.com/content/productsservices/Trading/ClosingCrossfaq.pdf ; https://www.nasdaqtrader.com/Trader.aspx?id=OpenClose ; https://www.nasdaqtrader.com/content/ProductsServices/Trading/Crosses/ccfactsheet.pdf
- Cboe BZX: https://www.cboe.com/notices/content/?id=56904 ; https://www.sec.gov/file/34-102990-ex5 ; https://public-inspection.federalregister.gov/2025-08114.pdf ; https://policyrisk.com/federal-register/2025-08114
- SPY prospectus (Form 497, Jan 2026): https://www.sec.gov/Archives/edgar/data/884394/000119312526022775/d77353d497.htm
- S&P DJI methodology (403 in session): https://www.spglobal.com/spdji/en/documents/methodologies/methodology-index-math.pdf ; https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf
- NYSE Data Insights (Q2 2024): https://nyse.com/data-insights/nyse-closing-auction-price-discovery-opportunities-reach-new-highs
- BMLL (June 2025): https://www.bmlltech.com/news/market-insight/into-the-close-unpacking-u-s-closing-auction-dynamics-and-the-impact-of-the-russell-reconstitution
- NBER paper: https://conference.nber.org/conf_papers/f145281.pdf

Data vendors
- Databento: https://databento.com/docs/schemas/imbalance ; https://databento.com/docs/datasets/xnys-pillar ; https://databento.com/docs/datasets/xnas-itch ; https://databento.com/docs/datasets/arcx-pillar ; https://databento.com/blog/NYSE-imbalance-feeds ; https://databento.com/pricing
- Massive (ex-Polygon): https://massive.com/docs/websocket/stocks/imbalances ; https://massive.com/knowledge-base/article/does-massive-have-nasdaq-order-imbalance-data-or-only-nyse ; https://massive.com/pricing
- Nasdaq TotalView: https://www.nasdaq.com/products/data/equities/nasdaq-totalview
- IBKR market data: https://ibkb.interactivebrokers.com/fr/node/2840

---

## Implementation consequences for a 3:50-3:59 pm SPX module

1. Hard clocks (ET), all VERIFIED unless noted:
   - 3:50:00 NYSE MOC/LOC cutoff; NYSE Significant Imbalance + per-second informational imbalance begin; Nasdaq NOII begins (10 s cadence); Nasdaq cancel/modify lockout.
   - 3:55:00 Nasdaq MOC cutoff; NOII cadence 1 s with near/far prices; NYSE D Orders enter the published imbalance at their discretionary price; BZX MOC cutoff.
   - 3:58:00 Nasdaq LOC cutoff.
   - 3:59:00 NYSE Arca (SPY) closing freeze.
   - 3:59:50 NYSE D-order entry/modification cutoff - last moment the NYSE imbalance can change materially from floor-broker discretion.
   - 4:00:00 SPXW expiring options stop trading; Nasdaq cross; NYSE/Arca auctions begin; SPY continues to trade only in auction then after-hours; SPY options trade to 4:15.
   - Early-close days: 1:00 pm close; all above shift (NYSE 12:50 cutoff etc. - shift logic UNVERIFIED per venue); FINRA may change exercise cut-offs (calendar feed required).
2. Settlement is auction-based, not tick-based: the SPXW payoff depends on constituents' official closing prices, so a position opened at 3:5x is exposed to the 4:00:00-tick-to-official-close gap (magnitude UNVERIFIED; no public statistic found). Model it explicitly (e.g., from historical SPX 15:59:59 prints vs Cboe published SPXW settlement values) before trusting any "pin" logic.
3. Imbalance data is the natural input for that gap, but coverage is fragmented: NYSE-listed names via Massive ($49/mo) or Databento; Nasdaq-listed via TotalView NOII (Databento/Nasdaq); SPY itself via Arca (Databento). Budget: ~$49/mo (NYSE only) to ~$1,750-4,500/mo + exchange licensing (full). The 3:50-3:55 Nasdaq window carries no near/far prices (10 s cadence, no clearing prices), so Nasdaq-weighted signal quality improves only at 3:55.
4. Broker constraints the module must encode per broker (VERIFIED items): Robinhood 3:30 pm cut-off for stock/ETF 0DTE opens and closeouts from 3:30 (index exempt); Webull 3:40 pm single-leg / 3:00 pm multi-leg opening cut-off; Fidelity 4:20 pm DNE and discretionary restriction of opening orders; tastytrade last-30-min sell-to-open block (SNIPPET). For Schwab/thinkorswim no cut-off is published: the tool should treat Schwab as "exchange rules only" but add a configurable safety margin (e.g., submit by 3:59:30) and log acknowledgement latency empirically because forum reports (UNVERIFIED) cite multi-second delays.
5. Long-only SPX calls/puts avoid every delivery-based liquidation regime (IBKR, E*TRADE two-hour sweep, Robinhood closeouts are all about delivery/assignment risk); cash settlement posts next business day (Cboe). Short legs or spreads trigger risk-team discretion at tastytrade/E*TRADE/Webull and should be excluded or closed well before 3:30.
6. Cost model per SPXW contract: Cboe CS $0.36 (< $1 premium) or CT $0.45 (>= $1, including "Premium Recalculated After Market Close") + ORF $0.01248 + OCC $0.025 + broker commission; no SEC fee or TAF on index options. For 0DTE lottery-style sub-$1 premiums the fee stack is a large fraction of premium - include it in the edge threshold. At Schwab the pass-through is a discretionary "Industry Fee"; calibrate from confirmations.
7. Pattern-day-trade counting is no longer a FINRA constraint (effective June 4, 2026), but broker house rules may persist to Oct 20, 2027 - keep a per-broker flag.
8. Exercise/DNE cut-offs matter only if the tool carries ITM SPXW through 4:00 (automatic exercise at settlement; no DNE needed for a long ITM index option, but DNE could be used to avoid a sub-penny or data-error exercise): Fidelity 4:20 pm, Webull 4:30 pm, tastytrade 4:30 pm ET (SNIPPET), Robinhood 5:00 pm, E*TRADE 5:30 pm (SNIPPET), FINRA max 5:30 pm, Schwab unknown.

## Uncertainties

- Schwab/thinkorswim: no official text found for (a) 0DTE opening cut-off, (b) DNE/exercise cut-off (hypothesised 4:30 pm ET), (c) expiration-risk liquidation timing, (d) order rejection behaviour at 3:59:xx, (e) acknowledgement latency, (f) whether cash accounts may buy SPX at Level 1, (g) the dollar amount of the SPX "Proprietary Index Options Fee" inside the Industry Fee. schwab.com served a WAF block to this session; the Pricing Guide was obtained via disclosures.schwab.com. Follow-up: fetch schwab.com options pages from an interactive browser, or call Schwab; ask thinkorswim for the order-entry reject text on expiration day.
- IBKR, E*TRADE, tastytrade: official pages exist (URLs listed) but could not be fetched here (403/503/404-JS); all quotes are search excerpts (SNIPPET). Re-verify "two hours prior", "5:25 pm", "Close-Out Deadline", "3:30 PM CT", "last 30 minutes".
- S&P DJI methodology text (official close definition, calculation cadence, publication time of the official close) not retrievable (403). The "closing prices in the primary market" rule is VERIFIED only through Cboe's SPXW spec and the SPY prospectus.
- No public statistic found on the typical size of the gap between the 3:59:59 SPX print and the SPXW settlement value; needs an empirical study from Cboe settlement data.
- Nasdaq IO-order entry window after 3:58 pm is stated as "until 4:00 p.m." only in the 2019 FAQ; the 2025 FAQ says IO orders cannot be updated/cancelled after 3:50 but does not restate the entry deadline.
- Cboe BZX imbalance cadence (5 s / 1 s) and the operative date of the 3:55 MOC cutoff are from secondary summaries.
- FINRA TAF options rate: finra.org text shows $0.00279/contract while Robinhood shows $0.00329 from Jan 1, 2026 plus an Oct-Dec 2026 pause; not reconciled (irrelevant for SPX, relevant for SPY).
- Webull index-option fee: official pages say $0.50; one FAQ excerpt says $0.55 for SPX/SPXW/VIX.
- Cboe SPX customer fee CT rose from $0.40 (April 2026 filing) to $0.45 (Nov 2, 2026 schedule); confirm whether CS/CT are also the rates applied by each broker's clearing firm and whether any SPX "surcharge" (IBKR snippet $0.20) still exists.
- Nasdaq Data Link / NCDS retail pricing for NOII not found. IBKR/thinkorswim imbalance availability: absence not proven.
- The web-search budget for this session was exhausted; suggested follow-up searches: "Schwab options expiration day cutoff thinkorswim", "IBKR expiration liquidation index options", "tastytrade help center expiration risk 2026", "S&P DJI Index Mathematics Methodology closing price", "Cboe SPXW settlement value vs 4pm print study".
