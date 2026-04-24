"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Accidental, Beam, Formatter, Renderer, Stave, StaveNote, StaveTie, Voice } from "vexflow";
import type { ExerciseNote } from "@/lib/domain/types";
import { MEASURE_BEATS } from "@/lib/music/notation";

const STEPS_PER_BEAT = 48; // supports 1/16 notes + triplet subdivisions cleanly
const TOTAL_STEPS = MEASURE_BEATS * STEPS_PER_BEAT;
const MID_MEASURE_STEPS = TOTAL_STEPS / 2;
const MEASURE_CANVAS_WIDTH = 320;
const MEASURE_CANVAS_HEIGHT = 170;
const NOTE_LAYOUT_WIDTH = 230;
const STAFF_TOP = 28;
const STAFF_BOTTOM = 124;
const STAFF_LEFT_WITH_HEADER = 78;
const STAFF_LEFT_PLAIN = 18;
const STAFF_RIGHT = 14;

const STAFF_PITCHES = [
  "A5",
  "G5",
  "F5",
  "E5",
  "D5",
  "C5",
  "B4",
  "A4",
  "G4",
  "F4",
  "E4",
  "D4",
  "C4",
  "B3",
  "A3",
  "G3",
];

const DURATION_OPTIONS = [
  { id: "sixteenth", shortLabel: "1/16", label: "Sixteenth", beats: 0.25 },
  { id: "dotted-sixteenth", shortLabel: "Dotted 1/16", label: "Dotted sixteenth", beats: 0.375 },
  { id: "eighth", shortLabel: "1/8", label: "Eighth", beats: 0.5 },
  { id: "dotted-eighth", shortLabel: "Dotted 1/8", label: "Dotted eighth", beats: 0.75 },
  { id: "quarter", shortLabel: "1/4", label: "Quarter", beats: 1 },
  { id: "dotted-quarter", shortLabel: "Dotted 1/4", label: "Dotted quarter", beats: 1.5 },
  { id: "half", shortLabel: "1/2", label: "Half", beats: 2 },
  { id: "dotted-half", shortLabel: "Dotted 1/2", label: "Dotted half", beats: 3 },
  { id: "whole", shortLabel: "Whole", label: "Whole", beats: 4 },
] as const;

const KEY_SIGNATURE_OPTIONS = ["C", "G", "D", "A", "E", "B", "F#", "Bb", "Eb", "Ab", "Db", "Gb", "F"] as const;
type KeySignature = (typeof KEY_SIGNATURE_OPTIONS)[number];
type AccidentalMode = "auto" | "natural" | "sharp" | "flat";

const KEY_ACCIDENTALS: Record<KeySignature, { mode: "sharp" | "flat" | "none"; letters: string[] }> = {
  C: { mode: "none", letters: [] },
  G: { mode: "sharp", letters: ["F"] },
  D: { mode: "sharp", letters: ["F", "C"] },
  A: { mode: "sharp", letters: ["F", "C", "G"] },
  E: { mode: "sharp", letters: ["F", "C", "G", "D"] },
  B: { mode: "sharp", letters: ["F", "C", "G", "D", "A"] },
  "F#": { mode: "sharp", letters: ["F", "C", "G", "D", "A", "E"] },
  F: { mode: "flat", letters: ["B"] },
  Bb: { mode: "flat", letters: ["B", "E"] },
  Eb: { mode: "flat", letters: ["B", "E", "A"] },
  Ab: { mode: "flat", letters: ["B", "E", "A", "D"] },
  Db: { mode: "flat", letters: ["B", "E", "A", "D", "G"] },
  Gb: { mode: "flat", letters: ["B", "E", "A", "D", "G", "C"] },
};

type MeasureEvent = {
  id: string;
  pitch: string;
  startStep: number;
  durationSteps: number;
  triplet: boolean;
  tieNext?: boolean;
};

type Measure = MeasureEvent[];
type MeasureGeometry = {
  left: number;
  width: number;
  pitchTop: number;
  pitchBottom: number;
  staffTop: number;
  staffBottom: number;
};
type SelectedEventRef = { measureIdx: number; eventId: string } | null;
type DragState = {
  eventId: string;
  fromMeasureIdx: number;
  durationSteps: number;
} | null;
type DropPreview = {
  measureIdx: number;
  startStep: number;
  laneIdx: number;
  durationSteps: number;
  valid: boolean;
} | null;

type ExerciseStaffComposerProps = {
  onChange: (notes: ExerciseNote[]) => void;
};

function sortedMeasure(measure: Measure): MeasureEvent[] {
  return [...measure].sort((a, b) => a.startStep - b.startStep);
}

function firstGapStart(measure: Measure): number {
  const sorted = sortedMeasure(measure);
  let cursor = 0;
  for (const event of sorted) {
    if (event.startStep > cursor) return cursor;
    cursor = Math.max(cursor, event.startStep + event.durationSteps);
  }
  return cursor;
}

function isSequentialFill(measure: Measure): boolean {
  const sorted = sortedMeasure(measure);
  let cursor = 0;
  for (const event of sorted) {
    if (event.startStep !== cursor) return false;
    cursor = event.startStep + event.durationSteps;
  }
  return true;
}

function crossesMidMeasureBoundary(startStep: number, durationSteps: number): boolean {
  const endStep = startStep + durationSteps;
  return startStep < MID_MEASURE_STEPS && endStep > MID_MEASURE_STEPS;
}

function toVexKey(pitch: string): { key: string; accidental: "#" | "b" | null } | null {
  const match = pitch.trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return null;
  const letter = match[1].toLowerCase();
  const accidental = (match[2] || null) as "#" | "b" | null;
  return { key: `${letter}/${match[3]}`, accidental };
}

