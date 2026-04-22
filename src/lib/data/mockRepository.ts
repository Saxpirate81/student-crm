import {
  DEFAULT_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  normalizeLastPositionSec,
  normalizePlaybackRate,
  type AddVideoInput,
  type AppRepository,
  type ListVideosOptions,
} from "@/lib/data/repository";
import type { StudentProfile, UserPreferences, VideoPlaybackSettings } from "@/lib/domain/types";
import {
  MOCK_CATEGORIES,
  MOCK_EXERCISES,
  MOCK_LESSONS,
  MOCK_STUDENTS,
  MOCK_VIDEOS,
} from "@/mocks/fixtures";

type PersistedState = {
  videos: typeof MOCK_VIDEOS;
  exercises: typeof MOCK_EXERCISES;
  playback: Record<string, VideoPlaybackSettings>;
  preferences: Record<string, UserPreferences>;
  extraStudents: StudentProfile[];
};

const STORAGE_KEY = "real-school-mock-state-v1";

/** Until this is true in the browser, `loadState` mirrors SSR (memory) so hydration matches. */
let mockRepositoryClientHydrated = false;

export function markMockRepositoryHydrated() {
  mockRepositoryClientHydrated = true;
}

const memoryState: PersistedState = {
  videos: [...MOCK_VIDEOS],
  exercises: [...MOCK_EXERCISES],
  playback: {},
  preferences: {},
  extraStudents: [],
};

function mergeStudents(state: PersistedState): StudentProfile[] {
  const byId = new Map<string, StudentProfile>();
  for (const row of MOCK_STUDENTS) byId.set(row.crmId, row);
  for (const row of state.extraStudents ?? []) byId.set(row.crmId, row);
  return [...byId.values()];
}

function loadState(): PersistedState {
  if (typeof window === "undefined" || !mockRepositoryClientHydrated) return memoryState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryState;
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      videos: parsed.videos?.length ? parsed.videos : [...MOCK_VIDEOS],
      exercises: parsed.exercises?.length ? parsed.exercises : [...MOCK_EXERCISES],
      playback: parsed.playback ?? {},
      preferences: parsed.preferences ?? {},
      extraStudents: Array.isArray(parsed.extraStudents) ? parsed.extraStudents : [],
    };
  } catch {
    return memoryState;
  }
}

function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function keyFor(userKey: string, videoId: string) {
  return `${userKey}::${videoId}`;
}

function appendExtraStudent(student: StudentProfile) {
  const state = loadState();
  if (state.extraStudents.some((row) => row.crmId === student.crmId)) return;
  state.extraStudents.push(student);
  saveState(state);
}

/** Used by mock auth when a parent adds a household student profile. */
export function appendMockStudent(student: StudentProfile) {
  appendExtraStudent(student);
}

function filterVideos(videos: typeof MOCK_VIDEOS, opts?: ListVideosOptions) {
  return videos.filter((video) => {
    if (!opts?.includeDeleted && video.deletedAt) return false;
    if (!opts?.includeArchived && video.archivedAt) return false;
    return true;
  });
}

export const mockRepository: AppRepository = {
  listCategories() {
    return [...MOCK_CATEGORIES];
  },

  listStudents() {
    const state = loadState();
    return mergeStudents(state);
  },

  getStudent(crmId) {
    const state = loadState();
    return mergeStudents(state).find((student) => student.crmId === crmId);
  },

  listLessonsForStudent(crmId, program) {
    return MOCK_LESSONS.filter(
      (lesson) => lesson.studentCrmId === crmId && (!program || lesson.program === program),
    ).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  },

  getLesson(lessonId) {
    return MOCK_LESSONS.find((lesson) => lesson.id === lessonId);
  },

  listProgramsForStudent(crmId) {
    const state = loadState();
    const student = mergeStudents(state).find((item) => item.crmId === crmId);
    return student?.enrolledPrograms ?? ["lessons"];
  },

  listVideosForStudent(crmId, opts) {
    const state = loadState();
    return filterVideos(state.videos, opts)
      .filter((video) => video.studentCrmId === crmId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getVideo(videoId) {
    const state = loadState();
    return state.videos.find((video) => video.id === videoId);
  },

  addVideo(input: AddVideoInput) {
    const state = loadState();
    const created = {
      ...input,
      id: `vid-${Date.now()}`,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      deletedAt: null,
    };
    state.videos = [created, ...state.videos];
    saveState(state);
    return created;
  },

  archiveVideo(videoId) {
    const state = loadState();
    state.videos = state.videos.map((video) =>
      video.id === videoId ? { ...video, archivedAt: new Date().toISOString() } : video,
    );
    saveState(state);
  },

  unarchiveVideo(videoId) {
    const state = loadState();
    state.videos = state.videos.map((video) =>
      video.id === videoId ? { ...video, archivedAt: null } : video,
    );
    saveState(state);
  },

  deleteVideo(videoId) {
    const state = loadState();
    state.videos = state.videos.map((video) =>
      video.id === videoId ? { ...video, deletedAt: new Date().toISOString() } : video,
    );
    saveState(state);
  },

  getPlaybackSettings(userKey, videoId) {
    const state = loadState();
    const saved = state.playback[keyFor(userKey, videoId)];
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    return {
      ...merged,
      playbackRate: normalizePlaybackRate(merged.playbackRate),
      lastPositionSec: normalizeLastPositionSec(merged.lastPositionSec),
    };
  },

  updatePlaybackSettings(userKey, videoId, patch) {
    const state = loadState();
    const current = state.playback[keyFor(userKey, videoId)] ?? { ...DEFAULT_SETTINGS };
    const next = { ...current, ...patch };
    if ("playbackRate" in patch) {
      next.playbackRate = normalizePlaybackRate(patch.playbackRate);
    }
    if ("lastPositionSec" in patch) {
      next.lastPositionSec = normalizeLastPositionSec(patch.lastPositionSec);
    }
    state.playback[keyFor(userKey, videoId)] = next;
    saveState(state);
  },

  getUserPreferences(userKey) {
    const state = loadState();
    const saved = state.preferences[userKey];
    return { ...DEFAULT_USER_PREFERENCES, ...saved };
  },

  updateUserPreferences(userKey, patch) {
    const state = loadState();
    const current = state.preferences[userKey] ?? { ...DEFAULT_USER_PREFERENCES };
    state.preferences[userKey] = { ...current, ...patch };
    saveState(state);
  },

  appendMockStudent(student) {
    appendExtraStudent(student);
  },

  listExercisesForStudent(crmId, opts) {
    const state = loadState();
    return state.exercises
      .filter((exercise) => {
        if (exercise.studentCrmId !== crmId) return false;
        if (opts?.lessonId && exercise.lessonId !== opts.lessonId) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  addExercise(input) {
    const state = loadState();
    const created = {
      ...input,
      id: `ex-${Date.now()}`,
      notes: input.notes.map((note, idx) => ({ ...note, id: note.id || `n-${idx + 1}` })),
      createdAt: new Date().toISOString(),
    };
    state.exercises = [created, ...state.exercises];
    saveState(state);
    return created;
  },
};
