import type {
  LessonSummary,
  MediaCategory,
  StudentProfile,
  StudentVideo,
} from "@/lib/domain/types";

const SAMPLE_MP4 = "https://www.w3schools.com/html/mov_bbb.mp4";
const SAMPLE_POSTER =
  "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217";

export const MOCK_CATEGORIES: MediaCategory[] = [
  { id: "cat-milestone", slug: "milestone_showcase", label: "Milestone Showcase" },
  { id: "cat-tutorial", slug: "tutorial", label: "Tutorial" },
];

export const MOCK_STUDENTS: StudentProfile[] = [
  {
    crmId: "crm-alex",
    displayName: "Alex Rivera",
    primaryInstructorId: "instr-morgan",
    parentCrmId: "parent-jordan",
    enrolledPrograms: ["lessons", "bands"],
  },
  {
    crmId: "crm-sam",
    displayName: "Sam Okonkwo",
    primaryInstructorId: "instr-morgan",
    parentCrmId: "parent-kim",
    enrolledPrograms: ["lessons"],
  },
];

export const MOCK_LESSONS: LessonSummary[] = [
  {
    id: "les-12",
    studentCrmId: "crm-alex",
    program: "lessons",
    title: "Guitar - Groove and timing",
    scheduledDate: "2026-04-22",
    lessonNumber: 12,
    instrument: "Guitar",
    notes:
      "Warm up with a metronome at 72–88 BPM. Focus on ghost notes on beats 2 and 4, then layer the backbeat snare feel. Record a 30-second loop of the main groove for next week.",
  },
  {
    id: "les-11",
    studentCrmId: "crm-alex",
    program: "lessons",
    title: "Guitar - Barre chord transitions",
    scheduledDate: "2026-04-15",
    lessonNumber: 11,
    instrument: "Guitar",
    notes:
      "Review F → Bm → E shapes at the 7th fret. Keep thumb mid-neck, relax the barre index, and mute the low E when playing D-shape voicings.",
  },
  {
    id: "band-3",
    studentCrmId: "crm-alex",
    program: "bands",
    title: "House Band - Set rehearsal",
    scheduledDate: "2026-04-20",
    lessonNumber: 3,
    instrument: "Guitar",
    notes: "Run the set in order: opener, two covers, original, encore. Watch dynamics on the bridge of the second cover.",
  },
  {
    id: "les-sam-5",
    studentCrmId: "crm-sam",
    program: "lessons",
    title: "Piano - Reading lead sheets",
    scheduledDate: "2026-04-21",
    lessonNumber: 5,
    instrument: "Piano",
    notes:
      "Lead sheet for “Autumn Leaves” (concert C). Practice rootless voicings in the left hand and guide tones in the right; memorize the turnaround bars 9–12.",
  },
];

export const MOCK_VIDEOS: StudentVideo[] = [
  {
    id: "vid-alex-1",
    studentCrmId: "crm-alex",
    lessonId: "les-12",
    categoryId: "cat-milestone",
    title: "Lesson 12 milestone showcase",
    playbackUrl: SAMPLE_MP4,
    thumbnailUrl: SAMPLE_POSTER,
    durationSec: 10,
    uploaderRole: "instructor",
    createdAt: "2026-04-20T10:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
  },
  {
    id: "vid-alex-2",
    studentCrmId: "crm-alex",
    lessonId: "les-11",
    categoryId: "cat-tutorial",
    title: "Slow tutorial: fingerstyle pattern",
    playbackUrl: SAMPLE_MP4,
    thumbnailUrl: SAMPLE_POSTER,
    durationSec: 10,
    uploaderRole: "instructor",
    createdAt: "2026-04-18T16:30:00.000Z",
    archivedAt: null,
    deletedAt: null,
  },
  {
    id: "vid-alex-3",
    studentCrmId: "crm-alex",
    lessonId: null,
    categoryId: "cat-tutorial",
    title: "Admin tutorial: home warmup routine",
    playbackUrl: SAMPLE_MP4,
    thumbnailUrl: SAMPLE_POSTER,
    durationSec: 10,
    uploaderRole: "admin",
    createdAt: "2026-04-10T09:30:00.000Z",
    archivedAt: null,
    deletedAt: null,
  },
  {
    id: "vid-sam-1",
    studentCrmId: "crm-sam",
    lessonId: "les-sam-5",
    categoryId: "cat-milestone",
    title: "Sam lesson 5 checkpoint",
    playbackUrl: SAMPLE_MP4,
    thumbnailUrl: SAMPLE_POSTER,
    durationSec: 10,
    uploaderRole: "instructor",
    createdAt: "2026-04-19T11:15:00.000Z",
    archivedAt: null,
    deletedAt: null,
  },
  {
    id: "vid-archived",
    studentCrmId: "crm-alex",
    lessonId: "les-11",
    categoryId: "cat-tutorial",
    title: "Archived demo clip",
    playbackUrl: SAMPLE_MP4,
    thumbnailUrl: SAMPLE_POSTER,
    durationSec: 10,
    uploaderRole: "instructor",
    createdAt: "2026-03-01T11:00:00.000Z",
    archivedAt: "2026-03-15T12:00:00.000Z",
    deletedAt: null,
  },
];
