"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";
import type { ExerciseNote } from "@/lib/domain/types";
import { MEASURE_BEATS } from "@/lib/music/notation";

const STEPS_PER_BEAT = 48; // supports 1/16 notes + triplet subdivisions cleanly
const TOTAL_STEPS = MEASURE_BEATS * STEPS_PER_BEAT;
const MEASURE_CANVAS_WIDTH = 320;
const MEASURE_CANVAS_HEIGHT = 170;
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
  { id: "sixteenth", label: "1/16", beats: 0.25 },
  { id: "eighth", label: "1/8", beats: 0.5 },
  { id: "quarter", label: "1/4", beats: 1 },
  { id: "half", label: "1/2", beats: 2 },
  { id: "whole", label: "Whole", beats: 4 },
];

type MeasureEvent = {
  id: string;
  pitch: string;
  startStep: number;
  durationSteps: number;
  triplet: boolean;
};

type Measure = MeasureEvent[];

type ExerciseStaffComposerProps = {
  onChange: (notes: ExerciseNote[]) => void;
};

function toVexKey(pitch: string): { key: string; accidental: "#" | "b" | null } | null {
  const match = pitch.trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return null;
  const letter = match[1].toLowerCase();
  const accidental = (match[2] || null) as "#" | "b" | null;
  return { key: `${letter}/${match[3]}`, accidental };
}

function beatsToVexDuration(beats: number, triplet: boolean): string {
  let base = "q";
  if (beats <= 0.26) base = "16";
  else if (beats <= 0.51) base = "8";
  else if (beats <= 1.01) base = "q";
  else if (beats <= 2.01) base = "h";
  else base = "w";
  return triplet && base !== "w" ? `${base}t` : base;
}

