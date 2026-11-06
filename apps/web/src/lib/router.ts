/** Minimal History-API router: plain pathnames, no hash. The Worker serves the SPA for every non-/api path. */
import { useCallback, useEffect, useState, type MouseEvent } from "react";

const EVENT = "predictit:navigate";

export function navigate(path: string): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(EVENT));
}

export function useRoute(): string {
  const [path, setPath] = useState(() => (typeof window === "undefined" ? "/" : window.location.pathname));
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener("popstate", on);
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener(EVENT, on);
    };
  }, []);
  return path;
}

/** Click handler for <a href> that keeps modifier-clicks and middle-clicks native. */
export function useLinkClick(path: string): (e: MouseEvent<HTMLAnchorElement>) => void {
  return useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(path);
    },
    [path],
  );
}