function stepsToVexDuration(steps: number): "32" | "16" | "8" | "q" | "h" | "w" {
  const durationBySteps: ReadonlyArray<{ steps: number; duration: "32" | "16" | "8" | "q" | "h" | "w" }> = [
    { steps: 192, duration: "w" },
    { steps: 96, duration: "h" },
    { steps: 48, duration: "q" },
    { steps: 24, duration: "8" },
    { steps: 12, duration: "16" },
    { steps: 6, duration: "32" },
  ];
  const closest = durationBySteps.reduce((best, candidate) =>
    Math.abs(candidate.steps - steps) < Math.abs(best.steps - steps) ? candidate : best,
  );
  return closest.duration;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fallbackInteractionLeft(measureIdx: number): number {
  return measureIdx === 0 ? STAFF_LEFT_WITH_HEADER : STAFF_LEFT_PLAIN;
}

function interactionLeftForMeasure(measureIdx: number, geometry: MeasureGeometry[]): number {
  return geometry[measureIdx]?.left ?? fallbackInteractionLeft(measureIdx);
}

function interactionWidthForMeasure(measureIdx: number, geometry: MeasureGeometry[]): number {
  return geometry[measureIdx]?.width ?? (MEASURE_CANVAS_WIDTH - fallbackInteractionLeft(measureIdx) - STAFF_RIGHT);
}

function pitchTopForMeasure(measureIdx: number, geometry: MeasureGeometry[]): number {
  return geometry[measureIdx]?.pitchTop ?? STAFF_TOP;
}

function pitchBottomForMeasure(measureIdx: number, geometry: MeasureGeometry[]): number {
  return geometry[measureIdx]?.pitchBottom ?? STAFF_BOTTOM;
}

function staffTopForMeasure(measureIdx: number, geometry: MeasureGeometry[]): number {
  return geometry[measureIdx]?.staffTop ?? STAFF_TOP;
}

function staffBottomForMeasure(measureIdx: number, geometry: MeasureGeometry[]): number {
  return geometry[measureIdx]?.staffBottom ?? STAFF_BOTTOM;
}

function eventToOverlayPosition(event: MeasureEvent, measureIdx: number, geometry: MeasureGeometry[]): { left: number; top: number } {
  const pitchMatch = event.pitch.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  const normalized = pitchMatch ? `${pitchMatch[1].toUpperCase()}${pitchMatch[3]}` : event.pitch;
  const laneIdx =
    event.pitch.toLowerCase() === "rest"
      ? 8
      : Math.max(0, STAFF_PITCHES.includes(normalized) ? STAFF_PITCHES.indexOf(normalized) : 8);
  const left = interactionLeftForMeasure(measureIdx, geometry) + (event.startStep / TOTAL_STEPS) * interactionWidthForMeasure(measureIdx, geometry);
  const top = pitchTopForMeasure(measureIdx, geometry) + (laneIdx / (STAFF_PITCHES.length - 1)) * (pitchBottomForMeasure(measureIdx, geometry) - pitchTopForMeasure(measureIdx, geometry));
  return { left, top };
}

function keyAccidentalForLetter(keySignature: KeySignature, letter: string): "#" | "b" | null {
  const keyRule = KEY_ACCIDENTALS[keySignature];
  if (keyRule.mode === "none" || !keyRule.letters.includes(letter)) return null;
  return keyRule.mode === "sharp" ? "#" : "b";
}

function parseNaturalPitch(pitch: string): { letter: string; octave: string } | null {
  const match = pitch.match(/^([A-G])(-?\d)$/);
  if (!match) return null;
  return { letter: match[1], octave: match[2] };
}

function applyAccidental(basePitch: string, accidentalMode: AccidentalMode, keySignature: KeySignature): string {
  const parsed = parseNaturalPitch(basePitch);
  if (!parsed) return basePitch;
  const { letter, octave } = parsed;
  if (accidentalMode === "sharp") return `${letter}#${octave}`;
  if (accidentalMode === "flat") return `${letter}b${octave}`;
  if (accidentalMode === "natural") return `${letter}${octave}`;
  const keyAccidental = keyAccidentalForLetter(keySignature, letter);
  if (keyAccidental === "#") return `${letter}#${octave}`;
  if (keyAccidental === "b") return `${letter}b${octave}`;
  return `${letter}${octave}`;
}

function accidentalModeFromPitch(pitch: string): AccidentalMode {
  const match = pitch.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return "natural";
  if (match[2] === "#") return "sharp";
  if (match[2] === "b") return "flat";
  return "natural";
}

function isOnOrAboveMiddleB(pitch: string): boolean {
  const match = pitch.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return false;
  const letter = match[1].toUpperCase();
  const octave = Number.parseInt(match[3], 10);
  if (Number.isNaN(octave)) return false;
  if (octave > 4) return true;
  if (octave < 4) return false;
  return letter === "B";
}

function stemDirectionForPitch(pitch: string): 1 | -1 {
  return isOnOrAboveMiddleB(pitch) ? -1 : 1;
}

type NotationMeasureCanvasProps = {
  measures: Measure[];
  keySignature: KeySignature;
  onMeasureGeometryChange: (geometry: MeasureGeometry[]) => void;
};

function ContinuousNotationCanvas({ measures, keySignature, onMeasureGeometryChange }: NotationMeasureCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(Math.max(MEASURE_CANVAS_WIDTH, measures.length * MEASURE_CANVAS_WIDTH), MEASURE_CANVAS_HEIGHT);
    const context = renderer.getContext();
    const geometry: MeasureGeometry[] = [];
    measures.forEach((measure, measureIdx) => {
      const x = measureIdx * MEASURE_CANVAS_WIDTH;
      const showHeader = measureIdx === 0;
      const stave = new Stave(x, 18, MEASURE_CANVAS_WIDTH);
      if (showHeader) {
        stave.addClef("treble").addKeySignature(keySignature).addTimeSignature("4/4");
      }
      stave.setContext(context).draw();
      const noteAreaLeftAbs = showHeader ? stave.getNoteStartX() : x + 8;
      if (!showHeader) {
        stave.setNoteStartX(noteAreaLeftAbs);
      }
      const formatWidth = NOTE_LAYOUT_WIDTH;
      const localLeft = noteAreaLeftAbs - measureIdx * MEASURE_CANVAS_WIDTH;
      const topLineY = stave.getYForLine(0);
      const bottomLineY = stave.getYForLine(4);
      geometry[measureIdx] = {
        left: localLeft,
        width: formatWidth,
        pitchTop: topLineY - 30,
        pitchBottom: bottomLineY + 30,
        staffTop: topLineY,
        staffBottom: bottomLineY,
      };

      const orderedEvents = [...measure].sort((a, b) => a.startStep - b.startStep);
      const sequence: Array<
        | { kind: "filler-rest"; startStep: number; durationSteps: number }
        | { kind: "event"; event: MeasureEvent }
      > = [];
      let cursor = 0;
      for (const event of orderedEvents) {
        if (event.startStep > cursor) {
          sequence.push({
            kind: "filler-rest",
            startStep: cursor,
            durationSteps: event.startStep - cursor,
          });
        }
        sequence.push({ kind: "event", event });
        cursor = event.startStep + event.durationSteps;
      }
      if (cursor < TOTAL_STEPS) {
        sequence.push({
          kind: "filler-rest",
          startStep: cursor,
          durationSteps: TOTAL_STEPS - cursor,
        });
      }

      const rendered = sequence
        .map((item) => {
          if (item.kind === "filler-rest") {
            const duration = stepsToVexDuration(item.durationSteps);
            return {
              sourceEvent: null as MeasureEvent | null,
              isRest: true,
              stemDirection: 1 as 1 | -1,
              note: new StaveNote({
                keys: ["b/4"],
                duration: `${duration}r`,
              }),
            };
          }

          const event = item.event;
          const duration = stepsToVexDuration(event.durationSteps);
          if (event.pitch.toLowerCase() === "rest") {
            return {
              sourceEvent: event,
              isRest: true,
              stemDirection: 1 as 1 | -1,
              note: new StaveNote({
                keys: ["b/4"],
                duration: `${duration}r`,
              }),
            };
          }
          const mapped = toVexKey(event.pitch);
          if (!mapped) return null;
          const parsedPitch = event.pitch.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
          const letter = parsedPitch?.[1]?.toUpperCase() ?? null;
          const accidental = parsedPitch?.[2] ?? "";
          const keyAccidental = letter ? keyAccidentalForLetter(keySignature, letter) : null;
          const note = new StaveNote({
            keys: [mapped.key],
            duration,
            stemDirection: stemDirectionForPitch(event.pitch),
          });
          if (accidental === "#" || accidental === "b") {
            if (keyAccidental !== accidental) {
              note.addModifier(new Accidental(accidental), 0);
            }
          } else if (keyAccidental) {
            note.addModifier(new Accidental("n"), 0);
          }
          return {
            sourceEvent: event,
            note,
            isRest: false,
            stemDirection: stemDirectionForPitch(event.pitch),
          };
        })
        .filter(
          (
            item,
          ): item is {
            sourceEvent: MeasureEvent | null;
            note: StaveNote;
            isRest: boolean;
            stemDirection: 1 | -1;
          } => item != null,
        );

      const staveNotes = rendered.map((item) => item.note);
      if (!staveNotes.length) return;

      const beamGroups: number[][] = [];
      if (MEASURE_BEATS === 4) {
        const eighth = STEPS_PER_BEAT / 2;
        const renderIndexByStart = new Map<number, number>();
        rendered.forEach((item, idx) => {
          if (!item.sourceEvent || item.isRest) return;
          if (item.sourceEvent.durationSteps !== eighth) return;
          renderIndexByStart.set(item.sourceEvent.startStep, idx);
        });

        for (let beat = 0; beat < MEASURE_BEATS; beat += 1) {
          const beatStart = beat * STEPS_PER_BEAT;
          const idxA = renderIndexByStart.get(beatStart);
          const idxB = renderIndexByStart.get(beatStart + eighth);
          if (idxA != null && idxB != null) {
            beamGroups.push([idxA, idxB]);
          }
        }
      }

      const beamedIndex = new Set<number>();
      beamGroups.forEach((group) => {
        let downVotes = 0;
        group.forEach((idx) => {
          if (rendered[idx].stemDirection === -1) downVotes += 1;
        });
        const direction: 1 | -1 = downVotes * 2 >= group.length ? -1 : 1;
        group.forEach((idx) => {
          rendered[idx].note.setStemDirection(direction);
          beamedIndex.add(idx);
        });
      });

      rendered.forEach((item, idx) => {
        if (item.isRest || beamedIndex.has(idx)) return;
        item.note.setStemDirection(item.stemDirection);
      });

      const voice = new Voice({
        numBeats: MEASURE_BEATS,
        beatValue: 4,
      });
      voice.setStrict(false);
      voice.addTickables(staveNotes);
      const beamInstances = beamGroups.map((group) => {
        const notes = group.map((idx) => rendered[idx].note);
        return new Beam(notes);
      });
      try {
        new Formatter().joinVoices([voice]).format([voice], formatWidth);
        voice.draw(context, stave);
        beamInstances.forEach((beam) => {
          beam.setContext(context).draw();
        });
        const noteByEventId = new Map<string, StaveNote>();
        rendered.forEach((item) => {
          if (item.sourceEvent && !item.isRest) {
            noteByEventId.set(item.sourceEvent.id, item.note);
          }
        });
        for (let idx = 0; idx < orderedEvents.length; idx += 1) {
          const currentEvent = orderedEvents[idx];
          if (!currentEvent.tieNext) continue;
          if (currentEvent.pitch.toLowerCase() === "rest") continue;
          const nextEvent = orderedEvents.find(
            (candidate) =>
              candidate.startStep === currentEvent.startStep + currentEvent.durationSteps &&
              candidate.pitch === currentEvent.pitch,
          );
          if (!nextEvent) continue;
          const firstNote = noteByEventId.get(currentEvent.id);
          const lastNote = noteByEventId.get(nextEvent.id);
          if (!firstNote || !lastNote) continue;
          const tie = new StaveTie({
            firstNote,
            lastNote,
            firstIndexes: [0],
            lastIndexes: [0],
          });
          tie.setContext(context).draw();
        }
      } catch {
        // Prevent renderer exceptions from crashing the composer.
      }
    });
    onMeasureGeometryChange(geometry);
  }, [measures, keySignature, onMeasureGeometryChange]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

export function ExerciseStaffComposer({ onChange }: ExerciseStaffComposerProps) {
  const [measures, setMeasures] = useState<Measure[]>([[]]);
  const [entryType, setEntryType] = useState<"note" | "rest">("note");
  const [keySignature, setKeySignature] = useState<KeySignature>("C");
  const [accidentalMode, setAccidentalMode] = useState<AccidentalMode>("auto");
  const [selectedDurationId, setSelectedDurationId] = useState<(typeof DURATION_OPTIONS)[number]["id"]>("quarter");
  const [tripletMode, setTripletMode] = useState(false);
  const [autoTieAcrossMidpoint, setAutoTieAcrossMidpoint] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMeasureIdx, setSelectedMeasureIdx] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEventRef>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview>(null);
  const [measureGeometry, setMeasureGeometry] = useState<MeasureGeometry[]>([]);
  const measureLayerRefs = useRef<Array<HTMLDivElement | null>>([]);

  const flatNotes = useMemo(() => {
    const notes: ExerciseNote[] = [];
    measures.forEach((measure, measureIdx) => {
      const sorted = [...measure].sort((a, b) => a.startStep - b.startStep);
      let cursor = 0;
      sorted.forEach((event, idx) => {
        if (event.startStep > cursor) {
          const restBeats = (event.startStep - cursor) / STEPS_PER_BEAT;
          notes.push({
            id: `m${measureIdx + 1}-rest-${idx}`,
            pitch: "rest",
            beats: restBeats,
          });
        }
        notes.push({
          id: event.id,
          pitch: event.pitch,
          beats: event.durationSteps / STEPS_PER_BEAT,
        });
        cursor = event.startStep + event.durationSteps;
      });
      if (cursor < TOTAL_STEPS) {
        notes.push({
          id: `m${measureIdx + 1}-tail-rest`,
          pitch: "rest",
          beats: (TOTAL_STEPS - cursor) / STEPS_PER_BEAT,
        });
      }
    });
    return notes;
  }, [measures]);

  useEffect(() => {
    onChange(flatNotes);
  }, [flatNotes, onChange]);

  const selectedDuration = DURATION_OPTIONS.find((option) => option.id === selectedDurationId) ?? DURATION_OPTIONS[4];
  const activeDurationSteps = Math.round(
    selectedDuration.beats * (tripletMode ? 2 / 3 : 1) * STEPS_PER_BEAT,
  );
  const activeDurationLabel = `${selectedDuration.label}${tripletMode ? " triplet" : ""}`;

  const withAutoMeasure = useCallback((next: Measure[]) => {
    if (next.length === 0) return [[]];
    const last = next[next.length - 1];
    const filledSteps = last.reduce((sum, event) => sum + event.durationSteps, 0);
    if (filledSteps === TOTAL_STEPS) {
      return [...next, []];
    }
    return next;
  }, []);

  const canPlaceInMeasure = useCallback((
    allMeasures: Measure[],
    targetMeasureIdx: number,
    startStep: number,
    durationSteps: number,
    ignore?: { measureIdx: number; eventId: string },
  ) => {
    const target = allMeasures[targetMeasureIdx];
    if (!target) return false;
    const endStep = startStep + durationSteps;
    if (endStep > TOTAL_STEPS) return false;
    return !target.some((event) => {
      if (ignore && ignore.measureIdx === targetMeasureIdx && ignore.eventId === event.id) return false;
      const eventStart = event.startStep;
      const eventEnd = event.startStep + event.durationSteps;
      return startStep < eventEnd && endStep > eventStart;
    });
  }, []);

  const isSequentialPlacement = useCallback((
    allMeasures: Measure[],
    targetMeasureIdx: number,
    startStep: number,
    durationSteps: number,
    ignore?: { measureIdx: number; eventId: string },
  ) => {
    const target = allMeasures[targetMeasureIdx];
    if (!target) return false;
    if (crossesMidMeasureBoundary(startStep, durationSteps)) return false;
    const filtered = ignore
      ? target.filter((event) => !(ignore.measureIdx === targetMeasureIdx && ignore.eventId === event.id))
      : target;
    const expectedStart = firstGapStart(filtered);
    const endStep = startStep + durationSteps;
    if (startStep !== expectedStart) return false;
    if (endStep > TOTAL_STEPS) return false;
    return true;
  }, []);

  const placementFromPointer = useCallback((
    measureIdx: number,
    clientX: number,
    clientY: number,
    durationSteps: number,
  ): { startStep: number; laneIdx: number } | null => {
    const layer = measureLayerRefs.current[measureIdx];
    if (!layer) return null;
    const rect = layer.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    const left = interactionLeftForMeasure(measureIdx, measureGeometry);
    const width = interactionWidthForMeasure(measureIdx, measureGeometry);
    const normalizedX = clamp((x - left) / width, 0, 1);
    const rawStep = Math.round(normalizedX * TOTAL_STEPS);
    const snap = Math.max(1, durationSteps);
    const startStep = Math.min(TOTAL_STEPS - durationSteps, Math.floor(rawStep / snap) * snap);
    const pitchTop = pitchTopForMeasure(measureIdx, measureGeometry);
    const pitchBottom = pitchBottomForMeasure(measureIdx, measureGeometry);
    const normalizedY = clamp((y - pitchTop) / (pitchBottom - pitchTop), 0, 1);
    const laneIdx = Math.max(0, Math.min(STAFF_PITCHES.length - 1, Math.floor(normalizedY * (STAFF_PITCHES.length - 1))));
    return { startStep, laneIdx };
  }, [measureGeometry]);

  const placeEvent = (measureIdx: number, startStep: number, laneIdx: number) => {
    setMessage(null);
    const basePitch = STAFF_PITCHES[laneIdx] ?? "C4";
    const pitch = entryType === "rest" ? "rest" : applyAccidental(basePitch, accidentalMode, keySignature);
    setMeasures((current) => {
      const next = current.map((measure) => [...measure]);
      const target = next[measureIdx];
      const expectedStart = firstGapStart(target);
      const clickedBeat = Math.floor(startStep / STEPS_PER_BEAT);
      const expectedBeat = Math.floor(expectedStart / STEPS_PER_BEAT);
      if (clickedBeat !== expectedBeat) {
        setMessage(`Click inside beat ${expectedBeat + 1} to continue in sequence.`);
        return current;
      }
      // Always fill the leftmost unfinished rhythmic slot first.
      const placeStart = expectedStart;
      const endStep = placeStart + activeDurationSteps;
      if (endStep > TOTAL_STEPS) {
        setMessage("Duration exceeds remaining space in this measure.");
        return current;
      }
      const overlaps = target.some((event) => {
        const eventStart = event.startStep;
        const eventEnd = event.startStep + event.durationSteps;
        return placeStart < eventEnd && endStep > eventStart;
      });
      if (overlaps) {
        setMessage("That beat range is already occupied. Click an empty location.");
        return current;
      }

      if (crossesMidMeasureBoundary(placeStart, activeDurationSteps)) {
        if (entryType === "rest") {
          setMessage("Rests cannot cross beat 2 to beat 3. Split into two rests.");
          return current;
        }
        if (!autoTieAcrossMidpoint) {
          setMessage("This note crosses beat 2 to beat 3. Enable auto-tie or split manually.");
          return current;
        }
        const leftDuration = MID_MEASURE_STEPS - placeStart;
        const rightDuration = endStep - MID_MEASURE_STEPS;
        const rightOverlap = target.some((event) => {
          const eventStart = event.startStep;
          const eventEnd = event.startStep + event.durationSteps;
          return MID_MEASURE_STEPS < eventEnd && endStep > eventStart;
        });
        if (leftDuration <= 0 || rightDuration <= 0 || rightOverlap) {
          setMessage("Cannot place tied split here because the second half collides.");
          return current;
        }
        target.push({
          id: `m${measureIdx + 1}-${Date.now()}-${Math.round(Math.random() * 10000)}-a`,
          pitch,
          startStep: placeStart,
          durationSteps: leftDuration,
          triplet: tripletMode,
          tieNext: true,
        });
        target.push({
          id: `m${measureIdx + 1}-${Date.now()}-${Math.round(Math.random() * 10000)}-b`,
          pitch,
          startStep: MID_MEASURE_STEPS,
          durationSteps: rightDuration,
          triplet: tripletMode,
        });
        target.sort((a, b) => a.startStep - b.startStep);
        return withAutoMeasure(next);
      }

      target.push({
        id: `m${measureIdx + 1}-${Date.now()}-${Math.round(Math.random() * 10000)}`,
        pitch,
        startStep: placeStart,
        durationSteps: activeDurationSteps,
        triplet: tripletMode,
        tieNext: false,
      });
      target.sort((a, b) => a.startStep - b.startStep);
      return withAutoMeasure(next);
    });
  };

  const moveEvent = useCallback((
    fromMeasureIdx: number,
    toMeasureIdx: number,
    eventId: string,
    nextStartStep: number,
    nextLaneIdx: number,
  ) => {
    setMessage(null);
    setMeasures((current) => {
      const next = current.map((measure) => [...measure]);
      const from = next[fromMeasureIdx];
      const to = next[toMeasureIdx];
      if (!from || !to) return current;

      const sourceIdx = from.findIndex((event) => event.id === eventId);
      if (sourceIdx < 0) return current;
      const moving = from[sourceIdx];
      from.splice(sourceIdx, 1);

      const endStep = nextStartStep + moving.durationSteps;
      if (endStep > TOTAL_STEPS) {
        setMessage("Cannot drop here: note exceeds measure length.");
        return current;
      }
      if (crossesMidMeasureBoundary(nextStartStep, moving.durationSteps)) {
        setMessage("Cannot move note across beat 2 to beat 3. Split and tie instead.");
        return current;
      }

      const overlaps = to.some((event) => {
        if (event.id === moving.id) return false;
        const eventStart = event.startStep;
        const eventEnd = event.startStep + event.durationSteps;
        return nextStartStep < eventEnd && endStep > eventStart;
      });
      if (overlaps) {
        setMessage("Cannot drop here: space is already occupied.");
        return current;
      }

      const moved: MeasureEvent = {
        ...moving,
        startStep: nextStartStep,
        tieNext: false,
        pitch:
          moving.pitch.toLowerCase() === "rest"
            ? "rest"
            : applyAccidental(
                STAFF_PITCHES[Math.max(0, Math.min(STAFF_PITCHES.length - 1, nextLaneIdx))],
                accidentalModeFromPitch(moving.pitch),
                keySignature,
              ),
      };
      to.push(moved);
      to.sort((a, b) => a.startStep - b.startStep);
      if (fromMeasureIdx === toMeasureIdx) {
        if (!isSequentialFill(to)) {
          setMessage("Fill earlier beats before moving notes to later beats.");
          return current;
        }
      } else {
        if (!isSequentialFill(from) || !isSequentialFill(to)) {
          setMessage("Fill earlier beats before moving notes to later beats.");
          return current;
        }
      }
      return withAutoMeasure(next);
    });
    setSelectedEvent({ measureIdx: toMeasureIdx, eventId });
  }, [keySignature, withAutoMeasure]);

  const selectedEventData = useMemo(() => {
    if (!selectedEvent) return null;
    const measure = measures[selectedEvent.measureIdx] ?? [];
    return measure.find((event) => event.id === selectedEvent.eventId) ?? null;
  }, [measures, selectedEvent]);

  const deleteSelectedEvent = useCallback(() => {
    if (!selectedEvent) return;
    setMessage(null);
    setMeasures((current) => {
      const next = current.map((measure) => [...measure]);
      const target = next[selectedEvent.measureIdx];
      if (!target) return current;
      const idx = target.findIndex((event) => event.id === selectedEvent.eventId);
      if (idx < 0) return current;
      const removing = target[idx];
      target.splice(idx, 1);
      target.forEach((event) => {
        if (event.tieNext && event.startStep + event.durationSteps === removing.startStep && event.pitch === removing.pitch) {
          event.tieNext = false;
        }
      });
      return next;
    });
    setSelectedEvent(null);
  }, [selectedEvent]);

  const removeTieFromSelection = useCallback(() => {
    if (!selectedEvent) return;
    setMessage(null);
    setMeasures((current) => {
      const next = current.map((measure) => [...measure]);
      const target = next[selectedEvent.measureIdx];
      if (!target) return current;
      const selectedIdx = target.findIndex((event) => event.id === selectedEvent.eventId);
      if (selectedIdx < 0) return current;
      const selected = target[selectedIdx];
      if (selected.tieNext) {
        selected.tieNext = false;
        return next;
      }
      const prev = target.find(
        (event) => event.tieNext && event.startStep + event.durationSteps === selected.startStep && event.pitch === selected.pitch,
      );
      if (prev) {
        prev.tieNext = false;
        return next;
      }
      setMessage("Selected note has no tie to remove.");
      return current;
    });
  }, [selectedEvent]);

  const removeMeasure = (measureIdx: number) => {
    setMeasures((current) => {
      if (current.length === 1) return [[]];
      const next = current.filter((_, idx) => idx !== measureIdx);
      const clamped = Math.max(0, Math.min(next.length - 1, selectedMeasureIdx));
      setSelectedMeasureIdx(clamped);
      setDragState(null);
      setDropPreview(null);
      if (selectedEvent) {
        if (selectedEvent.measureIdx === measureIdx) {
          setSelectedEvent(null);
        } else if (selectedEvent.measureIdx > measureIdx) {
          setSelectedEvent({ ...selectedEvent, measureIdx: selectedEvent.measureIdx - 1 });
        }
      }
      measureLayerRefs.current = measureLayerRefs.current.slice(0, next.length);
      return next;
    });
  };

  const addMeasure = () => {
    setMessage(null);
    setMeasures((current) => {
      const base = current.length > 0 ? current : [[]];
      const next = [...base, []];
      setSelectedMeasureIdx(next.length - 1);
      measureLayerRefs.current = measureLayerRefs.current.slice(0, next.length);
      return next;
    });
  };

  const handleStaffClick = (
    measureIdx: number,
    event: React.MouseEvent<HTMLDivElement>,
    laneIdx?: number,
  ) => {
    setSelectedEvent(null);
    const placement = placementFromPointer(measureIdx, event.clientX, event.clientY, activeDurationSteps);
    if (!placement) return;
    const computedLane = laneIdx ?? placement.laneIdx;
    placeEvent(measureIdx, placement.startStep, computedLane);
  };

  useEffect(() => {
    if (!dragState) return;

    const updatePreview = (clientX: number, clientY: number) => {
      let hoveredMeasureIdx = -1;
      for (let idx = 0; idx < measureLayerRefs.current.length; idx += 1) {
        const layer = measureLayerRefs.current[idx];
        if (!layer) continue;
        const rect = layer.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          hoveredMeasureIdx = idx;
          break;
        }
      }
      if (hoveredMeasureIdx < 0) {
        setDropPreview(null);
        return;
      }
      const placement = placementFromPointer(hoveredMeasureIdx, clientX, clientY, dragState.durationSteps);
      if (!placement) {
        setDropPreview(null);
        return;
      }
      const valid = canPlaceInMeasure(
        measures,
        hoveredMeasureIdx,
        placement.startStep,
        dragState.durationSteps,
        { measureIdx: dragState.fromMeasureIdx, eventId: dragState.eventId },
      ) && isSequentialPlacement(
        measures,
        hoveredMeasureIdx,
        placement.startStep,
        dragState.durationSteps,
        { measureIdx: dragState.fromMeasureIdx, eventId: dragState.eventId },
      );
      setDropPreview({
        measureIdx: hoveredMeasureIdx,
        startStep: placement.startStep,
        laneIdx: placement.laneIdx,
        durationSteps: dragState.durationSteps,
        valid,
      });
    };

    const onMouseMove = (mouseEvent: MouseEvent) => {
      updatePreview(mouseEvent.clientX, mouseEvent.clientY);
    };
    const onMouseUp = () => {
      if (dropPreview?.valid) {
        moveEvent(
          dragState.fromMeasureIdx,
          dropPreview.measureIdx,
          dragState.eventId,
          dropPreview.startStep,
          dropPreview.laneIdx,
        );
      }
      setDragState(null);
      setDropPreview(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [canPlaceInMeasure, dragState, dropPreview, isSequentialPlacement, measures, moveEvent, placementFromPointer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "Escape") {
        setSelectedEvent(null);
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedEvent) {
        event.preventDefault();
        deleteSelectedEvent();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelectedEvent, selectedEvent]);

  return (
    <div className="space-y-2.5">
      <div className="ui-panel flex flex-wrap items-center gap-x-0 gap-y-2 px-3 py-2.5">
        <div className="flex items-center gap-1.5 border-r border-slate-200/70 pr-3 dark:border-white/10">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Entry
          </span>
          <button
            type="button"
            onClick={() => setEntryType("note")}
            className={`${entryType === "note" ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-[11px] font-semibold`}
          >
            Note
          </button>
          <button
            type="button"
            onClick={() => setEntryType("rest")}
            className={`${entryType === "rest" ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-[11px] font-semibold`}
          >
            Rest
          </button>
        </div>

        <div className="flex items-center gap-1.5 border-r border-slate-200/70 px-3 dark:border-white/10">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Key
          </span>
          <select
            value={keySignature}
            onChange={(event) => setKeySignature(event.target.value as KeySignature)}
            className="ui-select h-7 min-w-[84px] rounded-full px-3 py-0 text-[11px] font-semibold"
          >
            {KEY_SIGNATURE_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 border-r border-slate-200/70 px-3 dark:border-white/10">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Accidental
          </span>
          {([
            { id: "auto", label: "Auto" },
            { id: "natural", label: "n" },
            { id: "sharp", label: "#" },
            { id: "flat", label: "b" },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAccidentalMode(item.id)}
              className={`${accidentalMode === item.id ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-[11px] font-semibold`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 border-r border-slate-200/70 px-3 dark:border-white/10">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Duration
          </span>
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedDurationId(option.id)}
              className={`${
                selectedDurationId === option.id ? "ui-button-primary" : "ui-button-secondary"
              } rounded-full px-3 py-1 text-[11px] font-semibold`}
              title={option.label}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 border-r border-slate-200/70 px-3 dark:border-white/10">
          <button
            type="button"
            onClick={() => setTripletMode((v) => !v)}
            className={`${tripletMode ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-[11px] font-semibold`}
          >
            Triplet
          </button>
          <button
            type="button"
            onClick={() => setAutoTieAcrossMidpoint((v) => !v)}
            className={`${
              autoTieAcrossMidpoint ? "ui-button-primary" : "ui-button-secondary"
            } rounded-full px-3 py-1 text-[11px] font-semibold`}
            title="When enabled, notes crossing beat 2-3 are split into tied notes."
          >
            Auto tie 2|3
          </button>
        </div>

        <div className="flex items-center gap-1.5 pl-3">
          <button
            type="button"
            onClick={deleteSelectedEvent}
            disabled={!selectedEvent}
            className={`${
              selectedEvent ? "ui-button-danger" : "ui-button-secondary"
            } rounded-full px-3 py-1 text-[11px] font-semibold`}
            title="Delete selected note or rest"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={removeTieFromSelection}
            disabled={!selectedEvent}
            className="ui-button-secondary rounded-full px-3 py-1 text-[11px] font-semibold"
            title="Remove tie from selected note"
          >
            Remove tie
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="ui-chip flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Measures
          </span>
          {measures.map((_, measureIdx) => (
            <span
              key={`measure-meta-${measureIdx + 1}`}
              className={`inline-flex items-center gap-0.5 rounded-full border py-0.5 pl-2.5 pr-1.5 text-[11px] font-semibold transition-colors ${
                selectedMeasureIdx === measureIdx
                  ? "border-indigo-500/50 bg-indigo-500 text-white dark:border-indigo-400/60 dark:bg-indigo-600"
                  : "border-slate-300/70 bg-white text-slate-600 hover:border-slate-400/60 dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-300"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedMeasureIdx(measureIdx)}
                className="focus:outline-none"
              >
                M{measureIdx + 1}
              </button>
              {measures.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeMeasure(measureIdx)}
                  className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none transition-colors ${
                    selectedMeasureIdx === measureIdx
                      ? "text-indigo-200 hover:bg-indigo-400/50 hover:text-white"
                      : "text-slate-400 hover:bg-slate-200/70 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-rose-300"
                  }`}
                  title={`Delete measure ${measureIdx + 1}`}
                  aria-label={`Delete measure ${measureIdx + 1}`}
                >
                  x
                </button>
              ) : null}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={addMeasure}
          className="ui-button-secondary rounded-full border-dashed px-3 py-1 text-[11px] font-semibold"
        >
          + Add measure
        </button>

        {measures.length > 1 ? (
          <button
            type="button"
            onClick={() => removeMeasure(measures.length - 1)}
            className="ui-button-secondary rounded-full px-3 py-1 text-[11px] font-semibold"
          >
            Remove last
          </button>
        ) : null}
      </div>

      <div className="ui-chip flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-1.5 text-[11px]">
        <span className="text-slate-400 dark:text-slate-500">Entry</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{entryType}</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="text-slate-400 dark:text-slate-500">Key</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{keySignature}</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="text-slate-400 dark:text-slate-500">Accidental</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{accidentalMode}</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">{activeDurationLabel}</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="text-slate-400 dark:text-slate-500">
          {autoTieAcrossMidpoint ? "auto tie on" : "auto tie off"}
        </span>
        <span className="ml-auto text-slate-400 dark:text-slate-500">
          Click the staff to place
        </span>
      </div>

      {selectedEventData ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50/70 px-3 py-1.5 text-[11px] dark:border-emerald-500/25 dark:bg-emerald-950/25">
          <span className="text-emerald-700 dark:text-emerald-300">Editing</span>
          <span className="font-semibold text-emerald-800 dark:text-emerald-200">
            {selectedEventData.pitch}
          </span>
          <span className="text-emerald-600/50 dark:text-emerald-400/40">·</span>
          <span className="font-semibold text-emerald-800 dark:text-emerald-200">
            {selectedEventData.durationSteps / STEPS_PER_BEAT} beats
          </span>
          {selectedEventData.tieNext ? (
            <>
              <span className="text-emerald-600/50 dark:text-emerald-400/40">·</span>
              <span className="font-semibold text-emerald-800 dark:text-emerald-200">tied forward</span>
            </>
          ) : null}
          <span className="ml-auto text-emerald-600/70 dark:text-emerald-400/60">
            Delete / Backspace to remove
          </span>
        </div>
      ) : null}

      {message ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-300/60 bg-rose-50/70 px-3 py-1.5 text-[11px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-950/25 dark:text-rose-300">
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
          </svg>
          {message}
        </div>
      ) : null}

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full flex-col gap-0">
          <div className="ui-panel relative inline-flex overflow-hidden">
            <ContinuousNotationCanvas
              measures={measures}
              keySignature={keySignature}
              onMeasureGeometryChange={setMeasureGeometry}
            />
            {measures.map((measure, measureIdx) => (
              <div
                key={`measure-${measureIdx + 1}`}
                className={`relative h-[170px] w-[320px] transition-colors ${
                  selectedMeasureIdx === measureIdx
                    ? "bg-indigo-50/30 dark:bg-indigo-950/12"
                    : ""
                }`}
                ref={(el) => {
                  measureLayerRefs.current[measureIdx] = el;
                }}
              >
                <span
                  className={`pointer-events-none absolute left-1.5 top-1.5 z-10 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wider ${
                    selectedMeasureIdx === measureIdx
                      ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                      : "bg-slate-100/70 text-slate-400 dark:bg-white/5 dark:text-slate-500"
                  }`}
                >
                  M{measureIdx + 1}
                </span>

                {Array.from({ length: MEASURE_BEATS }).map((_, beatIdx) => {
                  const laneLeft = interactionLeftForMeasure(measureIdx, measureGeometry);
                  const laneWidth = interactionWidthForMeasure(measureIdx, measureGeometry);
                  const beatWidth = laneWidth / MEASURE_BEATS;
                  const staffTop = staffTopForMeasure(measureIdx, measureGeometry);
                  const staffBottom = staffBottomForMeasure(measureIdx, measureGeometry);
                  return (
                    <div
                      key={`beat-zone-${measureIdx}-${beatIdx + 1}`}
                      className={`pointer-events-none absolute ${
                        beatIdx % 2 === 0
                          ? "bg-indigo-400/[0.035] dark:bg-indigo-300/[0.045]"
                          : "bg-transparent"
                      }`}
                      style={{
                        left: `${laneLeft + beatIdx * beatWidth}px`,
                        top: `${staffTop - 8}px`,
                        width: `${beatWidth}px`,
                        height: `${staffBottom - staffTop + 16}px`,
                      }}
                    >
                      <span className="absolute -top-4 left-1 text-[9px] font-semibold text-slate-300 dark:text-slate-600">
                        {beatIdx + 1}
                      </span>
                      {beatIdx > 0 ? (
                        <span className="absolute bottom-0 left-0 top-0 w-px bg-indigo-200/40 dark:bg-indigo-200/15" />
                      ) : null}
                    </div>
                  );
                })}

                <div
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    setSelectedMeasureIdx(measureIdx);
                    handleStaffClick(measureIdx, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    const target = event.currentTarget.getBoundingClientRect();
                    const fakeEvent = {
                      ...event,
                      clientX: target.left + target.width / 2,
                      clientY: target.top + target.height / 2,
                      currentTarget: event.currentTarget,
                    } as unknown as React.MouseEvent<HTMLDivElement>;
                    handleStaffClick(measureIdx, fakeEvent);
                  }}
                  className="absolute inset-0 cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-inset"
                  title="Click on the staff to place note/rest"
                />

                {dropPreview && dropPreview.measureIdx === measureIdx ? (
                  <div
                    className={`pointer-events-none absolute rounded border ${
                      dropPreview.valid
                        ? "border-emerald-500/80 bg-emerald-400/15 dark:border-emerald-300/70 dark:bg-emerald-300/15"
                        : "border-rose-500/80 bg-rose-400/15 dark:border-rose-300/70 dark:bg-rose-300/15"
                    }`}
                    style={{
                      left: `${
                        interactionLeftForMeasure(measureIdx, measureGeometry) +
                        (dropPreview.startStep / TOTAL_STEPS) *
                          interactionWidthForMeasure(measureIdx, measureGeometry)
                      }px`,
                      width: `${Math.max(
                        8,
                        (dropPreview.durationSteps / TOTAL_STEPS) *
                          interactionWidthForMeasure(measureIdx, measureGeometry),
                      )}px`,
                      top: `${staffTopForMeasure(measureIdx, measureGeometry) - 10}px`,
                      height: `${
                        staffBottomForMeasure(measureIdx, measureGeometry) -
                        staffTopForMeasure(measureIdx, measureGeometry) + 20
                      }px`,
                    }}
                  />
                ) : null}

                {measure.map((event) => {
                  const pos = eventToOverlayPosition(event, measureIdx, measureGeometry);
                  const isSelected =
                    selectedEvent?.eventId === event.id &&
                    selectedEvent.measureIdx === measureIdx;
                  return (
                    <span
                      key={event.id}
                      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                      onMouseDown={(eventMouse) => {
                        eventMouse.stopPropagation();
                        setSelectedMeasureIdx(measureIdx);
                        setSelectedEvent({ measureIdx, eventId: event.id });
                        setDragState({
                          eventId: event.id,
                          fromMeasureIdx: measureIdx,
                          durationSteps: event.durationSteps,
                        });
                        setDropPreview(null);
                      }}
                      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        setSelectedEvent({ measureIdx, eventId: event.id });
                      }}
                      title={`${event.pitch} (${event.durationSteps / STEPS_PER_BEAT} beats)`}
                    >
                      {isSelected ? (
                        <span
                          className="pointer-events-none absolute inset-0 rounded-full"
                          style={{
                            boxShadow:
                              "0 0 0 3px rgba(99,102,241,0.30), 0 0 14px rgba(99,102,241,0.40), 0 0 22px rgba(99,102,241,0.20)",
                          }}
                        />
                      ) : null}
                      <span className="block h-4 w-4 rounded-full bg-transparent" />
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
