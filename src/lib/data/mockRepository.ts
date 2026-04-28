import {
  DEFAULT_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  normalizeLastPositionSec,
  normalizePlaybackRate,
  type AddExerciseInput,
  type AddMediaCommentInput,
  type AddMilestoneInput,
  type AddVideoInput,
  type AppendActivityInput,
  type AppRepository,
  type ListVideosOptions,
  type PublishShowcaseInput,
} from "@/lib/data/repository";
import type {
  ActivityEvent,
  LessonSummary,
  MediaComment,
  ShowcasePost,
  StudentMilestone,
  StudentProfile,
  UserPreferences,
  VideoPlaybackSettings,
} from "@/lib/domain/types";
import { isShowcaseTextAllowed } from "@/lib/showcase-moderation";
import {
  computePracticeStreakDays,
  DEFAULT_DAILY_GOAL_MINUTES,
  localDayKey,
} from "@/lib/student-progress";
import {
  MOCK_CATEGORIES,
  MOCK_EXERCISES,
  MOCK_LESSONS,
  MOCK_STUDENTS,
  MOCK_VIDEOS,
} from "@/mocks/fixtures";

type LessonEmbedPatch = { externalScoreEmbedUrl?: string | null };

type PersistedState = {
  videos: typeof MOCK_VIDEOS;
  exercises: typeof MOCK_EXERCISES;
  playback: Record<string, VideoPlaybackSettings>;
  preferences: Record<string, UserPreferences>;
  extraStudents: StudentProfile[];
  dailyPracticeMinutes: Record<string, Record<string, number>>;
  milestones: StudentMilestone[];
  activityEvents: ActivityEvent[];
  mediaComments: MediaComment[];
  showcasePosts: ShowcasePost[];
  lessonEmbeds: Record<string, LessonEmbedPatch>;
};

const STORAGE_KEY = "real-school-mock-state-v1";

/** Until this is true in the browser, `loadState` mirrors SSR (memory) so hydration matches. */
let mockRepositoryClientHydrated = false;

export function markMockRepositoryHydrated() {
  mockRepositoryClientHydrated = true;
}

const seedMilestones: StudentMilestone[] = [
  {
    id: "ms-alex-sync",
    studentCrmId: "crm-alex",
    conceptKey: "syncopation",
    label: "Syncopation basics",
    achievedAt: "2026-04-10T15:00:00.000Z",
    source: "instructor",
  },
  {
    id: "ms-alex-barre",
    studentCrmId: "crm-alex",
    conceptKey: "barre-chords",
    label: "Barre chords",
    achievedAt: "2026-04-15T12:00:00.000Z",
    source: "instructor",
  },
];

const seedActivity: ActivityEvent[] = [
  {
    id: "act-alex-1",
    studentCrmId: "crm-alex",
    kind: "milestone",
    title: "Unlocked: Barre chords",
    detail: "Instructor checked off a major concept.",
    createdAt: "2026-04-15T12:05:00.000Z",
  },
  {
    id: "act-alex-2",
    studentCrmId: "crm-alex",
    kind: "video_upload",
    title: "New feedback video",
    detail: "Lesson 12 milestone showcase",
    createdAt: "2026-04-20T10:00:00.000Z",
  },
];

const seedComments: MediaComment[] = [
  {
    id: "cmt-1",
    videoId: "vid-alex-1",
    authorRole: "instructor",
    authorLabel: "Sarah M.",
    body: "Watch your thumb placement here — keep it relaxed behind the neck.",
    tSec: 3,
    createdAt: "2026-04-20T11:00:00.000Z",
  },
];

const seedShowcase: ShowcasePost[] = [
  {
    id: "sh-seed-alex-1",
    studentCrmId: "crm-alex",
    videoId: "vid-alex-1",
    caption: "Clean take on the intro — sharing with the studio.",
    publishedAt: "2026-04-22T18:00:00.000Z",
    reactions: [{ emoji: "👏", count: 4 }],
    textComments: [
      {
        id: "shc-seed-1",
        authorLabel: "Household",
        body: "Sounds great!",
        createdAt: "2026-04-22T19:00:00.000Z",
      },
    ],
  },
];

const memoryState: PersistedState = {
  videos: [...MOCK_VIDEOS],
  exercises: [...MOCK_EXERCISES],
  playback: {},
  preferences: {},
  extraStudents: [],
  dailyPracticeMinutes: {
    "crm-alex": { "2026-04-24": 35, "2026-04-23": 32 },
    "crm-sam": { "2026-04-24": 40 },
  },
  milestones: [...seedMilestones],
  activityEvents: [...seedActivity],
  mediaComments: [...seedComments],
  showcasePosts: [...seedShowcase],
  lessonEmbeds: {
    "les-11": {
      externalScoreEmbedUrl:
        "https://flat.io/embed?sharingKey=mock-demo-score&theme=dark&layout=page&audioMetronome=0",
    },
  },
};

