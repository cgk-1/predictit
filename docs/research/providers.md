# Market-data provider comparison memo
## Private single-user SPX/SPY intraday options research terminal

- Prepared: 2026-11-06 (all sources accessed 2026-11-06 unless noted)
- Scope: data procurement only. No sign-ups were performed. No prices are inferred; anything not read on an official page is marked **UNVERIFIED**.
- Method: official pricing/docs pages fetched directly; where a vendor page is JS-rendered or blocked our fetcher (HTTP 403), the memo says so and falls back to a search-engine excerpt of that same official page or a third-party page, always labelled.
- Note on search budget: the web-search quota for this session was exhausted near the end; the remaining gaps (chiefly Interactive Brokers' fee table, ThetaData's Indices-tier price, GEXBot's pricing page, SpotGamma's support article) are flagged rather than guessed.

---

## 0. Executive summary

- **You already have the two things most retail stacks pay for**: real-time SPX/SPY quotes, chains and minute bars via Schwab, and a surprisingly rich free 15-minute-delayed full SPX chain (bid/ask/size, IV, OI, volume, greeks) plus 1-minute index bars from Cboe's public JSON. The gaps are (a) *historical* option quotes/chains, (b) *sub-minute* index values, (c) ES futures, (d) auction-imbalance feeds, and (e) a defensible licence for storing what you download.
- **Cboe's free JSON has no explicit API licence.** The only applicable text is cboe.com's website Terms, which permit "one copy ... for your personal non-commercial use" but prohibit storing Materials "in an electronic retrieval system" or creating derivative works without written consent, and state the Materials are "not intended for trading purposes". Treat it as a display/convenience feed, not an archive source. (See §1.2.)
- **Cheapest credible historical-options source for research:** ThetaData Options Standard at $80/mo (tick-level OPRA NBBO back to 2016-01-01, 10,000-contract quote streams) or Pro at $160/mo (back to 2012-06-01). Its subscriber agreement requires you to expunge all data within 30 days of termination, so it is a *subscription*, not a one-time purchase.
- **Best "own the archive" source for execution-level backtests:** Databento OPRA.PILLAR, CMBP-1 schema (every NBBO update, nanosecond timestamps) from 2023-03-28 onward; Standard plan $199/mo includes live data and the last 12 months of L1 history, older history is pay-per-GB (rate UNVERIFIED; portal estimator). Pair with Databento Core Indices (DBIX.CORE, $99/mo; SPX every second; includes SET/VRO settlement values) — but DBIX history only begins 2025-12-07.
- **Auction imbalances are available to individuals cheaply only from Massive** ("NYSE Order Imbalances", $49/mo, individual use). Nasdaq NOII historically via Databento XNAS.ITCH `imbalance` schema (pay-per-GB); real-time NOII/NYSE imbalance for individuals is otherwise licence-gated (Databento Plus/Unlimited; NYSE feeds "start at $1,000/month").
- **ES futures**: cheapest real-time is tastytrade's DXLink (free for funded customers) or Databento GLBX.MDP3 Standard ($199/mo, CME personal-use licence included, up to 2 devices); 10-minute-delayed ES from Massive Futures Starter ($29/mo).
- **Gamma/positioning vendors** (SpotGamma, Menthor Q, Unusual Whales, GEXBot, Tier1 Alpha, OptionsDepth, Volland) are $50–$1,000/mo dashboards. Only Unusual Whales, GEXBot and OptionsDepth publish an API; none is a substitute for raw chain data you already get.

---

## 1. What we already have

### 1.1 Schwab Trader API — Market Data (free with brokerage account)
- Taken as given from the task brief: real-time quotes, chains and minute bars for $SPX and SPY; no historical option chains; streaming only if the "Accounts and Trading" product is added. Schwab's developer portal returned HTTP 403 to our fetcher today, so nothing new was verified: [developer.schwab.com product page](https://developer.schwab.com/products/trader-api--individual) (accessed 2026-11-06, 403 — UNVERIFIED).
- Role in the stack: live SPX/SPY level, live chains with greeks for display; *not* an archive.

### 1.2 Cboe public delayed-quotes JSON (free, no key)
Verified today by direct retrieval (both endpoints 307-redirect from `cdn.cboe.com` to `cdn-api.cboe.com`; follow redirects):

- Full chain: `https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json` (accessed 2026-11-06)
  - 13.9 MB; 31,306 contracts; option roots present today: `SPX`, `SPXW` (OSI symbols like `SPX261120C00400000`, `SPXW…`).
  - Per-contract fields: `bid, bid_size, ask, ask_size, iv, open_interest, volume, delta, gamma, vega, theta, rho, theo, change, open, high, low, tick, last_trade_price, last_trade_time, percent_change, prev_day_close`.
  - Index-level fields: `current_price, bid, ask, bid_size, ask_size, open/high/low/close, prev_day_close, iv30, iv30_change, seqno, last_trade_time, tick`.
  - Observed delay: file `timestamp` 2026-11-06 16:27:25 (server clock, appears to be UTC) vs. index `last_trade_time` 2026-11-06T11:12:23 (ET) — consistent with the 15-minute delay. HTTP `cache-control: max-age=0, s-maxage=5` (CloudFront).
- Intraday 1-minute bars: `https://cdn.cboe.com/api/global/delayed_quotes/charts/intraday/_SPX.json` (accessed 2026-11-06)
  - 102 bars 09:31→11:12 at fetch time; each bar has `price.{open,high,low,close}` and `volume.{stock_volume, calls_volume, puts_volume, total_options_volume}`. Current day only.
