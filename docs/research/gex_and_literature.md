# Research memo: Gamma exposure (GEX), dealer-positioning inference, 0DTE SPX, pinning, and hedging-linked intraday momentum/reversal

Prepared: 2026-11-06. All URLs were accessed on 2026-11-06 unless stated otherwise.

## 0. How to read this memo

Every claim is tagged with one of three evidence classes:

- **[A] Established market mechanics** — contract rules, exchange data definitions, closed-form Greeks, arithmetic identities.
- **[B] Published empirical findings** — peer-reviewed or working papers, exchange research with disclosed data; I give sample period and effect sizes when the source reports them.
- **[C] Practitioner folklore / hypotheses** — vendor documentation, blogs, repo READMEs, press. Useful for feature ideas; not evidence.

Access caveats, stated up front:

- SSRN abstract pages returned HTTP 403 to every fetch method available to me (WebFetch and curl with browser UA). Where I cite an SSRN paper, I say what I verified from (i) a locally extracted PDF of the paper when one was available elsewhere, (ii) the authors' own pages/abstract aggregators, or (iii) secondary summaries, and I label the latter as such.
- SpotGamma's support-center articles are behind a Cloudflare challenge (403). Their definitions below come from SpotGamma's own public pages/PDFs that did load, or from the support-article text as surfaced in search results (labelled).
- Perfiliev's widely-copied "How to calculate gamma exposure and zero gamma level" page could not be loaded (503 / TLS). Its method is described second-hand via the repos that implement it.
- Full-text PDFs I extracted locally with pdftotext and quote from: SqueezeMetrics GEX white paper; Almeida-Freire-Hizmeri "0DTE Asset Pricing" (May 2025 draft); Baltussen-Da-Lammers-Martens (JFE 2021); Cboe "Much Ado About 0DTEs" (Sept 2023) and "0DTEs Decoded" (May 2025); Pearson-Poteshman-White (2006 WP); Avellaneda-Lipkin (QF 2003); Gao-Han-Li-Zhou (Dec 2015 WP); Pagano-Peng-Schwartz (CFS WP 2008/45); MenthorQ "Product Training: Gamma Levels" deck; Numerix "Gamma hedging of 0DTE options" white paper; SpotGamma HIRO User Guide (Dec 2025).

---

## 1. Executive summary

1. **The "GEX" number everyone computes is a sign-assumed, OI-weighted sum of Black-Scholes gammas.** The original SqueezeMetrics (2016/2017) definition is `GEX = Γ · OI · 100` per call line and `Γ · OI · (−100)` per put line, summed over all strikes and expirations, under four stated assumptions (all options are facilitated by delta-hedgers; investors sell calls and buy puts; dealers hedge exactly to delta). The now-standard "dollar GEX per 1% move" variant multiplies by `S² × 0.01`. [A]/[C]
2. **The sign assumption is the weakest link and the exchange says it is wrong for 0DTE.** Cboe, which sees customer-vs-market-maker and buy-vs-sell on every SPX trade, reports 0DTE customer flow is "remarkably balanced": on 2023-08-15 the 4440 put traded >100k contracts but market makers ended net short only ~3k (52k buy vs 55k sell); typical SPX 0DTE net market-maker gamma was $170mm–$670mm over the day in 2022–23, i.e. 0.04%–0.17% of daily ES notional; on the April 2025 tariff days it never exceeded ~0.2%. [B, exchange-sourced]
3. **Academic evidence on 0DTE gamma → realized volatility is mostly "no amplification, if anything dampening."** Dim-Eraker-Vilkov (2024) find higher 0DTE OI gamma is associated with *lower* intraday RV and does not propagate overnight; Adams et al. (2025) find index vol ~60 annualized bps lower on 0DTE days pre-May-2022 and that higher net gamma predicts lower vol over the next 10 minutes and stronger E-mini order-flow reversals (fading after ~1 hour). A press-reported Utah study (Brogaard-Han-Won) claims the opposite (+14% daily vol per 1 SD of 0DTE volume); I could not open it. [B]
4. **Buying 0DTE options has negative expected return with a heavy right tail; the premium is largest for OTM calls and mid-day.** [B]
   - Almeida-Freire-Hizmeri (Cboe 1-minute data, 2012-01-06 → 2025-03-18, 1,815 expiry days): negative average call and put returns across strikes; OTM call returns *more* negative than OTM put returns; significantly negative ATM delta-hedged call/straddle returns, strongest 12:00–14:00; annualized 0DTE variance risk premium up to 4× the longer-horizon VRP.
   - Beckmeyer-Branger-Gayda (Cboe trader-type data, Jan 2021–Feb 2023): retail long 0DTE positions lost 53% of value on average (61% after daily expiries) while shorts returned 48%; ~60% of retail losses are transaction costs.
   - Vilkov: unhedged held-to-expiry rules "seldom paid off gross of costs," with P&L explained by realized skewness. Chong (2026): 0DTEs "expensive but not mispriced" after costs.
