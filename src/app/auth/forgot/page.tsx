"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";

export default function ForgotPasswordPage() {
  const { requestEmailReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ token: string; origin: string } | null>(null);
  const [generic, setGeneric] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setGeneric(false);
    setSent(null);
    const result = requestEmailReset(email);
    if (!result.ok) {
      setGeneric(true);
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setSent({ token: result.token, origin });
  };

  return (
    <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl shadow-slate-900/[0.06] backdrop-blur-xl dark:shadow-black/40 sm:p-8">
      <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Reset parent password</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        In production we would email a secure link. In this mock, we generate a token and show the link here so you
        can test the full flow without SMTP.
      </p>

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Parent account email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="ui-button-primary w-full rounded-xl py-2.5 text-sm font-bold shadow-md"
        >
          Send reset link (mock)
        </button>
      </form>

      {generic && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
          If an account exists for that email, you would receive a reset link. (Mock UI does not reveal whether the
          address was found — try signing up or double-check the spelling.)
        </p>
      )}

      {sent && (
        <div className="mt-4 space-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-3 text-sm text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/35 dark:text-emerald-100">
          <p className="font-semibold">Mock “email” — open this link to choose a new password:</p>
          <code className="block break-all rounded-lg bg-white/80 px-2 py-2 text-xs dark:bg-slate-950/60">
            {`${sent.origin}/auth/reset?token=${sent.token}`}
          </code>
          <Link
            href={`/auth/reset?token=${encodeURIComponent(sent.token)}`}
            className="inline-block font-bold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-200"
          >
            Open reset page →
          </Link>
        </div>
      )}

      <div className="mt-6 text-sm">
        <Link href="/auth/login" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          ← Back to log in
        </Link>
      </div>
    </div>
  );
}
