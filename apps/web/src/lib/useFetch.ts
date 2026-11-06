import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";

export interface Fetched<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  fetchedAt: number | null;
  reload: () => void;
}

/**
 * Fetch-on-mount (and optionally poll) helper for secondary endpoints. `key` restarts the request when it changes;
 * `intervalMs` re-fetches while the tab is visible. Stale responses are discarded via AbortController.
 */
export function useFetch<T>(fn: (signal: AbortSignal) => Promise<T>, key: string, intervalMs?: number): Fetched<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const run = async () => {
      setLoading(true);
      try {
        const d = await fnRef.current(ac.signal);
        if (!alive || ac.signal.aborted) return;
        setData(d);
        setError(null);
        setFetchedAt(Date.now());
      } catch (e) {
        if (!alive || (e as Error).name === "AbortError") return;
        setError(e instanceof ApiError ? e.message : (e as Error).message || "request failed");
      } finally {
        if (alive && !ac.signal.aborted) {
          setLoading(false);
          if (intervalMs) timer = setTimeout(() => void run(), document.visibilityState === "hidden" ? intervalMs * 4 : intervalMs);
        }
      }
    };
    void run();
    return () => {
      alive = false;
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [key, nonce, intervalMs]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, fetchedAt, reload };
}
