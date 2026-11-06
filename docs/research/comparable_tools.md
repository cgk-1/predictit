# Comparable tools survey: SPX/SPY intraday 0DTE decision terminals

Prepared 2026-11-06. All URLs were accessed on 2026-11-06 unless a different date is noted inline. Abbreviation used throughout: `(acc. 2026-11-06)`.

Scope: what comparable commercial dashboards, open-source repos, research sites and platform features do, and which of their ideas are worth adopting in a private SPX/SPY intraday options terminal whose current features are: multi-timeframe price/vol features, GEX with explicit dealer-sign assumptions, NYSE TICK + cross-index confirmation, a transparent adaptive indicator ensemble, nine setup families with explicit invalidation/exit, execution-aware contract ranking under a $200 premium budget, a 15:50-16:00 SPX 0DTE strike-flip module, paper positions, an immutable decision ledger, replay and self-grading.

Method and honesty notes:
- Sources were fetched with a text fetcher. Several vendor sites are JavaScript-rendered and returned only a title (gexbot.com, vol.land); for those, facts come from third-party pages and are marked as such.
- Several hosts refused the fetcher (HTTP 403): papers.ssrn.com, benzinga.com, theocc.com batch page, trendspider.com, gammaedge.kit.com, support.spotgamma.com (403/503). c.0-dte.com did not resolve from this session's network. Claims that depend on those pages are marked UNVERIFIED.
- A large share of "reviews" of SpotGamma, Unusual Whales and MenthorQ found in search are written by a competing vendor (FlashAlpha) or by affiliate sites. They are cited where they contain checkable facts and flagged as competitor-authored.
- Nothing below is an endorsement of any claimed trading rule. Rules are summarised as claimed.

---

## 1. Positioning / GEX dashboards

### 1.1 SpotGamma
- What it shows: premarket "Founder's Note" with S&P support/resistance from options data; HIRO (cumulative real-time dealer hedging pressure across the US options market); TRACE (SPX gamma heat-map, 1-minute market-maker position updates, labelled "Gamma Vacuums" and "Gamma Pins"); a "Stability Gauge" (claimed likelihood of a large move in the next 10 minutes); a 0DTE strike plot (volume vs OI by strike); Net OI by strike. Source: https://spotgamma.com/?p=19710 (acc. 2026-11-06); https://ninjatraderecosystem.com/article/three-steps-to-better-trade-the-sp-500 (dated 2025-09-03, acc. 2026-11-06).
- Direction/levels presentation: GEX framed as "a volatility-regime map, not a forecast of direction"; walls as magnets or breakout triggers. Source: https://spotgamma.com/0dte (acc. 2026-11-06).
- Data sources: not disclosed on the pages fetched. Volume stats cite Cboe (0DTE ~20% of SPX volume in 2020, >50% in 2024, "approached 63%" in Feb 2026). Source: https://spotgamma.com/0dte (acc. 2026-11-06).
- Pricing: inconsistent across SpotGamma's own pages. Sales page: Standard $89/mo ($67/mo annual), Pro $129/mo, Alpha $299/mo ($224/mo annual), Institutional from $1,999/mo; support page: Essential $99/mo, Alpha $299/mo. HIRO and TRACE are Alpha-only. Source (competitor-authored, dated 2026-07-27, updated 2026-09-17): https://flashalpha.com/articles/spotgamma-review-2026-pricing-features-alternatives (acc. 2026-11-06); SpotGamma plan page https://spotgamma.com/membership/ (acc. 2026-11-06, via search snippet).
- API: SpotGamma support states no public API; only an EquityHub current-data download. Source: same FlashAlpha review (competitor-authored) (acc. 2026-11-06).
- Integrations ("Cloud Notes" levels drawn on charts): Bookmap, NinjaTrader, Jigsaw, eSignal, Sierra Chart, TradingView, EdgePro, thinkorswim. Source: https://support.spotgamma.com/hc/en-us/articles/15297419607571-Cloud-Notes (acc. 2026-11-06 via search snippet; direct fetch returned 403). Bookmap levels are labelled in SPX terms but plotted at the equivalent ES price with a daily basis adjustment. Source: https://support.spotgamma.com/hc/en-us/articles/1500006926242 (acc. 2026-11-06 via search snippet; direct fetch 503).
- Praise/complaints found: competitor review says strength = finished visual workspace; weaknesses = no API, hard-to-pin pricing, HIRO/TRACE gated to top tier. No independent forum reviews were retrieved. UNVERIFIED beyond that.

### 1.2 MenthorQ
- What it shows: gamma levels ("pin, stall or break"), gamma walls, put support / call resistance, 0DTE-only levels, "Blind Spot Levels" (thin liquidity zones), 1-Day Expected Move (1D Min/Max), Net GEX, DEX surface, Q-Score (proprietary "safe / fragile / dangerous" standing), volatility score, a matrix of gamma/delta/OI by expiration, screeners of largest gamma changes, and "QUIN", a conversational assistant for the morning briefing. Sources: https://menthorq.com/academy/how-to-trade-volatility/lessons/menthorq-models-for-spx-0dtes-trading/ (acc. 2026-11-06); https://menthorq.com/guide/how-quin-empowers-your-spx-morning-analysis/ (acc. 2026-11-06).
- Update cadence: 14 intraday snapshots per day (every 30 min). Source: MenthorQ 0DTE lesson above (acc. 2026-11-06).
- Claimed backtest of the 1D range over four years of SPX: 1D min held ~87% of days, 1D max ~85%, price stayed inside the range ~73% of the time. Source: same lesson (acc. 2026-11-06). Vendor claim, not independently verified.
- Trading guidance (as claimed): avoid selling iron condors when dealers move into negative gamma and vol score hits 5; exit failed breakouts into a gamma wall; on OPEX widen strikes / cut size; actively manage ICs around the 1D range. Same source.
- Pricing: Premium $129/mo (first month $59), Pro $349/mo (first month $174.50). Integrations include TradingView and NinjaTrader; no API, alerts or Discord detail on the pricing page. Source: https://menthorq.com/pricing/ (acc. 2026-11-06).
- Praise/complaints: one older review notes the dashboard "can take some time to load up" given data volume; the TradingView "Menthor Q Levels" indicator became a paid Premium service. Sources: https://optionstradingiq.com/?p=33227 (acc. 2026-11-06 via search snippet); https://www.tradingview.com/script/pmd9wFIw-Menthor-Q-Levels (acc. 2026-11-06 via search snippet). UNVERIFIED beyond snippets.

### 1.3 Unusual Whales
- What it shows: real-time options flow, GEX heat-map for all US tickers, "SPX market maker exposure" with 10-minute Cboe updates (Basic) or 1-minute (Retail Max, "Periscope"), Greeks dashboards, dark pool, politician trades, alerts, Discord bot. Source: https://unusualwhales.com/pricing (acc. 2026-11-06).
- Pricing: Free (flow delayed 2 trading days, news 15 min, alerts 30 min); Retail Basic $50/mo ($42 annual); Retail Pro $75/mo ($63 annual); Retail Max $120/mo ($102 annual) with 1-minute GEX. API plans are data-only and priced separately; historical option trades $250/mo. Sources: https://unusualwhales.com/pricing (acc. 2026-11-06); https://api.unusualwhales.com/docs (acc. 2026-11-06).
- API: REST, WebSocket, Kafka and an MCP server; bearer token auth; index at https://api.unusualwhales.com/docs/llms.txt. Source: https://api.unusualwhales.com/docs (acc. 2026-11-06). Specific GEX endpoint names were not retrievable from the landing page. UNVERIFIED.
- Dealer-sign convention: a third-party page says UW uses the "dealer perspective" convention (customers net buyers, dealers net short) and calls it "a good average-case assumption and a wrong one whenever positioning inverts." Source: https://gexa.ai/methodology.html (acc. 2026-11-06 via search snippet). UW's own methodology doc was not found. UNVERIFIED.
- Praise/complaints: competitor comparison calls GEX "a secondary product"; free tier delays are the main public complaint in snippets. Sources: https://flashalpha.com/articles/spotgamma-vs-unusual-whales-comparison (competitor-authored, acc. 2026-11-06); https://daytradingtoolkit.com/reviews/unusual-whales-review (acc. 2026-11-06 via snippet).

### 1.4 OptionsDepth
- What it shows: SPX and VIX only; gamma, charm, vanna and positional exposure by strike and expiration; "MM exposure heatmaps"; Depth View; Positional Insights (customer positioning shift over days); 3D gamma maps (Combo tier). Claims positioning is built from Cboe participant-tagged data, "not inferred from bid/ask spreads or tape heuristics." Source: https://optionsdepth.com/faq (acc. 2026-11-06).
- Pricing: Pro Max $249/mo ($2,499/yr) with intraday updates (page says 10-minute in one place and 1-minute in another); Pro (Legacy) $199/mo daily-only; TWI x OD Combo $375/mo with 1-minute SPX/VIX positioning; Enterprise by contact. API add-on for Pro Max: $99 for 6k units, $0.05/unit overage. Footer © 2026. Sources: https://www.optionsdepth.com/pricing (acc. 2026-11-06); https://optionsdepth.com/faq (acc. 2026-11-06).
- Praise/complaints: none found. UNVERIFIED.

### 1.5 GEXBot
- Official site is JS-rendered; only the title "gexbot - options analytics" was retrievable from https://www.gexbot.com/ and https://www.gexbot.com/pricing (acc. 2026-11-06).
- From a third-party indicator vendor that consumes the "GEXBot Classic API": per-ticker API key from the account dashboard; a lightweight "maxchange" change-detection call, then a full snapshot from `/zero` only on change; fields include Zero GEX (flip), ranked call/put walls, Vol GEX and OI GEX, with Zero (0DTE), Next and Full expiry windows; levels "typically update every few minutes"; tickers include ES_SPX, SPY, NQ_NDX, QQQ, VIX and single names. Source: https://www.profitnotiondaily.com/indicators/pnd-gexbot/ (acc. 2026-11-06).
- A Chrome extension (gexsync) references GEXbot "state" and "classic" tabs and builds synchronized historical replay across tabs. Source: https://github.com/dgnsrekt/gexsync (MIT, 7 stars, acc. 2026-11-06).
- Pricing and plan names: UNVERIFIED (not retrievable).

