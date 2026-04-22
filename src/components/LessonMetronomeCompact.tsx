"use client";

import { MOCK_USER_KEYS } from "@/lib/data/repository";
import type { MetronomeSound } from "@/lib/domain/types";
import { useMetronome } from "@/hooks/useMetronome";
import { useRepository } from "@/lib/useRepository";

/**
 * Compact metronome for the lesson top bar (matches practice strip height on desktop).
 */
export function LessonMetronomeCompact() {
  const { repository } = useRepository();
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
    <div className="flex w-full min-w-0 flex-col justify-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/45 sm:max-w-[min(100%,22rem)] sm:shrink-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        Metronome
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setBpm((c) => Math.max(minBpm, c - 1))}
          className="ui-button-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          aria-label="Decrease BPM"
        >
          −
        </button>
        <span className="min-w-[3.25rem] text-center text-xs font-black tabular-nums text-slate-900 dark:text-white">
          {bpm}
        </span>
        <button
          type="button"
          onClick={() => setBpm((c) => Math.min(maxBpm, c + 1))}
          className="ui-button-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          aria-label="Increase BPM"
        >
          +
        </button>
        <select
          value={metronomeSound}
          onChange={(e) => setMetronomeSound(e.target.value as MetronomeSound)}
          className="ui-select min-w-0 max-w-[9.5rem] flex-1 rounded-full px-2 py-1 text-[10px] font-semibold"
          aria-label="Metronome sound"
        >
          {soundOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setMetronomeOn((v) => !v)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
            metronomeOn
              ? "bg-emerald-600 text-white shadow-sm"
              : "ui-button-secondary"
          }`}
        >
          {metronomeOn ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}
