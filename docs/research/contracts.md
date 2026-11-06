# US Index Option Contract Mechanics
## Research memo for a private SPX/SPY intraday options decision tool

- Prepared: 2026-11-06
- All sources accessed 2026-11-06 unless stated otherwise.
- Scope: SPX (AM-settled 3rd Friday), SPXW (PM-settled weeklys / EOM / PM 3rd Friday), SPXO (AM-settled weeklys, launching 2026-11-09), XSP, SPY options; S&P 500 close mechanics; ES futures; ticks / strikes / exercise; 2026–2027 holidays and DST; Cboe free data and its terms.

### Verification tags used throughout
- `[VERIFIED]` — read directly from the cited primary source on 2026-11-06 (web page, PDF, rulebook text, or Cboe's own JSON endpoint).
- `[SECONDARY]` — read from a non-primary source (broker help page, press reprint, Wikipedia); corroboration only.
- `[DERIVED]` — computed by me from verified rules plus verified holiday lists.
- `[UNVERIFIED]` — the primary source could not be fetched on 2026-11-06 (HTTP 403/503/DNS); the statement comes from memory or a search snippet and must be re-checked.
- Cboe C1 rulebook: downloaded as PDF (3.6 MB) and text-extracted; quotes are from that text. Rule numbers are Cboe Exchange, Inc. (C1) rules.

### Primary-source index (all accessed 2026-11-06)
| Short name | URL |
|---|---|
| Cboe C1 Rulebook (PDF) | https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf |
| SPX spec | https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/ |
| SPXW spec | https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/specifications/ |
| SPX EOM spec | https://www.cboe.com/tradable_products/sp_500/spx_end_of_month_options/specifications/ |
| XSP spec | https://www.cboe.com/tradable_products/sp_500/mini_spx_options/specifications/ |
| Cboe hours & holidays | https://www.cboe.com/about/hours/us-options/ |
| Cboe GTH page | https://www.cboe.com/about/global-trading-hours/ |
| Cboe 24x5 FAQ | https://www.cboe.com/document/tech-spec/content/technical-specifications/cboe-options-exchange-245-faq |
| Cboe 2026 expiration calendar (PDF) | https://cdn.cboe.com/resources/options/Cboe2026OPTIONSCalendar.pdf |
| Cboe notice C2026090300 (SPXO) | https://www.cboe.com/notices/content/?id=61537 |
| SEC order 34-105678 / SR-CBOE-2026-044 (AM weeklys) | https://www.govinfo.gov/content/pkg/FR-2026-06-17/html/2026-12157.htm |
| SEC notice 34-106620 / SR-CBOE-2026-078 (GTH/Curb) | https://www.sec.gov/files/rules/sro/cboe/2026/34-106620.pdf |
| SEC order 34-67482 / SR-CBOE-2012-042 (SPBAS; cites SPXPM 3:00 CT close) | https://www.sec.gov/files/rules/sro/cboe/2012/34-67482.pdf |
| SEC notice FR 2025-09622 / SR-CBOE-2025-022 (SPEQF; 4:00 p.m. rationale) | https://www.govinfo.gov/content/pkg/FR-2025-05-29/html/2025-09622.htm |
| OCC Rule 1804 text (SR-OCC-2022-009 Exhibit 5) | https://www.sec.gov/files/rules/sro/occ/2022/34-95364-ex5.pdf |
| OCC Rule 805 $0.01 (34-57163 / SR-OCC-2007-18) | https://www.govinfo.gov/content/pkg/FR-2008-01-24/html/E8-1155.htm |
| OCC late-exercise order 34-88310 / SR-OCC-2020-001 | https://www.sec.gov/files/rules/sro/occ/2020/34-88310.pdf |
| FINRA Rule 2360 | https://www.finra.org/rules-guidance/rulebooks/finra-rules/2360 |
| NYSE hours & holidays | https://www.nyse.com/markets/hours-calendars |
| NYSE trading info (closing auction) | https://www.nyse.com/markets/nyse/trading-info |
| NIST DST page | https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst |
| Cboe website terms | https://www.cboe.com/terms/ |
| Cboe delayed-quote JSON (SPX) | https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json |
| Cboe daily market statistics | https://www.cboe.com/markets/us/options/market-statistics/daily/ |
| Cboe historical options data | https://www.cboe.com/us/options/market_statistics/historical_data/ |
| Cboe index settlement values hub | https://www.cboe.com/index_settlement_values/ |
| Cboe SPX product page | https://www.cboe.com/tradable_products/sp_500/spx_options/ |
| Cboe 2019 corrected-settlement notice (PDF) | https://cdn.cboe.com/resources/release_notes/2019/Corrected-Closing-Settlement-Prices-for-Certain-SP-Indices-II.pdf |
| Cboe DataShop policies | https://datashop.cboe.com/data-policies |
| Cboe equity-options extended hours launch (press reprint) | https://mondovisione.com/news/cboe-launches-extended-trading-sessions-for-select-single-stock-and-etf-options-20261019/ |

---

## 0. Quick reference: session clock by product (ET wall-clock) [VERIFIED unless tagged]

| Product | Root | Settlement | Normal RTH | Expiration-day stop | Curb | GTH |
|---|---|---|---|---|---|---|
| SPX standard | `SPX` | AM, SET (3rd Fri open) | 9:30–16:15 | Prior business day (Thu); spec says "5:00 pm ET" (end of Curb); no GTH resumption | 16:15–17:00 | 20:15 (prev day)–09:25 |
| SPX weekly PM / EOM / PM 3rd-Fri | `SPXW` | PM, official S&P 500 close | 9:30–16:15 | **16:00:00** (13:00 on half-days) | 16:15–17:00 (non-expiring only) | 20:15–09:25 (expiring 0DTE included, by Rule 5.1(c)(3) inference) |
| SPX weekly AM (from 2026-11-09) | `SPXO` | AM, SET | same as SPX | Prior business day 16:00; "does not resume" in GTH | per SPX | per SPX |
| Mini-SPX | `XSP` | PM, 1/10 official close | 9:30–16:15 | **16:00:00** | 16:15–17:00 | 20:15–09:25 |
| SPY options | `SPY` | PM, physical 100 sh | 9:30–16:15 (designated ETF) | 16:15 (no 16:00 carve-out in rule) | none ("no Curb session for these classes") | 07:30–09:25 (since 2026-10-19) |
| SPY (stock) | — | — | 9:30–16:00 (NYSE core) | — | — | — |
| ES futures | — | SOQ at 3rd-Fri open | ~23h/day Sun 18:00–Fri 17:00, halt 17:00–18:00 [UNVERIFIED] | 09:30 3rd Friday [UNVERIFIED] | — | — |

---

## 1. SPX vs SPXW vs XSP vs SPY — core contract terms

Sources for §1: SPX spec https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/ ; SPXW spec https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/specifications/ ; EOM spec https://www.cboe.com/tradable_products/sp_500/spx_end_of_month_options/specifications/ ; XSP spec https://www.cboe.com/tradable_products/sp_500/mini_spx_options/specifications/ ; C1 rulebook https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf ; Cboe hours https://www.cboe.com/about/hours/us-options/ ; 24x5 FAQ https://www.cboe.com/document/tech-spec/content/technical-specifications/cboe-options-exchange-245-faq ; SEC 34-67482 https://www.sec.gov/files/rules/sro/cboe/2012/34-67482.pdf ; FR 2025-09622 https://www.govinfo.gov/content/pkg/FR-2025-05-29/html/2025-09622.htm ; Cboe notice 61537 https://www.cboe.com/notices/content/?id=61537 — all accessed 2026-11-06.

### 1.1 Cboe's own side-by-side table [VERIFIED]
Source: "Comparison of S&P 500 Option Products" table on the [SPXW spec](https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/specifications/) (accessed 2026-11-06). Verbatim cell values:

| Field | SPX Index Options | SPX Weekly and End of Month | XSP (Mini-SPX) | SPY ETF Options |
|---|---|---|---|---|
| Root Ticker Symbol | `SPX` | `SPXW` | `XSP` | `SPY` |
| AM or PM Settlement | AM | PM | PM | PM |
| Settlement Date* | 3rd Friday | "Mon., Tue., Wed., Th., Fri., 3rd Fri. and Last Trading Day of Month" | same text as SPXW | "Mon., Wed., Fri., 3rd Fri. and Last Trading Day of Month" (stale, see §3.1) |
| Approximate Notional Size (S&P at 4,500) | $450,000 | $450,000 | $45,000 | $45,000 |
| Settlement Type | Cash | Cash | Cash | "Physical Shares of ETF" |
| Exercise Style | European | European | European | American |
| Global Trading Hours Available** | Yes | Yes | Yes | No (stale, see §3.4) |

- Footnote `*` (exact): "In the case of a holiday on the settlement date, the settlement date is moved back one business day (e.g. from Friday to Thursday), with the exception of Monday Weeklys, where the settlement date will move forward one business day (i.e. Monday to Tuesday). In addition, no SPX EOW, Monday Weeklys, Tuesday Weeklys, Wednesday Weeklys or Thursday Weeklys will be listed that would have an expiration date that coincides with the expiration date of a traditional SPX option or SPX EOM option."
- Footnote `**` (exact): "The trading hours for options on the SPX, SPXW (SPX Weeklys and SPX End-of-Month), and XSP (Mini-SPX) begin at 8:15 p.m. Eastern time and end at 9:25 a.m. Eastern time."

### 1.2 Multiplier and premium quotation [VERIFIED]
- SPX spec "Product Snapshot (as of March 19, 2024)": Symbol `SPX/SPXW`; CUSIP `648815`; Multiplier `100`. ([SPX spec](https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/) (accessed 2026-11-06))
- SPX spec "Premium Quote": "Stated in decimals. One point equals $100. Minimum tick for options trading below 3.00 is 0.05 ($5.00) and for all other series, 0.10 ($10.00)."
- SPX EOM spec "Premium Quotation": identical text. ([EOM spec](https://www.cboe.com/tradable_products/sp_500/spx_end_of_month_options/specifications/) (accessed 2026-11-06))
- XSP spec: Symbol `XSP`; CUSIP `12505Q`; Multiplier `100`; "The Mini-SPX Index, based on 1/10th the value of the Standard & Poor's 500 Index (SPX)." ([XSP spec](https://www.cboe.com/tradable_products/sp_500/mini_spx_options/specifications/) (accessed 2026-11-06))
- XSP spec "Premium Quotation": "Stated in decimals. One point equals $100. The minimum tick for XSP options is 0.01 ($1.00) for all series, including LEAPS."
- Rule 4.13 Interp. .06: "The current index value of reduced-value options on the S&P 500 Stock Index ('Mini-SPX options') ... shall be one-tenth (1/10th) the value of the applicable underlying index reported by the Reporting Authority." ([C1 rulebook](https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf) (accessed 2026-11-06))
- SPY unit of trading: Rule 5.3(a) example: "a bid of '7' represents a bid of $700 for an option contract having a unit of trading consisting of 100 shares of an underlying security". Rule 5.2: "The unit of trading in each series of options traded on the Exchange is the unit of trading established for that series by the Clearing Corporation".

### 1.3 Exercise style [VERIFIED]
- Rule 1.1: "The term 'European-style option' means an option contract that, subject to the provisions of Rule 6.20 and to the Rules of the Clearing Corporation, may be exercised only on its expiration date."
- Rule 1.1: "The term 'American-style option' means an option contract that, subject to the provisions of Rule 6.20 and to the Rules of the Clearing Corporation, may be exercised on any business day prior to and on its expiration date."
- Rule 4.13(a)(3) ("European-Style Exercise") lists "S&P 500 Stock Index" and "Mini-SPX Index" among approved European-style index options.
- SPX spec "Exercise Style": "European - SPX options generally may be exercised only on the expiration date."
- XSP spec "Exercise Style": "European - Mini-SPX Index options generally may be exercised only on the expiration date."
- EOM spec "Exercise Style": "European. End-of-Month S&P 500 Index options generally may be exercised only on the expiration date."
- SPY: "American" per Cboe comparison table (§1.1).

### 1.4 Settlement value — AM (SET) [VERIFIED]
- SPX spec "Settlement Value": "Exercise will result in delivery of cash on the business day following expiration. The exercise-settlement value, SET, is calculated using the opening sales price in the primary market of each component security on the expiration date. The exercise-settlement amount is equal to the difference between the exercise-settlement value and the exercise price of the option, multiplied by $100."
- SPX spec "Expiration Date": "The third Friday of the expiration month."
- SPX spec "Last Trading Day": "Trading in SPX options will ordinarily cease on the business day (usually a Thursday) preceding the day on which the exercise-settlement value is calculated."
- SPX spec "EXPIRATION TRADING HOURS": "Trading in SPX options will ordinarily cease on the business day (usually a Thursday) preceding the day on which the exercise-settlement value (i.e., the expiration date) is calculated, 5:00 pm ET."
- Rule 4.13(a)(4): "The last day of trading for non-Volatility A.M.-settled index options shall be the business day preceding the last day of trading in the underlying securities prior to expiration."
- Rule 4.13(a)(4): "The current index value at the expiration of an A.M.-settled index option shall be determined, for all purposes under these Rules and the Rules of the Clearing Corporation, on the last day of trading in the underlying securities prior to expiration, by reference to the reported level of such index as derived from the opening prices ... of the underlying securities on such day, as determined by the market for such security selected by the Reporting Authority pursuant to Interpretation and Policy .09 to Rule 4.13, except that in the event that the primary market for an underlying security does not open for trading, halts trading prematurely, or otherwise experiences a disruption of normal trading on that day ... the price of that security shall be determined ... as set forth in Rule 5.20(e)."
- Rule 4.13 Interp. .02: "The reported level of the underlying index that is calculated by the Reporting Authority on the last day of trading in the underlying securities prior to expiration for purposes of determining the current index value at the expiration of an A.M.-settled index option may differ from the level of the index that is separately calculated and reported by the reporting authority and which reflects trading activity subsequent to the opening of trading in any of the underlying securities."
  - Reading: SET is not the 9:30:00 SPX print. Each constituent's opening print can occur minutes after 9:30; SET is assembled from those prints.
- Rule 5.20(e): "When the primary market for a security underlying the current index value of an index option does not open for trading, halts trading prematurely, or otherwise experiences a disruption of normal trading on a given day ... the price of that security shall be determined, for the purposes of calculating the current index value at expiration, in accordance with the Rules and By-Laws of the Clearing Corporation."
- Rule 4.13 Interp. .09: "the source of the prices of component securities used to calculate the current index level at expiration is determined by the Reporting Authority for that index." (S&P DJI is the Reporting Authority for the S&P 500.)

### 1.5 Settlement value — PM (official close) [VERIFIED]
- EOM spec "Settlement of Option Exercise": "End-of-Month S&P 500 Index options are PM-settled. The exercise-settlement value is calculated using the last (closing) reported sales price in the primary market of each component stock on the last business day (the expiration date) of the month. The exercise-settlement amount is equal to the difference between the exercise-settlement value and the exercise price of the option, multiplied by $100. Exercise will result in delivery of cash on the business day following expiration."
- EOM spec "Description": "End-of-Month S&P 500 Index Options are PM-settled; that is, their exercise settlement value is based on the closing level of the S&P 500 Index on the day the options expire."
- XSP spec "Settlement of Option Exercise": "Exercise will result in delivery of cash on the business day following expiration. The exercise settlement value, XSP, is one-tenth (1/10th) the official closing price of the S&P 500 Index as reported by Standard & Poor's on the last trading day of the expiring series. The exercise settlement amount is equal to the difference between the exercise-settlement value and the exercise price of the option, multiplied by $100."
- Rule 4.13 Interp. .13 defines "P.M.-Settled" options as those "whose exercise settlement value is derived from closing prices on their expiration dates".
- Rule 4.13 Interp. .05: "The Rules of the Clearing Corporation specify that, unless the Rules of the Exchange provide otherwise, the current index value used to settle the exercise of an index option contract shall be the closing index for the day on which the index option contract is exercised in accordance with the Rules of the Clearing Corporation or, if such day is not a business day, for the most recent business day."
- The SPXW spec page itself does not restate the PM formula; the EOM and XSP pages (same product family, same mechanics) do.
- How S&P DJI itself defines/publishes the "official closing price" could not be read on 2026-11-06 (HTTP 403) — see §5.2.

### 1.6 Expiration-day stop for PM-settled SPXW: 4:00 p.m. ET, not 4:15 [VERIFIED, five independent Cboe statements]
- SPX spec "EXPIRATION TRADING HOURS": "Trading in SPXW options will ordinarily cease on the day of expiration, 4:00 pm ET, and at 1:00 pm ET for any half day holiday."
- Rule 5.1(b)(2)(C): "On their last trading day, Regular Trading Hours for the following options are from 9:30 a.m. to 4:00 p.m.:" followed by a list that includes "Index Options with P.M.-Settled Nonstandard Expirations (i.e., Weeklys and EOMs), Monthly Options Series, Quarterly Options Series, and Quarterly Expirations (i.e., QIXs)", "SPX options (p.m.-settled)", "XSP options (p.m.-settled)", "RUT options (p.m.-settled)", "MRUT options (p.m.-settled)", "DJX options (p.m.-settled)" and others.
- Rule 4.13(e)(3): "Weekly Expirations and EOM Trading Hours on the Last Trading Day. On the last trading day, Regular Trading Hours for expiring Weekly Expirations and EOMs are from 9:30 a.m. and 4:00 p.m." (sic, "and").
- EOM spec "Trading Hours": "Regular Hours: 8:30 to 3:15 p.m. Central time; except that on their expiration date, expiring End-of-Month S&P 500 Index options close trading at 3:00 p.m. Central time. All non-expiring End-of-Month S&P 500 Index options will continue to trade until 3:15 p.m. Central time."
- XSP spec: "On the last trading day, trading in both expiring Mini-SPX (XSP) Weeklys and End of Month closes at 3:00 p.m. (Chicago)."
- Cboe 24x5 FAQ: "Trading for expiring PM settled options ceases at 4:00 p.m. ET on their expiration day." ([24x5 FAQ](https://www.cboe.com/document/tech-spec/content/technical-specifications/cboe-options-exchange-245-faq) (accessed 2026-11-06))
- Regulatory rationale (historical):
  - SEC Release 34-67482 (2012-07-20, SR-CBOE-2012-042), footnote: "Trading in expiring SPXPM options closes at 3:00 p.m. (Chicago time) on their last day of trading ... See Securities and Exchange Act Release No. 65630 (October 26, 2011) ... (SR-C2-2011-030) (notice of filing and immediate effectiveness of proposed rule change to close trading at 3 p.m. Chicago time on the last day of trading of expiring SPXPM options)." ([34-67482](https://www.sec.gov/files/rules/sro/cboe/2012/34-67482.pdf) (accessed 2026-11-06))
  - Same order: "because the closing value of the S&P 500 on the last trading day is a necessary component of the ... settlement value calculation, that value cannot be calculated until the end of the day on the last trading day."
  - SEC/FR 2025-09622 (SR-CBOE-2025-022, SPEQF/SPEQX): trading past 4:00 p.m. "would occur after the settlement value is calculated, which could cause pricing divergence"; existing Rule 5.1(b)(2)(C) described as "Regular Trading Hours for expiring p.m.-settled SPX, XSP, RUT, MRUT options" 9:30 a.m.–4:00 p.m. ([FR 2025-09622](https://www.govinfo.gov/content/pkg/FR-2025-05-29/html/2025-09622.htm) (accessed 2026-11-06))
- Non-expiring SPX/SPXW series continue to 4:15 p.m. ET and then trade in Curb 4:15–5:00 p.m. ET (§1.7).

### 1.7 Trading hours: RTH, Curb, GTH [VERIFIED]
Cboe hours page, index options table ("all times are Eastern Time") ([hours](https://www.cboe.com/about/hours/us-options/) (accessed 2026-11-06)):
- "Begin GTH Order Acceptance (SPX, VIX, XSP, RUT)* 8:00 p.m."
- "Global Trading Hours (SPX, VIX, XSP, RUT)* 8:15 p.m. – 9:25 a.m."
- "Begin RTH Order Acceptance 7:30 a.m."
- "Regular Trading Hours (RTH) 9:30 a.m. – 4:15 p.m."
- "Curb* 4:15 p.m. – 5:00 p.m." with "*All-electronic trading".

Rulebook text:
- Rule 5.1(b)(2): "Regular Trading Hours for transactions in index options are from 9:30 a.m. to 4:15 p.m., except as follows:" (exceptions include the 4:00 p.m. list above).
- Rule 5.1(c): "Global Trading Hours for index options are from 8:15 p.m. (previous day) to 9:25 a.m. on Monday through Friday, and Global Trading Hours for equity options (including options on individual stocks, ETFs, ETNs, and other securities) are from 7:30 a.m. to 9:25 a.m. Monday through Friday."
- Rule 5.1(c)(1) GTH-eligible index classes: SPX, VIX, XSP, RUT, MRUT, MGTN, CBTX, MBTX.
- Rule 5.1(c)(3): "Any non-expired series in eligible classes that were open for trading on the previous trading day (as of the close of the previous day's Curb Trading Hours) will be open for trading during Global Trading Hours on that following trading day (subject to Rules 4.13 (for index options), 4.5 (for equity options), and 5.31)."
- Rule 5.1(c)(4): VIX "will be widely disseminated at least once every fifteen (15) seconds" between 3:00 a.m. and 9:25 a.m.; "No current index value underlying any other index option trading during Global Trading Hours is disseminated during or at the close of that trading session."
- Rule 5.1(c)(5): "Trading during Global Trading Hours is electronic only on the System."
- Rule 5.1(d): "Curb Trading Hours are from 4:15 p.m. to 5:00 p.m. on Monday through Friday for index options and 4:00 p.m. to 4:15 p.m. for equity options."
- Rule 5.1(d)(4): "The Exchange will not report a value of an index underlying an index option trading during Curb Trading Hours, because the value of the underlying index will not be recalculated during or at the close of Curb Trading Hours."
- GTH page: "GTH opens Sunday evening (8:15 p.m. ET / 7:15 p.m. CT), which is Monday morning in Asia-Pacific." ([GTH](https://www.cboe.com/about/global-trading-hours/) (accessed 2026-11-06))
- Cboe Insights "Trade Around the Clock with Cboe Global Trading Hours" (2026-02-09): Curb is "all electronic trading, 3:15 p.m. – 4:00 p.m. CT Monday through Friday"; "Curb activity takes the same trade date as the preceding RTH session." ([Insights](https://www.cboe.com/insights/posts/cboe-global-trading-hours) (accessed 2026-11-06))
- Stale text warning: the EOM spec page still says "Extended Hours: 2:00 a.m. to 8:15 a.m. Central time (Chicago time)" — obsolete; rulebook/hours page govern.
- Rulebook banner on Rule 5.1 (2026-11-06 text): "Amendments to Rule 5.1 adopted pursuant to SR-CBOE-2026-078 will become operative on November 16, 2026." (See §4.3.)

### 1.8 Do expiring contracts trade in GTH on expiration day?
- PM-settled 0DTE (SPXW/XSP): yes, by rule inference. Rule 5.1(c)(3) opens "any non-expired series" in GTH; a Friday-expiring SPXW is non-expired during the Thursday-night/Friday-morning GTH session, and the 24x5 FAQ says it ceases at 4:00 p.m. ET that day. [VERIFIED rule text; application is inference — no Cboe sentence says "0DTE trades in GTH" verbatim]
- AM-settled standard SPX / SPXO: no. Cboe notice C2026090300 (SPXO): "On the final trading day before expiration, trading stops at 4:00pm on regular trading days and does not resume for that evening's Global Trading Hours (GTH) session." ([notice 61537](https://www.cboe.com/notices/content/?id=61537) (accessed 2026-11-06)) [VERIFIED]
- 24x5 FAQ Q3: AM-settled index options (except VIX) "will stop trading at 9:25 a.m. ET on their expiration date" once a future change takes effect (date "TBD"); "Today they stop at the close on the prior business day." [VERIFIED] — a pending change to monitor.
- Discrepancy: SPX spec says expiring SPX ceases "5:00 pm ET" Thursday (through Curb); the SPXO notice says "4:00pm" for SPXO's final day. Treat expiring AM series as untradeable after Thursday RTH for planning purposes.

---

## 2. SPXW expirations in 2026, the 3rd-Friday quirk, symbols, strikes

Sources for §2: C1 rulebook (Rules 4.13(a),(e), Interp. .01/.10/.13) https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf ; Cboe 2026 calendar https://cdn.cboe.com/resources/options/Cboe2026OPTIONSCalendar.pdf ; Cboe delayed JSON https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json ; Cboe notice 61537 https://www.cboe.com/notices/content/?id=61537 ; Cboe notice 57808 https://www.cboe.com/notices/content/?id=57808 ; SEC order FR 2026-12157 https://www.govinfo.gov/content/pkg/FR-2026-06-17/html/2026-12157.htm ; SPX/EOM/XSP specs as in §1; Wikipedia OSI (secondary) https://en.wikipedia.org/wiki/Option_symbol — all accessed 2026-11-06.

### 2.1 Which weekday expirations exist (rule) [VERIFIED]
- Rule 4.13(e)(1): "The Exchange may open for trading P.M.-Settled Weekly Expirations on any broad-based index eligible for standard options trading and on CBTX, MBTX, and the Cboe Magnificent 10 Index or A.M.-Settled Weekly Expirations on SPX, to expire on any Monday, Tuesday, Wednesday, Thursday, or Friday (other than the third Friday-of-the-month or days that coincide with an EOM expiration)."
- Rule 4.13(e)(1): "new series in P.M.-Settled Weekly Expirations may be added up to and including on the expiration date for an expiring Weekly Expiration."
- Rule 4.13(e)(1): "The maximum number of expirations that may be listed for each Weekly Expiration (i.e., a A.M.-Settled Monday expiration, P.M.-Settled Monday expiration, ... A.M.-Settled Friday expiration or P.M-Settled Friday expiration, as applicable) in a given class is the same as the maximum number of expirations permitted in Rule 4.13(a)(2) for standard options on the same index."
- Rule 4.13(a)(2): the Exchange may "list up to 12 standard monthly expirations at any one time for any class that ... S&P 500 Index ... Mini-SPX Index ... options" (so up to 12 of each weekday type).
- Rule 4.13(e)(1): "Weekly Expirations need not be for consecutive Monday, Tuesday, Wednesday, Thursday, or Friday expirations"; "Weekly Expirations that are first listed in a given class may expire up to four weeks from the actual listing date."
- Rule 4.13(e)(1) holiday shifts: "If the Exchange is not open for business on a respective Monday, the normally Monday expiring Weekly Expirations will expire on the following business day. If the Exchange is not open for business on a respective Tuesday, Wednesday, Thursday, or Friday, the normally Tuesday, Wednesday, Thursday, or Friday expiring Weekly Expirations will expire on the previous business day. If two different Weekly Expirations would expire on the same day because the Exchange is not open for business on a certain weekday, the Exchange will list only one of such Weekly Expirations."
- Rule 4.13(e)(2) EOM: "P.M.-Settled EOMs ... or A.M.-Settled EOMs on SPX, to expire on last trading day of the month"; "If the Exchange lists EOMs and Weekly Expirations as applicable in a given class, the Exchange will list an EOM instead of a Weekly Expiration that expires on the same day in the given class."
- Cboe 2026 calendar legend: "SPX and XSP Weeklys Expiration — Expire every business day except for days which coincide w/ 3rd Friday, End of Month and Quarterly Index expirations." ([2026 calendar PDF](https://cdn.cboe.com/resources/options/Cboe2026OPTIONSCalendar.pdf) (accessed 2026-11-06))
- Calendar legend also: "End-of-Month Options - Expires at the close"; "End-of-Quarter Options - Expires at the close in Quarter Months (March, June, September and December)".

### 2.2 Which expirations were actually listed on 2026-11-06 (Cboe delayed JSON) [VERIFIED by direct fetch]
- File: `_SPX.json`, data `timestamp` "2026-11-06 16:22:25"; 31,306 option records; roots: `SPXW` 21,284, `SPX` 10,022; no `SPXO` yet.
- SPXW expirations present: every business day 2026-11-06 → 2026-12-17 (261106, 261109, 261110, 261111, 261112, 261113, 261116, 261117, 261118, 261119, 261120, 261123, 261124, 261125, 261127, 261130, 261201, 261202, 261203, 261204, 261207, 261208, 261209, 261210, 261211, 261214, 261215, 261217), then 261218 (3rd Fri), 261231 (EOM), 270108, 270115 (3rd Fri), 270129 (EOM), 270219, 270226, 270319, 270331, 270416, 270430, 270521, ...
  - 261126 (Thanksgiving) absent; 261125 (Wed) present; 261127 (early-close Friday) present. Consistent with Rule 4.13(e)(1).
  - Dailies listed ≈6 weeks out, more than the "four weeks from the actual listing date" phrase might suggest (see Uncertainties).
- `SPX`-root (AM-settled) expirations present only on 3rd Fridays: 261120, 261218, 270115, 270219, 270319, 270416, 270521, 270617, 270716, 270820, 270917, 271015, 271119, 271217, 280121, 280616, 281215, 291221, 301220, 311219.
- Cboe notice C2025121904 (effective 2025-12-22) added "SPX expiring December 19, 2031" and "the December 15, 2028 expiration for XSP". ([notice 57808](https://www.cboe.com/notices/content/?id=57808) (accessed 2026-11-06))

### 2.3 The 3rd-Friday quirk: AM `SPX` and PM `SPXW` on the same date [VERIFIED]
- Rule 4.13 Interp. .13: "In addition to A.M.-settled S&P 500 Stock Index ('SPX'), Mini-SPX Index ('XSP') ... options approved for trading on the Exchange pursuant to Rule 4.13, the Exchange may also list SPX, XSP ... options whose exercise settlement value is derived from closing prices on their expiration dates ('P.M.-Settled') that expire on the third Friday-of-the-month ('P.M.-Settled Third Friday Index Options')."
- Observed: for 261120, 261218, 270115, 270219, 270319 the JSON contains both `SPX`-root (AM) and `SPXW`-root (PM) series for the same date (e.g., `SPX261120C00400000` and `SPXW261120...`).
- Mechanics for 2026-11-20: `SPX` Nov series last trade Thu 2026-11-19 (settle to Fri SET at the open); `SPXW` Nov-20 series trade Fri until 16:00:00 ET and settle to Fri's official close.
- Rule 5.1(b)(2)(C) lists "SPX options (p.m.-settled)" explicitly, so the 4:00 p.m. stop applies to the PM 3rd-Friday contract as it does to weeklys.
- The SPXW-spec footnote ("no SPX EOW, Monday Weeklys ... will be listed that would have an expiration date that coincides with ... a traditional SPX option") concerns the Weeklys program only; the PM 3rd-Friday contract is listed under Interp. .13 and carries the `SPXW` root. A tool must not assume an SPXW symbol on a 3rd Friday has no AM twin.

### 2.4 NEW: SPXO — AM-settled SPX weeklys, trade date 2026-11-09 [VERIFIED]
- Cboe notice C2026090300 "Cboe Options to List S&P 500 AM-Settled Expiring Weekly Options" ([notice 61537](https://www.cboe.com/notices/content/?id=61537) (accessed 2026-11-06)):
  - Effective trade date November 9, 2026, "subject to regulatory review".
  - Trading symbol **SPXO**; "AM-settled. SPXO expires at the open on its expiration date and settles to the SPX opening settlement price (SET)".
  - "mirrors AM-settled SPX monthly options that expire on the third Friday".
  - "On the final trading day before expiration, trading stops at 4:00pm on regular trading days and does not resume for that evening's Global Trading Hours (GTH) session."
  - Initial expirations: **2026-11-18 (Wed)** and **2026-12-16 (Wed)**, aligned with monthly VIX settlements; "SPX options expiring on VIX monthly settlement dates will be listed with both AM and PM settlement."
  - Matching: SPXO on matching unit 33 with SPX; SPXO single-leg and complex books use price-time allocation (SPX stays pro-rata); minimum quote size 1 for quotes above $0; complex orders may combine any two of SPX, SPXO, SPXW, but legging into single-leg books requires the same matching unit (SPXW is on a separate engine).
  - Certification environment availability from 2026-10-05.
- SEC approval: Release 34-105678, SR-CBOE-2026-044, order dated 2026-06-12, 91 FR 36641 (2026-06-17) ([govinfo](https://www.govinfo.gov/content/pkg/FR-2026-06-17/html/2026-12157.htm) (accessed 2026-11-06)):
  - A.M.-settled SPX Weekly Expirations "may expire on Monday through Friday, excluding the third Friday of the month and days that coincide with an end-of-month expiration"; A.M.-settled EOMs also permitted.
  - "A.M.-settled weekly expirations first listed may expire up to four weeks from the listing date."
  - Rule 5.1(b)(2)(C) reference narrowed to "P.M.-Settled Nonstandard Expirations" (the 4:00 p.m. stop is PM-only).
- Consequence: from 2026-11-09 a single calendar date can carry up to three SPX-family roots — `SPX` (AM, 3rd Fri only), `SPXO` (AM, weekday), `SPXW` (PM).

### 2.5 Telling them apart by symbol / OCC option symbol
- Cboe's JSON uses OSI-style compact symbols [VERIFIED by direct fetch]:
  - `SPX261120C00400000` → root `SPX`, expiry `261120` (YYMMDD), `C`, strike `00400000` = 400.000.
  - `SPXW261106C07415000` → root `SPXW`, 2026-11-06 call, strike 7415.000.
- OSI structure (Wikipedia, [SECONDARY], accessed 2026-11-06): "Root symbol of the underlying stock or ETF, padded with spaces to 6 characters"; "Expiration date, 6 digits in the format yymmdd"; "Option type, either P or C, for put or call"; strike "as the price x 1000", "front padded with 0s to 8 digits"; example "SPX   141122P01950000" = SPX put, 2014-11-22, strike 1950. ([Wikipedia](https://en.wikipedia.org/wiki/Option_symbol) (accessed 2026-11-06))
- Interactive Brokers' OSI page (ibkr.info/article/972) returned HTTP 403 on 2026-11-06; OCC's own symbology document was not fetched.
- Parser rule: `^(SPX|SPXO|SPXW|XSP|SPY)\s*(\d{6})([CP])(\d{8})$`; root → settlement type. Many feeds strip the padding spaces; accept both.

### 2.6 Strike intervals and intraday strike additions [VERIFIED]
- SPX spec "Strike Price Intervals": "Five points. 25-point intervals for far months."
- SPX spec "Strike Prices": "In-, at- and out-of-the-money strike prices are initially listed. New series are generally added when the underlying trades through the highest or lowest strike price available."
- EOM spec "Strike Price Intervals": "No less than 5 points. Strike price intervals shall be the same as standard SPX options."
- Rule 4.13 Interp. .01(a): "The interval between strike prices will be no less than $5.00; provided, that in the case of the following classes of index options, the interval between strike prices will be no less than $2.50: ... Reduced-value options on the S&P 500 Stock Index ..."
- Rule 4.13 Interp. .10(c): "The lowest strike price interval that may be listed for standard Mini-SPX options is $1, including for LEAPS, and the lowest strike price interval that may be listed for series of Mini-SPX listed under either the Short Term Option Series Program in Rule 4.13(a)(2)(A) or the Nonstandard Expirations Program in Rule 4.13(e) is $0.50."
- XSP spec "Strike Price Intervals": "Generally, $1 or greater where the strike price is $200 or less and $5.00 or greater where the strike price is greater than $200. For XSP weekly contracts, the lowest strike price interval Cboe may list is $0.50."
- Intraday additions:
  - Rule 4.13(e)(1): "new series in P.M.-Settled Weekly Expirations may be added up to and including on the expiration date for an expiring Weekly Expiration."
  - Rule 4.13(a)(2)(A)(iv): "Short Term Option Series may be added up to, and including on, the last trading day for that options series."
  - Rule 4.13 Interp. .01(c) (general rule, superseded for weeklys): "New series of index option contracts may be added up to the fifth business day prior to expiration."
  - Rule 4.13(a)(2)(A)(iv): additional series are opened "when the Exchange deems it necessary to maintain an orderly market, to meet customer demand or when the current value of the underlying index moves substantially from the exercise price or prices of the series already opened"; strikes generally "within 30% above or below the current value of the underlying index".
- Observed 0DTE grid, 2026-11-06 (SPXW 261106, SPX ≈ 7414.5 at fetch) [VERIFIED by direct fetch]:
  - 354 call strikes from 2800 to 10200.
  - Every adjacent strike within ±60 points of spot: 5 points apart; also 5 points apart 200–300 points away (one 405-point gap far OTM).
  - Same 5-point near-money spacing for 261109, 261120 and 261231.
  - 0DTE aggregate at ~11:07 ET: volume 1,063,585 contracts; open interest 960,944.
  - Near-money quotes (15-min delayed): 7415C 25.80 × 25.90; 7415P 25.40 × 25.60; 7410P 23.20 × 23.40; 7420C 23.10 × 23.30 — one to two ticks wide.

---

## 3. SPY options

Sources for §3: C1 rulebook (Rules 1.1, 4.5(d), 5.1(b)(1),(c)(2),(d), 5.3, 6.20) https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf ; OCC Rule 1804 exhibit https://www.sec.gov/files/rules/sro/occ/2022/34-95364-ex5.pdf ; FR E8-1155 https://www.govinfo.gov/content/pkg/FR-2008-01-24/html/E8-1155.htm ; SEC 34-88310 https://www.sec.gov/files/rules/sro/occ/2020/34-88310.pdf ; FINRA 2360 https://www.finra.org/rules-guidance/rulebooks/finra-rules/2360 ; NYSE trading info https://www.nyse.com/markets/nyse/trading-info ; Cboe hours https://www.cboe.com/about/hours/us-options/ ; Cboe press reprint https://mondovisione.com/news/cboe-launches-extended-trading-sessions-for-select-single-stock-and-etf-options-20261019/ ; Firstrade (secondary) https://help.firstrade.info/en/articles/9264922-options-that-trade-until-4-15-pm-eastern-standard-time — all accessed 2026-11-06.

### 3.1 Expirations every weekday [VERIFIED rulebook]
- Rule 4.5(d) Friday weeklys: series "that expire at the close of business on each of the next five Fridays that are business days and are not Fridays on which standard expiration options series, Monthly Options Series, or Quarterly Options Series expire"; "no more than a total of five Friday Short Term Option Expiration Dates".
- Rule 4.5(d) "Short Term Option Daily Expirations": "the Exchange may open for trading series of options on the symbols provided in Table 1 and Table 2 below that expire at the close of business on each of the next two Mondays, Tuesdays, Wednesdays, and Thursdays, respectively, that are business days beyond the current week and are not business days on which standard expiration options series, Monthly Options Series, or Quarterly Options Series expire"; "no more than a total of two Short Term Option Daily Expirations beyond the current week for each of Monday, Tuesday, Wednesday, and Thursday expirations at one time."
- Rule 4.5(d) Table 1: **SPY — Monday 2, Tuesday 2, Wednesday 2, Thursday 2**; IWM 2/2/2/2; QQQ 2/2/2/2; USO 0/0/2/0; UNG 0/0/2/0; GLD 2/0/2/0; SLV 2/0/2/0; TLT 2/0/2/0.
- Rule 4.5(d) holiday shifts (equity program): "If the Exchange is not open for business on a Monday, the Monday Short Term Option Expiration Date will be the business day immediately following that Monday. If the Exchange is not open for business on a Tuesday, Wednesday, or Thursday, the Tuesday Short Term Option Expiration Date, Wednesday Short Term Option Expiration Date, and Thursday Short Term Option Expiration Date, respectively, will be the first business day immediately prior to that Tuesday, Wednesday, or Thursday, respectively." Friday: "the first business day immediately prior to that Friday."
- Net: SPY has Mon–Fri expirations: Mon/Tue/Wed/Thu listed two weeks beyond the current week; Fridays five weeks out; plus monthlies, quarterlies and LEAPS (Rule 4.5(b)/(c): "up to ten additional expiration months for options on SPY").
- The Cboe comparison table's "Mon., Wed., Fri." for SPY (§1.1) is stale relative to Rule 4.5(d) Table 1.

### 3.2 PM settlement, American exercise, physical delivery [VERIFIED (Cboe); OCC text UNVERIFIED]
- Cboe comparison table: SPY "PM"; "Physical Shares of ETF"; "American" (§1.1).
- Rule 1.1 American-style definition (§1.3); 100-share unit (Rule 5.3(a) example, §1.2).
- OCC's Rules PDF at theocc.com returned HTTP 403 on 2026-11-06; OCC's own delivery/settlement language is therefore [UNVERIFIED]; Cboe's table is relied on.

### 3.3 Exercise cutoffs, automatic exercise, pin risk
- Equity Ex-by-Ex threshold $0.01 [VERIFIED via SEC/FR]: Release 34-57163 (SR-OCC-2007-18): "The proposed rule change would reduce the threshold amounts used to determine the equity options" subject to exercise by exception; lowers Rule 805's threshold "from $.05 to $.01"; "$.01 as the new threshold for all accounts"; to be implemented "no later than the June 2008 expiration". ([FR E8-1155](https://www.govinfo.gov/content/pkg/FR-2008-01-24/html/E8-1155.htm) (accessed 2026-11-06))
- Cash-settled index options (SPX/SPXW/XSP) — OCC Rule 1804 as filed in SR-OCC-2022-009 Exhibit 5 ([34-95364-ex5](https://www.sec.gov/files/rules/sro/occ/2022/34-95364-ex5.pdf) (accessed 2026-11-06)) [VERIFIED exhibit; equality with current OCC rulebook UNVERIFIED]:
  - 1804(b): a Clearing Member "shall be deemed to have properly and irrevocably tendered to the Corporation, immediately prior to the expiration time on each expiration date, an exercise notice with respect to every expiring cash-settled option contract identified in the Clearing Member's Expiration Exercise Report ... if: (1) for cash settled option contracts with a multiplier other than one, each option contract that has an exercise settlement value of $1.00 or more per contract ... unless the Clearing Member shall have duly instructed the Corporation, in accordance with Rule 805(b), to exercise none, or fewer than all, of such contracts."
  - 1804(c): "every expiring OTC index option contract, flexibly structured index option contract, quarterly index option contract, monthly index option contract, weekly index option contract, and short term index option contract" is "automatically deemed to have exercised" if "(2) ... with a multiplier other than one, each option contract has an exercise settlement amount of $1.00 or more per contract" or "(3) ... with a multiplier of one ... $0.01 or more per contract".
  - $1.00 per contract = $0.01 of index level × 100 multiplier.
  - 1804 Interp. .02 points to "Article XVII, Section 4 of the By-Laws ... relating to the unavailability or inaccuracy of the current value for an underlying interest" (By-Laws not fetched).
- Customer cutoff — FINRA Rule 2360(b)(23) [VERIFIED] ([FINRA 2360](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2360) (accessed 2026-11-06)):
  - Final exercise decision by "5:30 p.m. Eastern Time ('ET') on the business day of expiration".
  - "For customer accounts, members have until 7:30 p.m. ET to submit a Contrary Exercise Advice"; manual non-customer submissions by "5:30 p.m. ET for non-customer accounts".
  - The cut-off requirements "do not apply to any currency option or standardized index option products listed on a national options exchange."
- Cboe Rule 6.20 [VERIFIED]:
  - 6.20(d): a CEA "is a communication either: (i) to not exercise an option that would be automatically exercised under the Clearing Corporation's Ex-by-Ex procedure, or (ii) to exercise an option that would not be automatically exercised".
  - 6.20(d)(2): TPHs "must deliver a CEA or Advice Cancel to the Exchange within 3 hours 30 minutes following the time announced for the close of Regular Trading Hours in noncash-settled equity options on that same day" (electronic, time-stamped), otherwise "within 1 hour and 30 minutes" (i.e., 7:30 p.m. / 5:30 p.m. ET for a 4:00 p.m. close).
  - 6.20(c): if a modified close is announced by 5:30 p.m. the prior business day, "the deadline to make a final decision to exercise or not exercise an expiring option shall be 1 hour 30 minutes following the time announced for the close".
  - 6.20(d)(4): the Exchange may set a reduced cutoff "due to unusual circumstances ... provided, however, that under no circumstances should the exercise cutoff time and the time for submission of a CEA be before the close of trading."
- OCC's own clearing-member deadline on expiration day: Release 34-88310 (SR-OCC-2020-001, 2020-03-02) describes "OCC's Rule 805 governs the exercise of an option on the option's expiration date" and late-notice fees; it changed the non-expiration late deadline to 6:00 a.m. CT. The expiration-day clearing-member deadline itself is [UNVERIFIED] here. Broker cutoffs are earlier than 5:30 p.m. ET and firm-specific (not sourced).
- Pin risk (reading of the above, no primary source uses the phrase): SPY options stop at 4:15 p.m. ET, the stock closes 4:00 p.m., and exercise decisions can be made until 5:30 p.m. ET on post-close prices; a short SPY option near the strike can be assigned on after-hours moves and a long holder can exercise an option that finished OTM by CEA. Cboe's SPXW page contrasts: "Cash settled European style options exercise at expiration, unlike American style, which may be exercised OTM after market close — eliminating potential economic and tax risk for writers." [VERIFIED]

### 3.4 SPY option hours: 4:15 p.m. ET RTH, and the 2026 extended sessions [VERIFIED]
- Rule 5.1(b)(1): equity-option RTH are the primary market's hours "except for options on ETFs, ETNs, Index Portfolio Shares, Index Portfolio Receipts, and Trust Issued Receipts the Exchange designates to remain open for trading beyond 4:00 p.m. but in no case later than 4:15 p.m."
- Cboe hours page footnote: "*ETF equity options that currently trade until 4:15 p.m. ET will continue to do so as part of the RTH session, and there will be no Curb session for these classes."
- No rule text carves out expiration day for these ETF options; the 4:00 p.m. expiration-day stop in Rule 5.1(b)(2)(C) applies to cash-settled index options only. So expiring SPY options trade to 4:15 p.m. ET.
- Broker corroboration [SECONDARY]: Firstrade's list of options trading until 4:15 p.m. ET includes "DIA, DJX, ... IWM, ... QQQ, ... SPX, SPXW, SPY, ... XSP" and says only "expiring NDXP, RUTW, MRUT, SPXW, XSP, OEX & XEO options will trade until 4:00 pm ET" on the last trading day. ([Firstrade](https://help.firstrade.info/en/articles/9264922-options-that-trade-until-4-15-pm-eastern-standard-time) (accessed 2026-11-06))
- NYSE: "Core Trading Session: 9:30 a.m. to 4:00 p.m. ET"; "3:50 p.m. to 4:00 p.m. ET - Closing Imbalance Period"; "4:00 p.m. ET - Closing Auction". ([NYSE trading info](https://www.nyse.com/markets/nyse/trading-info) (accessed 2026-11-06)) → 4:00–4:15 SPY option trading occurs against after-hours SPY prints.
- Extended sessions launched 2026-10-19 (Cboe press release, reprint at [Mondo Visione](https://mondovisione.com/news/cboe-launches-extended-trading-sessions-for-select-single-stock-and-etf-options-20261019/) (accessed 2026-11-06)): "a pre-market session from 7:30 a.m. to 9:25 a.m. ET and a post-market session from 4:00 p.m. to 4:15 p.m. ET"; symbols "AAPL, AMD, AMZN, AVGO, BABA, BAC, F, GLD, GOOG, GOOGL, HOOD, INTC, IWM, META, MRVL, MSFT, MU, NFLX, NOK, NVDA, ORCL, PFE, PLTR, QQQ, SNDK, SPY, TSLA, TSM, XLF"; "Cboe will not open a class of options if the underlying security has not opened."
- Cboe hours page equity table: "Begin GTH Order Acceptance for Select Equity Options 7:15 a.m."; "Global Trading Hours for Select Equity Options (GTH) 7:30 a.m. – 9:25 a.m."; "Regular Trading Hours (RTH)* 9:30 a.m. – 4:00 p.m."; "Curb for Select Equity Options* 4:00 p.m. – 4:15 p.m."
- Rule 5.1(c)(2) eligibility: up to 100 multiply-listed classes meeting, over the prior six months, "(i) ... average daily volume of 150,000 contracts; (ii) ... $50 billion market capitalization; and (iii) ... average daily trading volume of 10 million shares"; semiannual review as of January 1 and July 1; additions start "the first trading day of February and August".
- For SPY the 4:00–4:15 window was already RTH; the practical change is the 7:30–9:25 a.m. pre-market session. The comparison table's "Global Trading Hours Available: No" for SPY is stale.
- SEC approval of the equity-options extended hours was reported as 2026-05-28 with a July 13 target that slipped to October 19 [SECONDARY, press coverage; the Cboe IR release itself was not fetched].

---

## 4. Holidays 2026–2027, early closes, expiration shifts, DST

Sources for §4: Cboe hours & holidays https://www.cboe.com/about/hours/us-options/ ; NYSE calendar https://www.nyse.com/markets/hours-calendars ; C1 rulebook (Rules 4.13(a)(4),(e)(1), 5.1(e)) https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf ; SEC 34-106620 https://www.sec.gov/files/rules/sro/cboe/2026/34-106620.pdf ; 24x5 FAQ https://www.cboe.com/document/tech-spec/content/technical-specifications/cboe-options-exchange-245-faq ; NIST DST https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst — all accessed 2026-11-06.

### 4.1 Cboe US options holidays and early closes [VERIFIED]
Source: Cboe hours page ([hours](https://www.cboe.com/about/hours/us-options/) (accessed 2026-11-06)); NYSE calendar lists identical dates ([NYSE](https://www.nyse.com/markets/hours-calendars) (accessed 2026-11-06)).

| 2026 full closure | Date | | 2027 full closure | Date |
|---|---|---|---|---|
| New Year's Day | Thu Jan 1 | | New Year's Day | Fri Jan 1 |
| Martin Luther King, Jr. Day | Mon Jan 19 | | Martin Luther King, Jr. Day | Mon Jan 18 |
| Presidents' Day | Mon Feb 16 | | Presidents' Day | Mon Feb 15 |
| Good Friday | Fri Apr 3 | | Good Friday | Fri Mar 26 |
| Memorial Day | Mon May 25 | | Memorial Day | Mon May 31 |
| Juneteenth | Fri Jun 19 | | Juneteenth Observed | Fri Jun 18 |
| Independence Day Observed | Fri Jul 3 | | Independence Day Observed | Mon Jul 5 |
| Labor Day | Mon Sep 7 | | Labor Day | Mon Sep 6 |
| Thanksgiving Day | Thu Nov 26 | | Thanksgiving Day | Thu Nov 25 |
| Christmas Day | Fri Dec 25 | | Christmas Day Observed | Fri Dec 24 |

Early closes (Cboe table: "Regular Trading Hours 09:30:00 - 13:00:00"):
- 2026: Fri Nov 27 ("Thanksgiving Early Close"; GTH unchanged); Thu Dec 24 ("Christmas Early Close"; GTH ends 9:25 a.m. Thursday).
- 2027: Fri Nov 26 ("Thanksgiving Early Close"). No Christmas-Eve early close in 2027 (Dec 24 is the observed holiday); no July early close in either year.
- NYSE: "markets close at 1:00 p.m. ET, or 1:15 p.m. for eligible options" on early-close days.
- Cboe's "Download CSV" for the holiday table is a JS button; no static CSV URL was found.

### 4.2 Holiday session structure — Rule 5.1(e) [VERIFIED]
- "When any holiday observed by the Exchange falls on a Saturday, the Exchange is not open for business on the preceding Friday, and when any holiday observed by the Exchange falls on a Sunday, the Exchange is not open for business on the following Monday".
- Domestic holidays (MLK, Presidents', Memorial, Juneteenth, Independence, Labor, Thanksgiving): "(i) a Global Trading Hours session for index options from 8:15 p.m. on the calendar day preceding the holiday (observed) to 11:30 a.m. on the holiday (observed), (ii) a Global Trading Hours session for index options from 8:15 p.m. on the holiday (observed), or if the holiday is observed on a Friday, on the Sunday following the holiday, to 9:25 a.m. on the trading day ... There will be no Global Trading Hours for equity options, Regular Trading Hours or Curb Trading Hours session on the day a domestic holiday is observed."
- International holidays (Good Friday, Christmas, New Year's): "there will be no Global Trading Hours session that immediately precedes the day an international holiday is observed"; GTH resumes "from 8:15 p.m. on the holiday (observed), or if the holiday is observed on a Friday, on the Sunday following the holiday".
- 24x5 FAQ Q2 confirms the pattern, e.g., Monday holiday: "GTH Trading: Sunday (Holiday-1) 8:15 p.m. - Monday (Holiday) 11:30 a.m. ET", then "Monday (Holiday) 8:15 p.m. - Tuesday (Holiday+1) 9:25 a.m. ET"; Friday holiday pre-session: "None if a shared International Holiday"; "Multi-listed equity options do not trade in GTH on holidays."
- Net: SPX/SPXW/XSP trade electronically until 11:30 a.m. ET on domestic holidays, with no disseminated index value (Rule 5.1(c)(4)).

### 4.3 Early-close days and SR-CBOE-2026-078 (operative 2026-11-16) [VERIFIED]
- SPX spec: expiring SPXW cease "at 1:00 pm ET for any half day holiday."
- SR-CBOE-2026-078 (Release 34-106620; filed 2026-09-25; noticed 2026-10-07; rulebook banner: operative 2026-11-16) ([34-106620](https://www.sec.gov/files/rules/sro/cboe/2026/34-106620.pdf) (accessed 2026-11-06)) adds Rule 5.1(e)(3) for shortened days:
  - "(A) the Global Trading Hours session for GTH-eligible options will occur prior to the shortened Regular Trading Hours;"
  - "(B) the Regular Trading Hours session will occur during the hours designated by the Exchange for Regular Trading Hours (e.g., 9:30 a.m. through 1:00 p.m., or 1:15 p.m. for options on ETFs, ETNs, Index Portfolio Shares, Index Portfolio Receipts, and Trust Issued Receipts designated to remain open for trading beyond 4:00 p.m. pursuant to subparagraph (b)(1)); and"
  - "(C) the Curb Trading Hours session for Curb-eligible options will commence at the end of the shortened Regular Trading Hours session and continue for 15 minutes (e.g., 1:00 p.m. to 1:15 p.m.)."
  - Also: new "GTH Only" and "GTH and RTH Only" order instructions; earlier Queuing Period/order entry (equity-option GTH order acceptance "no earlier than 6:00 a.m."); DPM opening-quote obligation extended to GTH.
- Reading for 2026-11-27 and 2026-12-24: expiring SPXW/XSP stop 13:00:00 ET; SPY options to 13:15; non-expiring SPX RTH ends 13:00 per the Cboe table with a 13:00–13:15 Curb from 2026-11-16. The 24x5 FAQ's "RTH on Friday ends at 1:15 p.m. ET" (for proprietary index options after Thanksgiving) conflicts with the 13:00 table; only the 13:00 stop for expiring PM series is unambiguous.

### 4.4 Expiration dates affected by holidays [DERIVED]
Method: Cboe/NYSE holiday lists (§4.1) + Rule 4.13(a)(4) (AM: settlement on the shifted 3rd Friday, last trade the prior business day) + Rule 4.13(e)(1) (PM weeklys: Mon→next business day; Tue–Fri→prior business day; dedupe collisions; EOM wins) + SPXW-spec footnote. The Cboe 2026 PDF calendar renders dates only as colored cells, so these are computed, not read.

2026 standard (3rd-Friday) SPX AM-settled cycle:

| Month | 3rd Friday | SET / expiration date | Last trade (expiring `SPX`) | Note |
|---|---|---|---|---|
| Jan | 2026-01-16 | 2026-01-16 | 2026-01-15 | |
| Feb | 2026-02-20 | 2026-02-20 | 2026-02-19 | |
| Mar | 2026-03-20 | 2026-03-20 | 2026-03-19 | quarterly |
| Apr | 2026-04-17 | 2026-04-17 | 2026-04-16 | |
| May | 2026-05-15 | 2026-05-15 | 2026-05-14 | |
| Jun | 2026-06-19 | **2026-06-18 (Thu)** | 2026-06-17 (Wed) | Juneteenth; CME ES also 6/18 |
| Jul | 2026-07-17 | 2026-07-17 | 2026-07-16 | |
| Aug | 2026-08-21 | 2026-08-21 | 2026-08-20 | |
| Sep | 2026-09-18 | 2026-09-18 | 2026-09-17 | quarterly |
| Oct | 2026-10-16 | 2026-10-16 | 2026-10-15 | |
| Nov | 2026-11-20 | 2026-11-20 | 2026-11-19 | both `SPX` (AM) and `SPXW` (PM) listed |
| Dec | 2026-12-18 | 2026-12-18 | 2026-12-17 | quarterly |

2027 standard cycle:

| Month | 3rd Friday | SET / expiration date | Last trade (expiring `SPX`) | Note |
|---|---|---|---|---|
| Jan | 2027-01-15 | 2027-01-15 | 2027-01-14 | |
| Feb | 2027-02-19 | 2027-02-19 | 2027-02-18 | |
| Mar | 2027-03-19 | 2027-03-19 | 2027-03-18 | Good Friday is 03-26, not a 3rd Friday |
| Apr | 2027-04-16 | 2027-04-16 | 2027-04-15 | |
| May | 2027-05-21 | 2027-05-21 | 2027-05-20 | |
| Jun | 2027-06-18 | **2027-06-17 (Thu)** | 2027-06-16 (Wed) | Juneteenth observed |
| Jul | 2027-07-16 | 2027-07-16 | 2027-07-15 | |
| Aug | 2027-08-20 | 2027-08-20 | 2027-08-19 | |
| Sep | 2027-09-17 | 2027-09-17 | 2027-09-16 | |
| Oct | 2027-10-15 | 2027-10-15 | 2027-10-14 | |
| Nov | 2027-11-19 | 2027-11-19 | 2027-11-18 | |
| Dec | 2027-12-17 | 2027-12-17 | 2027-12-16 | Christmas observed 12-24, not a 3rd Friday |

SPXW weekday shifts:
- 2026: Jan 19 (Mon)→Tue Jan 20; Feb 16 (Mon)→Tue Feb 17; Apr 3 (Fri)→Thu Apr 2; May 25 (Mon)→Tue May 26; Jun 19 (Fri)→Thu Jun 18 (coincides with shifted 3rd Friday → PM 3rd-Friday contract, only one listed); Jul 3 (Fri)→Thu Jul 2; Sep 7 (Mon)→Tue Sep 8; Nov 26 (Thu)→Wed Nov 25; Dec 25 (Fri)→Thu Dec 24 (early-close day: 13:00 ET stop).
- 2027: Jan 1 (Fri)→Thu 2026-12-31 (EOM already listed); Jan 18 (Mon)→Tue Jan 19; Feb 15 (Mon)→Tue Feb 16; Mar 26 (Fri)→Thu Mar 25; May 31 (Mon)→Tue Jun 1; Jun 18 (Fri)→Thu Jun 17; Jul 5 (Mon)→Tue Jul 6; Sep 6 (Mon)→Tue Sep 7; Nov 25 (Thu)→Wed Nov 24; Dec 24 (Fri)→Thu Dec 23.
- Sanity check vs. observed listings on 2026-11-06: SPXW 261125 present, 261126 absent, 261127 present — consistent.

EOM dates (last business day):
- 2026: Jan 30, Feb 27, Mar 31, Apr 30, May 29, Jun 30, Jul 31, Aug 31, Sep 30, Oct 30, Nov 30, Dec 31.
- 2027: Jan 29, Feb 26, Mar 31, Apr 30, May 28, Jun 30, Jul 30, Aug 31, Sep 30, Oct 29, Nov 30, Dec 31.

### 4.5 DST transitions, America/New_York
- NIST [VERIFIED]: DST "begins at 2:00 a.m. on the second Sunday of March" and "ends at 2:00 a.m. on the first Sunday of November"; "During 2026, daylight saving time is in effect from March 8 at 2 a.m. (local time) to November 1 at 2 a.m. (local time)." ([NIST](https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst) (accessed 2026-11-06))
- 2027 by the statutory rule [DERIVED]: begins Sun 2027-03-14 02:00; ends Sun 2027-11-07 02:00. (timeanddate.com returned HTTP 403 on 2026-11-06; secondary search results agreed with these dates.)
- Today (2026-11-06) is five days after the 2026-11-01 fall-back: ET = UTC−5. GTH open 20:15 ET = 01:15 UTC next day in EST, 00:15 UTC in EDT. CME publishes CT; the ET/CT offset is a constant 1 h because both zones switch together.

---

## 5. The S&P 500 closing value; why the 3:59:59 tick ≠ settlement

Sources for §5: EOM spec, XSP spec, C1 rulebook (Rules 4.13 Interp. .02/.05/.09, 5.1(d)(4), 5.20(e)) as above; NYSE trading info https://www.nyse.com/markets/nyse/trading-info ; Cboe 2019 notice https://cdn.cboe.com/resources/release_notes/2019/Corrected-Closing-Settlement-Prices-for-Certain-SP-Indices-II.pdf ; OCC Rule 1804 exhibit https://www.sec.gov/files/rules/sro/occ/2022/34-95364-ex5.pdf — accessed 2026-11-06. S&P DJI methodology URLs (listed in §5.2) returned HTTP 403 on 2026-11-06.

### 5.1 Verifiable from Cboe / exchange sources [VERIFIED]
- PM settlement = "last (closing) reported sales price in the primary market of each component stock" (EOM spec) = "official closing price of the S&P 500 Index as reported by Standard & Poor's" (XSP spec).
- Primary-market closing price for NYSE-listed constituents is set by the NYSE Closing Auction: "3:50 p.m. to 4:00 p.m. ET - Closing Imbalance Period"; "4:00 p.m. ET - Closing Auction". ([NYSE trading info](https://www.nyse.com/markets/nyse/trading-info) (accessed 2026-11-06)) Nasdaq's closing cross is analogous (not fetched).
- The real-time index at 15:59:59 is computed from each constituent's latest continuous-session last sale. The official close replaces each last sale with the closing-auction print, which (a) is generally a different price and (b) prints after 16:00:00 and not simultaneously across 500 names (auction runs, imbalances, occasional delayed closes). Hence the official SPX close is published after 4:00 p.m. ET and can differ from the final pre-4:00 tick by a non-trivial amount.
- The rulebook acknowledges the same effect for AM settlement explicitly (Rule 4.13 Interp. .02, §1.4) and does not disseminate any index value during Curb (Rule 5.1(d)(4)) — i.e., the official close is the last SPX value Cboe recognizes for the day.
- Revisions happen. Cboe reference C2019081302: "S&P DJI informed Cboe that August 12, 2019 closing values for certain Indices were being recalculated. Below are the corrected August 12, 2019 closing settlement values for the S&P 500 (option symbol: SPX) and mini-SPX (option symbol: XSP) ... SPX 2883.75 ... XSP 288.37 ... If any adjustments are required due to the corrected closing settlement values, the Options Clearing Corporation (OCC) will contact clearing firms carrying impacted accounts." ([Cboe PDF](https://cdn.cboe.com/resources/release_notes/2019/Corrected-Closing-Settlement-Prices-for-Certain-SP-Indices-II.pdf) (accessed 2026-11-06))
- Disrupted constituent closes at expiration: Rule 5.20(e) defers to OCC's Rules/By-Laws; OCC Rule 1804 Interp. .02 cites By-Laws Art. XVII §4 on "the unavailability or inaccuracy of the current value for an underlying interest" (By-Laws text not fetched).
- Rule 5.1(b)(2)(A)/(C) and the SPEQF filing make the design intent explicit: expiring PM series stop at 4:00 p.m. precisely so that no trading occurs "after the settlement value is calculated".

### 5.2 Not verifiable from S&P DJI on 2026-11-06 [UNVERIFIED]
- All S&P DJI methodology URLs returned HTTP 403 to both fetchers: Index Mathematics Methodology (https://www.spglobal.com/spdji/en/methodology/article/index-mathematics-methodology and https://www.spglobal.com/spdji/en/documents/methodologies/methodology-index-math.pdf), S&P U.S. Indices Methodology (https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf), Equity Indices Policies & Practices (https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-equity-indices-policies-practices.pdf).
- From memory / search snippets only: S&P DJI's end-of-day values use each constituent's official closing price from its primary listing exchange; where a security has no official close, S&P's policies describe falling back to the last traded price or prior close adjusted for corporate actions; S&P's 2023 real-time notice describes calculation "at a fixed interval". The time at which S&P DJI publishes the "official" S&P 500 close (minutes after 4:00 p.m.; final values later) is UNVERIFIED. Treat the SPX close as provisional until Cboe/OCC post the settlement value.

---

## 6. Price reporting: SPX updates, "no SPX volume", SPY volume, ES futures

Sources for §6: Cboe CGIF pages https://www.cboe.com/us/indices/accessing-index-data and https://www.cboe.com/data/global-indices-feed/ ; C1 rulebook (Rules 5.1(c)(4),(d)(4), 5.20(f)) ; Cboe delayed JSON https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json ; investinglive (secondary) https://investinglive.com/stock-market-update/us-equity-index-futures-roll-to-september-today-june-contracts-near-expiry-what-you-need-20260615/ — accessed 2026-11-06. CME URLs (listed in §6.2) returned HTTP 503/403 on 2026-11-06.

### 6.1 SPX index value dissemination
- Cboe CGIF pages: "a streaming data service delivering real-time index values to market participants"; "Access streaming values of key indices 24/7"; channel "MAIN (SPX, VIX)". Neither page states the SPX update interval. ([accessing-index-data](https://www.cboe.com/us/indices/accessing-index-data) (accessed 2026-11-06); [global-indices-feed](https://www.cboe.com/data/global-indices-feed/) (accessed 2026-11-06)) [VERIFIED that no interval is stated]
- Search snippets of Cboe/vendor pages said "Most values updated every 15 seconds"; secondary sources say the S&P 500 has been disseminated every 15 seconds since 1986. The "~1 second" cadence in the brief is NOT supported by anything fetched. [UNVERIFIED; assume ≤15 s, do not assume 1 s]
- Rule 5.1(c)(4) and 5.1(d)(4): no SPX value is disseminated during GTH or Curb; VIX only from 3:00 a.m. in GTH ("at least once every fifteen (15) seconds"). Overnight SPXW pricing must be anchored to ES. [VERIFIED]
- Rule 5.20(f): during GTH the Exchange halts related index options for two minutes on a CME "Dynamic Circuit Breaker" message and for 10 minutes on CME "OTH Price Limits" (limit state). [VERIFIED]
- "No SPX volume": SPX is an index; Cboe's JSON reports `"volume": 0` for `^SPX` while quoting a bid/ask (7412.02 / 7417.20 at fetch) and `security_type: "index"`. [VERIFIED by direct fetch]
- SPY is an exchange-traded security with consolidated tape volume (not sourced here); Cboe's daily stats report SPY *option* volume/OI by product.
- Index construction (SPX spec "Underlying"): "a capitalization-weighted index of 500 stocks ... summed for all 500 stocks and divided by a predetermined base value. The base value for the S&P 500 Index is adjusted to reflect changes in capitalization resulting from mergers, acquisitions, stock rights, substitutions, etc." [VERIFIED]

### 6.2 ES (E-mini S&P 500) futures
- CME pages all failed on 2026-11-06: contract specs (https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.contractSpecs.html, HTTP 503), product page (503), calendar page (503), rulebook ch. 358 PDF (403), education pages (503), roll-dates page (503). The following are [UNVERIFIED, from memory]:
  - Contract unit $50 × S&P 500 index; tick 0.25 index points = $12.50.
  - CME Globex: Sunday 6:00 p.m. – Friday 5:00 p.m. ET, with a daily maintenance halt 5:00–6:00 p.m. ET (≈23 h/day).
  - Quarterly cycle Mar/Jun/Sep/Dec (H/M/U/Z); last trade 9:30 a.m. ET on the 3rd Friday of the contract month; cash-settled to the S&P 500 Special Opening Quotation (SOQ) built from constituent opening prices (the same mechanism as SPX SET).
- Roll convention [SECONDARY — CME page quoted via search snippet]: "Equity products roll date is the Monday prior to the third Friday of the expiration month"; 2026 customary rolls 3/16, 6/15, 9/14, 12/14 vs. expirations 3/20, 6/18, 9/18, 12/18 (https://www.cmegroup.com/trading/equity-index/rolldates.html). An investinglive article dated 2026-06-15 confirms "Today marks the official CME roll date" and "the Monday prior to the third Friday of the expiry month" but states June expiry "Friday June 19" — which was Juneteenth (closed); CME's table says 6/18. ([investinglive](https://investinglive.com/stock-market-update/us-equity-index-futures-roll-to-september-today-june-contracts-near-expiry-what-you-need-20260615/) (accessed 2026-11-06))
- 2027 ES last-trade dates [DERIVED, 3rd Friday → prior business day if holiday]: 2027-03-19, 2027-06-17, 2027-09-17, 2027-12-17; customary roll Mondays 03-15, 06-14, 09-13, 12-13. 2026 remaining: 2026-12-18 (roll Mon 2026-12-14).
- Basis = carry (textbook, no source fetched): F ≈ S·(1 + r·T) − PV(dividends to expiry). Positive when financing > dividend yield; converges to 0 at the SOQ. During RTH the ES–SPX gap is a slowly varying carry number; during GTH it is the overnight move. ES also embeds the settlement-mechanism difference: ES settles to the open (SOQ) like `SPX`/`SPXO`, not to the close like `SPXW`.

---

## 7. Order and position rules for a retail buyer: ticks, limits, 0DTE specifics

Sources for §7: C1 rulebook (Rules 5.4(a),(b), 5.31, 5.20(f), 4.13(e)(1)) https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf ; SPX/EOM/XSP specs as in §1; SPXW product/spec page https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/specifications/ ; OCC Rule 1804 exhibit https://www.sec.gov/files/rules/sro/occ/2022/34-95364-ex5.pdf — all accessed 2026-11-06.

### 7.1 Minimum increments — Rule 5.4(a) [VERIFIED]
- "Class Not Participating in Penny Interval Program": "$0.05 — Lower than $3.00"; "$0.10 — $3.00 and higher". SPX/SPXW are in this bucket (SPX spec: "Minimum tick for options trading below 3.00 is 0.05 ($5.00) and for all other series, 0.10 ($10.00)"; EOM spec identical).
- "Class Participating in Penny Interval Program": "$0.01 — Lower than $3.00"; "$0.05 — $3.00 and higher".
- "QQQs, IWM, and SPY, and XSP (as long as SPDR options (SPY) participate in the Penny Interval Program) and MRUT options (as long as iShares Russell 2000 ETF options (IWM) participate in the Penny Interval Program)": "$0.01 — All prices".
- Rule 5.4(b): "the minimum increment for bids and offers on complex orders in options on the S&P 500 Index (SPX) or on the S&P 100 Index (OEX and XEO), except for box/roll spreads, is $0.05 or greater, or in any increment, which may be determined by the Exchange on a class-by-class basis."
- No $0.01 pilot for simple SPX orders exists in the rulebook text as of 2026-11-06. XSP ($0.01 all prices, 1/10 size) is the penny-increment route to the same exposure.

### 7.2 Position/exercise limits and margin [VERIFIED]
- SPX spec "Position and Exercise Limits": "No position and exercise limits are in effect."
- XSP spec "Position Limit": "No position and exercise limits are in effect."
- EOM spec: "As with SPX options, there are no position limits for End-of-Month S&P 500 Index options."
- EOM spec "Margin": "Uncovered writers must deposit 100% of the option proceeds plus 15% of the aggregate contract value (current index level multiplied by $100) minus the amount by which the option is out-of-the-money, if any. Minimum margin is 100% of the option proceeds plus 10% of the aggregate contract value. Long puts or calls must be paid for in full."

### 7.3 0DTE-specific mechanics [VERIFIED]
- No Cboe rule restricts buying 0DTE SPXW. The binding mechanics are:
  - Expiring series stop at 16:00:00 ET (13:00 on half-days), not 16:15.
  - New strikes may be added through the expiration date (Rule 4.13(e)(1)).
  - Series opening is by auction under Rule 5.31; the rulebook's opening text includes "if the Opening Collar is greater than $0.05, the series does not open" (Queuing context) — thin strikes may not open at 9:30.
  - GTH halts tied to CME circuit breakers/limit states (Rule 5.20(f)).
  - Exercise at expiration is automatic under OCC Rule 1804 ($1.00/contract = $0.01 index ITM): a long SPXW that finishes $0.01 ITM is cashed the next business day; a short SPXW cannot be assigned early.
- Cboe SPXW page (marketing, verbatim): "Cash settled European style options exercise at expiration, unlike American style, which may be exercised OTM after market close — eliminating potential economic and tax risk for writers"; "Trading account credited/debited in cash, no delivery of unwanted shares or market exposure. European style is only exercised at expiration, eliminating risk of early assignment"; "SPX Weeklys trade nearly 24 hours a day, five days a week".
- Broker-level 0DTE policies (forced close-outs of same-day-expiring ETF options, earlier exercise cutoffs) are firm-specific and were not sourced; a Robinhood support snippet seen in search mentioned a 3:30 p.m. ET cutoff for opening same-day-expiring equity/ETF options, not applicable to index options. [SECONDARY, not fetched]

---

## 8. Cboe free data: the delayed-quote JSON, its terms, OI and settlement history

Sources for §8: Cboe delayed JSON https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json ; Cboe terms https://www.cboe.com/terms/ ; https://cdn.cboe.com/robots.txt ; Cboe daily stats https://www.cboe.com/markets/us/options/market-statistics/daily/ ; Cboe historical data https://www.cboe.com/us/options/market_statistics/historical_data/ ; Cboe settlement hub https://www.cboe.com/index_settlement_values/ (+ weeklys and end_of_month sub-pages) ; Cboe SPX product page https://www.cboe.com/tradable_products/sp_500/spx_options/ ; DataShop policies https://datashop.cboe.com/data-policies — all accessed 2026-11-06.

### 8.1 Delayed-quote JSON [VERIFIED by direct fetch on 2026-11-06]
- URL fetched: `https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json` (≈13.9 MB). The brief names `cdn-api.cboe.com`; Cboe's own page JS sets `cdn_api_url: 'https://cdn-api.cboe.com'`, and the `cdn.cboe.com` host served the same path on 2026-11-06.
- Top-level keys: `timestamp` ("2026-11-06 16:22:25"), `symbol` ("^SPX"), `data`.
- `data` keys: `options`, `symbol`, `security_type` ("index"), `exchange_id` (5), `current_price` (7414.5098), `price_change`, `price_change_percent`, `bid` (7412.02), `ask` (7417.2002), `bid_size`, `ask_size`, `open`, `high`, `low`, `close`, `prev_day_close` (7353.73), `volume` (0), `iv30` (18.504), `iv30_change`, `iv30_change_percent`, `seqno`, `last_trade_time` ("2026-11-06T11:07:23"), `tick`.
- Per-option record keys: `option`, `bid`, `bid_size`, `ask`, `ask_size`, `iv`, `open_interest`, `volume`, `delta`, `gamma`, `vega`, `theta`, `rho`, `theo`, `change`, `open`, `high`, `low`, `tick`, `last_trade_price`, `last_trade_time`, `percent_change`, `prev_day_close`.
- Delay evidence: index `last_trade_time` 11:07:23 (local ET) vs. file `timestamp` 16:22:25 (appears to be UTC = 11:22 ET) → ≈15-minute delay. `open_interest` is prior-day OCC OI (SPX product page: "Open Interest 24,656,787 ... as of November 5, 2026").
- Other symbols follow the same path pattern (e.g., `SPY.json`, `_XSP.json`) — only `_SPX.json` was fetched.

### 8.2 Terms applicable to the delayed data
- Cboe website Terms & Conditions, "Last Updated: November 16, 2022" ([terms](https://www.cboe.com/terms/) (accessed 2026-11-06)) [VERIFIED]:
  - §2: "You may view, print and download one copy of the Materials for your personal non-commercial use".
  - §2: "You may not otherwise copy, reproduce, alter, store either in hard copy or in an electronic retrieval system" ... publish, rent, sublicense or distribute without written consent (via a "Request to Use Cboe Content").
  - §4: Materials "provided for general informational and educational purposes only"; no guarantee of "the accuracy, completeness, timeliness".
  - §5: information "should not be considered complete, precise, or current".
  - §3: bars conduct that interferes with the site and harvesting data about other users. No clause names the delayed-quote API, scraping frequency, or redistribution of delayed quotes.
- `https://cdn.cboe.com/robots.txt` returns an S3 "AccessDenied" XML — no robots policy is published. [VERIFIED]
- Market-statistics pages: "Your use of Cboe Market Statistics Summary Data is subject to the Terms and Conditions of Cboe's Websites"; data "furnished without responsibility for accuracy". ([daily stats](https://www.cboe.com/markets/us/options/market-statistics/daily/) (accessed 2026-11-06)) [VERIFIED]
- DataShop policies page lists only paid-product documents ("DataShop Policies for Historical Data Services", "DataShop License Agreement", LiveVol agreements). ([DataShop](https://datashop.cboe.com/data-policies) (accessed 2026-11-06)) [VERIFIED]
- Conclusion: the free delayed JSON is for personal, non-commercial use; no redistribution; no accuracy/timeliness warranty. A private single-user tool fits "personal non-commercial use"; anything shared or commercial needs a Cboe license.

### 8.3 Free OI and settlement-value history [VERIFIED]
- Daily OI/volume snapshot (one day at a time, no CSV link): https://www.cboe.com/markets/us/options/market-statistics/daily/ — put/call ratios, volume and OI by group including "SPX + SPXW" (snapshot: 24,656,787 OI; 701,196,658 all products). A legacy URL with `?mkt=cone&dt=YYYY-MM-DD` was seen in search results (not exercised).
- Per-series OI: in the delayed JSON (`open_interest`), prior-day.
- Historical page https://www.cboe.com/us/options/market_statistics/historical_data/ : symbol-level historical volume form; static put/call CSVs that end 2019-10-04 (e.g., `https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/spxpc.csv`, `totalpc.csv`); no OI history CSV. Full per-series EOD OI history is a paid DataShop product ("Option EOD Summary" includes "open interest").
- Settlement values: hub https://www.cboe.com/index_settlement_values/ with sub-pages `/index_settlement_values/weeklys_settlement_values/`, `/index_settlement_values/end_of_month_settlement_values/`, `/index_settlement_values/quarterlys_settlement_value/` (a "Select Year" control; tables are JS-rendered and did not come through; no CSV/JSON URL discovered). The hub does not mention "SET"; a free 3rd-Friday SET history was not found on 2026-11-06. Cboe's KPI binary settlement page does publish CSV/JSON files (`kpi_settlement_values_history`), so an analogous index endpoint may exist behind the JS but was not located.

---

---

## 8A. Worked timelines (ET wall-clock) [DERIVED from §1, §3, §4]

### 8A.1 Friday 2026-11-20 — a 3rd Friday with both `SPX` (AM) and `SPXW` (PM) contracts
| Time (ET) | Event | Source basis |
|---|---|---|
| Thu 11-19 16:00 | `SPX` Nov AM series: RTH ends (spec says ceases "5:00 pm ET", i.e., through Curb); `SPXW` 11-19 (Thu PM weekly) expires at 16:00 | SPX spec; Rule 5.1(b)(2)(C) |
| Thu 11-19 16:15–17:00 | Curb for non-expiring SPX/SPXW/XSP; no index value disseminated | Rule 5.1(d),(d)(4) |
| Thu 11-19 20:00 / 20:15 | GTH order acceptance / GTH open for SPX, XSP, VIX, RUT; `SPXW` 11-20 (PM) is non-expired → open in GTH; `SPX` 11-20 (AM) does not resume | Rule 5.1(c)(3); SPXO notice analogy |
| Fri 11-20 ~09:30+ | Constituent opening prints → SET computed by S&P DJI; `SPX` Nov AM series settle to SET (cash next business day). SET ≠ 09:30:00 SPX print | SPX spec; Rule 4.13(a)(4), Interp. .02 |
| Fri 11-20 09:25 / 09:30 | GTH ends / RTH opens for all index options | Hours page |
| Fri 11-20 15:50–16:00 | NYSE Closing Imbalance Period | NYSE trading info |
| Fri 11-20 16:00:00 | `SPXW` 11-20 (PM 3rd-Friday) and XSP 11-20 stop trading; NYSE Closing Auction runs; SPY stock closes | Rule 5.1(b)(2)(C); NYSE |
| Fri 11-20 16:00–16:15 | Non-expiring SPX/SPXW/XSP keep trading; SPY options (incl. 11-20 expiry) keep trading against after-hours SPY prints | Rule 5.1(b)(1),(b)(2); hours footnote |
| Fri 11-20 after 16:00 | Official S&P 500 close published from closing-auction prints (minutes after 16:00; exact time UNVERIFIED); SPXW/XSP settlement value derived from it | EOM/XSP specs; §5 |
| Fri 11-20 16:15–17:00 | Curb (non-expiring index options only) | Rule 5.1(d) |
| Fri 11-20 17:30 | FINRA customer exercise-decision cutoff for expiring SPY options (CEA to 19:30) — not applicable to index options | FINRA 2360(b)(23) |
| Mon 11-23 | Cash settlement of exercised SPX/SPXW/XSP ("business day following expiration"); SPY assignments settle per OCC/equity settlement | SPX/EOM/XSP specs |

### 8A.2 Friday 2026-11-27 — early-close day, SPXW Friday expiry
| Time (ET) | Event | Source basis |
|---|---|---|
| Wed 11-25 | `SPXW` Wed weekly expires (Thu 11-26 Thanksgiving weekly shifted to Wed; only one listed) | Rule 4.13(e)(1); observed JSON |
| Wed 11-25 20:15 → Thu 11-26 11:30 | Domestic-holiday GTH session for index options (no RTH/Curb on Thanksgiving; no index value) | Rule 5.1(e)(1); 24x5 FAQ |
| Thu 11-26 20:15 → Fri 11-27 09:25 | GTH session; `SPXW` 11-27 is open | Rule 5.1(e)(1),(c)(3) |
| Fri 11-27 09:30 | RTH opens | Hours page |
| Fri 11-27 13:00:00 | Expiring `SPXW`/XSP 11-27 stop ("1:00 pm ET for any half day holiday"); NYSE closes 13:00; official close built from the 13:00 closing auction | SPX spec; Cboe/NYSE early-close tables |
| Fri 11-27 13:00–13:15 | SPY options (designated ETF) trade to 13:15; from 2026-11-16, Curb for index options 13:00–13:15 (SR-CBOE-2026-078 example) | NYSE "1:15 p.m. for eligible options"; 34-106620 |
| Fri 11-27 14:30 | Cboe Rule 6.20(c) modified-close exercise decision deadline (1 h 30 m after announced close) for noncash-settled equity options; FINRA customer cutoff remains 17:30 by rule text | Rule 6.20(c); FINRA 2360 |

### 8A.3 Monday 2026-11-09 — first SPXO trade date (planned)
- SPXO series expiring Wed 2026-11-18 and Wed 2026-12-16 begin trading (subject to regulatory review). Both dates are VIX monthly settlement dates; Cboe says SPX options on those dates "will be listed with both AM and PM settlement" → expect `SPXO` (AM) and `SPXW` (PM) on 11-18 and 12-16. (Cboe notice 61537, accessed 2026-11-06)
- SPXO 11-18 last trade: Tue 2026-11-17 16:00 ET; no GTH resumption that evening; settles to Wed 11-18 SET.

---

## 8B. Glossary
- **SET** — Cboe ticker/term for the SPX exercise-settlement value of AM-settled SPX options: opening sales price of each constituent in its primary market on expiration day (SPX spec).
- **SOQ** — Special Opening Quotation; CME's analogous opening-price settlement for ES futures [UNVERIFIED wording, CME pages blocked].
- **Official closing price** — each constituent's closing-auction (last reported) sale on its primary market; the S&P 500 computed from these is the PM settlement value (EOM/XSP specs).
- **RTH / Curb / GTH** — Cboe Regular Trading Hours (9:30–16:15 index; 9:30–16:00/16:15 equity), Curb (16:15–17:00 index; 16:00–16:15 equity), Global Trading Hours (20:15–09:25 index; 07:30–09:25 equity) (Rule 5.1).
- **Nonstandard Expirations / Weeklys / EOM / QIX** — Rule 4.13(e) weekday and end-of-month expirations; QIX = Quarterly Index Expiration (last business day of a quarter).
- **P.M.-Settled Third Friday Index Options** — Rule 4.13 Interp. .13; the `SPXW` contract that expires on a 3rd Friday alongside AM `SPX`.
- **Ex-by-Ex** — OCC exercise-by-exception: automatic exercise of expiring options ITM by the threshold ($0.01 equity; $1.00/contract cash-settled index) unless a Clearing Member instructs otherwise (OCC Rules 805/1804).
- **CEA / EED** — Contrary Exercise Advice / Expiring Exercise Declaration: instruction to override Ex-by-Ex (Cboe Rule 6.20(d)).
- **OSI** — Options Symbology Initiative 21-character symbol: 6-char root (space-padded) + YYMMDD + C/P + 8-digit strike×1000.
- **Reporting Authority** — the index calculator whose values govern settlement (S&P DJI for SPX) (Rule 4.13 Interp. .09).
- **Short Term Option Series Program** — Rule 4.5(d) (equity/ETF) and Rule 4.13(a)(2)(A) (index) weekly/daily listing programs.

---

## 8C. Verification log — every source attempted on 2026-11-06
| Source | Result | Used for |
|---|---|---|
| https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/ | 200; hidden accordion fields recovered from page payload | multiplier, ticks, strikes, SET, hours |
| https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/specifications/ | 200; comparison table + footnotes | product comparison, SPXW expirations |
| https://www.cboe.com/tradable_products/sp_500/spx_end_of_month_options/specifications/ | 200; accordion fields recovered | PM settlement formula, 3:00 CT stop, margin |
| https://www.cboe.com/tradable_products/sp_500/mini_spx_options/specifications/ | 200; accordion fields recovered | XSP settlement, ticks, strikes |
| https://www.cboe.com/tradable_products/sp_500/spx_options/ | 200 | OI as of 2026-11-05 |
| https://www.cboe.com/about/hours/us-options/ | 200 | hours tables, 2026/2027 holidays |
| https://www.cboe.com/about/global-trading-hours/ | 200 | GTH Sunday open |
| https://www.cboe.com/insights/posts/cboe-global-trading-hours | 200 | Curb description (2026-02-09 article) |
| https://www.cboe.com/document/tech-spec/content/technical-specifications/cboe-options-exchange-245-faq | 200 | PM 4:00 stop, AM "TBD" change, holiday GTH |
| https://cdn.cboe.com/resources/regulation/rule_book/C1_Exchange_Rule_Book.pdf | 200 (3.6 MB PDF → text) | Rules 1.1, 4.5, 4.13, 5.1, 5.2, 5.3, 5.4, 5.20, 6.20 |
| https://cdn.cboe.com/resources/options/Cboe2026OPTIONSCalendar.pdf | 200 (PDF → text; dates are colored cells) | legend text |
| https://cdn.cboe.com/resources/options/Cboe2027OPTIONSCalendar.pdf | 403 (does not exist) | — |
| https://www.cboe.com/notices/content/?id=61537 | 200 | SPXO launch |
| https://www.cboe.com/notices/content/?id=57808 | 200 | 2031 SPX / 2028 XSP expirations |
| https://www.govinfo.gov/content/pkg/FR-2026-06-17/html/2026-12157.htm | 200 | SEC approval of AM weeklys |
| https://www.sec.gov/files/rules/sro/cboe/2026/34-106620.pdf | 200 (PDF → text) | SR-CBOE-2026-078 Rule 5.1(e)(3) |
| https://www.cboe.com/us/options/regulation/rule_filings/cone/ | 200 | filing list (2026-044, -078 etc.) |
| https://www.sec.gov/rules-regulations/self-regulatory-organization-rulemaking/sr-cboe-2026-078 | 200 | title/release number |
| https://www.govinfo.gov/content/pkg/FR-2025-05-29/html/2025-09622.htm | 200 | 4:00 p.m. rationale (SPEQF) |
| https://www.sec.gov/files/rules/sro/cboe/2012/34-67482.pdf | 200 (PDF → text) | SPXPM 3:00 CT history |
| https://www.sec.gov/files/rules/sro/occ/2022/34-95364-ex5.pdf | 200 (PDF → text) | OCC Rule 1804 text |
| https://www.govinfo.gov/content/pkg/FR-2008-01-24/html/E8-1155.htm | 200 | OCC $0.01 threshold |
| https://www.sec.gov/files/rules/sro/occ/2020/34-88310.pdf | 200 (PDF → text) | OCC Rule 805 context |
| https://www.theocc.com/components/docs/legal/rules_and_bylaws/occ_rules.pdf | 403 | — (OCC rulebook UNVERIFIED) |
| https://www.finra.org/rules-guidance/rulebooks/finra-rules/2360 | 200 | 5:30/7:30 p.m. cutoffs |
| https://www.nyse.com/markets/hours-calendars | 200 | holidays, 1:00/1:15 early close |
| https://www.nyse.com/markets/nyse/trading-info | 200 | closing auction timing |
| https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst | 200 | DST rule and 2026 dates |
| https://www.timeanddate.com/time/change/usa/new-york?year=2026 (and 2027) | 403 | — |
| https://www.spglobal.com/spdji/en/methodology/article/index-mathematics-methodology | 403 | — |
| https://www.spglobal.com/spdji/en/documents/methodologies/methodology-index-math.pdf | 403 | — |
| https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf | 403 | — |
| https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-equity-indices-policies-practices.pdf | 403 | — |
| https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.contractSpecs.html | 503 (×2) | — |
| https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html | 503 | — |
| https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.calendar.html | 503 | — |
| https://www.cmegroup.com/trading/equity-index/rolldates.html | 503 (content seen only via search snippet) | roll rule, 2026 dates |
| https://www.cmegroup.com/rulebook/CME/IV/350/358/358.pdf | 403 | — |
| https://www.cmegroup.com/education/courses/introduction-to-equity-index-products/what-is-an-index-future | 503 | — |
| https://ws1.dtn.com/IQ/Guide/futures_cme.html | 200 (no ES specs on page) | — |
| https://investinglive.com/stock-market-update/us-equity-index-futures-roll-to-september-today-june-contracts-near-expiry-what-you-need-20260615/ | 200 (secondary) | roll date corroboration |
| https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json | 200 (13.9 MB) | chain structure, strikes, OI, delay |
| https://www.cboe.com/delayed_quotes/spx/quote_table | 200 (no delay disclaimer text in HTML) | — |
| https://www.cboe.com/terms/ | 200 | website T&Cs (2022-11-16) |
| https://cdn.cboe.com/robots.txt | S3 AccessDenied | no robots policy |
| https://datashop.cboe.com/data-policies | 200 (links to paid-product PDFs only) | — |
| https://www.cboe.com/markets/us/options/market-statistics/daily/ | 200 | daily OI snapshot |
| https://www.cboe.com/us/options/market_statistics/historical_data/ | 200 | old put/call CSVs |
| https://www.cboe.com/index_settlement_values/ (+ weeklys_settlement_values/, end_of_month_settlement_values/) | 200 (JS-rendered tables; no data in HTML) | structure only |
| https://www.cboe.com/markets/us/options/market-statistics/product-data/kpi-settlement-values/ | 200 | nav links, CSV/JSON pattern |
| https://www.cboe.com/us/indices/accessing-index-data ; https://www.cboe.com/data/global-indices-feed/ | 200 | no update interval stated |
| https://cdn.cboe.com/resources/release_notes/2019/Corrected-Closing-Settlement-Prices-for-Certain-SP-Indices-II.pdf | 200 (PDF → text) | settlement correction precedent |
| https://mondovisione.com/news/cboe-launches-extended-trading-sessions-for-select-single-stock-and-etf-options-20261019/ | 200 (press reprint) | equity-option extended hours |
| https://help.firstrade.info/en/articles/9264922-options-that-trade-until-4-15-pm-eastern-standard-time | 200 (secondary) | 4:15 list |
| https://support.tradier.com/what-times-of-the-day-can-i-trade | 200 (no list in page) | — |
| https://en.wikipedia.org/wiki/Option_symbol | 200 (secondary) | OSI format |
| https://www.ibkr.info/article/972 | 403 | — |
| https://tickertape.tdameritrade.com/trading/spx-options-settlement-price-15025 | DNS blocked in this session | — |
| https://www.cboe.com/0dte/ ; https://www.cboe.com/tradable_products/sp_500/spx_options/faq/ ; https://www.cboe.com/tradable_products/sp_500/spx_weekly_options/ | 404 | — |

## 9. Implementation consequences

1. **Root symbol is the settlement discriminator.** Parse `root ∈ {SPX, SPXO, SPXW, XSP, SPY}` + `YYMMDD` + `C/P` + 8-digit strike/1000. From 2026-11-09, `SPXO` (AM, weekday, SET at the open, last trade prior business day, no GTH resumption) coexists with `SPXW` (PM) and `SPX` (AM, 3rd Friday). Never infer settlement from the date; on 3rd Fridays `SPX` and `SPXW` both exist for the same date.
2. **Hard stop for expiring SPXW/XSP = 16:00:00 ET** (13:00:00 ET on 2026-11-27, 2026-12-24, 2027-11-26). Non-expiring SPX series run to 16:15 then Curb to 17:00. SPY options run to 16:15 ET even on expiration day (13:15 on half-days). Keep the session clock in `America/New_York` wall time (DST 2026-03-08 / 2026-11-01; 2027-03-14 / 2027-11-07) and never hard-code a UTC offset.
3. **PM payoff input is the official S&P 500 close, not the last SPX tick.** Stop treating the 15:59:59 print as the settlement; model a closing-auction adjustment (MOC/LOC imbalance); mark expiring PM positions "provisional" until Cboe/OCC publish the settlement value; expect rare corrections (2019 precedent).
4. **AM contracts settle to SET from constituent opening prints,** not the 9:30:00 SPX print (Rule 4.13 Interp. .02), and have no tradable hedge on settlement morning (last trade Thursday RTH; SPXO: no GTH resumption). Overnight exposure must be hedged in ES, which itself settles SOQ-style.
5. **Strike grid:** assume 5-point SPXW strikes across the tradable range (observed ±300 pts), $1/$0.50 for XSP; strikes can be added intraday (Rule 4.13(e)(1)) — refresh the chain, don't cache it for the day.
6. **Tick sizes:** SPX/SPXW simple orders $0.05 (<$3.00) / $0.10 (≥$3.00); complex SPX $0.05; XSP and SPY $0.01. Quantize fills and price-improvement estimates accordingly; a 25.80×25.90 0DTE quote is already one tick wide.
7. **Exercise/assignment model:** SPXW/XSP — European, cash, automatic at ≥$1.00/contract (= $0.01 index ITM), no early assignment, no contrary-exercise risk. SPY — American, physical 100 shares, Ex-by-Ex at $0.01 ITM, customer decision cutoff 5:30 p.m. ET on expiration day (CEA to 7:30 p.m. ET), options trading to 4:15 while the stock closes 4:00 → model short near-the-money SPY as assignable on post-close moves; brokers cut off earlier.
8. **Holiday logic:** encode the 2026/2027 lists (§4.1); apply Rule 4.13(e)(1) shifts (Mon→next bd; Tue–Fri→prior bd; dedupe; EOM wins) and Rule 4.13(a)(4) for AM contracts. Domestic holidays still have an SPX GTH session to 11:30 a.m. ET with no index value.
9. **Overnight/GTH:** there is no SPX index value 20:15–09:25 ET or during Curb; price SPXW off ES plus carry, and respect Cboe's CME-linked halts (Rule 5.20(f)). GTH order acceptance 8:00 p.m.; RTH order acceptance 7:30 a.m.
10. **Data plumbing:** the Cboe delayed JSON is ≥15 minutes stale and personal/non-commercial; use it for chain structure, OI and sanity checks, not execution timing. Treat `open_interest` as prior-day. Free settlement-value and OI history is thin (JS tables, no SET CSV found): plan a DataShop purchase or an internal nightly capture job.
11. **Watch list:** SR-CBOE-2026-078 (Curb on half-days; operative 2026-11-16); the 24x5 FAQ's pending plan to let expiring AM-settled index options trade until 9:25 a.m. ET on settlement day; equity-option GTH class additions each February/August; SPXO's actual launch on 2026-11-09 and its weekday expansion.

## 10. Uncertainties

1. **S&P DJI methodology not read** (HTTP 403 on every spglobal.com methodology URL). The official-close construction (primary-exchange official close; fallback when a constituent lacks a closing print; real-time cadence; publication/finalization time) is stated from Cboe wording and memory and is UNVERIFIED. The "~1 second" SPX cadence in the brief is unsupported; evidence points to ≤15 s.
2. **OCC rulebook not read** (theocc.com HTTP 403). Rule 1804 text is from a 2022 SEC exhibit; the $0.01 equity Ex-by-Ex threshold from a 2008 SEC/FR notice; OCC's own expiration-day clearing-member deadline is not sourced (exchange/FINRA cutoffs are).
3. **CME pages not read** (HTTP 503/403). ES multiplier, tick, hours and SOQ settlement are from memory; the roll rule and 2026 dates are from a CME page quoted in a search snippet, with a secondary source conflicting on the June 2026 expiry date (CME: 6/18).
4. **Expiring SPXW in GTH on expiration morning** is inferred from Rule 5.1(c)(3) plus the 24x5 FAQ; no Cboe sentence says "0DTE series trade in GTH" verbatim. Empirically checkable from any Friday-morning GTH print.
5. **Expiring standard SPX last-trade time**: SPX spec says "5:00 pm ET" (end of Curb) Thursday; the SPXO notice says 4:00 p.m. for SPXO's last day. Whether expiring AM `SPX` series are actually quoted in Thursday Curb is unverified.
6. **Early-close-day RTH end for non-expiring index options**: Cboe table says 13:00; the 24x5 FAQ says "RTH on Friday ends at 1:15 p.m. ET" for proprietary index options after Thanksgiving; NYSE says "1:15 p.m. for eligible options"; from 2026-11-16 Curb runs 15 minutes after the shortened RTH. Only the 13:00 stop for expiring PM series is unambiguous.
7. **Cboe 2027 options calendar PDF** was not available at the 2026 URL pattern (HTTP 403); 2027 expiration dates are computed from the Cboe/NYSE holiday lists and the rules, not read from a Cboe calendar.
8. **Listing horizon for SPXW dailies**: Rule 4.13(e)(1) says first-listed weeklies "may expire up to four weeks from the actual listing date", yet dailies were observed ≈6 weeks out on 2026-11-06; the 12-per-weekday maximum likely governs. Verify before hard-coding a horizon.
9. **SPXO details beyond the launch notice** (strike intervals, OSI root padding, exact last-trade minute on GTH-eligible days, weekday expansion schedule) are not in the fetched rulebook text; the notice says "subject to regulatory review" — confirm the 2026-11-09 launch happened.
10. **Delayed-data terms**: Cboe's website T&Cs (2022) are generic; no specific license for the `delayed_quotes` API, no published rate limits, no robots.txt. "Personal non-commercial" is the defensible reading; redistribution is prohibited.
11. **Stale Cboe marketing text**: the comparison table (SPY "Mon., Wed., Fri." and "GTH: No") and the EOM spec ("Extended Hours: 2:00 a.m. to 8:15 a.m. Central") are out of date relative to the rulebook/hours page; the rulebook was used where they conflict.
12. **Broker-specific cutoffs** (exercise instruction deadlines earlier than 5:30 p.m. ET; 0DTE close-out policies) were not sourced and vary by firm.
13. **Web-search budget was exhausted** mid-task (shared 200-call limit), and some hosts were blocked (tickertape.tdameritrade.com DNS; ibkr.info 403; timeanddate 403), so several corroborating fetches (Nasdaq closing cross page, OCC symbology PDF, Cboe GTH FAQ on expiring series, Cboe IR press release on equity-option extended hours) were not attempted or failed.
