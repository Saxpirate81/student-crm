import Link from "next/link";
import { DeferredHeaderWidgets } from "@/components/DeferredHeaderWidgets";

const roles = [
  { href: "/student", label: "Student" },
  { href: "/parent", label: "Parent" },
  { href: "/instructor", label: "Instructor" },
  { href: "/admin", label: "Admin" },
];

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text font-black tracking-tight text-transparent dark:from-indigo-400 dark:to-fuchsia-400"
        >
          Real School
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <DeferredHeaderWidgets />
          <nav className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <Link
                key={role.href}
                href={role.href}
                className="ui-button-secondary rounded-full px-3 py-1 text-xs font-semibold"
              >
                {role.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
