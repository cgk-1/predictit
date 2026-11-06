import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "predictit.theme";

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
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
