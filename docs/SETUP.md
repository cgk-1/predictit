# Setup and deployment

This document is the exact, current path from a fresh clone to a private, authenticated deployment on Cloudflare,
plus what you must do in the Schwab developer portal. Nothing here needs a desktop terminal once the first deploy
exists: Schwab connection and credential fixes are done in the app's Settings page.

## 1. What is deployed today

| Item | Value |
|---|---|
| Worker | `predictit` on `https://predictit.<your-subdomain>.workers.dev` |
| Auth | Server-enforced on every request: Cloudflare Access JWT (when configured) **or** the fallback passphrase login (HMAC-signed, HttpOnly, SameSite=Strict cookie, rate-limited in a Durable Object). If neither is configured the Worker refuses to serve (HTTP 503). |
| State | Durable Object `MarketSession` (SQLite): snapshots, decision ledger (SPX and SPY), positions, change feed, prediction ledger, grades, ensemble weights, closing learner, Schwab tokens, Discord webhook (write-only) |
| Alerts | Tab-title prefix always; per-browser notification and beep; Discord webhook (Settings → Alerts), one line per setup change |
| Config | KV `predictit-config` (reserved), R2 bucket `predictit-archive` (nightly archive of snapshots and decisions) |
| Cron | `* * * * *` watchdog that re-arms the poll loop |
| Data | Schwab Market Data (LIVE) when connected: SPX, SPY, TICK, VIX, NDX, RUT, DJI, QQQ, IWM, RSP quotes, SPX and SPY chains, minute history; otherwise Cboe delayed JSON (DELAYED, 15 min, SPX only). No demo data exists. |

## 2. Cloudflare plan

The account is on **Workers Paid** ($5/month) and `apps/worker/wrangler.jsonc` sets `"limits": { "cpu_ms": 30000 }`. A LIVE tick (two chains, GEX across ~10k contracts, two instruments, ranking) measures ~0.4–1 s of CPU; the Free plan's 10 ms limit would not carry a market-hours loop. Paid also raises the Durable Object storage and request limits used by the snapshot store.

## 3. Deploy from a machine with the repo

```bash
pnpm install
pnpm -r typecheck && pnpm -r test
pnpm --filter @predictit/web build
cd apps/worker
export CLOUDFLARE_API_TOKEN=...   # token with Workers Scripts Edit, KV Edit, R2 Edit, Account Settings Read
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler deploy
```

Secrets (never in the repo; set once, rotate any time):

```bash
openssl rand -base64 32 | npx wrangler secret put GATE_PASSPHRASE     # or choose your own passphrase
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
npx wrangler secret put SCHWAB_CLIENT_ID      # optional: can also be entered in Settings → Schwab
npx wrangler secret put SCHWAB_CLIENT_SECRET  # optional: same
npx wrangler secret put ANTHROPIC_API_KEY     # optional: enables the "Explain" button (narration only)
```

`.dev.vars.example` lists the same names for local `wrangler dev`. Secrets can equally be set in the dashboard
(Workers & Pages → predictit → Settings → Variables and Secrets); `keep_vars: true` in `wrangler.jsonc` keeps
dashboard-set values across `wrangler deploy` (without it a deploy silently drops them).

## 4. Cloudflare Access (recommended, one-time dashboard step)

Access is not enabled on the account yet (the API returns "Access is not enabled"). Steps:

1. `one.dash.cloudflare.com` → choose a **team name** (Zero Trust Free plan, 50 users; payment details are requested but $0).
2. Zero Trust → Settings → Authentication → add **One-time PIN** as a login method.
3. Workers & Pages → `predictit` → Settings/Access → **Protect this Worker behind Access** (or create a self-hosted
   application for the workers.dev hostname). Policy: Allow → Emails → your address(es).
4. Copy the application's **AUD tag** and the team domain (`<team>.cloudflareaccess.com`).
5. Set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ALLOWED_EMAILS` in `wrangler.jsonc` `vars` (or via the dashboard
   variables) and redeploy. The Worker then validates the `Cf-Access-Jwt-Assertion` on every request (RS256 against
   the team JWKS, `aud`, `iss`, expiry, allowed e-mail). The passphrase login keeps working as a fallback; remove the
   `GATE_PASSPHRASE` secret to disable it.

A hard-to-guess URL, a frontend password screen or a noindex tag is not access control; this deployment enforces
authentication server-side for assets, APIs and streams alike, and refuses to serve when unconfigured.

## 5. Schwab (Market Data Production)

The developer app you showed has only **Market Data Production** enabled, callback `https://127.0.0.1:8182`.

