export const THEME_STORAGE_KEY = "rs-ui-theme";

export type UiTheme = "light" | "dark";

export function readStoredTheme(): UiTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredTheme(theme: UiTheme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyThemeToDocument(theme: UiTheme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}
