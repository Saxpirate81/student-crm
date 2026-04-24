"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";

/** Parent routes are for parent (or producer preview) sessions — not family student logins. */
export function ParentSessionGate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (session?.kind === "child") {
      router.replace("/student");
    }
  }, [ready, session, router]);

  if (ready && session?.kind === "child") {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-8 text-center dark:border-white/10 dark:bg-slate-900/50">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Redirecting to your student space…</p>
        <Link href="/student" className="mt-3 inline-block text-sm font-bold text-indigo-600 underline dark:text-indigo-400">
          Open student view
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