### 1.6 Volland (vol.land, "Wizard of Ops")
- Launch press release (June 2023): measures options dealer positioning "on an order-by-order basis," accumulates and visualises it; four-tier dashboard. Source: https://www.fintechfutures.com/press-releases/wizard-of-ops-launches-innovative-real-time-fintech-solution-for-options-dealer-positioning (acc. 2026-11-06 via search snippet; direct fetch 403).
- A June 2024 user guide hosted on Scribd mentions four monthly plans billed via Stripe. Source: https://www.scribd.com/document/785442176/VollandUserGuide-Jun24 (acc. 2026-11-06 via snippet). UNVERIFIED.
- Weekly Benzinga columns by a Volland user show dealer vanna/charm charts and read dealer vanna as inversely related to trend. Source: https://benzinga.com/z/33837719 (acc. 2026-11-06 via snippet; direct fetch 403). Promotional, UNVERIFIED.
- Pricing, API, update frequency: UNVERIFIED (site JS-rendered).

### 1.7 Tier1Alpha
- Publishes an Economic Calendar, Implied Volatility Ranges, Daily Gamma Exposure Models and an "MBAD Indicator" via app.tier1alpha.com; distributed exclusively by Hedgeye; pricing and API not listed. Source: https://www.tier1alpha.com/ (acc. 2026-11-06). Hedgeye describes model horizons of 2-3 weeks to six months, i.e. not intraday. Source: https://insights.hedgeye.com/market-situation-report (acc. 2026-11-06 via snippet). Vol-control / CTA flow estimates: UNVERIFIED (not on the fetched page).

### 1.8 TradingVolatility.net
- What it shows: GEX flip price and key gamma levels per watchlist ticker, gamma histogram, gamma by expiry buckets (near-term, 1-month, 2-month), IV rank, 30-day constant-maturity skew, a "Zero DTE scanner," export of levels to TradingView/thinkorswim. A v2 API with pre-computed GEX curves and skew series, an OpenAPI spec and an MCP server. Analysis "automatically runs in the morning and afternoon"; user-triggered live chain pulls; quotes "may be delayed 15 minutes"; real-time data only if the user links a funded Tradier account. Source: https://www.tradingvolatility.net/ (acc. 2026-11-06).
- B2B listing: daily Naive GEX and Skew-Adjusted GEX, REST/JSON/CSV, pricing on request. Source: https://datarade.ai/data-products/gamma-exposure-gex-measurement-of-us-companies-and-indexes-tickerized-trading-volatility (acc. 2026-11-06 via snippet).
- Retail pricing: not listed on the fetched page. UNVERIFIED.

### 1.9 VolSignals
- Products and prices: VS Pro $300/mo (daily SPX positioning and vol-surface commentary, premarket meetings); RTM live stream $285 for a 5-day trial (two models: "TC" delta-one/swaps flows, "VS" index-option dealer hedging), 9:30-16:00 ET; VS3D (strike-by-strike market-maker positions with gamma/charm/vanna profiles, price not listed); VIP mentorship $10,000; VolStudies $997. No API. The page's own FAQ states positioning "does not predict the market" and only indicates direction and rough size of hedging pressure. Source: https://www.volsignals.com/ (acc. 2026-11-06).
- A directory lists "$200/month" which conflicts with the site's $300. Source: https://www.producthunt.com/products/zdte-market-intelligence (acc. 2026-11-06 via snippet). UNVERIFIED.

### 1.10 Cboe's own 0DTE pages
- Cboe's 0DTE product page shows static stats (59% of SPX volume 0DTE; 54% annual growth since 2016; 48% of XSP volume), strategy explainers (credit spreads, iron condors, outright buys), a delayed VIX quotes dashboard, an SPX vs XSP calculator and links to market statistics. No interactive 0DTE dashboard. Source: https://www.cboe.com/tradable-products/0dte/ (acc. 2026-11-06); go.cboe.com/0DTE redirects there (acc. 2026-11-06).
- Daily market statistics page: put/call ratios and call/put volume and OI by product (SPX+SPXW combined; e.g. SPX+SPXW P/C 1.24, volume 8.29M on the day fetched); no 0DTE or by-expiry breakdown; no CSV/JSON advertised. Source: https://www.cboe.com/us/options/market_statistics/daily/ (acc. 2026-11-06).
- Monthly figures reported from Cboe: 63% of SPX volume 0DTE in Feb 2026; 66.2% in July 2026; retail share fell from 57% to 47% in early April 2025 then back to ~60%. Sources: https://www.schaeffersresearch.com/content/bgs/2026/03/24/how-0dte-options-can-explain-market-movement (acc. 2026-11-06 via snippet); https://tradeinformer.com/institutional-trading/cboe-reports-july-options-and-fx-growth-as-0dte-reaches-66-2-of-spx-volume (acc. 2026-11-06 via snippet); https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact/ (dated 2025-05-02, acc. 2026-11-06).

### 1.11 Other vendors encountered (brief)
- FlashAlpha: API vendor; 0DTE snapshot endpoint (Growth tier, $239/mo annual / $299 list; Alpha $1,199/mo) returns `flow_direction` (settled-OI vs live-OI net GEX; labels no_flow / neutral / amplifying / dampening / regime_flip), `regime` (flip level, distance in dollars and sigmas), `expected_move` (implied and *remaining* 1-sigma, straddle, ATM IV), `pin_risk` (magnet strike, 0-100 pin score with OI/proximity/time/gamma components, max pain), `hedging` (dealer shares to trade for 10/25/50/100 bp), `decay` (theta per hour remaining, charm regime), `liquidity` (ATM and weighted spread %, execution score), `metadata.snapshot_age_seconds`, per-feed `data_as_of`. Freshness: 15 min Free, 15 s Basic, ~1 s Alpha. Source: https://flashalpha.com/docs/lab-api-flow-zero-dte-snapshot (acc. 2026-11-06). Field list is useful as a design reference regardless of vendor.
- SqueezeMetrics: public daily DIX/GEX chart; per-ticker daily CSV/JSON via key-authenticated GET API (`/monitor/api/symbol/{ticker}`, `/latest`); no stated dealer-sign formula on the docs page. Source: https://squeezemetrics.com/monitor/docs (acc. 2026-11-06).
- Option Alpha: 0DTE GEX charts for SPX/SPY/QQQ/IWM/XSP/GLD/TLT back to Jan 2021; from 2025-11-14 captured "at the top of every minute" with intraday volume by strike; position drill-down shows the GEX profile at the minute a position opened/closed; "GEX decision recipes" for bots. Source: https://optionalpha.com/blog/whats-new-in-option-alpha-december-2025 (dated 2025-12-16, updated 2026-02-10, acc. 2026-11-06). Four GEX "profiles" (walls, pillars, slides, pins) are named in a 2026-03-16 video page without definitions. Source: https://optionalpha.com/videos/gamma-exposure-strategy-4-gex-profiles-for-spx-0dte-day-trading (acc. 2026-11-06).
- Trade Echo ("DealerEdge" GEX rating 1-5 and Flip Point; $199/mo Pro). Source: https://tradeecho.com/edge/spx-0dte-strategy (acc. 2026-11-06).
- quantedOptions Bookmap plugin ($99/mo): 0DTE gamma profile at ES prices with per-strike gamma/charm/delta/vanna lanes, live ATM straddle band, nearest +/- gamma nodes, "ghost bars" comparing the profile to 1/5/15/30 min ago or the open; data badged "CBOE C1 1-Minute Market Maker Gamma - Licensed"; requires Bookmap Global/Global+. Source: https://www.quantedoptions.com/orderflow-plugin (acc. 2026-11-06).
- RTGamma (Substack): argues "open gamma" (prior-close OI snapshot) predicts the first hour and real-time gamma the rest of the day; evidence is two anecdotes (2026-02-24, 2026-02-26) plus unquantified claims; author sells the product. Source: https://rtgamma.substack.com/p/open-gamma-vs-real-time-gamma-which (dated 2026-03-17, acc. 2026-11-06).

### 1.12 Summary table (dashboards)

| Vendor | Intraday cadence | Dealer-sign method (claimed) | API | Entry price | Independent reviews found |
|---|---|---|---|---|---|
| SpotGamma | TRACE 1-min; HIRO real-time | undisclosed | none public | $89/mo (levels) ; HIRO/TRACE $299/mo | competitor-authored only |
| MenthorQ | 30-min snapshots | undisclosed | none listed | $129/mo | one dated review |
| Unusual Whales | 10-min (Basic) / 1-min (Max) | "dealer perspective" (3rd-party) | REST/WS/Kafka/MCP | $50/mo | affiliate/competitor |
| OptionsDepth | 1-min or 10-min (Pro Max) | Cboe participant-tagged data | units-based add-on | $199/mo (daily) / $249 | none |
| GEXBot | "every few minutes" (3rd-party) | undisclosed | key-based Classic API | UNVERIFIED | none |
| Volland | "real-time" (press release) | order-by-order inference | UNVERIFIED | UNVERIFIED | none |
| VolSignals | live stream 9:30-16:00 | institutional modelling (no formulas) | none | $300/mo | none |
| TradingVolatility | AM/PM runs; user-triggered | undisclosed; "naive" + skew-adjusted | v2 REST + MCP | UNVERIFIED | none |
| Tier1Alpha | daily | undisclosed | none listed | via Hedgeye | none |

---

## 2. Intraday SPX/0DTE communities, platform features and indicators

### 2.1 thinkorswim / Schwab
- Market Maker Move (MMM): shown on the Trade tab symbol line (not in the chain) when front-month IV exceeds deferred months; a dollar magnitude, no direction; scriptable via `GetMarketMakerMove()`. Sources: https://www.schwab.com.sg/story/price-movement-indicator-market-maker-move (acc. 2026-11-06 via snippet); https://toslc.thinkorswim.com/center/reference/thinkScript/Functions/Tech-Analysis/GetMarketMakerMove (acc. 2026-11-06 via snippet).
- A community thinkScript cumulative-TICK study smooths $TICK high/low with EMAs and accumulates the excess. Source: https://gist.github.com/NVentimiglia/de3375bac08e1d01e727fe07ace95a4d (acc. 2026-11-06 via snippet).
- Probability-ITM as a native 0DTE display: not confirmed in any Schwab document retrieved. UNVERIFIED.

### 2.2 tastytrade
- Expected move drawn as a light-orange bar to the right of strikes; mobile shows it as a +/- number in the expiration bar; formula = 0.6 x ATM straddle + 0.3 x first OTM strangle + 0.1 x second OTM strangle, labelled "68% certainty." Source: https://tastyworks.freshdesk.com/support/solutions/articles/43000435415-expected-move (acc. 2026-11-06 via snippet).

