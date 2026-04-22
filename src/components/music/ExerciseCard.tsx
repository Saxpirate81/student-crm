"use client";

import { useRef, useState } from "react";
import type { NotationExercise } from "@/lib/domain/types";
import { formatExercisePattern, instrumentTimbre, pitchToHz } from "@/lib/music/notation";
import { NotationStaff } from "@/components/music/NotationStaff";

type ExerciseCardProps = {
  exercise: NotationExercise;
};

export function ExerciseCard({ exercise }: ExerciseCardProps) {
  const [playing, setPlaying] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const clearPlaybackTimers = () => {
    for (const timer of timeoutsRef.current) {
      window.clearTimeout(timer);
    }
    timeoutsRef.current = [];
    setActiveNoteId(null);
    setPlaying(false);
  };

  const playExercise = async () => {
    if (playing || typeof window === "undefined" || exercise.notes.length === 0) return;
    setPlaying(true);
    const context = new AudioContext();
    const beatSec = 60 / Math.max(40, Math.min(220, exercise.tempoBpm));
    const timbre = instrumentTimbre(exercise.instrument);
    let offset = 0;

    for (const note of exercise.notes) {
      const startSec = offset;
      const durationSec = Math.max(0.06, note.beats * beatSec);
      const timer = window.setTimeout(() => {
        setActiveNoteId(note.id);
        const frequency = pitchToHz(note.pitch);
        if (frequency == null) return;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = timbre.wave;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.linearRampToValueAtTime(
          timbre.gain,
          context.currentTime + Math.min(durationSec * 0.35, timbre.attackSec),
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + Math.max(0.04, durationSec - timbre.releaseSec),
        );
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + durationSec);
      }, Math.round(startSec * 1000));
      timeoutsRef.current.push(timer);
      offset += durationSec;
    }

    const endTimer = window.setTimeout(async () => {
      clearPlaybackTimers();
      await context.close();
    }, Math.round(offset * 1000) + 120);
    timeoutsRef.current.push(endTimer);
  };

  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{exercise.title}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {exercise.instrument} · {exercise.tempoBpm} BPM
          </p>
        </div>
        <button
          type="button"
          onClick={playing ? clearPlaybackTimers : playExercise}
          className={`${playing ? "ui-button-danger" : "ui-button-primary"} rounded-full px-3 py-1.5 text-xs font-semibold`}
        >
          {playing ? "Stop" : "Play"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {exercise.notes.map((note) => (
          <span
            key={note.id}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
              activeNoteId === note.id
                ? "bg-indigo-600 text-white"
                : "border border-slate-300/90 bg-slate-100 text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
            }`}
          >
            {note.pitch} · {note.beats}
          </span>
        ))}
      </div>

      <div className="mt-3">
        <NotationStaff notes={exercise.notes} />
      </div>

      <p className="mt-3 break-all text-[11px] text-slate-500 dark:text-slate-400">
        Pattern: {formatExercisePattern(exercise.notes)}
      </p>
    </article>
  );
}
