export interface Env {
  ASSETS: Fetcher;
  MARKET: DurableObjectNamespace;
  GATE: DurableObjectNamespace;
  CONFIG: KVNamespace;
  ARCHIVE: R2Bucket;
  APP_NAME: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAILS: string;
  SCHWAB_REDIRECT_URI: string;
  ARCHIVE_CBOE: string;
  // secrets
  GATE_PASSPHRASE?: string;
  SESSION_SECRET?: string;
  SCHWAB_CLIENT_ID?: string;
  SCHWAB_CLIENT_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function allowedEmails(env: Env): string[] {
  return env.ALLOWED_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