### 2.3 TradingView indicators (0DTE-relevant, rules as published)
- "0DTE Breadth Classifier [YH]" (closed source; updated 2026-04-01): Trend Up = ADD > +1500 and VOLD > +2.0; Trend Down = ADD < -1500 and VOLD < -2.0; else Chop; cumulative TICK plotted as a daily-reset running sum; NYSE RTH only; symbols USI:ADD/VOLD/TICK. Source: https://www.tradingview.com/script/bluz9EpQ-0DTE-Breadth-Classifier-YH (acc. 2026-11-06).
- "ORB + Expected Move + Trade Bias RWC" (open source, v3.0, posted Jan 27, © 2026): ORB 15-60 min; EM from prior-day ATR projected from open; VWAP slope bands; a 9-factor confidence score (price vs ORB 40, VWAP slope 30, VWAP bands 20, VWAP consistency 15, move-from-open as % of EM 20, trend structure 15, day range vs EM 15, gap 12, PDH/PDL 20, plus alignment bonus); outputs IRON CONDOR / PUT SPREAD / CALL SPREAD / NO TRADE with tiers 75%+ aggressive, 60-75 normal, 45-60 conservative, <45 no trade; signal locks at a chosen time (default 11:15 ET); strikes = midpoint +/- EM x 0.60/0.70/0.80; exit tiers EARLY / CAUTION (25% of distance to short strike) / EXIT (40% and 3 bars beyond ORB). Noted inconsistency: Aggressive preset allows 40% below the 45% cutoff. Source: https://www.tradingview.com/script/wi8FWF6L-ORB-Expected-Move-Trade-Bias-RWC (acc. 2026-11-06).
- "0dte Anchored Expected Move by SyntaxGeek" (open source; 2024-12-17, updated 2025-11-17): EM = ATM call + put premium snapshotted at the open and held static; half-EM plots; live ATM premium tracking; SPX support added 2025-02-14; needs OPRA data on TradingView. Source: https://www.tradingview.com/script/1qZOZ0c5-0dte-Anchored-Expected-Move-by-SyntaxGeek (acc. 2026-11-06).
- "Options Decay Speed for 0DTE" (open source, 2020-06-01): compares 1-hour realised movement per 5 min to approximated theta-decay per 5 min; green when decay outpaces movement; SPX 5-min only; disables within last hour. Source: https://www.tradingview.com/script/eMkmzSAY-Options-Decay-Speed-for-0DTE (acc. 2026-11-06).
- "Expected Move Cone [AGPro Series]": cone plus a verdict on whether a target sits inside the expected range, with alerts. Source: https://www.tradingview.com/script/LKYsF6To-Expected-Move-Cone-AGPro-Series/ (acc. 2026-11-06 via snippet).
- Gamma-level scripts: many are price-proxy only; one explicitly states it "does NOT use real options chain data" and "cannot account for 0DTE dynamics." Source: https://www.tradingview.com/script/2PkJGV0c-Gamma-Levels-Options-Flow (acc. 2026-11-06 via snippet). Treat all TradingView "gamma" overlays as suspect unless they consume OI.
- ATAS expected-move tool: cone that widens toward expiry or a flat corridor; configurable sigma multipliers; notes that external daily EM values can be wider because they cover the whole day while the chart cone reflects remaining time. Source: https://help.atas.net/en/support/solutions/articles/72000661535-options-expected-move (acc. 2026-11-06 via snippet).

### 2.4 Bookmap / Sierra Chart
- Bookmap: SpotGamma Cloud Notes levels (SPX labels at ES prices with daily basis adjustment) and the quantedOptions 0DTE profile plugin (section 1.11). Sources as above.
- Sierra Chart: SpotGamma publishes levels files for Sierra Chart. Source: https://spotgamma.com/spotgamma-now-provides-levels-for-sierra-chart/ (acc. 2026-11-06 via snippet). A support-board post describes a user-built study plotting live 0DTE gamma/delta for 15 strikes above/below spot, shifted by the ES-SPX difference, refreshing every 15 s. Source: https://www.sierrachart.com/SupportBoard.php?PostID=443837 (acc. 2026-11-06 via snippet; page requires login). UNVERIFIED.

### 2.5 Named methodologies (claimed rules, not endorsements)
- Henry Schwartz "Dollar Rule" SPX iron condor (Cboe Insights, 2025-10-01): two 10-point credit spreads each collecting ~$1.00 mid-day (~9:1 risk/reward per spread); enter after morning volatility settles, after scheduled releases, avoid Fed days and extreme uncertainty; set-and-forget sized to defined risk; optional standing $0.10 bid on short strikes; cash-settled 4:15 PM ET. No backtest statistics. Article contains an internal strike/price inconsistency. Source: https://www.cboe.com/insights/posts/henry-schwartzs-zero-day-spx-iron-condor-strategy-a-deep-dive/ (acc. 2026-11-06).
- Aeromir "Tachyon" (signal service, $149/mo): 0DTE SPX iron condor; pre-alert 3:45 PM ET, go/no-go at 3:51 PM, limit at natural with 3:53 auto-cancel; $5 wide; min total credit $0.90; ~0.25 delta shorts; put-spreads-only on "bull" days; skip Mondays; skip "extreme end-of-day momentum" (threshold not given); no stops; hold ~9 minutes to settlement. Claimed hypothetical: 77.9% winners across 562 trades, 2022-05-11 to 2026-10-23, $18,495 net per lot, worst drawdown $3,047, $1.20/contract all-in; no live track record. Source: https://aeromir.com/tachyon (acc. 2026-11-06). The "|mom|<7, ZLO>1.80" filters seen in search snippets are not defined on the page. UNVERIFIED.
- Trade Echo 6-step 0DTE alert method: single-sided SPX 0DTE alert >= 1,000 contracts and >= $250K premium; SPX +/-1% on above-average volume; DealerEdge GEX rating 1-2 favours momentum, 4-5 dampens; strikes 5-10% OTM at $0.50-$3.00; confirm with repeat alerts within 5-10 min; stop -20%, target +50-100%, sell half at +50%; no new entries after 2:00 PM; exit all 1-2 hours before close; risk 1-3%. The page's worked example violates its own 1% move and 5-10% OTM rules. Source: https://tradeecho.com/edge/spx-0dte-strategy (acc. 2026-11-06).
- Option Alpha "peg" research (2024-08-12): probability SPX closes within a range of its price at a given time, minute-level data, last 180 trading days for the 2 PM figure: 10:30 AM +/-0.30% -> 53.3%; 1:30 PM +/-0.20% -> 56.1%; 1:30 PM +/-0.50% -> 90.6%; 2:00 PM +/-0.20% -> 65.6%. Page has an unreconciled "above 67%" claim. Source: https://optionalpha.com/blog/0dte-intraday-spx-historical-prices (acc. 2026-11-06). Option Alpha platform stats (SPY-dominated, 25k+ positions): iron condors opened >2 h after the open averaged +37% vs -0.36% within 2 h; 94% of ICs held to expiry were full winners. Source: https://optionalpha.com/blog/0dte (updated 2025-02-08, acc. 2026-11-06).
- Open-source VIX1D rule (thunderscarf, MIT, 3 stars): entry 9:45 ET; expected move = VIX1D/sqrt(252) x 0.5 x SPX; sell put spread near lower bound in bullish regime, call spread near upper bound in bearish; $5 wide; hold to expiry; claimed 78.17% win rate, 15.74% annualised, Sharpe 0.97, max DD -16.21% over 537 days (educational). README conflicts on regime method (MAs vs ADX). Source: https://github.com/thunderscarf/SPX_0DTE_Options_Selling_Public (acc. 2026-11-06).
- Generic YouTube/Discord rule set (secondhand digests): ~30-delta short strikes after a Bollinger-band break; stop at 2x-4x credit or when short delta reaches 50-60; take profit ~50%; hard time stop 3:30-3:45 PM ET; butterflies closed at 70-90% of max or when debit doubles. Sources: https://videohighlight.com/v/Lbs8xFwz-xQ (acc. 2026-11-06 via snippet); https://gist.ly/youtube-summarizer/stress-free-spx-zero-dte-options-trading-guide (acc. 2026-11-06 via snippet). Named-channel rule pages (recapio digests) did not load. UNVERIFIED.
- 0-dte.com morning OTM butterfly method and GammaEdge "three zones": pages unreachable (DNS / 403). UNVERIFIED.

---

## 3. Open-source GitHub repos (2023-2026)

Star counts and licences are as shown on the repo page on 2026-11-06; last-commit dates were not rendered by the fetcher unless stated.