5. **Pinning is documented for single stocks (physically-settled, American) and for S&P 500 *futures* on futures-option expiries; for cash-settled European SPX index options the published result is *anti-cross-pinning* (futures pushed *away* from the carry-adjusted ATM strike before SPX expiration).** Nothing published studies the last 10 minutes of SPXW 0DTE into the 4:00 pm settlement. [B]/[gap]
6. **Hedging-demand intraday momentum is real in the data but is conditional on dealer gamma sign.** Baltussen et al. (JFE 2021; 1974–2020, 60+ futures): last-30-minute return is predicted by rest-of-day return; for S&P 500 futures 1996–2020 the slope is 6.63 (t=4.78, R² 3.58%) on negative-NGE days and 0.82 (t=1.03, R² 0.05%) on positive-NGE days. Their NGE is the SqueezeMetrics formula (they verified it against OptionMetrics 2002–2017, "virtually identical"). Adams et al. find the mirror image intraday: higher net gamma → *negative* high-frequency return momentum. [B]
7. **For the final minutes, the relevant Greek is charm/the digital-ness of the ATM 0DTE, not "GEX."** As τ→0 the ATM option value → expected intrinsic under the remaining-minutes distribution and delta → a step function; dealer re-hedging in the final minutes is driven by the time-derivative of delta (Avellaneda-Lipkin's pinning force) and by position closing. Cboe shows 0DTE net gamma widens into the close (3:30 pm median +$173mm, IQR −$1.1bn to +$2.4bn), and retail 0DTE *closing* volume is U-shaped with ~12% of opening trades in the last 30 minutes. [A]/[B]
8. **SPXW settlement is not the 4:00:00 pm index print.** The exercise-settlement value "is calculated using the closing sales price in the primary market of each component security on the expiration date," i.e. the official S&P 500 close built from closing-auction prints, while trading in expiring SPXW ceases at 3:00 pm CT. The gap between the last pre-close index tick and the settlement value is a measurable, unstudied quantity. [A]
9. **Public repos are useful for plumbing, not for evidence.** [C]
   - Of ~16 repos reviewed (77 on GitHub's `gamma-exposure` topic, 39 on `0dte`), none publishes a validated predictive statistic; one (zrack) states "predictive_validity: unmeasured" outright.
   - Bugs/handling choices to avoid: 0DTE dropped by business-day counting (jensolson); `np.interp` zero-crossing on a non-monotone profile (jensolson); r=q=0 (pikki622, Edge-GEX-Lab); IV held fixed when repricing across spot (Darthreign and others); 0DTE τ floored at 1/262 yr (pikki622); SPY×10 as "SPX" (puneet-chandna); yfinance SPXW gaps on third Fridays (gammagrid).
   - Most reusable: Cboe's free delayed JSON endpoint (gex-tracker), FlashAlpha's spot-reprice-with-bisection flip, Darthreign's volume-weighted "HVL," Edge-GEX-Lab's unsigned view, emlama's side-classified trade data from Polygon flat files and its Gamma Concentration Index, and emlama's pre-registered/FDR-controlled test design.

---

## 2. GEX methodology

### 2.1 SqueezeMetrics: the original definition [A for the formula, C for the interpretation]

Source: SqueezeMetrics Research, *Gamma Exposure (GEX)™: Quantifying hedge rebalancing in SPX options*, March 2016, revised December 2017. [PDF](https://squeezemetrics.com/monitor/download/pdf/white_paper.pdf) (accessed 2026-11-06; extracted locally).

Verbatim formulas (p. 5):

- "To calculate the GEX (in shares) of all call options at a particular strike price in a contract: `GEX = Г · OI · 100` Where Г is the option's gamma, OI is the open interest in the particular option strike, and 100 is the adjustment from option contracts to shares of the underlying."
- "In the case of put options: `GEX = Г · OI · (-100)` The share adjustment is negative here because for market-makers, where calls represent long gamma, puts represent short gamma."
- "The GEX of a stock (or index) is the summation of GEX at every strike price in every available contract."
- Margin note: "When computing for SPX, we denominate GEX in dollars." (The paper does not print the dollar scaling; the `× S² × 0.01` convention below is the practitioner standard.)

The paper's "Four Assumptions" (p. 4), verbatim headings:

1. "All traded options are facilitated by delta-hedgers."
2. "Call options are sold by investors; bought by market-makers." Justification offered: "A vast majority will trade at the midpoint of the bid and ask. It is apparent from an analysis of skew, open interest at strike, and (circularly) the effects of GEX, however, that the practice of call overwriting (and stock collaring) drives the market for calls."
3. "Put options are bought by investors; sold by market-makers."
4. "Market-makers hedge precisely to the option delta." (They acknowledge hedging bands exist.)

Interpretation claimed (p. 6): positive GEX ⇒ market makers "buying into lows, selling into highs" (vol-dampening); negative ⇒ the opposite; "a GEX figure approaching zero will allow the market to move naturally."

Empirical claim in the paper (p. 2), no sample period stated: comparing the highest and second-highest quartiles of GEX, the subsequent 1-day SD of SPX returns is 0.55% vs 0.85%; by contrast the lowest and second-lowest VIX quartiles give 0.51% vs 0.66%. A scatter of SPX returns vs prior-day GEX is shown without statistics. Treat as [C] on evidentiary strength (no sample dates, no standard errors), [B]-adjacent in that Baltussen et al. later replicated the construction.

### 2.2 Dollar GEX "per 1% move" (the SpotGamma/Perfiliev convention) [A arithmetic, C naming]

Per-contract line, as implemented identically in gex-tracker, gex-analytics, Edge-GEX-Lab, gex-dashboard, FlashAlpha:

```
GEX_i ($ per 1% move) = sign_i × Γ_i × OI_i × 100 × S × (S × 0.01)
                      = sign_i × Γ_i × OI_i × S²            (since 100 × 0.01 = 1)
sign_i = +1 for calls, −1 for puts
```

Reading: `Γ × 100 × OI` is the change in dealer share-equivalent delta per $1 move; × `S × 0.01` converts "$1 move" into "1% move"; × `S` converts shares into dollars. So `Σ GEX_i` is the dollar notional dealers must trade for a 1% spot move under the sign assumption. Sources: [Matteo-Ferrara/gex-tracker README and main.py](https://github.com/Matteo-Ferrara/gex-tracker) ("Call gamma = spot price × gamma × open interest × contract size × spot price × 0.01"); [FlashAlpha methodology](https://flashalpha.com/methodology) ("signed sum of Γ × OI × 100 × spot² × 0.01 (calls +, puts −)"); [Darthreign/gex-dashboard](https://github.com/Darthreign/gex-dashboard) ("GEX ($ per 1% move) = γ × OI × 100 × spot² × 0.01 … the 'naive' SpotGamma convention"). All accessed 2026-11-06.

Note on nomenclature: SpotGamma's exact formula is not public; repos call this "the SpotGamma convention" because of SpotGamma's blog posts, not because SpotGamma published code. [C]

Some vendors drop the `S × 0.01` factor and quote `Γ × OI × 100 × S` ("shares-equivalent delta change per $1"): FlashAlpha's older article pages use this form while its methodology page uses `S²`; the search-result summary for FlashAlpha's own article shows both ([FlashAlpha GEX formula article](https://flashalpha.com/articles/how-to-calculate-gamma-exposure-gex-formula-worked-example), accessed 2026-11-06). Always check units before comparing numbers across vendors.

### 2.3 Baltussen et al.'s academic version of the same quantity [B]

Baltussen, Da, Lammers, Martens, "Hedging demand and market intraday momentum," *JFE* 142(1), 2021, 377–403, eqs. (13)–(15) ([PDF](https://academicweb.nd.edu/~zda/intramom.pdf), accessed 2026-11-06; extracted locally):

```
NGE^C_{s,m,t} = Γ^C_{s,m,t} · OI^C_{s,m,t} · 100 · P_t          (calls)
NGE^P_{s,m,t} = Γ^P_{s,m,t} · OI^P_{s,m,t} · (−100) · P_t       (puts)
NGE_t = [ Σ_calls NGE^C + Σ_puts NGE^P ] / MV_t                 (MV_t = S&P 500 market value)
```

"Using data from OptionMetrics, we compute the NGE measure from 1996 until the end of 2017. We use data from SqueezeMetrics to extend the sample until May 2020." Footnote 7: "We have verified the computations of SqueezeMetrics using OptionMetrics data over the 2002 to 2017 period, yielding virtually identical results." Footnote 8 is the key caveat: "NGE is on average positive for most days … our sample misses many long puts and short calls typically done OTC by institutional investors." In 1996–May 2020 there were 2,930 negative-NGE days and 3,158 positive.

### 2.4 Aggregations [A]

- **Total GEX**: Σ over all strikes and all expirations (SqueezeMetrics, Baltussen). Repos differ on filters: gex-tracker's total is unfiltered but its charts keep strikes in 85–115% of spot and expiries < 365 days ([main.py](https://github.com/Matteo-Ferrara/gex-tracker/blob/main/main.py)); jensolson keeps only `0.01 < IV < 2` and `|Δ| < 0.95` and *drops same-day expiries* ([GEX.py](https://github.com/jensolson/SPX-Gamma-Exposure/blob/master/GEX.py)).
- **GEX by strike**: Σ over expirations at each K (the bar chart). "Call wall" / "put wall" are argmaxes on this vector (below).
- **GEX by expiration**: Σ over strikes at each expiry; used to show the 0DTE share.
- **Strike × expiry surface**: gex-tracker, gammagrid.

### 2.5 "Zero gamma" / "gamma flip" — two distinct algorithms [A]

**Algorithm 1 — cumulative-sum crossing (cheap, common, wrong in general).** Sort strikes; cumulate signed per-strike GEX; the flip is the K where the cumulative sum crosses zero (interpolate between adjacent strikes). FlashAlpha's concept page documents this version: "gamma_flip = price where Σ GEXᵢ(K) = 0 … interpolating between adjacent strikes where the sign changes" ([FlashAlpha gamma-flip concept](https://flashalpha.com/concepts/gamma-flip), accessed 2026-11-06). A third-party reverse-engineering site claims GEXBot's "zero gamma" and MenthorQ's HVL use "the strike where cumulative GEX is at its minimum within the active strike window" — I could not load that site (502) and cite it only as surfaced in a search snippet ([sslip.io methodology page](https://13.140.148.217.sslip.io/methodology), not verified). [C]

Why it is wrong in general: per-strike GEX is evaluated with gamma *at today's spot*. Gamma of each contract changes as spot moves, so the dealer book's net gamma at a hypothetical spot S' is not the partial sum of today's strike bars.

**Algorithm 2 — spot-reprice profile (correct under the model).** For each hypothetical spot S' on a grid, recompute every contract's Black-Scholes gamma `Γ_i(S')` holding σ_i, τ_i fixed (or sliding σ along the smile), form `Net(S') = Σ sign_i Γ_i(S') OI_i S'²·0.01·100`, and find the root nearest current spot. This is the Perfiliev method as implemented by phammings and pikki622, and by jensolson's `sens=True` branch ("Gamma is recomputed with `blackGamma(x, F=F, rf=rf)` for each of 20 hypothetical spot levels … `zeroGEX = int(np.interp(x=0, xp=s.values, fp=s.index))`"), by Darthreign ("net GEX profile is recomputed over a grid of spots within ±8% of the current spot, with IV and maturities held fixed. The flip is the zero crossing nearest the spot, found by interpolation"), and by FlashAlpha's methodology page ("walks a ±8% band around spot in fine steps to the first regime-consistent sign change and refines the root by bisection"). Sources: [jensolson GEX.py](https://github.com/jensolson/SPX-Gamma-Exposure/blob/master/GEX.py); [Darthreign/gex-dashboard](https://github.com/Darthreign/gex-dashboard); [pikki622/gex-analytics](https://github.com/pikki622/gex-analytics); [FlashAlpha methodology](https://flashalpha.com/methodology). All accessed 2026-11-06.

Pseudo-code (our reference implementation should look like this):

```
inputs: chain rows (K_i, type_i, OI_i, σ_i, τ_i), spot S, r, q
grid  = S × (1 + k·δ), k = −N..N   (δ = 0.1% or 10 bps; N so that ±8–10%)
for S' in grid:
    d1_i = [ln(S'/K_i) + (r − q + σ_i²/2) τ_i] / (σ_i √τ_i)
    Γ_i  = e^{−q τ_i} φ(d1_i) / (S' σ_i √τ_i)
    Net(S') = Σ_i sign_i · Γ_i · OI_i · 100 · S'² · 0.01
flip = root of Net(S') nearest S (bracket sign change; bisection), or "none in band"
also report: all roots in band; Net(S); slope dNet/dS' at S (the "regime strength")
```

**Worked example (illustrative numbers, not data).** Spot S = 6,000, r = q = 0, 0DTE at 15:50 ET (10 minutes left), ATM IV 14% annualized. Trading-time τ = (10/390)/252 = 1.0175e-4 yr, √τ = 0.01009, so `σ√τ = 0.14 × 0.01009 = 0.001412` ⇒ 1σ remaining move ≈ 8.5 index points. Per-contract gamma at K = 6,000: `Γ = φ(0)/(S σ √τ) = 0.3989/(6000 × 0.001412) = 0.0471`. If OI is 20,000 calls and 20,000 puts at 6,000:

```
GEX_call(6000) = +0.0471 × 20,000 × 100 × 6000² × 0.01 = +$33.9bn per 1%
GEX_put(6000)  = −0.0471 × 20,000 × 100 × 6000² × 0.01 = −$33.9bn per 1%
net (naive)    = 0            ; unsigned = $67.8bn per 1%
```

Two things follow. First, the "per 1% move" unit is nonsense at 10 minutes to expiry: a 1% move is 7σ_rem, far outside the Gaussian band where Γ is valid, so the dollar number says nothing about actual flows. Report instead the delta change for a 1σ_rem move: `ΔΔ ≈ (Φ(1) − Φ(0)) × OI × 100 = 0.34 × 20,000 × 100 = 680k share-equivalents ≈ $4.1bn` per side, with sign unknown. Second, the balanced OI at the magnet strike is exactly the Cboe picture: a huge gross number with a net that depends entirely on who is short which side. The same strike at 10:00 (380 minutes left, √τ = 0.0622) has `Γ = 0.3989/(6000 × 0.00871) = 0.00763`, 6× smaller — the 0DTE share of total GEX rises mechanically through the day even with no new trading.

Reference implementation sketch (what the platform should actually run; vectorized):

```python
def chain_profile(rows, S, r, q, minutes_left, grid_bps=10, band_pct=8):
    # rows: K, cp (+1 call/-1 put), oi, iv (annualized, decimal), expiry_minutes_left
    tau = np.maximum(rows.expiry_minutes_left, 0.5) / (390*252)  # trading-time years, floor 30s
    grid = S * (1 + np.arange(-band_pct*100, band_pct*100+1, grid_bps) / 1e4)
    net = np.empty_like(grid); uns = np.empty_like(grid)
    for g, Sp in enumerate(grid):
        d1 = (np.log(Sp/rows.K) + (r - q + 0.5*rows.iv**2)*tau) / (rows.iv*np.sqrt(tau))
        gamma = np.exp(-q*tau) * norm.pdf(d1) / (Sp * rows.iv * np.sqrt(tau))
        gex = gamma * rows.oi * 100 * Sp**2 * 0.01
        net[g] = np.sum(rows.cp * gex); uns[g] = np.sum(gex)
    roots = grid[np.where(np.diff(np.sign(net)) != 0)]   # all sign changes in band
    slope_at_spot = np.gradient(net, grid)[np.argmin(np.abs(grid - S))]
    return grid, net, uns, roots, slope_at_spot
```

Open design choices that must be logged with each run: sticky-strike (hold `iv` per row, as above) vs sticky-delta (shift the smile with `Sp/S`); whether to include ES/SPY/XSP chains; the `k_std` filter; and the dealer-sign vector (naive, inverted, unsigned, flow-signed).

Implementation hazards seen in repos: (i) `np.interp(x=0, xp=values, fp=index)` assumes a monotone profile and silently returns garbage on multi-root profiles (jensolson); (ii) r=q=0 (pikki622, Edge-GEX-Lab; small bias for 0DTE but matters for weeks); (iii) 0DTE needs a τ floor (pikki622 uses 1/262 yr for 0DTE — far too large late in the day; use minutes-to-expiry in trading time, see §6.1); (iv) σ held fixed across the grid ignores the smile; "sticky-strike" (hold σ_i) vs "sticky-delta" (shift the smile with spot) give different flips; (v) business-day counting that returns 0 for same-day expiries and then filtering `BDTE ≥ 1` deletes 0DTE entirely (jensolson).

### 2.6 Call wall, put wall, vol trigger, HVL, GEX1–10 [C, vendor definitions]

- **SpotGamma** (text of support articles as surfaced in search results; the pages themselves are Cloudflare-blocked): "The Call Wall is the strike with the largest net call gamma — the upper bound of the expected range"; "The Put Wall is the strike with the largest net put gamma — the lower bound of the expected range … a high-probability structural level, not a guaranteed floor"; "The Volatility Trigger is SpotGamma's proprietary Gamma flip level, with positive Gamma above and negative Gamma below the level"; "Zero Gamma Strike: Estimated level at which gamma flips from positive (above strike) to negative (below strike)"; "Top Absolute Gamma Strike: Level with most call gamma + put gamma." Sources: [Put Wall support article](https://support.spotgamma.com/hc/en-us/articles/15297856056979-Put-Wall), [Gamma Flip support article](https://support.spotgamma.com/hc/en-us/articles/15413261162387-Gamma-Flip) (both 403 on fetch; definitions from search snippets), [SpotGamma guest post 2022-09-06](https://spotgamma.com/?p=11058) (loaded; "The Volatility Trigger is SpotGamma's proprietary Gamma flip level"), [HIRO User Guide PDF, 2025-12-10](https://spotgamma.com/wp-content/uploads/2025/10/SpotGamma-HIRO-User-Guide-2.pdf) (loaded; "Call Wall: … based on SpotGamma's Total Open Interest model"; "Hedge Wall serves as a volatility flip line"). Accessed 2026-11-06. SpotGamma does not disclose whether "net call gamma" is OI-weighted gamma, which expirations are included, or how the Vol Trigger differs from the zero-gamma root.
- **Menthor Q** (their training deck, loaded as PDF): "Call Resistance is the strike price with the highest net call gamma exposure." "Put Support is the strike price with the highest net put gamma exposure." "The HVL is a transition zone that signals a shift in the gamma regime, from positive to negative, or vice versa. It's derived from the inflection point in the slope of the cumulative gamma exposure curve." "GEX 1 = The highest gamma strike after Call Resistance or Put Support … GEX 10 = Tenth highest ranked strike by gamma magnitude." They compute "gamma exposure across all strikes and 0DTEs," publish separate 0DTE CR/PS/HVL, and update intraday "14 times per day." Their only disclosed backtest is of a "1D Exp Move" band (SPX, 2019-11-01 → 2023-08-30: "Success 1D Min: 87.62%, Success 1D Max: 85.02%"), with no definition of "success." Source: [MenthorQ Product Training: Gamma Levels (PDF)](https://menthorq.com/wp-content/uploads/2023/11/Product-Training-Gamma-Levels.pdf); also [MenthorQ guide](https://menthorq.com/guide/understanding-gamma-levels-in-the-sp-500/). Accessed 2026-11-06. Note the HVL definition ("inflection point in the slope of the cumulative gamma exposure curve") is Algorithm 1 territory, not a repriced root.
- **FlashAlpha**: "Call wall: the OTM strike (K ≥ spot) with the greatest call gamma exposure. Put wall: the OTM strike (K ≤ spot) with the greatest put gamma exposure … In dense at-the-money clusters, such as 0DTE index chains, a Gaussian-smoothed argmax is used instead." ([methodology](https://flashalpha.com/methodology), accessed 2026-11-06.)

### 2.7 IV source: chain IV vs flat vol vs exchange-supplied Greeks [A]/[C]

- Cboe's free delayed JSON (`https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json`) returns per-contract bid/ask, IV, OI, volume and Greeks; gex-tracker and the "spx-dealer-gamma" MCP server use Cboe's gamma directly, while jensolson, gammagrid, Edge-GEX-Lab invert IV from mid prices and recompute. Sources: [gex-tracker main.py](https://github.com/Matteo-Ferrara/gex-tracker/blob/main/main.py); [gammagrid README](https://github.com/gammagrid/gammagrid) ("Implied volatility: Solved by inverting the contract's price … because the source omits IV on part of chains"). Accessed 2026-11-06.
- Chain IV per contract is the right input for a *profile at today's spot*; for the *repriced profile* you must decide sticky-strike vs sticky-delta. A flat vol is only defensible for very short τ and near-ATM strikes, and the 0DTE smile is a *smile*, not a smirk (Almeida et al.: "For all times of the day, 0DTE IVs display a smile across moneyness, where OTM puts and calls are equally expensive in terms of IV. This is in contrast to the usual smirk observed for longer-maturity S&P 500 options"). Source: [Almeida-Freire-Hizmeri 2025 PDF](https://fmai.memberclicks.net/assets/docs/Derivatives2025/Almeida.pdf), §3.1 (accessed 2026-11-06).
- Deep OTM 0DTE IVs are "artificial" (positive prices on untraded strikes): Almeida et al. restrict to standardized log-moneyness `k_std = ln(K/S)/(σ_ATM √τ) ∈ [−6, 3]` and drop rows with zero volume and zero bid. Our GEX should apply the same filter; otherwise a few stale deep-OTM lines with huge Cboe-reported gamma can dominate.

### 2.8 0DTE vs all expirations [A]/[B]

- As τ→0, ATM gamma `e^{−qτ}φ(d1)/(Sσ√τ)` → ∞ while its spatial support collapses to a band of width ~`Sσ√τ`. In the last hour, a 0DTE ATM line dominates the strike bar chart but matters only if spot is within that band; a 30-DTE line matters everywhere. Hence vendors separate "0DTE levels" (MenthorQ CR/PS/HVL 0DTE; SpotGamma "Next Expiry" HIRO view; FlashAlpha "0DTE magnet = argmax |GEX(K)| over 0DTE only").
- Cboe's own net-gamma series is 0DTE-only and widens into the close: "the net gamma range grows wider as the day progresses (which makes sense as gamma increases the closer an option gets to expiry) … The median net gamma at 3:30pm is just +$173mm with the typical range from −$1.1bn to +$2.4bn (25th to 75th percentile readings). Even if we focus on the 'whiskers' … the range of −$5bn to +$7.7bn represents just 1.3% to 1.9% of the S&P futures daily notional volume." Source: [Cboe, "Much Ado About 0DTEs," 2023-09-07 (PDF mirrored by SpotGamma)](https://spotgamma.com/wp-content/uploads/2023/09/cboeqqq.pdf), accessed 2026-11-06.
- Adams et al. (2025) decompose expiration-day hedging needs: pre-existing longer-dated positions that *become* 0DTE "raise the hedging needs by 24 bps during the expiration day on average," new same-day 0DTE positions add about 3 bps. Source: [Quantpedia summary of Adams et al., 2026-02-02](https://quantpedia.com/do-sp500-0dtes-options-increase-market-volatility/), accessed 2026-11-06 (paper itself: SSRN 5641974, not openable).

### 2.9 Vanna and charm exposure [A]

Black-Scholes closed forms (Wikipedia, [Greeks (finance)](https://en.wikipedia.org/wiki/Greeks_(finance)), accessed 2026-11-06), with `d1 = [ln(S/K) + (r − q + σ²/2)τ]/(σ√τ)`, `d2 = d1 − σ√τ`, φ the standard normal pdf, Φ the cdf:

```
Γ          = e^{−qτ} φ(d1) / (S σ √τ)                           (calls = puts)
Vanna      = ∂Δ/∂σ = −e^{−qτ} φ(d1) d2 / σ                       (calls = puts)
Charm_call = q e^{−qτ} Φ(d1) − e^{−qτ} φ(d1) [2(r−q)τ − d2 σ√τ] / (2 τ σ √τ)
Charm_put  = −q e^{−qτ} Φ(−d1) − e^{−qτ} φ(d1) [2(r−q)τ − d2 σ√τ] / (2 τ σ √τ)
Θ_call     = −S e^{−qτ} φ(d1) σ/(2√τ) − rK e^{−rτ} Φ(d2) + qS e^{−qτ} Φ(d1)
```

Exposure aggregation (practitioner convention; FlashAlpha methodology page): `VEX_i = vanna_i × OI_i × 100 × S` (dollar delta change per 1.00 of σ, so divide by 100 for "per vol point"); `CHEX_i = charm_i × OI_i × 100` (share-equivalent delta change per calendar day; some vendors multiply by S for dollars and divide by 365 or by trading minutes). Sign: FlashAlpha applies the call/put flip only to GEX and lets DEX/VEX/CHEX "take their sign from the Greek itself" ([FlashAlpha methodology](https://flashalpha.com/methodology)); optionsanalysissuite instead signs everything by an assumed dealer book "long calls and short puts, at 100% of open interest" ([Vanna, Charm, and Vomma Exposure](https://www.optionsanalysissuite.com/documentation/vanna-charm-vomma-exposure), accessed 2026-11-06). There is no standard; state the convention in every table.

For 0DTE in the last hour: Vanna is irrelevant (σ-sensitivity of delta is multiplied by a τ that is nearly zero in the d1 argument, and there is no vol to trade); charm per *minute* becomes the dominant deterministic hedging flow for strikes within ~1σ_remaining of spot. In trading-time units, with τ measured in minutes remaining and σ_min the per-minute vol, the ATM charm per minute is of order `φ(0)/(2 τ_min)` in delta — it diverges as 1/τ.

### 2.10 Known criticisms of naive GEX [B]/[C]

1. **Sign assumption.** SqueezeMetrics assumes it; Baltussen et al. say outright "we assume option market makers are short all puts and long all calls" and that OTC positions are missed. Cboe's 0DTE data show flow is balanced ("the put/call ratio for SPX 0DTE options have consistently hovered around one" — [Cboe 0DTEs Decoded, 2025-05-02](https://storage.pardot.com/77532/17461948884kPMLz2S/0DTEs_Decoded_Positioning_Trends_and_Market_Impact.pdf), accessed 2026-11-06). Beckmeyer et al. find retail *buy* more 0DTE than they sell, "leaving market makers net short" — but retail is ~6% of 0DTE volume in their sample ([WealthManagement summary, 2023-05-23](https://www.wealthmanagement.com/equities/retail-investors-are-in-love-with-same-day-options), accessed 2026-11-06). Edge-GEX-Lab's README states it plainly: "The sign is an assumption" and offers an unsigned (absolute) view ([simonro/Edge-GEX-Lab](https://github.com/simonro/Edge-GEX-Lab), accessed 2026-11-06).
2. **OI is stale.** OI is settled once per session and reflects the prior close; for 0DTE listed that morning, OI at 9:30 is a fraction of what will trade. Repos warn: "Open interest is settled once per session, so it lags intraday quotes" ([FlashAlpha-lab/gex-explained](https://github.com/FlashAlpha-lab/gex-explained)); "Open interest is daily and one session behind, and Cboe publishes no date, so the app infers it from payload time" (Edge-GEX-Lab). Cboe's 2025 paper shows ~12% of retail 0DTE opening trades occur in the last 30 minutes — invisible to OI.
3. **Intraday flow unknown; closing trades are not opening trades.** Volume ≠ OI change. Cboe: "it's not the notional volume that matters … it's the balance between buys vs. sells."
4. **Dealers hedge in ES, SPY, other expiries and other options, not only the index.** Cboe: "Market makers may have offsetting positions in other expiries, or other equivalent products (e.g. E-mini or SPY 0DTE options). They may also be hedging their 0DTE positions with other 0DTE options, rather than with linear instruments such as futures" (2023 paper). Hedging bands (SqueezeMetrics assumption 4) mean re-hedging is lumpy.
5. **"Naive" vs "delta-adjusted"/"flow-weighted".** Variants in the wild: (a) weight by volume instead of OI (EzOptions-Schwab offers "open interest, volume, max OI vs volume, or OI + volume"); (b) "effective OI = OI + 0.43 × side-classified volume" (FlashAlpha, factor "fit against end-of-day OI residuals," no sample stated); (c) sign gamma by inferred inventory change since the open ("polarity=flow," FlashAlpha); (d) "side-weighted GEX" from quote-matched trade direction (emlama); (e) the academically preferred route: net positions by investor class from Cboe Open-Close data (NPPW method used by Adams et al.). None of (a)–(d) has published validation.
6. **Cboe's balanced-flow evidence.** Quantified in §4.1–4.2. Strongest counter-evidence to the naive sign for 0DTE; weaker for longer-dated SPX where the structural put-buying / call-overwriting story is documented (Bollen-Whaley 2004, Garleanu-Pedersen-Poteshman 2008, cited by Baltussen).
7. **Gamma is not the only Greek.** Princeton thesis (Shi, 2026): "the canonical hedging feedback channel does not add meaningful predictive power for intraday variance forecasts," while "other option risk exposures exhibit substantially stronger predictive power" ([Princeton senior thesis record, 2026-04-08](https://theses-dissertations.princeton.edu/entities/publication/61115cd1-cb09-4a8b-9230-ff488fc2a386), accessed 2026-11-06; thesis text restricted). [B, unrefereed]
8. **Circularity in the original validation.** SqueezeMetrics' own justification for the call-sign assumption includes "(circularly) the effects of GEX"; the paper's only out-of-sample style evidence is a quartile comparison with no dates and no standard errors. The independent evidence that the *construction* carries information is Baltussen et al. (sign-conditional momentum) and, for single stocks with properly signed positions, Ni-Pearson-Poteshman-White. Neither validates "gamma flip" or "walls" as levels.
9. **Levels are argmaxes on noisy, lumpy OI.** A "wall" moves discontinuously when a single large spread prints; Cboe's 2023-08-15 and SpotGamma's 2025-05-12 anecdotes both feature one position (4440 puts; 5,820/5,830 call spread) that dominated the strike map and was then closed. Level stability over the day is a measurable property we should report (e.g., fraction of 15-minute intervals in which the 0DTE argmax strike changed).

### 2.11 Vendor and repo level definitions, side by side [C]

| Level | SpotGamma | MenthorQ | FlashAlpha | Typical repo |
|---|---|---|---|---|
| Regime divider | "Volatility Trigger" (proprietary gamma-flip level); separately "Zero Gamma Strike" and "Hedge Wall" (vol flip line) | "HVL — inflection point in the slope of the cumulative gamma exposure curve"; separate "HVL 0DTE" | "Gamma flip": concept page says cumulative-sum zero crossing; methodology page says spot-reprice root with bisection in ±8% band | cumulative zero-crossing (cheap) or ±8–10% reprice grid (Darthreign, pikki622, jensolson) |
| Upper level | "Call Wall — strike with largest net call gamma … based on Total Open Interest model" | "Call Resistance — strike with the highest net call gamma exposure"; "CR 0DTE = today's high gamma call wall" | "Call wall — OTM strike (K ≥ spot) with greatest call gamma exposure; Gaussian-smoothed argmax in dense 0DTE clusters" | argmax of call GEX by strike, sometimes restricted to K > S |
| Lower level | "Put Wall — strike with largest net put gamma" | "Put Support — strike with the highest net put gamma exposure"; "PS 0DTE" | "Put wall — OTM strike (K ≤ spot) with greatest put gamma exposure" | argmax of |put GEX| |
| Secondary strikes | "Key Gamma Strike," "Top Absolute Gamma Strike" | "GEX 1 … GEX 10 — ranked strikes by gamma magnitude after CR/PS" | — | "GEX1–5" (Darthreign) |
| Expiry scope | undisclosed; HIRO has a "Next Expiry" (0DTE) toggle | full chain plus separate 0DTE set; "1D Min/1D Max" expected-move band | all expiries pooled, "no DTE weighting"; 0DTE magnet separately | all expiries; some restrict to <365d |
| Weighting | OI ("Total Open Interest model") | OI + "intraday … 14 times per day" (method undisclosed) | settled OI; "effective OI = OI + 0.43 × side-classified volume"; optional flow polarity | OI; volume; OI+volume (EzOptions) |
| Update cadence | intraday | EOD 6pm ET; intraday 14×/day | tiered (15-min cache free) | on demand |
| Published validation | none found | "1D Exp Move" band hit rates 87.6% / 85.0% (SPX, 2019-11-01→2023-08-30; "success" undefined) | none ("reconciliation thresholds … are alert floors, not measured results") | none; zrack: "predictive_validity: unmeasured" |

Sources: SpotGamma HIRO guide and support-article snippets (§2.6); MenthorQ training deck and guide (§2.6); [FlashAlpha methodology](https://flashalpha.com/methodology) and [gamma-flip concept](https://flashalpha.com/concepts/gamma-flip); repos in §7. All accessed 2026-11-06. The practical takeaway: the three vendors agree on the *names* and on OI-weighted argmax walls, but disagree (or do not say) on the flip algorithm and on expiry scope, and none publishes a validation we can audit.

### 2.12 Recommended default configuration for our GEX engine (decisions, with the reason)

1. **Inputs**: full SPX + SPXW chain (and, when available, SPY and XSP scaled to SPX notional, ES options via Black-76) — because dealers hedge across venues (Cboe caveat, §2.10 item 4). Keep a flag to run SPX/SPXW only for comparability with vendors.
2. **Filter**: `k_std ∈ [−6, 3]`, drop zero-bid-and-zero-volume rows, drop rows with IV outside [1%, 300%] — Almeida's filter plus a sanity bound; the jensolson `|Δ| < 0.95` filter is *not* adopted because deep-ITM lines carry real delta for hedging even if little gamma.
3. **IV**: invert from mid with our own trading-time τ; do not trust feed IV in the last hour (Open question 3). Store both.
4. **τ**: minutes to the contract's cutoff / (390 × 252); 0DTE cutoff 16:00 ET (13:00 on half days); floor 30 seconds. Never a one-day floor.
5. **Rates/dividends**: 1-month T-bill; q from ATM put-call parity per expiry (Almeida's procedure).
6. **Greeks**: BS gamma, charm (per minute), vanna; store per row.
7. **Exposures**: compute four sign variants per row (naive, inverted, unsigned, flow-signed when trade data exist) and report all four in every table; the UI default is unsigned for 0DTE and naive for ≥1 DTE, with the assumption printed on the chart.
8. **Units**: "$ per 1σ_rem" for 0DTE and "$ per 1%" for the rest; never pool them in one bar.
9. **Levels**: repriced profile on a 10-bp grid in ±8% (±3σ_rem for the 0DTE-only profile), all roots and the slope at spot; walls as OTM argmax with Gaussian smoothing (bandwidth = one strike interval) for 0DTE; K\* as unsigned 0DTE argmax within ±1.5σ_rem.
10. **Stability diagnostics**: per 15-minute interval, log whether K\*, walls and the nearest root changed; publish the day's change count with the level.
11. **Snapshot cadence**: 60 s all day, 15 s from 15:30 — because the only tests that matter for the platform live in the last 30 minutes (§8).
12. **Validation hooks**: every level is written with its pre-registered outcome fields (`S_set − S_t`, `|S_set − K*|`) so that hit rates accumulate automatically; no level gets a "strength" label until it has a measured hit rate with a confidence interval.

---

## 3. Dealer-positioning estimation alternatives

### 3.1 OI-based naive (§2) [A]
Cheapest; free; the only option without a paid feed. Error budget: sign (dominant), staleness, OTC omission, hedging venue.

### 3.2 Cboe Open-Close volume data [A]
Product: [Cboe DataShop, Open-Close (Cboe/C2/BZX/EDGX)](https://datashop.cboe.com/open-close-cboe-c2-exchange), accessed 2026-11-06. Fields: action buy/sell; position open/close; participant type customer, professional customer, broker-dealer, market maker (plus "Firm" in the recommended-products panel); customer/pro-customer size buckets <100, 100–199, >199 contracts; EOD files add OHLC, total volume, OI. Frequency: EOD (overnight), and intraday 10-minute or 1-minute files "delivered minutes after each interval closes." History: C1 EOD from 2005-01-03; C1 10-min from 2011-01-03; C1 1-min from 2019-10-07; BZX/C2/EDGX EOD from 2018-01-02 and intraday from 2019-03-01. Pricing not shown on the page (fee schedules referenced). Per the SEC filing summarized in search results, the intraday product omits execution price ([SR-C2-2022-011](https://cdn.cboe.com/resources/regulation/rule_filings/approved/2022/SR-C2-2022-011.pdf), accessed via search snippet 2026-11-06).

Use: cumulative customer net opening buys minus sells by series ⇒ customer net position ⇒ dealer position = −customer (plus firm/pro-customer handling). This is exactly what Cboe's own research uses ("we can see for every transaction whether it's customer or market maker, buy or sell, opening or closing") and what Ni-Pearson-Poteshman-White (RFS 2021) and Adams et al. (2025) use. Limitations: SPX trades only on Cboe (C1), so coverage is complete for SPX but the 1-minute history only starts 2019-10; the "customer" bucket mixes retail and institutions (Cboe: "about 90% of SPX 0DTE customer volume currently originate from a retail brokerage firm — that is not sufficient to identify whether a trade is indeed retail or institutional"); redistribution of derived data needs licensing.

### 3.3 Trade-side classification from OPRA prints [B for accuracy, C for GEX use]
Savickas & Wilson, "On Inferring the Direction of Option Trades," *JFQA* 38(4), 2003, 881–902 ([Cambridge abstract](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/abs/on-inferring-the-direction-of-option-trades/FDA4541B57F78B2C8DCE129AFC25AAF0), accessed 2026-11-06): with a proprietary CBOE dataset recording true direction, "these four rules sign correctly 83%, 80%, 77%, and 59% of all classifiable trades, respectively" (quote rule, Lee-Ready, EMO, tick test). "Outside-quote and reversed-quote trades are highly misclassified by all four rules." "Index option complex trades not executed on the Retail Automated Execution System are misclassified almost 50% of the time. Removing these trades, about 15% of the sample, raises the quote rule's success rate to over 87%." Implication for SPX 0DTE: Cboe reports ~50% of opening customer trades are multi-leg (verticals 28–33%, iron condors 4–8%, butterflies 1–3.5%) — the very trades the quote rule mis-signs. Also, "at ask = buy" tells you the *aggressor*, not whether the aggressor is a customer or a dealer, nor whether the trade opens or closes. Repos doing this: emlama (Polygon flat files, "quote-matched trade side classification"), Darthreign ("delta flow proxy = Δvolume × δ × 100 × spot … not a true signed order flow, since taker side isn't observable in the CBOE feed"), FlashAlpha ("aggressor side is inferred from the NBBO, not observed").

### 3.4 SpotGamma HIRO-style intraday flow [C]
What is public (HIRO User Guide, 2025-12-10, loaded): "HIRO (Hedging Impact of Real-time Options) measures and aggregates the delta notional value from every option trade, estimating the hedging requirement associated with each transaction." "This view does use SpotGamma proprietary logic to filter out some trades that we consider hedged and therefore do not drive the underlying security." Views: Total; Put/Call split; "Next Expiry" (0DTE) isolate; rolling window vs cumulative. Interpretation offered: "A negative HIRO value indicates downward hedging pressure, and a positive HIRO value indicates upward hedging pressure"; usage includes "Watching for the HIRO signal to reverse when price reaches key support and resistance levels." Source: [HIRO User Guide PDF](https://spotgamma.com/wp-content/uploads/2025/10/SpotGamma-HIRO-User-Guide-2.pdf). No algorithm, side-classification rule, or validation statistic is disclosed. A DIY equivalent is: Σ_trades sign(aggressor) × Δ_i × size_i × 100 × S, with sign from quote rule and the §3.3 error rates.

### 3.5 Sensitivity-analysis approach [A]
Rather than one sign, report GEX under a family of positioning assumptions and show the envelope:
- Naive (+calls/−puts); inverted (−calls/+puts); unsigned/absolute (Edge-GEX-Lab); dealer short everything (optionsanalysissuite "Long OI" view); dealer short fraction θ of each line with θ ∈ {0.5, 0.75, 1}.
- jensolson's "sensitivity table" (GEX at 20 hypothetical spots) is a spot sensitivity, not a positioning sensitivity; both dimensions are needed.
- Decision rule for our platform: a level (flip/wall) is "robust" only if it survives naive vs unsigned vs flow-signed variants; else it is reported with a width.

### 3.6 The exchange's own measure [B]
Cboe computes net market-maker position per strike from origin codes and reports aggregate net dollar gamma in 30-minute increments ([2023 paper](https://spotgamma.com/wp-content/uploads/2023/09/cboeqqq.pdf); [2025 paper](https://storage.pardot.com/77532/17461948884kPMLz2S/0DTEs_Decoded_Positioning_Trends_and_Market_Impact.pdf)). It is not sold as a feed. The closest purchasable proxy is Open-Close 1-minute data (§3.2).

---

## 4. Empirical literature on 0DTE

### 4.1 Cboe, "Much Ado About 0DTEs: Separating Fact From Fiction" (Mandy Xu, 2023-09-07) [B, exchange data, interested party]
Source: [PDF](https://spotgamma.com/wp-content/uploads/2023/09/cboeqqq.pdf), accessed 2026-11-06; extracted locally. Verbatim/quantified:
- Volume share: "rising from 5% of SPX® options volume in 2016 to over 40% since the introduction of Tue/Thu expiries last year … averaging 50% in August [2023]."
- "averaging over 1.23m contracts ($500bn notional) a day in 2023."
- "98% of the volume in SPX 0DTE options are traded electronically."
- Balance: "Take Aug 15th … the 4440-strike put where over 100k contracts traded on that day – yet if you look at the net positioning, market makers were left short only about 3k contracts (52k buy vs. 55k sell) by the end of the day, or just 3% of the gross volume."
- Net gamma: "On average, market maker positioning is fairly de minimis, with net gamma exposure ranging from $170mm to $670mm throughout the day … S&P futures trade around $400bn a day, so we're talking about potential hedging flows that make up between 0.04% to 0.17% of the daily S&P futures liquidity." Box plot in 30-min increments over the prior year.
- Volatility: "The YTD average spread of 2.7 vol pts [close-to-close vs Garman-Klass intraday 1M RV] is exactly the same as the 10-year average." "we look at the frequency of 2-sigma moves over a 1min window (i.e. 1min return compared to preceding 30min realized volatility) … there has been no uptick in intraday gap moves in the S&P over the past year, either during the trading day or in the last hour going into the close." (2013–2023 bar chart, intraday vs last hour.)
- Case study 2023-08-15: "market makers were long about $2bn gamma at 3pm when the sell-off started … didn't shift to short gamma until 3:30pm when the SPX index had already stabilized and even then it was a very small short exposure of just -$500mm (or 0.13% of S&P futures volume)."

### 4.2 Cboe, "0DTEs Decoded: Positioning, Trends, and Market Impact" (Mandy Xu, 2025-05-02) [B, exchange data]
Source: [PDF](https://storage.pardot.com/77532/17461948884kPMLz2S/0DTEs_Decoded_Positioning_Trends_and_Market_Impact.pdf) (landing page: [Cboe Insights](https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact)), accessed 2026-11-06; extracted locally.
- "ADV jumping from 388k contracts in Q1 2022 to 1.98M contracts in Q1 2025 … 0DTE options now make up over 50% of the total SPX volume, with over $1T notional trading daily."
- Retail: "about 90% of SPX 0DTE customer volume currently originate from a retail brokerage firm"; "we estimate that retail currently make up ~50-60% of SPX 0DTE trading"; "Retail made up over 55% of SPX 0DTE trading in Q1 this year compared to 42% five years ago."
- Strategy mix (Exhibit 4, % of ADV, institutional / retail): outright put/call 50.2 / 51.9; vertical spread 33.4 / 27.6; iron condor 4.1 / 7.7; butterfly 1.0 / 3.5; straddle/strangle 1.1 / 0.3; others 10.2 / 9.0.
- **Intraday timing**: "institutional investors are much more aggressive in opening positions at the beginning of the day with 18% of all opening trades happening in the first 30 minutes … retail investors are active both at the start as well as the end of the day, with ~12% of all opening trades occurring in the first 30 and last 30 minutes of the day. The U-shaped volume curve for retail 0DTE activity very much resembles the typical intraday volume curve for equities." Closing trades: "retail closing volume resembles the same U-shape curve as its opening volume."
- Risk: "52% … of all retail opening trades have a max loss of under $2k"; "the most commonly traded vertical spread width, at 34% share, is just 5 point wide"; "over 95% of all 0DTE trades done in capped risk formats … Naked short options … make up just 4% of SPX 0DTE trading."
- Stress days: "0DTE share of overall SPX option volume fell from a high of 64% on April 1st to a low of 36% on April 7th"; "retail share of 0DTE volume dropping 10 pts from 57% in March to 47% on April 9th."
- Net gamma on stress days: "net market maker gamma exposure in SPX 0DTE options ranged from +$2.1B to -$390M on April 4th with market makers mostly long gamma throughout the day … market makers were net long gamma throughout April 9th, ranging from +$300M to +$770M … SPX futures traded over $850B on April 9th and over $940B on April 4th, so market marker gamma hedging activity in SPX 0DTE options represented, at best, just 0.2% of S&P futures notional volume."
- Not covered: pinning, settlement, last-10-minute behavior.

### 4.3 Cboe, "The Rise of SPX & 0DTE Options" (Jonathan Zaionz, 2023) via Markets Media (2023-08-31) [B via secondary]
Source: [Markets Media](https://www.marketsmedia.com/growth-of-same-day-expiry-options-is-unprecedented/), accessed 2026-11-06. "0DTE was 43% of total SPX options volume in the first half of 2023." On Fed days: "From 9:30am to 1:59pm ET, at-the-money premium shows almost no decay. After 2pm it declines rapidly into the close. 0DTE volume is typically muted before 2pm and surges after." June 15 2023: 1.33M 0DTE contracts; most active 4420 call (75k), 4400 put (49k).

### 4.4 Beckmeyer, Branger, Gayda, "Retail Traders Love 0DTE Options… But Should They?" (SSRN 4404704, 2023-03-30) [B via secondary; SSRN blocked]
Verified from secondary sources only: [CXO Advisory, 2023-04-27](https://cxoadvisory.com/individual-investing/retail-0dte-option-trader-performance) (paywalled after the setup) and [WealthManagement (Larry Swedroe), 2023-05-23](https://www.wealthmanagement.com/equities/retail-investors-are-in-love-with-same-day-options), both accessed 2026-11-06; also [Neudata literature review](https://neudata.co/literature-reviews/zero-day-to-expiry-options-a-losing-bet-for-retail-traders).
- Data: Cboe SPX trade data with trader-type codes; intraday data Jan 2005–Feb 2023; 0DTE analysis Jan 2021–Feb 2023; daily expiries from 2022-05-16.
- Retail share: "over 6% of total 0DTE trading"; ~75% of retail SPX option trades are 0DTE; order sizes 72.2% single contract.
- Losses: ">$70 million" over ~2 years (CXO and Swedroe); "$184,000 [per day] across the full sample and $358,000 from May 16, 2022 onward"; Neudata reports "$125 million" and "$350,000 per day" — figures differ across summaries, so cite the paper before using a number.
- Decomposition: "About 60% of daily losses came from transaction costs. About 60% came from investments in 0DTE puts" (two overlapping decompositions).
- Returns: "Long positions lost 53% of their value on average across the full sample (61% since May 2022). Short positions returned 48% after fees (56% since May 2022)." "Retail investors bought more 0DTE options than they sold, leaving market makers net short."
- Spreads/timing: "Effective spreads for retail trades were 6.1% for calls and 4.9% for puts, versus 13.1% and 10.1% for non-retail trades. Retail investors kept trading 0DTE options with under an hour to expiration, even though spreads widen near expiry."
- Interpretation: "Their hunger for lottery-like assets leads to large aggregate losses."

### 4.5 Dim, Eraker, Vilkov, "0DTEs: Trading, Gamma Risk and Volatility Propagation" (SSRN 4692190, 2024) [B via abstract/secondary]
Sources: [Harbourfront summary 1](https://harbourfrontquant.substack.com/p/impact-of-zero-dte-options-on-the), [Harbourfront summary 2](https://harbourfrontquant.substack.com/p/the-rise-of-0dte-options-cause-for), [Oxford seminar abstract](https://www.maths.ox.ac.uk/node/67396) (via search snippet), accessed 2026-11-06. Quoted abstract fragments: "We do not find evidence that the 0DTEs option open interest gamma propagates [or unconditionally increases the underlying index volatility]"; higher 0DTE/short-term OI gamma "is associated with lower realized volatility within the day and does not propagate overnight and lagged intraday volatilities"; volume shocks: "these responses are not economically significant and dissipate quickly"; the increased return sensitivity to 0DTE volume shocks "amounts to only 0.1 standard deviations of the absolute return"; "0DTE options have the largest volatility risk premium (VRP)." Sample period and coefficients: not visible to me.

### 4.6 Adams et al., "Do S&P500 Options Increase Market Volatility? Evidence from 0DTEs" (SSRN 5641974, ~Oct 2025) [B via Quantpedia]
Source: [Quantpedia, 2026-02-02](https://quantpedia.com/do-sp500-0dtes-options-increase-market-volatility/), accessed 2026-11-06 (SIFMA's April 2026 metrics PDF dates the paper to October 2025: [SIFMA](https://www.sifma.org/wp-content/uploads/2026/04/SIFMA-Insights-Equities-and-Options-Monthly-Metrics_April_2026.pdf)). Method: market-maker hedging needs per Ni-Pearson-Poteshman-White (2020/2021), E-mini order flow, high-frequency SPX returns; identification from Tue/Thu expiries before May 2022.
- "the volatility of S&P500 index returns is lower by 60 annualized basis points (bps)" on 0DTE days (pre-May-2022 Tue/Thu); the weekday difference disappears once 0DTEs trade daily.
- Hedging needs ~1% of shares per 1% move pre-2022; 0DTE presence "increases those hedging needs by 0.15 percentage points on average"; 2SLS multiplier ≈ −4 ⇒ "a 4 bps decrease in realized volatility."
- "These pre-existing market makers' positions raise the hedging needs by 24 bps during the expiration day on average"; new 0DTE positions ≈ +3 bps.
- Intraday: "variations in market makers' net gamma predict lower S&P500 volatility in the next 10 minutes" (fades ~1 hour); "a higher net gamma predicts a stronger reversal pattern in the intraday order flow of E-mini futures"; "a higher net gamma predicts a negative momentum in high-frequency returns"; "Market makers keep positive portfolio net gamma throughout expiration day."

### 4.7 Brogaard, Han, Won (University of Utah), 0DTE volume and volatility [C: press only]
I could not open the paper or the Bloomberg article (403); the only text available is a search snippet of Bloomberg/BNN (2023-05-18): "a one standard-deviation increase in the traded volume of 0DTE options led to a jump of almost 14% in the S&P 500's daily volatility," using "volatility at five-minute intervals … for each day in the past decade." Source as surfaced: [BNN Bloomberg](https://www.bnnbloomberg.ca/zero-day-options-are-reordering-the-way-the-stock-market-behaves-1.1921930), fetch returned the site index, 2026-11-06. Conflicts with §4.5–4.6; the snippet quotes Brogaard saying his result is "consistent with" JPMorgan's muted-vol findings, so the volume→vol relation may be contemporaneous/endogenous rather than causal. Treat as unverified.

### 4.8 Bandi, Fusari, Renò, "0DTE Option Pricing" (SSRN 4503344, 2023) and Bandi, Fusari, Gazzani, Renò, "Ultra-short-term volatility surfaces" (arXiv 2603.29430, 2026-03-31) [B via abstracts]
- BFR: per EconBiz/ESSEC/JHU records surfaced in search ([EconBiz record](https://econbiz.de/Record/0dte-option-pricing-bandi-federico/10014348685); [JHU Carey piece](https://carey.jhu.edu/articles/risk-reward-insights-0dte-option-trading)), the model is tested on "intra-daily option data covering January 2, 2014 to May 11, 2023," delivers a closed-form for the 0DTE IV surface, and reports "suggestive results on near-instantaneous predictability through leverage and volatility-of-volatility, estimated via 0DTE return and variance risk premia." Not opened directly.
- BFGR 2026 ([arXiv abstract](https://arxiv.org/abs/2603.29430), accessed 2026-11-06): ultra-short-term = "maturities below one week"; "pronounced oscillations observed in the at-the-money implied-volatility term structure across ultra-short-term tenors"; proposes "Edgeworth++, a parsimonious jump-diffusion model featuring a nonparametric stochastic volatility component" with "a deterministic shift extension." Relevance: the 0DTE ATM IV is not a clean σ; it embeds intraday periodicity and scheduled-event variance.

### 4.9 Almeida, Freire, Hizmeri, "0DTE Asset Pricing" (draft 2025-05-23; first draft 2024-01-20) [B; full PDF read]
Source: [PDF](https://fmai.memberclicks.net/assets/docs/Derivatives2025/Almeida.pdf), accessed 2026-11-06; extracted locally.
- Data: Cboe intraday SPX option data at 1-minute intervals (bid/ask/volume/OI/underlying), all dates with 0DTE SPXW "between January 6 2012 and March 18 2025 … 1,815 dates in total, where roughly 40% of those dates are between May 11 2022 and March 18 2025." Refinitiv Tick History for SPX; FRED 1-month T-bill.
- Filters: `k_std ∈ [−6, 3]`; drop zero-volume-and-zero-bid; times of day 10:00–14:00 at 30-min steps ("trading volume is higher at market open and close, these times of the day are also the ones with highest bid-ask spread").
- Returns (hold-to-expiry): "Calls experience low returns overall, which decrease with the strike and eventually get highly negative … Put returns are also negative, especially out-of-the-money"; "average returns are always negative, with statistical significance for OTM puts"; "average OTM call returns are more negative than OTM put returns"; "For longer maturities … for one-month options, average call returns are mostly positive and increasing in [the strike]."
- Variance premium: "average returns of at-the-money (ATM) delta-hedged calls and straddles are significantly negative … [negative average returns are] stronger from 12:00 to 14:00"; "The (annualized) average variance risk premium implied by 0DTEs can be up to four times larger than what is observed for longer horizons"; "the annualized 0DTE VRP varies from 1.54% to 2.95%" across times of day; the "good" (upside) VRP exceeds the "bad" at intraday horizons.
- Equity premium: "the intra-day equity premium, which is around 15% annualized over our sample"; "most of the intra-day equity premium stems from compensation to market returns between −5% and 0%"; VRP negatively predicts intraday returns.
- Mispricing: SSD-violation strategy "yielding Sharpe ratios in the range of 0.1 to 0.2 for very short-term horizons … an order of magnitude larger than those obtained from selling the ATM delta-hedged call," which has "mostly negative Sharpe ratios net of costs"; profitability "dissipates after the daily availability of 0DTEs" (post 2022-05-11).
- Pinning/gamma: not studied.

### 4.10 Vilkov, "0DTE Trading Rules" (SSRN 4641356, Nov 2023; 2026 version "0DTE Trading Rules: Tail Risk, Implementation, and Tactical Timing") [B via secondary]
Sources: [CXO Advisory, 2023-12-20](https://cxoadvisory.com/equity-options/0dte-strategy-outcomes) (paywalled after setup); [Hull Tactical, 2026-07-08](https://hulltactical.com/2026/07/08/0dte-options-tiny-edge-huge-distribution/); both accessed 2026-11-06.
- Design: "static rules that are executed every day and held to expiration"; entries 10:00 (main), 13:00, 15:00; SPX 0DTE Sept 2016–May 2023 (CXO) / to 2024-01-11 (Hull), 30-minute data with interpolation to moneyness 0.98–1.02; calls, puts, ATM straddles, strangles, verticals, ratio spreads, risk reversals.
- Results (as summarized): "Simple unhedged 0DTE S&P 500 Index option strategies seldom paid off gross of costs"; VRP "positive but small"; "most put, call, strangle and spread medians were negative"; "the average returns of most strategies are not statistically significant"; "realized returns of individual options are extremely volatile and skewed"; "much of the P&L of these strategies can be explained by realized skewness in the underlying index return." Entry-time comparisons are in the paper but not in any page I could open.

### 4.11 Chong (HKUST), "Are 0DTE Options Mispriced?" (SSRN 4933153; summary 2026-04-18) [B via author institution]
Source: [HKUST BizInsight](https://bm.hkust.edu.hk/bizinsight/2026/04/are-0dte-options-mispriced), accessed 2026-11-06. Sample 2020–2024. "transaction costs and estimation risk render the Sharpe ratios of the volatility arbitrage strategies economically insignificant"; "0DTEs are expensive but do not appear to be mispriced"; 0DTE "nearly 60% of the volume of S&P 500 index options in 2025."

### 4.12 Other 2024–2026 items
- Dalvi & LaFond (2026 WP), SPY/QQQ/IWM Cboe trade-level 2012–2025: daily expiries ⇒ "maturity substitution away from both short-term (2–5DTE) and medium-term (6–30DTE)," "a marked increase in directional trading intensity," "increased market maker intermediation," and "a higher percentage of short-term options volume is associated with a higher level of volatility expectations" at 30 days. Source: [Harbourfront summary](https://harbourfrontquant.substack.com/p/how-0dte-options-are-reshaping-market), accessed 2026-11-06. [B via secondary]
- Shi (Princeton OFE senior thesis, 2026-04-08): see §2.10 item 7. [B, unrefereed]
- "Barardehi et al." on 0DTE: I found no paper by that author on 0DTE in any search; the closest hits were the Princeton thesis and the Utah press item. Reported as not found.

### 4.13 What the literature says, by question

| Question | Finding | Class |
|---|---|---|
| Expected return of buying 0DTE calls/puts | Negative across strikes; OTM calls worst; retail longs −53% avg (−61% post-2022); VRP up to 4× longer-dated | B (Almeida; Beckmeyer) |
| Right tail | "extremely volatile and skewed"; P&L explained by realized skewness; lottery-like | B (Vilkov; Beckmeyer) |
| Intraday timing | Delta-hedged/straddle losses largest 12:00–14:00 (Almeida); spreads widest at open/close; Fed-day premium decays only after 2 pm (Cboe/Zaionz); retail opening+closing U-shaped with ~12% in last 30 min (Cboe 2025) | B |
| Gamma → realized vol | 0DTE OI gamma ↔ lower intraday RV, no overnight propagation (DEV); net gamma ↑ ⇒ next-10-min vol ↓, order-flow reversal ↑, HF momentum negative (Adams); no rise in 1-min 2σ gap frequency incl. last hour (Cboe) | B |
| Opposite view | +14% daily vol per 1 SD 0DTE volume (Utah, press only) | C |
| Pinning of SPX 0DTE at the close | Not studied in any source found | gap |

---

## 5. Pinning and intraday momentum/reversal literature

### 5.1 Ni, Pearson, Poteshman, "Stock price clustering on option expiration dates," *JFE* 78(1), 2005, 49–87 [B via abstract]
Sources: [EconPapers record](https://econpapers.repec.org/RePEc:eee:jfinec:v:78:y:2005:i:1:p:49-87) (bibliographic only); abstract as surfaced from [HKBU scholars page](https://scholars.hkbu.edu.hk/en/publications/stock-price-clustering-on-option-expiration-dates-3/): closing prices of optionable stocks cluster at strikes on expiration dates, attributed to "hedge rebalancing by option market makers and stock price manipulation by firm proprietary traders"; a 2004 draft reportedly quantified "an average of at least 16.5 basis points" of return alteration per expiration (secondary, unverified against the published version). Pearson-Poteshman-White's 2006 WP summarizes the mechanism: "stock trading undertaken by option market participants in order to keep their portfolios hedged as the deltas of their expiring option positions change rapidly as the remaining time to expiration shrinks to zero is a major driver of this stock price clustering" ([PPW 2006 PDF](https://ou.edu/dam/price/Finance/CFS/paper/pdf/pearsonPoteshmanWhite.pdf), accessed 2026-11-06). Single stocks, physically settled, American — not our instrument.

### 5.2 Avellaneda & Lipkin, "A market-induced mechanism for stock pinning," *Quantitative Finance* 3(6), 2003, 417–425 [B/theory; full PDF read]
Source: [PDF (gwern mirror)](https://www.Gwern.net/doc/economics/2003-avellaneda.pdf); also [NYU page](https://math.nyu.edu/inmemoriam/avellaneda/stock_pinning.html). Accessed 2026-11-06. Abstract: "if the open interest on a particular contract is unusually large, delta-hedging in aggregate by floor market-makers can impact the stock price and drive it to the strike price … a stochastic differential equation for the stock price which has a singular drift … the stock price has a finite probability of pinning at a strike. We calculate analytically and numerically this probability in terms of the volatility of the stock, the time-to-maturity, the open interest for the option under consideration and a 'price elasticity' constant." Mechanism: "we postulate that the force is proportional to the rate of change in the (Black–Scholes) deltas associated with the strike/expiration. The range of this force varies therefore with time, and becomes increasingly concentrated around the strike price as expiration approaches." Condition: dealers *long* the option at the strike (customers short), which is the *opposite* of the SqueezeMetrics put assumption; if dealers are short, the same force repels ("anti-pinning"). Case: JDEC 2001, hedge fund sold >25,000 contracts on one strike six times; "The stock actually pinned at that strike four out of the six times."

Formal content worth reusing: the drift is `∝ −n·E·∂Δ/∂t` evaluated at current spot, where n is OI and E a price-impact elasticity; the pinning probability is a function of the dimensionless coupling `n·E/(σ²·S·…)` and `σ√τ`. The sign of the drift depends on dealer sign; magnitude on OI × charm × impact.

### 5.3 Jeannin, Iori, Samuel, "Modeling stock pinning," *Quantitative Finance* 8(8), 2008, 823–831 [B via abstract]
Source: [EconPapers](https://econpapers.repec.org/RePEc:taf:quantf:v:8:y:2008:i:8:p:823-831); WP: [City Research Online](https://openaccess.city.ac.uk/id/eprint/1447/). Accessed 2026-11-06. Extends Avellaneda-Lipkin using Frey-Stremme: pinning arises from "a drift term that pushes the price toward the strike, and a volatility term that constrains the price near the strike"; also reproduced in a simulated double-auction market.

### 5.4 Golez & Jackwerth, "Pinning in the S&P 500 futures," *JFE* 106(3), 2012, 566–585 [B via abstract]
Sources: [EconPapers (JFE)](https://econpapers.repec.org/RePEc:eee:jfinec:v:106:y:2012:i:3:p:566-585); [IDEAS (2010 WP)](https://ideas.repec.org/p/knz/dpteco/1012.html); [KOPS record](https://kops.uni-konstanz.de/entities/publication/0c68d50d-23f5-4771-bdbf-c345290a3452). Accessed 2026-11-06. Abstract: S&P 500 futures "are pulled toward the at-the-money strike price on days when serial options on the S&P 500 futures expire (pinning) and are pushed away from the cost-of-carry adjusted at-the-money strike price right before the expiration of options on the S&P 500 index (anti-cross-pinning). These effects are driven by the interplay of market makers' rebalancing of delta hedges due to the time decay of those hedges as well as in response to reselling (and early exercise) of in-the-money options by individual investors. The associated shift in notional futures value is at least $115 million per expiration day." 2010 WP: "the effect is asymmetric and stronger above the strike price … pinning becomes more pronounced in recent years." Sample period and pinning probabilities: not in the abstract; WP PDF not retrievable. The cash-settled, European SPX contract shows *anti*-cross-pinning in their data (monthly AM-settled SPX at that time).

### 5.5 Pearson, Poteshman, White (2006 WP) → Ni, Pearson, Poteshman, White, *RFS* 34(4), 2021, 1952–1986 [B]
Source: [PPW 2006 PDF](https://ou.edu/dam/price/Finance/CFS/paper/pdf/pearsonPoteshmanWhite.pdf), accessed 2026-11-06; published version [RFS record](https://econpapers.repec.org/RePEc:oup:rfinst:v:34:y:2021:i:4:p:1952-1986.). "a statistically and economically significant negative relationship between stock return volatility and net purchased option positions of investors who are likely to hedge." Effect size (2006 WP, single stocks): "The average daily absolute return of the stocks in our sample is 310 basis points and a one standard deviation shock to the gamma of the net option position variable is associated with a 37 basis point change in absolute return. Consequently, we estimate that on the order of 12 percent (=37/310) of the daily absolute return" is attributable. Net gamma is built from Cboe open-close positions by investor class with Black-Scholes gammas, scaled by `S/M` — this is the methodology Adams et al. port to SPX 0DTE.

### 5.6 Index / cash-settled pinning: what exists and what does not
- Documented: pinning of ES futures to futures-option strikes; anti-cross-pinning around (AM-settled) SPX expiries (Golez-Jackwerth). [B]
- Not documented anywhere I could find: pinning or anti-pinning of the S&P 500 cash index into the 4:00 pm close on PM-settled SPXW expiries (daily since 2022-05-11). Vendors assert it ("0DTE Power Hour," "0DTE magnet," "$20mm per strike … appeared to pin the SPX") with single-day anecdotes ([SpotGamma 2025-05-13](https://spotgamma.com/the-anatomy-of-an-spx-0dte-driven-market/); [FlashAlpha 0DTE magnet](https://flashalpha.com/concepts/zero-dte-magnet)). The SpotGamma anecdote itself ends in an *unpin*: "the end-of-day pin at 5,825 'comes undone' when the 5,825-5,830 positions were exited before the close. SPX then rose about 20 points in the final 15 minutes." [C]
- Mechanical reasons to expect weaker pinning than single stocks: cash settlement (no early exercise, no delivery flows); dealers hedge in ES/SPY, not the 500 constituents; the settlement print is the component closing-auction aggregate, not a traded index; and Cboe's 0DTE net gamma is small relative to ES liquidity. Mechanical reason to expect *some* effect: retail closing volume in the last 30 minutes (~12% of opening trades) and dealer de-risking ("Many seasoned option desks choose to de-risk or close out 0DTE positions before the final 30 minutes … some clearing firms mandate that 0DTE positions be flattened by 3:45pm" — [Numerix white paper, 2026-01](https://www.numerix.com/sites/default/files/file/2026-01/Numerix_White_Paper_Gamma_Hedging_of_ODTE_Options.pdf), accessed 2026-11-06, [C]).

### 5.7 Gao, Han, Li, Zhou, "Market intraday momentum," *JFE* 129(2), 2018, 394–414 [B; WP PDF read]
Sources: [EconPapers (JFE)](https://econpapers.repec.org/RePEc:eee:jfinec:v:129:y:2018:i:2:p:394-414); [Dec 2015 WP PDF](https://c.mql5.com/forextsd/forum/173/intraday_momentum_-_the_first_half-hour_return_predicts_the_last_half-hour_return.pdf), accessed 2026-11-06; extracted locally. SPY 1993-02-01 → 2013-12-31. "the first half-hour return on the market predicts the last half-hour return … predictive R² … is 1.6%" (scaled slope 6.94, 1% level); with the 12th half-hour, R² 2.6%; high first-half-hour-vol days 3.3% (combined); OOS R² 1.2% (first half-hour alone), 1.8% (both); "stronger on more volatile days, on higher volume days, on recession days, and on major macroeconomic news release days"; timing-strategy Sharpe 1.08 (WP). Explanations: Bogousslavsky (2016) infrequent rebalancing and late-informed trading; the WP notes the U-shaped volume pattern.

### 5.8 Baltussen, Da, Lammers, Martens, *JFE* 142(1), 2021 [B; full PDF read]
Source: [PDF](https://academicweb.nd.edu/~zda/intramom.pdf), accessed 2026-11-06. "Using intraday returns on over 60 futures on equities, bonds, commodities, and currencies between 1974 and 2020, we find strong market intraday momentum everywhere. The return during the last 30 minutes before the market close is positively predicted by the return during the rest of the day (from previous market close to the last 30 minutes) … and reverts over the next days." Rest-of-day return `r_ROD` is the better predictor than the first half-hour: pooled OOS R² 2.88% for equity index futures (Table 2). Gamma conditioning (Table 7, S&P 500 futures, Jan 1996–May 2020, coefficients ×100): `NGE_{t−1} ≥ 0`: β_ROD 0.82 (t 1.03), R² 0.05%; `NGE_{t−1} < 0`: β_ROD 6.63 (t 4.78), R² 3.58%. Table 8: interaction `NGE × r_ROD` −123.04 (t −3.42); `I(NGE≤0) × r_ROD` 5.05 (t 3.04). Also LETF rebalancing demand (2006–2020) and a jump-day test. Their reading: "market intraday momentum is only present when, according to our proxy, option market makers are net short gamma. But, when they are net long gamma, market intraday momentum is no longer present." They cite Barbon & Buraschi (2020) as showing gamma hedging drives intraday momentum and reversal patterns.

### 5.9 Bogousslavsky (2016, *JF* 71(6), 2967–3006) and Bogousslavsky & Muravyev (2023, *JFM* 66) [B via abstracts]
- Infrequent rebalancing generates return autocorrelation that "can switch sign and become positive at the rebalancing horizon"; size and illiquidity premia accrue in the last 30 minutes and overnight ([EconPapers JF](https://econpapers.repec.org/RePEc:bla:jfinan:v:71:y:2016:i:6:p:2967-3006); JMP abstract via [EPFL](https://infoscience.epfl.ch/record/229415/files/EPFL_TH7785.pdf?version=1), accessed 2026-11-06).
- "Who trades at the close? Implications for price discovery and liquidity" (SSRN 3485840; *JFM* 2023): closing-auction volume tied to ETF/passive ownership and institutional rebalancing; closing-price deviations largely reverse overnight (complete for large stocks); "one-third to one-half of the reversal occurs within the first half-hour after the close" for liquid names. (Per search summaries; not opened.) Relevance: the closing-auction component of SPXW settlement contains transitory price pressure.

### 5.10 Replications and 2023–2026 updates [B/C]
- Zarattini, Aziz, Barbon, "Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY)," SFI WP 24-97 (first version 2024-05-10, current 2025-02-03): 2007–early 2024, "Total return of 1,985% (net of costs)," 19.6% annualized, Sharpe 1.33; the paper "investigates whether dealer gamma imbalances help explain changes in strategy profitability" (no finding on the public page). Sources: [Concretum page](https://concretumgroup.com/beat-the-market-an-effective-intraday-momentum-strategy-for-sp500-etf-spy/); [SFI listing](https://www.sfi.ch/de/publications/n-24-97-beat-the-market-an-effective-intraday-momentum-strategy-for-s-p500-etf-spy). Accessed 2026-11-06. Strategy is a volatility-scaled noise-band breakout, not the pure last-half-hour signal.
- MDPI *Risks* 12(11):180 (2024), per search snippet: 2022–2024 data, "intraday returns are still predictable, especially for those returns during the last half-hour." Page blocked (403); unverified ([MDPI](https://www.mdpi.com/2227-9091/12/11/180)).
- Secondary replications (QuantConnect, Harbourfront) report weaker performance post-2020; [CXO](https://www.cxoadvisory.com/?p=25481). [C]
- Adams et al. (§4.6) is the most relevant *reversal* evidence: higher 0DTE-day net gamma ⇒ negative high-frequency return autocorrelation and stronger E-mini order-flow reversals over ~1 hour.
- End-of-day reversal evidence specific to the closing auction: Bogousslavsky-Muravyev (§5.9); European evidence of ~14% overnight reversal of the auction move (Goethe University study via [Investing.com/Reuters, 2024-05-01](https://uk.investing.com/news/stock-market-news/a-third-of-all-sp-500-trades-now-occur-10-minutes-before-the-close--report-432SI-3467369), accessed 2026-11-06).

---

## 6. Volatility and timing mechanics relevant to the closing window

### 6.1 IV → expected move over the remaining minutes [A]
- Black-Scholes IV is annualized under calendar- or trading-day conventions; vendors differ (365 vs 252 vs 262 days). For the remaining-session move, convert to *trading time*: `σ_remaining = σ_IV × √(τ_rem)` with `τ_rem = (minutes remaining / minutes per trading day) / (trading days per year)` under a 252×390-minute year, or use the vendor's own day count if you back out IV yourself. For an ATM straddle, `E|ΔS| ≈ 0.8 × S σ √τ` (≈ √(2/π)); the straddle mid itself is the market's price of that expectation, so a cleaner, model-free remaining-move estimate is `EM_rem ≈ Straddle_mid(ATM, 0DTE)` with `1σ ≈ Straddle_mid / 0.8` (FlashAlpha's repo states the straddle convention inconsistently: "the 1SD move equals straddle × 0.6827" and "the straddle price itself is used" — avoid both; [0dte-options-analytics README](https://github.com/FlashAlpha-lab/0dte-options-analytics), accessed 2026-11-06).
- Remaining-move scaling by √(fraction of session left) is only right if intraday variance were flat; it is not (6.3). Use a cumulative intraday variance profile `V(t)` and scale by `√((V(close) − V(t))/V(close))`.

### 6.2 What 0DTE IV means near expiry [A]/[B]
- With minutes left, IV is a unit conversion of a price into a σ under a lognormal with τ→0; any scheduled-event or microstructure variance is forced into σ, producing the ATM term-structure "oscillations" BFGR model. Almeida: 0DTE smile is symmetric; deep OTM IVs are artifacts; use `k_std` filters.
- Time-of-day dependence of the premium is real: Almeida's annualized 0DTE VRP ranges 1.54%–2.95% across 10:00–14:00 entry times, and Cboe/Zaionz report ATM premium "almost no decay" until ~2 pm on Fed days. So "IV" at 15:50 is not comparable to "IV" at 10:00 without the periodicity adjustment.

### 6.3 Intraday variance seasonality and the last minutes [B]
- U-shape: Andersen & Bollerslev, "Intraday periodicity and volatility persistence in financial markets," *J. Empirical Finance* 4(2–3), 1997, 115–158 ([Duke record](https://scholars.duke.edu/publication/761297), accessed 2026-11-06): pervasive intraday periodicity; high volatility at open and close for S&P 500 futures.
- Finer resolution: Pagano, Peng, Schwartz, CFS WP 2008/45 ([PDF](https://gfk-cfs.de/media//08_45.pdf), accessed 2026-11-06; extracted locally), Nasdaq stocks: "intra-day volatility accentuations: they are concentrated within the first two minutes after the open and the last minute prior to the close, with the overall pattern being stapleshaped rather than U-shaped." Nasdaq's 2004 call auctions "reduced this volatility." Equities, not the index; but it warns that half-hour buckets overstate how much of the closing variance is spread across the last 30 minutes vs concentrated in the final minute(s).
- Closing concentration of volume: "About one-third of all S&P 500 stock trades are now executed in the final 10 minutes of trading sessions," up from 27% in 2021 (BestEx Research via Bloomberg/Reuters, [Investing.com 2024-05-01](https://uk.investing.com/news/stock-market-news/a-third-of-all-sp-500-trades-now-occur-10-minutes-before-the-close--report-432SI-3467369)); closing auctions "handled nearly 10% of all share trades last month" (Rosenblatt, same article). Count of trades, not shares.
- Index-level last-hour gap frequency: Cboe's 2-σ 1-minute-move test (vs preceding 30-min RV) shows no trend 2013–2023 for the last hour (§4.1).
- **Gap**: I found no published SPX-specific decomposition of daily variance into the last 10 minutes vs the rest, nor a published distribution of (settlement − last pre-close index tick). Proposed measurement in §8.

### 6.4 Theta/gamma of the ATM 0DTE in the final minutes; option ≈ expected intrinsic [A]
- As τ→0 the option price converges to `E^Q[(S_T − K)^+ | F_t]` under the remaining-minutes distribution; for a 1σ_rem-wide distribution around spot, the ATM call ≈ `0.4 × S σ_rem` and its delta ≈ `Φ(d1)` → step function at K; gamma ≈ `φ(d1)/(S σ_rem)` → Dirac at K. Theta ≈ `−S φ(d1) σ/(2√τ)` per year → per minute, `−ATM_price/(2 τ_min)`: an ATM straddle loses half its remaining value in the final `τ/2`, i.e. decay accelerates as 1/τ (vendor restatement: "By 2 PM, the decay rate per hour roughly doubles. By 3:30 PM, it can be 4-5x the morning rate" — [FlashAlpha article via search](https://flashalpha.com/articles/0dte-gamma-exposure-pin-risk-intraday-options-analytics), [C]).
- Numerix (2026-01, [C]) gives the standard illustration: ATM at 6800 with 2 hours left, δ≈0.50; a 1% (68-pt) move takes δ to ~0.95 or ~0.05; and "Many seasoned option desks choose to de-risk or close out 0DTE positions before the final 30 minutes … some clearing firms mandate that 0DTE positions be flattened by 3:45pm."
- Consequence for hedging flows: for strikes within ±1σ_rem of spot, dealer delta changes by O(OI × 100) over the final minutes *without any spot move* (charm), and by the full OI × 100 if spot crosses K. For strikes farther than ~3σ_rem, nothing happens. So the relevant "GEX" in the last 10 minutes is the OI of the one or two strikes bracketing spot, signed by (unknown) dealer position, times a price-impact constant — the Avellaneda-Lipkin setup, not the all-expiry sum.

### 6.4b Positioning × location: what each assumption predicts for the final minutes [A, given the model]

Take one 0DTE strike K with open interest n (calls + puts, both nearly digital at this point), spot S within ±1σ_rem of K, and dealers hedging to delta. The time-derivative of delta (charm) and the spot-derivative (gamma) imply these mechanical dealer flows over the final minutes, holding everything else fixed:

| Dealer position at K | S slightly above K | S slightly below K | Net effect on S | Label |
|---|---|---|---|---|
| Long the options (customers short; Avellaneda-Lipkin premise) | charm makes dealer delta rise toward +n·100 (calls) / toward 0 (puts); dealer **sells** underlying to stay neutral | dealer **buys** | pushed toward K | pinning |
| Short the options (SqueezeMetrics put premise; "retail net long" premise) | dealer hedge delta falls in magnitude; dealer **buys** back hedge | dealer **sells** | pushed away from K | anti-pinning |
| Balanced (Cboe's 0DTE picture) | ~0 | ~0 | none from this strike | neutral |
| Long calls / short puts (naive GEX) | long-call charm ⇒ sell; short-put charm ⇒ sell less … net depends on call vs put OI split | mirror | sign = sign(OI_call − OI_put) weighted | ambiguous |

Two corollaries. (1) Under *any* non-balanced positioning, the magnitude of the final-minute flow at K scales with `n × |∂Δ/∂t|`, which is largest for `|S − K| ≲ 0.5σ_rem` and vanishes beyond ~2σ_rem — so the only strikes that matter at 15:50 are the one or two bracketing spot. (2) The *sign* is unidentified from OI alone; it is identified by (a) Cboe Open-Close customer-net opening volume, (b) a flow-signed proxy with ~20% error, or (c) the data themselves via H4 (fit the sign). Gamma-hedging in the final minutes is additionally lumpy because of hedging bands and because, per Numerix and SpotGamma anecdotes, many books are flattened or closed before 15:45, converting a continuous charm flow into discrete position-closing prints.

A note on what "pinning" would even look like for the cash index: dealers hedge SPX in ES/SPY, so any pinning force acts on ES, propagates to the cash index through arbitrage, and then has to survive the closing auction. Golez-Jackwerth's finding that ES is pushed *away* from the carry-adjusted strike before SPX expiry (monthly, AM-settled, when end-users resell/exercise ITM options) is the only published index-level analogue, and it points to anti-pinning. Whether PM-settled daily 0DTE behaves the same is exactly §8's open question.

### 6.5 Settlement mechanics for SPXW 0DTE [A]
Source: [Cboe SPX/SPXW product specifications](https://ww2.cboe.com/tradable_products/sp_500/spx_options/specifications), accessed 2026-11-06. "The exercise-settlement value is calculated using the closing sales price in the primary market of each component security on the expiration date." (SPX AM: "The exercise-settlement value, SET, is calculated using the opening sales price in the primary market of each component security.") "European - SPX/SPXW options generally may be exercised only on the expiration date." "Trading in SPXW options will ordinarily cease on the day of expiration, 3:00 pm CT." Strikes: "Generally, $5, $10, $25, $50, $100, and $200 strike prices are available." Regular hours 9:30–16:15 ET (non-expiring).
Implications: (i) the settlement value is the official S&P 500 close computed from component closing-auction prints (which arrive after 16:00:00), not the index's last pre-4:00 tick; (ii) the last traded option price at 15:59:59 is a bet on that auction outcome; (iii) a "settlement − last-tick" gap distribution is well-defined and measurable from index ticks (4:00:00 print) and the published close.

---

## 7. Public GitHub repositories implementing GEX / 0DTE tools

Stars and dates are as shown on 2026-11-06. GitHub's `gamma-exposure` topic lists 77 repos ([topic page](https://github.com/topics/gamma-exposure)); `0dte` lists 39 ([topic page](https://github.com/topics/0dte)). I inspected the following via README and, where noted, source files.

| # | Repo | Stars | Lang | License | Data source | GEX formula / sign | Flip method | Notes / bugs |
|---|---|---|---|---|---|---|---|---|
| 1 | [jensolson/SPX-Gamma-Exposure](https://github.com/jensolson/SPX-Gamma-Exposure) | 166 | Python | not shown | Cboe delayed quote-table `.dat`; TRTH | `10^-6 × 100 × F × OI × Γ`, calls +, puts − (code) | 20-spot reprice; `np.interp` zero | **Drops 0DTE** (`BDTE ≥ 1`); IV inverted via pyVolLib, `rf=.02`; filters `.01<IV<2`, `|Δ|<.95`; issue #3 "quote table format changed" (2022-11) |
| 2 | [Matteo-Ferrara/gex-tracker](https://github.com/Matteo-Ferrara/gex-tracker) | 223 | Python | not shown | `cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json` | `S × Γ × OI × 100 × S × 0.01`; uses Cboe's gamma; puts − | none | 3 commits, ~3 yrs stale; charts 85–115% of spot, expiries <365d; issues: "empty json files", "Challenges with certain tickers" |
| 3 | [pikki622/gex-analytics](https://github.com/pikki622/gex-analytics) | 2 | Python | MIT | Cboe delayed JSON | `Γ × OI × 100 × S² × 0.01`; puts − | BS reprice, r=q=0, 10-bps grid; "ex-next / ex-monthly" profiles | 0DTE τ = 1/262 yr (wrong late in day); ETF chains 403 without DataShop; "gamma impact table" vs 20-day ADTV |
| 4 | [FlashAlpha-lab/gex-explained](https://github.com/FlashAlpha-lab/gex-explained) | 18 | Python | MIT | sample CSV + FlashAlpha API | `Γ × OI × 100 × S² × 0.01`; calls +, puts − | API | Educational; warns OI lags intraday; API tiers |
| 5 | [gammagrid/gammagrid](https://github.com/gammagrid/gammagrid) | 94 | Python | AGPL-3.0 | yfinance (15–20 min delay) | "via Black-Scholes … from open interest"; IV inverted | not described | Strike×expiry heatmap, replay; **SPXW chain incomplete on 3rd Friday** (Yahoo serves one contract per strike); VIX excluded |
| 6 | [simonro/Edge-GEX-Lab](https://github.com/simonro/Edge-GEX-Lab) | 62 | Python/React | MIT | Alpaca (user keys) + Cboe delayed | `sign × Γ × OI × 100 × S² × 0.01`, BS r=q=0; **unsigned view** | "every gamma flip within 10% of spot" | OI date inferred from payload; free feed: "Net GEX for today's expiry was off by as much as half"; SPX spot stale before ~09:45; futures basis via put-call parity; Cboe ToS warning |
| 7 | [EazyDuz1t/EzOptions-Schwab](https://github.com/EazyDuz1t/EzOptions-Schwab) | 45 | Python | GPL-3.0 | Schwab API (schwabdev) | GEX/DEX/vanna/charm/speed/vomma/color; weighting OI, volume, max(OI,vol), OI+vol | "zero-flip" lines on price×time surface | Expected move = ATM straddle; /ES via cash-index options scaled by futures/index ratio; 7-day token expiry |
| 8 | [zrack/gex-terminal](https://github.com/zrack/gex-terminal) | 27 | Python | MIT | Databento (uncertified), yfinance; replay captures | Black-76 (ES/NQ), BS (index); position models: OI, raw volume, **directionalized volume** | "modeled levels," walls, replay | README: "predictive_validity: unmeasured"; "research alpha" |
| 9 | [Darthreign/gex-dashboard](https://github.com/Darthreign/gex-dashboard) | 19 | Python | MIT | Cboe delayed JSON; optional dxFeed | `γ × OI × 100 × S² × 0.01`, naive sign | **±8% spot grid reprice, IV fixed, nearest zero-crossing by interpolation**; "HVL = volume-weighted flip" | 0DTE GEX1–5 walls; 1-min delta-flow proxy (`Δvolume × δ × 100 × S`, not signed); q=0 for SPY/QQQ |
| 10 | [FlashAlpha-lab/0dte-options-analytics](https://github.com/FlashAlpha-lab/0dte-options-analytics) | 13 | Python | MIT | FlashAlpha API | API | API | `pin_score` 0–100 and `magnet_strike` undefined; expected-move formula internally inconsistent; hedging-flow buckets ±10/25/50 bps, ±1% |
| 11 | [puneet-chandna/0DTE-dealer-gamma](https://github.com/puneet-chandna/0DTE-dealer-gamma) | 11 | Python/TS | PolyForm NC | yfinance **SPY×10 as SPX**; optional Tradier SPXW | in docs (not read) | "zero-gamma level" | Postgres history, session replay, backtests with user costs |
| 12 | [zer0dte/zer0dte](https://github.com/zer0dte/zer0dte) | 8 | n/a | not shown | undisclosed, 60-s polling | BS closed forms (claimed) | levels tool | MCP server; **server code not in repo**; unverified "accuracy" claims |
| 13 | [emlama/gex-backtesting](https://github.com/emlama/gex-backtesting) | 16 | Python | not stated | **Polygon flat files, 513 days 2024-01-02 → 2026-02-19, ~2.3 GB parquet, 400–900k trades/day, quote-matched side** | "traditional GEX (all trades customer buys)" vs **side-weighted GEX** | n/a | GCI = HHI of gamma by strike; PGR = gamma within ±$20; CAR; pre-registered test of PUT "explosions" with FDR; **no results reported** |
| 14 | [phammings/spx500-gamma-exposure-calculator](https://github.com/phammings/spx500-gamma-exposure-calculator) | 42 | Python/Shell | not shown | Cboe via Selenium | Perfiliev method | profile chart ("up to 5 minutes") | last push 2024-11; Tableau dashboard |
| 15 | [TradersPost/traderspost-command-dash](https://github.com/TradersPost/traderspost-command-dash) | 7 | Python/TS | private | Polygon/Massive | `Γ × OI × 100 × S² × 0.01` (per search snippet) | call/put wall, strike profile | internal tool; not reusable |
| 16 | [cobriensr/Options-Strike-Calculator](https://github.com/cobriensr/Options-Strike-Calculator) | 22 | TS/Python | AGPL-3.0 | Schwab + Unusual Whales + GEXBot | consumes GEXBot dealer state | n/a | 15.8k tests; ML "Take-It" probabilities without reported validation |

Also noted on the topic pages: `Hewkaw02/Futures-Options-SD-Dashboard` (22★, hourly flow/GEX/SD-range for futures), `itsfabtrading/Gex-Multi` (7★, public Cboe chains), `iAmGiG/gex-llm-patterns` (35★), `davidalmeida90/GEX-scalping-tradingbot` (15★, IBKR paper), `G12-maker/0DTE-lab` (4★, QQQ 0DTE backtest "no-theta demo mode"), `sparrow-capital/nautilus-zerodte` (2★), `FlashAlpha-lab/flashalpha-historical-examples` (3★, 21 QuantConnect LEAN option backtests). None inspected in depth.

Open-source 0DTE datasets/notebooks: the only one with real data plumbing is emlama (Polygon flat files; data not in repo). Alpaca's tutorial uses Databento 1-minute bars for a 0DTE bull-put-spread backtest ([Alpaca](https://alpaca.markets/learn/backtesting-zero-dte-bull-put-spread-options-strategy-with-python), via search snippet). Commercial: ThetaData, Polygon (~$79/month per a vendor comparison), Cboe DataShop OPRA. No open ThetaData notebook found. [C]

Cross-repo criticisms worth internalizing: (a) every repo assumes the sign; only Edge-GEX-Lab exposes an unsigned view and only emlama/zrack/FlashAlpha attempt flow-signing; (b) none publishes a hit rate, calibration, or backtest result for flip/walls — zrack says so explicitly; (c) the free Cboe endpoint is "not contractual" and Cboe "restricts automated use" (Edge-GEX-Lab); (d) yfinance-based tools mis-handle SPXW on third Fridays and SPY×10 is not SPX (different dividend, settlement, and customer base); (e) 0DTE handling: dropped (jensolson), τ floored at a day (pikki622), or undisclosed.

---

## 8. Closing-window-specific research (last 10 minutes of SPX 0DTE)

**Finding: none.** No paper, exchange note, or vendor backtest I could access studies (i) SPX price behavior in the final 10 minutes relative to high-OI/gamma 0DTE strikes, (ii) a "strike magnet" hit rate with a stated sample, or (iii) the distribution of settlement minus the last pre-close tick. Closest items: Cboe's last-hour 1-minute 2σ-gap frequency (flat, 2013–2023; [§4.1](https://spotgamma.com/wp-content/uploads/2023/09/cboeqqq.pdf)); Cboe's 3:30 pm net-gamma distribution; Adams et al.'s 10-minute-ahead vol and order-flow-reversal results (not close-specific); Golez-Jackwerth's futures pinning/anti-cross-pinning on monthly expiries; vendor anecdotes.

**Prospective measurement design (what we should build):**

1. **Panel**: every SPXW expiry day since 2022-05-11 (daily) — ~870 days to date; extend back to 2016 with M/W/F expiries for robustness.
2. **Index path**: SPX 1-second (or 1-minute) ticks 15:30–16:00:00, the 16:00:00 print `S_400`, and the official close `S_set` (the settlement value). Also ES front-month ticks to 16:00 and 16:15 for the futures view.
3. **Option state at 15:50** (and 15:30, 15:45, 15:55): 0DTE chain snapshot (OI from the morning file; cumulative volume; mid quotes). Define, for strikes `K_j` within ±0.5% of `S_t`:
   - `OI_j`, `Vol_j` by call/put; `Γ_j(t)` with τ in minutes; naive `GEX_j`, unsigned `|GEX_j|`, and if Open-Close 1-minute data is bought, dealer-net `OI_j^{dealer}`.
   - `K* = argmax_j |GEX_j|` (the "magnet"), `d_t = S_t − K*`, and `σ_rem(t) = Straddle_mid(ATM)/0.8`.
4. **Outcomes**: `S_set − S_t` (signed, in units of `σ_rem`), `|S_set − K*|` vs `|S_t − K*|` (did price move toward the nearest high-OI strike?), realized variance 15:50–16:00 vs the 10:00–15:50 per-minute average, `S_set − S_400` (settlement gap), and whether `S_set` lands within ±0.05% of any strike with OI > threshold.
5. **Nulls**: compare against (a) the same statistics on *non*-expiry days (pre-2022 M/W/F vs Tu/Th gives a clean within-week control, as Adams et al. use), and (b) a placebo `K*` drawn from strikes with OI in the bottom quartile, and (c) a bootstrapped random-walk with the empirical 15:50 σ_rem. Pinning ⇔ `E[|S_set − K*|] < E[|S_t − K*|]` conditional on `|d_t| < 1σ_rem`; anti-pinning ⇔ the reverse; test both signs because dealer position is unknown.
6. **Settlement gap**: the empirical distribution of `S_set − S_400` (should be centered near zero with fat tails on rebalance days — index rebalances, quad witching, MSCI). Report quantiles and the fraction of days where the gap exceeds `0.5 × σ_rem(15:59)`.
7. **Variance share**: `RV_{15:50–16:00} / RV_{09:30–16:00}` per day; test for trend since 2022 and for dependence on `|GEX_ATM|`.

**Data pipeline spec for the closing-window panel (what to capture every expiry day):**

| Stream | Cadence | Fields | Minimum source | Better source |
|---|---|---|---|---|
| SPX index | 1 s (or 1 min) 15:30–16:00:05, plus official close | timestamp, level | any index feed; official close from S&P/Cboe | tick-level with 16:00:00 print flagged |
| ES front month | 1 s to 16:15 | bid/ask/last, size | CME via broker | full depth for impact estimates |
| SPXW 0DTE chain | every 15 s 15:30–16:00; every 60 s 09:30–15:30 | per contract bid/ask/last, volume, OI (AM file), IV, Greeks | Cboe delayed JSON (15-min lag — research only) | OPRA real-time (Polygon/Databento/dxFeed) or broker API (Tradier/Schwab) |
| OPRA trades | tick | price, size, condition codes, NBBO at print | Polygon flat files (emlama pipeline) | Databento OPRA with MBP-1 |
| Customer net positions | 1 min / 10 min / EOD | buy/sell × open/close × participant × size bucket | Cboe Open-Close (paid; C1 1-min from 2019-10-07) | — |
| Calendar flags | daily | FOMC/CPI/NFP, index rebalance, quad witching, half-day (1:00 pm ET SPXW cutoff) | public calendars | — |
| Vendor levels (optional) | EOD + intraday | MenthorQ CR/PS/HVL (full + 0DTE), SpotGamma walls/Vol Trigger | vendor subscriptions | — |

Derived per-snapshot features (computed, versioned): `σ_rem`, `K*`, `MAG`, naive/unsigned/flow-signed 0DTE GEX at strikes within ±2σ_rem, repriced flip roots and slope, charm exposure, GCI, cumulative intraday variance `V(t)`, and the level-stability counters from §2.10 item 9. Storage: Parquet partitioned by date; ~1–2 MB/day for the 15-s chain snapshots at ±5% strikes.

Minimum sample before any conclusion: with ~250 expiry days/year and an effect that (if it exists) is a shift of a few tenths of `σ_rem` in `|S_set − K*|`, detecting a 0.2σ shift at 80% power needs on the order of 200 conditioned days (|MAG| < 1), i.e. roughly a year of data once the conditioning rate is accounted for. Pre-2022 Tu/Th non-expiry days provide the placebo.

---

## 9. Testable hypotheses for our platform (with the exact feature definition and the null)

Notation: `t0` = decision time (e.g., 15:50 ET), `S_t` = SPX level, `S_set` = SPXW settlement value (official close), `σ_rem` = ATM 0DTE straddle mid at `t0` / 0.8 (price units), `K_j` = 0DTE strikes, `OI_j^{C/P}`, `Vol_j^{C/P}` from the chain at `t0`, `Γ_j(t0)` = BS gamma with `τ` = minutes remaining / (390 × 252), `r` = 1-month T-bill, `q` = implied from ATM put-call parity.

**H1 — Magnet / pinning.** Feature: `MAG = (S_t − K*)/σ_rem` where `K* = argmax_j |Γ_j(t0) (OI_j^C + OI_j^P)| S_t²·0.01·100` over 0DTE strikes with `|K_j − S_t| ≤ 1.5 σ_rem`. Hypothesis: `E[|S_set − K*| / σ_rem | MAG]` is smaller than under the null for `|MAG| < 1`. Null: `S_set − S_t` is a mean-zero random variable with scale `σ_rem` independent of `MAG` (bootstrap from non-expiry days or from the empirical distribution of `(S_set − S_t)/σ_rem` on days where `K*` is placebo-drawn from low-OI strikes). Report both pinning and anti-pinning one-sided tests.

**H2 — Sign-conditional momentum (Baltussen).** Feature: `NGE_t0` = naive total GEX (all expirations) in units of SPX market value, computed at `t0` with the repriced profile (§2.5 Algorithm 2) and `r_ROD = S_t/S_{prev close} − 1`. Hypothesis: `β` in `(S_set − S_t)/S_t = α + β r_ROD + ε` is positive and larger when `NGE_t0 < 0`; near zero when `NGE_t0 > 0`. Null: `β = 0` in both regimes; also test whether the Baltussen point estimate (β ≈ 0.066 for the last 30 min on negative-NGE days) survives on 2022–2026 0DTE-era data. Caveat: NGE sign is on average positive and structurally mis-measured (§2.3 footnote 8).

**H3 — Positive-gamma reversal (Adams et al.).** Feature: `G0 = Σ_{0DTE} sign_j Γ_j(t0) OI_j · 100 · S_t² · 0.01` (naive) and `G0_u` (unsigned); `r_{t0−10m,t0}` = last-10-minute return before `t0`. Hypothesis: `Cov(r_{t0,set}, r_{t0−10m,t0} | G0_u high)` < 0 (reversal strongest when ATM 0DTE gamma is large). Null: zero autocovariance; compare against the same statistic on non-expiry days (pre-2022 Tu/Th).

**H4 — Charm-driven drift into the close.** Feature: `CHARM_t0 = Σ_j sign_j charm_j(t0) OI_j · 100` for strikes within `±2σ_rem`, where charm uses τ in minutes and `sign_j` is the naive dealer sign; alternative with unsigned charm times `sign(S_t − K_j)` (the Avellaneda-Lipkin force direction if dealers are long). Hypothesis: `E[S_set − S_t]` has the sign of the charm-implied dealer delta change. Null: no mean drift. Given sign uncertainty, pre-register the test as two-sided and report which positioning assumption (naive / inverted / long-OI) best fits — this is itself a positioning estimate.

**H5 — Remaining-move calibration.** Feature: `z = (S_set − S_t)/σ_rem`. Hypothesis: `Var(z) < 1` (the 0DTE straddle overprices the remaining move; Almeida's VRP) and the overpricing is larger at `t0 = 15:50` than at `13:00`. Null: `Var(z) = 1` and no time-of-day dependence. Also test the intraday periodicity correction: `σ_rem' = σ_IV √(ΔV_remaining)` from an empirical cumulative variance curve should calibrate better than `√(minutes/390)`.

**H6 — Settlement gap.** Feature: `g = (S_set − S_400)/σ_rem(15:59)`. Hypothesis: `g` is heavy-tailed and its scale is larger on index-rebalance and option-expiration-Friday days; and `|g|` is predictable from the 15:59 ATM straddle (i.e., the market prices auction uncertainty). Null: `g ≡ 0` up to rounding; or `|g|` uncorrelated with the 15:59 straddle.

**H7 — Flow vs OI.** Feature: `ΔVol_j` = cumulative 0DTE volume between 15:30 and `t0` at strikes within `±1σ_rem`, signed by quote rule (ask = buy, bid = sell, mid dropped) and multiplied by `Δ_j`. Hypothesis: signed flow improves H1/H4 fit over OI-only features. Null: no incremental R². Expect ≈20% misclassification (Savickas-Wilson) and heavy multi-leg contamination; if Open-Close 1-minute data is purchased, replace with customer-net opening volume and re-test.

**H8 — Vendor levels add nothing beyond our own.** Feature: distance to vendor-published 0DTE levels (MenthorQ 0DTE CR/PS/HVL; SpotGamma Call/Put Wall) vs distance to our `K*`, walls, and repriced flip. Hypothesis: vendor levels have no incremental predictive content for `S_set − S_t` after our features. Null: zero incremental R².

Pre-registration rules (borrowed from emlama): fix the horizon, the feature definitions above, the sample start, the FDR control (Benjamini-Hochberg at 10% across H1–H8 and their variants), and a non-expiry/placebo control before looking.

**Expected signs under alternative positioning assumptions** (so that a result can be read as evidence *about positioning*, not only about the hypothesis):

| Hypothesis | If dealers net long 0DTE at K* (customers net short) | If dealers net short at K* (customers net long) | If balanced (Cboe) | What the literature leans toward |
|---|---|---|---|---|
| H1 magnet | `|S_set − K*| < |S_t − K*|` (pinning) | `|S_set − K*| > |S_t − K*|` (anti-pinning) | no effect | balanced for 0DTE (Cboe); anti-cross-pinning for index expiries (Golez-Jackwerth) |
| H2 momentum | β smaller / ≈ 0 (dealers lean against) | β > 0 (dealers chase) | β from non-option sources only | Baltussen: β > 0 only when naive NGE < 0; Adams: dealers net long on expiry days ⇒ reversal |
| H3 reversal | negative autocovariance, stronger with unsigned GEX | positive autocovariance | zero | Adams et al.: negative HF momentum when net gamma high |
| H4 charm drift | drift toward K* | drift away from K* | none | untested |
| H5 calibration | `Var(z) < 1` regardless (VRP) | same | same | Almeida; Vilkov; Chong |
| H7 flow | signed flow should flip the H1/H4 sign day by day | same | flow ≈ 0 | Cboe: flows balanced on average, not every day |

Decision value for the platform: if H1 and H4 come back with the pinning sign on days when flow-signed GEX says dealers are long, and with the anti-pinning sign when it says short, the positioning proxy is validated as a feature; if the signs do not line up with any proxy, we treat 0DTE levels as noise and keep only `σ_rem`, `V(t)`, and the settlement-gap model.

---

## 10. Feature list with source / availability / failure cases

| Feature | Definition | Source | Availability | Failure cases |
|---|---|---|---|---|
| 0DTE chain snapshot (bid/ask/IV/OI/vol/Greeks) | per-contract rows for `_SPX` | Cboe delayed JSON `cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json` | free, ~15-min delayed, regenerated ~60 s, "not contractual" | 15-min delay kills last-10-min use; OI is prior-close; format changes break parsers (jensolson #3); ToS restricts automation; stale deep-OTM quotes |
| Real-time 0DTE chain | same, real-time | Tradier (SPXW), Schwab API, Polygon/Massive, Databento OPRA, dxFeed, ThetaData | paid / brokerage-gated | OAuth token expiry (Schwab ~7 days); SPY-as-proxy errors; OPRA consolidation lag in the final minute |
| Naive total GEX, by-strike GEX, 0DTE-only GEX | §2.2 sums | computed | any chain | sign assumption; OI staleness; multi-root profiles |
| Repriced gamma flip(s) | §2.5 Algorithm 2 | computed | any chain | none within band; sticky-strike vs sticky-delta ambiguity; r=q=0 bias (small for 0DTE) |
| Call/put wall (OTM argmax) | FlashAlpha definition, Gaussian-smoothed for 0DTE | computed | any chain | dense ATM clusters; walls jump when OI updates at 09:30 |
| Unsigned/absolute GEX; positioning envelope | §3.5 | computed | any chain | widens to uninformative when calls and puts balance |
| Flow-signed GEX / delta flow | §3.3 quote rule × Δ × size | OPRA trades + NBBO (Polygon flat files, Databento) | paid; emlama has 2024–2026 parquet pipeline | ~20% misclassification; complex orders mis-signed ~50%; aggressor ≠ customer; opening vs closing unknown |
| Customer-net opening positions | Cboe Open-Close 1-min / 10-min / EOD | Cboe DataShop | paid; C1 1-min from 2019-10-07 | intraday files lack prices; "customer" mixes retail/institutional; licensing for derived data |
| Exchange net MM gamma series | Cboe research exhibits | Cboe papers only | not a feed | unavailable programmatically |
| `σ_rem`, expected move | ATM straddle mid / 0.8; or IV × √τ_trading | chain | any | wide spreads at close (Almeida); periodicity mis-scaling |
| Charm/vanna exposure | §2.9 | computed | any chain | convention ambiguity; τ in minutes required |
| Intraday cumulative variance curve `V(t)` | empirical per-minute RV profile by weekday/event | SPX ticks | own history | regime shifts; FOMC/CPI days |
| `S_400`, `S_set` | 16:00:00 print; official close | index feed; S&P/Cboe published close | daily | rebalance days; half-days (SPXW 1:00 pm ET cutoff) |
| HIRO-like cumulative delta notional | vendor | SpotGamma (paid) | real-time, 400+ tickers | proprietary filters; no validation |
| Vendor levels (MenthorQ CR/PS/HVL 0DTE, SpotGamma walls/Vol Trigger) | vendor | paid | EOD + intraday updates (MenthorQ "14 times per day") | undisclosed methods; survivorship in vendor "backtests" |
| Realized-skew proxies | intraday return skew to `t0` | SPX ticks | own | Vilkov: P&L of held-to-expiry 0DTE ≈ realized skewness — useful as control |

---

## 11. Ideas borrowed from public repos (with attribution)

1. **Free Cboe delayed JSON endpoint and OCC-symbol parsing** — Matteo-Ferrara/gex-tracker (`_{ticker}.json`, regex on the OCC symbol, strike = digits before last three) ([main.py](https://github.com/Matteo-Ferrara/gex-tracker/blob/main/main.py)). Use for research-time snapshots, not for the last 10 minutes.
2. **Spot-reprice profile with bracketing + bisection and a ±8% band; Gaussian-smoothed argmax for dense 0DTE ATM clusters** — FlashAlpha methodology ([methodology](https://flashalpha.com/methodology)); Darthreign/gex-dashboard (grid + nearest crossing) ([repo](https://github.com/Darthreign/gex-dashboard)). Fix: report all roots and the slope at spot.
3. **Spot-sensitivity table (GEX at 20 hypothetical spots)** — jensolson/SPX-Gamma-Exposure ([GEX.py](https://github.com/jensolson/SPX-Gamma-Exposure/blob/master/GEX.py)). Avoid its `np.interp` zero and its 0DTE exclusion.
4. **Unsigned (absolute) GEX view as an honesty device** — simonro/Edge-GEX-Lab ("The sign is an assumption") ([repo](https://github.com/simonro/Edge-GEX-Lab)). Also its OI-date inference from payload timestamps and its put-call-parity futures basis.
5. **Volume-weighted intraday flip ("HVL") and 0DTE GEX1–5 walls** — Darthreign/gex-dashboard. Compare OI-weighted vs volume-weighted levels as a cheap flow proxy.
6. **Weighting switch: OI / volume / max(OI, volume) / OI+volume; exposure surface over price×time with zero-flip lines** — EazyDuz1t/EzOptions-Schwab ([repo](https://github.com/EazyDuz1t/EzOptions-Schwab)).
7. **Quote-matched trade-side classification on Polygon flat files; "side-weighted GEX"; Gamma Concentration Index (HHI over strikes); Protective Gamma Ratio (share of gamma within ±$20 of spot); pre-registered hypothesis test with FDR control** — emlama/gex-backtesting ([repo](https://github.com/emlama/gex-backtesting)). The GCI is a good scalar for "how pinnable is today."
8. **"Effective OI = OI + 0.43 × side-classified volume" and flow-polarity signing since the open** — FlashAlpha methodology (factor unvalidated; treat the 0.43 as a parameter to re-fit on our own EOD OI residuals).
9. **0DTE magnet = argmax |GEX| over same-day strikes; pin only expected in positive gamma; ignore on non-expiry days** — FlashAlpha concepts ([zero-dte-magnet](https://flashalpha.com/concepts/zero-dte-magnet)). We adopt the definition for H1 and test it rather than assume it.
10. **Position models as a first-class axis (OI / raw volume / directionalized volume) and a replay/"wind tunnel" for scenario analysis; explicit "predictive_validity: unmeasured" disclosure** — zrack/gex-terminal ([repo](https://github.com/zrack/gex-terminal)).
11. **Black-76 for ES/NQ options with CME multipliers, BS for index** — zrack; FlashAlpha. Needed if we add ES options to the dealer book.
12. **k_std moneyness filter [−6, 3] and zero-volume-and-zero-bid drop** — not a repo but Almeida-Freire-Hizmeri; adopt in every GEX aggregation.
13. **Hourly snapshotting to Postgres with session replay and provider-separated backtests** — puneet-chandna/0DTE-dealer-gamma ([repo](https://github.com/puneet-chandna/0DTE-dealer-gamma)); gammagrid's strike×expiry heatmap with replay ([repo](https://github.com/gammagrid/gammagrid)). Store every 15:30–16:00 snapshot; that is the dataset §8 needs.
14. **Things not to borrow**: SPY×10 as SPX (puneet-chandna default); τ floor of one business day or 1/262 year for 0DTE (jensolson, pikki622); r=q=0 for anything beyond 0DTE; yfinance for SPXW on third Fridays (gammagrid); undisclosed MCP "accuracy" scores (zer0dte).

---

## 12. Open questions and what would change our mind

1. **Is Cboe's "balanced flow" true at the strike level in the last 30 minutes, or only in aggregate?** Cboe reports aggregate net gamma and one strike-level anecdote. If Open-Close 1-minute data show persistent same-sign customer net opening flow at the ATM strikes after 15:30 (e.g., retail buying lottery calls/puts into the close, consistent with Beckmeyer's "under an hour to expiration" finding), then the dealer sign at K* is identified and H1/H4 become sharp tests. If customer flow at the ATM strikes is balanced minute by minute, no OI- or volume-based level can carry information about the close and we should stop computing them for this purpose.
2. **Does the Baltussen sign-conditional momentum survive 2022–2026?** Their sample ends May 2020, before daily 0DTE. Adams et al. (expiry days) and Cboe (no last-hour gap increase) suggest dealers are net long gamma on expiry days, which under Baltussen's mechanism predicts *no* last-30-minute momentum on 0DTE days — a testable change in a well-known anomaly. Zarattini et al.'s strong 2007–2024 SPY results are for a different (noise-band breakout) signal and do not settle this.
3. **Which τ convention do market quotes imply?** If we invert IV from mids at 15:50 using 390×252 trading minutes vs calendar time, the implied σ differs by a large factor; only the straddle-implied `σ_rem` is convention-free. We should check whether vendor "0DTE IV" fields (Cboe JSON, Tradier) are stable across the last hour or blow up as τ→0 — if they blow up, every GEX number built on them in the last hour is an artifact.
4. **How large is the settlement gap, and is it priced?** If `|S_set − S_400|` is routinely a sizable fraction of `σ_rem(15:59)`, then the "last tick" is not the right conditioning variable for any closing-window model, and option prices at 15:59 should embed auction risk (H6). This is cheap to measure from existing index data and should be done first.
5. **Do dealers actually hedge 0DTE in ES, or net internally?** Cboe notes dealers "may also be hedging their 0DTE positions with other 0DTE options." If internalization dominates, then even correctly signed net gamma overstates the underlying flow. Adams et al.'s E-mini order-flow-reversal result is the one piece of evidence that some of it reaches the futures book.
6. **Would a published pinning result replicate out of sample?** Avellaneda-Lipkin's JDEC example (4 of 6 pins) and Ni-Pearson-Poteshman's single-stock clustering come from physically settled American options with floor market makers in 2001–2005. The mechanism's two ingredients (dealers long at a strike; price impact of their hedging in the underlying) are weaker for cash-settled SPX hedged in ES. A null result in §8 would be consistent with the mechanics, not a surprise.

## 13. Conventions and units glossary (use these in code and tables)

- **Γ (gamma)**: ∂Δ/∂S per index point, per contract, per 1 share-equivalent. Cboe's JSON gamma field is in these units; multiply by 100 for a contract.
- **GEX, per 1% ($)**: `sign × Γ × OI × 100 × S² × 0.01`. Equals dollars of underlying dealers must trade for a 1% spot move under the stated sign. Only meaningful when 1% ≪ the Gaussian validity band (`σ√τ`); not meaningful for 0DTE in the last hour — use "per 1σ_rem" instead.
- **GEX, shares (SqueezeMetrics original)**: `Γ × OI × (±100)`. Share-equivalent delta change per $1 move.
- **NGE (Baltussen)**: `Σ Γ × OI × (±100) × P_t / MV_t`, dimensionless (fraction of index market value per $1 move).
- **DEX**: `Δ × OI × 100 × S` ($, signed by Δ; vendor convention, not dealer sign).
- **VEX (vanna)**: `∂Δ/∂σ × OI × 100 × S`; divide by 100 for "per vol point." Some sites use "VEX" for vega exposure — check.
- **CHEX (charm)**: `∂Δ/∂t × OI × 100` per year by default; convert to per calendar day (÷365), per trading day (÷252), or per trading minute (÷(252×390)); for 0DTE use minutes.
- **τ**: time to expiry in years. Trading-time convention: `minutes_left / (390 × 252)`. Calendar convention: `days/365`. State which; never mix across the day.
- **σ_rem**: 1-standard-deviation remaining move in index points: `ATM straddle mid / 0.8` (model-free) or `S × σ_IV × √τ`.
- **k_std**: standardized log-moneyness `ln(K/S)/(σ_ATM √τ)`; filter to [−6, 3] (Almeida) before aggregating.
- **Flip / zero gamma**: a *root* of the repriced net-GEX profile `Net(S')`, reported with band, method (sticky-strike/sticky-delta), and all roots; not a cumulative-sum crossing.
- **Call wall / put wall**: argmax of call GEX over K ≥ S / argmax of |put GEX| over K ≤ S, with the expiry set stated; Gaussian smoothing for 0DTE clusters.
- **K\* (0DTE magnet)**: argmax of unsigned 0DTE GEX among strikes within ±1.5σ_rem of S.
- **Naive / inverted / unsigned / flow-signed**: the four positioning assumptions every exposure number must be tagged with.
- **S_400 vs S_set**: the 16:00:00 index print vs the official close used for SPXW settlement (component closing-auction prints).
- **Trade sign**: quote rule (above mid = buy, below mid = sell, at mid = unclassified); ~83% accurate for simple option trades, ~50% for complex index orders (Savickas-Wilson).

## Appendix A — Source access log (2026-11-06)

Opened and extracted (primary): SqueezeMetrics white paper PDF; Cboe 2023 and 2025 PDFs; Almeida-Freire-Hizmeri PDF; Baltussen et al. PDF; Gao et al. Dec 2015 WP PDF; Pearson-Poteshman-White 2006 WP PDF; Avellaneda-Lipkin 2003 PDF; Pagano-Peng-Schwartz CFS 2008/45 PDF; MenthorQ training deck PDF; Numerix 2026 white paper PDF; SpotGamma HIRO User Guide PDF; Cboe SPX specifications page; Cboe DataShop Open-Close page; arXiv 2603.29430 abstract; Wikipedia Greeks; FlashAlpha methodology, gamma-flip and zero-dte-magnet pages; MenthorQ guide page; SpotGamma 2022-09-06 and 2025-05-13 posts; Markets Media 2023-08-31; Investing.com 2024-05-01; Quantpedia 2026-02-02; Harbourfront (two posts); CXO (two, paywalled bodies); WealthManagement 2023-05-23; HKUST BizInsight 2026-04-18; Princeton thesis record; Concretum (Zarattini et al.) page; Hull Tactical 2026-07-08; Neudata; EconPapers/IDEAS/KOPS records; Cambridge JFQA abstract; GitHub READMEs and two source files (jensolson GEX.py, gex-tracker main.py) plus issue lists.

Blocked / not opened: all SSRN abstract pages (403 via WebFetch and curl); SpotGamma support articles (Cloudflare); Perfiliev page (503/TLS); Medium summary (403); MDPI Risks 12(11):180 (403); Bloomberg article (403) and BNN article (redirected to index); Golez-Jackwerth WP PDF (tokenized URL); Cboe "A Fresh Look at Short-Dated Options and 0DTE SPX" white paper (form-gated); sslip.io "methodology" (502); tomevault Vilkov page (503). Web search budget was exhausted after ~45 queries; remaining gaps (Brogaard-Han-Won paper text; Golez-Jackwerth sample; Vilkov entry-time tables; Barardehi) would need a follow-up session.

## Appendix B — Quick reference of numbers to reuse

- 0DTE share of SPX volume: 5% (2016) → 43% (H1 2023) → ~50% (Aug 2023) → >50%, ADV 1.98M, >$1T notional (Q1 2025) → ~60% (2025). [Cboe 2023/2025; Chong 2026]
- Cboe 0DTE net MM gamma: $170mm–$670mm typical (0.04–0.17% of ES daily notional); 3:30 pm median +$173mm, IQR −$1.1bn/+$2.4bn; stress-day max ~0.2% of ES notional. [Cboe]
- Retail: ~50–60% of SPX 0DTE (Cboe est.); ~12% of retail opening trades in last 30 min; 52% of retail opening trades max loss <$2k; 95% capped-risk; 4% naked short. [Cboe 2025]
- Retail P&L: longs −53% (−61% post-2022), shorts +48% after fees; ~60% of losses are transaction costs; effective spreads 6.1% calls / 4.9% puts. [Beckmeyer et al. via Swedroe]
- 0DTE VRP: annualized 1.54%–2.95% by time of day; up to 4× longer horizons; delta-hedged losses strongest 12:00–14:00. [Almeida et al.]
- Gamma → vol: −60 ann. bps on 0DTE days pre-2022; net gamma ↑ ⇒ next-10-min vol ↓, fades ~1h. [Adams et al. via Quantpedia]
- Intraday momentum: SPY 1993–2013 first→last half-hour R² 1.6%; S&P futures 1996–2020 last-30-min β on rest-of-day 6.63 (t 4.78) when NGE<0 vs 0.82 (t 1.03) when NGE≥0. [Gao et al.; Baltussen et al.]
- Single-stock hedging impact: 1 SD net-gamma shock ↔ 37 bps of a 310 bps average daily absolute return (~12%). [PPW 2006]
- Futures pinning: ≥$115M notional shift per expiration day; anti-cross-pinning before SPX expiry. [Golez-Jackwerth]
- Trade-sign accuracy for options: quote rule 83%, Lee-Ready 80%, EMO 77%, tick 59%; complex index trades ~50%. [Savickas-Wilson 2003]
- Closing concentration: ~1/3 of S&P 500 stock trades in the last 10 minutes (2024), up from 27% (2021). [BestEx via Reuters]
- SPXW: settles on component closing sales prices; trading ceases 3:00 pm CT on expiry; European; strikes at $5 increments near the money. [Cboe spec]

## Appendix C — Evidence cards (one per source; for quick lookup)

Format: **Source** | Class | Sample & data | Method | Effect sizes reported | What it does NOT establish | Access status on 2026-11-06.

1. **SqueezeMetrics, GEX white paper (2016/2017)** | C | SPX options, dates unstated | OI-weighted BS gamma, calls +/puts − | Top vs 2nd GEX quartile ⇒ next-day SD 0.55% vs 0.85% | No standard errors; no dates; sign assumption asserted | Full PDF read.
2. **Baltussen-Da-Lammers-Martens, JFE 2021** | B | 60+ futures 1974–2020; S&P 500 NGE 1996–2020 (OptionMetrics + SqueezeMetrics) | OLS of last-30-min return on rest-of-day return; sign-conditioning on NGE | β 6.63 (t 4.78), R² 3.58% when NGE<0; 0.82 (t 1.03) when NGE≥0; pooled OOS R² 2.88% (equity futures) | Not 0DTE era; NGE positive most days; OTC positions missed | Full PDF read.
3. **Gao-Han-Li-Zhou, JFE 2018** | B | SPY 1993–2013 | OLS first→last half-hour | R² 1.6% (slope 6.94 ×100); with 12th half-hour 2.6%; OOS 1.2–1.8%; Sharpe 1.08 (WP) | Pre-0DTE; no options data | Dec 2015 WP PDF read; JFE abstract page.
4. **Zarattini-Aziz-Barbon, SFI WP 24-97 (2024/25)** | B (unrefereed) | SPY 2007–early 2024 | vol-scaled noise-band breakout, trailing stops, flat at close | 1,985% total, 19.6% ann., Sharpe 1.33 net of stated costs | Not the pure last-half-hour signal; gamma-imbalance link unreported publicly | Author page + SFI listing read; paper not opened.
5. **Cboe, "Much Ado About 0DTEs" (2023-09-07)** | B (exchange, interested party) | SPX 0DTE 2022–23; 30-min net MM gamma; SPX 1-min returns 2013–23 | Origin-code net positions; box plots; 2σ 1-min gap counts | Net gamma $170mm–$670mm (0.04–0.17% ES notional); 3:30 pm median +$173mm, IQR −$1.1/+$2.4bn; 2023-08-15: 52k buy vs 55k sell on 4440P; no gap-frequency uptick incl. last hour | Aggregate only; one strike-level anecdote; no settlement analysis | Full PDF read (SpotGamma mirror).
6. **Cboe, "0DTEs Decoded" (2025-05-02)** | B (exchange) | SPX 0DTE Q1 2020–Q1 2025 | Origin/size/risk heuristics for retail; intraday opening/closing profiles | ADV 1.98M; >50% share; retail 50–60%; 18% of institutional opening in first 30 min; ~12% of retail opening in first and last 30 min; 95% capped risk; stress-day net gamma ≤0.2% of ES | Retail identification is heuristic; no last-10-min stats | Full PDF read.
7. **Cboe/Zaionz, "The Rise of SPX & 0DTE Options" (2023)** | B via Markets Media | H1 2023 | descriptive | 43% share; Fed-day ATM premium flat until ~2 pm then decays; volume surges after 2 pm | Secondary quotes only | Markets Media article read; paper not opened.
8. **Beckmeyer-Branger-Gayda, SSRN 4404704 (2023)** | B via secondary | Cboe SPX trades with trader-type codes; 0DTE Jan 2021–Feb 2023 | descriptive P&L by trader type | Retail >6% of 0DTE; longs −53% (−61% post-5/2022); shorts +48% after fees; ~60% of losses = transaction costs; ~60% from puts; $184k→$358k/day loss | Aggregate figures differ across summaries ($70M vs $125M) | SSRN 403; Swedroe/CXO/Neudata read.
9. **Dim-Eraker-Vilkov, SSRN 4692190 (2024)** | B via abstract | SPX 0DTE; period not visible | OI gamma vs intraday/overnight RV; volume-shock VARs | Higher 0DTE OI gamma ↔ lower intraday RV; no overnight propagation; volume-shock response 0.1 SD of |return|; largest VRP | Coefficients not visible to me | SSRN 403; Harbourfront + Oxford abstract read.
10. **Adams et al., SSRN 5641974 (Oct 2025)** | B via Quantpedia | SPX, E-mini order flow, pre/post May 2022 | NPPW hedging-needs measure; Tu/Th identification; 2SLS; intraday regressions | −60 ann. bps vol on 0DTE days; +0.15pp hedging needs; multiplier −4 ⇒ −4 bps RV; pre-existing positions +24 bps, new 0DTE +3 bps; net gamma ⇒ lower next-10-min vol, order-flow reversal, negative HF momentum (fade ~1h) | Author list, sample dates not visible | SSRN 403; Quantpedia read.
11. **Brogaard-Han-Won (Utah), 2023** | C (press) | SPX 5-min vol, ~decade | volume→vol regressions | +~14% daily vol per 1 SD 0DTE volume | Unverified; possibly endogenous | Not opened.
12. **Bandi-Fusari-Renò, SSRN 4503344 (2023)** | B via records | intraday SPX options 2014-01-02→2023-05-11 | pricing model; instantaneous risk premia | "suggestive" near-instantaneous predictability via leverage and vol-of-vol | No numbers visible | SSRN 403; EconBiz/JHU records read.
13. **Bandi-Fusari-Gazzani-Renò, arXiv 2603.29430 (2026)** | B (preprint) | ultra-short tenors <1 week | Edgeworth++ jump-diffusion + deterministic shift | documents ATM IV term-structure oscillations across ultra-short tenors | Not about hedging flows | arXiv abstract read.
14. **Almeida-Freire-Hizmeri, "0DTE Asset Pricing" (May 2025)** | B | Cboe 1-min SPX options 2012-01-06→2025-03-18; 1,815 expiry days | hold-to-expiry returns by k_std; VRP decomposition; SSD bounds | Negative call/put returns, OTM calls worst; delta-hedged ATM losses largest 12:00–14:00; ann. 0DTE VRP 1.54–2.95%, up to 4× longer; intraday equity premium ~15% ann.; SSD-violation Sharpe 0.1–0.2 pre-2022, gone after | No pinning/gamma analysis; 10:00–14:00 only | Full PDF read.
15. **Vilkov, "0DTE Trading Rules" (2023; 2026 rev.)** | B via secondary | SPX 0DTE Sep 2016–May 2023/Jan 2024; 30-min data | static rules, entries 10:00/13:00/15:00, hold to 16:00 | "seldom paid off gross of costs"; medians negative; averages mostly insignificant; P&L ≈ realized skewness | Entry-time tables not visible | SSRN 403; CXO/Hull Tactical read.
16. **Chong (HKUST), "Are 0DTE Options Mispriced?" (2026)** | B via institution page | SPX 0DTE 2020–2024 | vol-arbitrage strategies with costs and estimation risk | Sharpe "economically insignificant" after costs; "expensive but not mispriced" | No numbers on page | SSRN 403; HKUST page read.
17. **Dalvi-LaFond (2026 WP)** | B via secondary | SPY/QQQ/IWM Cboe trade-level 2012–2025 | OLS/IV around daily-expiry introduction | maturity substitution; more directional trading; more MM intermediation; higher 30-day vol expectations | SPX not covered | Harbourfront read.
18. **Shi, Princeton thesis (2026)** | B (unrefereed) | SPX intraday variance | price-impact variance mapping; QLIKE | gamma-hedging channel adds little; other exposures stronger | Restricted text | Record page read.
19. **Ni-Pearson-Poteshman, JFE 2005** | B | optionable US stocks, expiration dates | clustering tests | prices cluster at strikes; "≥16.5 bps" per expiration (2004 draft, unverified) | Single stocks; physical settlement | Abstract/records only.
20. **Avellaneda-Lipkin, QF 2003** | B/theory | model + JDEC 2001 case | SDE with singular drift ∝ OI × ∂Δ/∂t × price elasticity | finite pinning probability as f(σ, τ, OI, E); JDEC pinned 4 of 6 | Requires dealers long; impact constant unobservable | Full PDF read.
21. **Jeannin-Iori-Samuel, QF 2008** | B/theory | model/simulation | Frey-Stremme framework; double auction | drift + volatility-suppression terms | No index evidence | Abstract read.
22. **Golez-Jackwerth, JFE 2012** | B | S&P 500 futures around futures-option and index-option expiries (period not visible) | event-time tests | pinning on futures-option expiries; anti-cross-pinning before SPX expiry; ≥$115M notional shift/day; asymmetric, stronger above strike | Monthly AM-settled era; no 0DTE | Abstract read; WP PDF not retrievable.
23. **Pearson-Poteshman-White 2006 WP / NPPW RFS 2021** | B | optionable stocks; Cboe open-close positions | net gamma of likely hedgers vs |return| | 1 SD net-gamma shock ↔ 37 bps of 310 bps avg daily |return| (~12%) | Single stocks | WP PDF read; RFS record.
24. **Savickas-Wilson, JFQA 2003** | B | CBOE proprietary signed trades | rule accuracy | quote 83%, LR 80%, EMO 77%, tick 59%; complex index trades ~50% misclassified | Pre-electronic era | Abstract read.
25. **Pagano-Peng-Schwartz, CFS 2008/45** | B | Nasdaq stocks around 2004 call-auction introduction; ≤1-min intervals | intraday vol by minute | vol concentrated in first 2 min and last 1 min ("staple" not U) | Equities, not index | Full PDF read.
26. **Bogousslavsky-Muravyev, JFM 2023** | B via abstract | US stocks closing auctions | who trades; reversal | deviations reverse overnight; 1/3–1/2 within 30 min after close for liquid names | Not index-level | Not opened.
27. **BestEx Research via Reuters (2024-05-01)** | C (press) | S&P 500 stocks | share of trades by time | ~1/3 of trades in last 10 min (27% in 2021) | Trades, not shares | Article read.
28. **Numerix white paper (2026-01)** | C | — | exposition | ATM δ 0.50→0.95/0.05 on 1% move with 2h left; desks flatten before 15:45 | Vendor | Full PDF read.
29. **SpotGamma HIRO guide (2025-12-10); 2025-05-13 post** | C | — | — | "$20mm per strike … 98th percentile"; pin "comes undone," +20 pts in last 15 min | Proprietary; anecdote | Read.
30. **MenthorQ training deck (2023/2025)** | C | SPX 2019-11-01→2023-08-30 (1D band only) | — | 87.62%/85.02% band "success" | "success" undefined | Read.
31. **FlashAlpha methodology/concepts** | C | — | formulas; reprice-bisection flip; 0.43 effective-OI factor | none validated | Vendor | Read.

## Appendix D — Remaining-move and Greeks scaling through the session (trading-time convention)

Flat-variance baseline: fraction of the day's 1σ move still ahead = √(m/390), where m = minutes to 16:00; ATM 0DTE straddle value scales the same way; ATM gamma scales as 1/√m (shown relative to 10:00); ATM per-minute theta as a fraction of remaining ATM value ≈ 1/(2m).

| Clock (ET) | m | √(m/390) | Γ_ATM / Γ_ATM(10:00) | θ per minute (% of value) |
|---|---|---|---|---|
| 09:30 | 390 | 1.000 | 0.96 | 0.13% |
| 10:00 | 360 | 0.961 | 1.00 | 0.14% |
| 11:00 | 300 | 0.877 | 1.10 | 0.17% |
| 12:00 | 240 | 0.784 | 1.22 | 0.21% |
| 13:00 | 180 | 0.679 | 1.41 | 0.28% |
| 14:00 | 120 | 0.555 | 1.73 | 0.42% |
| 15:00 | 60 | 0.392 | 2.45 | 0.83% |
| 15:30 | 30 | 0.277 | 3.46 | 1.67% |
| 15:45 | 15 | 0.196 | 4.90 | 3.3% |
| 15:50 | 10 | 0.160 | 6.00 | 5.0% |
| 15:55 | 5 | 0.113 | 8.49 | 10% |
| 15:58 | 2 | 0.072 | 13.4 | 25% |
| 15:59 | 1 | 0.051 | 19.0 | 50% |

Caveats: (i) real intraday variance is U/staple-shaped, so the true remaining fraction at 15:50 is *higher* than 0.160 — the last 10 minutes carry more than 2.6% of daily variance; use the empirical `V(t)` curve from §6.1; (ii) the Γ column is the Black-Scholes value at exactly ATM; at 15:59 a strike 5 points away is ~1σ_rem out and its gamma is 61% of ATM, a strike 10 points away (~2σ) is 14%; (iii) these are the numbers that make "GEX per 1%" meaningless in the last half-hour and that make the Avellaneda-Lipkin charm force (∝ ∂Δ/∂t, which also grows like 1/m) the operative quantity.

## Appendix E — Follow-ups blocked on 2026-11-06 (search budget exhausted; SSRN blocked)

Ordered by expected value to the platform:

1. **Brogaard-Han-Won (Utah) paper text** — need the exact specification (5-min RV on 0DTE volume), sample, and whether the +14% is contemporaneous or predictive; it is the only published-style result contradicting Cboe/DEV/Adams. Try Brogaard's faculty page or Google Scholar PDF.
2. **Vilkov "0DTE Trading Rules" tables** — the 10:00/13:00/15:00 entry comparisons bear directly on when the 0DTE premium is earned; the 2026 revision ("Tail Risk, Implementation, and Tactical Timing") reportedly has a replication package.
3. **Golez-Jackwerth full text** — sample period, pinning probabilities by distance to strike, and the construction of the "cost-of-carry adjusted ATM strike" (our H1 should use the same adjustment for ES).
4. **Beckmeyer-Branger-Gayda full text** — intraday timing of retail 0DTE trades (they mention trading "under an hour to expiration"); whether retail net buying concentrates at ATM strikes into the close would identify the dealer sign at K\*.
5. **Dim-Eraker-Vilkov full text** — coefficients and sample; whether their "OI gamma" is naive-signed or unsigned.
6. **Adams et al. full text** — author list, dates, and the exact 10-minute regression (we want to replicate it on the 15:50 window).
7. **Perfiliev's page** — only to confirm that his zero-gamma method is the ±grid reprice with chain IV (as the repos implementing it suggest), since many repos cite it as canonical.
8. **SpotGamma support articles** — "Gamma Flip," "Put Wall," and the Vol Trigger article (15297391724179) — to pin down whether "net call gamma" is OI-weighted and which expiries are included.
9. **Cboe "A Fresh Look at Short-Dated Options and 0DTE SPX" (Schwartz, 2025-04-01)** — form-gated PDF; may contain volume-by-time-of-day exhibits beyond the 2025 retail/institutional profiles.
10. **MDPI Risks 12(11):180 (2024)** — to check whether the last-half-hour predictability claim for 2022–2024 is in-sample only.
11. **Barbon & Buraschi (2020), "Gamma fragility"** — cited by Baltussen as showing gamma hedging drives intraday momentum/reversal; not retrieved here.
12. **Any "Barardehi" 0DTE paper** — not found in any search; confirm with the requester whether a different author was meant.
