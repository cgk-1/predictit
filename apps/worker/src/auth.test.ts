import { describe, expect, it } from "vitest";
import { authenticate, signSession, verifySession, timingSafeEqual, verifyAccessJwt, SESSION_COOKIE } from "./auth";
import type { Env } from "./env";

function env(partial: Partial<Env> = {}): Env {
  return {
    ASSETS: {} as any,
    MARKET: {} as any,
    GATE: {} as any,
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

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("timingSafeEqual", () => {
  it("compares strings without early exit semantics", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("session cookies", () => {
  it("round-trips and rejects tampering/expiry", async () => {
    const secret = "s".repeat(32);
    const now = Math.floor(Date.now() / 1000);
    const tok = await signSession(secret, { sub: "owner", iat: now, exp: now + 60, via: "gate" });
    expect((await verifySession(secret, tok))?.sub).toBe("owner");
    expect(await verifySession("other".repeat(8), tok)).toBeNull();
    expect(await verifySession(secret, tok.slice(0, -2) + "zz")).toBeNull();
    const expired = await signSession(secret, { sub: "owner", iat: now - 120, exp: now - 60, via: "gate" });
    expect(await verifySession(secret, expired)).toBeNull();
    expect(await verifySession(secret, null)).toBeNull();
    expect(await verifySession(secret, "garbage")).toBeNull();
  });
});

describe("authenticate", () => {
  it("refuses to serve when nothing is configured (503)", async () => {
    const r = await authenticate(new Request("https://x/"), env());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });
  it("requires a valid cookie when only the gate is configured", async () => {
    const e = env({ GATE_PASSPHRASE: "p", SESSION_SECRET: "k".repeat(32) });
    const r1 = await authenticate(new Request("https://x/api/state"), e);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.status).toBe(401);
    const now = Math.floor(Date.now() / 1000);
    const tok = await signSession(e.SESSION_SECRET!, { sub: "owner", iat: now, exp: now + 60, via: "gate" });
    const r2 = await authenticate(new Request("https://x/api/state", { headers: { cookie: `${SESSION_COOKIE}=${tok}` } }), e);
    expect(r2.ok).toBe(true);
  });
  it("verifies a Cloudflare Access JWT against the team JWKS (aud, iss, email, signature, exp)", async () => {
    const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const jwk = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as JsonWebKey;
    const team = "team.cloudflareaccess.com";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      if (String(input).includes(`${team}/cdn-cgi/access/certs`)) return new Response(JSON.stringify({ keys: [{ kid: "k1", kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256" }] }), { headers: { "content-type": "application/json" } });
      return realFetch(input);
    }) as any;
    const e = env({ ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "aud123", ALLOWED_EMAILS: "owner@example.com" });
    const now = Math.floor(Date.now() / 1000);
    const make = async (claims: Record<string, unknown>, kid = "k1") => {
      const enc = new TextEncoder();
      const h = b64url(enc.encode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })));
      const p = b64url(enc.encode(JSON.stringify(claims)));
      const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, enc.encode(`${h}.${p}`));
      return `${h}.${p}.${b64url(sig)}`;
    };
    const good = await make({ aud: ["aud123"], email: "owner@example.com", exp: now + 300, iat: now, iss: `https://${team}`, sub: "u1" });
    expect((await verifyAccessJwt(e, good))?.email).toBe("owner@example.com");
    const wrongAud = await make({ aud: ["other"], email: "owner@example.com", exp: now + 300, iat: now, iss: `https://${team}`, sub: "u1" });
    expect(await verifyAccessJwt(e, wrongAud)).toBeNull();
    const wrongEmail = await make({ aud: ["aud123"], email: "intruder@example.com", exp: now + 300, iat: now, iss: `https://${team}`, sub: "u1" });
    expect(await verifyAccessJwt(e, wrongEmail)).toBeNull();
    const expired = await make({ aud: ["aud123"], email: "owner@example.com", exp: now - 1, iat: now - 100, iss: `https://${team}`, sub: "u1" });
    expect(await verifyAccessJwt(e, expired)).toBeNull();
    const badSig = good.slice(0, -3) + "abc";
    expect(await verifyAccessJwt(e, badSig)).toBeNull();
    const r = await authenticate(new Request("https://x/", { headers: { "cf-access-jwt-assertion": good } }), e);
    expect(r.ok).toBe(true);
    const r2 = await authenticate(new Request("https://x/"), e);
    expect(r2.ok).toBe(false);
    globalThis.fetch = realFetch;
  });
});