| Repo | Stars | Lang | Licence | What is reusable | Known issues (from its own README) |
|---|---|---|---|---|---|
| https://github.com/gammagrid/gammagrid | 94 | Python (Streamlit) | AGPL-3.0 | GEX per-expiry profile, strike x expiry heat-map, walls, flip, replay, max pain, OI delta, IV surface, vanna/charm screener; Docker + Postgres | yfinance source (15-20 min delay, throttling); 15-min collection floor; SPXW chain incomplete on third Fridays; VIX not collected; dealer sign not stated |
| https://github.com/simonro/Edge-GEX-Lab | 62 | Python + React | MIT | Signed/unsigned net GEX toggle; every flip within 10%; regime at spot; GEX relative to 20-day $ volume; 2-4 scenario "trade guidance" labelled untested on screen; "Untested" chips on DEX and vol-drift | free Alpaca feed 0DTE net GEX "off by as much as half" vs OPRA; Cboe cdn delayed ~15 min and terms restrict automation; OI dates inferred; SPX spot = prior close before ~09:45 |
| https://github.com/EazyDuz1t/EzOptions-Schwab | 45 | Python (Flask/Plotly) | GPL-3.0 | Schwab live chains via schwabdev; per-strike GEX/DEX/vanna/charm/speed/vomma/color; expected move from ATM straddle; OI/volume weighting modes; /ES mapping via measured carry ratio; 1-s server push; background minute collector | Schwab session expires ~7 days; sign convention not documented; `.env` in repo root |
| https://github.com/zrack/gex-terminal | 27 | Python | MIT | Keyboard TUI with replay controls; "Market Wind Tunnel" scenario/fragility workbench; bundled synthetic replay data | v0.6 "research alpha"; Databento "live-uncertified"; predictive validity "unmeasured" |
| https://github.com/Darthreign/gex-dashboard | 19 | Python (Dash) | MIT | Uses `https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json`; GEX = gamma x OI x 100 x spot^2 x 0.01, calls +, puts - ("naive SpotGamma convention"); flip via +/-8% spot grid; 0DTE GEX1-5 walls, Flip, HVL; 60-s refresh; MCP server; Discord bot posting a "state verdict" | endpoint "non contractuel"; delta-flow proxy has no taker side; q=0 for SPY/QQQ; Windows path in `.mcp.json` |
| https://github.com/puneet-chandna/0DTE-dealer-gamma | 11 | Python (FastAPI) + Next.js | PolyForm Noncommercial 1.0 (source-available) | Zero gamma, regime labels, intraday history, hedging-flow estimates, scenario sim, session replay | default source is Yahoo SPY x10 as SPX proxy; 15-min delay; OI daily; quote freshness unknown |
| https://github.com/zer0dte/zer0dte | 8 | n/s | not shown | 21 MCP tools: snapshot, pulse, severity-graded alert, calendar (FOMC/early close), 0-100 entry score with verdict, levels, exposure, regime, flows, chain, strikes at target delta, liquidity (spreads, fill probability), expected move with % consumed, accuracy (how often levels held), history, compare (similar past sessions), opening range, regime history, pattern, session log | data provider unnamed; dealer sign not stated; tool count 20 vs 21; free beta rate limits |
| https://github.com/itsfabtrading/Gex-Multi | 7 | Python | Apache-2.0 (+ MIT vendored) | Public Cboe chains; call/put walls, flip, "magnet" (largest gross gamma), 0DTE flip/walls from front expiry, share of window gamma expiring today, 1D +/-1 sigma band, ES/NQ conversion, JSON + SQLite + PNG outputs; floors T to 1/262 to stop ATM gamma spiking at close | delayed data; prior-close chains stale on expiry days; "68% containment not validated"; VXN not fetchable |
| https://github.com/emlama/gex-backtesting | 16 | Python >=3.10 | not shown | Side-weighted GEX from quote-matched trade direction (Polygon flat files 2024-01-02 to 2026-02-19); GCI (HHI of gamma by strike), PGR (share of gamma within +/-$20), CAR (zomma/vomma); pre-registered tests with Fisher exact + FDR | no results reported; 305 vs 513 day-count mismatch; 2.3 GB download |
| https://github.com/thunderscarf/SPX_0DTE_Options_Selling_Public | 3 | Python | MIT | VIX1D expected-range credit spread backtest (section 2.5) | docs conflict on regime method; hard-coded dates |
| https://github.com/TradersPost/traderspost-command-dash | 7 | TS/React + Python | README says "Private" (repo public) | FastAPI `/api/gex/snapshot` and `/api/gex/history`; draggable widget grid; zipline backtests | GEX data source and dealer sign undocumented; Python 3.11 only |
| https://github.com/michaelchu/optopsy (now goldspanlabs) | 1.5k | Python 3.12-3.13 | AGPL-3.0 | 38 strategy templates incl. ICs, butterflies, calendars; 80+ entry signals; CSV loader with column mapping; EODHD downloader | no liquidity/slippage/assignment modelling (own disclaimer) |
| https://github.com/tylerebowers/Schwabdev | 893 | Python | MIT | Schwab streaming with auto-restart, token management, market-hours streamer toggle | rate limits not documented |
| https://github.com/alexgolec/schwab-py | 480 | Python | MIT | Options chains, streaming quotes and book, orders, OCC symbol helper | no paper trading; no historical options pricing |
| https://github.com/hidden-regime/hidden-regime (PyPI 2.0.2, 2025-11-24) | n/s | Python >=3.10 | MIT | 2-5 state HMM with Baum-Welch/Viterbi, day-by-day temporal backtest | daily data only; no online update stated. Source: https://pypi.org/project/hidden-regime/ (acc. 2026-11-06) |
| https://github.com/Sakeeb91/market-regime-detection | n/s | Python | MIT | Gaussian HMM + GMM + change-point | Yahoo daily data (acc. 2026-11-06 via snippet) |
| https://github.com/online-ml/river | n/s | Python | BSD-3 | Online learning with drift adaptation (candidate for the adaptive ensemble) | no trading bot built on it was found (acc. 2026-11-06 via snippet) |
| https://github.com/asavinov/intelligent-trading-bot | 1.7k | Python | n/s | Minute-frequency ML signal pipeline (BTC) | not options; not incremental (acc. 2026-11-06 via snippet) |
| https://github.com/SamPom100/MarketMoves | n/s | n/s | n/s | straddle/strangle expected-move calc | planned features unbuilt (acc. 2026-11-06 via snippet) |
| https://johnhalz.github.io/trade_calc/ | n/s | Python | n/s | EM, IV/RV ratio, term-structure slope | (acc. 2026-11-06 via snippet) |
| https://github.com/dgnsrekt/gexsync | 7 | JavaScript | MIT | synchronized multi-tab historical replay pattern (master tab + followers by time of day) | GEXbot-specific |
| https://github.com/FlashAlpha-lab/awesome-options-analytics | 50 | n/a | n/a | curated index (vendor-maintained); no TICK/breadth, no OSS regime or EM code listed | vendor bias |
| https://github.com/nomad64/occdailyvolume | 0 | Python | MIT | OCC monthly CSV -> SQLite pipeline | URL patterns not in README |
| https://github.com/davidalmeida90/GEX-scalping-tradingbot | 16 | Python | n/s | IBKR paper-only GEX scalping bots | (topic page, acc. 2026-11-06) |
| https://github.com/Hewkaw02/Futures-Options-SD-Dashboard | 22 | Python | n/s | hourly flow/GEX + SD range for ES/NQ/gold | (topic page, acc. 2026-11-06) |

Topic index used: https://github.com/topics/gamma-exposure (77 repos; 20 listed; acc. 2026-11-06).

