import type { ExerciseNote, MusicInstrument } from "@/lib/domain/types";

export const MEASURE_BEATS = 4;

export const INSTRUMENT_OPTIONS: { value: MusicInstrument; label: string }[] = [
  { value: "piano", label: "Piano" },
  { value: "guitar", label: "Guitar" },
  { value: "violin", label: "Violin" },
  { value: "cello", label: "Cello" },
  { value: "flute", label: "Flute" },
  { value: "clarinet", label: "Clarinet" },
  { value: "saxophone", label: "Saxophone" },
  { value: "trumpet", label: "Trumpet" },
  { value: "drums", label: "Drums" },
];

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function pitchToHz(pitch: string): number | null {
  if (pitch.toLowerCase() === "rest") return null;
  const match = pitch.trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] ?? "";
  const octave = Number.parseInt(match[3], 10);
  const key = `${letter}${accidental}`;
  const idx = NOTE_INDEX[key];
  if (idx == null || !Number.isFinite(octave)) return null;
  const midi = (octave + 1) * 12 + idx;
  return 440 * 2 ** ((midi - 69) / 12);
}

export function parseExercisePattern(input: string): ExerciseNote[] {
  const chunks = input
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const notes: ExerciseNote[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const token = chunks[i];
    const [pitchRaw, beatsRaw] = token.split(":");
    const pitch = (pitchRaw ?? "").trim();
    const beats = Number.parseFloat((beatsRaw ?? "1").trim());
    if (!pitch || !Number.isFinite(beats) || beats <= 0) continue;
    if (pitch.toLowerCase() !== "rest" && pitchToHz(pitch) == null) continue;
    notes.push({
      id: `n-${i + 1}`,
      pitch: pitch.toLowerCase() === "r" ? "rest" : pitch,
      beats: Math.max(0.25, Math.min(8, beats)),
    });
  }
  return notes;
}

export function formatExercisePattern(notes: ExerciseNote[]): string {
  return notes.map((n) => `${n.pitch}:${n.beats}`).join(" ");
}

export function instrumentTimbre(instrument: MusicInstrument): {
  wave: OscillatorType;
  gain: number;
  attackSec: number;
  releaseSec: number;
} {
  switch (instrument) {
    case "piano":
      return { wave: "triangle", gain: 0.13, attackSec: 0.01, releaseSec: 0.22 };
    case "guitar":
      return { wave: "triangle", gain: 0.11, attackSec: 0.005, releaseSec: 0.16 };
    case "violin":
      return { wave: "sawtooth", gain: 0.09, attackSec: 0.04, releaseSec: 0.18 };
    case "cello":
      return { wave: "sawtooth", gain: 0.1, attackSec: 0.03, releaseSec: 0.24 };
    case "flute":
      return { wave: "sine", gain: 0.12, attackSec: 0.03, releaseSec: 0.16 };
    case "clarinet":
      return { wave: "square", gain: 0.08, attackSec: 0.03, releaseSec: 0.16 };
    case "saxophone":
      return { wave: "square", gain: 0.09, attackSec: 0.02, releaseSec: 0.14 };
    case "trumpet":
      return { wave: "sawtooth", gain: 0.09, attackSec: 0.015, releaseSec: 0.12 };
    case "drums":
      return { wave: "square", gain: 0.15, attackSec: 0.001, releaseSec: 0.06 };
    default:
      return { wave: "triangle", gain: 0.1, attackSec: 0.02, releaseSec: 0.18 };
  }
}
