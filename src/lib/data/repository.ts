import type {
  AppRole,
  ExerciseNote,
  LessonSummary,
  MusicInstrument,
  MetronomeSound,
  MediaCategory,
  NotationExercise,
  ProgramType,
  StudentProfile,
  StudentVideo,
  UploaderRole,
  UserPreferences,
  VideoPlaybackSettings,
} from "@/lib/domain/types";

export type ListVideosOptions = {
  includeArchived?: boolean;
  includeDeleted?: boolean;
};

export type AddVideoInput = {
  studentCrmId: string;
  lessonId: string | null;
  categoryId: string;
  title: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSec: number;
  uploaderRole: UploaderRole;
};

export type ListExercisesOptions = {
  lessonId?: string;
};

export type AddExerciseInput = {
  studentCrmId: string;
  lessonId: string | null;
  title: string;
  instrument: MusicInstrument;
  tempoBpm: number;
  notes: ExerciseNote[];
  createdByInstructorId: string;
};

export const DEFAULT_SETTINGS: VideoPlaybackSettings = {
  playbackRate: 1,
  scrollMode: "overlay",
  lastPositionSec: 0,
};

/** Clamps to 0.5–1.5 and one decimal place; invalid values become 1×. */
export function normalizePlaybackRate(rate: unknown): number {
  const n = typeof rate === "number" ? rate : Number(rate);
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.min(1.5, Math.max(0.5, n));
  return Math.round(clamped * 10) / 10;
}

/** Non-negative seek position; NaN/negative/invalid become 0 (avoids video element errors). */
export function normalizeLastPositionSec(sec: unknown): number {
  const n = typeof sec === "number" ? sec : Number(sec);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  metronomeSound: "classic_click",
};

export const METRONOME_SOUND_OPTIONS: { value: MetronomeSound; label: string }[] = [
  { value: "classic_click", label: "Classic Click" },
  { value: "bright_beep", label: "Bright Beep" },
  { value: "warm_pulse", label: "Warm Pulse" },
  { value: "digital_blip", label: "Digital Blip" },
  { value: "soft_tick", label: "Soft Tick" },
];

export type AppRepository = {
  listCategories(): MediaCategory[];
  listStudents(): StudentProfile[];
  getStudent(crmId: string): StudentProfile | undefined;
  listLessonsForStudent(crmId: string, program?: ProgramType): LessonSummary[];
  getLesson(lessonId: string): LessonSummary | undefined;
  listProgramsForStudent(crmId: string): ProgramType[];
  listVideosForStudent(crmId: string, opts?: ListVideosOptions): StudentVideo[];
  getVideo(videoId: string): StudentVideo | undefined;
  addVideo(input: AddVideoInput): StudentVideo;
  archiveVideo(videoId: string): void;
  unarchiveVideo(videoId: string): void;
  deleteVideo(videoId: string): void;
  getPlaybackSettings(userKey: string, videoId: string): VideoPlaybackSettings;
  updatePlaybackSettings(
    userKey: string,
    videoId: string,
    patch: Partial<VideoPlaybackSettings>,
  ): void;
  getUserPreferences(userKey: string): UserPreferences;
  updateUserPreferences(userKey: string, patch: Partial<UserPreferences>): void;
  /** Appends a household-created student profile (mock CRM) persisted with mock state. */
  appendMockStudent(student: StudentProfile): void;
  listExercisesForStudent(crmId: string, opts?: ListExercisesOptions): NotationExercise[];
  addExercise(input: AddExerciseInput): NotationExercise;
};

export const MOCK_USER_KEYS: Record<AppRole, string> = {
  admin: "admin-demo",
  instructor: "instr-morgan",
  parent: "parent-jordan",
  student: "student-alex",
};
