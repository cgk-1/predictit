import { useCallback, useState } from "react";

const PREFIX = "predictit.ui.";

/** Read a stored boolean UI preference (open/closed section, toggle). Null when nothing is stored or storage is unavailable. */
export function readPref(key: string): boolean | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* storage unavailable (private window, SSR) */
  }
  return null;
}

export function writePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(PREFIX + key, value ? "1" : "0");
  } catch {
    /* storage unavailable: preference is session-only */
  }
}

/**
 * Boolean UI preference remembered per browser (never sent to the server). `fallback` applies when nothing is
 * stored; `collapseBelowPx` overrides the fallback to `false` on narrow viewports (phones) at first render.
 */
export function useStoredBool(key: string, fallback: boolean, collapseBelowPx?: number): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    const stored = readPref(key);
    if (stored !== null) return stored;
    if (collapseBelowPx !== undefined && typeof window !== "undefined" && window.innerWidth <= collapseBelowPx) return false;
    return fallback;
  });
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      writePref(key, v);
    },
    [key],
  );
  return [value, set];
}
