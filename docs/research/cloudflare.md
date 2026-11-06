# Cloudflare developer platform research memo — private single-user real-time trading research terminal

- Date of research: **2026-11-06**. Every claim below was read from the live page on that date; the access date is given inline as "(accessed 2026-11-06)".
- Workload under consideration: React SPA + JSON API + a poller that fetches market data every ~5–15 s during US market hours (~7 h/day, weekdays) and stores timestamped snapshots (~200 KB each), archived daily to object storage.
- Items that could not be confirmed on a Cloudflare page are marked **UNVERIFIED**.

## 0. Account facts that shape the recommendation

- Existing API token can list/edit Workers scripts, Pages projects, KV namespaces and R2 buckets, but **not D1** (auth error).
- Cloudflare Access / Zero Trust is **not enabled** ("Access is not enabled. Visit the Access dashboard and click 'Enable Access'"). This matches the documented prerequisite for Access-on-Workers: "Zero Trust enabled on your account" and "If Zero Trust is not turned on, complete Zero Trust setup first, then return to the Workers dashboard." [source](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) (accessed 2026-11-06)
- workers.dev subdomain exists; plan appears to be **Workers Free** (UNVERIFIED — check Workers & Pages → Plans in the dashboard).
- Wrangler **4.158.0** is installed. That is the exact minimum version named by the 2026-11-05 changelog entry "Automatic retries for Durable Object calls" for the `retryable()` helper and `retry` stub option. [source](https://developers.cloudflare.com/changelog/?product=workers) (accessed 2026-11-06)
- We will not use the account's existing zones, so everything below assumes the app is served only on `<name>.<subdomain>.workers.dev`.

### Headline conclusions (details and citations in the sections below)

1. **Build it as one Worker with static assets** (`assets` + `not_found_handling: "single-page-application"` + `run_worker_first: ["/api/*"]`). Pages is still supported but Cloudflare's docs and blog say to start new projects on Workers.
2. **Run the poller as a SQLite-backed Durable Object driven by alarm chaining** (`setAlarm(Date.now()+10_000)` at the end of every `alarm()`), with a 1-minute Cron Trigger as a watchdog that re-arms the alarm if it is missing.
3. **Protect the workers.dev hostname with Cloudflare Access** (Zero Trust Free plan: 50 users, $0). It is a one-time dashboard onboarding (team name + plan + payment details, not charged on Free) that cannot be skipped; after that, the Workers dashboard has a one-click "Protect this Worker behind Access" flow. Use a **hostname-based (self-hosted) Access application** rather than the Worker-level toggle if the terminal uses WebSockets, because Worker-level policies return 403 on WebSocket upgrades.
4. **Free plan is numerically fine for request and duration counts, but two documented limits make Workers Paid ($5/month minimum) the realistic choice**: the Free plan's 10 ms CPU cap per invocation (the DO FAQ says DOs have the same per-invocation CPU limits as Workers, and `limits.cpu_ms` is Paid-only), which 1–10 MB JSON parsing will exceed, and the DO SQLite storage cap on Free (5 GB per account, 1 GB per object per the FAQ), which ~500 MB/day of raw snapshots exhausts in days unless aggressively pruned. Expected monthly cost on Paid: the $5 minimum plus a few cents of R2 after several months.

---

## 1. Workers with static assets (the replacement for Pages)

### 1.1 Configuration

- Static assets are configured under the `assets` key of `wrangler.jsonc`/`wrangler.toml`. `directory` is "The assets directory specified in your Wrangler configuration file", `binding` (for example `"ASSETS"`) exposes the assets to Worker code via `env.ASSETS.fetch(request)`, `not_found_handling` takes `"single-page-application"` (returns 200 with `index.html`) or `"404-page"` (returns 404 with the nearest `404.html`), and `run_worker_first` accepts `true` or an array of route patterns such as `["/api/*", "!/api/docs/*"]`. [source](https://developers.cloudflare.com/workers/static-assets/) (accessed 2026-11-06)
- Defaults from the Wrangler configuration reference: `base_path` default `"/"`, `run_worker_first` default `false`, `html_handling` default `"auto-trailing-slash"`, `not_found_handling` default `"none"`. [source](https://developers.cloudflare.com/workers/wrangler/configuration/) (accessed 2026-11-06)
- `run_worker_first` as an array: patterns support `*` globs and `!` negation, "Negative patterns take precedence, list order doesn't matter", and the array allows at most 100 entries. Only one asset collection may be configured per Worker. Files matching `.assetsignore` (gitignore syntax) are not uploaded. [source](https://developers.cloudflare.com/workers/static-assets/binding/) (accessed 2026-11-06)
- Array form of `run_worker_first` requires Wrangler v4.20.0+ or Cloudflare Vite plugin v1.7.0+. [source](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) (accessed 2026-11-06)

Recommended config (adapted from the SPA routing page's "advanced routing" example):

```jsonc
{
  "name": "trading-terminal",
  "main": "./src/index.ts",
  "compatibility_date": "2026-11-06",
  "upload_source_maps": true,
  "assets": {
    "directory": "./dist/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/ws/*", "/events/*"]
  }
}
```

### 1.2 How API routes and the SPA fallback coexist

- Default routing order: Cloudflare "will first attempt to serve static assets if one matches the incoming request"; if none matches it "will invoke your Worker script". With `run_worker_first` the Worker runs before asset serving. [source](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) (accessed 2026-11-06)
- SPA mode: with `not_found_handling: "single-page-application"` requests that match no file get `/index.html` with 200. With a compatibility date of `2025-04-01` or later (or the `assets_navigation_prefers_asset_serving` flag) **browser navigation requests do not invoke the Worker**, while client-side `fetch("/api/...")` calls still do; the page warns that "if you navigate to `/api/date` in your browser, you will be served an HTML file." The `assets_navigation_has_no_effect` flag disables that behaviour. Explicit `run_worker_first` patterns replace the navigation-header heuristic with deterministic routing, and `not_found_handling` still applies to whatever the Worker does not handle. [source](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) (accessed 2026-11-06)
- `env.ASSETS.fetch()` accepts a `Request`, `URL` or string, applies `html_handling` and `not_found_handling`, and matches on pathname only ("Only the URL pathname is used to match assets"). [source](https://developers.cloudflare.com/workers/static-assets/binding/) (accessed 2026-11-06)
- Practical pattern for this app: put every non-asset route under `/api/*` (plus `/ws/*` and `/events/*` if you use WebSockets/SSE) in `run_worker_first`; everything else is asset-first with SPA fallback, so deep links like `/positions/AAPL` return `index.html`.

### 1.3 Billing and limits for assets and the Worker bundle

- "Requests for static assets are free and unlimited"; requests that invoke the Worker are billed under Workers pricing; storing assets has no additional cost. On the Free plan, `run_worker_first` routes always invoke the Worker and, once the free request limit is exceeded, "receive a 429 (Too Many Requests) response instead of serving static assets"; negative (`!/`) patterns are unaffected. `Range` requests return 200 with the full body (no 206). [source](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) (accessed 2026-11-06)
- Static asset limits: files per Worker version 20,000 (Free) / 100,000 (Paid); individual file size 25 MiB on both; 100 `_headers` rules; 2,100 `_redirects` total. [source](https://developers.cloudflare.com/workers/platform/limits/) (accessed 2026-11-06)
- Worker bundle size: "64 MiB" (uncompressed) on both Free and Paid — "There is no compressed size limit. Only the uncompressed bundle size counts." (The historical 3 MB/10 MB compressed limits no longer appear on the page.) [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)
- Other Free vs Paid limits that matter here: requests 100,000/day vs no limit; CPU time per HTTP request 10 ms vs 5 min (default 30 s); subrequests per request 50 vs 10,000; simultaneous outgoing connections 6 (both); memory 128 MB per isolate (both); Workers per account 100 vs 500; Cron Triggers per account 5 vs 250; environment variables 64 vs 128 per Worker (5 KB each). [source](https://developers.cloudflare.com/workers/platform/limits/) (accessed 2026-11-06)
- When the Free plan daily request limit is exceeded "Cloudflare returns Error 1027"; routes can be set to fail open (bypass the Worker) or fail closed (1027 error page). [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)

### 1.4 Is Pages deprecated?

- The Pages docs landing page now carries the notice: "Are you sure you want to use Pages?" … "Workers supports most Pages use cases and offers a broader feature set." … "It is Cloudflare's primary platform for building applications." … "Start new projects with Workers." (page last updated Aug 25, 2026). [source](https://developers.cloudflare.com/pages/) (accessed 2026-11-06)
- The announcement (April 8, 2025) says "you should start with Workers" and that "Cloudflare Pages will continue to be supported, but, going forward," … "all of our investment, optimizations, and feature work will be dedicated to improving Workers." [source](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/) (accessed 2026-11-06)
- The migration guide (last updated Oct 12, 2026) does not use the words "deprecated" or "maintenance mode"; it documents how to replace `pages_build_output_dir` with `assets.directory`, set `not_found_handling` explicitly, add `.assetsignore`, convert `functions/` via `wrangler pages functions build`, and switch to `wrangler dev`/`wrangler deploy`. [source](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) (accessed 2026-11-06)
- Conclusion: Pages is not formally deprecated, but Cloudflare's own docs tell you to start new projects on Workers. "Maintenance mode" is third-party wording, not Cloudflare's.

---

## 2. Durable Objects (DO)

### 2.1 SQLite-backed classes and migrations

- Config: `durable_objects.bindings[]` with `name` and `class_name`, plus a migration `{ "tag": "v1", "new_sqlite_classes": ["Poller"] }`. The configuration reference now labels `migrations` as legacy in favour of an `exports` form; the two are mutually exclusive. [source](https://developers.cloudflare.com/workers/wrangler/configuration/) (accessed 2026-11-06)
- "Workers Free plan: Only Durable Objects with SQLite storage backend are available." Storage type is immutable once a namespace exists; there is no in-place KV→SQLite conversion yet ("a migration path from the key-value storage backend to the SQLite storage backend will be available in the future"). [source](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) (accessed 2026-11-06)
- Example config and alarm-batching code using `new_sqlite_classes`: [source](https://developers.cloudflare.com/durable-objects/examples/alarms-api/) (accessed 2026-11-06)

### 2.2 Free-plan availability and limits

- "Durable Objects are available both on Workers Free and Workers Paid plans." Free: SQLite backend only; "Accounts on the Workers Free plan are limited to 5 GB total Durable Objects storage"; max DO classes per account 100 (Free) / 500 (Paid). [source](https://developers.cloudflare.com/durable-objects/platform/limits/index.md) (accessed 2026-11-06)
- Compute allowances — Free: **100,000 requests/day** and **13,000 GB-s duration/day**; Paid: 1 million requests/month included then $0.15/million, 400,000 GB-s/month included then $12.50/million GB-s. SQLite storage — Free: 5 million rows read/day, 100,000 rows written/day, 5 GB stored total; Paid: 25 billion rows read/month then $0.001/million, 50 million rows written/month then $1.00/million, 5 GB-month included then $0.20/GB-month. Storage billing for SQLite DOs "starts with a billing target date of January 7, 2026". Daily limits reset at 00:00 UTC and "If you exceed any free limit, further operations of that type fail with an error." [source](https://developers.cloudflare.com/durable-objects/platform/pricing/) (accessed 2026-11-06)
- Per-object storage: the limits table lists 10 GB per SQLite-backed object; the FAQ says "10 GB on Workers Paid, or 1 GB on the Free plan". Treat **1 GB/object on Free** as the operative number (the two pages are inconsistent; UNVERIFIED which one is enforced). [source](https://developers.cloudflare.com/durable-objects/reference/faq/index.md) (accessed 2026-11-06), [source](https://developers.cloudflare.com/durable-objects/platform/limits/) (accessed 2026-11-06)
- SQL limits: 100 columns per table; unlimited rows (subject to per-object storage); max string/BLOB/row size 2 MB; max statement length 100 KB; 100 bound parameters per query; key+value ≤ 2 MB for the KV API. Requests per second: soft limit of 1,000 per object. Outgoing connections per request: 6. Received WebSocket message max 32 MiB. [source](https://developers.cloudflare.com/durable-objects/platform/limits/) (accessed 2026-11-06)
- Outbound `fetch()` request bodies from a DO are capped at 100 MiB by default. [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)

### 2.3 CPU, wall-clock and subrequest limits inside a DO

- DO limits table: CPU per request "30 seconds (default) / configurable to 5 minutes of active CPU time" via `limits.cpu_ms`; each incoming request/WebSocket message resets the budget; I/O wait does not count. [source](https://developers.cloudflare.com/durable-objects/platform/limits/) (accessed 2026-11-06)
- But the FAQ says "Durable Objects are Worker scripts, and have the same per invocation CPU limits as any Workers do", and the Workers limits page says Free = 10 ms CPU per invocation and "On the Workers Paid plan, you can increase the maximum CPU time from the default 30 seconds to 5 minutes (300,000 ms)". Exceeding CPU returns Error 1102 "Worker exceeded resource limits". **Reading the three pages together: on Free, plan for 10 ms CPU per DO invocation; 30 s default / 5 min max is a Paid-plan property.** (Whether DO alarms on Free actually get more than 10 ms is UNVERIFIED — no page states a DO-specific Free CPU figure.) [source](https://developers.cloudflare.com/durable-objects/reference/faq/index.md) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)
- `limits.cpu_ms` config: "The maximum CPU time allowed per invocation, in milliseconds", maximum 300,000; "Limits apply only to the Standard Usage Model" (the Paid model) and are not enforced locally. Example: `"limits": { "cpu_ms": 100, "subrequests": 150 }`; `subrequests` defaults to 50 on free accounts and 10,000 on paid accounts. [source](https://developers.cloudflare.com/workers/wrangler/configuration/) (accessed 2026-11-06)
- Wall clock: "Alarm handler invocations have a maximum wall time of 15 minutes." DO HTTP/RPC requests have "No hard limit while the caller stays connected"; "Durable Objects remain active while a request, RPC call, response stream, WebSocket, or pending I/O is in flight." [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)
- Subrequests per invocation: 50 on Free, 10,000 on Paid ("10,000 (up to 10M)"), and six connections "simultaneously waiting for response headers". [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)
- Memory: 128 MB per isolate; exceeding it lets in-flight requests complete and creates a new isolate; also Error 1102. Relevant because a 10 MB JSON document parsed into objects can occupy several times its size. [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)

### 2.4 Alarms API

- Signatures: `setAlarm(scheduledTimeMs: number): void` (ms since UNIX epoch; "If you call setAlarm when there is already one scheduled, it will override the existing alarm"), `getAlarm(): number | null` (returns `null` while inside a running `alarm()` unless `setAlarm` was called again), `deleteAlarm(): void`. "Each Durable Object is able to schedule a single alarm at a time by calling setAlarm()" and "Only one instance of alarm() will ever run at a given time per Durable Object instance." [source](https://developers.cloudflare.com/durable-objects/api/alarms/) (accessed 2026-11-06)
- Retries: "Alarms have guaranteed at-least-once execution and are retried automatically when the alarm() handler throws." "Retries are performed using exponential backoff starting at a 2 second delay" … "with up to 6 retries allowed." `alarm(alarmInfo)` exposes `retryCount` and `isRetry`. Calling `deleteAlarm()` inside the handler "may prevent retries on a best-effort basis, but is not guaranteed." The page recommends catching exceptions and scheduling a new alarm before returning so a persistent failure does not exhaust the retry budget. [source](https://developers.cloudflare.com/durable-objects/api/alarms/index.md) (accessed 2026-11-06)
- `ctx.abort()` during an alarm retries the alarm by default; pass `{ retryAlarm: false }` to stop it (Wrangler 4.126.0+ for local dev). "Alarms can run concurrently with other requests to the same Durable Object." (changelog, August 25, 2026) [source](https://developers.cloudflare.com/changelog/post/2026-08-25-durable-object-alarm-abort-no-retry/) (accessed 2026-11-06)
- Billing: "Alarm invocations count toward requests. Each setAlarm() call is billed as one row written (SQLite)". [source](https://developers.cloudflare.com/durable-objects/platform/pricing/) (accessed 2026-11-06)
- **UNVERIFIED**: the docs state no scheduling precision, no minimum interval, and no behaviour for a time in the past (community reports say a past time fires as soon as it is persisted). No page states that alarms are unavailable on Free; the pricing page's Free column explicitly counts alarm invocations, so they are available.
- The DO alarm example page confirms the pattern "The alarm() handler will be called once every 10 seconds" and "If an unexpected error terminates the Durable Object, the alarm() handler will be re-instantiated on another machine." [source](https://developers.cloudflare.com/durable-objects/examples/alarms-api/) (accessed 2026-11-06)

### 2.5 Lifecycle, eviction and hibernation

- A DO hibernates "after 10 seconds of inactivity" only when: no `setTimeout`/`setInterval` callbacks are scheduled; no I/O, `ctx.waitUntil()` promise or outbound connection is open; no standard-API WebSocket is in use; no request/event is in flight. In-memory state is discarded on hibernation; the constructor re-runs on wake. An object that is idle but not hibernatable is evicted after **70–140 seconds** of inactivity. Pending I/O (service-binding requests, DO RPC, outbound `fetch()`, `waitUntil()`, timers, TCP sockets, outbound WebSockets) blocks eviction "until it completes or for up to 15 minutes from its start". No shutdown hooks exist; write state incrementally. [source](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) (accessed 2026-11-06)
- "in-memory state is not preserved across eviction or hibernation"; load state in the constructor inside `blockConcurrencyWhile()`; avoid globals. [source](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/) (accessed 2026-11-06)
- Duration billing: wall-clock time while "actively running, or idle in memory but unable to hibernate"; idle-and-hibernatable time is not billed "even before the runtime actually hibernates them"; each object is billed for 128 MB; pending I/O can keep an object billed for up to 15 minutes. [source](https://developers.cloudflare.com/durable-objects/platform/pricing/) (accessed 2026-11-06)

### 2.6 WebSocket Hibernation API (inbound) and outbound WebSockets

- `this.ctx.acceptWebSocket(server)` lets the object hibernate; handlers `webSocketMessage(ws, message)` and `webSocketClose(ws, code, reason, wasClean)`; "Billable Duration (GB-s) charges do not accrue during hibernation"; clients stay connected across hibernation. `serializeAttachment()` survives hibernation (max 16,384 bytes). Alarms, incoming requests, `setTimeout`/`setInterval` prevent hibernation while pending. [source](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (accessed 2026-11-06)
- **Outbound WebSockets:** "Hibernation is only supported when a Durable Object acts as a WebSocket server. Outgoing WebSockets do not hibernate." and "an open outbound WebSocket connection prevents eviction for up to 15 minutes." [source](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (accessed 2026-11-06)
- Combined with the lifecycle rule above ("until it completes or for up to 15 minutes from its start"), a DO holding a long-lived outbound broker stream is (a) billed for duration the whole time it is open and (b) may be evicted after 15 minutes regardless, dropping the socket. Design: reconnect on constructor/alarm wake, persist the last-seen sequence number, and treat the stream as best-effort over the 10 s REST poll. [source](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) (accessed 2026-11-06)
- Client-side WebSockets from Workers: `new WebSocket(url)` or `fetch()` with `Upgrade: websocket` then `resp.webSocket.accept()`; received messages are limited to 32 MiB (close code 1009 above that). [source](https://developers.cloudflare.com/workers/runtime-apis/websockets/) (accessed 2026-11-06). Outbound WebSockets count toward the six-connection limit. [source](https://developers.cloudflare.com/workers/platform/limits/) (accessed 2026-11-06)
- Pricing nuance: `ws.accept()` (standard API) "incurs duration charges for the entire connection"; the Hibernation API avoids this once handlers finish; incoming messages are billed at 20:1. [source](https://developers.cloudflare.com/durable-objects/platform/pricing/) (accessed 2026-11-06)

### 2.7 Storage API notes used in the architecture

- `ctx.storage.sql.exec(query, ...bindings)` returns a cursor (`toArray()`, `one()`); multiple semicolon-separated statements allowed; use `transactionSync` for synchronous transactions; `ctx.storage.sql.databaseSize` gives bytes; writes without an intervening `await` are coalesced and committed atomically; `sync()` waits for durability. Point-in-time recovery to any point in the past 30 days via `getBookmarkForTime()` + `onNextSessionRestoreBookmark()` + `ctx.abort()`. Synchronous `ctx.storage.kv` (`get/put/delete/list`) is stored in a hidden `__cf_kv` table. [source](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) (accessed 2026-11-06)
- Automatic retries of DO stub calls (changelog Nov 5, 2026; Wrangler 4.158.0+): the runtime retries `fetch()`/RPC calls that never reached the object or whose connection dropped — five attempts total, "No retry starts more than 10 seconds after the initial call starts"; mark idempotent methods with `retryable()`; per-stub `retry: { maxRetries 0–10 (default 4), timeoutMs 500–60000 (default 10000) }`. Errors thrown by your own DO code, `.overloaded` errors and HTTP 5xx responses are not retried. [source](https://developers.cloudflare.com/durable-objects/best-practices/automatic-retries/) (accessed 2026-11-06)

### 2.8 How to structure the poll loop (alarm chaining)

```ts
export class Poller extends DurableObject<Env> {
  async alarm(info?: { retryCount: number; isRetry: boolean }) {
    const started = Date.now();                      // time of last I/O; see §7
    try {
      if (isMarketOpen(started)) {
        const [quotes, book] = await Promise.all([fetchQuotes(), fetchBook()]); // 2–4 subrequests
        const snapshot = JSON.stringify(reduce(quotes, book));                  // keep ≪ 2 MB/row
        this.ctx.storage.sql.exec(
          "INSERT INTO snapshots (ts, body) VALUES (?, ?)", started, snapshot);
      }
    } catch (e) {
      console.error("poll failed", e);               // swallow: do NOT let retries eat the schedule
    } finally {
      const next = isMarketOpen(started) ? started + 10_000 : nextOpenMs(started);
      await this.ctx.storage.setAlarm(next);         // at-most-one pending alarm; overrides
    }
  }
  async ensureRunning() {                            // called by the watchdog cron + the API
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now());
  }
}
```

- Why `finally` re-arms: the docs recommend catching exceptions and scheduling a new alarm so the 6-retry budget is never the thing that stops the loop. [source](https://developers.cloudflare.com/durable-objects/api/alarms/) (accessed 2026-11-06)
- Cost model: each alarm = 1 DO request + 1 SQLite row write (for `setAlarm`) + your snapshot row write; duration = wall time the object is active (fetch latency + parse + write). Between alarms the object is idle and hibernatable (no timers, no open I/O), so idle time is not billed. [source](https://developers.cloudflare.com/durable-objects/platform/pricing/) (accessed 2026-11-06)
- Keep per-day data in a per-day object (ID `poller:YYYY-MM-DD`) or prune aggressively; see §8 for why.

---

## 3. Other platform services and Free-plan status

| Service | Free plan? | Key free limits (per day unless noted) | Source (accessed 2026-11-06) |
|---|---|---|---|
| Cron Triggers | Yes | 5 Cron Triggers **per account** (250 Paid); min granularity 1 min (`* * * * *` = "At every minute"); 10 ms CPU on Free; 15 min wall time; UTC; config changes take up to 15 min to propagate | [limits](https://developers.cloudflare.com/workers/platform/limits/), [cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/) |
| Workers KV | Yes | 100,000 reads, 1,000 writes (to different keys), 1,000 deletes, 1,000 list; 1 GB stored; 1 write/s per key; value ≤ 25 MiB; key ≤ 512 B; 1,000 ops per invocation; eventual consistency ("may take up to 60 seconds or more" to be visible elsewhere) | [limits](https://developers.cloudflare.com/kv/platform/limits/), [pricing](https://developers.cloudflare.com/kv/platform/pricing/), [how KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/) |
| R2 | Yes (needs an R2 subscription via checkout) | 10 GB-month Standard storage, 1 M Class A, 10 M Class B per month, egress free; then $0.015/GB-month, $4.50/M Class A, $0.36/M Class B; 1 write/s per object key; single-part upload ≤ 5 GiB | [pricing](https://developers.cloudflare.com/r2/pricing/), [limits](https://developers.cloudflare.com/r2/platform/limits/), [get started](https://developers.cloudflare.com/r2/get-started/) |
| D1 | Yes (but token lacks D1 permission) | 5 M rows read, 100 k rows written, 5 GB total, 10 databases, 500 MB max DB size on Free, 50 queries per invocation on Free | [pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Workers Analytics Engine | Yes | 100,000 data points written, 10,000 read queries per day; ≤ 20 blobs, 20 doubles, 1 index per point; 16 KB per point; 250 points per invocation; retained three months; "you will not be billed for your use" for now | [pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/), [limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/) |
| Queues | Yes | 10,000 operations/day on Free; Paid 1 M ops/month then $0.40/M | [pricing](https://developers.cloudflare.com/queues/platform/pricing/) |
| Workflows | Yes | 100,000 requests/day (shared with Workers), 10 ms CPU, 1 GB-month storage, 3,000 steps/day; step/storage billing starts Aug 10, 2026 | [pricing](https://developers.cloudflare.com/workflows/reference/pricing/) |
| Hyperdrive | Yes | 100,000 database queries/day on Free; no egress charge | [pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) |

Notes:
- **Cron as watchdog:** `triggers.crons: ["* * * * *"]` → `scheduled(controller, env, ctx)` calls `env.POLLER.getByName("main").ensureRunning()`; `controller.scheduledTime` is "The time the ScheduledEvent was scheduled to be executed in milliseconds since January 1, 1970, UTC" and `controller.cron` is the matched expression. Set `"crons": []` to disable; commenting the key out does not. [source](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/wrangler/configuration/) (accessed 2026-11-06). The cron docs do not state a plan-specific count; the Workers limits page gives 5 per account on Free. A one-minute watchdog = 1,440 scheduled invocations/day, counted against the 100,000/day Free request budget (UNVERIFIED whether cron invocations count as "requests"; assume yes).
- **KV is the wrong store for 10-second snapshots** (8,640 writes/day vs 1,000/day Free, plus eventual consistency). KV is fine for watchlists/config. "updating the same key tens or hundreds of times per second, KV will not be an ideal fit" → the docs point to Durable Objects. [source](https://developers.cloudflare.com/kv/concepts/how-kv-works/) (accessed 2026-11-06)
- **R2 requires an R2 subscription**: "a Cloudflare account with an R2 subscription" — "Complete the checkout flow to add an R2 subscription to your account." The pricing page says the free allowance "applies regardless of your Workers plan." Whether the checkout demands a card on file is UNVERIFIED (the checkout flow typically does). [source](https://developers.cloudflare.com/r2/get-started/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/r2/pricing/) (accessed 2026-11-06)
- **D1 alternative:** the token cannot create/migrate D1 databases (needs `D1 Edit`/`D1 Write`). Deploying a Worker that merely binds D1 needs only Editor on the Worker ("No separate permissions on bound resources are needed to deploy the Worker"), but `wrangler d1 create`/`migrations apply` would still need D1 permissions. Since DO SQLite already covers the hot path and R2 covers the archive, **skip D1**; if a queryable long-term store is wanted later, the owner can add D1 permissions to the token. [source](https://developers.cloudflare.com/workers/authorization/workers/) (accessed 2026-11-06)
- **Queues** are available on Free (10,000 ops/day) but not needed; the alarm loop already serialises work.
- **Workers Paid bundle:** the $5/month minimum covers "Workers, Pages Functions, Workers KV, Hyperdrive, and Durable Objects" allotments; R2, D1, Queues, Workflows are billed separately with their own free tiers. [source](https://developers.cloudflare.com/workers/platform/pricing/) (accessed 2026-11-06)

---

## 4. Cloudflare Access (Zero Trust)

### 4.1 One-time enablement

- Setup: in the Cloudflare dashboard select Zero Trust, choose a **team name** ("a unique, internal identifier for your Zero Trust organization"; it becomes `<team-name>.cloudflareaccess.com`), then "Complete your onboarding by selecting a subscription plan and entering your payment details." For the Zero Trust Free plan "this step is still needed but you will not be charged." Zero Trust dashboard: https://one.dash.cloudflare.com. [source](https://developers.cloudflare.com/cloudflare-one/setup/) (accessed 2026-11-06)
- Zero Trust Free plan: "50 users", "$0", "forever", support "Community forums + Discord"; pay-as-you-go is "$7" per "/user/month". [source](https://www.cloudflare.com/plans/sase-zero-trust.md) (accessed 2026-11-06)
- A seat is consumed when a user "perform[s] an authentication event"; one seat per user regardless of app count. [source](https://developers.cloudflare.com/cloudflare-one/identity/users/seat-management/) (accessed 2026-11-06)
- Programmatic alternative: `POST /accounts/{account_id}/access/organizations` ("Sets up a Zero Trust organization for your account or zone"; `name` and `auth_domain` optional) requires `Access: Organizations, Identity Providers, and Groups Write`. Whether this fully replaces the dashboard "Enable Access"/plan-selection step is UNVERIFIED; the dashboard route is the documented one. [source](https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/methods/create/) (accessed 2026-11-06)

### 4.2 Protecting a workers.dev hostname — three levels

- Changelog Oct 3, 2025 "One-click Cloudflare Access for Workers": "You can now enable Cloudflare Access for your workers.dev and preview URLs in a single click" from Settings → Domains & Routes ("Enable Cloudflare Access"), with "Manage Cloudflare Access" to edit authorised emails; the modal shows `POLICY_AUD` and `TEAM_DOMAIN`. [source](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) (accessed 2026-11-06)
- Changelog Aug 14, 2026 "You can now enable Access on a Worker or all Workers at once": a policy attached to the Worker itself covers every associated domain and preview URL; an account-wide "Protect all new and existing Workers by default" setting; policies live in the **Access tab** of Workers & Pages; `ctx.access.getIdentity()` returns email/name/groups; a `dev` block in `wrangler.jsonc` simulates identity locally; policies "can also be configured through the Workers API". [source](https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/) (accessed 2026-11-06)
- **Current documented dashboard flow (Worker-level):** Workers & Pages → select Worker → **Access** tab → "Protect this Worker behind Access" → choose "Previews only" or "All traffic" → pick/create an Authentication policy (options: "Cloudflare account" members, or "Email domain") → optional session duration → "Apply Access". Protecting one Worker "automatically protects every domain associated with the Worker, including its routes, Custom Domains, workers.dev hostname, and previews." Account-wide: Workers & Pages overview → "Protect all Workers" card → "Enable Access". Hierarchy: hostname/path-level "Applies first", Worker-level "Applies next", account-level "Applies last as the fallback". [source](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) (accessed 2026-11-06)
- **Hostname-level (self-hosted application) for a workers.dev hostname:** the Workers Access page explicitly gives `my-worker.example.workers.dev` as an example hostname and says to "Create the self-hosted application in Zero Trust > Access > Applications" or with `POST /accounts/{account_id}/access/apps`, entering the hostname/path as the application domain. [source](https://developers.cloudflare.com/workers/configuration/cloudflare-access/index.md) (accessed 2026-11-06). The generic self-hosted-app page, however, says "Domains must belong to an active zone in your Cloudflare account" and offers "Switch to custom input" for Cloudflare for SaaS hostnames; it does not mention workers.dev. Expect to use the custom-input path or the API for a workers.dev hostname (exact UI mechanics UNVERIFIED). [source](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/index.md) (accessed 2026-11-06)
- **API shape:** `POST /{accounts_or_zones}/{account_or_zone_id}/access/apps` (permission `Access: Apps and Policies Write`); `destinations[]` types include `public` (hostname `uri`, wildcards allowed), `worker` ("protects one Worker, including its previews", requires `worker_id`), `preview_worker`, `all_workers` and `all_preview_workers`; `session_duration` is on the policy ("300ms", "2h45m" style); policies are applied "in ascending order of precedence". [source](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/) (accessed 2026-11-06)
- **Confirmed:** Access can protect a Worker whose only route is workers.dev — the Worker-level policy explicitly lists the "workers.dev hostname", and the workers.dev routing page says "Access can protect one Worker's production workers.dev URL, preview URLs, or both." [source](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) (accessed 2026-11-06)
- **Does Access apply to all requests (API/SSE/WebSocket)?** Cloudflare "checks every HTTP request bound for that site" for a valid token/cookie, and "If a request does not include the cookie, Access will block the request." [source](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/) (accessed 2026-11-06). An SSE stream is one long-lived HTTP response, so it is authorised at request time like any other request (inference; no page discusses SSE specifically). **WebSockets:** "Worker-level Access policies do not currently support WebSocket connections." … "WebSocket upgrade requests to a Worker protected by a worker-level Access policy will fail with a 403 error." The page recommends a hostname-based application instead. [source](https://developers.cloudflare.com/workers/configuration/cloudflare-access/index.md) (accessed 2026-11-06). Whether a hostname-based self-hosted app passes WebSocket upgrades is implied by that recommendation but not stated outright (UNVERIFIED).
- **Static assets caveat:** "Workers with Static Assets execute behind an internal router Worker" and "the router does not pass ctx.access to the user Worker" — so with the recommended static-assets architecture, **validate the `Cf-Access-Jwt-Assertion` header yourself** inside `/api/*` rather than relying on `ctx.access`. [source](https://developers.cloudflare.com/workers/configuration/cloudflare-access/index.md) (accessed 2026-11-06)
- workers.dev also always runs Browser Integrity Check (cannot be disabled); some default library User-Agents get error 1010 before the Worker runs. [source](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) (accessed 2026-11-06)

### 4.3 Identity provider: One-time PIN

- "New Zero Trust organizations use the Cloudflare identity provider as their default login method." "OTP is no longer added automatically, but you can set it up at any time." Enable: Zero Trust → Integrations → Identity providers → add → One-time PIN; PIN "expires 10 minutes after the initial request"; Cloudflare "only sends the email if the user is allowed by an Access policy"; allowlist `noreply@notify.cloudflare.com` if your mail filters are strict. [source](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/) (accessed 2026-11-06)

### 4.4 Validating the JWT in the Worker

- Access sends the token in the `Cf-Access-Jwt-Assertion` request header (and the `CF_Authorization` cookie for browsers; validate the header because "the cookie is not guaranteed to be passed"). Keys: `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/certs` (`keys` JWK set, `public_cert`, `public_certs`); signing key rotates "every 6 weeks" with 7-day overlap — fetch keys dynamically and match `kid`. The Application Audience (AUD) tag is under Zero Trust → Access controls → Applications → Edit → Additional settings and "will never change unless you delete or recreate the Access application." Verify `aud` = AUD tag and `iss` = team domain. The page's Workers sample uses `jose`: `createRemoteJWKSet(new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`))` + `jwtVerify(token, JWKS, { issuer: TEAM_DOMAIN, audience: POLICY_AUD })`, with vars `POLICY_AUD` and `TEAM_DOMAIN = https://<team-name>.cloudflareaccess.com`. [source](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/) (accessed 2026-11-06)
- Cookie lifetime: application-domain `CF_Authorization` follows policy/application session duration, "If neither are set, defaults to 24 hours." [source](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/) (accessed 2026-11-06)

### 4.5 Service tokens (programmatic access, e.g. a local script hitting the API)

- Headers `CF-Access-Client-Id` / `CF-Access-Client-Secret`; create under Zero Trust → Access controls → Service credentials → Service Tokens (secret shown once; format `cfast_…`); the policy action must be **Service Auth** (API `"decision": "non_identity"`) or Access will prompt for login; expiry chosen at creation, refreshable. For organisations created on/after **2026-10-05** strict mode is default: "Access does not return a CF_Authorization cookie to the client after successful authentication" — keep sending the headers. [source](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/) (accessed 2026-11-06)
- Wrangler can use `CLOUDFLARE_ACCESS_CLIENT_ID`/`CLOUDFLARE_ACCESS_CLIENT_SECRET` for Access-protected dev hosts. [source](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/) (accessed 2026-11-06)

### 4.6 CORS / cookies for `fetch()` from the SPA

- Same-origin is fine: "CORS checks do not occur on the same domain." Cross-origin preflights fail: "the OPTIONS request will return a 403 error" because "the browser never includes cookies with OPTIONS requests, by design." Fixes: "Bypass OPTIONS requests to origin" (only if your origin enforces CORS) or configure CORS responses in the Access app's Additional settings. The page advises `credentials: 'same-origin'` on fetch/XHR. [source](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/) (accessed 2026-11-06)
- Since the SPA and `/api/*` are served from the same workers.dev hostname, no CORS configuration is needed; the `CF_Authorization` cookie is sent automatically.

### 4.7 API token permissions to script Access

- Account permissions: "Access: Apps and Policies Read/Edit (Write)", "Access: Organizations, Identity Providers, and Groups Read/Edit", "Access: Service Tokens Read/Edit". [source](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) (accessed 2026-11-06)
- Creating an Access app needs `Access: Apps and Policies Write`; creating the organisation needs `Access: Organizations, Identity Providers, and Groups Write`. [source](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/methods/create/) (accessed 2026-11-06)

---

## 5. Secrets, deployment and token permissions

### 5.1 Secrets

- Local: `.dev.vars` or `.env` next to the Wrangler config (dotenv syntax); "Do not commit secrets to git"; `.dev.vars.<env>` / `.env.<env>` per environment; `secrets.required` can enforce presence. Remote: `npx wrangler secret put <KEY>` "creates a new Worker version and deploys it immediately" (accepts piped stdin); `wrangler versions secret put` for a version only; bulk via `wrangler secret bulk [FILE]` (JSON or .env, ≤ 100 per command, `null` deletes with Wrangler ≥ 4.97.0) or `wrangler deploy --secrets-file .env.production` (additive); delete with `wrangler secret delete <KEY>`; list with `wrangler secret list --format json`. Dashboard: Workers & Pages → Worker → Settings → Variables and Secrets → Add (type Secret) → Deploy. [source](https://developers.cloudflare.com/workers/configuration/secrets/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/wrangler/commands/workers/) (accessed 2026-11-06)
- `wrangler deploy --keep-vars` preserves dashboard-edited plaintext vars; "Secrets are never deleted by a deployment whether this flag is true or false." [source](https://developers.cloudflare.com/workers/wrangler/commands/workers/) (accessed 2026-11-06)
- REST API: `PUT /accounts/{account_id}/workers/scripts/{script_name}/secrets` ("Add a secret to a Worker script by creating a new version with that secret"), body `{ "name": "...", "text": "...", "type": "secret_text" }`; requires one of "Workers Scripts Write", "Workers Admin", "Workers Editor", "Individual Workers Admin", "Individual Workers Editor". [source](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/update/) (accessed 2026-11-06)
- Secrets Store (open beta, account-level): one store per account, "up to 100 secrets per account" (production secrets only), value ≤ 65,536 bytes; bind with `secrets_store_secrets: [{ binding, store_id, secret_name }]` and read with `await env.<BINDING>.get()`; binding needs Super Administrator or Secrets Store Deployer; creating secrets needs Super Administrator or Secrets Store Admin. For a single Worker, plain per-Worker secrets are simpler. [source](https://developers.cloudflare.com/secrets-store/manage-secrets/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/secrets-store/integrations/workers/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/secrets-store/) (accessed 2026-11-06)

### 5.2 Non-interactive deploy with Wrangler

- Env vars: `CLOUDFLARE_API_TOKEN` ("can be used for authentication for situations like CI/CD, and other automation"), `CLOUDFLARE_ACCOUNT_ID`, optional `CLOUDFLARE_API_BASE_URL`, `WRANGLER_SEND_METRICS=false`, `WRANGLER_LOG`, `WRANGLER_SEND_ERROR_REPORTS` (set explicitly in automation because an unset value makes Wrangler "ask the user whether to send an error report" after an error). Old `CF_*` names are deprecated. [source](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/) (accessed 2026-11-06)
- GitHub Actions guidance: create a token from the **"Edit Cloudflare Workers"** permission group, scope it to one account, store as `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, use `cloudflare/wrangler-action@v4`. [source](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) (accessed 2026-11-06)
- Verify a token: `GET https://api.cloudflare.com/client/v4/user/tokens/verify` with `Authorization: Bearer` → `"status": "active"`. [source](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) (accessed 2026-11-06)

### 5.3 Which permissions `wrangler deploy` needs (DO + KV + R2 + assets)

- **"Edit Cloudflare Workers" template** = Zone: "Workers Routes Write"; Account: "Workers Scripts Write", "Workers KV Storage Write", "Workers Tail Read", "Workers R2 Storage Write", "Account Settings Read"; User: "User Details Read", "User Memberships Read". [source](https://developers.cloudflare.com/fundamentals/api/reference/template/) (accessed 2026-11-06)
- **New granular Workers roles (changelog Sep 15, 2026):** Metadata Read-Only, Content Read-Only, Editor, Admin, at product (all Workers) or resource (one Worker) scope; for CI/agents create an account-owned token under Manage Account → Account API Tokens with scope "Specified Workers" and a role. [source](https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/) (accessed 2026-11-06)
- Mapping: deploying an **existing** Worker needs "Editor" on that Worker or at the Workers product scope; creating a **new** Worker needs "Admin" at the Workers product scope; routes/custom domains additionally need Workers Routes Write per zone (not relevant on workers.dev). Legacy mapping: Workers Scripts Edit → Editor, Workers Scripts Read → Content Read-Only, Workers Tail Read / Workers Observability Read → Metadata Read-Only; legacy permissions "continue to work" with no deprecation date. Bindings: "No separate permissions on bound resources are needed to deploy the Worker"; separate KV/R2/D1 permissions are needed only for direct data access (for example `wrangler kv namespace create`, `wrangler r2 bucket create`). API tokens "do not support platform-level permissions". "The wrangler login OAuth flow does not currently support granular authorization." [source](https://developers.cloudflare.com/workers/authorization/workers/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/authorization/) (accessed 2026-11-06)
- Durable Objects "do not have separate roles or permissions. Access to a Durable Object is determined by your access to the Worker that implements it." Data Studio (query/modify SQLite data) needs at least Editor. [source](https://developers.cloudflare.com/workers/authorization/durable-objects/) (accessed 2026-11-06)
- `wrangler whoami` "Retrieve your user information" (`--account`, `--json`). The exact endpoints it calls are not documented (UNVERIFIED), which is why the template includes "User Details Read" and "User Memberships Read"; the authorization page's advice is to set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` so Wrangler does not need to discover the account via memberships. [source](https://developers.cloudflare.com/workers/wrangler/commands/general/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/authorization/) (accessed 2026-11-06)
- Practical minimum for this project (first deploy creates the Worker): Workers Scripts **Write/Edit** (or Workers product-scope **Admin** in the new model) + Workers KV Storage Write + Workers R2 Storage Write (so `wrangler kv namespace create` / `wrangler r2 bucket create` work) + Workers Tail Read + Account Settings Read + User Details Read + User Memberships Read, with `CLOUDFLARE_ACCOUNT_ID` set. The existing token already covers scripts/KV/R2; confirm it has Account Settings Read and the two user-scope reads if `wrangler whoami` fails.

---

## 6. Observability

- **Workers Logs** (persisted): enable with `"observability": { "enabled": true, "head_sampling_rate": 1 }` (the config reference says `enabled` defaults to `true` for new Workers; the logs page says you "must add the observability setting"); Wrangler ≥ 3.78.6. Retention 3 days (Free) / 7 days (Paid); Free 200,000 log events/day; Paid 20 M/month then $0.60/M; one invocation log per invocation (disable with `observability.logs.invocation_logs = false`); 256 KB max per log; 5 billion logs/day account cap then 1 % sampling. "Starting December 1, 2026, Workers Logs will move to Cloudflare Observability pricing." [source](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/wrangler/configuration/) (accessed 2026-11-06)
- **Observability pricing from Dec 1, 2026:** Free: 0.5 GB/day ingested, 7-day retention, ingestion stops at the daily cap until 00:00 UTC; Paid: 50 GB ingestion and 10 GB-month storage per billing cycle, then $0.25/GB ingested and $0.10/GB-month stored; covers Workers Logs, Workers Traces, Containers logs, R2 Data Access Logs, AI Gateway logs; Free/Pro/Business move automatically. [source](https://developers.cloudflare.com/observability/pricing/) (accessed 2026-11-06)
- **Real-time logs / `wrangler tail [WORKER]`** (`--format json|pretty`, `--status`, `--method`, `--search`, `--sampling-rate`, `--version-id`): does not store logs; high traffic enters sampling mode; "A maximum of 10 clients can view a Worker's logs at one time"; console.log inside WebSocket handlers is hidden until the socket closes. Dashboard: Worker → Logs → Live. Token needs Workers Tail Read (legacy) / Metadata Read-Only (new). [source](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/wrangler/commands/workers/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/authorization/workers/) (accessed 2026-11-06)
- **Tail Workers:** `tail_consumers: [{ "service": "<TAIL_WORKER_NAME>" }]`; consumer exports `tail(events)`; "available on the Workers Paid and Enterprise tiers"; billed by CPU time; Cloudflare recommends OpenTelemetry export for Sentry/Grafana-style destinations. [source](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) (accessed 2026-11-06)
- **Logpush:** "This product is available on the Workers Paid plan"; `"logpush": true`; `logs`+`exceptions` truncated at 16,384 characters. [source](https://developers.cloudflare.com/workers/observability/logs/logpush/) (accessed 2026-11-06)
- **Health-check patterns:** Cloudflare Health Checks are Pro+ (Free: 0 checks) and target an IP/hostname — not usable on Free and not needed. [source](https://developers.cloudflare.com/health-checks/) (accessed 2026-11-06). Instead: (1) the 1-minute Cron watchdog that re-arms the DO alarm; (2) a `/api/health` route that returns the DO's last snapshot timestamp, `getAlarm()` value and `sql.databaseSize`, which you can poll from any external uptime service with an Access service token; (3) Workers Logs queries on `$cloudflare.$metadata.type = "cf-worker-event"` with error status.
- Workers Logs show CPU and wall time per invocation ("CPU time and wall time appear in the invocation log") — the practical way to see whether the poll loop is near the CPU limit. [source](https://developers.cloudflare.com/workers/platform/limits/index.md) (accessed 2026-11-06)

---

## 7. Timing and clocks

- "the value returned by Date.now() is locked in place while code is executing" and "Date.now() returns the time of the last I/O. It does not advance during code execution." Rationale: Spectre-style timing side channels; "No other timers are provided." [source](https://developers.cloudflare.com/workers/reference/security-model/) (accessed 2026-11-06)
- `performance.now()` returns ms since `performance.timeOrigin` (always 0 in Workers) and, like `Date.now()`, timers "only advance or increment after I/O occurs": CPU-only loops see `start === end`; wrapping a `fetch()`/KV/R2 call between two reads does measure that I/O. Local `wrangler dev` timers advance normally. For CPU profiling use production profiling, not timers. [source](https://developers.cloudflare.com/workers/runtime-apis/performance/) (accessed 2026-11-06)
- Implications for the terminal: (a) a snapshot timestamp taken with `Date.now()` right after the market-data `fetch()` resolves is accurate to the moment the response arrived (good); (b) you cannot measure your own JSON-parse time in production; (c) upstream latency = `performance.now()` after the `await fetch()` minus before it — valid because the fetch is I/O; (d) prefer exchange/broker timestamps inside the payload for sequencing.
- Cron: `controller.scheduledTime` is the scheduled time, not the actual start time; drift between the two is not documented (UNVERIFIED). [source](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) (accessed 2026-11-06)
- `setTimeout`/`setInterval` inside a DO: they work, but pending timers block hibernation (and are billed as non-hibernatable idle time) and count as pending I/O for eviction purposes — use alarms, not `setInterval`, for the 10 s loop. [source](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (accessed 2026-11-06)
- `ctx.waitUntil()` extends execution "for up to 30 seconds after the response is sent"; unsettled promises are cancelled. [source](https://developers.cloudflare.com/workers/runtime-apis/context/) (accessed 2026-11-06)

---

## 8. Cost estimate for the stated workload

Assumptions: poll every 10 s for 7 h/day on weekdays → 2,520 alarm invocations/day, ~22 trading days/month → 55,440/month; 2–4 subrequests per alarm fetching 1–10 MB JSON; one ~200 KB snapshot row per alarm; daily archive of ~100 MB compressed to R2; one user; SPA polling `/api/state` every 5 s while open (~5,000 requests/day) or one SSE stream.

| Dimension | Daily usage | Free limit | Paid included | Verdict |
|---|---|---|---|---|
| DO requests (alarms + API→DO calls + watchdog) | ~2,520 + ~5,000 + 1,440 ≈ 9,000 | 100,000/day | 1 M/month | Free OK |
| DO duration (worst case: object active all 7 h) | 25,200 s × 0.125 GB = 3,150 GB-s | 13,000 GB-s/day | 400,000 GB-s/month (≈69,300 used) | Free OK |
| DO duration (realistic: ~3 s active per alarm) | 2,520 × 3 s × 0.125 GB ≈ 945 GB-s | 13,000 | — | Free OK |
| Subrequests per alarm | 2–4 | 50 | 10,000 | Free OK |
| SQLite rows written (snapshot + setAlarm) | ≈ 5,040 (+ prune) | 100,000/day | 50 M/month | Free OK |
| SQLite rows read | low thousands | 5 M/day | 25 B/month | Free OK |
| SQLite stored data (raw 200 KB × 2,520) | **+504 MB/day** | **5 GB/account, 1 GB/object (FAQ)** | 5 GB-month incl., then $0.20/GB-month; 10 GB/object | **Free breaks in ~2 days per object / ~10 days per account without pruning** |
| CPU per alarm (parse 1–10 MB JSON) | est. 5–100 ms (UNVERIFIED; depends on payload) | **10 ms** | 30 s default, 5 min max | **Free breaks on the larger payloads (Error 1102)** |
| Memory (10 MB JSON parsed) | tens of MB | 128 MB | 128 MB | OK on both, but keep only the fields you need |
| Worker requests (API, cron; assets are free) | ~6,500 | 100,000/day | 10 M/month | Free OK |
| Worker CPU for `/api/*` (proxy to DO) | ≪ 10 ms | 10 ms | 30 M ms/month | Free OK |
| Cron Triggers | 1 | 5/account | 250 | Free OK |
| Workers Logs | ~9,000 invocation logs + console lines | 200,000/day (0.5 GB/day from Dec 1, 2026) | 20 M/month | Free OK |
| R2 storage (100 MB/day × 22) | 2.2 GB/month cumulative | 10 GB-month | same free tier | Free for ~4.5 months, then ≈ $0.015/GB-month (≈ $0.40/month after a year) |
| R2 ops | a few Class A/day | 1 M Class A, 10 M Class B | same | Free OK |
| KV (config only) | tens | 1,000 writes/day | 1 M/month | Free OK if not used for snapshots |
| Access | 1 user | 50 users | — | Free ($0) |

Sources for the limits in this table: [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [DO FAQ](https://developers.cloudflare.com/durable-objects/reference/faq/index.md), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Zero Trust plans](https://www.cloudflare.com/plans/sase-zero-trust.md) (all accessed 2026-11-06).

### Which limit breaks first

1. **CPU time on Free (10 ms/invocation).** The DO FAQ ties DO CPU limits to the Worker plan, and `limits.cpu_ms` is a Paid-plan setting. Parsing and reducing a multi-megabyte JSON body in under 10 ms is not realistic (throughput figure UNVERIFIED, but the order of magnitude is not in doubt). On Paid you get 30 s by default and can set `cpu_ms` up to 300,000. This alone justifies Workers Paid.
2. **DO SQLite storage on Free.** Raw 200 KB × 2,520/day ≈ 504 MB/day. With the FAQ's 1 GB/object Free cap a single long-lived object fills in two trading days; the 5 GB account cap in ~10 days. Mitigations that work on either plan: compress snapshots before insert (gzip via `CompressionStream`; 200 KB of JSON typically shrinks 5–10×, UNVERIFIED ratio for your payload), store diffs rather than full state every 10 s, use one DO per trading day (`poller:YYYY-MM-DD`) and delete yesterday's object's rows after the R2 archive succeeds. Whether deleting rows shrinks the counted database size immediately is UNVERIFIED (SQLite normally keeps free pages until vacuumed; the DO SQLite API page does not document VACUUM behaviour).
3. Everything else (requests, duration, subrequests, logs, R2, cron) fits inside Free with large margins.

### Expected bill on Workers Paid

- $5.00/month minimum (covers Workers + DO + KV allotments; your usage is far inside them). [source](https://developers.cloudflare.com/workers/platform/pricing/) (accessed 2026-11-06)
- DO SQLite storage: within the 5 GB-month included if you prune daily; otherwise $0.20/GB-month beyond.
- R2: $0 until cumulative archive exceeds 10 GB, then ≈ $0.015/GB-month.
- Observability: $0 (far below 50 GB/month ingestion).
- Zero Trust: $0 (Free plan, 1 of 50 seats).
- Total ≈ **$5/month**, rising by cents as the R2 archive grows.

---

## Recommended architecture

```
Browser (React SPA)  ──HTTPS (Access cookie)──▶  trading-terminal.<sub>.workers.dev
                                                   │  Cloudflare Access (hostname-based self-hosted app, OTP IdP)
                                                   ▼
                                     Worker "trading-terminal" (static assets + API)
                                       - assets: ./dist, SPA fallback, run_worker_first ["/api/*","/events/*"]
                                       - /api/*: verify Cf-Access-Jwt-Assertion (jose, JWKS, aud, iss)
                                       - /api/state → POLLER.getByName("live").getState()
                                       - /api/history?from&to → POLLER or R2 (older days)
                                       - /events (SSE) → streams DO updates (optional)
                                       - scheduled(): every minute → POLLER.ensureRunning() (watchdog)
                                                   │
                                                   ▼
                                     Durable Object "Poller" (SQLite-backed, alarm chained every 10 s)
                                       - alarm(): fetch 2–4 upstream JSON endpoints → reduce → INSERT snapshot
                                       - keeps today's rows; at 20:30 ET alarm: gzip day → R2 PUT → DELETE rows
                                       - optional outbound broker WebSocket (reconnect on wake; ≤15 min life)
                                       - getState() returns latest row (in-memory cache + SQL fallback)
                                                   │
                                                   ▼
                                     R2 bucket "terminal-archive": snapshots/YYYY/MM/DD.json.gz (~100 MB/day)
                                     KV namespace "terminal-config": watchlists, UI prefs (few writes/day)
```

Key design decisions and why:

1. **One Worker, not Pages + Functions.** Pages is supported but Cloudflare says to start on Workers; Workers gets DO/alarms/cron directly. (§1.4)
2. **Alarm chaining, not `setInterval`, not Cron for the 10 s cadence.** Cron has 1-minute granularity; `setInterval` blocks hibernation and is lost on eviction; alarms are durable, at-least-once, re-instantiated on another machine after a crash, and only one is ever pending per object. Re-arm in `finally` so the 6-retry budget never stops the loop. (§2.4, §2.8)
3. **Watchdog Cron (1/min)** calls `ensureRunning()`; if `getAlarm()` is `null` during market hours, it sets one for now. Costs 1,440 invocations/day. (§3)
4. **Per-day DO IDs or daily prune + R2 archive** to stay under per-object/account SQLite caps; compress snapshot bodies. (§8)
5. **Access as a hostname-based self-hosted application** (destination `public`, domain `trading-terminal.<sub>.workers.dev`), not the Worker-level toggle, if you want WebSockets; the Worker-level toggle is fine if you only use polling/SSE. Either way validate the JWT in `/api/*` yourself because the static-assets router does not forward `ctx.access`. Use a service token (Service Auth policy) for any scripts. (§4.2, §4.5)
6. **Workers Paid ($5/month)** for the CPU limit (30 s default, `limits.cpu_ms` up to 300,000) and larger DO storage caps; everything else would fit Free. If you must stay on Free: cap upstream payloads (server-side field filters, ≤ ~1 MB), compress snapshots, prune hourly, and accept Error 1102 risk on big responses. (§8)
7. **No D1** (token lacks permission; DO SQLite + R2 suffice). **No Queues/Workflows** needed. **Analytics Engine** optional for poll-latency metrics (100k points/day free, 3-month retention). (§3)
8. **Observability**: `observability.enabled: true`, `wrangler tail` during development, `/api/health` exposing last snapshot age + `getAlarm()` + `databaseSize`. Logpush/Tail Workers only if you later need export (Paid). (§6)
9. **Secrets**: upstream API keys via `wrangler secret put` (or the `PUT .../secrets` endpoint); `POLICY_AUD` and `TEAM_DOMAIN` as plain `vars`. (§5.1)

Reference `wrangler.jsonc` for the recommended build:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "trading-terminal",
  "main": "./src/index.ts",
  "compatibility_date": "2026-11-06",
  "upload_source_maps": true,
  "workers_dev": true,
  "assets": {
    "directory": "./dist/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/events/*"]
  },
  "durable_objects": { "bindings": [{ "name": "POLLER", "class_name": "Poller" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Poller"] }],
  "kv_namespaces": [{ "binding": "CONFIG", "id": "<KV_NAMESPACE_ID>" }],
  "r2_buckets": [{ "binding": "ARCHIVE", "bucket_name": "terminal-archive" }],
  "triggers": { "crons": ["* * * * *"] },
  "limits": { "cpu_ms": 30000 },              // Paid plan only; ignored on Free
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "vars": {
    "TEAM_DOMAIN": "https://<team-name>.cloudflareaccess.com",
    "POLICY_AUD": "<AUD tag from the Access application>"
  }
}
```

(Config keys and defaults: [source](https://developers.cloudflare.com/workers/wrangler/configuration/) (accessed 2026-11-06).)

Deploy non-interactively:

```bash
export CLOUDFLARE_API_TOKEN=...   CLOUDFLARE_ACCOUNT_ID=...   WRANGLER_SEND_METRICS=false
npx wrangler kv namespace create CONFIG            # needs Workers KV Storage Write
npx wrangler r2 bucket create terminal-archive     # needs Workers R2 Storage Write (R2 subscription must exist)
npx wrangler deploy                                # first deploy creates the Worker (Admin / Workers Scripts Write)
printf '%s' "$UPSTREAM_API_KEY" | npx wrangler secret put UPSTREAM_API_KEY
npx wrangler tail --format pretty
```

---

## Exact setup steps the account owner must do in the dashboard

These are the actions the API token cannot perform (or that Cloudflare documents only as dashboard flows). Do them in this order.

1. **Confirm/choose the Workers plan.** Dashboard → Workers & Pages → Plans. Upgrade to **Workers Paid ($5/month minimum)** so DO/Worker invocations get the 30 s CPU default (configurable via `limits.cpu_ms`) and SQLite storage is not capped at 5 GB/account. If staying on Free, accept the 10 ms CPU and 5 GB/1 GB storage caps described in §8. [source](https://developers.cloudflare.com/workers/platform/pricing/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/workers/platform/limits/) (accessed 2026-11-06)
2. **Add the R2 subscription.** Dashboard → R2 → "Complete the checkout flow to add an R2 subscription to your account." The 10 GB-month / 1 M Class A / 10 M Class B free allowance applies after this. Then the API token (Workers R2 Storage Write) can create buckets, or create `terminal-archive` here. [source](https://developers.cloudflare.com/r2/get-started/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/r2/pricing/) (accessed 2026-11-06)
3. **Enable Zero Trust (the "Enable Access" step).** Dashboard → Zero Trust → on the onboarding screen choose a **team name** (becomes `<team-name>.cloudflareaccess.com`; write it down — it is `TEAM_DOMAIN`) → select the **Zero Trust Free** plan (50 users, $0) → enter payment details ("this step is still needed but you will not be charged"). [source](https://developers.cloudflare.com/cloudflare-one/setup/) (accessed 2026-11-06), [source](https://www.cloudflare.com/plans/sase-zero-trust.md) (accessed 2026-11-06)
4. **Add the One-time PIN identity provider.** Zero Trust (https://one.dash.cloudflare.com) → Integrations → Identity providers → add → **One-time PIN**. (New orgs default to the "Cloudflare identity provider"; OTP is not added automatically.) [source](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/) (accessed 2026-11-06)
5. **Deploy the Worker once** (from CI/CLI with the token) so the workers.dev hostname exists: `trading-terminal.<subdomain>.workers.dev`. Confirm under Workers & Pages → Worker → Settings → Domains & Routes that workers.dev is enabled (it re-enables on deploy unless `workers_dev = false`). [source](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) (accessed 2026-11-06)
6. **Protect the hostname with Access.** Two documented options:
   - *Option A (simplest, no WebSockets):* Workers & Pages → select the Worker → **Access** tab → "Protect this Worker behind Access" → "All traffic" → Authentication policy: create one that allows your email (policy options shown: Cloudflare account members or Email domain; for a single address create/edit the policy in Zero Trust with an Include rule for your email) → session duration (default 24 h) → "Apply Access". This covers the workers.dev hostname and previews. WebSocket upgrades will return 403 under this mode. [source](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) (accessed 2026-11-06)
   - *Option B (needed for WebSockets):* Zero Trust → Access controls → Applications → Create new application → Self-hosted → application domain = `trading-terminal.<subdomain>.workers.dev` (use "Switch to custom input" if the dropdown only lists zones; or create it via `POST /accounts/{account_id}/access/apps` with a `public` destination) → Allow policy with Include: Emails = your address → Identity providers: One-time PIN (enable "Apply instant authentication") → Session duration → Create. [source](https://developers.cloudflare.com/workers/configuration/cloudflare-access/index.md) (accessed 2026-11-06), [source](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/index.md) (accessed 2026-11-06), [source](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/) (accessed 2026-11-06)
7. **Copy the Application Audience (AUD) tag.** Zero Trust → Access controls → Applications → Edit the app → Additional settings → copy the AUD tag → set it as `POLICY_AUD` (var) in the Worker together with `TEAM_DOMAIN`. [source](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/) (accessed 2026-11-06)
8. **(Optional) Create a service token** for scripts/uptime pollers: Zero Trust → Access controls → Service credentials → Service Tokens → Create (copy the Client Secret once) → add a second policy on the app with action **Service Auth** that includes that token. [source](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/) (accessed 2026-11-06)
9. **(Optional) Extend the API token** so Access can be scripted later: Manage Account → Account API Tokens → edit → add "Access: Apps and Policies Edit", "Access: Organizations, Identity Providers, and Groups Edit", "Access: Service Tokens Edit"; and, if you ever want D1, "D1 Edit". Also verify the token carries Account Settings Read + User Details Read + User Memberships Read (the "Edit Cloudflare Workers" template set) so `wrangler whoami`/`deploy` work without an explicit account lookup. [source](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) (accessed 2026-11-06), [source](https://developers.cloudflare.com/fundamentals/api/reference/template/) (accessed 2026-11-06)
10. **Verify.** Open the workers.dev URL in a private window → Access login page → OTP email → app loads; `curl -I https://trading-terminal.<sub>.workers.dev/api/state` without cookies must return a redirect/403 from Access; with `CF-Access-Client-Id/Secret` headers it must return 200. Check Workers & Pages → Worker → Logs → Live for the alarm invocations and that `/api/health` reports a snapshot younger than ~15 s during market hours.

---

## Appendix A — Items marked UNVERIFIED

- Current account plan (assumed Free).
- Whether DO alarms on the Free plan are enforced at 10 ms CPU (docs: DOs have "the same per invocation CPU limits as any Workers do"; no DO-specific Free figure published).
- Whether the per-object SQLite cap on Free is 1 GB (FAQ) or 10 GB (limits table).
- Alarm scheduling precision, minimum interval, and behaviour for a time in the past.
- Whether Cron/scheduled invocations count toward the Free 100,000 requests/day budget (assumed yes).
- Whether DO requests and Worker requests share one 100,000/day Free counter (pricing pages list them separately).
- Exact dashboard mechanics for entering a workers.dev hostname in a self-hosted Access application (docs say it is supported; the generic form lists zones).
- Whether hostname-based Access apps pass WebSocket upgrades (implied by the Workers Access page's recommendation; not stated outright).
- Whether the R2 subscription checkout requires a card on file.
- Which endpoints `wrangler whoami`/`deploy` call for user/membership discovery.
- JSON parse throughput and gzip ratio for your specific payloads.
- Whether deleting rows immediately reduces the counted DO SQLite storage (VACUUM behaviour undocumented).
- Whether `POST /access/organizations` fully substitutes for the dashboard Zero Trust onboarding.

## Appendix B — Primary sources consulted (all accessed 2026-11-06)

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- https://developers.cloudflare.com/pages/
- https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/
- https://developers.cloudflare.com/workers/platform/limits/ (and /index.md)
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/ (and /index.md)
- https://developers.cloudflare.com/durable-objects/api/alarms/ (and /index.md)
- https://developers.cloudflare.com/durable-objects/examples/alarms-api/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/best-practices/automatic-retries/
- https://developers.cloudflare.com/durable-objects/reference/in-memory-state/
- https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- https://developers.cloudflare.com/durable-objects/reference/faq/ (and /index.md)
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/changelog/post/2026-08-25-durable-object-alarm-abort-no-retry/
- https://developers.cloudflare.com/changelog/?product=workers (entry 2026-11-05 "Automatic retries for Durable Object calls")
- https://developers.cloudflare.com/workers/runtime-apis/websockets/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/kv/platform/pricing/
- https://developers.cloudflare.com/kv/concepts/how-kv-works/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/platform/limits/
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/analytics/analytics-engine/pricing/
- https://developers.cloudflare.com/analytics/analytics-engine/limits/
- https://developers.cloudflare.com/queues/platform/pricing/
- https://developers.cloudflare.com/workflows/reference/pricing/
- https://developers.cloudflare.com/hyperdrive/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/ (and /index.md)
- https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/
- https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/
- https://developers.cloudflare.com/cloudflare-one/setup/
- https://www.cloudflare.com/plans/sase-zero-trust.md
- https://developers.cloudflare.com/cloudflare-one/identity/users/seat-management/
- https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/index.md
- https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/
- https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/
- https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/organizations/methods/create/
- https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- https://developers.cloudflare.com/fundamentals/api/reference/template/
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- https://developers.cloudflare.com/workers/authorization/
- https://developers.cloudflare.com/workers/authorization/workers/
- https://developers.cloudflare.com/workers/authorization/durable-objects/
- https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
- https://developers.cloudflare.com/workers/wrangler/commands/general/
- https://developers.cloudflare.com/workers/wrangler/system-environment-variables/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/update/
- https://developers.cloudflare.com/secrets-store/
- https://developers.cloudflare.com/secrets-store/integrations/workers/
- https://developers.cloudflare.com/secrets-store/manage-secrets/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.cloudflare.com/observability/pricing/
- https://developers.cloudflare.com/workers/observability/logs/real-time-logs/
- https://developers.cloudflare.com/workers/observability/logs/tail-workers/
- https://developers.cloudflare.com/workers/observability/logs/logpush/
- https://developers.cloudflare.com/health-checks/
- https://developers.cloudflare.com/workers/reference/security-model/
- https://developers.cloudflare.com/workers/runtime-apis/performance/
- https://developers.cloudflare.com/workers/runtime-apis/context/
