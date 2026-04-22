"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { completeEmailReset } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token.trim()) {
      setError("Missing token. Open the link from the forgot-password screen.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const result = completeEmailReset(token.trim(), password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.push("/auth/login");
  };

  if (done) {
    return (
      <p className="text-center text-sm font-medium text-emerald-700 dark:text-emerald-300">
        Password updated. Redirecting to log in…
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {!token && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          Add <span className="font-mono">?token=…</span> to the URL (from the mock email on the forgot page).
        </p>
      )}
      <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
        New password
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
        Confirm password
        <input
          required
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
        />
      </label>
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="ui-button-primary w-full rounded-xl py-2.5 text-sm font-bold shadow-md"
      >
        Save new password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl shadow-slate-900/[0.06] backdrop-blur-xl dark:shadow-black/40 sm:p-8">
      <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Set new password</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Parent accounts only (email-based recovery).</p>

      <div className="mt-6">
        <Suspense
          fallback={<p className="text-sm text-slate-500 dark:text-slate-400">Loading reset form…</p>}
        >
          <ResetForm />
        </Suspense>
      </div>

      <div className="mt-6 text-sm">
        <Link href="/auth/login" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          ← Back to log in
        </Link>
      </div>
    </div>
  );
}
