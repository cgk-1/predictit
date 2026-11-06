/**
 * Access control. Two independent mechanisms, both enforced server-side on EVERY request (assets, API, streams):
 *
 *  1. Cloudflare Access (preferred): when ACCESS_AUD is configured, the request must carry a valid
 *     Cf-Access-Jwt-Assertion signed by the team's JWKS, with matching aud and an allowed e-mail.
 *  2. Gatekeeper fallback: a server-side passphrase login (constant-time compare, rate limited in a Durable Object)
 *     that issues an HMAC-signed, HttpOnly, Secure, SameSite=Strict session cookie.
 *
 * If neither is configured the Worker refuses to serve anything (503), so an unprotected deployment is impossible.
 */
import { allowedEmails, type Env } from "./env";

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    // still do a full-length compare to avoid leaking length via timing
    let d = 0;
    for (let i = 0; i < Math.max(ab.length, bb.length); i++) d |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
    return false;
  }
  let d = 0;
  for (let i = 0; i < ab.length; i++) d |= ab[i]! ^ bb[i]!;
  return d === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface Session {
  sub: string;
  iat: number;
  exp: number;
  via: "access" | "gate";
}

export async function signSession(secret: string, s: Session): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(s)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(secret: string, token: string | null, now = Date.now()): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(sig), enc.encode(payload));
  if (!ok) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Session;
    if (typeof s.exp !== "number" || s.exp * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}

export function getCookie(req: Request, name: string): string | null {
  const c = req.headers.get("cookie") ?? "";
  for (const part of c.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export const SESSION_COOKIE = "pi_session";
export const SESSION_TTL_SEC = 12 * 3600;

export function sessionCookie(token: string, maxAge = SESSION_TTL_SEC): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// ---- Cloudflare Access JWT verification (RS256 via JWKS, cached) ----

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function fetchJwks(teamDomain: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < 6 * 3600_000) return jwksCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const j = (await res.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), keys: j.keys };
  return j.keys;
}

export interface AccessClaims { aud: string[] | string; email?: string; exp: number; iat: number; iss: string; sub: string; common_name?: string }

export async function verifyAccessJwt(env: Env, token: string | null): Promise<AccessClaims | null> {
  if (!token || !env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  let header: { kid?: string; alg?: string };
  let claims: AccessClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;
  const keys = await fetchJwks(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(s), enc.encode(`${h}.${p}`));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  const allowed = allowedEmails(env);
  if (allowed.length && (!claims.email || !allowed.includes(claims.email.toLowerCase()))) return null;
  return claims;
}

export type AuthResult = { ok: true; session: Session } | { ok: false; status: 401 | 503; reason: string };

export async function authenticate(req: Request, env: Env): Promise<AuthResult> {
  const accessConfigured = !!(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN);
  const gateConfigured = !!(env.GATE_PASSPHRASE && env.SESSION_SECRET);
  if (!accessConfigured && !gateConfigured) return { ok: false, status: 503, reason: "Authentication is not configured; refusing to serve." };
  if (accessConfigured) {
    const claims = await verifyAccessJwt(env, req.headers.get("cf-access-jwt-assertion"));
    if (claims) return { ok: true, session: { sub: claims.email ?? claims.sub, iat: claims.iat, exp: claims.exp, via: "access" } };
    if (!gateConfigured) return { ok: false, status: 401, reason: "Cloudflare Access token missing or invalid." };
  }
  if (gateConfigured) {
    const s = await verifySession(env.SESSION_SECRET!, getCookie(req, SESSION_COOKIE));
    if (s) return { ok: true, session: s };
  }
  return { ok: false, status: 401, reason: "Not signed in." };
}