function normalizePersisted(parsed: Partial<PersistedState> | null): PersistedState {
  if (!parsed) return { ...memoryState };
  return {
    videos: parsed.videos?.length ? parsed.videos : [...MOCK_VIDEOS],
    exercises: parsed.exercises?.length ? parsed.exercises : [...MOCK_EXERCISES],
    playback: parsed.playback ?? {},
    preferences: parsed.preferences ?? {},
    extraStudents: Array.isArray(parsed.extraStudents) ? parsed.extraStudents : [],
    dailyPracticeMinutes:
      parsed.dailyPracticeMinutes && typeof parsed.dailyPracticeMinutes === "object"
        ? parsed.dailyPracticeMinutes
        : { ...memoryState.dailyPracticeMinutes },
    milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [...memoryState.milestones],
    activityEvents: Array.isArray(parsed.activityEvents) ? parsed.activityEvents : [...memoryState.activityEvents],
    mediaComments: Array.isArray(parsed.mediaComments) ? parsed.mediaComments : [...memoryState.mediaComments],
    showcasePosts: Array.isArray(parsed.showcasePosts) ? parsed.showcasePosts : [...memoryState.showcasePosts],
    lessonEmbeds:
      parsed.lessonEmbeds && typeof parsed.lessonEmbeds === "object"
        ? parsed.lessonEmbeds
        : { ...memoryState.lessonEmbeds },
  };
}

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
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return normalizePersisted(parsed);
  } catch {
    return memoryState;
  }
}

function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("mock-repository-updated"));
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

function mergeLesson(lesson: LessonSummary): LessonSummary {
  const state = loadState();
  const patch = state.lessonEmbeds[lesson.id];
  if (!patch) return lesson;
  return { ...lesson, ...patch };
}

