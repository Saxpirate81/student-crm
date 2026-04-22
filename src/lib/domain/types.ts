export type AppRole = "admin" | "instructor" | "parent" | "student";

export type UploaderRole = "instructor" | "admin" | "student";

export type ProgramType = "lessons" | "bands" | "camps";
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