What works with that: real-time `$SPX`, `SPY`, `$TICK` (NYSE TICK, breadth) and `$VIX` quotes, SPX/SPXW/SPXO and
SPY option chains with bid/ask/size/OI/volume/greeks, minute price history (seeds prior-day, gap and weekly
features), market hours. TICK and VIX exist only on the Schwab feed; on the Cboe delayed fallback they read n/a. Rate limit 120 requests
per minute per app; the poller uses about 20.

Connecting (no terminal needed):

1. Settings → Schwab → if `credentialSource` is empty or the key/secret deployed as secrets are wrong, paste the
   Client ID and Client Secret from the developer portal (write-only; stored in Durable Object storage, never shown).
2. Click **Connect Schwab** → log in and approve at Schwab → you land on `https://127.0.0.1:8182/?code=…&session=…`
   which the browser shows as an error page. **Within ~30 seconds** copy the full URL from the address bar and paste
   it in the box → the Worker exchanges the code for tokens.
3. The access token refreshes automatically (30 min). The **refresh token expires after 7 days** and cannot be renewed
   without a new browser login; the Settings page shows the "re-login needed by" time and the terminal falls back to
   DELAYED data when it lapses. Only one refresh token is valid per app at a time.

Optional improvements you can make in the Schwab portal (each may return the app to "Approved – Pending" for a few
days): add **Accounts and Trading Production** to enable the streaming API (`/trader/v1/userPreference` provides the
streamer connection details) and, later, position import; change the callback to
`https://predictit.<subdomain>.workers.dev/api/schwab/callback` to avoid the copy/paste step (set
`SCHWAB_REDIRECT_URI` to match).

## 6. Local development

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # fill GATE_PASSPHRASE and SESSION_SECRET
pnpm dev:web      # Vite on :5173, proxies /api to :8787
pnpm dev:worker   # wrangler dev on :8787 (serves apps/web/dist when built)
```

## 7. Budget and grading defaults

- Per-contract premium budget defaults to **$200** (ask × 100) and applies to SPX and SPY ranking and to the
  closing-window module. Each instrument is ranked on its own chain: the SPX view only ever recommends SPX/SPXW
  contracts and the SPY view only SPY contracts (no ratio-scaled equivalents). Change it in Settings → Budgets.
- Self-grading runs every minute: intraday recommendations are graded at their horizon; closing-window records at the
  close (provisional) and again when the official close is known; the ensemble scores its own predictions. Results are
  on Performance and Lean; nothing is deleted or rewritten.

## 7b. Alerts

- The tab title always carries the current action (`[SPX BUY CALL] predictit`), so a pinned tab shows state at a glance.
- Settings → Alerts: **Browser notification** (asks for permission once; this browser only, tab must stay open) and
  **Beep on change** (this browser only). Both are stored in the browser, not on the server.
- **Discord**: create a webhook in the target channel (Edit channel → Integrations → Webhooks → New webhook → Copy URL)
  and paste it in Settings → Alerts. The URL is stored in the Durable Object and never returned. A test line is posted
  on save. One line per setup change per instrument (BUY CALL / BUY PUT / MANAGE starts, and "setup off"), tagged
  LIVE or DELAYED; WAIT↔PASS flips are never sent. Remove it with the Remove button.

## 8. Operating notes

- Health: `GET /api/health` (feed status, last tick, latest snapshot times). The Today view shows feed health and the
  evaluation age; "stale" appears when the server has not evaluated for 30 s.
- Retention: snapshots are kept in the Durable Object hot store for `retentionDays` (default 3; chains/bars at most
  every 30 s, every tick in the closing window) so the in-app Replay and restart recovery work, then archived
  nightly to R2 as JSONL.gz per day and kind, and pruned. Cboe delayed snapshots are archived to R2 only when
  `archiveCboe` is on (default off; Cboe's site terms restrict long-term storage of its delayed data — your call).
- Costs: Workers Paid $5/month; R2 stays in the free tier for months at the default settings.
- Rotating secrets: re-run `wrangler secret put`; sessions sign with `SESSION_SECRET`, so rotating it logs everyone out.
