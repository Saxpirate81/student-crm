"use client";

import Link from "next/link";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";

type Props = {
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
};

export function StudioBackFrame({ backHref, backLabel, children }: Props) {
  const { theme, toggleTheme } = useCadenzaTheme();
  return (
    <div className="cadenza-app session-app" data-theme={theme}>
      <header className="session-backbar">
        <Link href={backHref} className="session-back-link">
          ← {backLabel}
        </Link>
        <button className="theme-toggle" onClick={toggleTheme} type="button">
          <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
          <span className="toggle-track">
            <span className="toggle-knob" />
          </span>
          <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
        </button>
      </header>
      <main className="session-main">{children}</main>
    </div>
  );
}
