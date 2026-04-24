import Link from "next/link";

const roles = [
  {
    href: "/student",
    title: "Student View",
    detail: "Family login: one student profile, lessons, and personal video tools.",
  },
  {
    href: "/parent",
    title: "Parent View",
    detail: "Parent login: switch between students in the household and manage family accounts.",
  },
  {
    href: "/instructor",
    title: "Instructor View",
    detail: "Upload to student profile, archive videos, and track assigned media.",
  },
  {
    href: "/producer",
    title: "Producer View",
    detail: "Studio admin / producer workspace (mock session). Command tools will land here next.",
  },
  {
    href: "/admin",
    title: "Admin View",
    detail: "Legacy mock command center for uploads, archive, and delete.",
  },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/90 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-indigo-500/25 dark:bg-indigo-950/40">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            Mock accounts
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            Sign up a household (organization id + parent email + family screen names) or log in to drive parent/student
            views with your mock session.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-full border border-indigo-400/60 bg-white/80 px-4 py-2 text-sm font-bold text-indigo-800 shadow-sm transition hover:bg-white dark:border-indigo-400/40 dark:bg-slate-900/60 dark:text-indigo-200 dark:hover:bg-slate-900"
          >
            Log in
          </a>
          <a
            href="/auth/signup"
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Sign up
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200/80 bg-indigo-50/90 p-5 dark:border-indigo-500/25 dark:bg-indigo-950/40">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
          Build Mode: Mock Data
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
          Real School Student Experience Prototype
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700 dark:text-slate-300">
          This scaffold uses local fixture data and localStorage persistence so your team can test UI and
          workflow before wiring Supabase and live datasets.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <Link
            key={role.href}
            href={role.href}
            className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 dark:border-white/10 dark:bg-slate-900/50 dark:hover:border-indigo-400/50"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{role.title}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{role.detail}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
