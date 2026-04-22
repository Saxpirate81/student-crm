"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { MOCK_DEMO_PASSWORD } from "@/lib/auth/constants";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [orgName, setOrgName] = useState("Rivera Household");
  const [parentName, setParentName] = useState("Jordan Rivera");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(MOCK_DEMO_PASSWORD);
  const [addChild, setAddChild] = useState(true);
  const [childDisplay, setChildDisplay] = useState("Alex Rivera");
  const [childScreen, setChildScreen] = useState("alexr");
  const [childPassword, setChildPassword] = useState(MOCK_DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const firstChild = addChild
      ? {
          displayName: childDisplay,
          screenName: childScreen,
          password: childPassword,
        }
      : null;
    const result = signUp(
      {
        organizationName: orgName,
        parentDisplayName: parentName,
        email,
        password,
      },
      firstChild,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/parent");
  };

  return (
    <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl shadow-slate-900/[0.06] backdrop-blur-xl dark:shadow-black/40 sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
        Household signup
      </p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">Create account</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        We store an <strong className="font-semibold text-slate-800 dark:text-slate-200">organization id</strong>,{" "}
        <strong className="font-semibold text-slate-800 dark:text-slate-200">parent id</strong>, and optional{" "}
        <strong className="font-semibold text-slate-800 dark:text-slate-200">child ids</strong> in local mock data.
        Passwords are plain text for this prototype — use{" "}
        <span className="font-mono font-semibold">{MOCK_DEMO_PASSWORD}</span> while iterating.
      </p>

      <form className="mt-6 space-y-5" onSubmit={submit}>
        <fieldset className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-slate-950/30">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Parent (email is the login)
          </legend>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Organization / household name
            <input
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Your display name
            <input
              required
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
        </fieldset>

        <div className="flex items-center gap-2">
          <input
            id="add-child"
            type="checkbox"
            checked={addChild}
            onChange={(e) => setAddChild(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500/40 dark:border-white/15 dark:bg-slate-950/50"
          />
          <label htmlFor="add-child" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Add first family member (student) now
          </label>
        </div>

        {addChild && (
          <fieldset className="space-y-3 rounded-2xl border border-indigo-200/60 bg-indigo-50/40 p-4 dark:border-indigo-500/20 dark:bg-indigo-950/25">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Family member (unique screen name in org)
            </legend>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Display name
              <input
                required={addChild}
                value={childDisplay}
                onChange={(e) => setChildDisplay(e.target.value)}
                className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Screen name
              <input
                required={addChild}
                value={childScreen}
                onChange={(e) => setChildScreen(e.target.value)}
                className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Password
              <input
                required={addChild}
                type="password"
                value={childPassword}
                onChange={(e) => setChildPassword(e.target.value)}
                className="ui-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
              />
            </label>
          </fieldset>
        )}

        {error && (
          <p className="rounded-xl border border-rose-200/80 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="ui-button-primary w-full rounded-xl py-2.5 text-sm font-bold shadow-md"
        >
          Create household
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-bold text-indigo-600 hover:underline dark:text-indigo-400">
          Log in
        </Link>
      </p>
      <Link href="/" className="mt-2 block text-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300">
        ← Back to prototype home
      </Link>
    </div>
  );
}
