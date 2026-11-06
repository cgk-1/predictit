import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "predictit.theme";

/** Stored choice first; otherwise the attribute index.html ships with (dark by default). */
function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage unavailable */
  }
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readStored);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage unavailable: theme is session-only */
    }
  }, []);
  return [theme, setTheme];
}
