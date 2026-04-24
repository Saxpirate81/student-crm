"use client";

import { useRef, useState } from "react";
import type { NotationExercise } from "@/lib/domain/types";
import { instrumentTimbre, pitchToHz } from "@/lib/music/notation";
import { NotationStaff } from "@/components/music/NotationStaff";

type ExerciseCardProps = {
  exercise: NotationExercise;
};

export function ExerciseCard({ exercise }: ExerciseCardProps) {
  const [playing, setPlaying] = useState(false);
  const timeoutsRef = useRef<number[]>([]);

  const clearPlaybackTimers = () => {
    for (const timer of timeoutsRef.current) {
      window.clearTimeout(timer);
    }
    timeoutsRef.current = [];
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
    <article className="ui-panel p-4">
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
      <div className="mt-3">
        <NotationStaff notes={exercise.notes} />
      </div>
    </article>
  );
}
