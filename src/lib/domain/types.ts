export type AppRole = "admin" | "instructor" | "parent" | "student";

export type UploaderRole = "instructor" | "admin" | "student";

export type ProgramType = "lessons" | "bands" | "camps";
export type MusicInstrument =
  | "piano"
  | "guitar"
  | "violin"
  | "cello"
  | "flute"
  | "clarinet"
  | "saxophone"
  | "trumpet"
  | "drums";
export type MetronomeSound =
  | "classic_click"
  | "bright_beep"
  | "warm_pulse"
  | "digital_blip"
  | "soft_tick";

export type MediaCategory = {
  id: string;
  slug: string;
  label: string;
};

export type StudentProfile = {
  crmId: string;
  displayName: string;
  primaryInstructorId: string;
  parentCrmId: string;
  enrolledPrograms: ProgramType[];
};

export type LessonSummary = {
  id: string;
  studentCrmId: string;
  program: ProgramType;
  title: string;
  scheduledDate: string;
  lessonNumber: number;
  instrument: string;
  /** Optional longer notes shown on the lesson page (plan, focus, homework). */
  notes?: string;
};

export type StudentVideo = {
  id: string;
  studentCrmId: string;
  lessonId: string | null;
  categoryId: string;
  title: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSec: number;
  uploaderRole: UploaderRole;
  createdAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type VideoPlaybackSettings = {
  playbackRate: number;
  scrollMode: "overlay" | "below";
  lastPositionSec: number;
};

export type UserPreferences = {
  metronomeSound: MetronomeSound;
};

export type ExerciseNote = {
  id: string;
  /** Scientific pitch notation (e.g. C4, F#3, Bb5) or "rest". */
  pitch: string;
  /** Duration in quarter-note beats (1 = quarter, 0.5 = eighth, 2 = half). */
  beats: number;
};

export type NotationExercise = {
  id: string;
  studentCrmId: string;
  lessonId: string | null;
  title: string;
  instrument: MusicInstrument;
  tempoBpm: number;
  notes: ExerciseNote[];
  createdByInstructorId: string;
  createdAt: string;
};
