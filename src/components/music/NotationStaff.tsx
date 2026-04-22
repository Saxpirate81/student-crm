"use client";

import { useEffect, useMemo, useRef } from "react";
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";
import type { ExerciseNote } from "@/lib/domain/types";
import { MEASURE_BEATS } from "@/lib/music/notation";

type NotationStaffProps = {
  notes: ExerciseNote[];
};

function toVexKey(pitch: string): { key: string; accidental: "#" | "b" | null } | null {
  const match = pitch.trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return null;
  const letter = match[1].toLowerCase();
  const accidental = (match[2] || null) as "#" | "b" | null;
  const octave = match[3];
  return { key: `${letter}/${octave}`, accidental };
}

function beatsToDuration(beats: number): "8" | "q" | "h" | "w" {
  if (beats <= 0.5) return "8";
  if (beats <= 1) return "q";
  if (beats <= 2) return "h";
  return "w";
}

function toMeasures(notes: ExerciseNote[]): ExerciseNote[][] {
  const measures: ExerciseNote[][] = [[]];
  let currentBeats = 0;
  for (const note of notes) {
    const beats = Math.max(0.5, note.beats);
    if (currentBeats + beats > MEASURE_BEATS + 0.001) {
      measures.push([]);
      currentBeats = 0;
    }
    measures[measures.length - 1].push({ ...note, beats });
    currentBeats += beats;
    if (Math.abs(currentBeats - MEASURE_BEATS) < 0.001) {
      measures.push([]);
      currentBeats = 0;
    }
  }
  if (measures[measures.length - 1].length === 0 && measures.length > 1) measures.pop();
  return measures;
}

export function NotationStaff({ notes }: NotationStaffProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const safeNotes = useMemo(() => notes.slice(0, 64), [notes]);
  const measures = useMemo(() => toMeasures(safeNotes), [safeNotes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || safeNotes.length === 0) return;
    el.innerHTML = "";

    const measureWidth = 170;
    const leftPad = 10;
    const rightPad = 10;
    const width = Math.max(360, leftPad + rightPad + measures.length * measureWidth);
    const height = 140;

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();

    measures.forEach((measure, idx) => {
      const x = leftPad + idx * measureWidth;
      const stave = new Stave(x, 16, measureWidth);
      if (idx === 0) {
        stave.addClef("treble").addTimeSignature("4/4");
      }
      stave.setContext(context).draw();

      if (measure.length === 0) return;

      const staveNotes = measure
        .map((note) => {
          const duration = beatsToDuration(note.beats);
          if (note.pitch.toLowerCase() === "rest") {
            return new StaveNote({
              keys: ["b/4"],
              duration: `${duration}r`,
            });
          }

          const mapped = toVexKey(note.pitch);
          if (!mapped) return null;
          const staveNote = new StaveNote({
            keys: [mapped.key],
            duration,
          });
          if (mapped.accidental) {
            staveNote.addModifier(new Accidental(mapped.accidental), 0);
          }
          return staveNote;
        })
        .filter((n): n is StaveNote => n != null);

      if (staveNotes.length === 0) return;

      const voice = new Voice({
        numBeats: MEASURE_BEATS,
        beatValue: 4,
      });
      voice.addTickables(staveNotes);
      new Formatter().joinVoices([voice]).format([voice], measureWidth - (idx === 0 ? 70 : 24));
      voice.draw(context, stave);
    });
  }, [safeNotes, measures]);

  if (safeNotes.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">No notation notes in this exercise.</p>;
  }

  return <div ref={containerRef} className="w-full overflow-x-auto rounded-lg bg-white/70 p-2 dark:bg-slate-950/45" />;
}
