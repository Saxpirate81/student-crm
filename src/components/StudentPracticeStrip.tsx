"use client";

import { usePathname } from "next/navigation";
import { useStudentPractice } from "@/app/student/student-practice-context";
import { LessonMetronomeCompact } from "@/components/LessonMetronomeCompact";
import { practiceTierIndex } from "@/lib/practice-total";

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function tierBadgeClass(tier: number) {
  if (tier <= 0) {
    return "border-slate-300/80 bg-slate-200/90 text-slate-800 dark:border-white/15 dark:bg-slate-800/90 dark:text-slate-100";
  }
  if (tier === 1) {
    return "border-amber-400/70 bg-amber-200/95 text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/25 dark:text-amber-100";
  }
  if (tier === 2) {
    return "border-orange-400/70 bg-orange-200/95 text-orange-950 dark:border-orange-400/40 dark:bg-orange-500/25 dark:text-orange-50";
  }
  if (tier === 3) {
    return "border-rose-400/70 bg-rose-200/95 text-rose-950 dark:border-rose-400/40 dark:bg-rose-500/25 dark:text-rose-50";
  }
  return "border-fuchsia-400/70 bg-gradient-to-r from-violet-500/90 to-fuchsia-500/90 text-white dark:from-violet-500 dark:to-fuchsia-600";
}

export function StudentPracticeStrip() {
  const pathname = usePathname() ?? "";
  const onLessonPage = pathname.startsWith("/student/lessons/");
  const { totalPracticeSeconds, activeSegmentSeconds, micStatus, retryMicAccess } = useStudentPractice();

  if (!onLessonPage) return null;

  const liveTotal = totalPracticeSeconds + activeSegmentSeconds;
  const tier = practiceTierIndex(liveTotal);
  const listening = micStatus === "listening";
  const activePulse = listening && activeSegmentSeconds > 0;
  const statusLabel =
    micStatus === "denied"
      ? "mic blocked"
      : activeSegmentSeconds > 0
        ? "session live"
        : listening
          ? "listening…"
          : "starting…";

  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-stretch md:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/45">
          <span
            className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${
              activePulse ? "bg-emerald-500" : listening ? "bg-indigo-400" : "bg-slate-300 dark:bg-slate-600"
            }`}
            aria-hidden
          >
            {activePulse && (
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Practice (auto from sound)
            </p>
            <p className="truncate text-sm font-black tabular-nums text-slate-900 dark:text-white">
              {formatClock(liveTotal)}
              <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{statusLabel}</span>
            </p>
          </div>
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${tierBadgeClass(tier)}`}
            title={`Practice badge · tier ${tier} (new color every 10 minutes)`}
          >
            P
          </div>
        </div>

        {micStatus === "denied" ? (
          <button
            type="button"
            onClick={() => retryMicAccess()}
            className="ui-button-danger shrink-0 self-start rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wide shadow-sm sm:self-center"
          >
            Mic blocked — retry
          </button>
        ) : null}
      </div>

      <div className="min-w-0 shrink-0 md:max-w-[min(100%,20rem)]">
        <LessonMetronomeCompact />
      </div>
    </div>
  );
}
