"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { DEV_SKIP_LOGIN_FOR_STAFF_WORK } from "@/lib/auth/constants";

function HomeSpinner() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-white/20 dark:border-t-indigo-400"
        aria-hidden
      />
      <p className="text-sm text-slate-600 dark:text-slate-400">Taking you to your home…</p>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { session, ready, logout } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      if (DEV_SKIP_LOGIN_FOR_STAFF_WORK) {
        router.replace("/producer");
        return;
      }
      router.replace("/auth/login");
      return;
    }
    if (session.kind === "parent") {
      router.replace("/parent");
      return;
    }
    if (session.kind === "child") {
      router.replace("/student");
      return;
    }
    if (session.kind === "producer") {
      router.replace("/producer");
      return;
    }
    logout();
    router.replace("/auth/login");
  }, [ready, session, router, logout]);

  if (!ready || !session) {
    return <HomeSpinner />;
  }

  return <HomeSpinner />;
}
