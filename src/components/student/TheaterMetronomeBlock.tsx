"use client";

import { MOCK_USER_KEYS, type AppRepository } from "@/lib/data/repository";
import type { MetronomeSound } from "@/lib/domain/types";
import { useMetronome } from "@/hooks/useMetronome";

type TheaterMetronomeBlockProps = {
  repository: AppRepository;
};

export function TheaterMetronomeBlock({ repository }: TheaterMetronomeBlockProps) {
  const {
    bpm,
    setBpm,
    metronomeOn,
    setMetronomeOn,
    metronomeSound,
    setMetronomeSound,
    soundOptions,
    minBpm,
    maxBpm,
  } = useMetronome(repository, MOCK_USER_KEYS.student);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-100/95 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-md dark:border-white/[0.08] dark:from-zinc-900/90 dark:to-zinc-950/90 dark:shadow-black/30 md:p-6">
      <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white md:text-base">Metronome</h3>
      <div className="mt-4 flex flex-wrap items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={() => setBpm((current) => Math.max(minBpm, current - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300/90 text-lg font-medium text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
        >
          −
        </button>
        <p className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-100 md:text-base">
          {bpm} <span className="text-xs font-medium text-slate-500 dark:text-zinc-500">BPM</span>
        </p>
        <button
          type="button"
          onClick={() => setBpm((current) => Math.min(maxBpm, current + 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300/90 text-lg font-medium text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
        >
          +
        </button>
        <label className="flex flex-1 flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400 sm:ml-1 md:text-sm">
          Sound
          <select
            value={metronomeSound}
            onChange={(event) => setMetronomeSound(event.target.value as MetronomeSound)}
            className="min-w-0 flex-1 rounded-full border border-slate-300/90 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-white/15 dark:bg-zinc-900/90 dark:text-white md:text-sm"
          >
            {soundOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setMetronomeOn((active) => !active)}
          className={`rounded-full px-5 py-2.5 text-xs font-semibold transition md:text-sm ${
            metronomeOn
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
              : "border border-slate-300/90 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          }`}
        >
          {metronomeOn ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}
