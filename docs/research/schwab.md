# Schwab Trader API ("Trader API - Individual") — research memo for a Cloudflare Worker SPX/SPY options tool

Date of research: 2026-11-06. All sources were accessed on 2026-11-06 unless noted.
Audience: engineer building a private SPX/SPY options decision tool as a Cloudflare Worker (JavaScript `fetch`), no order placement.

Current state of the user's app (given, not independently verified): only the **Market Data Production** API product is enabled (not "Accounts and Trading Production"); status **Ready For Use**; callback URL `https://127.0.0.1:8182`; order limit 120.

## 0. How to read this memo, and what could not be read

- Tags used below: **VERIFIED** = read directly in a cited source; **INFERRED** = a conclusion I drew from cited evidence; **UNVERIFIED** = asserted by one weak/indirect source or not found at all.
- The official developer portal (`developer.schwab.com`) is an Angular single-page app. `curl` returns a 55 KB JS shell whose only visible text is "Charles Schwab | Developer Portal"; `/terms-of-use`, `/products/trader-api--individual` and the product documentation routes all return the same shell; the JS bundle contains no server-side content API I could call anonymously. WebFetch returns HTTP 403 for those routes. **The portal's official API reference, product descriptions and Terms of Use are therefore behind the login wall for this memo** ([developer.schwab.com](https://developer.schwab.com/) probed with curl, accessed 2026-11-06). Where I say "official documentation says", it is as relayed by a third party.
- `https://api.schwabapi.com/v1/oauth/authorize?...` and `https://api.schwabapi.com/marketdata/v1/quotes?symbols=SPY` both answer `401 application/json` to anonymous requests, which at least confirms the hosts and paths are live ([api.schwabapi.com](https://api.schwabapi.com/marketdata/v1/quotes?symbols=SPY) probed with curl, accessed 2026-11-06).
- Reddit: direct reddit.com pages were not reachable from this environment (search engine results surfaced mirrored snapshots instead); I used two mirrored threads (r/algotrading, r/options) plus search-engine summaries of others, and I ran out of web-search budget before a reddit.com-restricted query could run. Community evidence is therefore weighted toward GitHub issues, Wealth-Lab forum, Elite Trader, and the two Python libraries' docs.
- Primary secondary sources: schwab-py docs and source ([schwab-py.readthedocs.io](https://schwab-py.readthedocs.io/en/latest/auth.html), [alexgolec/schwab-py](https://github.com/alexgolec/schwab-py)), Schwabdev docs and source ([tylerebowers/Schwabdev](https://github.com/tylerebowers/Schwabdev)), and real-response fixtures captured by the Rust `schwab_api` crate ([docs.rs schwab_api fixtures](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/)).

### Executive summary (what matters most for this build)

1. OAuth is a plain authorization-code flow: authorize at `https://api.schwabapi.com/v1/oauth/authorize`, exchange at `https://api.schwabapi.com/v1/oauth/token` with HTTP Basic `base64(app_key:app_secret)`; access token 30 min, refresh token 7 days, and the 7-day limit cannot be extended programmatically; a human must log in again weekly. VERIFIED (sections 1.1, 1.4).
2. Non-localhost HTTPS callback URLs are accepted by Schwab (Wealth-Lab registers `https://schwab.wealth-lab.com`, Nango registers `https://api.nango.dev/oauth/callback`), so a `https://<worker>.workers.dev/callback` URL is plausible; but changing the callback URL (and probably adding an API product) puts the app back into review for "a few days". VERIFIED for the examples; INFERRED for workers.dev (section 1.5, 1.6).
3. With only **Market Data Production** enabled, you can call `/marketdata/v1/*` (quotes, chains, expirationchain, pricehistory, markets, movers, instruments). Streaming requires `GET /trader/v1/userPreference` (the `streamerInfo` block), which lives under the Trader ("Accounts and Trading") product; a 401 "Client not authorized" is the documented symptom of calling an API your app does not have. VERIFIED by path + community reports; the official product-to-endpoint table is behind login (sections 4.1, 7).
4. Rate limit: 120 non-order requests per minute per app (HTTP 429). A full `$SPX` chain without filters is large enough to overflow a Python HTTP client's buffer — always pass `strikeCount`/`fromDate`/`toDate`. VERIFIED via multiple secondary sources (section 3).
5. Live `/chains` contracts use `bid`, `ask`, `last`, `mark`, `inTheMoney` (not the `bidPrice`/`isInTheMoney` names in Schwab's OpenAPI template); keys are `"YYYY-MM-DD:<daysToExpiration>"` and strike strings like `"569.0"`; option symbols are `ROOT` padded to 6 chars + `yymmdd` + `C|P` + 8-digit strike×1000, e.g. `SPXW  261106C06900000`. VERIFIED (section 2.4, 2.5).
6. A Durable Object can hold an outbound WebSocket to Schwab's streamer, but Cloudflare only guarantees that an outbound connection keeps the DO alive for 15 minutes per connection; design for periodic reconnects (section 4.5). VERIFIED from Cloudflare docs; the reconnect design is INFERRED.

---

## 1. OAuth 2.0 flow in detail

### 1.1 Endpoints and wire format (VERIFIED)

- Authorize URL: `https://api.schwabapi.com/v1/oauth/authorize` with query `client_id=<app key>` and `redirect_uri=<callback URL>`; also `response_type=code` per standard OAuth (schwab-py builds it through authlib's `create_authorization_url`, which adds `response_type=code` and `state`). [schwab-py auth.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/auth.py) (accessed 2026-11-06); [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) (accessed 2026-11-06) builds it by string formatting with `client_id` and `redirect_uri` only.
- Token endpoint, verbatim constant in schwab-py: `TOKEN_ENDPOINT = 'https://api.schwabapi.com/v1/oauth/token'` [schwab-py auth.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/auth.py) (accessed 2026-11-06). Schwabdev uses the same URL [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) (accessed 2026-11-06).
- Client authentication on the token request: `Authorization: Basic base64(app_key:app_secret)`, `Content-Type: application/x-www-form-urlencoded`. Authorization-code grant body: `grant_type=authorization_code&code=...&redirect_uri=<callback URL>`. Refresh grant body: `grant_type=refresh_token&refresh_token=...`. [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) (accessed 2026-11-06). schwab-py passes `auth=(api_key, app_secret)` to authlib's `fetch_token`, i.e. the same HTTP Basic scheme [schwab-py auth.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/auth.py) (accessed 2026-11-06).
- Token response: `access_token`, `refresh_token`, `token_type: "Bearer"`, `expires_in: 1800` are shown in an unofficial Rust client's recorded fixture; `scope` and `id_token` were not confirmed by any source I could read. [schwab (Rust) token_response.json](https://docs.rs/crate/schwab/latest/source/tests/fixtures/token_response.json) (search-engine snippet; accessed 2026-11-06). Schwabdev defaults `expires_in` to 1800 when absent [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) (accessed 2026-11-06). UNVERIFIED: presence of `id_token`/`scope: "api"`.
- Bearer usage: every REST call sends `Authorization: Bearer <access_token>` (standard; both libraries do this). INFERRED from library behaviour; not a Schwab document.

Minimal Worker-side exchange (shape follows the sources above):

```js
const basic = btoa(`${APP_KEY}:${APP_SECRET}`);
const r = await fetch('https://api.schwabapi.com/v1/oauth/token', {
  method: 'POST',
  headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
});
// refresh: body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token })
```

### 1.2 What the user sees (VERIFIED)

- The user is sent to a Schwab login page; after login they "agree to the terms, and select account(s)" and are redirected to the callback URL. [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html) (accessed 2026-11-06).
- The Schwabdev maintainer's explanation of why re-login is mandatory: "Schwab does this because they want to make sure that you, yourself, agree to the terms each time you reauth." [Schwabdev issue #66](https://github.com/tylerebowers/Schwabdev/issues/66) (tylerebowers, 2025-09-22; accessed 2026-11-06).

### 1.3 The redirect, the `code` parameter and URL decoding

- The redirect lands on `<callback>?code=...` plus additional parameters. Schwabdev extracts `code` by parsing the pasted full URL with `urllib.parse.parse_qs`, which percent-decodes the value; if the user pastes a bare code it runs `unquote` on it. It has no special handling for `%40`/`@`. [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) (accessed 2026-11-06). VERIFIED.
- The presence of a `session=` parameter after `code=` is consistent with a CLI that trims the pasted URL at the first `&` after the code (`rest.split('&').next()`), but I did not find a source that names the parameter. [schwab-api-cli auth.rs](https://docs.rs/crate/schwab-api-cli/latest/source/src/commands/auth.rs) (search snippet; accessed 2026-11-06). UNVERIFIED: the exact name `session`.
- Trailing character of the code: one community write-up says Schwab percent-encodes trailing padding (`%3D%3D`, i.e. `==`) and that copying only the code value, not the full URL, truncates/mangles it; it recommends parsing the full redirect URL with a standard query parser [civic-orbit write-up](https://civic-orbit-rnn6.here.now/implementation_issues_and_solutions.txt) (search snippet; accessed 2026-11-06). The user's note that the code ends in `@` (encoded `%40`) is **not contradicted** by any source but I could not verify it. UNVERIFIED either way. The operative rule is the same: decode once with a query parser (`new URL(pasted).searchParams.get('code')` in JS) and never hand-strip characters.
- Authorization codes expire fast: Schwabdev's error text tells users to paste the URL "within 30 seconds"; the schwab-api-cli notes codes "expire in ~30 seconds after redirect". [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) (accessed 2026-11-06); [schwab-api-cli auth.rs](https://docs.rs/crate/schwab-api-cli/latest/source/src/commands/auth.rs) (search snippet; accessed 2026-11-06). VERIFIED (two independent libraries).

### 1.4 Token lifetimes, refresh, and the 7-day re-login (VERIFIED)

- Access token: 1800 s (30 min). Schwabdev constants attribute both lifetimes to Schwab: access 1800 s, refresh 604800 s (7 days). [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) (accessed 2026-11-06). schwab-py: "the access token is only valid for thirty minutes at a time." [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06).
- Refresh token: 7 days, not renewable without a fresh browser login. schwab-py: requests using a refresh token "older than seven days are rejected" with `invalid_client`, and this "cannot be extended" [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06). schwab-py TDA transition page: "tokens are valid for only seven days, after which they must be deleted and regenerated using the login flow" (TDA was 90 days) [schwab-py tda-transition](https://schwab-py.readthedocs.io/en/latest/tda-transition.html) (accessed 2026-11-06). Lumibot: "Access token ≈ 30 min; refresh token ≈ 7 days", refresh tokens "expire seven days after creation", a service stopped for 7+ days needs a new login [Lumibot Schwab docs](https://lumibot.lumiwealth.com/brokers.schwab.html) (accessed 2026-11-06). TradersPost, citing Schwab's archived documentation: the refresh token "expires after seven days" and a manual sign-in is then required [TradersPost](https://blog.traderspost.io/article/thinkorswim-api) (accessed 2026-11-06). Wealth-Lab (MedvedTrader, 2024-10-03): Schwab's API "does require the key renewal every 7 days" [Wealth-Lab 11565](https://wealth-lab.com/Discussion/Schwab-broker-extension-Beta-release-11565) (accessed 2026-11-06).
- Conflicting claim: an Elixir package's docs say the refresh token is single-use and each refresh "returns a new one carrying a fresh seven days" [dp_exchange_schwab usage rules](https://repo.hex.pm/preview/dp_exchange_schwab/0.1.5/usage-rules.md) (search snippet; accessed 2026-11-06). This contradicts schwab-py, Schwabdev, Lumibot, TradersPost and Wealth-Lab, all of which treat 7 days as an absolute lifetime from login. Treat the rolling-renewal claim as UNVERIFIED; design for an absolute 7-day limit and log whether the refresh response carries a new `refresh_token`.
- Refresh strategy used by libraries: Schwabdev refreshes the access token when < 61 s remain and forces a full re-auth when < 3630 s remain on the refresh token; schwab-py's `easy_client` proactively discards tokens older than 6.5 days (`max_token_age = 561600`). [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py); [schwab-py auth.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/auth.py) (both accessed 2026-11-06).
- Only one valid refresh token per app/account at a time: "There can only be one valid refresh token at a time"; a new sign-in invalidates earlier refresh tokens, which surfaces as `400 unsupported_token_type` / `refresh_token_authentication_error` on refresh. [Schwabdev issue #40](https://github.com/tylerebowers/Schwabdev/issues/40) (tylerebowers, 2024-12-05; accessed 2026-11-06). Schwabdev troubleshooting: `unsupported_token_type` means "Your refresh token is invalid (maybe you created a new refresh token on a different machine)". [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06).
- Automating the weekly browser login (Selenium etc.): "It is possible, but people have been banned for doing so (allegedly)." [Schwabdev issue #66](https://github.com/tylerebowers/Schwabdev/issues/66) (tylerebowers, 2025-09-22; accessed 2026-11-06). Treat as a policy risk.
- Schwab occasionally invalidates access tokens on backend changes: "sometimes Schwab invalidates tokens when they make backend changes" → force an access-token refresh. [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06).
- A dead refresh token is expected to fail with `invalid_grant` (HTTP 400) per a schwab-py contributor (expectation, not a Schwab document). [schwab-py issue #222](https://github.com/alexgolec/schwab-py/issues/222) (tyedyediggy, 2026-07-21; accessed 2026-11-06). UNVERIFIED exact error string.

### 1.5 Callback URL rules

- Must be HTTPS: schwab-py: "Schwab requires `https:` callback URLs" [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06); Schwabdev setup guide: "Callback URLs must be https and localhost addresses" [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html) (accessed 2026-11-06); Lumibot: "must be HTTPS, ≤ 256 chars, matches exactly" [Lumibot](https://lumibot.lumiwealth.com/brokers.schwab.html) (accessed 2026-11-06). VERIFIED (three sources).
- Loopback must be `127.0.0.1`, not `localhost`: "localhost cannot be used as a callback URL ... you must enter `127.0.0.1` instead." [schwab-py tda-transition](https://schwab-py.readthedocs.io/en/latest/tda-transition.html) (accessed 2026-11-06). Recommended `https://127.0.0.1:8182`, no trailing slash, port > 1024 (no port = 443 which the OS refuses). [schwab-py getting started](https://schwab-py.readthedocs.io/en/latest/getting-started.html); [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06). VERIFIED.
- Exact match, case and slashes: "must *exactly* match" [schwab-py auth.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/auth.py); an "Access Denied" page after sign-in "is likely incorrect due to a trailing slash" [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md); the portal lower-cases `HTTPS://` on save [Schwabdev issue #53](https://github.com/tylerebowers/Schwabdev/issues/53) (jrosebr1, 2025-06-29) (all accessed 2026-11-06). VERIFIED.
- Multiple callback URLs: "Separate multiple callbacks with commas." [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html) (accessed 2026-11-06). VERIFIED (one source).
- **Non-localhost callback URLs are allowed.** Wealth-Lab's Individual-app instructions: "A secure url is required and must be precisely: https://schwab.wealth-lab.com" [Wealth-Lab Schwab extension](https://wealth-lab.com/extension/detail/Schwab) (accessed 2026-11-06). Nango's registration guide sets the callback to `https://api.nango.dev/oauth/callback` [Nango Schwab guide](https://nango.dev/docs/api-integrations/schwab/how-to-register-your-own-schwab-oauth-app) (accessed 2026-11-06). schwab-py: "Advanced users may be able to use a non-local callback URL" [schwab-py getting-started.rst](https://schwab-py.readthedocs.io/en/latest/_sources/getting-started.rst.txt) (accessed 2026-11-06). An Elite Trader admin's view that "the redirect would need to be a publicly accessible URL" is opinion [Elite Trader thread](https://elitetrader.com/et/threads/question-about-schwab-api-redirect-uri-setup.385957) (Baron, 2025-08-12; accessed 2026-11-06). VERIFIED for custom HTTPS domains in general; INFERRED that `https://<name>.workers.dev/callback` is accepted (no source tested a workers.dev host; one forum report of a non-local URL rejected as "not a valid URL" exists only as a search snippet and is UNVERIFIED).
- Security note from schwab-py: whoever receives the callback request can take the token and act as you; a Worker callback endpoint must therefore be protected (one-shot `state`, allowlisted viewer) [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06).

### 1.6 App status, approval time, and what triggers re-review

- Statuses: a new app shows "Approved - Pending", which "is a confusingly named status meaning Schwab is manually approving it"; nothing works until "Ready For Use". Symptoms while pending: 401 in sign-in, "Session rejected", "Access Denied". [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06). Schwabdev: HTTP 500 "We are unable to complete your request..." / Whitelabel Error Page while "Approved - Pending" [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06). VERIFIED.
- How long: "can take up to a few days" [schwab-py getting started](https://schwab-py.readthedocs.io/en/latest/getting-started.html); "can take a couple days" [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html); "typically 1–3 business days" [Lumibot](https://lumibot.lumiwealth.com/brokers.schwab.html); one documented case took ~5 days (Aug 18 → Aug 23) with the dashboard status lagging behind the "View Details" page [Wealth-Lab 11565](https://wealth-lab.com/Discussion/Schwab-broker-extension-Beta-release-11565) (paul1986, Aug 19–23); a relayed claim of "up to a month" was not confirmed in that thread (all accessed 2026-11-06). VERIFIED range: 1 day to ~1 week typical.
- Changing the callback URL: schwab-py code comment: "Note making this change will likely require app re-approval from Schwab, which typically takes a few days." [schwab-py auth.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/auth.py) (accessed 2026-11-06); schwab-py docs: "Changing the callback URL requires app re-approval" and "a new or modified app enters Approved - Pending" [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06). VERIFIED (same project, two places).
- Adding an API product later: the portal path is Apps Dashboard > View Details > Modify App > APIs [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html) (accessed 2026-11-06). In one case a user who "only had Market Data Production" added "Accounts and Trading Production" through Modify App on 2025-06-29/30 and reported "That did the trick" the next day [Schwabdev issue #53](https://github.com/tylerebowers/Schwabdev/issues/53) (jrosebr1/tylerebowers, 2025-06-30; accessed 2026-11-06). Whether that modification passed through a visible "Approved - Pending" period is not stated. INFERRED: adding a product is a modification and may re-enter review; the one data point suggests it can clear within about a day.
- Two-step onboarding (developer account review, then product access request review) precedes app creation [TradersPost](https://blog.traderspost.io/article/thinkorswim-api) (accessed 2026-11-06). The user is past this.
- Schwab was intermittently refusing to create apps with `127.0.0.1` callback URLs as of 2024-07-21 [schwab-py getting started](https://schwab-py.readthedocs.io/en/latest/getting-started.html) (accessed 2026-11-06). Historical; the user's app already has that URL.
- A Wealth-Lab user relayed Schwab's statement that "only one app is able to be created per user" (Sep 2024) [Wealth-Lab 11565](https://wealth-lab.com/Discussion/Schwab-broker-extension-Beta-release-11565) (bjtrademan, 2024-09-09; accessed 2026-11-06). UNVERIFIED whether still true; relevant if you were tempted to create a second app rather than modify the existing one.

### 1.7 Completing the flow by copying the redirected URL from the address bar (VERIFIED)

- This is the standard practice for `127.0.0.1` callbacks: "Copy the link from the address bar and paste it into the terminal." [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html) (accessed 2026-11-06). schwab-py's `client_from_manual_flow` exists for exactly this (notebooks, cloud hosts, "copy-pasting URLs") and can run on a different machine than the one that will use the token [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06).
- With a `127.0.0.1:8182` callback the browser shows a connection error (nothing listens) unless a local HTTPS server with a self-signed cert is running; the URL in the address bar is still complete and usable [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06). INFERRED: for the Worker, the user can keep `127.0.0.1:8182`, paste the full URL into a private admin page on the Worker, and let the Worker do the code exchange; the `redirect_uri` sent to the token endpoint must still equal `https://127.0.0.1:8182` exactly.
- Tokens are portable between machines but must not be used from two places at once [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06).

---

## 2. Market Data endpoints (`https://api.schwabapi.com/marketdata/v1`)

### 2.1 Base URL, paths, symbols (VERIFIED)

- Base host `https://api.schwabapi.com`; market data under `/marketdata/v1`, trader endpoints under `/trader/v1`. [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py); [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py) (both accessed 2026-11-06).
- Paths (verbatim from schwab-py): `/marketdata/v1/quotes`, `/marketdata/v1/{symbol}/quotes`, `/marketdata/v1/chains`, `/marketdata/v1/expirationchain`, `/marketdata/v1/pricehistory`, `/marketdata/v1/markets`, `/marketdata/v1/markets/{market_id}` (Schwabdev), `/marketdata/v1/movers/{index}`, `/marketdata/v1/instruments`, `/marketdata/v1/instruments/{cusip}`; `/trader/v1/userPreference`. [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py); [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06).
- Symbol conventions: indices need a `$` prefix (`$SPX`, `$DJI`); after the TDA migration "S&P 500 is just `$SPX`" (no `.X` suffix). [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md); [schwab-py tda-transition](https://schwab-py.readthedocs.io/en/latest/tda-transition.html) (accessed 2026-11-06). `$VIX` follows the same rule by analogy — UNVERIFIED (no source showed a `$VIX` call).
- Futures: `/` + root + month code + 2-digit year, e.g. `/ESZ24` appears in a real quote response with `assetMainType: "FUTURE"`; continuous `/ES` is accepted by the multi-symbol `/quotes` endpoint ("supports all symbols, including those containing non-alphanumeric characters like `/ES`"), whereas `/{symbol}/quotes` is not recommended for such symbols. [schwab_api QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json); [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py); [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06).
- Option symbol format: root left-justified/space-padded to 6, `yymmdd`, `C`/`P`, strike × 1000 zero-padded to 8 digits — format string `'{:<6}{}{}{:08d}'`; examples `QQQ   240420P00500000` and `SPXW  240420C05040000` (an SPX weekly). [schwab-py orders/options.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/orders/options.py) (accessed 2026-11-06). Live example `'SPY   241004C00569000'` [Schwabdev issue #29](https://github.com/tylerebowers/Schwabdev/issues/29) (tylerebowers, 2024-10-03; accessed 2026-11-06). So `SPXW  261106C06900000` is the correct form for a 2026-11-06 6900 SPXW call. VERIFIED.

### 2.2 `GET /quotes` and `GET /{symbol}/quotes` (VERIFIED)

- Params: `symbols` (comma-joined), `fields` (comma-joined), `indicative` (`true`/`false`). [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py) (accessed 2026-11-06).
- `fields` values in schwab-py's enum: `quote`, `fundamental`, `extended`, `reference`, `regular`; Schwabdev docs list `all` (default), `quote`, `fundamental`. [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py); [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md) (accessed 2026-11-06).
- Response is an object keyed by symbol. Real index entry (captured 2024-05-17):
  `{"$SPX": {"assetMainType":"INDEX","symbol":"$SPX","realtime":true,"ssid":...,"reference":{"description":"S&P DOW JONES INDEX ... S&P 500","exchange":"0","exchangeName":"Index"},"quote":{"52WeekHigh":5305.45,"52WeekLow":...,"closePrice":5297.1,"highPrice":...,"lastPrice":5303.27,"lowPrice":...,"netChange":...,"netPercentChange":...,"openPrice":...,"securityStatus":"Closed","totalVolume":1978684063,"tradeTime":1715...}}` — no bid/ask for an index; `tradeTime` is 13-digit epoch ms. [schwab_api QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json); [schwab_api IndexResponse.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse/IndexResponse.json) (accessed 2026-11-06).
- Equity entry (SPY will look like AAPL): `quote` has `askPrice, bidPrice, askSize, bidSize, lastPrice, lastSize, closePrice, totalVolume, quoteTime, tradeTime` (both 13-digit ms), `askMICId, bidMICId, lastMICId, askTime, bidTime, volatility, securityStatus:"Normal"`, plus `extended`, `regular`, `fundamental`, `reference` blocks. [schwab_api QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json); [yash101 dataapi.types.d.ts](https://app.unpkg.com/@yash101/schwab-api-client@1.0.7/files/dist/api-types/dataapi.types.d.ts) (accessed 2026-11-06).
- Option entry via `/quotes` (useful for cheap per-contract polling): `quote` includes `delta, gamma, theta, vega, rho, impliedYield, openInterest, underlyingPrice, moneyIntrinsicValue, theoreticalOptionValue, volatility, askPrice, bidPrice, askSize, bidSize, lastPrice, closePrice, totalVolume, quoteTime, tradeTime`; `reference` includes `contractType:"C"`, `daysToExpiration`, `expirationDay/Month/Year`, `isPennyPilot`, `settlementType:"P"`, `expirationType:"S"`, `underlying`. [schwab_api QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json) (accessed 2026-11-06).

### 2.3 `GET /chains` parameters (VERIFIED)

Query names verbatim from schwab-py/Schwabdev (both accessed 2026-11-06: [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py), [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md)):

| Param | Values / notes |
|---|---|
| `symbol` | underlying, e.g. `SPY`, `$SPX` |
| `contractType` | `CALL`, `PUT`, `ALL` |
| `strikeCount` | number of strikes "above and below the at-the-money price" (schwab-py) |
| `includeUnderlyingQuote` | `true`/`false` |
| `strategy` | `SINGLE` (default), `ANALYTICAL`, `COVERED`, `VERTICAL`, `CALENDAR`, `STRANGLE`, `STRADDLE`, `BUTTERFLY`, `CONDOR`, `DIAGONAL`, `COLLAR`, `ROLL` |
| `interval` | strike interval for spread strategies |
| `strike` | a single strike |
| `range` | `ITM`, `NTM`, `OTM`, `SAK`, `SBK`, `SNK`, `ALL` (schwab-py enum; Schwabdev docs also mention `ATM`) |
| `fromDate`, `toDate` | `yyyy-MM-dd`; Schwabdev: "`fromDate` cannot be earlier than the current date" |
| `volatility`, `underlyingPrice`, `interestRate`, `daysToExpiration` | ANALYTICAL-only overrides |
| `expMonth` | `JAN`..`DEC`, `ALL` |
| `optionType` | `S` (standard), `NS` (non-standard), `ALL` |
| `entitlement` | `PP` (paying pro), `NP` (non-pro), `PN` (non-paying pro) |

### 2.4 `GET /chains` response schema

- Top level (live): `symbol`, `status` (`"SUCCESS"`), `underlying` (when `includeUnderlyingQuote=true`; contains `delayed`, `bid`, `ask`, `last`, `mark`, etc.), `strategy`, `interval`, `isDelayed`, `isIndex`, `interestRate`, `underlyingPrice`, `volatility`, `daysToExpiration`, `numberOfContracts`, `isChainTruncated`, `callExpDateMap`, `putExpDateMap`. [Schwabdev issue #29](https://github.com/tylerebowers/Schwabdev/issues/29) (live SPY output; accessed 2026-11-06); [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md) (example shows `isChainTruncated` and `numberOfContracts`); [schwab_api OptionChain.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/OptionChain.json) (Schwab's OpenAPI template; accessed 2026-11-06). VERIFIED. `assetMainType`/`assetSubType` at top level: UNVERIFIED (not in any sample I could read).
- Map keys: `callExpDateMap` → `{"2024-10-04:2": {"569.0": [ {contract} ]}}` i.e. `"YYYY-MM-DD:<daysToExpiration>"` then strike as a decimal string, then an array (normally 1 element; >1 for non-standard/adjusted contracts). [Schwabdev issue #29](https://github.com/tylerebowers/Schwabdev/issues/29) (accessed 2026-11-06). The `:N` suffix changes daily, so never hard-code it; parse by splitting on `:`. [Wolfram notebook](https://www.wolframcloud.com/obj/d0c89f62-b453-4184-87c0-597268d21818) (search snippet; accessed 2026-11-06). VERIFIED.
- Per-contract field names in the **live** response use `bid`, `ask`, `last`, `mark`, `inTheMoney` (live SPY contract: `bid 3.83, ask 3.85, last 3.81, totalVolume 16431, openInterest 3850, 'inTheMoney': False`) [Schwabdev issue #29](https://github.com/tylerebowers/Schwabdev/issues/29) (accessed 2026-11-06). Schwab's OpenAPI template (and TypeScript types generated from it) instead name them `bidPrice`, `askPrice`, `lastPrice`, `markPrice`, `isInTheMoney`, `isNonStandard`, `isMini`, `isPennyPilot`, `isIndexOption` [schwab_api OptionChain.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/OptionChain.json); [yash101 types](https://app.unpkg.com/@yash101/schwab-api-client@1.0.7/files/dist/api-types/dataapi.types.d.ts) (accessed 2026-11-06). **Code against the live names and tolerate both.** VERIFIED (discrepancy).
- Full per-contract field list (union of the live sample, the OpenAPI template and the user's list; names in live form): `putCall, symbol, description, exchangeName, bid, ask, last, mark, bidSize, askSize, bidAskSize, lastSize, highPrice, lowPrice, openPrice, closePrice, totalVolume, tradeDate, tradeTimeInLong, quoteTimeInLong, netChange, volatility, delta, gamma, theta, vega, rho, openInterest, timeValue, theoreticalOptionValue, theoreticalVolatility, optionDeliverablesList[{symbol, assetType, deliverableUnits, currencyType}], strikePrice, expirationDate (ISO string, e.g. "2024-05-17T20:00:00.000+00:00"), daysToExpiration, expirationType, lastTradingDay (epoch ms), multiplier, settlementType, deliverableNote, percentChange, markChange, markPercentChange, intrinsicValue, extrinsicValue, optionRoot, exerciseType, high52Week, low52Week, nonStandard, pennyPilot, inTheMoney, mini`. Sources as in the previous bullet. Fields `extrinsicValue, exerciseType, high52Week, low52Week` appear only in the user's list and the streaming field set (field 55 `EXERCISE_TYPE`, 50/51 52-week), not in the two chain samples I could read — UNVERIFIED in the REST chain.
- Enumerations: `expirationType` ∈ `M` (end-of-month), `Q` (quarterly), `W` (weekly), `S` (regular/standard third-Friday); `settlementType` ∈ `A` (AM), `P` (PM). [yash101 types](https://app.unpkg.com/@yash101/schwab-api-client@1.0.7/files/dist/api-types/dataapi.types.d.ts) (accessed 2026-11-06); live AAPL expiration chain shows `S`, `W`, `Q` and `P` [schwab_api ExpirationChain_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/ExpirationChain_real.json) (accessed 2026-11-06). VERIFIED.
- `quoteTimeInLong` / `tradeTimeInLong` units: the `/quotes` endpoint's `quoteTime`/`tradeTime` are 13-digit epoch milliseconds in real data; the chain's `*InLong` fields are typed `number` and (TDA heritage) are the same ms epoch. [schwab_api QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json) (accessed 2026-11-06). VERIFIED for `/quotes`; INFERRED for `/chains` (no readable real chain sample showed the number; the price-history and quote timestamps are all ms).

### 2.5 `$SPX` chain: SPX vs SPXW

- Schwab's own option-symbol convention distinguishes roots: `SPXW  240420C05040000` is "an SPX Weekly" [schwab-py orders/options.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/orders/options.py) (accessed 2026-11-06). The expiration chain response exposes `optionRoots` per expiration and `standard: true/false` [schwab_api ExpirationChain_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/ExpirationChain_real.json) (accessed 2026-11-06); each chain contract exposes `optionRoot` [schwab_api OptionChain.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/OptionChain.json) (accessed 2026-11-06). VERIFIED that the data model carries the root.
- On schwab.com's own chain tool you enter `$SPX` and then choose SPX (monthly, AM-settled on the third Friday) vs SPXW (weekly/daily, PM) [r/options thread mirror](https://lr.sudovanilla.org/r/options/comments/1frtqwy/spx_on_tos_v_schwab) (search snippet; the mirror itself returned 404 when fetched; accessed 2026-11-06). UNVERIFIED as a direct quote.
- Whether `GET /chains?symbol=$SPX` returns **both** SPX and SPXW series in one response: no source states it explicitly. Evidence that it returns a very large set: `client.option_chains("$SPX")` with no filters "returns too much data and will exceed the buffer size" ("Body buffer overflow") [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06), which is consistent with all expirations/roots being included. INFERRED (likely yes); verify on the first live call by grouping contracts by `optionRoot` and by checking `expirationType`/`settlementType` for the third-Friday date (expect an `S`/`A` SPX row and a `W`/`P` SPXW row on the same date). Also check `isChainTruncated`.
- For a 0DTE/near-dated tool, the safe pattern is `symbol=$SPX&fromDate=<today>&toDate=<today+N>&strikeCount=K&contractType=ALL` and filter by `optionRoot` client-side. INFERRED.

### 2.6 `GET /expirationchain` (VERIFIED)

- Param `symbol`. Response: `{"status": "...", "expirationList": [{"expirationDate":"2024-05-17","daysToExpiration":0,"expirationType":"S","settlementType":"P","optionRoots":"AAPL","standard":true}, ...]}`. [schwab_api ExpirationChain_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/ExpirationChain_real.json); [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py) (accessed 2026-11-06). This is the cheap call to discover which SPX dates exist and which root (`SPX` vs `SPXW`) each date belongs to. INFERRED usage.

### 2.7 `GET /pricehistory`

- Params (VERIFIED): `symbol`, `periodType` (`day`, `month`, `year`, `ytd`), `period`, `frequencyType` (`minute`, `daily`, `weekly`, `monthly`), `frequency` (minute: 1, 5, 10, 15, 30; otherwise 1), `startDate`/`endDate` (epoch **milliseconds**), `needExtendedHoursData`, `needPreviousClose`. Allowed `period` by `periodType`: day 1,2,3,4,5,10 (default 10); month 1,2,3,6; year 1,2,3,5,10,15,20; ytd 1. [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py); [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md); [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06).
- Response (VERIFIED): `{"symbol":"AAPL","empty":false,"previousClose":174.56,"previousCloseDate":1639029600000,"candles":[{"open":..,"high":..,"low":..,"close":..,"volume":..,"datetime":1639...}]}` with `datetime` in epoch ms. [schwab_api CandleList.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/CandleList.json) (accessed 2026-11-06).
- Defaults: schwab-py documents `endDate` "Default is previous trading day" and `needExtendedHoursData` "Default is true" [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py) (accessed 2026-11-06). To include today's bars pass `endDate=now` ("Since the day is not yet complete a call without `endDate` specified will return up to the end of Monday") [Schwabdev issue #48](https://github.com/tylerebowers/Schwabdev/issues/48) (tylerebowers, 2025-02-11; accessed 2026-11-06). VERIFIED.
- `$SPX` works with `pricehistory` at 1-minute granularity: a user called `get_price_history_every_minute("$SPX")` and got 224 one-minute candles (whole day returned despite a 10:00–11:00 request) [schwab-py issue #148](https://github.com/alexgolec/schwab-py/issues/148) (s-maheshbabu, 2024-07-03; accessed 2026-11-06); Wealth-Lab staff "was able to get a 1-Minute chart [of $SPX], updated to 4pm today" [Wealth-Lab 12424](https://wealth-lab.com/Discussion/How-to-configure-Schwab-extension-12424) (Cone, 2025-05-13; accessed 2026-11-06). VERIFIED.
- Intraday `startDate`/`endDate` on the same day may be ignored: Schwab told a user "their API does not return intra-day snippets" and that "the data needs to be filtered down to the given time bounds at the client level" (2024) [schwab-py issue #148](https://github.com/alexgolec/schwab-py/issues/148) (s-maheshbabu, 2024-07-18); a 2026 tester found the range honoured for TQQQ "whether or not `period` was present" (Hu1kSmash, 2026-08-06; same issue; accessed 2026-11-06). Conflicting → always trim candles client-side. VERIFIED conflict.
- How far back 1-minute bars go — the numbers disagree and none is official:
  - schwab-py: per-minute "appears to return up to 48 days of data"; 5/10/15/30-minute "approximately nine months"; daily/weekly back to 1985 for AAPL [schwab-py client docs](https://schwab-py.readthedocs.io/en/latest/client.html) (accessed 2026-11-06).
  - schwabr (R): "at a one minute interval, data can only be pulled for 30-35 days" [schwabr schwab_priceHistory](https://www.rdocumentation.org/packages/schwabr/versions/0.1.4/topics/schwab_priceHistory) (search snippet; accessed 2026-11-06).
  - thinkorswim forum users: roughly 30–45 days for 1-/5-minute; one 30-minute probe returned ~258 days [usethinkscript thread](https://usethinkscript.com/threads/accessing-historical-ticker-and-options-data-through-the-tos-schwab-api.22667/) (search snippet; page returned 403 on fetch; accessed 2026-11-06).
  - A 2026 schwab-py test pulled a 10-day 1-minute range (3,334 candles) and a 120-day 30-minute range (1,087 candles) successfully [schwab-py issue #148](https://github.com/alexgolec/schwab-py/issues/148) (Hu1kSmash, 2026-08-06; accessed 2026-11-06).
  - Lumibot: "One-minute bars were capped at a date in the page's test"; 30-minute bars exist but no 60-minute or sub-minute bars [Lumibot](https://lumibot.lumiwealth.com/brokers.schwab.html) (accessed 2026-11-06).
  Working assumption: ~30–48 calendar days of 1-minute bars for SPY and `$SPX`; ~9 months at 5–30 minutes. UNVERIFIED exact numbers; measure empirically on day one and store bars yourself.
- Extended hours for `$SPX`: no source addresses `needExtendedHoursData` for an index. Index-option regular session ends 16:15 ET per the market-hours response (section 2.8); an index has no pre/post-market prints. INFERRED: expect `$SPX` candles only during the index calculation window regardless of the flag; verify. (A Wealth-Lab user wrote there is "no difficulty with after-hours 1-minute $SPX data" in a backtest, but context suggests chart history, not after-hours prints [Wealth-Lab 12424](https://wealth-lab.com/Discussion/How-to-configure-Schwab-extension-12424) (haytac, 2025-05-15; accessed 2026-11-06).) UNVERIFIED.
- No price history for options: "Schwab does not offer price history for option contracts." — build your own backlog by streaming/polling [Schwabdev issue #24](https://github.com/tylerebowers/Schwabdev/issues/24) (tylerebowers, 2024-09-06; accessed 2026-11-06); schwab-py: price history "does not provide price history for options, futures, or any other instruments" [schwab-py client docs](https://schwab-py.readthedocs.io/en/latest/client.html) (accessed 2026-11-06). VERIFIED.
- Sub-minute bars are not available (Wealth-Lab staff belief; "$SPX does not work at all at 10 second streaming") [Wealth-Lab 12424](https://wealth-lab.com/Discussion/How-to-configure-Schwab-extension-12424) (Cone/haytac, 2025-05-13; accessed 2026-11-06). UNVERIFIED (opinion).

### 2.8 `GET /markets` and `GET /markets/{market_id}` (VERIFIED)

- Params: `markets` = comma list of `equity, option, bond, future, forex`; `date` = `yyyy-MM-dd` (schwab-py: up to one year ahead). Single-market form `/markets/{market_id}?date=...`. [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py); [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06).
- Response shape, from a real capture [schwab_api Markets_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/Markets_real.json) (accessed 2026-11-06):
  - Open day: `{"equity": {"EQ": {"date":"2022-04-14","marketType":"EQUITY","product":"EQ","productName":"equity","isOpen":true,"sessionHours":{"preMarket":[{"start":"2022-04-14T07:00:00-04:00","end":"2022-04-14T09:30:00-04:00"}],"regularMarket":[{"start":"...09:30:00-04:00","end":"...16:00:00-04:00"}],"postMarket":[{"start":"...16:00:00-04:00","end":"...20:00:00-04:00"}]}}}, "option": {"EQO": {"product":"EQO","productName":"equity option","isOpen":true,"sessionHours":{"regularMarket":[...]}}, "IND": {"product":"IND","productName":"index option","isOpen":true,"sessionHours":{"regularMarket":[{"start":"...09:30:00-04:00","end":"...16:15:00-04:00"}]}}}}`.
  - Closed day (weekend/holiday): `{"equity": {"equity": {"date":"2024-05-18","marketType":"EQUITY","product":"equity","isOpen":false}}, "option": {"option": {"date":"2024-05-18","marketType":"OPTION","product":"option","isOpen":false}}}` — note the inner key changes from `EQ`/`EQO`/`IND` to a generic `equity`/`option`, and `sessionHours` is absent.
  - Timestamps are ISO-8601 with the Eastern offset (`-04:00` in the sample; expect `-05:00` in winter). `exchange`/`category` fields from the OpenAPI type were not present in the capture.
- Early-close detection: read `option.IND.sessionHours.regularMarket[0].end` (expect `13:15` on half days for index options and `13:00` for equities). INFERRED usage; the half-day values are not shown in any source.

### 2.9 `GET /movers/{index}` and `GET /instruments` (VERIFIED)

- Movers: index ∈ `$DJI, $COMPX, $SPX, NYSE, NASDAQ, OTCBB, INDEX_ALL, EQUITY_ALL, OPTION_ALL, OPTION_PUT, OPTION_CALL`; `sort` ∈ `VOLUME, TRADES, PERCENT_CHANGE_UP, PERCENT_CHANGE_DOWN`; `frequency` ∈ `0,1,5,10,30,60`; "must be called within market hours". [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py); [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06).
- Instruments: `symbol`, `projection` ∈ `symbol-search, symbol-regex, desc-search, desc-regex, search, fundamental`; `/instruments/{cusip}`. [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py) (accessed 2026-11-06).

### 2.10 Real-time vs delayed; index quotes for individuals

- Real captures from an individual developer's token show `"realtime": true` for `$SPX`, AAPL, `/ESZ24`, EUR/USD and an AAPL option (2024-05-17) [schwab_api QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json) (accessed 2026-11-06). The chain carries `isDelayed` and `underlying.delayed` flags [schwab_api OptionChain.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/OptionChain.json) (accessed 2026-11-06). VERIFIED that the flags exist and that at least one individual received real-time index/option data.
- Entitlement depends on the account's exchange agreements: "If the account is set up for real-time quotes then this will return real-time. Otherwise the quotes will be delayed." [schwabr schwab_priceQuote](https://rdrr.io/cran/schwabr/man/schwab_priceQuote.html) (search snippet; accessed 2026-11-06). Lumibot: "no extra entitlements are required for individual developers" [Lumibot](https://lumibot.lumiwealth.com/brokers.schwab.html) (accessed 2026-11-06). `/trader/v1/userPreference` returns `offers[].mktDataPermission` (sample value `"NP"` = non-professional in a third-party example) [schwab-sdk user_preferences.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/user_preferences.rs) (search snippet; accessed 2026-11-06). INFERRED: a non-professional individual who has accepted the exchange agreements on schwab.com/thinkorswim gets real-time `$SPX`, SPY and option quotes; always log `realtime`/`isDelayed` and refuse to act on delayed data.
- Schwab API Support (2024-10-09), relayed: "you would be able to request the same symbols that you are able to on schwab.com website"; symbols only available via thinkorswim data "would be delayed by a day" (context: composite indices like $TICK, not $SPX) [Wealth-Lab 12424](https://wealth-lab.com/Discussion/How-to-configure-Schwab-extension-12424) (Cone, 2025-05-13; accessed 2026-11-06). VERIFIED as relayed.
- Enabling thinkorswim on the brokerage account is recommended by Schwabdev ("needed for orders and other API calls") [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html) (accessed 2026-11-06); a chain-returns-nothing report was tentatively linked to TOS not being enabled [Schwabdev issue #29](https://github.com/tylerebowers/Schwabdev/issues/29) (2024-10-03/07; accessed 2026-11-06). UNVERIFIED causal link.

---

## 3. Rate limits, response sizes, polling cadence

- 120 non-order requests per minute per application: Schwabdev docs: "A maximum of 120 api requests per minute can be made" [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md) (accessed 2026-11-06); Schwabdev docs index: "120 API requests per minute", "4000 order-related API calls per day", "500 concurrently streamed tickers", exceeding results in HTTP 429 [Schwabdev docs index](https://docsearch.algolia.com/mcp/docs/repo/tylerebowers/schwabdev) (accessed 2026-11-06); TradersPost citing Schwab's documentation: "non-order throttle of 120 requests per minute at the application level", order throttles "configured per account during application registration" [TradersPost](https://blog.traderspost.io/article/thinkorswim-api) (accessed 2026-11-06); Schwab/TDA API support quoted: "The maximum number of requests per minute is 120" [Wealth-Lab 11228](https://wealth-lab.com/Discussion/Support-of-TDA-Schwab-options-functionality-11228) (innertrader, 2024-04-30; accessed 2026-11-06); Wealth-Lab keeps "a 120-request-per-minute throttler" [Wealth-Lab 11565](https://wealth-lab.com/Discussion/Schwab-broker-extension-Beta-release-11565) (Cone, 2024-08-24; accessed 2026-11-06). VERIFIED (five secondary sources agree). A dissenting Elixir package claims reads are unthrottled and 120 applies only to order writes [dp_exchange_schwab](https://repo.hex.pm/preview/dp_exchange_schwab/0.1.5/usage-rules.md) (search snippet; accessed 2026-11-06) — UNVERIFIED; design for 120/min.
- The app's "Order Limit" (your 120) is the per-minute cap on order place/cancel/replace requests, unrelated to market data [schwab-py getting started](https://schwab-py.readthedocs.io/en/latest/getting-started.html) (accessed 2026-11-06). VERIFIED.
- 429 details: Lumibot reports sub-codes "429-001 = rate, 429-005 = burst; back-off 60 seconds if hit" and advises honouring `Retry-After` when present [Lumibot](https://lumibot.lumiwealth.com/brokers.schwab.html) (accessed 2026-11-06). Schwabdev's sync client retries 429/5xx with backoff for GETs [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06). UNVERIFIED sub-codes; VERIFIED that 429 is the throttle response.
- Hammering warning: an app that kept retrying with an expired token "could start sending thousands of invalid token requests to Schwab", which "led to a warning from Schwab's API team" [Wealth-Lab 12375](https://wealth-lab.com/Discussion/12375) (Cone, 2025-04-14; accessed 2026-11-06). Stop retrying after an auth failure.
- Per-endpoint limits: none documented in any source I could read. UNVERIFIED.
- Full `$SPX` chain size: not measured by any source; Schwabdev's HTTP client cannot buffer `option_chains("$SPX")` with no filters ("Body buffer overflow") [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06). INFERRED order of magnitude: tens of thousands of contracts × ~1 KB each → multi-MB to >10 MB JSON. Use `strikeCount` and `fromDate`/`toDate`.
- Schwabdev's docs discourage polling REST in a loop for market data and recommend streaming instead [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md) (accessed 2026-11-06).
- Suggested REST budget for this tool (INFERRED from the 120/min cap): one `/chains` call per 5–10 s for the active expiration(s) (6–12 req/min), one `/quotes?symbols=$SPX,SPY,$VIX,/ES` per 2–3 s (20–30 req/min), `/markets` once per day, `/expirationchain` once per day, leaving headroom for `/pricehistory` backfills. Never exceed ~90/min sustained.

---

## 4. Streaming (Streamer API over WebSocket)

### 4.1 Prerequisite: `streamerInfo` from `GET /trader/v1/userPreference`

- Both libraries obtain the socket URL and login identifiers from the user-preference endpoint: schwab-py reads `prefs['streamerInfo'][0]` → `schwabClientCorrelId`, `schwabClientCustomerId`, `schwabClientChannel`, `schwabClientFunctionId`, `streamerSocketUrl` [schwab-py streaming.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/streaming.py) (accessed 2026-11-06); Schwabdev reads the same five fields [Schwabdev stream.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/stream.py) (accessed 2026-11-06). Path: `/trader/v1/userPreference` [schwab-py base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py); [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06). Real response shape: `{"accounts":[{accountNumber, primaryAccount, type, nickName, displayAcctId, autoPositionEffect, accountColor}], "streamerInfo":[{streamerSocketUrl, schwabClientCustomerId, schwabClientCorrelId, schwabClientChannel, schwabClientFunctionId}], "offers":[{level2Permissions, mktDataPermission}]}` [schwab_api UserPreferences_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/Trader/UserPreferences_real.json) (accessed 2026-11-06); example `streamerSocketUrl` is `wss://streamer-api.schwab.com/ws` and `schwabClientFunctionId` is `"APIAPP"` [schwab-sdk user_preferences.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/user_preferences.rs) (search snippet; accessed 2026-11-06). VERIFIED.
- Is `/trader/v1/userPreference` part of "Accounts and Trading Production"? Evidence: (a) it is under the `/trader/v1` base, not `/marketdata/v1` (VERIFIED, above); (b) Schwabdev's troubleshooting: a 401 "Client not authorized" means "You do not have access to both APIs and are attempting to access one that you have not added to your app" [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06); (c) a schwab-py user whose streaming `login()` failed guessed "since streaming is considered a 'Live' operation, the API access you need is 'Accounts and Trading Production'" [schwab-py issue #190](https://github.com/alexgolec/schwab-py/issues/190) (androslee, 2025-03-13; accessed 2026-11-06); (d) schwab-py's docs say "Accounts and Trading Production" "grants access to all APIs supported by schwab-py" while the community is "not currently clear on the difference" [schwab-py getting-started.rst](https://schwab-py.readthedocs.io/en/latest/_sources/getting-started.rst.txt) (accessed 2026-11-06). INFERRED with high confidence: **with Market Data Production only, `/trader/v1/userPreference` will return 401 and streaming is unavailable.** The authoritative product→endpoint table is on the portal behind login (UNVERIFIED directly).

### 4.2 Protocol: login, commands, response codes (VERIFIED)

- Connect to `streamerSocketUrl`. First message (schwab-py wraps it in `{"requests":[...]}`; Schwabdev sends the bare object — both work in practice):
  ```json
  {"service":"ADMIN","requestid":"0","command":"LOGIN",
   "SchwabClientCustomerId":"<from streamerInfo>","SchwabClientCorrelId":"<from streamerInfo>",
   "parameters":{"Authorization":"<access_token>","SchwabClientChannel":"<from streamerInfo>","SchwabClientFunctionId":"<from streamerInfo>"}}
  ```
  [schwab-py streaming.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/streaming.py); [Schwabdev stream.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/stream.py) (accessed 2026-11-06).
- Commands: `LOGIN`, `SUBS` (replaces the existing subscription for that service), `ADD` (extends), `UNSUBS`, `VIEW` (change field set), `LOGOUT`. Request parameters: `keys` (comma-joined symbols) and `fields` (comma-joined field ids). [schwab-sdk protocol.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/streamer/protocol.rs); [schwab-py streaming.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/streaming.py) (accessed 2026-11-06). A `SUBS` "silently drops anything not included in it" [dp_exchange_schwab](https://repo.hex.pm/preview/dp_exchange_schwab/0.1.5/usage-rules.md) (search snippet; accessed 2026-11-06).
- Responses: `{"response":[{"service","requestid","command","content":{"code":0,"msg":"..."}}]}`; data: `{"data":[{"service":"LEVELONE_OPTIONS","timestamp":1765081984668,"command":"SUBS","content":[{"key":"<symbol>","1":...,"2":...}]}]}`; heartbeats arrive as `{"notify":[{"heartbeat":"<ms>"}]}`. [schwab-py streaming.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/streaming.py); [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) (accessed 2026-11-06). Timestamps are 13-digit ms.
- Response codes (numeric): 0 OK; 3 login denied; 9 unknown failure; 11 service not available; 12 close connection; 19 reached symbol limit; 20 stream connection not found; 21 bad command format; 22–25 SUBS/UNSUBS/ADD/VIEW failed; 26–29 SUBS/UNSUBS/ADD/VIEW succeeded; 30 stop streaming. [schwab-sdk protocol.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/streamer/protocol.rs) (accessed 2026-11-06). VERIFIED (third-party transcription of the Streamer Guide; the guide itself on Scribd failed to load).
- Field `"0"` (symbol) must always be included; the server closes the socket "after ~30 seconds if there are no subscriptions" [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) (accessed 2026-11-06). Schwabdev treats a close within 90 s of connect as a fatal config problem (no subscriptions, bad login) and otherwise reconnects with 2 s → 120 s exponential backoff; it uses library-level ping with a 20–30 s timeout [Schwabdev stream.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/stream.py) (accessed 2026-11-06).

### 4.3 Services and field lists (VERIFIED)

- Services: `ADMIN`, `LEVELONE_EQUITIES`, `LEVELONE_OPTIONS`, `LEVELONE_FUTURES`, `LEVELONE_FUTURES_OPTIONS`, `LEVELONE_FOREX`, `NYSE_BOOK`, `NASDAQ_BOOK`, `OPTIONS_BOOK`, `CHART_EQUITY`, `CHART_FUTURES`, `SCREENER_EQUITY`, `SCREENER_OPTION`, `ACCT_ACTIVITY`. [schwab-py streaming.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/streaming.py); [schwab-sdk protocol.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/streamer/protocol.rs) (accessed 2026-11-06). `FOREX_BOOK`, `FUTURES_BOOK`, `FUTURES_OPTIONS_BOOK` "refuse to connect" [schwab-py streaming docs](https://schwab-py.readthedocs.io/en/latest/streaming.html) (accessed 2026-11-06).
- LEVELONE services stream **deltas**: "stream changes, meaning that the data you receive overwrites the previous fields" — merge into a local snapshot [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) (accessed 2026-11-06). CHART_* and ACCT_ACTIVITY carry sequence numbers.
- `LEVELONE_OPTIONS` fields 0–55 [schwab-py streaming docs](https://schwab-py.readthedocs.io/en/latest/streaming.html) (accessed 2026-11-06): 0 SYMBOL, 1 DESCRIPTION, 2 BID_PRICE, 3 ASK_PRICE, 4 LAST_PRICE, 5 HIGH_PRICE, 6 LOW_PRICE, 7 CLOSE_PRICE, 8 TOTAL_VOLUME, 9 OPEN_INTEREST, 10 VOLATILITY, 11 MONEY_INTRINSIC_VALUE, 12 EXPIRATION_YEAR, 13 MULTIPLIER, 14 DIGITS, 15 OPEN_PRICE, 16 BID_SIZE, 17 ASK_SIZE, 18 LAST_SIZE, 19 NET_CHANGE, 20 STRIKE_TYPE, 21 CONTRACT_TYPE, 22 UNDERLYING, 23 EXPIRATION_MONTH, 24 DELIVERABLES, 25 TIME_VALUE, 26 EXPIRATION_DAY, 27 DAYS_TO_EXPIRATION, 28 DELTA, 29 GAMMA, 30 THETA, 31 VEGA, 32 RHO, 33 SECURITY_STATUS, 34 THEORETICAL_OPTION_VALUE, 35 UNDERLYING_PRICE, 36 UV_EXPIRATION_TYPE, 37 MARK, 38 QUOTE_TIME_MILLIS, 39 TRADE_TIME_MILLIS, 40 EXCHANGE_ID, 41 EXCHANGE_NAME, 42 LAST_TRADING_DAY, 43 SETTLEMENT_TYPE, 44 NET_PERCENT_CHANGE, 45 MARK_CHANGE, 46 MARK_CHANGE_PERCENT, 47 IMPLIED_YIELD, 48 IS_PENNY, 49 OPTION_ROOT, 50 HIGH_PRICE_52_WEEK, 51 LOW_PRICE_52_WEEK, 52 INDICATIVE_ASKING_PRICE, 53 INDICATIVE_BID_PRICE, 54 INDICATIVE_QUOTE_TIME, 55 EXERCISE_TYPE. Schwabdev's table also runs 0 "Symbol" … 55 "Exercise Type" [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) (accessed 2026-11-06). Note the Elixir package's claim that the bid/ask *ID* field positions differ between the options and equities services [dp_exchange_schwab](https://repo.hex.pm/preview/dp_exchange_schwab/0.1.5/usage-rules.md) (search snippet) — UNVERIFIED.
- `LEVELONE_EQUITIES` fields 0–51 [schwab-py streaming docs](https://schwab-py.readthedocs.io/en/latest/streaming.html) (accessed 2026-11-06): 0 SYMBOL, 1 BID_PRICE, 2 ASK_PRICE, 3 LAST_PRICE, 4 BID_SIZE, 5 ASK_SIZE, 6 ASK_ID, 7 BID_ID, 8 TOTAL_VOLUME, 9 LAST_SIZE, 10 HIGH_PRICE, 11 LOW_PRICE, 12 CLOSE_PRICE, 13 EXCHANGE_ID, 14 MARGINABLE, 15 DESCRIPTION, 16 LAST_ID, 17 OPEN_PRICE, 18 NET_CHANGE, 19 HIGH_PRICE_52_WEEK, 20 LOW_PRICE_52_WEEK, 21 PE_RATIO, 22 DIVIDEND_AMOUNT, 23 DIVIDEND_YIELD, 24 NAV, 25 EXCHANGE_NAME, 26 DIVIDEND_DATE, 27 REGULAR_MARKET_QUOTE, 28 REGULAR_MARKET_TRADE, 29 REGULAR_MARKET_LAST_PRICE, 30 REGULAR_MARKET_LAST_SIZE, 31 REGULAR_MARKET_NET_CHANGE, 32 SECURITY_STATUS, 33 MARK, 34 QUOTE_TIME_MILLIS, 35 TRADE_TIME_MILLIS, 36 REGULAR_MARKET_TRADE_MILLIS, 37 BID_TIME_MILLIS, 38 ASK_TIME_MILLIS, 39 ASK_MIC_ID, 40 BID_MIC_ID, 41 LAST_MIC_ID, 42 NET_CHANGE_PERCENT, 43 REGULAR_MARKET_CHANGE_PERCENT, 44 MARK_CHANGE, 45 MARK_CHANGE_PERCENT, 46 HTB_QUANTITY, 47 HTB_RATE, 48 HARD_TO_BORROW, 49 IS_SHORTABLE, 50 POST_MARKET_NET_CHANGE, 51 POST_MARKET_NET_CHANGE_PERCENT.
- Index symbols on LEVELONE_EQUITIES tick with zero volume ("Indices generally tick with 0 volume") [Wealth-Lab 12424](https://wealth-lab.com/Discussion/How-to-configure-Schwab-extension-12424) (Cone, 2025-05-15; accessed 2026-11-06). Don't filter index ticks by size.

### 4.4 Limits

- One streaming connection per login: "only one streamer can be active at a time" (multiple clients only if they share the same token file) [Schwabdev docs index](https://docsearch.algolia.com/mcp/docs/repo/tylerebowers/schwabdev) (accessed 2026-11-06); r/algotrading: "One websockets stream per connection." with the workaround of a second web login on the same account [r/algotrading mirror](https://reddit.sentinel-team.org/posts/1tdj6o1/snapshots/2026-05-15T19%3A02%3A50.96329Z) (u/vendeep; snapshot 2026-05-15; accessed 2026-11-06); Medved Trader forum reports Schwab "restricting access to a single connection per login" [Medved forum](https://forums.medvedtrader.com/topic/5714-schwab-integration-released-beta-note-some-limitations/) (search snippet; page returned 403 on fetch; accessed 2026-11-06). VERIFIED (three independent). Opening a second socket is expected to kill the first (code 12/30 or a close) — INFERRED mechanism.
- Symbol cap: "The maximum number of keys that can be subscribed to at once is **500**" [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) (accessed 2026-11-06); code 19 `REACHED_SYMBOL_LIMIT` [schwab-sdk protocol.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/streamer/protocol.rs) (accessed 2026-11-06). VERIFIED. Whether the 500 is per service or total is not stated — UNVERIFIED.
- Login uses the 30-minute access token; the libraries do not re-login on token refresh, and the socket stays up past 30 minutes in practice (Schwabdev restarts only on closes) [Schwabdev stream.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/stream.py) (accessed 2026-11-06). INFERRED: a stream can outlive the access token used to log in, but a reconnect needs a fresh (unexpired) access token.
- Schwabdev's auto mode runs the streamer 09:29–16:00 ET Mon–Fri [Schwabdev stream.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/stream.py) (accessed 2026-11-06).

### 4.5 Holding the Schwab WebSocket in a Cloudflare Durable Object

- Workers can open client WebSockets either with `new WebSocket(url)` or with `fetch(url, {headers: {Upgrade: 'websocket'}})` → `resp.webSocket.accept()`; half-open control requires the fetch form [Cloudflare WebSockets examples](https://developers.cloudflare.com/workers/examples/websockets/); [Cloudflare WebSockets runtime API](https://developers.cloudflare.com/workers/runtime-apis/websockets/) (accessed 2026-11-06). VERIFIED. Note the `Authorization` for Schwab is sent inside the LOGIN frame, not as an HTTP header, so either form works.
- Lifetime: "Pending I/O and open outbound connections prevent a Durable Object from being evicted", but each such operation holds it in memory "for up to 15 minutes after it starts"; otherwise an idle non-hibernating DO is evicted "after 70-140 seconds of inactivity (no incoming requests or events)"; hibernation is impossible while an outbound connection is open; on eviction, sockets are closed and in-memory state is lost [Cloudflare DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) (accessed 2026-11-06); the 2026-06-19 change explicitly covers "outbound WebSocket connections" with the "maximum of 15 minutes" per connection [Cloudflare changelog 2026-06-19](https://developers.cloudflare.com/changelog/post/2026-06-19-outbound-connections-keep-dos-alive/) (accessed 2026-11-06). VERIFIED.
- Other DO limits: 6 simultaneous outgoing connections per request; 32 MiB max received WebSocket message; 30 s CPU per incoming event (configurable to 5 min); "No hard limit while the caller stays connected"; a DO "remain[s] active while a request, RPC call, response stream, WebSocket, or pending I/O is in flight" [Cloudflare DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (accessed 2026-11-06). Alarms: one per DO, can re-instantiate an evicted object "on another machine", at-least-once with retries, and should reschedule themselves for recurring work [Cloudflare DO alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) (accessed 2026-11-06). VERIFIED.
- Consequence (INFERRED): a DO can hold the Schwab stream, but you must treat the connection as disposable: (1) a `setAlarm` every ~30–60 s to touch the object (an alarm is an incoming event), re-send a lightweight command or check `readyState`, and re-dial on close; (2) expect forced reconnects on the order of every 15 minutes if nothing inbound reaches the object and after any runtime restart; (3) persist the last snapshot to DO storage (or KV/D1) on every meaningful update so a fresh instance can resume; (4) keep at most one DO instance (singleton id) because Schwab allows one connection per login. Whether the alarm cadence alone defeats the 70–140 s idle eviction while an outbound socket is open past 15 minutes is not spelled out in Cloudflare's docs — UNVERIFIED; measure it.
- Alternative without streaming: a Cron Trigger fires at most once per minute (`* * * * *`), has a 15-minute wall-clock cap per invocation, and schedule changes take up to 15 minutes to propagate [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/); [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (accessed 2026-11-06). A DO alarm loop polling REST every 5–10 s is the better fit for intraday cadence. INFERRED.

---

## 5. Terms of use (what could and could not be verified)

- The Terms of Use page on the portal is inside the login-walled SPA (section 0). I could not read the actual text. Everything below is secondary. UNVERIFIED as to exact wording.
- Scope of "Individual": "Individual use is for developers building applications to authenticate into their own accounts" (e.g. backtesting); distributing an app to other account holders, free or paid, requires "Trader API - Commercial" with its own review; authentication requires a Schwab retail self-directed brokerage account [TradersPost](https://blog.traderspost.io/article/thinkorswim-api) (accessed 2026-11-06). A private personal tool fits the Individual product. VERIFIED as relayed.
- Consent per re-login: the weekly re-login exists so that "you, yourself, agree to the terms each time you reauth" [Schwabdev issue #66](https://github.com/tylerebowers/Schwabdev/issues/66) (accessed 2026-11-06).
- Storing market data for personal research/backtesting: no accessible source quotes a Schwab clause either way. The Schwabdev maintainer openly recommends "build your own backlog by streaming the contracts you want" [Schwabdev issue #24](https://github.com/tylerebowers/Schwabdev/issues/24) (accessed 2026-11-06), and schwab-py advises local-only use ("do not distribute ... or run on a server for other users") [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06) — both are community practice, not terms. An API-catalog file describing an "Individual Developer" tier for personal use and a commercial tier for redistribution with exchange-license requirements is auto-generated and marked unreconciled, and its URL now 404s [api-evangelist plans yml](https://raw.githubusercontent.com/api-evangelist/charles-schwab/refs/heads/main/plans/charles-schwab-plans-pricing.yml) (404 on fetch; search snippet only; accessed 2026-11-06). UNVERIFIED. General exchange non-professional agreements (accepted on schwab.com) restrict redistribution/display to third parties; a single-user private page is the conservative interpretation — INFERRED, not a legal opinion.
- Display restrictions: nothing specific found. UNVERIFIED. Keep the tool single-user and non-public.
- Practical rules that function like terms: one valid refresh token at a time (section 1.4); one streaming connection per login (section 4.4); do not automate the browser login (section 1.4); do not hammer the token endpoint after failures (section 3).

---

## 6. Known pitfalls from the community

1. **401 "Client not authorized" = missing API product.** "You do not have access to both APIs and are attempting to access one that you have not added to your app." Fix: add both "Accounts and Trading Production" and "Market Data Production". [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06). Directly relevant: with Market-Data-only, `/trader/v1/*` (including `userPreference`) will 401.
2. **Login loop / no redirect** when the callback URL differs by case or slash, when the app is still "Approved - Pending", or (one report) when only Market Data Production was enabled [Schwabdev issue #53](https://github.com/tylerebowers/Schwabdev/issues/53) (2025-04-01 … 2025-06-30; accessed 2026-11-06). That last point is a single data point (UNVERIFIED generality) but worth testing before building the Market-Data-only path.
3. **Token refresh failures.** `400 unsupported_token_type` / `refresh_token_authentication_error` → the refresh token was invalidated by another login (one valid refresh token at a time) [Schwabdev issue #40](https://github.com/tylerebowers/Schwabdev/issues/40) (accessed 2026-11-06). `invalid_client` → refresh token older than 7 days [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) (accessed 2026-11-06). Library-side bug in schwab-py where login-flow clients could not refresh at all [schwab-py issue #222](https://github.com/alexgolec/schwab-py/issues/222) (2026-07-18; accessed 2026-11-06) — irrelevant to a hand-written Worker but a reminder to test the refresh path explicitly before the first 30 minutes elapse.
4. **The 7-day re-login.** Everyone hits it; the common mitigation is a weekend reminder ("set a repeat 7-day alarm on the weekend to refresh the login") [Wealth-Lab 13102 via search](https://wealth-lab.com/Discussion/Minor-bug-Repeated-errors-getting-history-when-Schwab-access-token-expired-13102) (search snippet; accessed 2026-11-06); Lumibot re-deploys after 7+ days idle [Lumibot](https://lumibot.lumiwealth.com/brokers.schwab.html) (accessed 2026-11-06).
5. **"Unauthorized after midnight."** I found **no** source describing a midnight-specific 401. UNVERIFIED. What is documented: tokens expire relative to issuance (30 min / 7 days), Schwab "sometimes invalidates tokens when they make backend changes" [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06), and a user suspected Saturday maintenance for stalls [Wealth-Lab 11565](https://wealth-lab.com/Discussion/Schwab-broker-extension-Beta-release-11565) (paul1986, 2024-08-24; accessed 2026-11-06). Design: on any 401, force one access-token refresh and retry once; if that fails, mark the session dead and stop.
6. **Symbol formats.** `$SPX` not `SPX`; options need the 6-char padded root; futures `/ESZ24` [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md); [schwab-py tda-transition](https://schwab-py.readthedocs.io/en/latest/tda-transition.html) (accessed 2026-11-06). URL-encode option symbols (spaces) in query strings.
7. **SPXW vs SPX in the chain.** Same expiration date can carry two roots with different settlement (AM `A` vs PM `P`) and `expirationType` (`S` vs `W`); group by `optionRoot` and never match contracts by date+strike alone (sections 2.4–2.5). INFERRED from the data model; the AM/PM third-Friday behaviour is CBOE product design relayed by [r/options mirror](https://lr.sudovanilla.org/r/options/comments/1frtqwy/spx_on_tos_v_schwab) (search snippet; accessed 2026-11-06).
8. **`strikeCount`** means N strikes above and below ATM [schwab-py client docs](https://schwab-py.readthedocs.io/en/latest/client.html) (accessed 2026-11-06); omit it on `$SPX` and you get the whole chain (buffer overflow) [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06). `fromDate` cannot be in the past [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md) (accessed 2026-11-06).
9. **Chain map keys** `"YYYY-MM-DD:N"` where N changes every day; strike keys are decimal strings (`"569.0"`), and a user's lookup failed simply because the key format was assumed [Schwabdev issue #29](https://github.com/tylerebowers/Schwabdev/issues/29) (accessed 2026-11-06).
10. **Option quote timestamps.** `/quotes` `quoteTime`/`tradeTime` are epoch ms (VERIFIED); chain `quoteTimeInLong`/`tradeTimeInLong` are the same convention (INFERRED). Options that have not traded today keep a stale `tradeTimeInLong` — use `quoteTimeInLong` for freshness. INFERRED.
11. **Missing/odd greeks.** No Schwab-specific source documents a sentinel (the TDA-era `-999.0` convention is UNVERIFIED for Schwab). Other option-data vendors note greeks/IV are unreliable outside regular hours [Massive KB](https://massive.com/knowledge-base/article/why-are-greeks-and-implied-volatility-missing-from-the-options-snapshot) (search snippet; accessed 2026-11-06). Treat `NaN`, `-999`, or `0` with zero bid/ask as missing and recompute greeks yourself from mark + underlying when needed.
12. **Price history quirks.** Same-day `startDate`/`endDate` may be ignored → trim client-side [schwab-py issue #148](https://github.com/alexgolec/schwab-py/issues/148) (accessed 2026-11-06); today's bars require `endDate=now` [Schwabdev issue #48](https://github.com/tylerebowers/Schwabdev/issues/48) (accessed 2026-11-06); candle `datetime` is bar-open in ms; no option history [Schwabdev issue #24](https://github.com/tylerebowers/Schwabdev/issues/24) (accessed 2026-11-06); naive-datetime → epoch conversion bugs are common in client code [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06) — in the Worker always build epoch ms from UTC.
13. **`$SPX` extended hours.** Nothing documented (section 2.7). UNVERIFIED.
14. **Movers** only during market hours [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) (accessed 2026-11-06).
15. **Streaming gotchas.** Add handlers before subscribing (data starts immediately); `SUBS` replaces, `ADD` extends; LEVELONE sends deltas; socket closes after ~30 s with no subscriptions; the HTTP 401 for `userPreference` shows up as a failed `login()` [schwab-py streaming docs](https://schwab-py.readthedocs.io/en/latest/streaming.html); [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) (accessed 2026-11-06).
16. **Schwab's own OpenAPI spec vs live.** Field names differ for chains (`bidPrice` vs `bid`), and `userPreference` is typed as an array in the spec but the live API returns a single object [schwab-sdk user_preferences.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/user_preferences.rs) (search snippet; accessed 2026-11-06) — the Rust fixture shows `streamerInfo` as an array inside an object [schwab_api UserPreferences_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/Trader/UserPreferences_real.json) (accessed 2026-11-06). Parse defensively.

---

## 7. Market Data-only vs adding "Accounts and Trading Production"

| Capability | Market Data Production only (current) | After adding Accounts and Trading Production |
|---|---|---|
| `/marketdata/v1/quotes`, `/chains`, `/expirationchain`, `/pricehistory`, `/markets`, `/movers`, `/instruments` | Yes (VERIFIED: these are the Market Data endpoints; schwab-py/Schwabdev paths) | Yes |
| `/trader/v1/userPreference` (streamerInfo, `mktDataPermission`) | Expected 401 "Client not authorized" (INFERRED, high confidence; section 4.1) | Yes |
| Streaming (LEVELONE_OPTIONS/EQUITIES, CHART_*, ACCT_ACTIVITY) | No (needs streamerInfo) | Yes, one connection per login, 500 keys |
| `/trader/v1/accounts` positions/balances, orders, transactions | No | Yes (no order placement planned; read-only use is fine) |
| OAuth login UX | Same flow; one report of a login loop with Market-Data-only (UNVERIFIED generality) | Same |
| Approval impact | None now | Modify App > APIs; "a modified app enters Approved - Pending" (schwab-py) vs. one report of it working next day (Schwabdev #53). Plan for 1–5 days of possible downtime of the app's auth (section 1.6). |

- schwab-py's view: "selecting 'Accounts and Trading Production' grants access to all APIs supported by schwab-py" [schwab-py getting-started.rst](https://schwab-py.readthedocs.io/en/latest/_sources/getting-started.rst.txt) (accessed 2026-11-06); Schwabdev: "Both are needed for full functionality" [Schwabdev setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html) (accessed 2026-11-06). VERIFIED.
- If you add it, keep the existing app (modify, do not create a second one — "only one app ... per user" was Schwab's position in 2024 [Wealth-Lab 11565](https://wealth-lab.com/Discussion/Schwab-broker-extension-Beta-release-11565) (accessed 2026-11-06); UNVERIFIED currently).

---

## 8. Appendix A: field cheat-sheets (names as the live API returns them)

Sources for this appendix: [schwab_api QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json), [schwab_api IndexResponse.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse/IndexResponse.json), [Schwabdev issue #29](https://github.com/tylerebowers/Schwabdev/issues/29), [schwab_api OptionChain.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/OptionChain.json), [yash101 types](https://app.unpkg.com/@yash101/schwab-api-client@1.0.7/files/dist/api-types/dataapi.types.d.ts), [schwab-py streaming docs](https://schwab-py.readthedocs.io/en/latest/streaming.html) (all accessed 2026-11-06). "Live" = seen in a real capture; "Spec" = only in Schwab's OpenAPI template / generated types; "Both" = seen in both.

### A.1 `/quotes` entry for an index (`$SPX`, `$VIX`)

| Field | Where | Notes |
|---|---|---|
| `assetMainType` | Live | `"INDEX"` |
| `symbol` | Live | `"$SPX"` |
| `realtime` | Live | boolean; gate on `true` |
| `ssid` | Live | Schwab security id |
| `reference.description` | Live | e.g. `"S&P DOW JONES INDEX ... S&P 500"` |
| `reference.exchange`, `reference.exchangeName` | Live | `"0"`, `"Index"` |
| `quote.lastPrice` | Live | the index value |
| `quote.openPrice`, `highPrice`, `lowPrice`, `closePrice` | Live | `closePrice` = prior close |
| `quote.netChange`, `netPercentChange` | Live | |
| `quote.52WeekHigh`, `52WeekLow` | Live | key begins with a digit; use bracket access |
| `quote.totalVolume` | Live | composite volume |
| `quote.tradeTime` | Live | epoch ms |
| `quote.securityStatus` | Live | `"Normal"`, `"Closed"`, `"Unknown"` seen |
| bid/ask fields | — | **absent** for an index |

### A.2 `/quotes` entry for an equity/ETF (SPY)

| Field | Where | Notes |
|---|---|---|
| `assetMainType`, `assetSubType`, `quoteType` | Live/Spec | `"EQUITY"`, e.g. `"ETF"` |
| `realtime`, `ssid`, `symbol` | Live | |
| `quote.bidPrice`, `askPrice`, `bidSize`, `askSize` | Live | |
| `quote.lastPrice`, `lastSize` | Live | |
| `quote.quoteTime`, `tradeTime`, `bidTime`, `askTime` | Live | epoch ms |
| `quote.bidMICId`, `askMICId`, `lastMICId` | Live | venue MICs |
| `quote.openPrice`, `highPrice`, `lowPrice`, `closePrice`, `netChange`, `netPercentChange`, `totalVolume` | Live | |
| `quote.volatility` | Live | historical vol |
| `quote.securityStatus` | Live | `"Normal"` during RTH |
| `extended.*`, `regular.*`, `fundamental.*`, `reference.*` | Spec/Live | request via `fields` |

### A.3 `/quotes` entry for a single option contract (symbol like `SPXW  261106C06900000`)

| Field | Where | Notes |
|---|---|---|
| `assetMainType` | Live | `"OPTION"` |
| `quote.bidPrice`, `askPrice`, `bidSize`, `askSize`, `lastPrice`, `closePrice`, `totalVolume` | Live | note the `*Price` naming here (differs from `/chains`) |
| `quote.quoteTime`, `tradeTime` | Live | epoch ms |
| `quote.delta`, `gamma`, `theta`, `vega`, `rho` | Live | |
| `quote.volatility` | Live | IV in percent units in the sample (`1318.9` for a deep ITM 0DTE) |
| `quote.openInterest`, `underlyingPrice`, `moneyIntrinsicValue`, `theoreticalOptionValue`, `impliedYield` | Live | |
| `quote.52WeekHigh`, `52WeekLow`, `securityStatus` | Live | |
| `reference.contractType` | Live | `"C"`/`"P"` |
| `reference.daysToExpiration`, `expirationDay`, `expirationMonth`, `expirationYear` | Live | |
| `reference.expirationType`, `settlementType` | Live | `"S"`/`"W"`/`"Q"`/`"M"`; `"A"`/`"P"` |
| `reference.isPennyPilot`, `underlying` | Live | |

### A.4 `/chains` per-contract object

| Field | Where | Notes |
|---|---|---|
| `putCall` | Both | `"CALL"`/`"PUT"` |
| `symbol` | Both | padded OCC-style, e.g. `'SPY   241004C00569000'` |
| `description`, `exchangeName` | Both | |
| `bid`, `ask`, `last`, `mark` | Live | spec calls them `bidPrice`, `askPrice`, `lastPrice`, `markPrice` |
| `bidSize`, `askSize`, `lastSize` | Both | `bidAskSize` (e.g. `"62X62"`) seen in TDA-era data; UNVERIFIED on Schwab |
| `highPrice`, `lowPrice`, `openPrice`, `closePrice` | Both | |
| `totalVolume`, `openInterest` | Both | |
| `tradeDate` | Spec | |
| `quoteTimeInLong`, `tradeTimeInLong` | Both | epoch ms (INFERRED for chain; VERIFIED for `/quotes`) |
| `netChange`, `percentChange`, `markChange`, `markPercentChange` | Both | |
| `volatility` | Both | IV |
| `delta`, `gamma`, `theta`, `vega`, `rho` | Both | |
| `timeValue`, `intrinsicValue`, `theoreticalOptionValue`, `theoreticalVolatility` | Both | `extrinsicValue` UNVERIFIED |
| `optionDeliverablesList[]` | Both | `{symbol, assetType, deliverableUnits, currencyType}` |
| `strikePrice` | Both | number |
| `expirationDate` | Both | ISO string with offset |
| `daysToExpiration` | Both | integer; also encoded in the map key |
| `expirationType` | Both | `M`/`Q`/`W`/`S` |
| `settlementType` | Both | `A`/`P` |
| `lastTradingDay` | Both | epoch ms |
| `multiplier` | Both | 100 |
| `deliverableNote` | Both | |
| `optionRoot` | Both | `"SPX"` vs `"SPXW"` — the discriminator |
| `inTheMoney`, `nonStandard`, `mini`, `pennyPilot` | Live | spec: `isInTheMoney`, `isNonStandard`, `isMini`, `isPennyPilot`, `isIndexOption` |
| `exerciseType`, `high52Week`, `low52Week` | — | UNVERIFIED in REST chain (present as streaming fields 55/50/51) |

### A.5 Streaming `LEVELONE_OPTIONS` fields most useful for this tool

| Id | Name | Id | Name |
|---|---|---|---|
| 0 | SYMBOL (always required) | 28 | DELTA |
| 2 | BID_PRICE | 29 | GAMMA |
| 3 | ASK_PRICE | 30 | THETA |
| 4 | LAST_PRICE | 31 | VEGA |
| 8 | TOTAL_VOLUME | 32 | RHO |
| 9 | OPEN_INTEREST | 35 | UNDERLYING_PRICE |
| 10 | VOLATILITY | 37 | MARK |
| 16 | BID_SIZE | 38 | QUOTE_TIME_MILLIS |
| 17 | ASK_SIZE | 39 | TRADE_TIME_MILLIS |
| 27 | DAYS_TO_EXPIRATION | 43 | SETTLEMENT_TYPE |
| 21 | CONTRACT_TYPE | 49 | OPTION_ROOT |

## 9. Appendix B: Worker-side JavaScript sketches (shaped by the sources above; untested against the live API)

### B.1 Token manager (singleton Durable Object)

```js
const TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';
const ACCESS_TTL_MS = 30 * 60 * 1000;      // Schwabdev: 1800 s
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000; // Schwabdev: 604800 s
const REFRESH_SOFT_MS = 6.5 * 24 * 3600 * 1000; // schwab-py easy_client max_token_age

export class SchwabAuth {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/token') return Response.json(await this.accessToken());
    if (url.pathname === '/exchange' && req.method === 'POST') {
      const { pastedUrl } = await req.json();
      const code = new URL(pastedUrl).searchParams.get('code'); // decodes %40 -> @
      return Response.json(await this.exchange({ grant_type: 'authorization_code', code, redirect_uri: this.env.REDIRECT_URI }));
    }
    return new Response('not found', { status: 404 });
  }
  async exchange(form) {
    const basic = btoa(`${this.env.SCHWAB_APP_KEY}:${this.env.SCHWAB_APP_SECRET}`);
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`token ${r.status} ${JSON.stringify(body)}`); // do NOT retry in a loop
    const now = Date.now();
    const prev = (await this.state.storage.get('tok')) || {};
    const tok = {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? prev.refresh_token,
      access_expires_at: now + (body.expires_in ?? 1800) * 1000,
      refresh_issued_at: form.grant_type === 'authorization_code' || body.refresh_token !== prev.refresh_token ? now : prev.refresh_issued_at,
    };
    await this.state.storage.put('tok', tok);
    return { ok: true, refresh_age_days: (now - tok.refresh_issued_at) / 86400000 };
  }
  async accessToken() {
    const tok = await this.state.storage.get('tok');
    if (!tok) return { error: 'login_required' };
    if (Date.now() - tok.refresh_issued_at > REFRESH_SOFT_MS) return { error: 'login_required', reason: 'refresh token near 7 days' };
    if (Date.now() < tok.access_expires_at - 120_000) return { access_token: tok.access_token };
    await this.exchange({ grant_type: 'refresh_token', refresh_token: tok.refresh_token });
    return { access_token: (await this.state.storage.get('tok')).access_token };
  }
}
```

Rules encoded above: one place refreshes (one valid refresh token at a time, Schwabdev #40); proactive re-login before day 7 (schwab-py); no retry storms after a failed exchange (Wealth-Lab 12375); the refresh response may or may not rotate `refresh_token` (conflicting sources, section 1.4) so both cases are handled.

### B.2 Chain fetch and parse

```js
async function spxChain(token, { strikeCount = 30, days = 7 } = {}) {
  const today = new Date(); const to = new Date(today.getTime() + days * 86400000);
  const iso = d => d.toISOString().slice(0, 10);
  const q = new URLSearchParams({ symbol: '$SPX', contractType: 'ALL', strikeCount, includeUnderlyingQuote: 'true', fromDate: iso(today), toDate: iso(to) });
  const r = await fetch(`https://api.schwabapi.com/marketdata/v1/chains?${q}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (r.status === 429) throw Object.assign(new Error('rate limited'), { retryAfter: r.headers.get('Retry-After') });
  if (!r.ok) throw new Error(`chains ${r.status}`);
  const j = await r.json();
  const out = { isDelayed: j.isDelayed, truncated: j.isChainTruncated, n: j.numberOfContracts, underlying: j.underlyingPrice, contracts: [] };
  for (const [side, map] of [['CALL', j.callExpDateMap], ['PUT', j.putExpDateMap]]) {
    for (const [expKey, strikes] of Object.entries(map || {})) {
      const [expDate, dte] = expKey.split(':');            // "2026-11-06:0"
      for (const [strikeStr, arr] of Object.entries(strikes)) {
        for (const c of arr) out.contracts.push({
          side, expDate, dte: Number(dte), strike: Number(strikeStr),
          root: c.optionRoot, expType: c.expirationType, settle: c.settlementType,
          symbol: c.symbol,
          bid: c.bid ?? c.bidPrice, ask: c.ask ?? c.askPrice, last: c.last ?? c.lastPrice, mark: c.mark ?? c.markPrice,
          bidSize: c.bidSize, askSize: c.askSize, vol: c.totalVolume, oi: c.openInterest,
          iv: c.volatility, delta: c.delta, gamma: c.gamma, theta: c.theta, vega: c.vega, rho: c.rho,
          quoteTs: c.quoteTimeInLong, tradeTs: c.tradeTimeInLong,
          itm: c.inTheMoney ?? c.isInTheMoney, nonStd: c.nonStandard ?? c.isNonStandard,
        });
      }
    }
  }
  return out;
}
```

### B.3 Market-hours gate

```js
async function sessionToday(token) {
  const d = new Date().toISOString().slice(0, 10);
  const r = await fetch(`https://api.schwabapi.com/marketdata/v1/markets?markets=equity,option&date=${d}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  const eq = j.equity?.EQ ?? j.equity?.equity;      // closed days use the generic inner key
  const ind = j.option?.IND ?? j.option?.option;
  return {
    equityOpen: !!eq?.isOpen, indexOptionOpen: !!ind?.isOpen,
    rth: eq?.sessionHours?.regularMarket?.[0],       // {start, end} ISO with -04:00/-05:00
    indexClose: ind?.sessionHours?.regularMarket?.[0]?.end, // expect 16:15 ET, 13:15 on half days (verify)
  };
}
```

### B.4 Streamer login frame (only after Accounts and Trading Production is enabled)

```js
async function openStream(token, prefs /* GET /trader/v1/userPreference */) {
  const si = prefs.streamerInfo[0];
  const resp = await fetch(si.streamerSocketUrl, { headers: { Upgrade: 'websocket' } });
  const ws = resp.webSocket; if (!ws) throw new Error('no websocket'); ws.accept();
  const login = { service: 'ADMIN', requestid: '0', command: 'LOGIN',
    SchwabClientCustomerId: si.schwabClientCustomerId, SchwabClientCorrelId: si.schwabClientCorrelId,
    parameters: { Authorization: token, SchwabClientChannel: si.schwabClientChannel, SchwabClientFunctionId: si.schwabClientFunctionId } };
  ws.send(JSON.stringify({ requests: [login] }));
  const subs = { service: 'LEVELONE_OPTIONS', requestid: '1', command: 'SUBS',
    SchwabClientCustomerId: si.schwabClientCustomerId, SchwabClientCorrelId: si.schwabClientCorrelId,
    parameters: { keys: 'SPXW  261106C06900000,SPXW  261106P06900000', fields: '0,2,3,4,8,9,10,16,17,28,29,30,31,32,35,37,38,39,43,49' } };
  ws.send(JSON.stringify({ requests: [subs] }));   // send within ~30 s or Schwab closes the socket
  return ws;
}
```

## 10. Appendix C: day-one empirical verification checklist

Each line turns an UNVERIFIED/INFERRED item above into a concrete test to run with the first valid token.

| # | Test | What to record | Memo section |
|---|---|---|---|
| 1 | `GET /quotes?symbols=$SPX,SPY,$VIX,/ES` | `realtime` per symbol; whether `$VIX` and `/ES` resolve; `tradeTime` digit count | 2.2, 2.10 |
| 2 | `GET /expirationchain?symbol=$SPX` | `optionRoots`, `expirationType`, `settlementType`, `standard` per date; is the third Friday listed twice (SPX + SPXW)? | 2.5, 2.6 |
| 3 | `GET /chains?symbol=$SPX&strikeCount=5&fromDate=<today>&toDate=<today>` | `isDelayed`, `numberOfContracts`, `isChainTruncated`, byte size, which `optionRoot`s appear, exact key names (`bid` vs `bidPrice`), `quoteTimeInLong` digit count | 2.4, 3 |
| 4 | Same with `strikeCount=30&toDate=<today+7>` | byte size and latency → set polling cadence | 3 |
| 5 | `GET /pricehistory?symbol=$SPX&periodType=day&period=10&frequencyType=minute&frequency=1&needExtendedHoursData=true&endDate=<now ms>` | earliest `datetime`; whether bars exist outside 09:30–16:15 ET; whether today's partial bars are present | 2.7 |
| 6 | Repeat test 5 with `startDate` = 60 days ago | the true 1-minute lookback for `$SPX`; then for SPY | 2.7 |
| 7 | `GET /markets?markets=equity,option&date=<next holiday>` and `<next half day>` | closed-day shape; half-day `regularMarket.end` for `EQ` and `IND` | 2.8 |
| 8 | `GET /trader/v1/userPreference` with Market-Data-only app | expect 401 "Client not authorized"; record the exact body | 4.1, 7 |
| 9 | Wait 31 minutes, call `/quotes` | confirm 401 on expired access token; then refresh; inspect whether the refresh response contains a new `refresh_token` | 1.4 |
| 10 | Fire 130 `/quotes` calls in 60 s (once, off-hours) | the 429 body, any `Retry-After`, any sub-code like `429-001` | 3 |
| 11 | Log every 401 with timestamp for two weeks | does a midnight-aligned pattern exist at all? | 6.5 |
| 12 | After-hours `/chains` for today's expiration | whether greeks are `0`, `NaN`, `-999`, or stale | 6.11 |
| 13 | (If streaming) open a second socket while one is live | which one dies, and with which code (12/30/close) | 4.4 |
| 14 | (If streaming) leave the DO socket idle with an alarm every 60 s | time until the first unexpected close; whether alarms alone keep it alive past 15 min | 4.5 |

## 11. Appendix D: error → likely cause → action

| Symptom | Likely cause | Action | Source |
|---|---|---|---|
| Login page loops back to login; no redirect | callback URL mismatch (case/slash/port), app still "Approved - Pending", or (one report) only Market Data Production enabled | compare byte-for-byte with portal; check "View Details" status; consider adding Accounts and Trading | [Schwabdev #53](https://github.com/tylerebowers/Schwabdev/issues/53) |
| "Access Denied" page after sign-in | trailing slash in callback URL | remove slash in both portal and `redirect_uri` | [Schwabdev troubleshooting](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) |
| HTTP 500 "We are unable to complete your request" / Whitelabel error | app "Approved - Pending" or unsupported account type | wait for "Ready For Use"; email traderapi@schwab.com | same |
| token endpoint 400 after pasting URL | code expired (~30 s), code mangled by manual copy, `redirect_uri` mismatch | re-run login; paste full URL; decode once | [Schwabdev tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py) |
| 400 `unsupported_token_type` / `refresh_token_authentication_error` on refresh | refresh token invalidated by a newer login elsewhere | delete stored token; log in again; run one instance only | [Schwabdev #40](https://github.com/tylerebowers/Schwabdev/issues/40) |
| `invalid_client` on refresh | refresh token older than 7 days | human re-login | [schwab-py auth docs](https://schwab-py.readthedocs.io/en/latest/auth.html) |
| 401 "Client not authorized" on `/trader/v1/*` | API product not on the app | add Accounts and Trading Production (re-review) | [Schwabdev troubleshooting](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) |
| 401 on `/marketdata/v1/*` with a token < 30 min old | Schwab invalidated tokens after a backend change | force one access-token refresh, retry once | same |
| 404 on a symbol | missing `$` for index, bad option padding, wrong futures format | fix format; confirm symbol exists in thinkorswim | same |
| 429 | > 120 requests/min | back off ≥ 60 s; honour `Retry-After` | [Lumibot](https://lumibot.lumiwealth.com/brokers.schwab.html), [Schwabdev api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md) |
| Huge/failed `$SPX` chain response | no `strikeCount`/date filters | add filters | [Schwabdev troubleshooting](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) |
| Stream closes ~30 s after login | no subscription sent | send `SUBS` immediately after login response | [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) |
| Stream code 3 on LOGIN | bad/expired access token or streamerInfo | refresh token, refetch `userPreference`, reconnect | [schwab-sdk protocol.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/streamer/protocol.rs) |
| Stream code 19 | > 500 keys | trim subscription | [Schwabdev stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md) |
| Stream code 12 / 30 or abrupt close | Schwab closing the connection (second connection opened, maintenance) | reconnect with backoff; ensure a single DO instance | [schwab-sdk protocol.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/streamer/protocol.rs), [r/algotrading mirror](https://reddit.sentinel-team.org/posts/1tdj6o1/snapshots/2026-05-15T19%3A02%3A50.96329Z) |
| Movers endpoint empty | called outside market hours | ignore outside RTH | [Schwabdev client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py) |


## 12. Source index (all accessed 2026-11-06)

- schwab-py docs: [auth](https://schwab-py.readthedocs.io/en/latest/auth.html), [getting started](https://schwab-py.readthedocs.io/en/latest/getting-started.html), [getting-started.rst](https://schwab-py.readthedocs.io/en/latest/_sources/getting-started.rst.txt), [client](https://schwab-py.readthedocs.io/en/latest/client.html), [streaming](https://schwab-py.readthedocs.io/en/latest/streaming.html), [tda-transition](https://schwab-py.readthedocs.io/en/latest/tda-transition.html), [help](https://schwab-py.readthedocs.io/en/latest/help.html)
- schwab-py source: [auth.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/auth.py), [client/base.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/client/base.py), [streaming.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/streaming.py), [orders/options.py](https://raw.githubusercontent.com/alexgolec/schwab-py/main/schwab/orders/options.py); issues [#148](https://github.com/alexgolec/schwab-py/issues/148), [#190](https://github.com/alexgolec/schwab-py/issues/190), [#222](https://github.com/alexgolec/schwab-py/issues/222)
- Schwabdev: [README](https://github.com/tylerebowers/Schwabdev), [setup guide](https://tylerebowers.github.io/Schwabdev/pages/setupguide.html), [troubleshooting](https://tylerebowers.github.io/Schwabdev/pages/troubleshooting.html) / [raw](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md), [api.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/api.md), [stream.md](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/stream.md), [tokens.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/tokens.py), [stream.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/stream.py), [client.py](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/schwabdev/client.py), [docs index](https://docsearch.algolia.com/mcp/docs/repo/tylerebowers/schwabdev); issues [#24](https://github.com/tylerebowers/Schwabdev/issues/24), [#29](https://github.com/tylerebowers/Schwabdev/issues/29), [#40](https://github.com/tylerebowers/Schwabdev/issues/40), [#48](https://github.com/tylerebowers/Schwabdev/issues/48), [#53](https://github.com/tylerebowers/Schwabdev/issues/53), [#66](https://github.com/tylerebowers/Schwabdev/issues/66)
- Real-response fixtures (Rust `schwab_api` crate): [QuoteResponse_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse_real.json), [IndexResponse.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/QuoteResponse/IndexResponse.json), [Markets_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/Markets_real.json), [ExpirationChain_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/ExpirationChain_real.json), [CandleList.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/CandleList.json), [OptionChain.json (spec template)](https://docs.rs/crate/schwab_api/latest/source/tests/model/MarketData/OptionChain.json), [UserPreferences_real.json](https://docs.rs/crate/schwab_api/latest/source/tests/model/Trader/UserPreferences_real.json); [schwab-sdk protocol.rs](https://docs.rs/crate/schwab-sdk/latest/source/src/streamer/protocol.rs); [yash101 TypeScript types](https://app.unpkg.com/@yash101/schwab-api-client@1.0.7/files/dist/api-types/dataapi.types.d.ts)
- Community / vendors: [Lumibot Schwab](https://lumibot.lumiwealth.com/brokers.schwab.html), [TradersPost](https://blog.traderspost.io/article/thinkorswim-api), [Wealth-Lab extension](https://wealth-lab.com/extension/detail/Schwab), [Wealth-Lab 11565](https://wealth-lab.com/Discussion/Schwab-broker-extension-Beta-release-11565), [Wealth-Lab 12375](https://wealth-lab.com/Discussion/12375), [Wealth-Lab 12424](https://wealth-lab.com/Discussion/How-to-configure-Schwab-extension-12424), [Wealth-Lab 11228](https://wealth-lab.com/Discussion/Support-of-TDA-Schwab-options-functionality-11228), [Nango](https://nango.dev/docs/api-integrations/schwab/how-to-register-your-own-schwab-oauth-app), [Elite Trader](https://elitetrader.com/et/threads/question-about-schwab-api-redirect-uri-setup.385957), [r/algotrading mirror](https://reddit.sentinel-team.org/posts/1tdj6o1/snapshots/2026-05-15T19%3A02%3A50.96329Z), [r/options mirror (snippet only)](https://lr.sudovanilla.org/r/options/comments/1frtqwy/spx_on_tos_v_schwab), [schwabr price history](https://www.rdocumentation.org/packages/schwabr/versions/0.1.4/topics/schwab_priceHistory), [usethinkscript (snippet only)](https://usethinkscript.com/threads/accessing-historical-ticker-and-options-data-through-the-tos-schwab-api.22667/), [dp_exchange_schwab (snippet only)](https://repo.hex.pm/preview/dp_exchange_schwab/0.1.5/usage-rules.md)
- Cloudflare: [DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [changelog 2026-06-19](https://developers.cloudflare.com/changelog/post/2026-06-19-outbound-connections-keep-dos-alive/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [DO alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [WebSocket examples](https://developers.cloudflare.com/workers/examples/websockets/), [WebSockets runtime](https://developers.cloudflare.com/workers/runtime-apis/websockets/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- Schwab official (login-walled SPA; only shell retrieved): [developer portal](https://developer.schwab.com/), [Trader API - Individual](https://developer.schwab.com/products/trader-api--individual), [terms of use](https://developer.schwab.com/terms-of-use); API hosts probed: [authorize](https://api.schwabapi.com/v1/oauth/authorize), [marketdata quotes](https://api.schwabapi.com/marketdata/v1/quotes?symbols=SPY)

---

## Implementation consequences

1. **Auth component (Worker + Durable Object or KV for the token).**
   - Store `{access_token, refresh_token, access_expires_at, refresh_issued_at}` in one place (a singleton DO or KV with a lock); refresh the access token when < 2 minutes remain; treat the refresh token as dead at `refresh_issued_at + 7d` (schwab-py uses 6.5 d proactively). Sources: sections 1.1, 1.4.
   - Never run two instances that refresh independently; a second login invalidates the first refresh token (Schwabdev #40).
   - Provide a private "re-login" page that (a) builds the authorize URL with `client_id`, `redirect_uri=https://127.0.0.1:8182`, `response_type=code`, `state`, (b) accepts the full pasted redirect URL, (c) extracts `code` with `new URL(...).searchParams.get('code')` (decodes `%40`), (d) exchanges within seconds (code expires ~30 s), with `redirect_uri` byte-identical to the registered value. Sources: sections 1.1, 1.3, 1.7.
   - Keep `https://127.0.0.1:8182` as the callback for now: switching to `https://<worker>.workers.dev/callback` is allowed in principle but triggers re-approval (days). If you later switch, protect the endpoint with a one-shot `state` and an allowlist (schwab-py's warning). Sources: sections 1.5, 1.6.
   - Weekly human login is unavoidable; put a reminder on the weekend and show a countdown in the UI. Do not script the browser (ban risk, Schwabdev #66).
   - On 401: one forced access-token refresh + retry; on a second 401 stop and alert (avoid the "thousands of invalid token requests" warning). Section 3.
2. **REST data layer.**
   - Headers: `Authorization: Bearer …`, `Accept: application/json`. Base `https://api.schwabapi.com/marketdata/v1`.
   - Chains: `?symbol=$SPX&contractType=ALL&strikeCount=30&fromDate=<today>&toDate=<today+7>&includeUnderlyingQuote=true`; parse `callExpDateMap`/`putExpDateMap` keys by splitting on `:`; read `bid, ask, last, mark, bidSize, askSize, totalVolume, openInterest, volatility, delta, gamma, theta, vega, rho, quoteTimeInLong, tradeTimeInLong, expirationType, settlementType, optionRoot, daysToExpiration, inTheMoney, nonStandard`; fall back to `bidPrice`/`isInTheMoney` names if present; log `isDelayed`, `isChainTruncated`, `numberOfContracts`. Section 2.3–2.5.
   - On first run, call `/expirationchain?symbol=$SPX` and record `optionRoots`/`standard`/`settlementType` per date to confirm SPX vs SPXW coverage; for SPY the root is `SPY` only. Section 2.6.
   - Quotes: `/quotes?symbols=$SPX,SPY,$VIX,/ES&fields=quote` (verify `$VIX` and `/ES` on first call — `$VIX` is by analogy only). Index entries have no bid/ask; `realtime` must be `true` before trusting a price. Section 2.2, 2.10.
   - Price history: `/pricehistory?symbol=$SPX&periodType=day&period=10&frequencyType=minute&frequency=1&endDate=<now ms>&needExtendedHoursData=false` for backfill; trim to your window client-side; probe the 1-minute lookback empirically (expect ~30–48 days) and persist bars daily in D1/R2, because Schwab keeps none for options and limited history for minutes. Section 2.7.
   - Market hours: once per day `/markets?markets=equity,option&date=<today>`; derive `isOpen`, equity `regularMarket`, and index-option close (`option.IND...end`, normally 16:15 ET, `13:15` on half days — verify) to gate polling and 0DTE logic; handle the closed-day shape where the inner key is `equity`/`option` and `sessionHours` is absent. Section 2.8.
   - Budget: ≤ ~90 requests/min sustained (cap is 120/min, HTTP 429 with possible `Retry-After`); back off 60 s on 429. Section 3.
   - Timestamps everywhere are epoch milliseconds; build them from UTC.
3. **Streaming (only if/after Accounts and Trading Production is added).**
   - One DO singleton holds the socket; alarm every 30–60 s; re-dial on close with exponential backoff (2 s → 120 s); re-send `SUBS` for all keys (SUBS replaces); fields `"0,2,3,4,8,9,10,16,17,28,29,30,31,32,37,38,39,43,49"` for LEVELONE_OPTIONS; merge deltas into the last snapshot; persist snapshot to storage. Expect reconnects at ≤ 15-minute intervals when nothing inbound touches the DO. Sections 4.2–4.5.
   - Keep REST polling as the fallback path; the stream improves latency but is not required for a 5–10 s decision loop.
4. **Data retention.** Keep what you store private and single-user; do not expose quotes or chains to other people. Section 5 (terms not readable; conservative interpretation).
5. **Observability.** Log `realtime`/`isDelayed`, HTTP status, `numberOfContracts`, response size, and token ages; alert on 401/429 and on refresh-token age > 6 days.

## What the user must do in the Schwab developer portal

1. Decide whether streaming/positions are needed.
   - If **no**: keep the app as is (Market Data Production, Ready For Use, callback `https://127.0.0.1:8182`). Nothing to change. Verify by calling `GET /marketdata/v1/quotes?symbols=$SPX` with a fresh token and checking `realtime: true`.
   - If **yes**: Dashboard → Apps → View Details → **Modify App** → APIs → add **Accounts and Trading Production** (keep Market Data Production). Expect the status to show "Approved - Pending" for ~1–5 days (one report: next day); the app may not authenticate during that time, so do it at a quiet time (e.g. a weekend). Check status via "View Details" (the dashboard status lags). Do not create a second app. Sources: sections 1.6, 7.
2. Leave the callback URL as `https://127.0.0.1:8182` (no trailing slash, lowercase `https`). Only change it to a Worker URL if you accept another multi-day re-approval; if you do, enter it exactly, ≤ 256 chars, HTTPS, and update `redirect_uri` in the Worker to the byte-identical string. Section 1.5–1.6.
3. Order Limit: leave at 120; it only governs order place/cancel/replace calls, which this tool does not make. Section 3.
4. Confirm the app status reads **Ready For Use** on the "View Details" page before each re-login attempt; "Approved - Pending" produces 401/"Session rejected"/HTTP 500 pages. Section 1.6.
5. On the brokerage side (schwab.com / thinkorswim), make sure thinkorswim is enabled and the exchange market-data agreements are accepted so that quotes come back `realtime: true` (Schwabdev recommends TOS enablement; entitlement follows the account). Section 2.10.
6. Perform the OAuth login in a browser each week: open the authorize URL, log in, accept the terms, select the account(s), copy the full `https://127.0.0.1:8182/?code=...&...` URL from the address bar (the page itself will show a connection error) and paste it into the Worker's private re-login page within ~30 seconds. Section 1.7.
7. Keep the App Key/Secret in Worker secrets (`wrangler secret put`); never in the repo. If a second machine or script ever logs in with the same app, the Worker's refresh token dies immediately (Schwabdev #40).
8. If anything in the portal misbehaves (cannot modify app, stuck pending beyond a week), email `traderapi@schwab.com` as both libraries advise [schwab-py getting started](https://schwab-py.readthedocs.io/en/latest/getting-started.html); [Schwabdev troubleshooting (raw)](https://raw.githubusercontent.com/tylerebowers/Schwabdev/main/docs/pages-raw/troubleshooting.md) (accessed 2026-11-06).
