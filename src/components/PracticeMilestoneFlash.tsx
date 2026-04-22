"use client";

type PracticeMilestoneFlashProps = {
  minutes: number | null;
  onDismiss: () => void;
};

export function PracticeMilestoneFlash({ minutes, onDismiss }: PracticeMilestoneFlashProps) {
  if (!minutes) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[200] flex items-start justify-center pt-24 sm:pt-28"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto mx-4 w-full max-w-sm animate-[milestone-pop_2.8s_ease-out_forwards] rounded-2xl border border-white/30 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-4 text-center text-white shadow-2xl shadow-indigo-900/40">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Milestone</p>
        <p className="mt-1 text-2xl font-black tracking-tight">{minutes} minutes</p>
        <p className="mt-1 text-sm font-semibold text-white/95">Great job — keep building your sound.</p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 text-[11px] font-bold uppercase tracking-wider text-white/70 underline-offset-2 hover:text-white hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
