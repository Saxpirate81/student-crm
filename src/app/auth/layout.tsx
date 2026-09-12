import type { ReactNode } from "react";

/**
 * Full-viewport shell for login / signup — matches Cadenza “studio” dark hero energy
 * without pulling in the full cadenza-app shell.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-[#0d0520] via-[#150a30] to-[#0a1020] px-4 py-10 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl"
      />
      <div className="relative mx-auto flex w-full max-w-[460px] flex-col items-center">
        <div className="mb-8 text-center">
          <p className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-2xl font-black tracking-tight text-transparent">
            CADENZA
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">Music Studio</p>
          <p className="mt-3 text-sm text-slate-400">Real School — sign in or create a household</p>
        </div>
        {children}
      </div>
    </div>
  );
}
