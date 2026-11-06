/**
 * Worker entry: authenticates EVERY request (assets included), routes /api/* to the MarketSession Durable Object,
 * serves the SPA otherwise, and runs a 1-minute cron watchdog that re-arms the DO alarm loop.
 */
import { authenticate, sessionCookie, signSession, timingSafeEqual, SESSION_COOKIE, SESSION_TTL_SEC } from "./auth";
import { json, type Env } from "./env";
import { MarketSession } from "./market";
import { Gatekeeper } from "./gatekeeper";
import { explainDecision } from "./explain";

export { MarketSession, Gatekeeper };

const SECURITY_HEADERS: Record<string, string> = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "cache-control": "no-store",
};

function withSecurity(res: Response): Response {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k) || k === "cache-control") r.headers.set(k, v);
  return r;
}

function market(env: Env) {
  const id = env.MARKET.idFromName("singleton");
  return env.MARKET.get(id) as unknown as MarketSession;
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

async function handleAuth(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    if (!env.GATE_PASSPHRASE || !env.SESSION_SECRET) return json({ error: "Fallback login is not configured." }, { status: 503 });
    const gate = env.GATE.get(env.GATE.idFromName("gate")) as unknown as Gatekeeper;
    const ip = clientIp(req);
    const ctype = req.headers.get("content-type") ?? "";
    const isForm = ctype.includes("application/x-www-form-urlencoded") || ctype.includes("multipart/form-data");
    const chk = await gate.check(ip);
    if (!chk.allowed) {
      if (isForm) return loginPage(env, `Too many attempts; retry in ${chk.retryAfterSec}s.`);
      return json({ error: `Too many attempts; retry in ${chk.retryAfterSec}s.` }, { status: 429, headers: { "retry-after": String(chk.retryAfterSec) } });
    }
    // Accept JSON (API clients) or a plain HTML form post (the no-script login shell).
    let body: { passphrase?: string; email?: string } = {};
    try {
      if (isForm) {
        const fd = await req.formData();
        body = { passphrase: String(fd.get("passphrase") ?? ""), email: String(fd.get("email") ?? "") };
      } else body = (await req.json()) as typeof body;
    } catch {
      /* ignore */
    }
    const ok = typeof body.passphrase === "string" && body.passphrase.length > 0 && timingSafeEqual(body.passphrase, env.GATE_PASSPHRASE);
    if (!ok) {
      await gate.fail(ip);
      if (isForm) return loginPage(env, "Invalid passphrase.");
      return json({ error: "Invalid passphrase." }, { status: 401 });
    }
    await gate.success(ip);
    const now = Math.floor(Date.now() / 1000);
    const token = await signSession(env.SESSION_SECRET, { sub: body.email?.toLowerCase() || "owner", iat: now, exp: now + SESSION_TTL_SEC, via: "gate" });
    if (isForm) return new Response(null, { status: 303, headers: { location: "/", "set-cookie": sessionCookie(token) } });
    return json({ ok: true, expiresAt: (now + SESSION_TTL_SEC) * 1000 }, { headers: { "set-cookie": sessionCookie(token) } });
  }
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    return json({ ok: true }, { headers: { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });
  }
  if (url.pathname === "/api/auth/config") {
    return json({ access: !!(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN), gate: !!(env.GATE_PASSPHRASE && env.SESSION_SECRET), app: env.APP_NAME });
  }
  return null;
}

