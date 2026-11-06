# predictit

Private SPX/SPY intraday options decision terminal: full-day market-state analysis (price structure, realized and
implied volatility, gamma exposure with explicit dealer-sign assumptions, calendar context), distinct setup families
with precise triggers/invalidation/exits, execution-aware contract ranking, a transparent adaptive indicator ensemble
("market lean"), a dedicated 15:50–16:00 SPX strike-flip module, paper positions, an immutable decision ledger,
hindsight-free replay, and prospective performance tracking. Hosted on Cloudflare Workers behind server-side
authentication.

**Honesty first:** nothing is validated yet (see `docs/VALIDATION.md` and `docs/EVIDENCE-LEDGER.md`). The platform
never fabricates data: it is LIVE (Schwab), DELAYED (Cboe, 15 min) or NONE, and it refuses to recommend entries on
delayed or stale inputs.

| Doc | Purpose |
|---|---|
| `docs/SETUP.md` | Deploy, secrets, Cloudflare Access, Schwab connection (no terminal needed after first deploy) |
| `docs/ARCHITECTURE.md` | Components, data contracts, live loop, leakage guards |
| `docs/EVIDENCE-LEDGER.md` | Mechanics vs hypotheses vs unvalidated strategies vs out-of-sample findings |
| `docs/VALIDATION.md` | Replay method, metrics, baselines, what "validated" would require |
| `docs/PROVIDERS.md` | Data-provider comparison and recommended stacks |
| `docs/ROADMAP.md` | Prioritised next steps |
| `docs/SECURITY.md` | Access control and secret handling |
| `docs/research/*.md` | Six research memos with dated primary sources (contracts, Schwab, Cloudflare, providers, GEX & literature, brokers & auctions) |

## Layout

```
packages/engine    pure TypeScript analytics + decision logic (58 tests)
packages/adapters  Schwab Market Data and Cboe delayed JSON adapters
apps/worker        Cloudflare Worker + Durable Objects (auth, poller, ledger, R2 archive)
apps/web           React terminal (Today, Setups, Gamma, Closing window, Lean, Positions, Replay, Performance, Settings)
research/          collector, replay CLI with baselines, daily calendar study, results
```

## Quick start

```bash
pnpm install
pnpm -r typecheck && pnpm -r test
pnpm --filter @predictit/web build && pnpm --filter @predictit/worker deploy
```

See `docs/SETUP.md` for secrets, the Cloudflare plan note and the Schwab steps.