Cross-cutting observations:
- Every OSS GEX repo that states its convention uses calls-positive / puts-negative on OI and says so; the two best-documented (Edge-GEX-Lab, Darthreign) also expose an unsigned view or call the convention "naive."
- The only repo with trade-side-labelled intraday gamma is emlama/gex-backtesting (Polygon flat files, offline). Nobody open-source reproduces TRACE-style 1-minute positioning live.
- Free data paths used: Cboe cdn delayed JSON (SPX/NDX), Yahoo (SPY proxy), Alpaca indicative feed, Schwab (real-time, 7-day re-login), Tradier (sandbox options delayed 15 min; Greeks "Not Available" in sandbox per https://docs.tradier.com/docs/market-data, acc. 2026-11-06 via snippet).

---

## 4. Research and analytics sites

### 4.1 Quantpedia
- Tag "0DTE options" lists three posts: "From Barrier Crossings to Terminal Distributions: A Skellam-Based Options Pricing Framework for 0-DTE Markets" (2026-09-14); "The Attention Factor" (2026-05-05); "Do S&P500 0DTEs Options Increase Market Volatility?" (2026-02-02). Source: https://quantpedia.com/tag/0dte-options/ (acc. 2026-11-06).
- The Feb 2026 post summarises Adams et al. (SSRN 5641974): S&P 500 realised vol ~60 annualised bp lower on days with 0DTE trading (identified via Tue/Thu expiries pre-May 2022); market-maker hedging needs ~1% of S&P shares per 1% move, raised ~0.15 pp by 0DTEs, mostly from longer-dated positions becoming 0DTE (~24 bp) rather than same-day opens (~3 bp); net gamma positive and stays positive through the day; higher net gamma predicts lower vol over the next 10 minutes (effect fades after ~1 hour), stronger E-mini order-flow reversals, and negative high-frequency momentum. Source: https://quantpedia.com/do-sp500-0dtes-options-increase-market-volatility/ (acc. 2026-11-06). SSRN page returned 403; UNVERIFIED beyond the summary.
- Quantpedia Awards 2025 4th place: Zarattini, Aziz, Barbon, "Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY)" (working paper, issued 2025-02-03): enters trend-following positions on abnormal intraday supply/demand imbalance rather than only in the last 30 minutes; dynamic trailing stops; 2007-early 2024 net of costs: total return 1,985%, 19.6% annualised, Sharpe 1.33; tests whether dealer gamma imbalance predicts profitability (result not shown on the landing page). Sources: https://www.alexandria.unisg.ch/handle/20.500.14171/122124 (acc. 2026-11-06); https://fsi.unisg.ch/de/newsdetail/news/quantpedia-awards-2025-fsis-barbon-and-team-secure-4th-place-with-intraday-momentum-strategy/ (acc. 2026-11-06 via snippet).
- "Market intraday momentum" (Gao, Han, Li, Zhou, JFE 129(2), 2018): first half-hour return predicts last half-hour return (SPY 1993-2013); stronger on volatile, high-volume and macro-news days. Source: https://econpapers.repec.org/RePEc:eee:jfinec:v:129:y:2018:i:2:p:394-414 (acc. 2026-11-06 via snippet). Out-of-sample replications report profitability largely confined to 2008 and recommend a VIX>20 filter. Sources: https://www.quantrocket.com/blog/hedging-long-term-risk-intraday-strategy (acc. 2026-11-06 via snippet); https://www.quantconnect.com/learning/articles/investment-strategy-library/intraday-etf-momentum (acc. 2026-11-06 via snippet).
- "Hedging demand and market intraday momentum" (Baltussen, Da, Lammers, Martens, JFE 142(1), 2021): intraday momentum across 60+ futures 1974-2020 linked to gamma-hedging demand; no significant intraday momentum on positive net-gamma days. Source: https://ideas.repec.org/a/eee/jfinec/v142y2021i1p377-403.html (acc. 2026-11-06 via snippet).

### 4.2 SSRN / arXiv 2023-2026 on 0DTE (titles and claims)
- Beckmeyer, Branger, Gayda, "Retail Traders Love 0DTE Options... But Should They?" (SSRN 4404704, 2023): ~75% of retail SPX option trades are 0DTE; retail lost ~$358k/day; retail keeps trading with <1 hour to expiry despite wider spreads. Source: https://medium.com/@y125789/retail-traders-love-0dte-options-paper-summary-6da4a7ff7d72 (acc. 2026-11-06 via snippet); SSRN 403. UNVERIFIED beyond summaries.
- Vilkov, "0DTE Trading Rules" (SSRN, Nov 2023): 30-minute SPX 0DTE prices Sep 2016-May 2023; entries at 10:00/13:00/15:00, exit 16:00; standalone calls/puts, straddles, strangles, verticals, ratios, risk reversals; "simple unhedged 0DTE strategies seldom paid off gross of costs"; variance risk premium positive but tiny. Source: https://www.cxoadvisory.com/?p=45017 (dated 2023-12-20, acc. 2026-11-06).
- Chong (HKUST), "Are 0DTE Options Mispriced?" (SSRN 4933153; summary dated 2026-04-18): 2020-2024; large risk premia confirmed, but transaction costs and estimation risk make vol-arbitrage Sharpe ratios economically insignificant; "expensive but do not appear to be mispriced." Source: https://bm.hkust.edu.hk/bizinsight/2026/04/are-0dte-options-mispriced (acc. 2026-11-06).
- Dim, Eraker, Vilkov (SSRN 4641356): 0DTE volatility/straddle strategies; only a fragment surfaced. UNVERIFIED.
- Adams et al. (SSRN 5641974): see 4.1.
- Skellam-based 0DTE pricing framework (Quantpedia, 2026-09-14): discrete order-book-driven model with closed-form IV surface. Source: https://quantpedia.com/tag/0dte-options/ (acc. 2026-11-06). Not read in full.
- Brogaard et al. market-quality paper and Bandi/Fusari/Reno: not found in this session. UNVERIFIED.

### 4.3 Cboe Insights posts on 0DTE behaviour
- Xu, "Much Ado About 0DTEs" (2023-09-08): MM net gamma ranges ~$170mm to $670mm intraday; at 3:30 PM median +$173mm, middle-50% -$1.1bn to +$2.4bn, whiskers -$5bn to +$7.7bn; hedging flows 0.04%-0.17% of daily S&P futures liquidity (whiskers 1.3%-1.9%); customer flow "very balanced"; 2023-08-15 example: 4440 put traded >100k but MMs net short only ~3k (~3% of gross); no increase in 2-sigma one-minute gaps; net gamma range widens into the close. Source: https://www.cboe.com/insights/posts/volatility-insights-evaluating-the-market-impact-of-spx-0-dte-options (acc. 2026-11-06).
- Xu, "0DTEs Decoded" (2025-05-02): ~2M SPX 0DTE contracts/day; retail ~50-60%; retail share 57% -> 47% in early April 2025, back to ~60%; >95% of 0DTE trades are limited-risk structures, ~4% naked short; net MM gamma hedging "de minimis," at most ~0.2% of SPX daily liquidity. Source: https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact/ (acc. 2026-11-06).
- Schwartz iron condor deep dive (2025-10-01): see 2.5; Cboe data as of 2025-09-08: 62% of SPX volume 0DTE, ~50% retail.
- JPMorgan counter-view (Reuters, 2023-03-06; analysts Peng Cheng, Emma Wu): in an "extremely dire scenario" a 5% drop in five minutes could trigger ~$30.5bn of 0DTE-related selling adding ~20 pp; 1-5% drops could unwind $6.6-14.2bn adding 4-8.1 pp; retail ~5% of same-day SPX volume at the time. Source: https://finance.yahoo.com/news/0dte-options-could-turn-5-214117774.html (acc. 2026-11-06).
- Numerix white paper "Gamma hedging of 0DTE options" (PDF metadata 2025-12-16; published 2026-01): recap of Cboe findings (net MM gamma <1% of ES volume); gamma profile of a 6800 ATM option at 5d/1d/0.25d; a 1% move at 2 hours to expiry swings ATM call delta ~0.50 -> ~0.95 or ~0.05; "some clearing firms mandate that 0DTE positions be flattened by 3:45pm"; desks use delta-band hedging (e.g. hedge when net delta hits 100 futures-equivalents) with thresholds tightened in the last hour; scenario tools ("if S&P drops 1% in the next 30 minutes, how do delta and P&L change?"). Source: https://www.numerix.com/sites/default/files/file/2026-01/Numerix_White_Paper_Gamma_Hedging_of_ODTE_Options.pdf (acc. 2026-11-06).

### 4.4 OCC statistics
- OCC offers batch-processing URLs for Contract Volume, Exchange Volume by Class, Volume by Account Type, Trade Volume and daily/weekly/monthly Volume Statistics. Source: https://prd-web.theocc.com/market-data/market-data-reports/other-market-data-info/batch-processing (acc. 2026-11-06 via snippet; direct fetch 403). Exact URL parameters: UNVERIFIED. Monthly press releases exist (e.g. https://www.theocc.com/newsroom/press-releases/2024/1-03-occ-reports-december-2023-and-total-2023-volume-data, acc. 2026-11-06 via snippet).

### 4.5 NYSE / Nasdaq auction data
- NYSE closing imbalance dissemination begins 3:50 PM ET, once per second when fields change. Source: https://www.nyse.com/publicdocs/nyse/data/NYSE_Pillar_Order_Imbalances_Client_Specification.pdf (acc. 2026-11-06 via snippet). NYSE's Closing Auction Imbalance Analysis Tool (2023-03-15) charts three months of 3:55-4:00 history for the 1,000 largest auctions; linked from nyse.com/nyse-auction-data; free status not stated. Source: https://www.nyse.com/data-insights/nyse-introduces-closing-auction-imbalance-analysis-tool (acc. 2026-11-06).
- Nasdaq NOII: from 3:50 PM, every 5 s (Nasdaq) or 10 s 3:50-3:55 (Databento); subscription only; Nasdaq Data Link has free samples. Sources: https://www.nasdaqtrader.com/Trader.aspx?id=OpenClose (acc. 2026-11-06 via snippet); https://databento.com/docs/datasets/xnas-itch (acc. 2026-11-06 via snippet).
- Paid vendors: Databento NYSE Integrated imbalance add-on; Massive (NYSE-listed only; publishes the Nasdaq closing-cross result after the fact). Sources: https://databento.com/blog/NYSE-imbalance-feeds (acc. 2026-11-06 via snippet); https://massive.com/knowledge-base/article/does-massive-have-nasdaq-order-imbalance-data-or-only-nyse (acc. 2026-11-06 via snippet).

### 4.6 Economic calendars with APIs
- Finance Calendar API: JSON/CSV/ICS, UTC times, consensus/prior/actual, no key, free with attribution, 14 countries. Source: https://www.financecalendar.com/?p=2921 (acc. 2026-11-06 via snippet). Vendor claim.
- Forex Factory scrapers on Apify (pay-per-event; redistribution terms risk). Source: https://apify.com/ichigowa/economic-calendar-pro (acc. 2026-11-06 via snippet).
- FinancialJuice: no documented public developer API found; third-party Parse wrapper exists; retail tiers quoted at $69/qtr and $99/qtr promo by affiliate sites. Source: https://parse.bot/marketplace/f4e4a6f6-a3c1-460a-893b-79e2b03c711d/financialjuice-com-api (acc. 2026-11-06 via snippet). UNVERIFIED.
- Tier1Alpha and zer0dte both expose an economic/FOMC/early-close calendar inside the positioning product (sections 1.7, 3).

### 4.7 Free data endpoints relevant to the terminal
- Cboe delayed option chain JSON: `https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json` (~15 min delay, regenerates ~60 s, undocumented, "non-contractual", site terms restrict automation). Sources: https://github.com/Darthreign/gex-dashboard (acc. 2026-11-06); https://github.com/simonro/Edge-GEX-Lab (acc. 2026-11-06); https://raw.githubusercontent.com/api-evangelist/cboe/refs/heads/main/apis.yml (acc. 2026-11-06 via snippet).
- Cboe daily index CSVs: `https://cdn-api.cboe.com/api/global/us_indices/daily_prices/{SYMBOL}_History.csv` for VIX, VVIX, VIX9D, OVX, GVZ and others; VIX1D and VIX3M are not on that page. Source: https://www.cboe.com/tradable-products/vix/vix-historical-data/ (acc. 2026-11-06). VIX1D launched 2023-04-24; TradingView shows Cboe backtest data before that. Source: https://www.tradingview.com/symbols/CBOE-VIX1D (acc. 2026-11-06 via snippet).
- FRED VIXCLS: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS` (no key) or `https://api.stlouisfed.org/fred/series/observations` (free key). Source: https://eco3min.fr/en/vix-volatility-index-dataset/ (acc. 2026-11-06 via snippet).
- CME: delayed data is a paid licence ($304/mo per 2026 schedule quoted; EOD no longer free). Source: https://www.waterstechnology.com/data-management/7952957/cme-rankles-market-data-users-with-licensing-changes (acc. 2026-11-06 via snippet).
- Tradier sandbox: options delayed 15 min, Greeks and indices "Not Available." Source: https://docs.tradier.com/docs/market-data (acc. 2026-11-06 via snippet).
- Schwab: legacy TD figure 120 non-order requests/min per app; Schwab's current numeric limits are behind the developer portal. Sources: https://apiforums.tdameritrade.com/node/116 (acc. 2026-11-06 via snippet); https://raw.githubusercontent.com/api-evangelist/charles-schwab/refs/heads/main/rate-limits/charles-schwab-rate-limits.yml (acc. 2026-11-06 via snippet). UNVERIFIED for Schwab proper.

---

## 5. UX patterns worth noting

### 5.1 "The one thing to do now"
- Verdict + confidence + supporting conditions + risk flags + explicit NO TRADE state: FlashAlpha `setup` block (primary label, confidence, conditions, risk flags) and `headline` (narrative, trade angle, severity, promoted levels); zer0dte `entry_score` 0-100 with verdict; ORB+EM script's four-state output with confidence tiers and a NO TRADE tier; MenthorQ Q-Score "safe / fragile / dangerous"; Trade Echo GEX rating 1-5; Edge-GEX-Lab "environment + levels + 2-4 scenarios with entry/stop/targets" labelled untested. Sources: sections 1.11, 3, 2.3, 1.2, 1.11, 3.
- Observation: the best-regarded commercial tools (SpotGamma, OptionsDepth, VolSignals) explicitly refuse to give a directional call and frame output as "regime" or "hedging pressure"; the signal-sellers (Trade Echo, Tachyon) give the call but with thin or internally inconsistent evidence.

### 5.2 Level ladders
- Common ladder vocabulary across vendors: Call Wall / Put Wall (largest +/- net dealer gamma), Gamma Flip / Zero Gamma, "Magnet" (largest gross gamma), HVL, Key Gamma Strikes, 0DTE-only walls and flip, max pain, 1D Min/Max, Blind Spot (thin liquidity) levels. Sources: https://github.com/itsfabtrading/Gex-Multi (acc. 2026-11-06); MenthorQ guide (acc. 2026-11-06); Darthreign (acc. 2026-11-06).
- Useful presentation details: rank walls by strength and plot only top N per side (GEXBot indicator); shade "confluence zones" where index and ETF levels agree within a tolerance (10 pts ES) (profitnotiondaily page); show distance to each level in dollars and sigmas (FlashAlpha `regime` and `levels`); "level cluster score" (FlashAlpha); "ghost bars" showing the profile 1/5/15/30 min ago (quantedOptions).

### 5.3 Expected-move cones
- Two presentations coexist: (a) anchored-at-open static EM (SyntaxGeek; MenthorQ 1D Min/Max), (b) time-scaled remaining EM (ATAS cone vs corridor; FlashAlpha `expected_move.remaining`; zer0dte "percentage consumed"). ATAS documents the common confusion: full-day EM from external services is wider than the remaining-time cone.
- EM formulas in use: ATM straddle (SyntaxGeek, FlashAlpha, EzOptions); tastytrade 0.6/0.3/0.1 weighted straddle+strangles; VIX1D/sqrt(252) x 0.5 (thunderscarf); ATR-based (ORB script); 1.25 x straddle / spot as a sigma approximation (search snippet from https://www.optionsanalysissuite.com/etf/ux/expected-move, acc. 2026-11-06).

### 5.4 Countdowns to expiry / decay clocks
- Explicit countdown widgets were not found in vendor docs. Equivalents: FlashAlpha `decay.theta_per_hour_remaining`, charm regime and "gamma acceleration vs 7DTE"; zer0dte EM % consumed; "Options Decay Speed" realised-move vs theta per 5-minute comparison; Numerix's "tighten delta threshold in the last hour" and "flatten by 3:45" conventions; Tachyon's 3:45 pre-alert / 3:51 go / 3:53 cancel schedule. Sources: sections 1.11, 3, 2.3, 4.3, 2.5.

### 5.5 Alerting
- Unusual Whales: 25 alerts on Basic, unlimited on Pro/Max; free tier alerts delayed 30 min; separate Discord bot product. Source: https://unusualwhales.com/pricing (acc. 2026-11-06).
- zer0dte: severity-graded alerts for regime flips, level breaks and VIX spikes. Darthreign: optional Discord bot posting a "state verdict." GEXBot indicator: ATAS alerts on Zero GEX cross. ORB script: 8 named alert types (3 entries, high-confidence, no-trade, early, caution, exit).
- Discord webhook mechanics: `content` string or up to 10 `embeds`; colour-code by severity; limited Markdown; rate limits can block a chatty webhook; keep notification and execution as separate risk classes. Sources: https://th.tradingview.com/support/solutions/43000529625/ (acc. 2026-11-06 via snippet); https://webhookrelay.com/blog/trading-view.md (acc. 2026-11-06 via snippet); https://github.com/RobsFinTech/Discord-Alert-Bot (acc. 2026-11-06 via snippet).
- SpotGamma/MenthorQ push or SMS alert specifics: not found. UNVERIFIED.

### 5.6 Journaling / grading of calls
- Two-scale grading (outcome A-F vs execution Perfect/Decent/Improve: "an A-setup that lost money is still a good trade") (Tanto); rule-adherence "Tiltmeter" and setup checklists mapped against the equity curve (Edgewonk); playbook/setup/emotion tags and MAE/MFE (TradeZella, Tradervue). Source: https://tanto-website.pages.dev/learn/best-trading-journal-software (acc. 2026-11-06); https://daytradingz.com/edgewonk-vs-tradezella/ (acc. 2026-11-06 via snippet).
- Level self-grading: zer0dte `accuracy` ("how often computed levels held over a lookback"), `regime_history` (transitions and outcomes), `session_log`; MenthorQ publishes hold rates for its 1D range; Gex-Multi admits its 68% band is "not validated." Option Alpha stores the GEX profile at the minute each position opened/closed.

### 5.7 Labelling delayed vs live data
- TradingView shows a "D" next to the symbol when the feed is not real-time and refuses paper orders on delayed feeds. Source: https://in.tradingview.com/support/solutions/43000719858-why-is-the-data-delayed-in-the-order-panel-and-dom-on-my-tradestation-account/ (acc. 2026-11-06 via snippet).
- Unusual Whales states exact delays per tier (flow 2 trading days, news 15 min, alerts 30 min on Free). TradingVolatility says quotes "may be delayed 15 minutes" and upgrades to real-time only with a linked broker key. FlashAlpha returns `data_as_of` per feed, `snapshot_age_seconds`, a data-quality score and a Greek-smoothness score. Edge-GEX-Lab draws "Untested" chips on any metric without validation and prints "Real positioning is not public" next to the signed GEX toggle. gammagrid states "snapshot-based, not a live trade stream."

---

## 6. Gap analysis: current terminal features vs. what comparables do

| Current feature | What the closest comparables do differently | Source(s) | Gap worth closing? |
|---|---|---|---|
| Multi-timeframe price/vol features | Add VIX1D and 0DTE/7DTE ATM IV ratio as the short-horizon vol state; most tools show VIX only | FlashAlpha `vol_context`; Cboe VIX1D (sections 1.11, 4.7) | Yes (low effort) |
| GEX with explicit dealer-sign assumptions | Expose unsigned view; split 0DTE vs full chain; show flow-adjusted vs settled; show distance to flip in sigmas | Edge-GEX-Lab, Gex-Multi, FlashAlpha (sections 3, 1.11) | Yes |
| NYSE TICK + cross-index confirmation | Combine with ADD and VOLD into a three-state breadth label; cumulative TICK with daily reset | 0DTE Breadth Classifier (section 2.3) | Yes (low effort) |
| Adaptive indicator ensemble | Comparables publish factor weights and a NO TRADE tier; none publish online-learning weights | ORB+EM 9-factor table; zer0dte entry score (sections 2.3, 3) | Presentation only |
| Nine setup families with invalidation/exit | Comparables add time-window eligibility and event gates per family; tiered exit warnings (early/caution/exit) | ORB+EM exits; Schwartz; Trade Echo; Numerix (sections 2.3, 2.5, 4.3) | Yes |
| Execution-aware ranking under $200 | Add spread %, volume/OI, fill probability, stale-quote guard | FlashAlpha `liquidity`, fill simulator; zer0dte `liquidity` (sections 1.11, 3) | Yes |
| 15:50-16:00 strike-flip module | Pin score with components; volume-vs-OI at round strikes; auto-cancel timers; clearing-firm 3:45 flatten norm | FlashAlpha `pin_risk`; SpotGamma strike plot; Tachyon; Numerix (sections 1.11, 1.1, 2.5, 4.3) | Yes |
| Paper positions | TradingView refuses paper orders on delayed data; EzOptions and 0DTE-dealer-gamma log quote freshness | section 5.7 | Yes (gate) |
| Immutable decision ledger | Journals add two-scale grades and rule-adherence counts; Option Alpha stores the GEX profile at the minute of open/close | sections 5.6, 1.11 | Yes |
| Replay | gexsync synchronises replay across panes by time of day; gex-terminal ships synthetic replay data; gammagrid has historical replay of GEX | sections 3 | Nice-to-have |
| Self-grading | zer0dte grades level accuracy and regime transitions, not only calls; MenthorQ publishes hold rates | sections 3, 1.2 | Yes |
| (absent) Expected move | Every comparable shows an EM; the better ones show remaining EM and % consumed | sections 2.3, 5.3 | Yes |
| (absent) Event calendar | zer0dte, Tier1Alpha ship calendars; Schwartz and Trade Echo gate on events | sections 3, 1.7, 2.5 | Yes |
| (absent) Alerts | Unusual Whales, zer0dte, Darthreign, GEXBot indicators all alert; Discord webhook is the common channel | section 5.5 | Yes |

## 7. Glossary: how the sources actually compute the terms they display

Formulas and definitions below are quoted from the cited source, not harmonised. Where sources disagree, both are listed.

- Net GEX per strike (naive dealer convention): gamma x OI x 100 x spot^2 x 0.01, calls positive, puts negative. Source: https://github.com/Darthreign/gex-dashboard (acc. 2026-11-06). Edge-GEX-Lab uses the same sign convention with Black-Scholes r = q = 0. Source: https://github.com/simonro/Edge-GEX-Lab (acc. 2026-11-06).
- Gamma flip / zero gamma: zero-crossing of the net gamma profile near spot; Darthreign recomputes net GEX over a +/-8% spot grid with IV and maturities held fixed; Gex-Multi uses the nearest zero-crossing to spot. Sources: as above and https://github.com/itsfabtrading/Gex-Multi (acc. 2026-11-06).
- Call wall / put wall: strike with the most positive / most negative net dealer gamma. Source: Gex-Multi (acc. 2026-11-06).
- Magnet: strike with the largest gross gamma (call plus absolute put). Source: Gex-Multi (acc. 2026-11-06).
- HVL (MenthorQ, Darthreign): "high-volume level" pivot for the day; definition not published by MenthorQ on the pages fetched. UNVERIFIED beyond name.
- Blind Spot Levels (MenthorQ): zones where options liquidity is thin, so price may move sharply if entered. Source: https://menthorq.com/guide/how-quin-empowers-your-spx-morning-analysis/ (acc. 2026-11-06).
- Gamma Vacuum / Gamma Pin (SpotGamma TRACE): negative-GEX zones that may allow fast slides or squeezes vs zones that may stall price. Source: https://spotgamma.com/?p=19710 (acc. 2026-11-06).
- Stability Gauge (SpotGamma): "the likelihood of a large price move over the next 10 minutes"; formula not published. Same source.
- GCI, PGR, CAR (emlama): HHI of gamma by strike; share of total gamma within +/-$20 of spot; zomma/vomma exposure with time amplification. Source: https://github.com/emlama/gex-backtesting (acc. 2026-11-06).
- Expected move (tastytrade): 0.6 x ATM straddle + 0.3 x first OTM strangle + 0.1 x second OTM strangle. Source: https://tastyworks.freshdesk.com/support/solutions/articles/43000435415-expected-move (acc. 2026-11-06 via snippet).
- Expected move (SyntaxGeek, EzOptions, FlashAlpha, zer0dte): ATM call + put premium, anchored at open or rolled with remaining time. Sources: section 2.3, 3, 1.11.
- Expected move (thunderscarf): VIX1D / sqrt(252) x 0.5 x SPX. Source: https://github.com/thunderscarf/SPX_0DTE_Options_Selling_Public (acc. 2026-11-06).
- Expected move (ORB+EM script): previous session daily ATR x multiplier projected from the open. Source: https://www.tradingview.com/script/wi8FWF6L-ORB-Expected-Move-Trade-Bias-RWC (acc. 2026-11-06).
- Market Maker Move (thinkorswim): dollar magnitude shown only when front-month IV exceeds deferred months; `GetMarketMakerMove()`. Source: section 2.1.
- Pin score (FlashAlpha): 0-100 with OI, proximity, time and gamma components; plus max pain and top-3 OI concentration. Source: https://flashalpha.com/docs/lab-api-flow-zero-dte-snapshot (acc. 2026-11-06).
- Flow direction (FlashAlpha): live net GEX on effective OI minus settled net GEX on morning OI; labels no_flow / neutral / amplifying / dampening / regime_flip. Same source.
- Peg probability (Option Alpha): share of days SPX closes within +/-X% of its price at time T, minute data. Source: https://optionalpha.com/blog/0dte-intraday-spx-historical-prices (acc. 2026-11-06).
- Breadth regime (0DTE Breadth Classifier): Trend Up = ADD > +1500 and VOLD > +2.0; Trend Down = ADD < -1500 and VOLD < -2.0; else chop. Source: https://www.tradingview.com/script/bluz9EpQ-0DTE-Breadth-Classifier-YH (acc. 2026-11-06).
- Decay speed (OnSkop): (1-hour high-low range / 12) per 5 min vs approximated theta per 5 min; green when decay wins. Source: https://www.tradingview.com/script/eMkmzSAY-Options-Decay-Speed-for-0DTE (acc. 2026-11-06).
- Delta-band hedging (Numerix): hedge when net delta exceeds a threshold (e.g. 100 futures-equivalents), tightened in the last hour. Source: Numerix PDF (acc. 2026-11-06).


## 8. Reference tables

### 8.1 Sources attempted but not readable on 2026-11-06

- https://www.gexbot.com/ and /pricing (JS-rendered; title only)
- https://vol.land/ and /pricing (JS-rendered; title only)
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4404704 and ...=5641974 (403)
- https://benzinga.com/z/33837719 (403)
- https://www.theocc.com/market-data/market-data-reports/other-market-data-info/batch-processing (403)
- https://trendspider.com/blog/menthorq-levels-indicators/ (403)
- https://gammaedge.kit.com/posts/the-only-three-zones-you-need-to-master-spx-0dte-swing-trading (403)
- https://support.spotgamma.com/hc/en-us/articles/15297419607571-Cloud-Notes (403) and .../1500006926242 (503)
- https://c.0-dte.com/?p=24947 (host did not resolve from this session)
- https://menthorq.com/wp-content/uploads/2023/11/Product-Training-Gamma-Levels.pdf (exceeded fetch size limit)
- https://recapio.com/digest/... (two YouTube digests; page content not generated)

### 8.2 Expected-move formulas compared

| Source | Formula | Anchoring | Notes |
|---|---|---|---|
| tastytrade | 0.6 x ATM straddle + 0.3 x 1st OTM strangle + 0.1 x 2nd OTM strangle | per expiry | labelled 68% |
| SyntaxGeek (TradingView) | ATM call + put | snapshot at open, static | needs OPRA feed |
| FlashAlpha | straddle-based; reports implied and remaining 1-sigma | rolling | per-feed timestamps |
| zer0dte | IV and ATM straddle; reports % consumed | rolling | provider unnamed |
| EzOptions-Schwab | ATM straddle | rolling | Schwab live chain |
| thunderscarf | VIX1D / sqrt(252) x 0.5 x SPX | at 9:45 entry | VIX1D from Polygon |
| ORB+EM script | prior-day ATR x multiplier from open | static | no options data |
| Gex-Multi | 1D +/-1 sigma band | daily | "68% containment not validated" |
| MenthorQ | proprietary 1D Min/Max | daily | claims 87%/85% hold |
| ATAS | IV from live quotes; cone or corridor | rolling or static | user picks |

Sources: sections 2.2, 2.3, 1.11, 3, 1.2 (all acc. 2026-11-06).

### 8.3 Data freshness and provenance across vendors

| Vendor / tool | Stated cadence | Delay disclosure | Provenance fields |
|---|---|---|---|
| SpotGamma TRACE | 1 minute | not stated | none public |
| SpotGamma HIRO | "real-time" | not stated | none public |
| MenthorQ | 14 snapshots/day (30 min) | not stated | none |
| Unusual Whales | 10 min (Basic) / 1 min (Max); free tier flow 2 days late | explicit per tier | none shown |
| OptionsDepth Pro Max | 1 min or 10 min (page inconsistent) | not stated | 30-day intraday history |
| GEXBot (3rd-party) | "every few minutes" | not stated | change token |
| TradingVolatility | AM/PM runs; user-triggered pulls | "may be delayed 15 minutes" | Tradier key for real-time |
| Option Alpha GEX | top of every minute (since 2025-11-14) | not stated | GEX profile at position open/close minute |
| FlashAlpha | 15 min Free / 15 s Basic / ~1 s Alpha | explicit | `data_as_of` per feed, `snapshot_age_seconds`, data-quality score |
| Edge-GEX-Lab | 60 s | "about 15 minutes delayed" (Cboe) | "Untested" chips; "Real positioning is not public" |
| gammagrid | 15 min floor | "15-20 minutes" (Yahoo) | "snapshot-based, not a live trade stream" |
| Darthreign | 60 s refresh; 10-min snapshots | "~15 min" (Cboe) | endpoint "non contractuel" |
| 0DTE-dealer-gamma | 5 s WS / 30 s REST | "nominal 15 minutes" (Yahoo) | quote freshness "can be unknown" |
| EzOptions-Schwab | 1 s push; 1-min collector | real-time (Schwab) | session expires ~7 days |
| TradingView | per plan | "D" badge; paper orders refused on delayed feeds | n/a |

Sources: sections 1, 3, 5.7 (all acc. 2026-11-06).

---

## Top 15 ideas to adopt (ranked, with effort and what evidence supports them)

Effort scale: Low = under a day inside existing modules; Medium = a few days with new data plumbing or new ledger fields; High = new data source or model with validation.

1. Single verdict card with an explicit NO TRADE state. Render one line per decision cycle: setup family (or NO TRADE), confidence, the 2-3 supporting conditions, the risk flags, and the promoted levels. Effort: Low (presentation over the existing ensemble and setup families). Evidence: FlashAlpha `setup`/`headline` blocks; zer0dte entry score with verdict; ORB+EM four-state output with a <45% NO TRADE tier; MenthorQ safe/fragile/dangerous (sections 1.11, 3, 2.3, 1.2).

2. Remaining expected move next to the opening-anchored EM, with "% of EM consumed". Compute EM from the ATM straddle (and VIX1D as a cross-check), scale by sqrt(time remaining), and show both the open-anchored band and the shrinking cone. Effort: Low. Evidence: ATAS cone vs corridor and its note on why full-day EM confuses users; FlashAlpha `expected_move.remaining`; zer0dte "percentage consumed"; SyntaxGeek anchored EM; thunderscarf VIX1D formula (sections 2.3, 1.11, 3, 2.5).

3. Split 0DTE-only GEX from full-chain GEX and show the 0DTE share. Separate 0DTE flip/walls, report "share of gamma expiring today", and floor time-to-expiry when computing late-day ATM gamma. Effort: Low-Medium. Evidence: MenthorQ 0DTE-only levels; SpotGamma 0DTE strike plot (volume vs OI); Gex-Multi 0DTE sublevels and the 1/262 floor; FlashAlpha `exposures.zero_dte_share`; Adams et al. showing most expiry-day hedging comes from older positions that became 0DTE (sections 1.2, 1.1, 3, 1.11, 4.1).

4. Per-feed freshness and provenance chips, and a hard gate on paper orders from delayed data. Show `data_as_of` per feed, snapshot age, and an "assumption" chip on signed GEX ("dealer sign assumed; real positioning not public"); block paper fills when the quote feed is stale. Effort: Low. Evidence: TradingView "D" badge and its paper-order refusal; FlashAlpha metadata fields; Edge-GEX-Lab "Untested" chips; Unusual Whales per-tier delay statements (section 5.7).

5. Breadth regime classifier on ADD/VOLD/TICK with published thresholds. Label trend-up (ADD > +1500 and VOLD > +2.0), trend-down (mirror), else chop; keep a daily-reset cumulative TICK; RTH only; log the label in the ledger so setups can be conditioned on it. Effort: Low (TICK already ingested). Evidence: 0DTE Breadth Classifier rules; cumulative-TICK thinkScript gist; Gao et al. finding that intraday momentum is stronger on volatile/high-volume days (sections 2.3, 2.1, 4.1).

6. Explicit time-window guardrails per setup family, with a default flatten time. Codify entry windows and a 15:45 flatten default for all families except the 15:50-16:00 strike-flip module, which gets its own max-loss cap, spread guard and auto-cancel timer. Effort: Low. Evidence: Numerix ("some clearing firms mandate ... flattened by 3:45pm"; tighten delta thresholds in the last hour); Option Alpha ICs opened within 2 h of open averaged -0.36% vs +37% later; Trade Echo "no new entries after 2:00 PM"; Tachyon's 3:45/3:51/3:53 schedule; YouTube rule sets' 3:30-3:45 time stops (sections 4.3, 2.5).

7. Level-hold accuracy tracker in the self-grading loop. For every published level (walls, flip, EM bounds, 1D range) record whether it held, was touched or was broken, by time of day; show rolling hold rates next to each level. Effort: Medium (new ledger table plus replay backfill). Evidence: zer0dte `accuracy`; MenthorQ publishing 87%/85%/73% hold rates; Gex-Multi's admission that its 68% band is unvalidated; Option Alpha storing the GEX profile at open/close minute (sections 3, 1.2, 5.6).

8. Pin score and max pain for the 15:50-16:00 strike-flip module. Compute a 0-100 pin score from OI concentration, proximity, time remaining and gamma at the magnet strike; show top-3 OI concentration and volume-vs-OI at round-number strikes. Effort: Low-Medium. Evidence: FlashAlpha `pin_risk` components; SpotGamma 0DTE strike plot rule ("high 0DTE OI at a round number ... may act as a magnet into the 4:00 PM close"); Cboe 2023 note that the net gamma range widens into the close; Numerix on knife-edge delta near strikes (sections 1.11, 1.1, 4.3).

9. Event-risk gate from a free calendar plus early-close detection. Block or down-weight entries around FOMC/CPI/NFP and flag half-days; store the event list in the ledger for replay. Effort: Low-Medium. Evidence: Schwartz avoids Fed days and pre-release days; Trade Echo avoids scheduled events; thunderscarf includes an event filter; zer0dte and Tier1Alpha ship calendars; Finance Calendar API offers keyless JSON/ICS (sections 2.5, 3, 1.7, 4.6).

10. Settled-OI vs flow-adjusted ("live") GEX with a flow-direction label. Keep the overnight OI snapshot as the baseline, adjust with intraday volume as a proxy for new positioning, and label the shift no_flow / neutral / amplifying / dampening / regime_flip, clearly marked as a proxy because taker side is unobserved. Effort: Medium. Evidence: FlashAlpha `flow_direction`; Option Alpha per-minute snapshots with intraday volume by strike; RTGamma's open-vs-real-time framing (anecdotal); Darthreign's explicit caveat that the delta-flow proxy is "not real signed order flow" (sections 1.11, 4.3, 3).

11. Liquidity/execution score and a fill simulator in contract ranking. Add ATM and premium-weighted spread %, volume-to-OI and a modelled fill probability with a stale-quote guard to the $200-budget ranker. Effort: Medium. Evidence: FlashAlpha `liquidity.execution_score` and its fill-simulator repo; zer0dte `liquidity` (spreads, volume, fill probability); Beckmeyer et al. on retail trading into wider spreads near expiry; optopsy's own disclaimer that it ignores slippage (sections 1.11, 3, 4.2).

12. Discord webhook alerts, severity-graded, one embed per event. Fire on regime flip, level break, EM-bound breach, VIX1D spike and ledger decisions; colour by severity; respect webhook rate limits; never couple to execution. Effort: Low. Evidence: zer0dte alert severities; Darthreign Discord "state verdict" bot; Unusual Whales Discord bot product; Discord embed and rate-limit guidance (section 5.5).

13. Two-scale grading plus rule-adherence counts in the ledger. Grade each decision on setup quality (A-F) and on execution/adherence (Perfect/Decent/Improve), and count rule breaks against the equity curve. Effort: Low. Evidence: Tanto's two-scale rationale; Edgewonk Tiltmeter and setup checklists; TradeZella playbooks and MAE/MFE (section 5.6).

14. Time-of-day "peg" priors computed from your own replay store. Reproduce Option Alpha's table (probability SPX closes within +/-0.1%-0.5% of its price at 10:30, 11:00, 13:30, 14:00, 15:00) from stored minute data and expose it to the iron-condor and strike-flip families. Effort: Medium. Evidence: Option Alpha peg figures (53.3% at 10:30/0.30%; 65.6% at 14:00/0.20%; 90.6% at 13:30/0.50%); Cboe's observation that 0DTE pinning near high-OI strikes is a real intraday pattern even if systemic impact is small (sections 2.5, 4.3).

15. Short-horizon stability gauge (next-10-minute large-move likelihood). Nowcast from net 0DTE gamma at spot, realised 1-minute variance and TICK extremes; use it to tighten stops or veto range trades. Effort: Medium. Evidence: SpotGamma's Stability Gauge definition; Adams et al. (higher net gamma predicts lower vol over the next 10 minutes, fading after ~1 hour); Baltussen et al. (no intraday momentum on positive net-gamma days) (sections 1.1, 4.1).

### Acceptance tests for the 15 ideas (so the ledger can grade the adoption itself)

1. Verdict card: every decision cycle emits exactly one verdict row; NO TRADE appears on at least the event-gated and chop-labelled cycles; replay can regenerate the card byte-for-byte.
2. Remaining EM: at 15:30 the remaining 1-sigma band is narrower than the open-anchored band by roughly sqrt(remaining/total) with the straddle held fixed; both bands logged.
3. 0DTE/full split: 0DTE share of total GEX is logged each snapshot; 0DTE flip and walls differ from full-chain values on at least some days; ATM gamma near 15:55 does not blow up (time floor applied).
4. Freshness gate: a forced 20-minute stale quote blocks paper fills and the UI shows the stale chip; `data_as_of` is stored per feed.
5. Breadth regime: label distribution over 30 sessions is non-degenerate; label is available at every TICK update; thresholds are config, not code.
6. Time guardrails: no non-strike-flip paper position exists after 15:45 in replay of 30 sessions; strike-flip module has a cancel timer that fires in replay.
7. Level-hold tracker: each level has hold/touch/break counts; rolling hold rate shown; report compares against MenthorQ's published 73%-87% figures as a sanity band, not a target.
8. Pin score: score components sum to the displayed score; the magnet strike equals the max gross-gamma strike unless OI concentration overrides it; logged at 15:50.
9. Event gate: FOMC, CPI and early-close days are flagged automatically; the gate's effect is a logged reason on blocked cycles.
10. Settled vs live GEX: both numbers and the label are logged per snapshot; the label is marked "proxy"; regime_flip events are replayable.
11. Liquidity score: contract ranking rejects quotes older than N seconds and spreads wider than X% of mid; fill simulator results are logged against later realised mids.
12. Discord alerts: one embed per event with severity colour; a 60-event burst does not trip the webhook rate limit (queue or coalesce).
13. Two-scale grading: every closed paper position has a setup grade and an execution grade; rule-break count is plotted against equity.
14. Peg priors: table computed from the replay store for 10:30/11:00/13:30/14:00/15:00 at 0.1-0.5%; values stored with sample size and date range.
15. Stability gauge: the gauge's 10-minute large-move hit rate is tracked in the self-grading loop before it is allowed to veto or promote any setup.

Honourable mentions (not ranked): session-similarity lookup ("past sessions most similar to today" and regime-transition outcomes, zer0dte); dealer-hedge scenario table (shares to trade for 10/25/50/100 bp, FlashAlpha and Numerix); SPX-to-ES/SPY level mapping with daily basis (SpotGamma Bookmap, EzOptions carry ratio); synchronized replay across panes (gexsync).

---

## Ideas to avoid (and why)

1. Treating any vendor's "true dealer positioning" as ground truth. Cboe's own analyses find customer 0DTE flow "very balanced" and net MM gamma hedging "de minimis" (~0.2% of SPX liquidity); Edge-GEX-Lab measured its free-feed 0DTE net GEX "off by as much as half" versus OPRA; VolSignals' FAQ concedes positioning "does not predict the market." Keep the explicit dealer-sign assumption, keep the unsigned view, and never let a signed-GEX number alone trigger a setup. Sources: sections 4.3, 3, 1.9.

2. Mechanical high-probability 0DTE credit-spread / iron-condor selling without stops, especially before noon. Vilkov: simple unhedged 0DTE strategies "seldom paid off gross of costs"; Chong: after costs the vol-arbitrage Sharpe is economically insignificant; Option Alpha: ICs opened within 2 h of the open averaged -0.36%. Sources: section 4.2, 2.5.

3. The last-30-minute intraday-momentum rule as a standalone edge. Replications find profitability concentrated in 2008 and recommend a VIX>20 filter; Baltussen et al. tie the effect to gamma-hedging demand, so it should be conditioned on net gamma, not run unconditionally. Source: section 4.1.

4. HMM/GMM regime classifiers fitted on intraday bars. The available packages (hidden-regime, market-regime-detection) are built on daily data; tutorial authors warn HMMs are "less effective in very short-term ... trading due to ... noise." Prefer rule-based regimes (breadth, gamma sign, EM consumption) that are auditable in the ledger. Sources: section 3; https://www.marketcalls.in/python/introduction-to-hidden-markov-models-hmm-for-traders-python-tutorial.html (acc. 2026-11-06 via snippet).

5. Scraping Cboe's delayed JSON as the live production feed. It is undocumented, "non-contractual", ~15 minutes delayed, OI is one session behind, SPX spot shows the prior close before ~09:45, and site terms restrict automation. Fine for development and replay seeding; not for live decisions. Source: section 4.7.

6. SPY x10 or Yahoo as an SPX chain proxy. 0DTE-dealer-gamma's default and gammagrid's third-Friday SPXW gap show why: wrong strikes, incomplete chains, unknown quote freshness. Source: section 3.

7. TradingView "gamma level" overlays that do not consume option data. At least one popular script states it "does NOT use real options chain data." Source: section 2.3.

8. Rebuilding a TRACE-style 1-minute signed positioning heat-map from OI alone. OI updates daily; intraday sign requires quote-matched trade-side labelling (emlama) or licensed participant-tagged data (OptionsDepth, quantedOptions). Label any intraday adjustment as a volume proxy (idea 10) rather than claiming positioning. Sources: sections 3, 1.4, 1.11.

9. Adopting signal-service rule sets verbatim. Trade Echo's published example violates its own 1%-move and 5-10%-OTM rules; Tachyon's full filter definitions are not public and it has no live track record; 0-dte.com and GammaEdge pages were unreachable. Sources: section 2.5.

10. Vanna/charm "flow" arrows as directional calls. Vendors that sell them (Volland, VolSignals) publish no validation; Cboe's data and Adams et al. explain most expiry-day hedging by pre-existing longer-dated positions, which argues for modelling the aggregate rather than reading daily charm arrows as direction. Sources: sections 1.6, 1.9, 4.1, 4.3.

11. Using the JPMorgan "5% to 25%" scenario as an operating assumption. It is a 2023 tail-scenario note; Cboe's 2023 and 2025 analyses found no measurable increase in one-minute gap moves. Keep it as a stress case for the risk cap, not as a signal. Sources: section 4.3.

12. Over-polling the broker API. Schwab's legacy figure is ~120 non-order requests/min per app and sessions expire in ~7 days (EzOptions, schwab-py notes); design for a minute-level collector plus streaming, not per-second REST chains. Sources: sections 3, 4.7.

13. Expecting Greeks from free sandboxes. Tradier's sandbox lists Greeks and indices as "Not Available"; compute Greeks locally from mid prices (as every OSS repo does) and record the pricing inputs in the ledger. Source: section 4.7.

14. Paying for Nasdaq NOII / NYSE imbalance feeds for an SPX options terminal. They are subscription-only, equity-level, and the free NYSE tool is three-month history, not a feed; the 15:50 module gains more from pin score and EM consumption than from single-stock imbalances. Source: section 4.5.

15. Building a real-time "stability gauge" or flow label without an accuracy log. The one open-source project that ships such labels (Edge-GEX-Lab) prints "untested" on them; zer0dte at least ships an accuracy tool. Any new nowcast must enter the self-grading loop (idea 7) before it is allowed to veto or promote a setup. Sources: section 3.
