"use client";

import { useEffect, useState } from "react";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";

type ThemeToggleProps = {
  /** Larger control for the student hero */
  variant?: "compact" | "hero";
};

export function ThemeToggle({ variant = "compact" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useCadenzaTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const label = theme === "dark" ? "Dark" : "Light";
  const isHero = variant === "hero";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!mounted}
      className={`inline-flex items-center gap-2 rounded-full border font-semibold transition ${
        isHero
          ? "border-white/25 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-md hover:bg-white/15 dark:border-white/15 dark:bg-black/30 dark:hover:bg-black/40"
          : "ui-button-secondary px-3 py-1.5 text-xs backdrop-blur"
      }`}
      aria-pressed={theme === "dark"}
      aria-label={`Switch theme, currently ${label}`}
    >
      <span className="text-base leading-none" aria-hidden>
        {theme === "dark" ? "☾" : "☀"}
      </span>
      <span>{label} mode</span>
    </button>
  );
}
