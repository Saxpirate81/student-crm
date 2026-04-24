"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";

export function SessionChrome() {
  const { session, ready, logout } = useAuth();

  if (!ready) {
    return <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Session…</span>;
  }

  if (!session) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/auth/login"
          className="ui-button-secondary rounded-full px-3 py-1 text-xs font-semibold"
        >
          Log in
        </Link>
        <Link
          href="/auth/signup"
          className="ui-button-primary rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const label =
    session.kind === "parent"
      ? `${session.displayName} (parent)`
      : session.kind === "producer"
        ? `${session.displayName} (producer)`
        : `${session.screenName} (family)`;

  const title =
    session.kind === "parent"
      ? session.email
      : session.kind === "producer"
        ? session.email
        : session.studentCrmId;

  return (
    <div className="flex max-w-[min(100%,220px)] flex-col items-end gap-1 sm:max-w-none sm:flex-row sm:items-center sm:gap-2">
      <span
        className="truncate text-right text-[11px] font-semibold text-slate-600 dark:text-slate-300"
        title={title}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => logout()}
        className="ui-button-secondary rounded-full px-3 py-1 text-xs font-semibold"
      >
        Log out
      </button>
    </div>
  );
}
