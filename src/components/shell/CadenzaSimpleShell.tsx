"use client";

import { type ReactNode, useMemo } from "react";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";

type Props = {
  title: string;
  right?: ReactNode;
  children: ReactNode;
};

export function CadenzaSimpleShell({ title, right, children }: Props) {
  const { theme, toggleTheme } = useCadenzaTheme();
  const pageTitle = useMemo(() => title, [title]);

  return (
    <div className="cadenza-app" data-theme={theme} style={{ inset: 0, position: "fixed", zIndex: 70 }}>
      <div className="c-main" style={{ width: "100%" }}>
        <div className="topbar">
          <div className="page-title">{pageTitle}</div>
          <div className="topbar-right">
            <button className="theme-toggle" onClick={toggleTheme} type="button">
              <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
              <span className="toggle-track">
                <span className="toggle-knob" />
              </span>
              <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
            {right}
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
