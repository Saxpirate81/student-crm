"use client";

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
  type ListExercisesOptions,
  type PublishShowcaseInput,
} from "@/lib/data/repository";
import { mockRepository } from "@/lib/data/mockRepository";
import type {
  ActivityEvent,
  LessonSummary,
  MediaCategory,
  MediaComment,
  NotationExercise,
  ProgramType,
  ShowcasePost,
  StudentMilestone,
  StudentProfile,
  StudentVideo,
  UserPreferences,
  VideoPlaybackSettings,
} from "@/lib/domain/types";
import type { RosterInstructor } from "@/lib/ops-roster/households";
import type { ScheduleBlock } from "@/lib/ops-roster/schedule";
import { isSupabaseDataSource } from "@/lib/config/data-source";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const SUPABASE_REPOSITORY_UPDATED_EVENT = "supabase-repository-updated";

const FALLBACK_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
const FALLBACK_THUMBNAIL_URL =
  "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217";

type PersonRow = {
  id: string;
  display_name: string;
  birth_year: number | null;
  metadata: Record<string, unknown> | null;
};

type PersonRoleRow = {
  person_id: string;
  role_id: string;
  active: boolean;
};

type RoleRow = {
  id: string;
  key: string;
};

type LessonRow = {
  id: string;
  student_person_id: string;
  lesson_date: string;
  title: string;
  instrument: string | null;
  lesson_type: string | null;
  lesson_notes: string | null;
  today_practice_plan: string | null;
  student_recap: string | null;
  metadata: Record<string, unknown> | null;
};

type MediaAssetRow = {
  id: string;
  owner_person_id: string | null;
  title: string;
  description: string | null;
  media_kind: string;
  source_kind: string;
  external_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  compression_status: string;
  created_at: string;
};

type MediaLinkRow = {
  media_asset_id: string;
  lesson_id: string | null;
  assignment_id: string | null;
  student_person_id: string | null;
  link_context: string;
};

type SupabaseRepositoryState = {
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  students: StudentProfile[];
  instructors: RosterInstructor[];
  schedule: ScheduleBlock[];
  lessons: LessonSummary[];
  videos: StudentVideo[];
  categories: MediaCategory[];
  rosterMeta: {
    studentCount: number;
    householdCount: number;
    instructorCount: number;
  } | null;
};

const state: SupabaseRepositoryState = {
  hydrated: false,
  loading: false,
  error: null,
  students: [],
  instructors: [],
  schedule: [],
  lessons: [],
  videos: [],
  categories: [
    { id: "cat-milestone", slug: "milestone_showcase", label: "Milestone Showcase" },
    { id: "cat-tutorial", slug: "tutorial", label: "Tutorial" },
    { id: "cat-library", slug: "library", label: "Library" },
  ],
  rosterMeta: null,
};

function emitUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPABASE_REPOSITORY_UPDATED_EVENT));
}

function ageBandFromBirthYear(birthYear: number | null | undefined): StudentProfile["ageBand"] {
  if (!birthYear) return undefined;
  const age = new Date().getFullYear() - birthYear;
  if (age < 10) return "under10";
  if (age < 13) return "10to12";
  if (age <= 18) return "13to18";
  return "adult";
}

function asProgram(value: unknown): ProgramType {
  if (value === "bands" || value === "camps" || value === "lessons") return value;
  return "lessons";
}

function lessonNumberFromDate(date: string, index: number) {
  const month = date.slice(5, 7);
  const day = date.slice(8, 10);
  const compact = Number(`${month}${day}`);
  return Number.isFinite(compact) && compact > 0 ? compact : index + 1;
}

function mergedStudents() {
  if (state.students.length) return state.students;
  if (state.loading || state.error || isSupabaseDataSource()) return [];
  return mockRepository.listStudents();
}

function studentFallback(crmId: string) {
  if (state.students.length || isSupabaseDataSource()) {
    return state.students.find((student) => student.crmId === crmId);
  }
  return mockRepository.getStudent(crmId);
}

