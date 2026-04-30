import type { LessonSummary } from "@/lib/domain/types";
import type { StudentAgeBand } from "@/lib/student-engagement";

export type PracticePlanItemKind = "warmup" | "focus" | "record" | "listen";

export type PracticePlanItem = {
  id: string;
  kind: PracticePlanItemKind;
  title: string;
  detail: string;
  minutes: number;
};

export type PracticePlan = {
  id: string;
  studentCrmId: string;
  lessonId: string;
  lessonTitle: string;
  lessonNumber: number;
  createdAt: string;
  title: string;
  recap: string;
  ageBand: StudentAgeBand;
  items: PracticePlanItem[];
};

export type PracticeSubmissionStatus = "needs_review" | "reviewed" | "redo";

export type PracticeSubmission = {
  id: string;
  studentCrmId: string;
  lessonId: string;
  planId: string;
  itemId: string | null;
  body: string;
  evidenceType: "reflection" | "recording-note" | "timer";
  durationSec?: number;
  status: PracticeSubmissionStatus;
  instructorNote?: string;
  createdAt: string;
  reviewedAt?: string;
};

type PracticeLoopState = {
  plans: PracticePlan[];
  submissions: PracticeSubmission[];
};

const STORAGE_KEY = "real-school-practice-loop-v1";

function emptyState(): PracticeLoopState {
  return { plans: [], submissions: [] };
}

function readState(): PracticeLoopState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PracticeLoopState>;
    return {
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: PracticeLoopState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("practice-loop-updated"));
}

function splitNotes(notes: string | undefined) {
  const parts = (notes ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : ["Review the latest lesson focus and practice slowly with attention."];
}

function ageVerb(ageBand: StudentAgeBand) {
  if (ageBand === "under10") return "Try";
  if (ageBand === "10to12") return "Practice";
  return "Refine";
}

export function generatePracticePlan(lesson: LessonSummary, ageBand: StudentAgeBand): PracticePlan {
  const parts = splitNotes(lesson.notes);
  const verb = ageVerb(ageBand);
  const main = parts[1] ?? parts[0];
  const record = parts.find((part) => /record|video|take|loop/i.test(part)) ?? "Capture one short example for your teacher.";

  return {
    id: `plan-${lesson.id}`,
    studentCrmId: lesson.studentCrmId,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonNumber: lesson.lessonNumber,
    createdAt: `${lesson.scheduledDate}T12:00:00.000Z`,
    title: `Lesson ${lesson.lessonNumber}: ${lesson.title}`,
    recap: parts[0],
    ageBand,
    items: [
      {
        id: `plan-${lesson.id}-warmup`,
        kind: "warmup",
        title: ageBand === "under10" ? "Warm-up sound" : "Warm up with intention",
        detail: parts[0],
        minutes: ageBand === "under10" ? 4 : 8,
      },
      {
        id: `plan-${lesson.id}-focus`,
        kind: "focus",
        title: `${verb} the lesson focus`,
        detail: main,
        minutes: ageBand === "under10" ? 8 : 15,
      },
      {
        id: `plan-${lesson.id}-record`,
        kind: "record",
        title: ageBand === "adult" ? "Submit a review snapshot" : "Send one checkpoint",
        detail: record,
        minutes: 3,
      },
    ],
  };
}

export function getPracticePlanForLesson(lesson: LessonSummary, ageBand: StudentAgeBand): PracticePlan {
  const state = readState();
  const existing = state.plans.find((plan) => plan.lessonId === lesson.id && plan.studentCrmId === lesson.studentCrmId);
  if (existing) return existing;
  return generatePracticePlan(lesson, ageBand);
}

export function listPracticeSubmissions(studentCrmId?: string) {
  const rows = readState().submissions;
  return (studentCrmId ? rows.filter((row) => row.studentCrmId === studentCrmId) : rows).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function listPendingPracticeSubmissions(studentCrmId?: string) {
  return listPracticeSubmissions(studentCrmId).filter((row) => row.status === "needs_review" || row.status === "redo");
}

export function addPracticeSubmission(input: {
  plan: PracticePlan;
  itemId: string | null;
  body: string;
  durationSec?: number;
}) {
  const state = readState();
  const row: PracticeSubmission = {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    studentCrmId: input.plan.studentCrmId,
    lessonId: input.plan.lessonId,
    planId: input.plan.id,
    itemId: input.itemId,
    body: input.body.slice(0, 1000),
    durationSec: input.durationSec,
    evidenceType: input.durationSec ? "timer" : "reflection",
    status: "needs_review",
    createdAt: new Date().toISOString(),
  };
  writeState({ ...state, submissions: [row, ...state.submissions] });
  return row;
}

export function reviewPracticeSubmission(id: string, status: PracticeSubmissionStatus, instructorNote: string) {
  const state = readState();
  writeState({
    ...state,
    submissions: state.submissions.map((row) =>
      row.id === id
        ? {
            ...row,
            status,
            instructorNote: instructorNote.slice(0, 1000),
            reviewedAt: new Date().toISOString(),
          }
        : row,
    ),
  });
}
