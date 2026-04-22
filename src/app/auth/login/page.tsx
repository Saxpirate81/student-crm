"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { MOCK_DEMO_PASSWORD } from "@/lib/auth/constants";

type Tab = "parent" | "family";

export default function LoginPage() {
  const router = useRouter();
  const { loginAsParent, loginAsChild } = useAuth();
  const [tab, setTab] = useState<Tab>("parent");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [familyParentEmail, setFamilyParentEmail] = useState("");
  const [screenName, setScreenName] = useState("");
  const [familyPassword, setFamilyPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitParent = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const ok = loginAsParent(parentEmail, parentPassword);
    if (!ok) {
      setError("Email or password does not match.");
      return;
    }
    router.push("/parent");
  };

  const submitFamily = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const ok = loginAsChild(familyParentEmail, screenName, familyPassword);
    if (!ok) {
      setError("Check parent account email, screen name, and password.");
      return;
    }
    router.push("/student");
  };

  return (
    <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl shadow-slate-900/[0.06] backdrop-blur-xl dark:shadow-black/40 sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
        Mock authentication
      </p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">Log in</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Parents use email. Family members use the parent&apos;s email + their screen name. For quick tests,
        use password <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{MOCK_DEMO_PASSWORD}</span>.
      </p>

      <div className="mt-5 flex rounded-full border border-slate-200/90 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-slate-950/60">
        <button
          type="button"
          onClick={() => {
            setTab("parent");
            setError(null);
          }}
          className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition ${
            tab === "parent"
              ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300"
              : "text-slate-600 dark:text-slate-400"
          }`}
        >
          Parent (email)
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("family");
            setError(null);
          }}
          className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition ${
            tab === "family"
              ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300"
              : "text-slate-600 dark:text-slate-400"
          }`}
        >
          Family (screen name)
        </button>
      </div>

      {error && (
        <p
          className="mt-4 rounded-xl border border-rose-200/80 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {tab === "parent" ? (
        <form className="mt-5 space-y-4" onSubmit={submitParent}>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Parent email
            <input
              required
              type="email"
              autoComplete="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={parentPassword}
              onChange={(e) => setParentPassword(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="ui-button-primary w-full rounded-xl py-2.5 text-sm font-bold shadow-md"
          >
            Continue as parent
          </button>
        </form>
      ) : (
        <form className="mt-5 space-y-4" onSubmit={submitFamily}>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Parent account email
            <input
              required
              type="email"
              autoComplete="username"
              value={familyParentEmail}
              onChange={(e) => setFamilyParentEmail(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Screen name
            <input
              required
              type="text"
              autoComplete="nickname"
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={familyPassword}
              onChange={(e) => setFamilyPassword(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="ui-button-primary w-full rounded-xl py-2.5 text-sm font-bold shadow-md"
          >
            Continue as student
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-2 border-t border-slate-200/80 pt-5 text-sm dark:border-white/10">
        <Link
          href="/auth/forgot"
          className="font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
        >
          Forgot parent password?
        </Link>
        <p className="text-slate-600 dark:text-slate-400">
          New household?{" "}
          <Link href="/auth/signup" className="font-bold text-indigo-600 hover:underline dark:text-indigo-400">
            Create an account
          </Link>
        </p>
        <Link href="/" className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300">
          ← Back to prototype home
        </Link>
      </div>
    </div>
  );
}
