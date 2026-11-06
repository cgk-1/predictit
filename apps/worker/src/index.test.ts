import { describe, expect, it } from "vitest";
import worker from "./index";
import { signSession, SESSION_COOKIE } from "./auth";
import type { Env } from "./env";

function env(partial: Partial<Env> = {}): Env {
  const market = {
    ensureAlarm: async () => {},
    state: async () => ({ serverTime: Date.now(), mode: "NONE", decision: null }),
    health: async () => ({ ok: true }),
  };
  return {
    ASSETS: { fetch: async () => new Response("<html>app</html>", { headers: { "content-type": "text/html" } }) } as any,
    MARKET: { idFromName: () => "id", get: () => market } as any,
    GATE: { idFromName: () => "g", get: () => ({ check: async () => ({ allowed: true, retryAfterSec: 0 }), fail: async () => {}, success: async () => {} }) } as any,
    CONFIG: {} as any,
    ARCHIVE: {} as any,
    APP_NAME: "predictit",
    ACCESS_TEAM_DOMAIN: "",
    ACCESS_AUD: "",
    ALLOWED_EMAILS: "",
    SCHWAB_REDIRECT_URI: "https://127.0.0.1:8182",
    ARCHIVE_CBOE: "false",
    ...partial,
  };
}
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const gate = { GATE_PASSPHRASE: "correct horse", SESSION_SECRET: "k".repeat(40) };

describe("worker router", () => {
  it("refuses everything when auth is not configured", async () => {
    const e = env();
    expect((await worker.fetch(new Request("https://x/"), e, ctx)).status).toBe(503);
    expect((await worker.fetch(new Request("https://x/api/state"), e, ctx)).status).toBe(503);
    expect((await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", body: "{}" }), e, ctx)).status).toBe(503);
  });
  it("serves the login shell (401) and blocks the API without a session", async () => {
    const e = env(gate);
    const r = await worker.fetch(new Request("https://x/"), e, ctx);
    expect(r.status).toBe(401);
    expect(await r.text()).toContain("Passphrase");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    expect((await worker.fetch(new Request("https://x/api/state"), e, ctx)).status).toBe(401);
    expect((await worker.fetch(new Request("https://x/assets/app.js"), e, ctx)).status).toBe(401);
  });
  it("logs in with the passphrase, sets a strict cookie, then serves assets and API", async () => {
    const e = env(gate);
    const bad = await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://x" }, body: JSON.stringify({ passphrase: "nope" }) }), e, ctx);
    expect(bad.status).toBe(401);
    const ok = await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://x" }, body: JSON.stringify({ passphrase: "correct horse" }) }), e, ctx);
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    const token = cookie.split(";")[0]!.split("=")[1]!;
    const app = await worker.fetch(new Request("https://x/", { headers: { cookie: `${SESSION_COOKIE}=${token}` } }), e, ctx);
    expect(app.status).toBe(200);
    expect(await app.text()).toContain("app");
    const st = await worker.fetch(new Request("https://x/api/state", { headers: { cookie: `${SESSION_COOKIE}=${token}` } }), e, ctx);
    expect(st.status).toBe(200);
    expect((await st.json() as any).mode).toBe("NONE");
  });
  it("rejects cross-origin mutating requests even with a valid session", async () => {
    const e = env(gate);
    const now = Math.floor(Date.now() / 1000);
    const token = await signSession(gate.SESSION_SECRET, { sub: "owner", iat: now, exp: now + 60, via: "gate" });
    const r = await worker.fetch(new Request("https://x/api/positions", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${token}`, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }), e, ctx);
    expect(r.status).toBe(403);
    const r2 = await worker.fetch(new Request("https://x/api/positions", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${token}`, "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: "{}" }), e, ctx);
    expect(r2.status).toBe(403);
  });
  it("accepts a plain form post and redirects with the cookie; wrong passphrase re-renders the shell", async () => {
    const e = env(gate);
    const bad = await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://x" }, body: "passphrase=wrong" }), e, ctx);
    expect(bad.status).toBe(401);
    expect(await bad.text()).toContain("Invalid passphrase");
    const ok = await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://x" }, body: "passphrase=correct+horse" }), e, ctx);
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/");
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/);
  });
  it("allows a form post whose Origin is serialized as null when Sec-Fetch-Site says same-origin, and rejects cross-site", async () => {
    const e = env(gate);
    const ok = await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "null", "sec-fetch-site": "same-origin" }, body: "passphrase=correct+horse" }), e, ctx);
    expect(ok.status).toBe(303);
    const bad = await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "null", "sec-fetch-site": "cross-site" }, body: "passphrase=correct+horse" }), e, ctx);
    expect(bad.status).toBe(403);
    const opaque = await worker.fetch(new Request("https://x/api/auth/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "null" }, body: "passphrase=correct+horse" }), e, ctx);
    expect(opaque.status).toBe(403);
  });
  it("logout clears the cookie", async () => {
    const r = await worker.fetch(new Request("https://x/api/auth/logout", { method: "POST", headers: { origin: "https://x" } }), env(gate), ctx);
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});
