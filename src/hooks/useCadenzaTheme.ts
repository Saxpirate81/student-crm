"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import {
  applyThemeToDocument,
  readStoredTheme,
  writeStoredTheme,
  DEFAULT_UI_THEME,
  type UiTheme,
} from "@/lib/theme-storage";

export function useCadenzaTheme() {
  const [theme, setThemeState] = useState<UiTheme>(DEFAULT_UI_THEME);

  useLayoutEffect(() => {
    const initial = readStoredTheme() ?? DEFAULT_UI_THEME;
    setThemeState(initial);
    applyThemeToDocument(initial);

    const sync = () => {
      const next = readStoredTheme() ?? DEFAULT_UI_THEME;
      setThemeState(next);
      applyThemeToDocument(next);
    };

    window.addEventListener("storage", sync);
    window.addEventListener("rs-ui-theme-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("rs-ui-theme-change", sync);
    };
  }, []);

  const setTheme = useCallback((next: UiTheme) => {
    setThemeState(next);
    writeStoredTheme(next);
    applyThemeToDocument(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: UiTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme };
}