async function loadOpsRosterStudents() {
  const response = await fetch("/api/ops-roster", { cache: "no-store" });
  const payload = (await response.json()) as {
    students?: StudentProfile[];
    instructors?: RosterInstructor[];
    schedule?: ScheduleBlock[];
    studentCount?: number;
    householdCount?: number;
    instructorCount?: number;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Could not load live attendance roster.");
  }
  state.students = (payload.students ?? []).map((student) => ({
    crmId: student.crmId,
    displayName: student.displayName,
    primaryInstructorId: student.primaryInstructorId,
    instructorIds: student.instructorIds ?? student.services?.map((service) => service.instructorId) ?? [],
    parentCrmId: student.parentCrmId,
    parentDisplayName: student.parentDisplayName,
    parentEmail: student.parentEmail,
    enrolledPrograms: student.enrolledPrograms?.length ? student.enrolledPrograms : ["lessons"],
    services: student.services ?? [],
  }));
  state.instructors = payload.instructors ?? [];
  state.schedule = payload.schedule ?? [];
  state.rosterMeta = {
    studentCount: payload.studentCount ?? state.students.length,
    householdCount: payload.householdCount ?? new Set(state.students.map((row) => row.parentCrmId)).size,
    instructorCount: payload.instructorCount ?? state.instructors.length,
  };
}

async function loadAppCoreData() {
  if (!isSupabaseConfigured() || state.loading) return;

  state.loading = true;
  state.error = null;
  emitUpdate();

  try {
    await loadOpsRosterStudents();
    emitUpdate();

    const supabase = getSupabaseBrowserClient().schema("app_core");

    const [
      peopleResult,
      rolesResult,
      personRolesResult,
      lessonsResult,
      mediaAssetsResult,
      mediaLinksResult,
    ] = await Promise.all([
      supabase.from("persons").select("id, display_name, birth_year, metadata").eq("profile_status", "active"),
      supabase.from("roles").select("id, key"),
      supabase.from("person_roles").select("person_id, role_id, active").eq("active", true),
      supabase
        .from("lessons")
        .select("id, student_person_id, lesson_date, title, instrument, lesson_type, lesson_notes, today_practice_plan, student_recap, metadata")
        .order("lesson_date", { ascending: false }),
      supabase
        .from("media_assets")
        .select("id, owner_person_id, title, description, media_kind, source_kind, external_url, thumbnail_url, duration_seconds, compression_status, created_at")
        .eq("media_kind", "video")
        .order("created_at", { ascending: false }),
      supabase.from("media_links").select("media_asset_id, lesson_id, assignment_id, student_person_id, link_context"),
    ]);

    const firstError =
      peopleResult.error ??
      rolesResult.error ??
      personRolesResult.error ??
      lessonsResult.error ??
      mediaAssetsResult.error ??
      mediaLinksResult.error;

    if (firstError) throw firstError;

    const people = (peopleResult.data ?? []) as PersonRow[];
    const roles = (rolesResult.data ?? []) as RoleRow[];
    const personRoles = (personRolesResult.data ?? []) as PersonRoleRow[];
    const lessons = (lessonsResult.data ?? []) as LessonRow[];
    const mediaAssets = (mediaAssetsResult.data ?? []) as MediaAssetRow[];
    const mediaLinks = (mediaLinksResult.data ?? []) as MediaLinkRow[];

    const roleKeyById = new Map(roles.map((role) => [role.id, role.key]));
    const studentPersonIds = new Set(
      personRoles
        .filter((row) => roleKeyById.get(row.role_id) === "student")
        .map((row) => row.person_id),
    );
    const peopleById = new Map(people.map((person) => [person.id, person]));

    const primaryInstructorByStudent = new Map<string, string>();
    for (const lesson of lessons) {
      const instructor = (lesson.metadata?.instructor_person_id as string | undefined) ?? "instr-supabase";
      if (!primaryInstructorByStudent.has(lesson.student_person_id)) {
        primaryInstructorByStudent.set(lesson.student_person_id, instructor);
      }
    }

    const nextStudents = people
      .filter((person) => studentPersonIds.has(person.id))
      .map((person): StudentProfile => ({
        crmId: person.id,
        displayName: person.display_name,
        primaryInstructorId: primaryInstructorByStudent.get(person.id) ?? "instr-supabase",
        parentCrmId: String(person.metadata?.parent_crm_id ?? "parent-supabase"),
        enrolledPrograms: ["lessons"],
        ageBand: ageBandFromBirthYear(person.birth_year),
      }));

    const sortedLessons = [...lessons].sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));
    const nextLessons = sortedLessons.map((lesson, index): LessonSummary => ({
      id: lesson.id,
      studentCrmId: lesson.student_person_id,
      program: asProgram(lesson.metadata?.program),
      title: lesson.title,
      scheduledDate: lesson.lesson_date,
      lessonNumber: lessonNumberFromDate(lesson.lesson_date, index),
      instrument: lesson.instrument ?? "Music",
      notes: lesson.today_practice_plan ?? lesson.student_recap ?? lesson.lesson_notes ?? undefined,
      externalScoreEmbedUrl: (lesson.metadata?.external_score_embed_url as string | null | undefined) ?? null,
    }));

    const linksByAsset = new Map<string, MediaLinkRow[]>();
    for (const link of mediaLinks) {
      linksByAsset.set(link.media_asset_id, [...(linksByAsset.get(link.media_asset_id) ?? []), link]);
    }

    const lessonById = new Map(nextLessons.map((lesson) => [lesson.id, lesson]));
    const nextVideos = mediaAssets.map((asset): StudentVideo => {
      const link = linksByAsset.get(asset.id)?.[0];
      const lesson = link?.lesson_id ? lessonById.get(link.lesson_id) : undefined;
      const studentCrmId = link?.student_person_id ?? lesson?.studentCrmId ?? asset.owner_person_id ?? "";

      return {
        id: asset.id,
        studentCrmId,
        lessonId: link?.lesson_id ?? null,
        assignmentId: link?.assignment_id ?? null,
        categoryId: asset.source_kind === "external_url" ? "cat-tutorial" : "cat-library",
        title: asset.title,
        description: asset.description,
        playbackUrl: asset.external_url ?? FALLBACK_VIDEO_URL,
        thumbnailUrl: asset.thumbnail_url ?? FALLBACK_THUMBNAIL_URL,
        durationSec: asset.duration_seconds ?? 0,
        uploaderRole: asset.owner_person_id && peopleById.has(asset.owner_person_id) ? "instructor" : "admin",
        sourceType: asset.source_kind === "external_url" ? "url" : asset.source_kind === "local_upload" ? "upload" : "library",
        compressionStatus: asset.compression_status === "complete" ? "compressed" : "queued",
        createdAt: asset.created_at,
        archivedAt: null,
        deletedAt: null,
      };
    });

    state.lessons = nextLessons;
    state.videos = nextVideos;
    state.hydrated = true;
    if (!state.students.length && nextStudents.length) {
      state.students = nextStudents;
    }
    state.error = null;
  } catch (error) {
    if (!state.students.length) {
      state.error = error instanceof Error ? error.message : "Could not load Supabase data.";
    }
  } finally {
    state.hydrated = state.hydrated || state.students.length > 0;
    state.loading = false;
    emitUpdate();
  }
}