function toRenderableMeasureEvents(measure: Measure): MeasureEvent[] {
  const sorted = [...measure].sort((a, b) => a.startStep - b.startStep);
  const expanded: MeasureEvent[] = [];
  let cursor = 0;
  sorted.forEach((event, idx) => {
    if (event.startStep > cursor) {
      expanded.push({
        id: `gap-${idx}-${cursor}`,
        pitch: "rest",
        startStep: cursor,
        durationSteps: event.startStep - cursor,
        triplet: false,
      });
    }
    expanded.push(event);
    cursor = event.startStep + event.durationSteps;
  });
  if (cursor < TOTAL_STEPS) {
    expanded.push({
      id: `tail-${cursor}`,
      pitch: "rest",
      startStep: cursor,
      durationSteps: TOTAL_STEPS - cursor,
      triplet: false,
    });
  }
  return expanded.filter((event) => event.durationSteps > 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toInteractionLeft(showHeader: boolean): number {
  return showHeader ? STAFF_LEFT_WITH_HEADER : STAFF_LEFT_PLAIN;
}

function toInteractionWidth(showHeader: boolean): number {
  return MEASURE_CANVAS_WIDTH - toInteractionLeft(showHeader) - STAFF_RIGHT;
}

function eventToOverlayPosition(event: MeasureEvent, showHeader: boolean): { left: number; top: number } {
  const laneIdx =
    event.pitch.toLowerCase() === "rest"
      ? 8
      : Math.max(0, STAFF_PITCHES.includes(event.pitch) ? STAFF_PITCHES.indexOf(event.pitch) : 8);
  const left = toInteractionLeft(showHeader) + (event.startStep / TOTAL_STEPS) * toInteractionWidth(showHeader);
  const top = STAFF_TOP + (laneIdx / (STAFF_PITCHES.length - 1)) * (STAFF_BOTTOM - STAFF_TOP);
  return { left, top };
}

type NotationMeasureCanvasProps = {
  measure: Measure;
  showHeader: boolean;
};

function NotationMeasureCanvas({ measure, showHeader }: NotationMeasureCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(MEASURE_CANVAS_WIDTH, MEASURE_CANVAS_HEIGHT);
    const context = renderer.getContext();
    const stave = new Stave(8, 18, MEASURE_CANVAS_WIDTH - 16);
    if (showHeader) {
      stave.addClef("treble").addTimeSignature("4/4");
    }
    stave.setContext(context).draw();

    const renderableEvents = toRenderableMeasureEvents(measure);
    const staveNotes = renderableEvents
      .map((event) => {
        const duration = beatsToVexDuration(event.durationSteps / STEPS_PER_BEAT, event.triplet);
        if (event.pitch.toLowerCase() === "rest") {
          return new StaveNote({
            keys: ["b/4"],
            duration: `${duration}r`,
          });
        }
        const mapped = toVexKey(event.pitch);
        if (!mapped) return null;
        const note = new StaveNote({
          keys: [mapped.key],
          duration,
        });
        if (mapped.accidental) {
          note.addModifier(new Accidental(mapped.accidental), 0);
        }
        return note;
      })
      .filter((note): note is StaveNote => note != null);

    if (!staveNotes.length) return;

    const voice = new Voice({
      numBeats: MEASURE_BEATS,
      beatValue: 4,
    });
    voice.addTickables(staveNotes);
    new Formatter().joinVoices([voice]).format([voice], showHeader ? 230 : 280);
    voice.draw(context, stave);
  }, [measure, showHeader]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

export function ExerciseStaffComposer({ onChange }: ExerciseStaffComposerProps) {
  const [measures, setMeasures] = useState<Measure[]>([[]]);
  const [entryType, setEntryType] = useState<"note" | "rest">("note");
  const [selectedDurationId, setSelectedDurationId] = useState<(typeof DURATION_OPTIONS)[number]["id"]>("quarter");
  const [tripletMode, setTripletMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMeasureIdx, setSelectedMeasureIdx] = useState(0);

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

  const selectedDuration = DURATION_OPTIONS.find((option) => option.id === selectedDurationId) ?? DURATION_OPTIONS[2];
  const activeDurationSteps = Math.round(
    selectedDuration.beats * (tripletMode ? 2 / 3 : 1) * STEPS_PER_BEAT,
  );
  const activeDurationLabel = `${selectedDuration.label}${tripletMode ? " triplet" : ""}`;

  const withAutoMeasure = (next: Measure[]) => {
    if (next.length === 0) return [[]];
    const last = next[next.length - 1];
    const filledSteps = last.reduce((sum, event) => sum + event.durationSteps, 0);
    if (filledSteps === TOTAL_STEPS) {
      return [...next, []];
    }
    return next;
  };

  const placeEvent = (measureIdx: number, startStep: number, laneIdx: number) => {
    setMessage(null);
    const pitch = entryType === "rest" ? "rest" : STAFF_PITCHES[laneIdx] ?? "C4";
    setMeasures((current) => {
      const next = current.map((measure) => [...measure]);
      const target = next[measureIdx];
      const endStep = startStep + activeDurationSteps;
      if (endStep > TOTAL_STEPS) {
        setMessage("Duration exceeds remaining space in this measure.");
        return current;
      }
      const overlaps = target.some((event) => {
        const eventStart = event.startStep;
        const eventEnd = event.startStep + event.durationSteps;
        return startStep < eventEnd && endStep > eventStart;
      });
      if (overlaps) {
        setMessage("That beat range is already occupied. Click an empty location.");
        return current;
      }

      target.push({
        id: `m${measureIdx + 1}-${Date.now()}-${Math.round(Math.random() * 10000)}`,
        pitch,
        startStep,
        durationSteps: activeDurationSteps,
        triplet: tripletMode,
      });
      target.sort((a, b) => a.startStep - b.startStep);
      return withAutoMeasure(next);
    });
  };

  const moveEvent = (
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
        pitch:
          moving.pitch.toLowerCase() === "rest"
            ? "rest"
            : STAFF_PITCHES[Math.max(0, Math.min(STAFF_PITCHES.length - 1, nextLaneIdx))],
      };
      to.push(moved);
      to.sort((a, b) => a.startStep - b.startStep);
      return withAutoMeasure(next);
    });
  };

  const removeMeasure = (measureIdx: number) => {
    setMeasures((current) => {
      if (current.length === 1) return [[]];
      const next = current.filter((_, idx) => idx !== measureIdx);
      const clamped = Math.max(0, Math.min(next.length - 1, selectedMeasureIdx));
      setSelectedMeasureIdx(clamped);
      return next;
    });
  };

  const handleStaffClick = (
    measureIdx: number,
    event: React.MouseEvent<HTMLDivElement>,
    laneIdx?: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const left = toInteractionLeft(measureIdx === 0);
    const width = toInteractionWidth(measureIdx === 0);
    const normalizedX = clamp((x - left) / width, 0, 1);
    const rawStep = Math.round(normalizedX * TOTAL_STEPS);
    const snap = Math.max(1, activeDurationSteps);
    const snappedStep = Math.min(TOTAL_STEPS - snap, Math.floor(rawStep / snap) * snap);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const normalizedY = clamp((y - STAFF_TOP) / (STAFF_BOTTOM - STAFF_TOP), 0, 1);
    const computedLane =
      laneIdx ?? Math.max(0, Math.min(STAFF_PITCHES.length - 1, Math.floor(normalizedY * (STAFF_PITCHES.length - 1))));
    placeEvent(measureIdx, snappedStep, computedLane);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Entry</p>
        <button
          type="button"
          onClick={() => setEntryType("note")}
          className={`${entryType === "note" ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-xs font-semibold`}
        >
          Note
        </button>
        <button
          type="button"
          onClick={() => setEntryType("rest")}
          className={`${entryType === "rest" ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-xs font-semibold`}
        >
          Rest
        </button>

        <p className="ml-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Duration
        </p>
        {DURATION_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setSelectedDurationId(option.id)}
            className={`${selectedDurationId === option.id ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-xs font-semibold`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTripletMode((v) => !v)}
          className={`${tripletMode ? "ui-button-primary" : "ui-button-secondary"} rounded-full px-3 py-1 text-xs font-semibold`}
        >
          Triplet
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Selected: <span className="font-semibold text-slate-700 dark:text-slate-200">{entryType}</span> ·{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{activeDurationLabel}</span>. Click directly on the staff to place.
      </p>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full gap-3">
          {measures.map((measure, measureIdx) => (
            <div
              key={`measure-${measureIdx + 1}`}
              className={`min-w-[300px] rounded-xl border p-2 ${
                selectedMeasureIdx === measureIdx
                  ? "border-indigo-500/60 bg-indigo-50/40 dark:border-indigo-400/60 dark:bg-indigo-950/20"
                  : "border-slate-300/90 bg-slate-50/70 dark:border-white/15 dark:bg-slate-950/30"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMeasureIdx(measureIdx)}
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Measure {measureIdx + 1}
                </button>
                <button
                  type="button"
                  onClick={() => removeMeasure(measureIdx)}
                  className="ui-button-secondary rounded-md px-2 py-1 text-[10px] font-semibold"
                >
                  Delete
                </button>
              </div>
              <div className="relative h-[170px] overflow-hidden rounded-lg border border-slate-300/80 bg-white dark:border-white/15 dark:bg-slate-900/75">
                <NotationMeasureCanvas measure={measure} showHeader={measureIdx === 0} />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(event) => handleStaffClick(measureIdx, event)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const payloadRaw = event.dataTransfer.getData("application/x-rs-note");
                    if (!payloadRaw) return;
                    try {
                      const payload = JSON.parse(payloadRaw) as {
                        eventId: string;
                        fromMeasureIdx: number;
                      };
                      const rect = event.currentTarget.getBoundingClientRect();
                      const x = clamp(event.clientX - rect.left, 0, rect.width);
                      const y = clamp(event.clientY - rect.top, 0, rect.height);
                      const left = toInteractionLeft(measureIdx === 0);
                      const width = toInteractionWidth(measureIdx === 0);
                      const normalizedX = clamp((x - left) / width, 0, 1);
                      const rawStep = Math.round(normalizedX * TOTAL_STEPS);
                      const movingMeasure = measures[payload.fromMeasureIdx] ?? [];
                      const movingEvent = movingMeasure.find((item) => item.id === payload.eventId);
                      if (!movingEvent) return;
                      const snap = Math.max(1, movingEvent.durationSteps);
                      const snappedStep = Math.min(
                        TOTAL_STEPS - movingEvent.durationSteps,
                        Math.floor(rawStep / snap) * snap,
                      );
                      const normalizedY = clamp((y - STAFF_TOP) / (STAFF_BOTTOM - STAFF_TOP), 0, 1);
                      const lane = Math.floor(normalizedY * (STAFF_PITCHES.length - 1));
                      moveEvent(payload.fromMeasureIdx, measureIdx, payload.eventId, snappedStep, lane);
                    } catch {
                      // ignore malformed drag payload
                    }
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
                  className="absolute inset-0 cursor-crosshair"
                  title="Click on the staff to place note/rest"
                />
                {measure.map((event) => {
                  const pos = eventToOverlayPosition(event, measureIdx === 0);
                  return (
                    <span
                      key={event.id}
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-indigo-500/70 bg-indigo-400/45 shadow-sm active:cursor-grabbing dark:border-indigo-300/70 dark:bg-indigo-300/35"
                      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
                      draggable
                      onDragStart={(dragEvent) => {
                        dragEvent.dataTransfer.setData(
                          "application/x-rs-note",
                          JSON.stringify({ eventId: event.id, fromMeasureIdx: measureIdx }),
                        );
                      }}
                      title="Drag to move this note/rest"
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setMeasures((current) => [...current, []])
          }
          className="ui-button-secondary rounded-lg px-3 py-1.5 text-xs font-semibold"
        >
          Add another measure
        </button>
        {measures.length > 1 ? (
          <button
            type="button"
            onClick={() => setMeasures((current) => current.slice(0, -1))}
            className="ui-button-secondary rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Remove last measure
          </button>
        ) : null}
      </div>
      {message ? <p className="text-xs text-rose-600 dark:text-rose-300">{message}</p> : null}
    </div>
  );
}