function appendActivity(state: PersistedState, input: AppendActivityInput): ActivityEvent {
  const row: ActivityEvent = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    studentCrmId: input.studentCrmId,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    createdAt: new Date().toISOString(),
  };
  state.activityEvents = [row, ...state.activityEvents].slice(0, 500);
  return row;
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
    )
      .map((lesson) => mergeLesson(lesson))
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  },

  getLesson(lessonId) {
    const base = MOCK_LESSONS.find((lesson) => lesson.id === lessonId);
    if (!base) return undefined;
    return mergeLesson(base);
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
    appendActivity(state, {
      studentCrmId: input.studentCrmId,
      kind: "video_upload",
      title: "New media assigned",
      detail: created.title,
    });
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

  addExercise(input: AddExerciseInput) {
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

  getDailyPracticeSummary(crmId, dayLocal) {
    const state = loadState();
    const day = dayLocal ?? localDayKey();
    const minutes = state.dailyPracticeMinutes[crmId]?.[day] ?? 0;
    return { dayLocal: day, minutes, goalMinutes: DEFAULT_DAILY_GOAL_MINUTES };
  },

  recordDailyPracticeMinutes(crmId, minutes, dayLocal) {
    const state = loadState();
    const day = dayLocal ?? localDayKey();
    if (minutes <= 0) {
      const m = state.dailyPracticeMinutes[crmId]?.[day] ?? 0;
      return { dayLocal: day, minutes: m, goalMinutes: DEFAULT_DAILY_GOAL_MINUTES };
    }
    const byStudent = { ...(state.dailyPracticeMinutes[crmId] ?? {}) };
    const prev = byStudent[day] ?? 0;
    byStudent[day] = prev + minutes;
    state.dailyPracticeMinutes = { ...state.dailyPracticeMinutes, [crmId]: byStudent };
    if (Math.round(minutes) >= 1) {
      appendActivity(state, {
        studentCrmId: crmId,
        kind: "practice_session",
        title: "Practice logged",
        detail: `${Math.round(minutes)} min`,
      });
    }
    saveState(state);
    return { dayLocal: day, minutes: byStudent[day], goalMinutes: DEFAULT_DAILY_GOAL_MINUTES };
  },

  getPracticeStreakDays(crmId, goalMinutes) {
    const state = loadState();
    const goal = goalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;
    const map = state.dailyPracticeMinutes[crmId] ?? {};
    return computePracticeStreakDays(map, localDayKey(), goal);
  },

  getDailyPracticeMinutesMap(crmId) {
    const state = loadState();
    return { ...(state.dailyPracticeMinutes[crmId] ?? {}) };
  },

  listMilestones(crmId) {
    const state = loadState();
    return state.milestones.filter((m) => m.studentCrmId === crmId).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
  },

  addMilestone(input: AddMilestoneInput) {
    const state = loadState();
    const row: StudentMilestone = {
      id: `ms-${Date.now()}`,
      studentCrmId: input.studentCrmId,
      conceptKey: input.conceptKey,
      label: input.label,
      source: input.source,
      achievedAt: new Date().toISOString(),
    };
    state.milestones = [row, ...state.milestones];
    appendActivity(state, {
      studentCrmId: input.studentCrmId,
      kind: "milestone",
      title: `Unlocked: ${input.label}`,
      detail: input.conceptKey,
    });
    saveState(state);
    return row;
  },

  listActivityEvents(crmId, limit) {
    const state = loadState();
    const rows = state.activityEvents.filter((e) => e.studentCrmId === crmId);
    return typeof limit === "number" ? rows.slice(0, limit) : rows;
  },

  listActivityEventsForParent(parentCrmId, limit) {
    const state = loadState();
    const students = new Set(
      mergeStudents(state).filter((s) => s.parentCrmId === parentCrmId).map((s) => s.crmId),
    );
    const rows = state.activityEvents.filter((e) => students.has(e.studentCrmId));
    const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  },

  appendActivityEvent(input: AppendActivityInput) {
    const state = loadState();
    const row = appendActivity(state, input);
    saveState(state);
    return row;
  },

  listMediaComments(videoId) {
    const state = loadState();
    return state.mediaComments.filter((c) => c.videoId === videoId).sort((a, b) => a.tSec - b.tSec || a.createdAt.localeCompare(b.createdAt));
  },

  addMediaComment(input: AddMediaCommentInput) {
    const state = loadState();
    const row: MediaComment = {
      id: `cmt-${Date.now()}`,
      videoId: input.videoId,
      authorRole: input.authorRole,
      authorLabel: input.authorLabel,
      body: input.body,
      tSec: input.tSec,
      createdAt: new Date().toISOString(),
    };
    state.mediaComments = [...state.mediaComments, row];
    const video = state.videos.find((v) => v.id === input.videoId);
    if (video) {
      appendActivity(state, {
        studentCrmId: video.studentCrmId,
        kind: "instructor_comment",
        title: "New feedback on a video",
        detail: row.body.slice(0, 80),
      });
    }
    saveState(state);
    return row;
  },

  listShowcasePosts() {
    const state = loadState();
    return [...state.showcasePosts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  },

  publishShowcasePost(input: PublishShowcaseInput) {
    if (!isShowcaseTextAllowed(input.caption)) {
      throw new Error("Caption blocked by mock moderation (try different wording).");
    }
    const state = loadState();
    const post: ShowcasePost = {
      id: `sh-${Date.now()}`,
      studentCrmId: input.studentCrmId,
      videoId: input.videoId,
      caption: input.caption.slice(0, 280),
      publishedAt: new Date().toISOString(),
      reactions: [],
      textComments: [],
    };
    state.showcasePosts = [post, ...state.showcasePosts];
    appendActivity(state, {
      studentCrmId: input.studentCrmId,
      kind: "showcase_post",
      title: "Posted to Studio Showcase",
      detail: input.caption.slice(0, 80),
    });
    saveState(state);
    return post;
  },

  addShowcaseEmojiReaction(postId, emoji) {
    const state = loadState();
    const idx = state.showcasePosts.findIndex((p) => p.id === postId);
    if (idx < 0) return;
    const post = state.showcasePosts[idx];
    const reactions = [...post.reactions];
    const rIdx = reactions.findIndex((r) => r.emoji === emoji);
    if (rIdx >= 0) {
      reactions[rIdx] = { ...reactions[rIdx], count: reactions[rIdx].count + 1, self: true };
    } else {
      reactions.push({ emoji, count: 1, self: true });
    }
    state.showcasePosts = state.showcasePosts.map((p, i) => (i === idx ? { ...p, reactions } : p));
    saveState(state);
  },

  addShowcaseTextComment(postId, authorLabel, body) {
    if (!isShowcaseTextAllowed(body)) return;
    const state = loadState();
    const idx = state.showcasePosts.findIndex((p) => p.id === postId);
    if (idx < 0) return;
    const post = state.showcasePosts[idx];
    const textComments = [
      ...post.textComments,
      {
        id: `shc-${Date.now()}`,
        authorLabel,
        body: body.slice(0, 400),
        createdAt: new Date().toISOString(),
      },
    ];
    state.showcasePosts = state.showcasePosts.map((p, i) => (i === idx ? { ...p, textComments } : p));
    saveState(state);
  },

  updateLessonExternalScore(lessonId, embedUrl) {
    const state = loadState();
    state.lessonEmbeds = {
      ...state.lessonEmbeds,
      [lessonId]: { externalScoreEmbedUrl: embedUrl },
    };
    saveState(state);
  },
};