export function hydrateSupabaseRepository() {
  void loadAppCoreData();
}

export function getSupabaseRepositoryStatus() {
  return {
    hydrated: state.hydrated,
    loading: state.loading,
    error: state.error,
    rosterMeta: state.rosterMeta,
    instructors: state.instructors,
    schedule: state.schedule,
  };
}

export const supabaseRepository: AppRepository = {
  listCategories() {
    return state.categories;
  },

  listStudents() {
    const rows = mergedStudents();
    return rows;
  },

  getStudent(crmId) {
    return state.students.find((student) => student.crmId === crmId) ?? studentFallback(crmId);
  },

  listLessonsForStudent(crmId, program) {
    const rows = state.lessons
      .filter((lesson) => lesson.studentCrmId === crmId && (!program || lesson.program === program))
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
    if (rows.length) return rows;
    if (state.students.length) return [];
    return mockRepository.listLessonsForStudent(crmId, program);
  },

  getLesson(lessonId) {
    return state.lessons.find((lesson) => lesson.id === lessonId) ?? mockRepository.getLesson(lessonId);
  },

  listProgramsForStudent(crmId) {
    const programs = new Set(
      state.lessons.filter((lesson) => lesson.studentCrmId === crmId).map((lesson) => lesson.program),
    );
    return programs.size ? [...programs] : mockRepository.listProgramsForStudent(crmId);
  },

  listVideosForStudent(crmId, opts) {
    const rows = state.videos
      .filter((video) => video.studentCrmId === crmId)
      .filter((video) => {
        if (!opts?.includeDeleted && video.deletedAt) return false;
        if (!opts?.includeArchived && video.archivedAt) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.length ? rows : mockRepository.listVideosForStudent(crmId, opts);
  },

  getVideo(videoId) {
    return state.videos.find((video) => video.id === videoId) ?? mockRepository.getVideo(videoId);
  },

  addVideo(input: AddVideoInput) {
    const created = mockRepository.addVideo(input);

    if (isSupabaseConfigured()) {
      void (async () => {
        try {
          const supabase = getSupabaseBrowserClient().schema("app_core");
          const { data: asset, error: assetError } = await supabase
            .from("media_assets")
            .insert({
              owner_person_id: input.uploaderRole === "student" ? input.studentCrmId : null,
              title: input.title,
              description: input.description ?? null,
              media_kind: "video",
              source_kind: input.sourceType === "url" ? "external_url" : input.sourceType === "upload" ? "local_upload" : "library",
              external_url: input.playbackUrl,
              thumbnail_url: input.thumbnailUrl,
              duration_seconds: input.durationSec,
              compression_status: input.compressionStatus === "compressed" ? "complete" : "queued",
              visibility: "assigned_students",
              metadata: { category_id: input.categoryId },
            })
            .select("id")
            .single();

          if (assetError || !asset) return;

          await supabase.from("media_links").insert({
            media_asset_id: asset.id,
            lesson_id: input.lessonId,
            assignment_id: input.assignmentId ?? null,
            student_person_id: input.studentCrmId,
            link_context: input.assignmentId ? "assignment" : input.lessonId ? "lesson" : "library",
          });

          await loadAppCoreData();
        } catch {
          // Keep the local optimistic record; sync can be retried from the UI later.
        }
      })();
    }

    return created;
  },

  archiveVideo(videoId) {
    mockRepository.archiveVideo(videoId);
  },
  unarchiveVideo(videoId) {
    mockRepository.unarchiveVideo(videoId);
  },
  deleteVideo(videoId) {
    mockRepository.deleteVideo(videoId);
  },
  getPlaybackSettings(userKey, videoId): VideoPlaybackSettings {
    return mockRepository.getPlaybackSettings(userKey, videoId) ?? DEFAULT_SETTINGS;
  },
  updatePlaybackSettings(userKey, videoId, patch) {
    const normalizedPatch = {
      ...patch,
      playbackRate: patch.playbackRate === undefined ? undefined : normalizePlaybackRate(patch.playbackRate),
      lastPositionSec:
        patch.lastPositionSec === undefined ? undefined : normalizeLastPositionSec(patch.lastPositionSec),
    };
    mockRepository.updatePlaybackSettings(userKey, videoId, normalizedPatch);
  },
  getUserPreferences(userKey): UserPreferences {
    return mockRepository.getUserPreferences(userKey) ?? DEFAULT_USER_PREFERENCES;
  },
  updateUserPreferences(userKey, patch) {
    mockRepository.updateUserPreferences(userKey, patch);
  },
  appendMockStudent(student) {
    mockRepository.appendMockStudent(student);
  },
  listExercisesForStudent(crmId, opts?: ListExercisesOptions): NotationExercise[] {
    return mockRepository.listExercisesForStudent(crmId, opts);
  },
  addExercise(input: AddExerciseInput) {
    return mockRepository.addExercise(input);
  },
  getDailyPracticeSummary(crmId, dayLocal) {
    return mockRepository.getDailyPracticeSummary(crmId, dayLocal);
  },
  recordDailyPracticeMinutes(crmId, minutes, dayLocal) {
    return mockRepository.recordDailyPracticeMinutes(crmId, minutes, dayLocal);
  },
  getPracticeStreakDays(crmId, goalMinutes) {
    return mockRepository.getPracticeStreakDays(crmId, goalMinutes);
  },
  getDailyPracticeMinutesMap(crmId) {
    return mockRepository.getDailyPracticeMinutesMap(crmId);
  },
  listMilestones(crmId) {
    return mockRepository.listMilestones(crmId);
  },
  addMilestone(input: AddMilestoneInput): StudentMilestone {
    return mockRepository.addMilestone(input);
  },
  listActivityEvents(crmId, limit) {
    return mockRepository.listActivityEvents(crmId, limit);
  },
  listActivityEventsForParent(parentCrmId, limit) {
    return mockRepository.listActivityEventsForParent(parentCrmId, limit);
  },
  appendActivityEvent(input: AppendActivityInput): ActivityEvent {
    return mockRepository.appendActivityEvent(input);
  },
  listMediaComments(videoId) {
    return mockRepository.listMediaComments(videoId);
  },
  addMediaComment(input: AddMediaCommentInput): MediaComment {
    return mockRepository.addMediaComment(input);
  },
  listShowcasePosts(): ShowcasePost[] {
    return mockRepository.listShowcasePosts();
  },
  publishShowcasePost(input: PublishShowcaseInput): ShowcasePost {
    return mockRepository.publishShowcasePost(input);
  },
  addShowcaseEmojiReaction(postId, emoji) {
    mockRepository.addShowcaseEmojiReaction(postId, emoji);
  },
  addShowcaseTextComment(postId, authorLabel, body) {
    mockRepository.addShowcaseTextComment(postId, authorLabel, body);
  },
  updateLessonExternalScore(lessonId, embedUrl) {
    mockRepository.updateLessonExternalScore(lessonId, embedUrl);
  },
};
