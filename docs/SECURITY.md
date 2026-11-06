# Security model

- Every request (assets, API, streams) is authenticated in the Worker: Cloudflare Access JWT (RS256 via team JWKS,
  `aud`, `iss`, expiry, allowed e-mails) when configured, else the fallback passphrase login that issues an
  HMAC-SHA256-signed, HttpOnly, Secure, SameSite=Strict cookie (12 h). Brute force is rate-limited per IP and globally
  in a Durable Object. With neither configured the Worker returns 503 for everything.
- Mutating requests must be same-origin (`Origin` / `Sec-Fetch-Site` checks). Strict CSP, `frame-ancestors 'none'`,
  `x-robots-tag: noindex`, `cache-control: no-store`.
- Secrets live only in Worker secrets (`wrangler secret put`) or Durable Object storage (Schwab tokens, optional
  credentials entered in Settings — write-only). The repo, client bundle, logs and docs contain no secrets; CI greps
  for known prefixes. `.gitignore` excludes `.env*`, `.dev.vars`, `env.sh`.
- Preview URLs are disabled; the workers.dev route is the only hostname.
- Data at rest: Durable Object SQLite and R2 (Cloudflare-managed encryption). Retention is bounded (7 days hot, R2
  archive).
- The StormAuditor credentials you attached were used for nothing except the Cloudflare account access needed to
  deploy this Worker; the GitHub PAT, Supabase, Stripe, Resend, Mapbox and webhook secrets were not used.
