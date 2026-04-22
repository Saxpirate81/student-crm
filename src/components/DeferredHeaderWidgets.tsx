"use client";

import { useEffect, useState } from "react";
import { SessionChrome } from "@/components/SessionChrome";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Session + theme controls touch sessionStorage/localStorage and the document root.
 * Mounting them only after the first client effect avoids hydration mismatches (React #418)
 * between SSR markup and the first client pass.
 */
export function DeferredHeaderWidgets() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
  }, []);

  if (!show) {
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        aria-busy="true"
        suppressHydrationWarning
      >
        <div className="h-8 w-28 animate-pulse rounded-full bg-slate-200/90 dark:bg-white/10" />
        <div className="h-8 w-24 animate-pulse rounded-full bg-slate-200/90 dark:bg-white/10" />
      </div>
    );
  }

  return (
    <>
      <SessionChrome />
      <ThemeToggle />
    </>
  );
}
