/**
 * Single polling loop for GET /api/state.
 *  - 3 s cadence while the tab is visible, 15 s while hidden; an immediate poll when the tab becomes visible.
 *  - Exponential backoff on errors (3 s → 6 → 12 → … capped at 60 s), reset on the next success.
 *  - Clock offset: serverTime is compared with the request's midpoint so countdowns can use "server now".
 * The hook is instantiated once in App and shared via context so views never start their own loops.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./client";
import type { ServerState } from "./types";

export const POLL_VISIBLE_MS = 3000;
export const POLL_HIDDEN_MS = 15_000;
export const BACKOFF_MAX_MS = 60_000;

export interface ServerConnection {
  state: ServerState | null;
  /** last error message, cleared on success */
  error: string | null;
  consecutiveErrors: number;
  lastOkAt: number | null;
  /** serverTime − client time, ms (positive when the client clock is behind) */
  offsetMs: number;
  loading: boolean;
  refresh: () => void;
}

export function backoffDelay(consecutiveErrors: number, base: number): number {
  if (consecutiveErrors <= 0) return base;
  return Math.min(BACKOFF_MAX_MS, base * 2 ** (consecutiveErrors - 1));
}

export function useServerState(): ServerConnection {
  const [state, setState] = useState<ServerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const errorsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);

  const schedule = useCallback((fn: () => void, ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, ms);
  }, []);

  const poll = useCallback(async () => {
    if (!aliveRef.current) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t0 = Date.now();
    try {
      const s = await api.state(ac.signal);
      if (!aliveRef.current || ac.signal.aborted) return;
      const t1 = Date.now();
      setOffsetMs(s.serverTime - (t0 + t1) / 2);
      setState(s);
      setError(null);
      setLastOkAt(t1);
      errorsRef.current = 0;
      setConsecutiveErrors(0);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!aliveRef.current) return;
      errorsRef.current += 1;
      setConsecutiveErrors(errorsRef.current);
      setError(e instanceof ApiError ? e.message : (e as Error).message || "request failed");
    } finally {
      if (aliveRef.current && !ac.signal.aborted) {
        setLoading(false);
        const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
        const base = hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
        schedule(() => void poll(), backoffDelay(errorsRef.current, base));
      }
    }
  }, [schedule]);

  useEffect(() => {
    aliveRef.current = true;
    void poll();
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVis);
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [poll]);

  const refresh = useCallback(() => void poll(), [poll]);

  return { state, error, consecutiveErrors, lastOkAt, offsetMs, loading, refresh };
}