async function handleApi(req: Request, env: Env, url: URL, sub: string): Promise<Response> {
  const m = market(env);
  const p = url.pathname.replace(/^\/api/, "");
  const q = url.searchParams;
  try {
    if (p === "/health") return json(await m.health());
    if (p === "/auth/me") return json({ sub });
    if (p === "/state") {
      await m.ensureAlarm();
      return json(await m.state());
    }
    if (p === "/bars") {
      const sym = q.get("symbol") === "SPY" ? "SPY" : "SPX";
      const date = q.get("date");
      const at = Number(q.get("at"));
      if (date && Number.isFinite(at)) return json(await m.barsAt(sym, date, at));
      return json(await m.bars(sym));
    }
    if (p === "/export") {
      const date = q.get("date");
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
      return json(await m.exportDay(date), { headers: { "content-disposition": `attachment; filename="predictit-${date}.json"` } });
    }
    if (p === "/chain") return json(await m.chainSlice(Number(q.get("pct") ?? 0.03), Number(q.get("days") ?? 10)));
    if (p === "/decisions") return json(await m.decisions(q.get("date") ?? new Date().toISOString().slice(0, 10)));
    if (p === "/changes") return json(await m.changesFor(q.get("date") ?? new Date().toISOString().slice(0, 10)));
    if (p === "/dates") return json(await m.dates());
    if (p === "/replay") {
      const date = q.get("date");
      const at = Number(q.get("at"));
      if (!date || !Number.isFinite(at)) return json({ error: "date and at required" }, { status: 400 });
      return json(await m.replayAt(date, at, q.get("instrument") === "SPY" ? "SPY" : "SPX"));
    }
    if (p === "/performance") return json(await m.performance());
    if (p === "/positions" && req.method === "GET") return json(await m.allPositions(q.get("date") ?? undefined));
    if (p === "/positions" && req.method === "POST") {
      const body = (await req.json()) as Parameters<MarketSession["openPosition"]>[0];
      return json(await m.openPosition(body));
    }
    const closeMatch = /^\/positions\/([^/]+)\/close$/.exec(p);
    if (closeMatch && req.method === "POST") {
      const body = (await req.json()) as { premium: number; reason?: string };
      return json(await m.closePositionById(decodeURIComponent(closeMatch[1]!), Number(body.premium), body.reason ?? "manual"));
    }
    if (p === "/settings" && req.method === "GET") return json(await m.getSettings());
    if (p === "/settings" && req.method === "PUT") return json(await m.putSettings((await req.json()) as any));
    if (p === "/lean") return json(await m.lean());
    if (p === "/gex") return json(await m.gexDetail(q.get("instrument") === "SPY" ? "SPY" : "SPX"));
    if (p === "/grades") return json(await m.grades());
    if (p === "/alerts/status") return json(await m.alertsStatus());
    if (p === "/alerts/discord" && req.method === "POST") {
      const body = (await req.json()) as { url?: string };
      return json(await m.setDiscordWebhook(String(body.url ?? "")));
    }
    if (p === "/schwab/status") return json(await m.schwabStatus());
    if (p === "/schwab/credentials" && req.method === "POST") {
      const body = (await req.json()) as { clientId: string; clientSecret: string };
      return json(await m.setSchwabCredentials(String(body.clientId ?? ""), String(body.clientSecret ?? "")));
    }
    if (p === "/schwab/auth-url") return json({ url: await m.schwabAuthUrl(), redirectUri: env.SCHWAB_REDIRECT_URI });
    if (p === "/schwab/callback" && req.method === "POST") {
      const body = (await req.json()) as { redirectedUrl: string };
      return json(await m.schwabCallback(body.redirectedUrl));
    }
    if (p === "/schwab/disconnect" && req.method === "POST") {
      await m.schwabDisconnect();
      return json({ ok: true });
    }
    if (p === "/admin/archive" && req.method === "POST") {
      const date = q.get("date");
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
      return json(await m.archiveDate(date));
    }
    if (p === "/explain" && req.method === "POST") {
      const body = (await req.json()) as { decisionId?: string };
      const st = await m.state();
      return json(await explainDecision(env, st.decision, body.decisionId));
    }
    return json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 400 });
  }
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // same-origin only for state-changing requests
    if (req.method !== "GET" && req.method !== "HEAD") {
      // Browsers serialize Origin as "null" under some referrer policies and for opaque origins; Sec-Fetch-Site is the
      // authoritative signal when present. Reject when either header positively indicates another origin.
      const origin = req.headers.get("origin");
      const fetchSite = req.headers.get("sec-fetch-site");
      if (origin && origin !== "null" && origin !== url.origin) return withSecurity(json({ error: "cross-origin request refused" }, { status: 403 }));
      if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return withSecurity(json({ error: "cross-site request refused" }, { status: 403 }));
      if (origin === "null" && !fetchSite) return withSecurity(json({ error: "opaque-origin request refused" }, { status: 403 }));
    }
    const authRes = await handleAuth(req, env, url);
    if (authRes) return withSecurity(authRes);
    const auth = await authenticate(req, env);
    if (!auth.ok) {
      if (url.pathname.startsWith("/api/")) return withSecurity(json({ error: auth.reason }, { status: auth.status }));
      // unauthenticated navigation: serve the login shell only when the fallback gate is configured; never the app
      if (auth.status === 503) return withSecurity(new Response("Authentication is not configured. Refusing to serve.", { status: 503 }));
      return withSecurity(loginPage(env));
    }
    if (url.pathname.startsWith("/api/")) return withSecurity(await handleApi(req, env, url, auth.session.sub));
    return withSecurity(await env.ASSETS.fetch(req));
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // watchdog: make sure the poll loop is armed (alarms can be lost on eviction/errors)
    ctx.waitUntil(market(env).ensureAlarm());
  },
} satisfies ExportedHandler<Env>;

/** No-script login shell: a plain form post keeps the strict CSP (script-src 'self') intact. */
function loginPage(env: Env, error = ""): Response {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(env.APP_NAME)} · sign in</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10;color:#e6e8eb;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}form{width:min(360px,90vw);padding:28px;border:1px solid #23272e;border-radius:12px;background:#111418}h1{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#9aa3ad;margin:0 0 18px}label{display:block;color:#9aa3ad;font-size:13px}input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #2a2f37;background:#0b0d10;color:#e6e8eb;font:inherit;margin:6px 0 14px}button{width:100%;padding:10px;border-radius:8px;border:0;background:#e6e8eb;color:#0b0d10;font:inherit;font-weight:600;cursor:pointer}p{color:#9aa3ad;font-size:13px}.err{color:#ff6b6b;min-height:1.2em}</style></head>
<body><form method="post" action="/api/auth/login"><h1>${esc(env.APP_NAME)}</h1><label for="p">Passphrase</label><input id="p" name="passphrase" type="password" autocomplete="current-password" autofocus required><button type="submit">Sign in</button><p class="err">${esc(error)}</p><p>Private research terminal. Access is server-enforced; this page is served only to unauthenticated requests.</p></form></body></html>`;
  return new Response(html, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}
