"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth/auth-context";
import {
  DEV_SKIP_LOGIN_ALLOWED_PREFIXES,
  DEV_SKIP_LOGIN_FOR_STAFF_WORK,
} from "@/lib/auth/constants";

function isAuthPath(pathname: string) {
  return pathname.startsWith("/auth");
}

function isStaticPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg"
  );
}

function isDevBypassPath(pathname: string) {
  if (!DEV_SKIP_LOGIN_FOR_STAFF_WORK) return false;
  if (pathname === "/") return true;
  return DEV_SKIP_LOGIN_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Full-bleed studio shell; no global Real School header (page provides its own nav). */
function omitGlobalAppChrome(pathname: string) {
  return pathname === "/admin/database-setup";
}

function GateSpinner() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--background)] px-4">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-white/20 dark:border-t-indigo-400"
        aria-hidden
      />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading…</p>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready } = useAuth();

  const authArea = isAuthPath(pathname);
  const staticAsset = isStaticPath(pathname);
  const devBypassArea = isDevBypassPath(pathname);

  useEffect(() => {
    if (!ready || staticAsset) return;
    if (session && pathname.startsWith("/auth/login")) {
      router.replace("/");
      return;
    }
    if (!session && !authArea && !devBypassArea) {
      const qs = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/auth/login${qs}`);
    }
  }, [ready, session, pathname, router, authArea, staticAsset, devBypassArea]);

  if (staticAsset) {
    return <>{children}</>;
  }

  if (!ready) {
    if (authArea || devBypassArea) {
      return <>{children}</>;
    }
    return <GateSpinner />;
  }

  if (!session && !authArea && !devBypassArea) {
    return <GateSpinner />;
  }

  if (!session && authArea) {
    return <>{children}</>;
  }

  const bareChrome = omitGlobalAppChrome(pathname) || devBypassArea;

  return (
    <>
      {!bareChrome ? <AppHeader /> : null}
      <main
        className={
          bareChrome
            ? "min-h-dvh w-full max-w-none overflow-x-hidden p-0"
            : "mx-auto max-w-6xl px-4 py-6"
        }
      >
        {children}
      </main>
    </>
  );
}