- Bonus (verified today): daily history of the SPX settlement series **SET** is served by the same family of endpoints: `https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_SET.json` — 6,967 rows from 1998-07-09 to 2026-11-05 (accessed 2026-11-06). Sanity-check values before use (SET is the AM special-opening quotation, not the close).
- Daily SPX close history (free CSV, 1975-01-02 onward): [cdn-api.cboe.com SPX_History.csv](https://cdn-api.cboe.com/api/global/us_indices/daily_prices/SPX_History.csv) (accessed 2026-11-06).

Observed field dictionary (from today's retrieval; types inferred from values):

| Level | Field | Example (2026-11-06) | Note |
|---|---|---|---|
| contract | `option` | `SPX261120C00400000` | OSI symbol; roots `SPX`, `SPXW` present |
| contract | `bid`, `bid_size`, `ask`, `ask_size` | 6999.1 / 1 / 7016.8 / 7 | NBBO-style top of book, delayed |
| contract | `iv` | 5.3461 | implied vol (percent) |
| contract | `open_interest` | 2509 | prior-day OI |
| contract | `volume` | 0 | session volume |
| contract | `delta`, `gamma`, `vega`, `theta`, `rho`, `theo` | 1.0 / 0.0 / 0.0022 / -0.0269 / 0.1543 / 7007.188 | vendor-computed greeks and theoretical value |
| contract | `last_trade_price`, `last_trade_time` | 7260.48 / 2026-11-04T09:31:56 | last print, no size |
| contract | `open`, `high`, `low`, `change`, `percent_change`, `prev_day_close`, `tick` | — | daily stats |
| index | `current_price`, `bid`, `ask`, `bid_size`, `ask_size` | 7411.08 / 7408.88 / 7413.69 / 1 / 1 | delayed index "quote" |
| index | `open`, `high`, `low`, `close`, `prev_day_close`, `volume` | — | daily stats |
| index | `iv30`, `iv30_change`, `iv30_change_percent` | 18.364 / -2.911 / -13.68 | 30-day IV summary |
| index | `seqno`, `last_trade_time`, `exchange_id`, `security_type` | 52799286784 / 2026-11-06T11:12:23 / 5 / index | sequencing only; no per-quote timestamps |
| file | `timestamp`, `symbol` | 2026-11-06 16:27:25 / `^SPX` | generation time (appears UTC) |

Limitations for research use: no per-contract quote timestamps, no trade sizes, no history, and no documented SLA; the 1-minute chart endpoint only serves the current session.

**Terms that govern it (there is no separate API licence page):**
- [Cboe Terms & Conditions](https://www.cboe.com/terms) (accessed 2026-11-06): "You may view, print and download one copy of the Materials for your personal non-commercial use"; "You may not otherwise copy, reproduce, alter, store either in hard copy or in an electronic retrieval system ... create a derivative work (for example, a financial product, service or index) from ... publish, rent, sublicense, distribute ... without Cboe's prior written consent"; Materials "are not intended for trading purposes"; "Cboe does not guarantee the accuracy, completeness, timeliness".
- [Cboe Use of Content](https://www.cboe.com/use-of-content) (accessed 2026-11-06): "In order to use any Cboe logo, data, photo/image or other content contained in Cboe websites" requires prior approval via permissions@cboe.com; "You are not approved to use Cboe Content until a license agreement has been signed by both you and Cboe."
- [Cboe Global Disclaimers](https://www.cboe.com/global-disclaimers/) (accessed 2026-11-06): content "AS IS", no warranty; "No data, values, or other content ... may be modified, reverse-engineered, reproduced, or distributed".
- [Cboe Global Indices Feed / Accessing Index Data](https://www.cboe.com/us/indices/accessing-index-data/) (accessed 2026-11-06): real-time index values are a licensed streaming product ("Get a custom pricing plan"); the free dashboard is not described as a licensed data service.
- Practical reading: a single-user, non-commercial *display* use is squarely what the Terms contemplate; systematically archiving the JSON into a database is the "electronic retrieval system" the Terms reserve. For an archive, buy licensed historical data (§2) rather than scraping.

---

## 2. Provider-by-provider evaluation

Each section covers, in order: SPX index level; SPXW/SPX chains (quotes, trades, OI, greeks); SPY options; historical bid/ask depth & years; ES futures; auction-imbalance feeds; timestamp precision; streaming limits; historical coverage; entitlements / non-pro declaration; storage & redistribution licence; monthly cost.

### 2.1 Massive (formerly Polygon.io) — massive.com (polygon.io/pricing 301-redirects to massive.com/pricing)

**Options plans (individual)** — [massive.com/options](https://massive.com/options) (accessed 2026-11-06); annual billing "saves 20%":
- Basic **$0**: 5 API calls/min, 2 years history, end-of-day data, minute aggregates, reference data, technical indicators.
- Starter **$29/mo**: no call cap, 2 years, **15-minute delayed**, "Real-time Greeks and IV, daily open interest, flat files, WebSockets, snapshots, second aggregates".
- Developer **$79/mo**: 4 years, 15-minute delayed, adds **trades**.
- Advanced **$199/mo**: 5+ years, **real-time**, adds **quotes**.
- Source per FAQ: "From OPRA, the consolidated feed that every US options exchange reports to."
- Business tier (for reference): $1,999/mo, "10+ Years Historical Trades" and "2.5 Years Historical Quotes"; real-time/delayed trades+quotes need an "expansion" at $1,999 / $499 — [massive.com/business-options](https://massive.com/business-options) (accessed 2026-11-06).

**History depth as documented per endpoint:**
- Option quotes REST: "Records date back to March 7, 2022"; included only in Options Advanced / Business / Business + Expansion; `sip_timestamp` is "The nanosecond accuracy SIP Unix Timestamp"; `limit` max 50,000 per page — [quotes endpoint doc](https://massive.com/docs/rest/options/trades-quotes/quotes.md) (accessed 2026-11-06).
- Option trades REST: "Records date back to June 2, 2014"; Developer and up — [trades endpoint doc](https://massive.com/docs/rest/options/trades-quotes/trades.md) (accessed 2026-11-06).
- Snapshots: contract and chain snapshots return "implied volatility, open interest, greeks (delta, gamma, theta, vega), and the latest quote and trade information" — [options overview](https://massive.com/docs/rest/options/overview) (accessed 2026-11-06). For index options "the snapshot endpoint needs the prefixed symbol (I:SPX) to return Greeks" — [massive.com/options](https://massive.com/options).
- So: Advanced's "5+ years" is trades (2014+) and aggregates; NBBO quotes exist only from 2022-03-07 (≈4.7 years today).

**SPX index level** — [massive.com/indices](https://massive.com/indices) (accessed 2026-11-06):
- Indices Basic **$0** (limited tickers; "SPX, DJI, RUT and VIX all need a paid Indices tier"), Starter **$49/mo** (all index tickers, **15-minute delayed**, websockets, snapshots), Advanced **$99/mo** (**real-time**). "1+ year" historical, minute aggregates. "Indices come from three providers: Nasdaq, Cboe Global Indices and CME Group."
- Yes, SPX index values require a paid Indices plan on top of Options. Sub-minute historical index values: UNVERIFIED (page lists minute aggregates).

**SPY options**: same OPRA plans as above (equity and index options share the Options subscription).

**ES futures** — [massive.com/futures](https://massive.com/futures) (accessed 2026-11-06): Basic $0 (2 yrs), Starter $29/mo ("10-minute Delayed Data", websockets, 2 yrs), Developer $79/mo (5 yrs, 10-min delayed), Advanced $199/mo ("Real-time Data", "7+ Years"); CME, CBOT, NYMEX, COMEX; individual use.

**Auction imbalances**: "NYSE Order Imbalances — Auction data — Real-time buy and sell pressure ahead of open, close, and intraday auctions — $49/month — Individual use only" — [massive.com/pricing?product=nyse-order-imbalances](https://massive.com/pricing?product=nyse-order-imbalances) (accessed 2026-11-06). Delivery mechanics/history for this product were not on the page (UNVERIFIED).

**Timestamp precision**: nanosecond SIP timestamps on REST trades/quotes; websocket quote messages carry `t` in Unix **milliseconds** — [websocket options quotes doc](https://massive.com/docs/websocket/options/quotes) (accessed 2026-11-06).

**Streaming limits**:
- Options quote stream requires Options Advanced (or Business + Expansion); "You're only allowed to subscribe to 1,000 option contracts per connection"; delayed host `wss://delayed.massive.com/options`, real-time `wss://socket.massive.com/options` — same doc.
- Connections: "Individual subscriptions include one connection on the cluster for the asset class you bought"; Basic has no WebSocket; on `/options` an excess connection "is refused at auth" — [KB: How many WebSocket connections](https://massive.com/knowledge-base/article/how-many-massive-websocket-connections-can-i-use-at-one-time) (accessed 2026-11-06).

**Entitlements / non-pro**: Individual plans are "Individual use only" ([massive.com/pricing](https://massive.com/pricing), accessed 2026-11-06). The Market Data Terms define Non-Professional as "any natural person who receives market data solely for their own personal, non-business use" and the OPRA addendum restricts use "solely in connection with your personal investment activities" — [Market Data Terms](https://massive.com/legal/market-data-terms-of-service) (accessed 2026-11-06).

**Storage / redistribution licence** — [Individuals ToS](https://massive.com/legal/individuals-terms-of-service) and [Market Data Terms](https://massive.com/legal/market-data-terms-of-service) (both accessed 2026-11-06):
- Access "solely for your own personal, non-commercial, and non-business purposes"; may not "Share, redistribute, publish, sell, sublicense or rebrand Information, make it available to anyone else".
- Storage: "Your license to Information ends when the plan, add-on or purchase that includes it ends" and then "you must stop using it and delete it promptly, and in any event within thirty (30) days"; a passive backup "may retain a copy until it is overwritten in your normal backup cycle" (capped at 90 days). Your own analyses may be kept if they "do not contain Information and cannot reasonably be used to recreate it".
- Derived data that can recreate the source is treated as Information; "Data that Massive calculates or derives from Third-Party Data remains Third-Party Data".
- Implication: flat-file downloads are fine *while subscribed*; cancelling obliges deletion of the raw archive.

**Monthly cost for this project**: Options Starter $29 (delayed greeks/OI snapshots + websockets) → Options Advanced $199 (real-time + historical NBBO) ; Indices Advanced $99 for real-time SPX (or Starter $49 delayed); Futures Starter $29 / Advanced $199; NYSE imbalances $49.

### 2.2 Databento — databento.com

**Plans** — [databento.com/pricing](https://databento.com/pricing) (accessed 2026-11-06):
- Usage-based: "Pay as you go for historical data", "priced ($/GB) by the data's uncompressed size (GB) in binary encoding"; CSV/JSON "no additional charge"; "There is no monthly subscription fee for usage-based historical data" ([FAQ: usage pricing](https://databento.com/docs/faqs/usage-pricing-and-data-credits), accessed 2026-11-06).
- Standard **$199/mo** (per dataset family): includes live data, "No license fees", history "16+ years of L0, 1 year of L1, and 1 month of L2 and L3"; licensing rows "Personal use", "Up to 2 devices", "License fees included".
- Plus: $1,750 license fees/mo on the pricing page, annual contract (the OPRA catalog page shows **$1,500** and Unlimited **$4,000** — dataset-specific; both figures read today). Unlimited: $4,500/mo (pricing page).
- "New users get $125 in free credits that can be used towards historical data from any of our datasets"; "Credits expire 6 months after signup".
- "Most of our datasets can be redistributed internally or externally after 24 hours."
- Per-GB rates per dataset/schema are **not printed**; the portal estimator or `metadata.get_cost` gives quotes (UNVERIFIED rate for OPRA; Core Indices blog says its usage-based pricing starts "at $10.00/GB").

**SPXW/SPX/SPY chains — OPRA.PILLAR** — [catalog page](https://databento.com/catalog/opra/OPRA.PILLAR) (accessed 2026-11-06):
- Schemas: "CMBP-1, CBBO-1s, CBBO-1m, TCBBO, Trades, OHLCV-1s, OHLCV-1m, OHLCV-1h, OHLCV-1d, Statistics, Status, Definition"; "13+ years" history; "nanosecond-resolution timestamps"; "anticipate several terabytes of data per day for the full dataset" at CMBP-1.
- "A license is needed to access live data for this dataset per exchange requirements." / "A license isn't required to access historical data."
- Depth by schema — [blog: OPRA improvements](https://databento.com/blog/opra-improvements-coming-soon) and [OPRA.PILLAR docs](https://databento.com/docs/venues-and-datasets/opra-pillar) (both accessed 2026-11-06): trades, OHLCV, statistics (open interest), definitions and **CBBO-1m from April 1, 2013**; **CMBP-1 (every NBBO update), TCBBO (NBBO at each trade) and CBBO-1s only from March 28, 2023**; "Data prior to 2023-03-28 was not generated from OPRA packet captures, but from subsampled data".
- Symbology: raw OSI 21-char symbols (e.g. `SPY 231117P00486000`); parent symbol is the six-char root such as `SPXW` "for SPX weekly options"; parent symbology `[ROOT].OPT` with `stype_in=parent` is supported for OPRA.PILLAR ([symbology doc](https://databento.com/docs/standards-and-conventions/symbology), accessed 2026-11-06). Greeks: not provided (compute locally). OI: `statistics` schema.
- Live OPRA licence (personal): "$1.25/display or non-display device" pass-through; display vs non-display questionnaire; "Some venues don't automatically consider API use as a non-display use case" — [live data licensing](https://databento.com/docs/portal/live-data) (accessed 2026-11-06). Standard plan lists "No license fees".
- Live CMBP-1 subscriptions "always use the `skip` slow-reader behavior" (docs page above).

**SPX index level — DBIX.CORE (Databento Core Indices)** — [catalog page](https://databento.com/catalog/dbix/DBIX.CORE) and [launch blog](https://databento.com/blog/databento-core-indices) (both accessed 2026-11-06):
- "Real-time and historical values for 2,600+ indices from Cboe, S&P Dow Jones, FTSE Russell, MSCI, and Morningstar"; SPX and VIX included; "Core Indices includes the official settlement values for SPX (SET) and VIX (VRO)".
- Schemas "MBP-1, Trades, BBO-1s, BBO-1m, OHLCV-1s, OHLCV-1m, OHLCV-1h, OHLCV-1d, Definition, Statistics, Status"; SPX "update[s] every second"; source "millisecond-resolution timestamps".
- History "Available from 2025-12-07" (≈11 months today). Standard **$99/mo**; "A license isn't required for personal use on the Standard plan"; usage-based from $10.00/GB (blog).
- So Databento *does* now sell S&P 500 index values (the brief's "not available?" is out of date), but with less than one year of history.

**ES futures — GLBX.MDP3** — [catalog page](https://databento.com/catalog/cme/GLBX.MDP3) (accessed 2026-11-06): "Available from" 2010-06-06; schemas MBO, MBP-1, MBP-10, TBBO, Trades, BBO-1s/1m, OHLCV-1s…1d, Definition, Statistics, Status, CMBP-1, CBBO-1s/1m; nanosecond timestamps ("Timestamps prior to 2015-11-20 are limited to millisecond resolution"); Standard $199/mo; licence required for live. Personal-use CME licence: "Included with Standard plan (up to 2 devices)" ([live data page](https://databento.com/docs/portal/live-data)).

**Auction imbalances**:
- Nasdaq NOII: XNAS.ITCH `imbalance` schema normalised from the NOII message; `auction_type` O/C/H/A; "Nasdaq begins disseminating imbalance data at 9:25 ET for the Opening Cross and 15:50 ET for the Closing Cross"; every 10 s until 15:55 then every 1 s; nanosecond timestamps — [XNAS.ITCH docs](https://databento.com/docs/venues-and-datasets/xnas-itch) and [imbalance schema](https://databento.com/docs/schemas-and-data-formats/imbalance) (both accessed 2026-11-06). Live licence: the live-data page marks Nasdaq datasets "Commercial only" for personal use while also listing per-user figures ($15.00 TotalView-ITCH) — conflicting; UNVERIFIED for individuals. Historical: usage-based.
- NYSE/Arca/American imbalances: `XNYS.PILLAR`, `ARCX.PILLAR`, `XASE.PILLAR`, schema `imbalance`; real-time "included with a Plus or Unlimited subscription ... with the required licensing"; "The Order Imbalances feeds start at $1,000/month" (exchange fees) — [blog](https://databento.com/blog/NYSE-imbalance-feeds) (accessed 2026-11-06).

**Streaming limits**: not expressed as symbol caps; live needs Standard+; CMBP-1 slow-reader `skip`. (Catalog/docs pages above.)

**Storage / redistribution**: the User Agreement page is client-rendered and returned no text to our fetcher — [databento.com/legal/user-agreement](https://databento.com/legal/user-agreement) (accessed 2026-11-06, UNVERIFIED). Pricing page says redistribution rights are per-dataset pass-throughs and most datasets "can be redistributed internally or externally after 24 hours"; no deletion-on-termination clause was found in the pages read. Historical data purchased usage-based has no subscription to lapse.

**Monthly cost for this project**: $0 + usage-based (with $125 credit) for historical; Standard OPRA $199/mo for live + 12 months L1; DBIX.CORE $99/mo; GLBX.MDP3 $199/mo (each Standard plan is per dataset — UNVERIFIED whether a single $199 covers several datasets; the pricing table reads per-plan).

### 2.3 ThetaData — thetadata.net

**Options tiers** — [thetadata.net/pricing](https://www.thetadata.net/pricing) (accessed 2026-11-06):
- Options Value **$40/mo**: "6 Years of data", "1 minute intervals", "2 concurrent requests", "3 Request types", "Low latency snapshots".
- Options Standard **$80/mo**: "10 Years of data", "Tick level data", "4 concurrent requests", "7 Request types", "Option Chain Snapshots", "15K Trade streams", "Every NBBO quote reported by OPRA".
- Options Pro **$160/mo**: "14 Years of data", tick, "8 concurrent requests", "12 Request types", "Option Root Snapshots", "Stream every option trade".
- All tiers: "100% market coverage", "Real-time access", "Symbols included are US Index & Stocks", "API Support". No Stocks/Indices price tiers are printed on the page (Indices/Stocks tier prices: **UNVERIFIED**).

**Depth and access by tier** — [Subscriptions doc](https://thetadata.net/docs/Articles/Getting-Started/Subscriptions.html) (accessed 2026-11-06):
- US Options: FREE = EOD from 2023-06-01, 1-day delay; VALUE = 1-minute from 2020-01-01, real time; STANDARD = tick from 2016-01-01; PRO = tick from 2012-06-01. Historical endpoints: EOD, Quote, Open Interest, OHLC, Trade, Trade Quote, Implied Volatility, Greeks 1st/2nd/3rd order, Trade Greeks. Streaming: quotes 10,000 contracts (Standard) / 15,000 (Pro); trades 15,000 (Standard) / unlimited via full trade stream (Pro).
- Indices: FREE = no access; VALUE = 1-minute from 2023-01-01, 15-minute delayed; STANDARD = "Lowest reported by venues" from 2022-01-01, real time; PRO = from 2017-01-01, real time. "Real-time updates cover CGIF-reported indices, including SPX and VIX."
- US Stocks: VALUE 1-min from 2021-01-01 (15-min delayed); STANDARD 1-min from 2016-01-01 real time; PRO tick from 2012-06-01; CTA-tape symbols such as **SPY limited to 2020-01-01**.
- "The Theta Terminal must be running to access any data" (local Java app hosting a local HTTP server) — [Getting Started](https://thetadata.net/docs/Articles/Getting-Started/Getting-Started.html) (accessed 2026-11-06).

**Quote resolution** — [option history quote endpoint](https://thetadata.net/docs/operations/option_history_quote.html) (accessed 2026-11-06): intervals "tick, 10ms, 100ms, 500ms, 1s, 5s, 10s, 15s, 30s, 1m, 5m, 10m, 15m, 30m, 1h"; "Intervals less than 1m are available only for single-day requests"; "Multi-day requests are limited to 1 month of data, and must specify an expiration"; "Returns every NBBO quote reported by OPRA"; fields `bid_size, bid_exchange, bid, bid_condition, ask_size, ask_exchange, ask, ask_condition`; timestamps `YYYY-MM-DDTHH:mm:ss.SSS` (millisecond).

**Index resolution** — [index history price endpoint](https://thetadata.net/docs/operations/index_history_price.html) (accessed 2026-11-06): same interval list incl. `tick`; "Exchanges typically generate a price report every second for popular indices like SPX"; millisecond timestamps.

**ES futures**: not offered (site lists Options, Stocks, Indices, Interest Rates — [thetadata.net](https://www.thetadata.net/), accessed 2026-11-06).
**Auction imbalances**: not offered.

**Entitlements / licence** — [Subscriber Agreement](https://www.thetadata.net/subscriber-agreement) (accessed 2026-11-06):
- Use "solely for Licensee's internal personal use purposes"; shall not "disclose, release, distribute, or deliver the Data"; shall not "copy, modify, or create derivative works of the Data, in whole or in part" (read literally this is stricter than any other vendor here; in practice the product is a download API — ask them to confirm local storage is permitted while subscribed).
- "Licensee is permitted one individual to access the Data"; cannot share credentials; OPRA exhibit: "shall not retransmit or otherwise furnish OPRA Data to any other person".
- Termination: "cease using and delete, destroy, or return all copies of the Data"; "All data obtained indirectly or directly from Theta Data must be expunged within 30 days of termination"; "Derived works generated from Theta Data cannot be redistributed before or after the time of termination".
- Non-professional: terms reference "Professional Subscriber" without defining it (UNVERIFIED declaration process).

**Monthly cost**: $40 / $80 / $160 for Options; Indices tier price UNVERIFIED (the "Symbols included are US Index & Stocks" line on the Options pricing cards suggests some index/stock access is bundled — confirm before buying).

### 2.4 Tradier (brokerage API)

- Cost: "API access is included with a Tradier Brokerage account at no extra charge"; account plans Lite $0, Pro $10/mo, Pro Plus $35/mo, "API Access ... Included" on all; index options $0.35/contract (Lite, Pro) or $0.10 (Pro Plus); inactivity fee "$50/year" if fewer than 2 trades/year — [docs: market data](https://docs.tradier.com/docs/market-data) and [tradier.com/pricing](https://tradier.com/pricing) (both accessed 2026-11-06).
- SPX index level: production "Real-time (some index data delayed 15 min)"; "All other indexes that are in the CBOE main list are live values"; "Any other index not in the main list is on a 15-minute delayed feed" — [docs/llms.txt](https://docs.tradier.com/llms.txt) (accessed 2026-11-06). Whether SPX is on that "main list" is not stated (UNVERIFIED, likely yes).
- Chains/greeks: "Greeks and volatility data have been included courtesy of the ORATS APIs"; "In the Brokerage API, Greeks are updated once per hour starting at around 10:15"; sandbox greeks "Not Available" — llms.txt. Level 1 only: "no Level 2 / depth of book".
- Historical: time & sales lookback — tick 5 days (open session only; "tick data is not available in the sandbox"), 1min 20 days (open) / 10 days (all), 5min & 15min 40 / 18 days; "Historical data isn't available for expired options" — llms.txt and market-data doc. Daily bars only beyond that.
- Streaming: HTTP streaming or WebSocket; "While we do not publish the symbol limits for these APIs, we do monitor for abuse"; "It is not permitted to open more than one session at a time" — llms.txt.
- Rate limits: market data 120 req/min production, 60 sandbox; trading 60/min; rate-limit responses are HTTP 400 "Quota Violation" — [docs: rate limits](https://docs.tradier.com/docs/rate-limits) (accessed 2026-11-06).
- ES futures: "Futures are 'Not Available' in either environment" (market-data doc). Imbalances: none.
- Timestamp precision: not documented (UNVERIFIED; timesale 1-min bars + tick trades).
- Licence: brokerage customer agreement; non-pro status is the standard brokerage declaration (UNVERIFIED specifics).
- Cost: $0 (plus brokerage account; mind the $50/yr inactivity fee).

### 2.5 Alpaca

- Plans — [alpaca.markets/data](https://alpaca.markets/data) and [about market data API](https://docs.alpaca.markets/docs/about-market-data-api) (both accessed 2026-11-06): Free/Basic $0 ("Indicative Pricing Feed" for options, IEX for stocks, websocket "Limited to 30 symbols", "200 API calls/min", options websocket "200 quotes"); Algo Trader Plus **$99/mo** ("OPRA Feed", "All US Exchanges", "Unlimited symbols", options websocket "1000 quotes"). Historical options "7+ years" on the marketing page but the docs say "Currently we only offer historical option data since February 2024" — [historical option data](https://docs.alpaca.markets/docs/historical-option-data) (accessed 2026-11-06). Indicative feed is "a free derivative of the original OPRA feed"; its trades are "delayed by 15 minutes". Basic historical options restricted to exclude the most recent window ("latest 15 minutes" vs "no restriction" on Plus — page wording).
- Streaming: feeds `indicative` or `opra`; "star subscription is not allowed for option quotes"; msgpack only — [real-time option data](https://docs.alpaca.markets/docs/real-time-option-data) (accessed 2026-11-06).
- SPX index level: not mentioned on any Alpaca page read (treat as not offered — UNVERIFIED negative). SPXW options symbols appear in examples (`SPXW240327P04925000`), so index options are in the OPRA feed.
- ES futures: no. Imbalances: no. Greeks/OI: snapshot endpoints not confirmed on pages read (UNVERIFIED).
- Cost: $0 or $99/mo; broker account not required for data-only (UNVERIFIED).

### 2.6 Interactive Brokers (TWS API / Web API)

- Mechanics: "requires network connectivity to a running instance" of TWS or IB Gateway; TWS accepts "up to fifty messages per second coming from the client side" — [TWS API introduction](https://interactivebrokers.github.io/tws-api/introduction.html) (accessed 2026-11-06). IBKR's current campus docs returned 403 to our fetcher.
- Market data fees: "market data is provided at the price we are charged by the exchange(s)"; subscriptions chosen in Client Portal — [IBKR Guides: Market Data Subscriptions](https://www.ibkrguides.com/clientportal/marketdatasubscriptions.htm) (accessed 2026-11-06). The fee table pages ([interactivebrokers.com market-data-pricing](https://www.interactivebrokers.com/en/pricing/market-data-pricing.php?p=mktDataPricing), [index.php?f=14193](https://www.interactivebrokers.com/en/index.php?f=14193), [.ie mirror](https://www.interactivebrokers.ie/en/index.php?f=37645)) all returned HTTP 403 today — **prices UNVERIFIED**.
- Third-party figures (not official, 2026 blog): OPRA top-of-book $1.50/mo non-pro; "US Securities Snapshot and Futures Value Bundle" $10/mo waived with $30+/mo commissions; $500 minimum equity to hold subscriptions — [dev.to article](https://dev.to/xqliu/interactive-brokers-market-data-subscription-which-one-do-i-actually-need-in-2026-164g) (accessed 2026-11-06, UNVERIFIED).
- Cboe Streaming Market Indexes / CME fees: UNVERIFIED.
- Historical: TWS API historical bars/ticks exist with pacing limits (specifics UNVERIFIED today). Imbalances: IBKR sells NASDAQ TotalView and NYSE Open Book subscriptions (named on the Guides page); whether NOII/imbalance fields are exposed through the API is UNVERIFIED.
- Cost: brokerage account + per-exchange fees; gateway must run locally.

### 2.7 tastytrade Open API (DXLink streamer)

- Scope: "A REST/JSON API for equities, options, futures, futures options, and cryptocurrency"; "Real-time and historical quotes, option chains with Greeks, and market metrics (IV rank, liquidity, beta)" — [developer.tastytrade.com](https://developer.tastytrade.com/) (accessed 2026-11-06).
- REST market data: `GET /market-data/by-type`; "The total number of symbols across all instrument-type parameters in one request is capped at 100"; `index` is a supported type with `SPX` as the example; "in production they return real-time quotes — there is no REST endpoint for delayed quotes"; endpoints "available to funded account holders"; sandbox "/market-data and /market-metrics return HTTP 502" — [market data concept](https://developer.tastytrade.com/docs/concepts/market-data/) (accessed 2026-11-06).
- Streaming: `GET /api-quote-tokens` → DXLink token ("API quote tokens expire after 24 hours"); event types "Quote, Trade, Summary, Greeks, TimeAndSale, Profile, and Candle"; "This is not a guarantee that every type is served to you"; must be a fully onboarded customer; keepalive within 60 s; sandbox observed `"level": "demo"` with a `/delayed` URL — [stream market data guide](https://developer.tastytrade.com/docs/guides/stream-market-data) (accessed 2026-11-06). Candle = "historical aggregate" (depth not stated — UNVERIFIED).
- Futures: symbols like `/ESZ2` ("E-mini S&P 500, December 2022") — [instruments & symbology](https://developer.tastytrade.com/docs/concepts/instruments-and-symbology/) (accessed 2026-11-06). So ES quotes stream via DXLink for a funded customer.
- Cost: not stated on the pages read; gated on being a funded customer (UNVERIFIED "free").
- Licence — [API Terms (PDF)](https://assets.tastyworks.com/production/documents/USA/open_api_terms_and_conditions.pdf) (accessed 2026-11-06, text extracted locally): "a personal, limited, non-exclusive, revocable (upon notice), non-transferable and non-sublicensable license"; you are "prohibited from distributing or making public all or any portion of Data in any way"; tastytrade "reserve[s] the right to introduce, change or amend any rules regarding your storage of Data (including the length, amount and format of storage permitted)" and you must "promptly and carefully delete any Data ... that does not comply". Data provided "AS IS".
- Imbalances: none. Timestamp precision: DXLink event times (UNVERIFIED resolution).

### 2.8 Cboe DataShop / LiveVol / Open-Close / Global Indices

- Product list: Option Quotes (interval summaries incl. NBBO with size), Option Trades, Option EOD Summary, Open-Close Volume Summary, Trade-by-Trade, Cboe Global Indices Feed, LiveVol Pro — [datashop.cboe.com](https://datashop.cboe.com/) (accessed 2026-11-06).
- **Option Quotes (intervals)** — [product page](https://datashop.cboe.com/option-quote-intervals) (accessed 2026-11-06): intervals 1, 5, 10, 15, 20, 30, 60, 390, 405 minutes; each snapshot includes "the National Best Bid and Offer (NBBO) quote and size" plus OHLC/volume; optional IV/Greeks/OI; history "from January 2012 to the present"; intraday delivery "delayed by 15 minutes after each snapshot"; underlying ^SPX bid/ask "provided only to customers with an active Cboe Global Indices Feed (CGIF) license" and CGIF licences "start at $1000/month"; price appears only in the cart (per-symbol/per-day price **UNVERIFIED**). Minimum interval is 1 minute — not sub-second.
- **Trade-by-Trade (TBT)** — [product page](https://datashop.cboe.com/enhanced-us-options-trade-by-trade-execution-detail) (accessed 2026-11-06): "full transaction-level detail for every executed options trade" on C1 (C2/BZX/EDGX "planned"); fields include NBBO and local BBO at execution, capacity, open/close indicators; history from 2019-10-07; T+1 SFTP; "External redistribution of this data is strictly prohibited" (Internal Use Only); sample file downloadable; price via SEC-filed "LiveVol Fees" (not shown — UNVERIFIED).
- **Open-Close Volume Summary** — [product page](https://datashop.cboe.com/cboe-options-open-close-volume-summary) (accessed 2026-11-06): customer/pro-customer/firm/MM buy-sell open-close volumes; C1 EOD from 2005-01-03, 10-minute from 2011-01-03, 1-minute from 2019-10-07; BZX/C2/EDGX from 2018/2019. Fees per the SEC-filed Cboe fee schedule dated January 27, 2026 (SR-CBOE-2026-011, "Livevol Fees") — [Exhibit 5 PDF](https://www.sec.gov/files/rules/sro/cboe/2026/34-104796-ex5.pdf) (accessed 2026-11-06, text extracted locally; column layout partly ambiguous): End-of-Day Open-Close "$600.00" (1–4 years, per month) / "$300.00" (5+ years, per month) / "$600.00" monthly subscription; Ten-Minute Intraday "$3,000 per month" and "$36,000 per year" with a "$1,000 per month" ad-hoc tier; One-Minute Intraday "$12,000 per month" / "$144,000 per year" with ad-hoc "$4,000 per month" and "$2,500 per month" tiers; academic discounts (EOD "$1,500 per year and $125 per month for each additional month"; 10-min "$3,000 per year for the first year"; 1-min "$12,000 per year for the first year"); "A free trial is available for up to 6 months of End-of-Day Open-Close Historical Data" (and likewise intraday) for first-time purchasers; external distribution of derived data $5,000–$7,500/mo.
- Academic discount on Option Quotes Intervals "50% of standard price" with "$500 minimum" — [datashopcert.livevol.com/academic-discount](https://datashopcert.livevol.com/academic-discount) (403 to our fetcher; search excerpt — UNVERIFIED).
- **Cboe Global Indices Feed (real-time SPX)**: direct, cloud or vendor delivery; "Get a custom pricing plan" — [accessing index data](https://www.cboe.com/us/indices/accessing-index-data/) (accessed 2026-11-06). For an individual, the realistic routes are vendors (Massive Indices Advanced $99, ThetaData Indices Standard/Pro, Databento DBIX.CORE $99, tastytrade/Tradier/Schwab brokerage feeds).
- Licence: DataShop products are "Internal Use Only" with SEC-filed fees; no personal/non-pro tier was visible (UNVERIFIED).

### 2.9 Closing-auction imbalance feeds (NYSE Imbalance, Nasdaq NOII) for individuals

- Nasdaq: NOII "is disseminated via the NASDAQ TotalView data feed, the NASDAQ Cross Net Order Imbalance Indicator (NOII) website, the NASDAQ Workstation and numerous market data distributors ... between 3:50 and 4:00 p.m., ET" — [Nasdaq Closing Cross fact sheet](https://www.nasdaqtrader.com/content/ProductsServices/Trading/Crosses/ccfactsheet.pdf); "TotalView also disseminates the Net Order Imbalance Indicator (NOII)"; individuals via "authorized Nasdaq market data distributors" and Nasdaq Data Link — [Nasdaq TotalView](https://www.nasdaq.com/solutions/nasdaq-totalview) (both accessed 2026-11-06). Individual pricing via Nasdaq Data Link: not published (UNVERIFIED).
- NYSE: Pillar Order Imbalances feed spec — [NYSE spec PDF](https://www.nyse.com/publicdocs/nyse/data/NYSE_Pillar_Order_Imbalances_Client_Specification.pdf) (accessed 2026-11-06). Retail-priced access: **Massive "NYSE Order Imbalances" $49/mo, individual use** (§2.1). Databento real-time requires Plus/Unlimited with NYSE fees "start[ing] at $1,000/month" (§2.2).
- Databento historical: XNAS.ITCH and XNYS.PILLAR `imbalance` schema, pay-per-GB (§2.2) — the cheapest way to *backtest* closing-auction imbalances.
- IBKR: TotalView/Open Book subscriptions exist; API exposure of imbalance fields UNVERIFIED.
- Schwab/Tradier/tastytrade/Alpaca: no imbalance feed documented.

### 2.10 Gamma / dealer-positioning specialists

| Vendor | Published price (accessed 2026-11-06) | API? | Notes |
|---|---|---|---|
| SpotGamma | Essential $99/mo; Alpha $299/mo (annual promo "$45/mo ... First year $534, then $891" and "$125/mo ... $1,494, then $2,691") — [spotgamma.com/pricing](https://spotgamma.com/pricing/) | No API on pricing page; support article (403 to us) reportedly says "A public API is not yet available", spreadsheet export from EquityHub — [support article](https://support.spotgamma.com/hc/en-us/articles/50266085426195-Does-SpotGamma-have-an-API-Can-I-export-data) (UNVERIFIED) | HIRO, TRACE (S&P 500 S/R + vol), Volatility Dashboard |
| Menthor Q | Premium "$59.00 / first month" then "$129 / next months"; Pro "$174.50" then "$349" — [menthorq.com/pricing](https://www.menthorq.com/pricing) | Not mentioned (platform integrations only) | Models/levels, community |
| Unusual Whales | Dashboard: Free; Retail Basic $50/mo ($42 annual); Pro $75 ($63); Max $120 ($102, "1 minute GEX Periscope", SPX MM exposure every 1 min vs 10) — [pricing](https://unusualwhales.com/pricing). **API**: Options Starter $99/mo (25,000 req/month, 1-yr lookback); Basic $150/mo (unlimited/day, 2-yr); Advanced $375/mo (adds WebSocket streaming) — [pricing?product=api](https://unusualwhales.com/pricing?product=api) | Yes; "All API plans include real-time data"; all list "1-minute SPX Market Maker Exposure", GEX, flow, darkpool | API plans "are data-only" |
| GEXBot | Pricing page is JS-rendered (only the title returned); search excerpt of [gexbot.com/pricing](https://www.gexbot.com/pricing): Classic $50, State $150, Orderflow $250, Quant $350 (WebSocket + 90-day history), Research $100 — UNVERIFIED | Yes: REST `https://api.gex.bot/v2` (`/SPX/classic/gex_full` etc.); Classic/State/Orderflow include REST; WebSocket needs Quant; `/hist/...` downloads; 90-day lookback — [OpenAPI repo](https://github.com/nfa-llc/gexbot-openapi), [docs.gexbot.com](https://docs.gexbot.com/) | GEX by OI refreshes daily 08:30 ET; spot/State/Orderflow during RTH |
| Tier1 Alpha | "Exclusively Distributed By" Hedgeye; "FREE FOR 30 DAYS"; no price printed — [tier1alpha.com](https://www.tier1alpha.com/), [Hedgeye MSR](https://insights.hedgeye.com/market-situation-report) — price UNVERIFIED | No | Daily newsletter + weekly webcast; dealer gamma, vol-control flows |
| OptionsDepth | Pro Max $249/mo or $2,499/yr; Pro $199/mo or $2,000/yr; TWI x OD combo $375/mo — [pricing](https://www.optionsdepth.com/pricing). API add-on "for Pro Max users": "Basic Plan — $99 for 6k API units", overage "$0.05 per unit" up to 10,000 — [FAQ](https://optionsdepth.com/faq) | Yes (units; WebSocket mentioned) — [api-unit](https://www.optionsdepth.com/api-unit) | "focuses on SPX and VIX options"; "exchange participant-tagged data such as CBOE"; "30 days intraday lookback"; 1-min snapshots |
| Volland (Wizard of Ops) | June 2024 user guide: Basic $150, Volland 3 $250, Volland 30 $400, Volland Live $1,000 per month (updates daily / 3x / 30-min / 5-min) — [VollandUserGuide_Jun24.pdf](https://vol.land/VollandUserGuide_Jun24.pdf) (dated; current pricing UNVERIFIED; vol.land is JS-rendered) | Not mentioned | Gamma/vanna/charm exposures, 0DTE widgets |

Assessment: for a terminal that already ingests the full SPX chain with OI and greeks, these are *views*, not data. The only ones worth considering as inputs are Unusual Whales API ($99–150) for 1-minute SPX MM exposure series and OptionsDepth ($249 + $99 units) for Cboe participant-tagged positioning, which cannot be reconstructed from OPRA alone (Open-Close data from Cboe DataShop is the raw equivalent at $600+/mo).

### 2.11 Cboe Global Indices real-time SPX feed — individual routes
- Direct CGIF: licensed, "custom pricing"; DataShop says CGIF licences "start at $1000/month" (§2.8).
- Vendor routes with explicit real-time SPX for individuals: Massive Indices Advanced $99/mo (Cboe Global Indices listed as a provider); ThetaData Indices Standard/Pro (CGIF-reported, real time; price UNVERIFIED); Databento DBIX.CORE $99/mo (personal, no licence); brokerage APIs (Schwab — have; tastytrade `index` type; Tradier "CBOE main list ... live values").

### 2.12 yfinance / Yahoo Finance
- Yahoo Terms (accessed 2026-11-06, [legal.yahoo.com](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)): prohibits "access or collect data ... from our Services using any automated means ... without our express, prior permission"; no use "for any commercial purpose"; no creating "any database, archive, mobile application, data feed, widget or any other aggregated data source" that substitutes for the Services; no reproduction/distribution without permission.
- yfinance README ([github.com/ranaroussi/yfinance](https://github.com/ranaroussi/yfinance), accessed 2026-11-06): "yfinance is not affiliated, endorsed, or vetted by Yahoo, Inc."; "intended for research and educational purposes"; "the Yahoo! finance API is intended for personal use only."
- Verdict: unsuitable as a dependency for anything persistent; options data there is delayed and unlicensed. Not recommended even for the MVP.

### 2.13 Free S&P 500 index minute-history sources (verified today)
- Cboe daily SPX close since 1975-01-02 (CSV) — [SPX_History.csv](https://cdn-api.cboe.com/api/global/us_indices/daily_prices/SPX_History.csv). Daily only.
- Cboe intraday 1-minute SPX bars with options volume — current session only (§1.2).
- Cboe SET (SPX settlement) daily history since 1998-07-09 — [_SET.json](https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_SET.json) (§1.2).
- FirstRate Data: free 1-minute samples for a two-week window ("21 Sep 2026 – 2 Oct 2026"), "No sign-up needed" — [free intraday data](https://firstratedata.com/free-intraday-data); paid SPX 1-minute dataset from 2-Jan-2008 (price shown only at checkout — UNVERIFIED; updates "$99.95" per year) — [SPX product page](https://firstratedata.com/i/index/SPX) (both accessed 2026-11-06).
- Alpha Vantage: `TIME_SERIES_INTRADAY` 1-min for stocks/ETFs (SPY) "25+ years of historical intraday OHLCV", month parameter back to 2000-01; the portion of the doc page we read labels it "This is a premium endpoint" and index APIs are daily/weekly/monthly only — [documentation](https://www.alphavantage.co/documentation/); free tier "25 API requests per day"; premium from $49.99/mo — [premium](https://www.alphavantage.co/premium/) (both accessed 2026-11-06). SPX itself is not intraday there.
- Databento with the $125 signup credit: GLBX.MDP3 ES `ohlcv-1m` from 2010 (catalog estimator showed "<$0.01" for a 31-day sample — [GLBX.MDP3](https://databento.com/catalog/cme/GLBX.MDP3)); DBIX.CORE SPX 1-s/1-m from 2025-12-07 (from $10/GB). Credits "expire 6 months after signup".
- Massive Indices Starter $49/mo: minute aggregates, "1+ year" history, 15-min delayed (§2.1). Not free but cheapest licensed SPX minute history with recency.
- ThetaData Indices Value: 1-minute SPX from 2023-01-01 (price UNVERIFIED).

### 2.14 Licence and storage comparison (what you may keep, and for how long)

All clauses quoted from the vendor pages cited in the sections above (accessed 2026-11-06).

| Vendor | Permitted use | Local storage of downloaded data | On cancellation / termination | Redistribution / sharing | Derived data |
|---|---|---|---|---|---|
| Cboe free JSON (website Terms) | "personal non-commercial use" of "one copy" | may not "store ... in an electronic retrieval system" without consent | n/a | no publishing/distribution without consent | no "derivative work (for example, a financial product, service or index)" |
| Massive (Individuals ToS + Market Data Terms) | "solely for your own personal, non-commercial, and non-business purposes"; Non-Professional = "solely for their own personal, non-business use" | flat files/downloads permitted "under your applicable entitlements" | "delete it promptly, and in any event within thirty (30) days"; backups until overwritten (≤90 days) | may not "Share, redistribute, publish, sell, sublicense or rebrand Information" | your results may be kept if they "do not contain Information and cannot reasonably be used to recreate it" |
| Databento | personal use on Standard ("Up to 2 devices"); historical needs no licence | no restriction found on pages read (User Agreement UNVERIFIED) | no deletion clause found (UNVERIFIED) | per-dataset pass-through; "Most of our datasets can be redistributed internally or externally after 24 hours" | not addressed on pages read |
| ThetaData (Subscriber Agreement) | "solely for Licensee's internal personal use purposes"; one individual | literal text bars copying ("copy, modify, or create derivative works of the Data") — confirm scope with vendor | "cease using and delete, destroy, or return all copies"; "expunged within 30 days of termination" | shall not "disclose, release, distribute, or deliver the Data"; OPRA: "shall not retransmit" | "Derived works ... cannot be redistributed before or after the time of termination" |
| tastytrade (API Terms PDF) | "personal, limited, non-exclusive, revocable ... license" | tastytrade "reserve[s] the right to introduce, change or amend any rules regarding your storage of Data" | delete Data that "does not comply with such storage rules" | "prohibited from distributing or making public all or any portion of Data" | processed data may not "be used as a substitute for Data" |
| Tradier | brokerage customer; API "included ... at no extra charge" | not addressed on pages read | not addressed | not addressed (standard brokerage terms, UNVERIFIED) | not addressed |
| Cboe DataShop | "Internal Use Only" | purchased files are yours to hold internally (agreement text not read — UNVERIFIED) | not read | "External redistribution of this data is strictly prohibited" | Open-Close derived-data external distribution priced separately ($5,000–$7,500/mo) |
| Yahoo (via yfinance) | no "commercial purpose"; no "automated means" collection | n/a — collection itself is the prohibited act | n/a | no reproduction/distribution | no competing "database, archive ... data feed" |

Practical conclusion: if the goal is an *owned* multi-year research archive, Databento's historical purchases (no subscription to lapse, no deletion clause found) are the safest; Massive and ThetaData both tie retention to an active subscription; the Cboe free JSON and Yahoo should never be archived.

---

## 3. Summary table

Legend: RT = real-time; D15 = 15-min delayed; ns/ms/s = timestamp precision; "—" = not offered; UNV = UNVERIFIED. Prices are monthly list prices read on 2026-11-06.

| Provider / plan | SPX index level | SPX/SPXW chain (quotes, trades, OI, greeks) | SPY options | Historical bid/ask depth | ES futures | Imbalance feeds | Timestamp | Streaming limits | Entitlement / licence | $/mo |
|---|---|---|---|---|---|---|---|---|---|---|
| Schwab Trader API (have) | RT (per brief) | RT chains+greeks; no history | RT | none | UNV | — | UNV | needs Accounts&Trading product | brokerage non-pro | $0 |
| Cboe delayed JSON (have) | D15 index + 1-min bars (today) | D15 full chain w/ bid/ask/size, IV, OI, vol, greeks | (same endpoint pattern, UNV for SPY) | none (daily SPX 1975+, SET 1998+) | — | — | 1-min bars; quotes unstamped | poll ~15 s+ | website Terms: personal, no retrieval-system storage | $0 |
| Massive Options Basic | — (Indices Basic excludes SPX) | EOD aggregates only | EOD | 2 yrs aggregates | Futures Basic 2 yrs | — | ns (REST) | no websocket; 5 calls/min | individual | $0 |
| Massive Options Starter | needs Indices Starter $49 (D15) | D15; RT greeks/IV, daily OI snapshots | yes | 2 yrs aggregates (no quotes/trades) | Starter $29 (10-min delayed) | $49 add-on | ms (WS) | 1 WS connection/cluster | individual; delete ≤30 d after plan ends | $29 (+$49 idx) |
| Massive Options Advanced | Indices Advanced $99 (RT) | RT quotes+trades, greeks, OI | yes | NBBO quotes from 2022-03-07; trades from 2014-06-02 | Advanced $199 RT | $49 add-on | ns REST / ms WS | 1,000 contracts per WS conn; 1 conn | same | $199 (+$99 idx) |
| Databento usage-based | DBIX.CORE from 2025-12-07 ($/GB) | OPRA.PILLAR: CMBP-1/TCBBO/CBBO-1s from 2023-03-28; trades/OHLCV/OI/CBBO-1m from 2013-04-01; no greeks | yes | every NBBO update, ns | GLBX.MDP3 from 2010-06-06 | XNAS.ITCH / XNYS.PILLAR imbalance (hist) | ns | n/a (historical) | no licence needed for historical; $125 credit | $0 + $/GB (UNV rate) |
| Databento Standard (per dataset) | DBIX.CORE $99 RT every 1 s, incl. SET/VRO | OPRA live + last 12 months L1 | yes | as above | GLBX $199 (CME personal licence incl., 2 devices) | live NYSE/NOII need Plus+ (≥$1,000 fees) | ns | live `skip` slow-reader | personal, up to 2 devices | $99–$199 each |
| ThetaData Options Value | Indices tier (price UNV) | 1-min quotes/OHLC/OI/IV/greeks from 2020-01-01; RT snapshots | yes | 1-min | — | — | ms | no streams | one individual; expunge ≤30 d after termination | $40 |
| ThetaData Options Standard | Indices Standard RT from 2022 (price UNV) | tick NBBO + trades from 2016-01-01; OI, IV, greeks | yes (SPY from 2020-01-01) | every OPRA NBBO, ms | — | — | ms | 10k quote / 15k trade contracts | same | $80 |
| ThetaData Options Pro | Indices Pro from 2017 (price UNV) | tick from 2012-06-01; 2nd/3rd-order greeks | yes | same | — | — | ms | 15k quotes / full trade stream | same | $160 |
| Tradier (brokerage) | RT if on "CBOE main list" (UNV) else D15 | RT L1 chains; ORATS greeks hourly | yes | tick 5 d; 1-min 20 d; no expired options | — | — | UNV | one session; unpublished symbol limits; 120 req/min | brokerage non-pro | $0 (+$50/yr inactivity) |
| Alpaca Free / Algo Trader Plus | — | Indicative (derived, trades D15) / OPRA RT | yes | since Feb 2024 | — | — | UNV | 200 / 1,000 option quote subs; 30 symbols on Free | UNV | $0 / $99 |
| Interactive Brokers | RT via Cboe index sub (price UNV) | RT via OPRA sub (≈$1.50 UNV) | yes | API historical with pacing (UNV) | CME sub (price UNV) | TotalView/OpenBook subs (API exposure UNV) | UNV | local TWS/Gateway required; 50 msg/s | brokerage non-pro; $500 equity (UNV) | fees at exchange cost (UNV) |
| tastytrade Open API | RT (`index` type, SPX) | RT quotes + Greeks events via DXLink | yes | Candle events (depth UNV) | RT (`/ES…`) | — | UNV | 100 symbols/REST call; DXLink limits UNV | funded customer; no redistribution; storage rules reserved | $0 (UNV) |
| Cboe DataShop Option Quotes | ^SPX bid/ask only with CGIF licence (≥$1,000/mo) | NBBO+size at 1-min+ intervals from Jan 2012; optional IV/greeks/OI | yes | 1-min minimum | — | — | 1-min | n/a | Internal Use Only; cart pricing (UNV) | UNV |
| Cboe DataShop TBT | — | every C1 trade with NBBO at execution from 2019-10-07 | yes | trade-level | — | — | trade ts | n/a | Internal Use Only | UNV |
| Cboe Open-Close | — | buy/sell open/close volume by capacity; EOD 2005+, 10-min 2011+, 1-min 2019-10+ | yes | n/a | — | — | 1-/10-min | n/a | SEC fee schedule | $600 EOD; $3,000 10-min; $12,000 1-min |
| Unusual Whales API | — | derived (flow, GEX, 1-min SPX MM exposure) | derived | 1–2 yrs lookback | — | — | 1-min | WS on Advanced | API ToS (UNV) | $99 / $150 / $375 |
| GEXBot API | — | derived GEX/State/Orderflow for SPX | derived | 90-day | — | — | 1 s (Classic) | WS on Quant | ToS (UNV) | $50–$350 (UNV) |
| OptionsDepth | — | participant-tagged SPX/VIX positioning | — | 30-day intraday | — | — | 1-min | WS mentioned | API for Pro Max | $249 + $99 units |

---

## 4. Execution-level backtest of 0DTE SPXW buying in the last 10 minutes

### 4.1 Requirements restated
1. SPXW 0DTE NBBO (bid/ask/size) at ≤1-second resolution for strikes near the money, 15:50–16:00 ET, for every trading day in the window (plus some 16:00–16:15 for the AM/PM session edge; SPXW regular session is 9:30 a.m.–4:15 p.m. ET but "Trading in SPXW options will ordinarily cease on the day of expiration, 4:00 pm ET" — [Cboe SPX specifications](https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/), accessed 2026-11-06).
2. SPX index value at 1-second resolution for the same window.
3. Official settlement values: SPXW (PM-settled) settles to the official closing SPX level (the daily close series); standard SPX AM-settled series use SET. (Settlement rules themselves were not printed on the specification page we read — rely on the SPX close CSV and SET JSON in §1.2, and DBIX.CORE's SET/VRO symbols.)
4. Ideally trades with NBBO-at-trade to calibrate fills (TCBBO / TBT).

### 4.2 Which datasets qualify

| Need | Qualifying product | Resolution | Coverage today | Cost (verified parts) |
|---|---|---|---|---|
| SPXW 0DTE NBBO ≤1 s | **Databento OPRA.PILLAR `cmbp-1`** (every NBBO update) filtered to parent `SPXW.OPT` and the expiry day | ns | 2023-03-28 → today (~3.6 yrs) | Standard $199/mo includes "Last 12 months" of L1; older months pay-per-GB (rate UNV; use estimator) |
| | Databento `cbbo-1s` (1-s sampled NBBO) | 1 s | 2023-03-28 → | same plan; far smaller |
| | **ThetaData Options Standard/Pro** quote history at `tick` / `1s` | ms | Standard 2016-01-01 →; Pro 2012-06-01 → | $80 / $160 per month for as many months as the download takes; data must be expunged within 30 days of cancelling |
| | Massive Options Advanced quotes REST / flat files | ns | 2022-03-07 → | $199/mo; delete within 30 days after plan ends |
| | Cboe DataShop Option Quotes | 1-min only | 2012 → | not sub-second: insufficient |
| Trades + NBBO at trade | Databento `tcbbo`; Cboe TBT (C1 only, capacity flags) | ns / trade | 2023-03-28 → ; 2019-10-07 → | Databento as above; TBT price UNV |
| SPX index 1 s | **ThetaData Index price history** (`tick`/`1s`; "price report every second") | ms | Standard 2022-01-01 →; Pro 2017-01-01 → (tier price UNV) | bundled? ("Symbols included are US Index & Stocks") — confirm |
| | Databento DBIX.CORE `trades`/`bbo-1s` | ms source | 2025-12-07 → only | $99/mo or from $10/GB |
| | Cboe DataShop Option Quotes with CGIF licence (^SPX bid/ask per interval) | 1-min | 2012 → | CGIF ≥ $1,000/mo — no |
| | Proxy: ES front-month from GLBX.MDP3 `mbp-1`/`bbo-1s` | ns | 2010-06-06 → | usage-based, cheap; $125 credit |
| Settlement values | Cboe free SPX close CSV (1975→) and SET JSON (1998→); DBIX.CORE SET/VRO (2025-12→) | daily | full | $0 |
| Open interest | Databento `statistics`; ThetaData OI history; Massive daily OI snapshots | daily | 2013 / 2012 / 2+ yrs | included |

### 4.3 Recommended procurement for a 2–3-year execution-level backtest
- **Primary**: Databento Standard for OPRA ($199/mo). Pull `cmbp-1` for `SPXW.OPT` restricted to each day's expiry (definition schema to resolve 0DTE instrument IDs) and to 15:45–16:15 ET. Data since 2023-03-28 gives ~3.6 years of true event-level NBBO. The last 12 months are inside the plan; months 13–43 are usage-based. Because OPRA CMBP-1 is "several terabytes of data per day" for the *full* dataset but SPXW near-the-money 0DTE strikes for 30 minutes are a tiny slice, the per-GB bill should be small — get the exact figure from `metadata.get_cost` before committing (rate UNVERIFIED). Add `tcbbo` for fill calibration and `statistics` for OI.
- **SPX index at 1 s before 2025-12-07**: ThetaData is the only retail-priced source read today that documents per-second SPX history back to 2017 (Pro) / 2022 (Standard). Alternatively accept ES as the index proxy from GLBX.MDP3 (usage-based, 2010→) and DBIX.CORE from Dec 2025 onward.
- **Alternative single-vendor route**: ThetaData Options Pro ($160/mo) + its Index history: tick NBBO from 2012 and SPX ticks from 2017, millisecond stamps; constraints are "Intervals less than 1m are available only for single-day requests" and multi-day pulls limited to one month with an expiration specified, so the download is one request per day per expiry (0DTE = one expiry per day — manageable). Legal constraint: expunge within 30 days of termination, so budget the subscription for the life of the research, not a one-off.
- **Rough cost for 3 years**: Databento route ≈ $199 × 3–6 months of subscription while extracting (or keep $199/mo for live), plus usage-based history for the 2023-03→2025-11 span (UNVERIFIED; expected to be tens of dollars for a strike-filtered 30-minute window — verify with the estimator). ThetaData route = $160/mo ongoing (or $80/mo if 2016+ suffices). Massive route = $199/mo but only 2022-03→ for quotes and no 1-s SPX history. Cboe DataShop Option Quotes is unsuitable (1-minute) and TBT pricing is not public.

### 4.3a Extraction recipes implied by the documentation read

These are parameter sketches derived from the vendor docs cited above; verify field names against the live API reference before coding.

Databento (OPRA.PILLAR) — per [symbology doc](https://databento.com/docs/standards-and-conventions/symbology) and [OPRA.PILLAR docs](https://databento.com/docs/venues-and-datasets/opra-pillar):
- `dataset=OPRA.PILLAR`, `schema=definition`, `stype_in=parent`, `symbols=SPXW.OPT`, one day → list instrument IDs whose `expiration` equals that date (expirations are "date-only and set at UTC midnight").
- `schema=cmbp-1` (or `cbbo-1s` for a 1-second sampled NBBO) with `stype_in=parent`, `symbols=SPXW.OPT`, `start`/`end` bounded to 19:45–20:20 UTC (15:45–16:20 ET) for that day; filter to the 0DTE instrument IDs and to strikes within ±N points of the SPX level (from DBIX.CORE or ThetaData index history).
- `schema=tcbbo` for fills with NBBO at the trade; `schema=statistics` for OI; `schema=ohlcv-1m` for cheap sanity checks.
- Use batch downloads for CMBP-1 (docs: "Historical CMBP-1 requests are large, so the page recommends batch downloads") and call `metadata.get_cost` first (FAQ: estimates in portal; "There is no monthly subscription fee for usage-based historical data").
- Caveats: "Live and historical `instrument_id` mappings differ"; "Databento publishes no BBO records for regional quotes"; pre-2023-03-28 data is subsampled and lacks `cmbp-1`/`cbbo-1s`/`tcbbo`.

ThetaData (v3 REST via local Theta Terminal) — per [option quote history](https://thetadata.net/docs/operations/option_history_quote.html) and [index price history](https://thetadata.net/docs/operations/index_history_price.html):
- `/v3/option/history/quote` with `interval=tick` (or `1s`), root `SPXW`, `expiration=<same day>`, single day per request ("Intervals less than 1m are available only for single-day requests"), optionally restricted by strike/right; response has `bid_size, bid_exchange, bid, bid_condition, ask_size, ask_exchange, ask, ask_condition`, millisecond `timestamp`.
- `/v3/index/history/price` with `interval=1s` or `tick` for `SPX` the same day ("Exchanges typically generate a price report every second").
- Concurrency 4 (Standard) / 8 (Pro) parallel requests; plan for roughly one request per trading day per data type (≈250/yr).
- Greeks/IV/OI history endpoints exist if you prefer vendor greeks to your own.

Massive (Options Advanced) — per [quotes endpoint](https://massive.com/docs/rest/options/trades-quotes/quotes.md):
- `GET /v3/quotes/{optionsTicker}` per contract with `timestamp.gte/lte` bounds, `limit=50000`, follow `next_url`; `sip_timestamp` nanoseconds; only from 2022-03-07. Contract enumeration via the chain snapshot (`I:SPX` prefix for greeks). Flat files (S3) are listed for Starter and up; whether quote flat files require Advanced was not confirmed (UNVERIFIED).

### 4.3b Volume and cost-control notes
- The full OPRA CMBP-1 feed is "several terabytes of data per day" (Databento). A 30-minute window of SPXW 0DTE strikes near the money is a small fraction, but 0DTE SPXW is among the most actively quoted products, so expect tens to hundreds of MB per day at event level; pull `cbbo-1s` (≈1 row/second/contract) first and escalate to `cmbp-1` only for days you need.
- Databento meters "uncompressed size in binary encoding"; request DBN, not CSV, to minimise transfer, and bound `start/end` tightly.
- ThetaData's per-request model has no per-GB cost; the cost is wall-clock (4–8 concurrent requests) and the ongoing subscription.
- Massive REST paging at 50,000 rows per call is adequate for a 30-minute window per contract but slow for whole chains; prefer flat files if available on the plan.

### 4.4 Free / academic / sample datasets
- Databento: "$125 in free credits" on signup, usable on any dataset including OPRA.PILLAR and DBIX.CORE; expire after 6 months — [pricing](https://databento.com/pricing), [FAQ](https://databento.com/docs/faqs/usage-pricing-and-data-credits) (accessed 2026-11-06). Enough to prototype the SPXW 0DTE extraction for a handful of days.
- Cboe DataShop: "Download sample" links on Option Quotes, TBT and Open-Close product pages (§2.8); Open-Close "free trial ... for up to 6 months" of historical EOD and intraday data for first-time purchasers per the fee schedule; academic Open-Close rates ($1,500/yr EOD; $3,000 first year 10-min; $12,000 first year 1-min); academic 50% on Option Quotes Intervals (UNVERIFIED).
- ThetaData FREE tier: EOD options data from 2023-06-01, 1-day delayed, ~20–30 req/min — [Subscriptions doc](https://thetadata.net/docs/Articles/Getting-Started/Subscriptions.html) (accessed 2026-11-06).
- FirstRate Data: two-week 1-minute samples for SPX/SPY, no sign-up (§2.13).
- Cboe free series: SPX daily close (1975→), SET daily (1998→), today's 1-minute SPX bars (§1.2).
- OptionMetrics (IvyDB): "Complete historical end-of-day data, from 1996 onward for US equity and index options"; sold to "Institutional Investors", "Risk Managers", "Academic Researchers"; no individual pricing — [optionmetrics.com](https://optionmetrics.com/) (accessed 2026-11-06). End-of-day only; irrelevant for last-10-minute execution work.

### 4.5 Decision guide

- Need only *live* SPX/SPY chains with greeks for a display terminal → already covered (Schwab + Cboe JSON); spend $0.
- Need delayed full-chain snapshots with greeks/OI on a websocket and a licence that allows caching → Massive Options Starter $29 (+ Indices Starter $49 for delayed SPX).
- Need *historical* tick NBBO back to 2016/2012 for research, don't mind a running local terminal, and accept subscription-tied retention → ThetaData Options Standard $80 / Pro $160.
- Need an *owned* archive of event-level NBBO with nanosecond stamps, plus SET/VRO settlement symbols and 1-second SPX going forward → Databento (usage-based now; Standard $199 if you also want live), plus DBIX.CORE $99.
- Need ES futures live for free → tastytrade DXLink (funded account) ; need ES history → Databento GLBX.MDP3 usage-based.
- Need closing-auction imbalances live at retail prices → Massive NYSE Order Imbalances $49; for Nasdaq NOII history → Databento XNAS.ITCH `imbalance`.
- Want a vendor-computed dealer-positioning series via API → Unusual Whales API ($99–$150) or OptionsDepth ($249 + $99 units); otherwise compute GEX from the chain you already hold.
- Avoid: archiving the Cboe JSON, yfinance, Alpha Vantage for SPX intraday (not offered), Cboe DataShop 1-minute quotes for sub-minute execution studies.

### 4.6 Risks and assumptions
- Vendor prices and tiers change frequently; every figure above is a 2026-11-06 reading of the cited page.
- Several official pages (IBKR fees, Schwab developer portal, SpotGamma support, DataShop academic page) blocked automated access; those items are UNVERIFIED by design, not estimated.
- OPRA "non-professional" status is self-declared at each vendor; using data in connection with any business, advisory or registered activity voids personal-use pricing (Massive Market Data Terms; ThetaData OPRA exhibit).
- Two vendors (Massive, ThetaData) require deletion of raw data within 30 days of ending the subscription; budget for continuity if the archive matters.
- Cboe free endpoints are undocumented conveniences behind a CDN; they redirect (`cdn.cboe.com` → `cdn-api.cboe.com`) and could change or be rate-limited without notice.
- SET vs. close: SPXW is PM-settled to the SPX close, standard SPX to SET; the free SET JSON values should be cross-checked against Cboe's settlement-values pages before use in P&L (the spec page read today did not print settlement rules — UNVERIFIED from that page).

### 4.7 Source index (all accessed 2026-11-06)

- Massive: [pricing](https://massive.com/pricing) · [options](https://massive.com/options) · [indices](https://massive.com/indices) · [futures](https://massive.com/futures) · [NYSE order imbalances](https://massive.com/pricing?product=nyse-order-imbalances) · [business options](https://massive.com/business-options) · [quotes endpoint](https://massive.com/docs/rest/options/trades-quotes/quotes.md) · [trades endpoint](https://massive.com/docs/rest/options/trades-quotes/trades.md) · [options overview](https://massive.com/docs/rest/options/overview) · [WS options quotes](https://massive.com/docs/websocket/options/quotes) · [WS connections KB](https://massive.com/knowledge-base/article/how-many-massive-websocket-connections-can-i-use-at-one-time) · [Terms index](https://massive.com/terms) · [Individuals ToS](https://massive.com/legal/individuals-terms-of-service) · [Market Data Terms](https://massive.com/legal/market-data-terms-of-service)
- Databento: [pricing](https://databento.com/pricing) · [OPRA.PILLAR catalog](https://databento.com/catalog/opra/OPRA.PILLAR) · [OPRA.PILLAR docs](https://databento.com/docs/venues-and-datasets/opra-pillar) · [OPRA improvements blog](https://databento.com/blog/opra-improvements-coming-soon) · [GLBX.MDP3](https://databento.com/catalog/cme/GLBX.MDP3) · [DBIX.CORE](https://databento.com/catalog/dbix/DBIX.CORE) · [Core Indices blog](https://databento.com/blog/databento-core-indices) · [XNAS.ITCH docs](https://databento.com/docs/venues-and-datasets/xnas-itch) · [XNAS.ITCH dataset](https://databento.com/datasets/XNAS.ITCH) · [imbalance schema](https://databento.com/docs/schemas-and-data-formats/imbalance) · [NYSE imbalance blog](https://databento.com/blog/NYSE-imbalance-feeds) · [live data licensing](https://databento.com/docs/portal/live-data) · [usage pricing FAQ](https://databento.com/docs/faqs/usage-pricing-and-data-credits) · [symbology](https://databento.com/docs/standards-and-conventions/symbology) · [user agreement (JS, unread)](https://databento.com/legal/user-agreement)
- ThetaData: [pricing](https://www.thetadata.net/pricing) · [home](https://www.thetadata.net/) · [Getting Started](https://thetadata.net/docs/Articles/Getting-Started/Getting-Started.html) · [Subscriptions](https://thetadata.net/docs/Articles/Getting-Started/Subscriptions.html) · [option quote history](https://thetadata.net/docs/operations/option_history_quote.html) · [index price history](https://thetadata.net/docs/operations/index_history_price.html) · [subscriber agreement](https://www.thetadata.net/subscriber-agreement)
- Tradier: [market data](https://docs.tradier.com/docs/market-data) · [rate limits](https://docs.tradier.com/docs/rate-limits) · [llms.txt full docs](https://docs.tradier.com/llms.txt) · [pricing](https://tradier.com/pricing)
- Alpaca: [data plans](https://alpaca.markets/data) · [about market data API](https://docs.alpaca.markets/docs/about-market-data-api) · [historical option data](https://docs.alpaca.markets/docs/historical-option-data) · [real-time option data](https://docs.alpaca.markets/docs/real-time-option-data)
- Interactive Brokers: [TWS API intro](https://interactivebrokers.github.io/tws-api/introduction.html) · [market data subscriptions guide](https://www.ibkrguides.com/clientportal/marketdatasubscriptions.htm) · fee pages (403): [market-data-pricing](https://www.interactivebrokers.com/en/pricing/market-data-pricing.php?p=mktDataPricing), [f=14193](https://www.interactivebrokers.com/en/index.php?f=14193) · third-party [dev.to 2026](https://dev.to/xqliu/interactive-brokers-market-data-subscription-which-one-do-i-actually-need-in-2026-164g)
- tastytrade: [developer home](https://developer.tastytrade.com/) · [docs](https://developer.tastytrade.com/docs/) · [market data concept](https://developer.tastytrade.com/docs/concepts/market-data/) · [stream market data](https://developer.tastytrade.com/docs/guides/stream-market-data) · [instruments & symbology](https://developer.tastytrade.com/docs/concepts/instruments-and-symbology/) · [sandbox](https://developer.tastytrade.com/docs/sandbox/) · [API Terms PDF](https://assets.tastyworks.com/production/documents/USA/open_api_terms_and_conditions.pdf)
- Cboe: [terms](https://www.cboe.com/terms) · [use of content](https://www.cboe.com/use-of-content) · [disclaimers](https://www.cboe.com/global-disclaimers/) · [legal index](https://www.cboe.com/legal/) · [accessing index data](https://www.cboe.com/us/indices/accessing-index-data/) · [index settlement values](https://www.cboe.com/index_settlement_values/) · [SPX specifications](https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/) · [SPX_History.csv](https://cdn-api.cboe.com/api/global/us_indices/daily_prices/SPX_History.csv) · [delayed options JSON](https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json) · [intraday JSON](https://cdn.cboe.com/api/global/delayed_quotes/charts/intraday/_SPX.json) · [SET history JSON](https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_SET.json)
- Cboe DataShop: [home](https://datashop.cboe.com/) · [Option Quotes intervals](https://datashop.cboe.com/option-quote-intervals) · [Trade-by-Trade](https://datashop.cboe.com/enhanced-us-options-trade-by-trade-execution-detail) · [Open-Close](https://datashop.cboe.com/cboe-options-open-close-volume-summary) · [fee schedule exhibit (SR-CBOE-2026-011)](https://www.sec.gov/files/rules/sro/cboe/2026/34-104796-ex5.pdf) · [academic discount (403)](https://datashopcert.livevol.com/academic-discount)
- Imbalances: [Nasdaq closing cross fact sheet](https://www.nasdaqtrader.com/content/ProductsServices/Trading/Crosses/ccfactsheet.pdf) · [Nasdaq TotalView](https://www.nasdaq.com/solutions/nasdaq-totalview) · [NYSE Pillar Order Imbalances spec](https://www.nyse.com/publicdocs/nyse/data/NYSE_Pillar_Order_Imbalances_Client_Specification.pdf)
- Positioning vendors: [SpotGamma pricing](https://spotgamma.com/pricing/) · [SpotGamma API support (403)](https://support.spotgamma.com/hc/en-us/articles/50266085426195-Does-SpotGamma-have-an-API-Can-I-export-data) · [Menthor Q pricing](https://www.menthorq.com/pricing) · [Unusual Whales pricing](https://unusualwhales.com/pricing) · [Unusual Whales API pricing](https://unusualwhales.com/pricing?product=api) · [GEXBot pricing (JS)](https://www.gexbot.com/pricing) · [GEXBot OpenAPI](https://github.com/nfa-llc/gexbot-openapi) · [GEXBot docs](https://docs.gexbot.com/) · [Tier1 Alpha](https://www.tier1alpha.com/) · [Hedgeye MSR](https://insights.hedgeye.com/market-situation-report) · [OptionsDepth pricing](https://www.optionsdepth.com/pricing) · [OptionsDepth FAQ](https://optionsdepth.com/faq) · [OptionsDepth API unit](https://www.optionsdepth.com/api-unit) · [Volland user guide Jun 2024](https://vol.land/VollandUserGuide_Jun24.pdf)
- Free/other: [Yahoo Terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) · [yfinance README](https://github.com/ranaroussi/yfinance) · [FirstRate free intraday](https://firstratedata.com/free-intraday-data) · [FirstRate SPX](https://firstratedata.com/i/index/SPX) · [Alpha Vantage docs](https://www.alphavantage.co/documentation/) · [Alpha Vantage premium](https://www.alphavantage.co/premium/) · [OptionMetrics](https://optionmetrics.com/)

### 4.8 Items left UNVERIFIED (and how to close them)
1. Interactive Brokers non-pro fees for OPRA, Cboe Streaming Market Indexes, CME: log in to Client Portal → Market Data Subscriptions (official pages blocked automated fetch).
2. ThetaData Indices/Stocks tier prices and whether the Options tiers bundle index access ("Symbols included are US Index & Stocks"): confirm on the pricing page's Indices tab in a browser or by email.
3. Databento per-GB rate for OPRA.PILLAR CMBP-1/TCBBO and the User Agreement's storage/redistribution text: use the portal estimator / `metadata.get_cost` and read the agreement in a browser.
4. Cboe DataShop Option Quotes and TBT prices: visible only in the cart after selecting symbols/dates.
5. GEXBot and Volland current prices (JS-rendered pages; figures above are from a search excerpt and a 2024 PDF).
6. SpotGamma API status (support article blocked; competitor claims conflict with SpotGamma's own statement that no public API exists).
7. tastytrade: whether DXLink carries SPX index ticks and Candle history depth; cost is not stated beyond "funded account holders".
8. Nasdaq NOII real-time for individuals (Nasdaq Data Link pricing not published; Databento live-data page lists Nasdaq as "Commercial only" while also showing per-user fees).
9. Whether Databento's $199 Standard plan is per dataset family (table reads that way) or pooled.
10. Alpaca SPX index availability (no page read mentions it) and non-pro process.

---

## 5. Minimum viable stack (zero/low cost)

Target: $0/month in data fees; everything licensed for personal non-commercial use; no scraping of unlicensed sites.

1. **Live SPX/SPY quotes, chains, greeks, minute bars** — Schwab Trader API Market Data (have). Add the "Accounts and Trading" product if you want streaming instead of polling (per brief).
2. **Live-ish full SPX chain with OI/IV/greeks for display** — Cboe delayed JSON (have). Poll no faster than the CDN's 5-second `s-maxage`; keep it as a display cache, not a persistent archive, per cboe.com Terms (§1.2).
3. **Free SPX reference series** — Cboe daily close CSV (1975→) and SET JSON (1998→) for settlement reconciliation (§1.2).
4. **ES futures and a second real-time SPX source** — tastytrade Open API/DXLink if you hold (or open) a funded tastytrade account: `index` SPX, `/ES` futures, option Quote/Greeks events, REST 100 symbols/call; data must not be redistributed and storage rules may be imposed (§2.7). Alternative: Tradier Lite ($0; ORATS greeks hourly; indexes on the Cboe main list are live) — mind the $50/yr inactivity fee (§2.4).
5. **Historical prototyping at $0** — Databento $125 signup credit: ES `ohlcv-1m`/`bbo-1s` from GLBX.MDP3 (2010→), SPX from DBIX.CORE (2025-12→), and a few days of SPXW 0DTE `cmbp-1`/`tcbbo` from OPRA.PILLAR (2023-03-28→) to validate the backtest pipeline before paying (§2.2, §4.4).
6. **Optional $0 extras** — Massive Options Basic (EOD option aggregates, 2 yrs, 5 calls/min, no websocket) and ThetaData FREE (EOD options from 2023-06, Theta Terminal required). Low value given item 2.
7. **Low-cost upgrade within this tier (≤$100/mo)**: ThetaData Options Standard $80/mo (tick NBBO 2016→, OI/IV/greeks history, 10k-contract quote stream) is the single most useful paid add-on; or Massive Options Starter $29 + Indices Starter $49 if you only need 15-min-delayed snapshots with greeks/OI and websockets.

Explicitly excluded: yfinance/Yahoo (automated access prohibited by Yahoo Terms, §2.12); persistent archiving of the Cboe delayed JSON (§1.2).

---

## 6. Upgraded stack

Target: full real-time options NBBO with an owned research archive, 1-second index, ES, imbalances, and one positioning feed. All individual/personal-use tiers.

| Component | Choice | $/mo | Why |
|---|---|---|---|
| Options NBBO/trades live + archive | **Databento OPRA.PILLAR Standard** ($199; live CMBP-1 + last 12 months L1; usage-based for 2023-03→) | 199 | Nanosecond event-level NBBO; no delete-on-cancel clause found; parent symbology `SPXW.OPT`; OI via statistics. Licence fee for live OPRA personal use is $1.25/device pass-through (Standard says fees included). |
| Alternative to the above | ThetaData Options Pro ($160; tick 2012→; greeks/IV/OI history; full trade stream) | 160 | Deeper history and built-in greeks; Theta Terminal must run; 30-day expunge on termination. Pick one of the two, not both, unless you need pre-2023 ticks (Theta) *and* an owned archive (Databento). |
| SPX index 1-s live + SET/VRO | Databento DBIX.CORE Standard ($99) — or Massive Indices Advanced ($99 RT) if you prefer REST/flat files | 99 | DBIX gives settlement symbols and 1-s SPX; history only from 2025-12-07. ThetaData Indices tier covers 2017→ (price UNV). |
| ES futures | Databento GLBX.MDP3 Standard ($199, CME personal licence incl., 2 devices) — or tastytrade DXLink ($0) / Massive Futures Starter ($29, 10-min delayed) | 0–199 | Only needed at $199 if you want ES L2/L1 history and licensed live ticks; DXLink suffices for live display. |
| Closing-auction imbalances | Massive "NYSE Order Imbalances" ($49, individual) + Databento XNAS.ITCH `imbalance` usage-based for Nasdaq NOII history | 49 + $/GB | Only retail-priced real-time imbalance product found; NOII real-time for individuals is licence-gated/UNVERIFIED. |
| Dealer-positioning overlay (optional) | Unusual Whales API Basic ($150; 1-min SPX MM exposure, GEX, flow) or OptionsDepth Pro Max + API units ($249 + $99) | 150–348 | Only if you want a vendor-computed series to compare against your own GEX from the chain you already ingest. |
| Brokerage feeds | Schwab (have) + tastytrade (free) as redundancy | 0 | Cross-check live quotes; DXLink Greeks events. |

Indicative total: ~$350/mo (Databento OPRA + DBIX + Massive imbalances) to ~$900/mo with ES history and a positioning API. Cboe DataShop Open-Close (from $600/mo EOD; $3,000/mo 10-min) is the only way to get participant-capacity flow directly from the exchange and is not recommended for a single-user terminal.

Budget scenarios (list prices read 2026-11-06; annual discounts not applied):

| Scenario | Line items | $/mo |
|---|---|---|
| A. Research-first, no archive | ThetaData Options Standard $80 + Schwab/Cboe/tastytrade $0 | 80 |
| B. Research-first, deep history | ThetaData Options Pro $160 + Massive Indices Starter $49 (delayed SPX minute history) | 209 |
| C. Owned archive + live | Databento OPRA Standard $199 + DBIX.CORE $99 + Massive NYSE imbalances $49 | 347 |
| D. C plus futures history and positioning API | C + Databento GLBX.MDP3 Standard $199 + Unusual Whales API Basic $150 | 696 |
| E. Everything in D plus a second options history vendor | D + ThetaData Options Pro $160 | 856 |

Scenario C is the recommended upgrade: it is the only combination that yields nanosecond NBBO you may keep, SET/VRO settlement symbols, 1-second SPX going forward, and a retail-priced imbalance feed, while staying on personal-use licences.

---

## 7. What each option would need from the user (account, approval, purchase)

| Option | Account | Declarations / approvals | Purchase / payment | Local footprint |
|---|---|---|---|---|
| Schwab Trader API (have) | Schwab brokerage + developer app | brokerage non-pro status (existing) | none; optionally add "Accounts and Trading" product for streaming | none |
| Cboe delayed JSON (have) | none | accept cboe.com website Terms (personal, non-commercial, no retrieval-system storage) | none | none |
| Massive Options Starter/Advanced; Indices; Futures; NYSE Imbalances | massive.com account (individual) | agree Individuals ToS + Market Data Terms; Non-Professional attestation and OPRA personal-use addendum; "Individual use only" plans | card; $29/$79/$199 options, $49/$99 indices, $29–$199 futures, $49 imbalances; annual −20% | none (REST/WS/S3 flat files); must delete Information within 30 days of plan end |
| Databento usage-based | databento.com account | none for historical ("A license isn't required to access historical data"); $125 credit auto-applied | pay-as-you-go per GB (estimate first); card | none |
| Databento Standard (OPRA / DBIX / GLBX) | same | live-data questionnaire per dataset (display vs non-display; personal use; up to 2 devices); OPRA personal licence $1.25/device pass-through (Standard "No license fees"); CME personal "Included with Standard plan" | $199/mo per dataset ($99 DBIX); 2.9% card fee on licence fees | optional: run client on ≤2 devices |
| ThetaData Options Value/Standard/Pro (+Indices) | thetadata.net account | accept Subscriber Agreement (internal personal use; one individual; OPRA exhibit; 30-day expunge on termination) | $40/$80/$160 monthly; Indices tier price to confirm | **Theta Terminal (Java) must run locally**; no VPN/sharing |
| Tradier | Tradier brokerage account (Lite $0) | brokerage onboarding, non-pro market-data declaration | $0; $50/yr inactivity if <2 trades | none |
| Alpaca Algo Trader Plus | Alpaca account (paper OK per page) | non-pro declaration (UNV) | $99/mo | none |
| Interactive Brokers | IBKR brokerage account (≥$500 equity per third-party source, UNV) | non-pro market-data subscriber agreements per exchange (OPRA, Cboe indexes, CME) | per-exchange monthly fees at exchange cost (amounts UNV; official page 403) | **TWS or IB Gateway running locally**; or Web API (UNV) |
| tastytrade Open API | funded tastytrade account; register OAuth app | accept API Terms (PDF): personal licence, no redistribution, storage rules at tastytrade's discretion | none stated | none (DXLink websocket) |
| Cboe DataShop (Option Quotes / TBT / Open-Close) | DataShop account | LiveVol Historical Market Data Subscriber Agreement (Internal Use Only); SFTP/Snowflake delivery | cart-priced (Option Quotes: per-symbol/day, UNV); Open-Close from $600/mo EOD, $3,000/mo 10-min, $12,000/mo 1-min; academic rates; 6-month free trial for first-time Open-Close buyers | SFTP client |
| Cboe Global Indices Feed (direct) | licensing request via Cboe | commercial licence agreement; "custom pricing" (≥$1,000/mo per DataShop) | not recommended | feed handler |
| Unusual Whales API | UW account | API ToS (UNV) | $99/$150/$375 monthly; 1-week trial on monthly API plans | none |
| GEXBot | gexbot.com account | ToS (UNV) | $50–$350 monthly (UNV, page JS-rendered) | none |
| OptionsDepth | account; Pro Max tier | ToS (UNV) | $249/mo + $99 per 6k API units | none |
| SpotGamma / Menthor Q / Tier1 Alpha / Volland | accounts | ToS | $99–$299 / $129–$349 / UNV / $150–$1,000 (dated) | none; no API |
| FirstRate Data | none for samples; account for purchase | licence page (not read) | SPX 1-min dataset: checkout price UNV; $99.95/yr updates | none |
| Alpha Vantage | free key | ToS | free 25 req/day; premium from $49.99/mo | none |
