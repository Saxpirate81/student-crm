"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Student routes are for family (child) sessions or unsigned demo browsing.
 * Parents manage children from `/parent`; producers use `/producer`.
 */
export function StudentSessionGate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (session?.kind === "parent") {
      router.replace("/parent");
      return;
    }
    if (session?.kind === "producer") {
      router.replace("/producer");
    }
  }, [ready, session, router]);

  if (ready && (session?.kind === "parent" || session?.kind === "producer")) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-8 text-center dark:border-white/10 dark:bg-slate-900/50">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Redirecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
