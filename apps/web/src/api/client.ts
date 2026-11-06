/**
 * Same-origin JSON client for the Worker API. Every call goes through apiFetch so error handling is uniform:
 * non-2xx responses become ApiError(status, message) using the server's { error } body when present,
 * network failures become ApiError(0, ...), and a 401 invokes the registered unauthorized handler
 * (the app reloads so the Worker can serve its login shell).
 */
import type { ChangeEvent, DecisionRecord, PaperPosition } from "@predictit/engine";
import type { AppSettings, BarsResponse, ChainResponse, DateEntry, LeanResponse, PerformanceResponse, ReplayResponse, SchwabStatus, ServerState } from "./types";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

export interface ApiInit {
  method?: string;
  json?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers, body, credentials: "same-origin", signal: init.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, `Network error: ${(e as Error).message || "request failed"}`);
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: unknown };
      if (j && typeof j.error === "string" && j.error) message = j.error;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface OpenPositionInput {
  osi: string;
  qty: number;
  entryPremium: number;
  entryAt?: number;
  note?: string;
  invalidationLevel?: number | null;
  horizonMinutes?: number | null;
  profitTargetPremium?: number | null;
  trail?: { activateAt: number; trailPts: number } | null;
  mode?: "paper" | "manual";
  decisionId?: string | null;
  strategyId?: string | null;
}

export type SettingsPatch = Partial<Omit<AppSettings, "engine" | "closing">> & { engine?: Partial<AppSettings["engine"]>; closing?: Partial<AppSettings["closing"]> };

const q = (params: Record<string, string | number | undefined>): string => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const api = {
  state: (signal?: AbortSignal) => apiFetch<ServerState>("/api/state", { signal }),
  bars: (symbol: "SPX" | "SPY", signal?: AbortSignal) => apiFetch<BarsResponse>(`/api/bars${q({ symbol })}`, { signal }),
  chain: (pct = 0.03, days = 10) => apiFetch<ChainResponse>(`/api/chain${q({ pct, days })}`),
  decisions: (date: string, signal?: AbortSignal) => apiFetch<DecisionRecord[]>(`/api/decisions${q({ date })}`, { signal }),
  changes: (date: string, signal?: AbortSignal) => apiFetch<ChangeEvent[]>(`/api/changes${q({ date })}`, { signal }),
  dates: (signal?: AbortSignal) => apiFetch<DateEntry[]>("/api/dates", { signal }),
  replay: (date: string, at: number, signal?: AbortSignal) => apiFetch<ReplayResponse>(`/api/replay${q({ date, at })}`, { signal }),
  performance: (signal?: AbortSignal) => apiFetch<PerformanceResponse>("/api/performance", { signal }),
  positions: (date?: string, signal?: AbortSignal) => apiFetch<PaperPosition[]>(`/api/positions${q({ date })}`, { signal }),
  openPosition: (input: OpenPositionInput) => apiFetch<PaperPosition>("/api/positions", { json: input }),
  closePosition: (id: string, premium: number, reason?: string) => apiFetch<PaperPosition>(`/api/positions/${encodeURIComponent(id)}/close`, { json: { premium, reason } }),
  getSettings: (signal?: AbortSignal) => apiFetch<AppSettings>("/api/settings", { signal }),
  putSettings: (patch: SettingsPatch) => apiFetch<AppSettings>("/api/settings", { method: "PUT", json: patch }),
  lean: (signal?: AbortSignal) => apiFetch<LeanResponse>("/api/lean", { signal }),
  schwabStatus: () => apiFetch<SchwabStatus>("/api/schwab/status"),
  schwabCredentials: (clientId: string, clientSecret: string) => apiFetch<SchwabStatus>("/api/schwab/credentials", { json: { clientId, clientSecret } }),
  schwabAuthUrl: () => apiFetch<{ url: string; redirectUri: string }>("/api/schwab/auth-url"),
  schwabCallback: (redirectedUrl: string) => apiFetch<SchwabStatus>("/api/schwab/callback", { json: { redirectedUrl } }),
  schwabDisconnect: () => apiFetch<{ ok: boolean }>("/api/schwab/disconnect", { method: "POST", json: {} }),
  me: (signal?: AbortSignal) => apiFetch<{ sub: string }>("/api/auth/me", { signal }),
  logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST", json: {} }),
};
