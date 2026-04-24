"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";

export default function ProducerPage() {
  const { session, ready } = useAuth();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
          Producer
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Producer workspace</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          This area is for studio administrators and producers. The command surface is not built yet; next we will
          move admin-style tools here and wire real permissions.
        </p>

        {ready && session?.kind !== "producer" && (
          <p className="mt-4 rounded-xl border border-violet-200/80 bg-violet-50/80 px-3 py-2 text-sm text-violet-950 dark:border-violet-500/25 dark:bg-violet-950/35 dark:text-violet-100">
            Sign in with the producer tab on{" "}
            <Link href="/auth/login" className="font-bold underline-offset-2 hover:underline">
              Log in
            </Link>{" "}
            to attach a mock producer session to this view.
          </p>
        )}

        {ready && session?.kind === "producer" && (
          <p className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/30 dark:text-emerald-100">
            Signed in as <span className="font-bold">{session.displayName}</span> ({session.email})
          </p>
        )}
      </section>

      {ready && session?.kind === "producer" && (
        <section className="rounded-2xl border border-dashed border-slate-300/90 bg-slate-50/50 p-6 dark:border-white/15 dark:bg-slate-950/40">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Coming next</h2>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <li>Organization-wide publishing and media workflows</li>
            <li>Producer-specific dashboards (separate from household parent tools)</li>
          </ul>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Until then, the legacy mock admin desk remains available.
          </p>
          <Link
            href="/admin"
            className="mt-3 inline-flex rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
          >
            Open admin command center
          </Link>
        </section>
      )}
    </div>
  );
}
