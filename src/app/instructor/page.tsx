"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuickRecorder } from "@/hooks/useQuickRecorder";
import { ExerciseCard } from "@/components/music/ExerciseCard";
import { ExerciseStaffComposer } from "@/components/music/ExerciseStaffComposer";
import { CadenzaMessageBoard } from "@/components/messaging/CadenzaMessageBoard";
import { AddVideoModal, type VideoAssignmentOption } from "@/components/video/AddVideoModal";
import type { StudentVideo } from "@/lib/domain/types";
import {
  addListeningTrack,
  LISTENING_STATE_UPDATED_EVENT,
  loadListeningState,
  type ListeningState,
} from "@/lib/listening/mock-listening-store";
import {
  listPendingPracticeSubmissions,
  reviewPracticeSubmission,
  type PracticeSubmission,
} from "@/lib/practice-loop";
import { INSTRUMENT_OPTIONS } from "@/lib/music/notation";
import { parseYouTubeVideoId, youTubeEmbedUrl, youTubeThumbUrl } from "@/lib/youtube";
import { useRepository } from "@/lib/useRepository";
import { useRotatingHeroHeadline } from "@/hooks/useRotatingHeroHeadline";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";
import { GamifiedRewardTrack } from "@/components/gamification/GamifiedRewardTrack";
import { getPracticeTotalSeconds, PRACTICE_TOTAL_UPDATED_EVENT } from "@/lib/practice-total";
import { MOCK_USER_KEYS } from "@/lib/data/repository";

const FALLBACK_VIDEO = "https://www.w3schools.com/html/mov_bbb.mp4";
const FALLBACK_POSTER =
  "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217";

type InstructorPageId = "dashboard" | "uploads" | "exercises" | "listening" | "videos";

const instructorNav: Array<{ id: InstructorPageId; label: string; icon: keyof typeof icons }> = [
  { id: "dashboard", label: "Studio", icon: "grid" },
  { id: "uploads", label: "Upload", icon: "video" },
  { id: "exercises", label: "Exercises", icon: "music" },
  { id: "listening", label: "Listen", icon: "headphones" },
  { id: "videos", label: "Library", icon: "clip" },
];

const appViewOptions = [
  { href: "/instructor", label: "Instructor" },
  { href: "/student", label: "Student" },
  { href: "/parent", label: "Parent" },
  { href: "/admin", label: "Admin" },
  { href: "/producer", label: "Producer" },
];

const icons = {
  grid: <path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" />,
  clip: (
    <>
      <rect x="3" y="2" width="10" height="13" rx="1.5" />
      <path d="M6 2a2 2 0 0 1 4 0M6 7h4M6 10h3" />
    </>
  ),
  music: (
    <>
      <path d="M6 13V3l9-2v10" />
      <circle cx="4" cy="13" r="2" />
      <circle cx="13" cy="11" r="2" />
    </>
  ),
  headphones: (
    <>
      <path d="M3 9V7a5 5 0 0 1 10 0v2" />
      <rect x="1.5" y="8" width="3" height="5" rx="1" />
      <rect x="11.5" y="8" width="3" height="5" rx="1" />
    </>
  ),
  video: (
    <>
      <rect x="1" y="3" width="10" height="10" rx="1.5" />
      <path d="m11 6 4-2v8l-4-2" />
    </>
  ),
};

function StudioIcon({ icon, className = "" }: { icon: keyof typeof icons; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      {icons[icon]}
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "purple" | "gold" | "green" | "red" | "cyan" }) {
  const colors = {
    purple: "var(--accent2)",
    gold: "var(--gold)",
    green: "var(--green)",
    red: "var(--red)",
    cyan: "var(--cyan)",
  };
  return (
    <div className="metric">
      <div className="metric-lbl">{label}</div>
      <div className="metric-val" style={{ color: colors[tone] }}>{value}</div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}

function InstructorVideoCard({
  video,
  onArchive,
  onRestore,
}: {
  video: StudentVideo;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <article className={`instructor-video ${video.archivedAt ? "archived" : ""}`}>
      <Link href={`/student/videos/${video.id}`} className="c-video-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.thumbnailUrl} alt="" className="c-video-img" />
        <div className="c-video-shade" />
        <div className="c-video-play" aria-hidden>
          <svg viewBox="0 0 16 16" fill="currentColor">
            <polygon points="4,2 14,8 4,14" />
          </svg>
        </div>
        <div className="watermark">CADENZA</div>
        <div className="c-video-copy">
          <span className={`badge ${video.archivedAt ? "b-cyan" : "b-purple"}`}>
            {video.archivedAt ? "Archived" : video.uploaderRole}
          </span>
          <strong>{video.title}</strong>
          <span>{formatShortDate(video.createdAt)}</span>
        </div>
      </Link>
      <button className="btn btn-sm" type="button" onClick={video.archivedAt ? onRestore : onArchive}>
        {video.archivedAt ? "Restore" : "Archive"}
      </button>
    </article>
  );
}

export default function InstructorPage() {
  const pathname = usePathname();
  const { repository, refresh } = useRepository();
  const { theme, toggleTheme } = useCadenzaTheme();
  const [page, setPage] = useState<InstructorPageId>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studentCrmId, setStudentCrmId] = useState("crm-alex");
  const [videoTitle, setVideoTitle] = useState("");
  const [categoryId, setCategoryId] = useState("cat-milestone");
  const [showArchived, setShowArchived] = useState(false);
  const [listeningVersion, setListeningVersion] = useState(0);
  const [listeningTitle, setListeningTitle] = useState("");
  const [listeningUrl, setListeningUrl] = useState("");
  const [listeningLessonId, setListeningLessonId] = useState("latest");
  const [listeningSongTitle, setListeningSongTitle] = useState("");
  const [listeningState, setListeningState] = useState<ListeningState>({ tracks: [], news: [] });
  const [storedPracticeSeconds, setStoredPracticeSeconds] = useState(0);
  const [practiceReviewVersion, setPracticeReviewVersion] = useState(0);
  const [pendingPracticeReviews, setPendingPracticeReviews] = useState<PracticeSubmission[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoModalContext, setVideoModalContext] = useState<{
    lessonId?: string | null;
    assignmentId?: string | null;
    assignmentTitle?: string | null;
  } | null>(null);
  const [exerciseTitle, setExerciseTitle] = useState("Scale warmup");
  const [exerciseLessonId, setExerciseLessonId] = useState<string>("none");
  const [exerciseInstrument, setExerciseInstrument] = useState(INSTRUMENT_OPTIONS[0].value);
  const [exerciseTempo, setExerciseTempo] = useState(90);
  const [exerciseNotes, setExerciseNotes] = useState([
    { id: "m1-b1", pitch: "C4", beats: 1 },
    { id: "m1-b2", pitch: "D4", beats: 1 },
    { id: "m1-b3", pitch: "E4", beats: 1 },
    { id: "m1-b4", pitch: "rest", beats: 1 },
  ]);
  const [exerciseMessage, setExerciseMessage] = useState<string | null>(null);
  const [uploadDropActive, setUploadDropActive] = useState(false);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [sheetEmbedLessonId, setSheetEmbedLessonId] = useState("none");
  const [sheetEmbedInput, setSheetEmbedInput] = useState("");
  const [recTitle, setRecTitle] = useState("Quick tip recording");
  const quickRec = useQuickRecorder();

  const roster = repository
    .listStudents()
    .filter((student) => student.primaryInstructorId === "instr-morgan");
  const instructorHeroName = "Sarah Mitchell";
  const instructorHeadline = useRotatingHeroHeadline("instructor", instructorHeroName);
  const selectedStudent = repository.getStudent(studentCrmId) ?? roster[0];
  const videos = repository.listVideosForStudent(studentCrmId, { includeArchived: showArchived });
  const activeVideos = repository.listVideosForStudent(studentCrmId);
  const lessons = repository.listLessonsForStudent(studentCrmId);
  const exercises = repository.listExercisesForStudent(studentCrmId);
  const categories = repository.listCategories();
  const videoAssignmentOptions: VideoAssignmentOption[] = lessons.flatMap((lesson) => [
    {
      id: `practice-${lesson.id}`,
      lessonId: lesson.id,
      title: `Practice ${lesson.title} focus points`,
    },
    {
      id: `record-${lesson.id}`,
      lessonId: lesson.id,
      title: `Record a clean take for ${lesson.title}`,
    },
  ]);
  useEffect(() => {
    setListeningState(loadListeningState());
  }, [listeningVersion]);
  useEffect(() => {
    const syncPracticeTotal = () => setStoredPracticeSeconds(getPracticeTotalSeconds(MOCK_USER_KEYS.student));
    syncPracticeTotal();
    window.addEventListener(PRACTICE_TOTAL_UPDATED_EVENT, syncPracticeTotal);
    window.addEventListener("storage", syncPracticeTotal);
    return () => {
      window.removeEventListener(PRACTICE_TOTAL_UPDATED_EVENT, syncPracticeTotal);
      window.removeEventListener("storage", syncPracticeTotal);
    };
  }, []);
  useEffect(() => {
    const syncListening = () => {
      setListeningState(loadListeningState());
      setListeningVersion((value) => value + 1);
    };
    window.addEventListener(LISTENING_STATE_UPDATED_EVENT, syncListening);
    window.addEventListener("storage", syncListening);
    return () => {
      window.removeEventListener(LISTENING_STATE_UPDATED_EVENT, syncListening);
      window.removeEventListener("storage", syncListening);
    };
  }, []);

  const listeningTracks = listeningState.tracks.filter((track) => track.studentCrmId === studentCrmId);
  const rosterCrmIds = new Set(roster.map((student) => student.crmId));
  const rosterLessonCount = roster.reduce((sum, student) => sum + repository.listLessonsForStudent(student.crmId).length, 0);
  const rosterVideoCount = roster.reduce((sum, student) => sum + repository.listVideosForStudent(student.crmId).length, 0);
  const rosterExerciseCount = roster.reduce((sum, student) => sum + repository.listExercisesForStudent(student.crmId).length, 0);
  const rosterListeningTracks = listeningState.tracks.filter((track) => rosterCrmIds.has(track.studentCrmId));
  const rosterListeningMinutes = Math.round(rosterListeningTracks.reduce((sum, track) => sum + track.listenedSeconds, 0) / 60);
  const rosterPracticeMinutes = roster.reduce((sum, student) => {
    const storedStudentMinutes = student.crmId === "crm-alex" ? Math.round(storedPracticeSeconds / 60) : 0;
    const repositoryMinutes = Math.round(
      Object.values(repository.getDailyPracticeMinutesMap(student.crmId)).reduce((total, minutes) => total + minutes, 0),
    );
    return sum + Math.max(storedStudentMinutes, repositoryMinutes);
  }, 0);
  const rosterPendingReviewCount = roster.reduce(
    (sum, student) => sum + listPendingPracticeSubmissions(student.crmId).length,
    0,
  );
  const coachScore =
    roster.length * 100 +
    rosterPracticeMinutes * 2 +
    rosterListeningMinutes +
    rosterLessonCount * 12 +
    rosterVideoCount * 25 +
    rosterExerciseCount * 18 +
    rosterPendingReviewCount * 35;
  const studioMomentumProgress = Math.min(
    100,
    Math.round(
      Math.min(rosterPracticeMinutes / Math.max(roster.length * 120, 1), 1) * 42 +
      Math.min(rosterListeningMinutes / Math.max(roster.length * 45, 1), 1) * 24 +
      Math.min(rosterLessonCount / Math.max(roster.length * 4, 1), 1) * 18 +
      Math.min((rosterVideoCount + rosterExerciseCount) / Math.max(roster.length * 4, 1), 1) * 16,
    ),
  );
  const selectedPracticeMinutes = Math.round(storedPracticeSeconds / 60);
  const selectedListeningMinutes = Math.round(listeningTracks.reduce((sum, track) => sum + track.listenedSeconds, 0) / 60);
  useEffect(() => {
    setPendingPracticeReviews(listPendingPracticeSubmissions(studentCrmId));
  }, [studentCrmId, practiceReviewVersion]);

  useEffect(() => {
    const refreshReviews = () => setPracticeReviewVersion((value) => value + 1);
    window.addEventListener("practice-loop-updated", refreshReviews);
    return () => window.removeEventListener("practice-loop-updated", refreshReviews);
  }, []);

  const pageTitle: Record<InstructorPageId, string> = {
    dashboard: "Instructor Studio",
    uploads: "Upload Desk",
    exercises: "Notation Exercises",
    listening: "Listening Playlists",
    videos: "Student Library",
  };

  const addMockUpload = () => {
    if (!videoTitle.trim()) return;
    repository.addVideo({
      studentCrmId,
      lessonId: null,
      categoryId,
      title: videoTitle.trim(),
      playbackUrl: FALLBACK_VIDEO,
      thumbnailUrl: FALLBACK_POSTER,
      durationSec: 10,
      uploaderRole: "instructor",
    });
    setVideoTitle("");
    refresh();
  };

  const saveExercise = () => {
    setExerciseMessage(null);
    if (!exerciseTitle.trim()) {
      setExerciseMessage("Add a title for the exercise.");
      return;
    }
    if (exerciseNotes.length === 0) {
      setExerciseMessage("Add at least one note or rest.");
      return;
    }
    repository.addExercise({
      studentCrmId,
      lessonId: exerciseLessonId === "none" ? null : exerciseLessonId,
      title: exerciseTitle.trim(),
      instrument: exerciseInstrument,
      tempoBpm: Math.max(40, Math.min(220, exerciseTempo || 90)),
      notes: exerciseNotes,
      createdByInstructorId: "instr-morgan",
    });
    setExerciseMessage("Exercise created.");
    refresh();
  };

  const addInstructorListeningTrack = () => {
    if (!listeningTitle.trim() || !listeningUrl.trim()) return;
    const attachedLesson =
      lessons.find((lesson) => lesson.id === (listeningLessonId === "latest" ? lessons[0]?.id : listeningLessonId)) ??
      null;
    addListeningTrack({
      studentCrmId,
      title: listeningTitle.trim(),
      url: listeningUrl.trim(),
      lessonId: attachedLesson?.id ?? null,
      lessonTitle: attachedLesson?.title ?? null,
      songTitle: listeningSongTitle.trim() || null,
      addedBy: "instructor",
    });
    setListeningTitle("");
    setListeningUrl("");
    setListeningSongTitle("");
    setListeningState(loadListeningState());
    setListeningVersion((value) => value + 1);
  };

  return (
    <div className="cadenza-app instructor-app" data-theme={theme}>
      <div className={`sidebar-overlay ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />

      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-name">CADENZA</div>
          <div className="logo-tag">MUSIC STUDIO</div>
        </div>
        <div className="role-toggle">
          <select
            aria-label="Switch app view"
            className="rt-select"
            value={appViewOptions.some((option) => option.href === pathname) ? pathname : "/instructor"}
            onChange={(event) => {
              const nextPath = event.target.value;
              if (nextPath) window.location.href = nextPath;
            }}
          >
            {appViewOptions.map((option) => (
              <option key={option.href} value={option.href}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <nav className="nav">
          <div className="nav-lbl">Menu</div>
          {instructorNav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              type="button"
              onClick={() => {
                setPage(item.id);
                setDrawerOpen(false);
              }}
            >
              <StudioIcon icon={item.icon} className="nav-ico" />
              <span>{item.label}</span>
              {item.id === "videos" && activeVideos.length ? <span className="nav-badge">{activeVideos.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <button className="theme-toggle menu-theme-toggle" onClick={toggleTheme} type="button">
            <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
            <span className="toggle-track"><span className="toggle-knob" /></span>
            <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
          <div className="su-inner">
            <div className="su-avatar">SM</div>
            <div className="min-w-0">
              <div className="su-name">Sarah Mitchell</div>
              <div className="su-role">Piano Instructor</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="c-main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setDrawerOpen(true)} aria-label="Menu" type="button">
            <span />
            <span />
            <span />
          </button>
          <div className="page-title">{pageTitle[page]}</div>
          <div className="topbar-right">
            <div className="xp-pill">Studio roster · {roster.length}</div>
            <button className="theme-toggle" onClick={toggleTheme} type="button">
              <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
              <span className="toggle-track"><span className="toggle-knob" /></span>
              <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setVideoModalOpen(true)}>
              New Upload
            </button>
          </div>
        </div>
        <div className="content">
          {page === "dashboard" ? (
            <>
              <section className="studio-hero instructor-hero">
                <div>
                  <p className="card-title">Instructor command center</p>
                  <h1>{instructorHeadline}</h1>
                </div>
                <label className="profile-select">
                  Student
                  <select value={studentCrmId} onChange={(event) => setStudentCrmId(event.target.value)}>
                    {roster.map((student) => (
                      <option key={student.crmId} value={student.crmId}>
                        {student.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <CadenzaMessageBoard viewerRole="instructor" />

              <GamifiedRewardTrack
                eyebrow="Studio momentum"
                title="Studio-wide weekly mission"
                subtitle="Coach score now reflects your whole roster: students, practice, listening, lessons, media, and exercises."
                pointsLabel="Coach score"
                pointsValue={coachScore.toLocaleString()}
                progress={studioMomentumProgress}
                steps={[
                  { label: "Students", value: `${roster.length}`, tone: "purple", unlocked: roster.length > 0 },
                  { label: "Practice", value: `${rosterPracticeMinutes}m`, tone: "gold", unlocked: rosterPracticeMinutes > 0 },
                  { label: "Listen", value: `${rosterListeningMinutes}m`, tone: "cyan", unlocked: rosterListeningMinutes > 0 },
                  { label: "Output", value: `${rosterVideoCount + rosterExerciseCount}`, tone: "green", unlocked: rosterVideoCount + rosterExerciseCount > 0 },
                ]}
              />

              <section className="grid4">
                <Metric label="Students" value={`${roster.length}`} sub="Active" tone="purple" />
                <Metric label="Lessons" value={`${rosterLessonCount}`} sub="Across roster" tone="gold" />
                <Metric label="Videos" value={`${rosterVideoCount}`} sub="Current libraries" tone="cyan" />
                <Metric label="Exercises" value={`${rosterExerciseCount}`} sub="Notation" tone="green" />
              </section>
            </>
          ) : (
            <section className="card instructor-context">
              <div>
                <div className="card-title">Selected student</div>
                <strong>{selectedStudent?.displayName ?? "Student"}</strong>
                <span>{lessons.length} lessons · {activeVideos.length} videos · {exercises.length} exercises · {listeningTracks.length} tracks</span>
              </div>
              <label className="profile-select compact">
                Student
                <select value={studentCrmId} onChange={(event) => setStudentCrmId(event.target.value)}>
                  {roster.map((student) => (
                    <option key={student.crmId} value={student.crmId}>
                      {student.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {page === "dashboard" ? (
            <InstructorDashboard
              roster={roster}
              selectedStudentName={selectedStudent?.displayName ?? "Student"}
              lessons={lessons}
              pendingPracticeReviews={pendingPracticeReviews}
              videos={activeVideos}
              exercisesCount={exercises.length}
              listeningCount={listeningTracks.length}
              listeningMinutes={selectedListeningMinutes}
              practiceMinutes={selectedPracticeMinutes}
              reviewNotes={reviewNotes}
              setReviewNotes={setReviewNotes}
              onReviewPractice={(id, status) => {
                reviewPracticeSubmission(id, status, reviewNotes[id] ?? "");
                setReviewNotes((current) => ({ ...current, [id]: "" }));
                setPracticeReviewVersion((value) => value + 1);
              }}
              onAddVideoToLesson={(lesson) => {
                setVideoModalContext({ lessonId: lesson.id });
                setVideoModalOpen(true);
              }}
              setPage={setPage}
              setStudentCrmId={setStudentCrmId}
            />
          ) : null}

          {page === "uploads" ? (
            <>
              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Drop zone + mock upload</div>
                    <div className="section-sub">
                      Drag files or a YouTube link, capture a quick screen tip, or use the form — all write to the local mock repository.
                    </div>
                  </div>
                </div>
                <div className="instructor-form-grid">
                  <label className="form-grp">
                    <span className="form-lbl">Student</span>
                    <select className="inp" value={studentCrmId} onChange={(event) => setStudentCrmId(event.target.value)}>
                      {roster.map((student) => (
                        <option key={student.crmId} value={student.crmId}>{student.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-grp">
                    <span className="form-lbl">Category</span>
                    <select className="inp" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-grp wide">
                    <span className="form-lbl">Video title</span>
                    <input className="inp" value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} placeholder="e.g. Lesson 12 tutorial take" />
                  </label>
                </div>
                <div
                  className={`instructor-dropzone ${uploadDropActive ? "drag" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setUploadDropActive(true);
                  }}
                  onDragLeave={() => setUploadDropActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setUploadDropActive(false);
                    const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
                    const yt = parseYouTubeVideoId(uri);
                    if (yt) {
                      repository.addVideo({
                        studentCrmId,
                        lessonId: null,
                        categoryId,
                        title: `YouTube clip`,
                        playbackUrl: youTubeEmbedUrl(yt),
                        thumbnailUrl: youTubeThumbUrl(yt),
                        durationSec: 180,
                        uploaderRole: "instructor",
                      });
                      refresh();
                      setUploadHint("Added YouTube embed as a student video.");
                      return;
                    }
                    const file = event.dataTransfer.files?.[0];
                    if (file) {
                      const objectUrl = URL.createObjectURL(file);
                      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                      repository.addVideo({
                        studentCrmId,
                        lessonId: null,
                        categoryId,
                        title: isPdf ? `PDF: ${file.name}` : `Drop: ${file.name}`,
                        playbackUrl: isPdf ? FALLBACK_VIDEO : objectUrl,
                        thumbnailUrl: FALLBACK_POSTER,
                        durationSec: isPdf ? 12 : 45,
                        uploaderRole: "instructor",
                      });
                      refresh();
                      setUploadHint(
                        isPdf
                          ? "PDF cataloged with a placeholder preview in mock mode."
                          : "File stored as a blob URL (same-browser only until cloud storage is wired).",
                      );
                    }
                  }}
                >
                  <strong>Drop files or a YouTube URL here</strong>
                  <span className="section-sub">Try dragging from your browser tab, or an audio / video / PDF file.</span>
                </div>
                {uploadHint ? <p className="section-sub mt-12">{uploadHint}</p> : null}
                <div className="modal-acts">
                  <button className="btn btn-primary" type="button" onClick={addMockUpload}>Add Mock Upload</button>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Quick screen capture</div>
                    <div className="section-sub">Uses browser MediaRecorder + getDisplayMedia. WebM blob URL is dev-only storage.</div>
                  </div>
                </div>
                {quickRec.error ? <p className="section-sub">{quickRec.error}</p> : null}
                <div className="modal-acts">
                  {quickRec.status === "idle" ? (
                    <button className="btn btn-primary" type="button" onClick={() => void quickRec.start()}>
                      Start capture
                    </button>
                  ) : null}
                  {quickRec.status === "recording" ? (
                    <button className="btn btn-primary" type="button" onClick={() => quickRec.stop()}>
                      Stop recording
                    </button>
                  ) : null}
                </div>
                {quickRec.previewUrl ? (
                  <div className="mt-12 space-y-3">
                    <video className="w-full max-w-xl rounded-xl border border-slate-200/80 dark:border-white/10" controls src={quickRec.previewUrl} />
                    <label className="form-grp wide">
                      <span className="form-lbl">Title for library</span>
                      <input className="inp" value={recTitle} onChange={(event) => setRecTitle(event.target.value)} />
                    </label>
                    <div className="modal-acts">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => {
                          if (!quickRec.previewUrl || !recTitle.trim()) return;
                          repository.addVideo({
                            studentCrmId,
                            lessonId: null,
                            categoryId,
                            title: recTitle.trim(),
                            playbackUrl: quickRec.previewUrl,
                            thumbnailUrl: FALLBACK_POSTER,
                            durationSec: 60,
                            uploaderRole: "instructor",
                          });
                          quickRec.reset();
                          setRecTitle("Quick tip recording");
                          refresh();
                        }}
                      >
                        Save to student library
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => quickRec.reset()}>
                        Discard
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Lesson sheet embed (Flat / Soundslice)</div>
                    <div className="section-sub">Stores `externalScoreEmbedUrl` on the lesson for the student Sheet tab.</div>
                  </div>
                </div>
                <div className="instructor-form-grid">
                  <label className="form-grp wide">
                    <span className="form-lbl">Lesson</span>
                    <select className="inp" value={sheetEmbedLessonId} onChange={(event) => setSheetEmbedLessonId(event.target.value)}>
                      <option value="none">Select lesson…</option>
                      {lessons.map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          Lesson {lesson.lessonNumber}: {lesson.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-grp wide">
                    <span className="form-lbl">Embed URL</span>
                    <input
                      className="inp"
                      value={sheetEmbedInput}
                      onChange={(event) => setSheetEmbedInput(event.target.value)}
                      placeholder="https://flat.io/embed?..."
                    />
                  </label>
                </div>
                <div className="modal-acts">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      if (sheetEmbedLessonId === "none" || !sheetEmbedInput.trim()) return;
                      repository.updateLessonExternalScore(sheetEmbedLessonId, sheetEmbedInput.trim());
                      setSheetEmbedInput("");
                      refresh();
                    }}
                  >
                    Save embed on lesson
                  </button>
                </div>
              </section>
            </>
          ) : null}

          {page === "exercises" ? (
            <section className="card exercise-composer-card">
              <div className="card-header">
                <div>
                  <div className="card-title">Notation exercises</div>
                  <div className="section-sub">Compose notes/rests directly on measures for {selectedStudent?.displayName ?? "this student"}.</div>
                </div>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveExercise}>Save exercise</button>
              </div>
              <div className="instructor-form-grid">
                <label className="form-grp">
                  <span className="form-lbl">Exercise title</span>
                  <input className="inp" value={exerciseTitle} onChange={(event) => setExerciseTitle(event.target.value)} />
                </label>
                <label className="form-grp">
                  <span className="form-lbl">Lesson</span>
                  <select className="inp" value={exerciseLessonId} onChange={(event) => setExerciseLessonId(event.target.value)}>
                    <option value="none">General exercise</option>
                    {lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>Lesson {lesson.lessonNumber}: {lesson.title}</option>
                    ))}
                  </select>
                </label>
                <label className="form-grp">
                  <span className="form-lbl">Instrument</span>
                  <select
                    className="inp"
                    value={exerciseInstrument}
                    onChange={(event) => setExerciseInstrument(event.target.value as (typeof INSTRUMENT_OPTIONS)[number]["value"])}
                  >
                    {INSTRUMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="form-grp">
                  <span className="form-lbl">Tempo</span>
                  <input className="inp" type="number" min={40} max={220} value={exerciseTempo} onChange={(event) => setExerciseTempo(Number.parseInt(event.target.value || "90", 10))} />
                </label>
              </div>
              <div className="staff-shell">
                <ExerciseStaffComposer onChange={setExerciseNotes} />
              </div>
              <div className="composer-footer">
                <button className="btn btn-primary" type="button" onClick={saveExercise}>Save exercise</button>
                {exerciseMessage ? <span className="section-sub">{exerciseMessage}</span> : null}
              </div>
              <div className="exercise-grid">
                {exercises.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
                {exercises.length === 0 ? <p className="empty-copy">No exercises yet for this student.</p> : null}
              </div>
            </section>
          ) : null}

          {page === "listening" ? (
            <section className="card listening-add-card">
              <div className="card-header">
                <div>
                  <div className="card-title">Assign listening</div>
                  <div className="section-sub">Add YouTube links to the selected student playlist. Students see a new update badge.</div>
                </div>
              </div>
              <div className="instructor-form-grid">
                <label className="form-grp">
                  <span className="form-lbl">Track title</span>
                  <input className="inp" value={listeningTitle} onChange={(event) => setListeningTitle(event.target.value)} placeholder="e.g. Tone reference" />
                </label>
                <label className="form-grp">
                  <span className="form-lbl">YouTube URL</span>
                  <input className="inp" value={listeningUrl} onChange={(event) => setListeningUrl(event.target.value)} placeholder="https://youtube.com/..." />
                </label>
                <label className="form-grp">
                  <span className="form-lbl">Attach to lesson</span>
                  <select className="inp" value={listeningLessonId} onChange={(event) => setListeningLessonId(event.target.value)}>
                    <option value="latest">Latest lesson</option>
                    <option value="none">No lesson attachment</option>
                    {lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>Lesson {lesson.lessonNumber}: {lesson.title}</option>
                    ))}
                  </select>
                </label>
                <label className="form-grp">
                  <span className="form-lbl">Song / focus</span>
                  <input className="inp" value={listeningSongTitle} onChange={(event) => setListeningSongTitle(event.target.value)} placeholder="e.g. Main groove study" />
                </label>
              </div>
              <div className="modal-acts">
                <button className="btn btn-primary" type="button" onClick={addInstructorListeningTrack}>Add to student playlist</button>
              </div>
              <div className="card-title mt-12">Current playlist</div>
              {listeningTracks.map((track) => (
                <div className={`listen-row ${listeningTracks[0]?.id === track.id ? "recent" : ""}`} key={track.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="listen-thumb" src={track.thumbnailUrl} alt="" />
                  <div>
                    <strong>{track.title}</strong>
                    <span>{track.addedBy} · {Math.round(track.listenedSeconds / 60)} min listened</span>
                    {track.lessonTitle || track.songTitle ? (
                      <span>{track.lessonTitle ?? "No lesson"}{track.songTitle ? ` · ${track.songTitle}` : ""}</span>
                    ) : null}
                    <a href={track.url} target="_blank" rel="noreferrer">{track.url}</a>
                  </div>
                  <span className={`badge ${listeningTracks[0]?.id === track.id ? "b-gold" : "b-cyan"}`}>
                    {listeningTracks[0]?.id === track.id ? "Recent" : track.addedBy}
                  </span>
                </div>
              ))}
            </section>
          ) : null}

          {page === "videos" ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Student video queue</div>
                  <div className="section-sub">{selectedStudent?.displayName ?? "Student"} · {videos.length} visible clips</div>
                </div>
                <label className="switch-row">
                  <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                  Show archived
                </label>
              </div>
              <div className="video-grid">
                {videos.map((video) => (
                  <InstructorVideoCard
                    key={video.id}
                    video={video}
                    onArchive={() => {
                      repository.archiveVideo(video.id);
                      refresh();
                    }}
                    onRestore={() => {
                      repository.unarchiveVideo(video.id);
                      refresh();
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <nav className="mobile-nav">
        {instructorNav.map((item) => (
          <button
            key={item.id}
            className={`mob-nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
            type="button"
          >
            <StudioIcon icon={item.icon} />
            <span className="mob-nav-lbl">{item.label}</span>
            {item.id === "videos" && activeVideos.length ? <span className="mob-nav-dot" /> : null}
          </button>
        ))}
      </nav>

      <button className="fab" type="button" aria-label="Add video" onClick={() => setVideoModalOpen(true)}>♪</button>
      {videoModalOpen ? (
        <AddVideoModal
          assignments={videoAssignmentOptions}
          categories={categories}
          initialAssignmentId={videoModalContext?.assignmentId}
          initialAssignmentTitle={videoModalContext?.assignmentTitle}
          initialLessonId={videoModalContext?.lessonId ?? lessons[0]?.id}
          lessons={lessons}
          onClose={() => {
            setVideoModalOpen(false);
            setVideoModalContext(null);
          }}
          onSave={(input) => {
            repository.addVideo(input);
            refresh();
            setVideoModalOpen(false);
            setVideoModalContext(null);
          }}
          savedVideos={activeVideos.filter((video) => video.uploaderRole === "instructor" || video.uploaderRole === "admin")}
          studentCrmId={studentCrmId}
          uploaderRole="instructor"
        />
      ) : null}
    </div>
  );
}

function InstructorDashboard({
  roster,
  selectedStudentName,
  lessons,
  pendingPracticeReviews,
  videos,
  exercisesCount,
  listeningCount,
  listeningMinutes,
  practiceMinutes,
  reviewNotes,
  setReviewNotes,
  onReviewPractice,
  onAddVideoToLesson,
  setPage,
  setStudentCrmId,
}: {
  roster: Array<{ crmId: string; displayName: string; enrolledPrograms: string[] }>;
  selectedStudentName: string;
  lessons: Array<{ id: string; title: string; lessonNumber: number; instrument: string; scheduledDate: string; notes?: string }>;
  pendingPracticeReviews: PracticeSubmission[];
  videos: StudentVideo[];
  exercisesCount: number;
  listeningCount: number;
  listeningMinutes: number;
  practiceMinutes: number;
  reviewNotes: Record<string, string>;
  setReviewNotes: (notes: Record<string, string>) => void;
  onReviewPractice: (id: string, status: "reviewed" | "redo") => void;
  onAddVideoToLesson: (lesson: { id: string; title: string }) => void;
  setPage: (page: InstructorPageId) => void;
  setStudentCrmId: (id: string) => void;
}) {
  const rosterLeaders = roster.slice(0, 4).map((student, index) => ({
    ...student,
    minutes: student.crmId === "crm-alex" ? practiceMinutes : [132, 86, 54, 38][index] ?? 24,
  })).sort((a, b) => b.minutes - a.minutes);

  return (
    <>
      <section className="instructor-league-card">
        <div className="practice-league-glow" aria-hidden />
        <div className="practice-league-head">
          <div>
            <p className="card-title">Roster league</p>
            <h2>Weekly practice momentum</h2>
            <p>Local testing totals update as students log practice and listening activity in this browser.</p>
          </div>
          <div className="practice-rank-medal">
            <span>Focus</span>
            <strong>{practiceMinutes + listeningMinutes}</strong>
            <small>min</small>
          </div>
        </div>
        <div className="practice-league-board">
          {rosterLeaders.map((student, index) => {
            const maxMinutes = Math.max(...rosterLeaders.map((leader) => leader.minutes), 1);
            const progress = Math.max(8, Math.round((student.minutes / maxMinutes) * 100));
            const selected = student.displayName === selectedStudentName;
            return (
              <button
                className={`practice-league-row ${selected ? "current" : ""}`}
                key={student.crmId}
                onClick={() => setStudentCrmId(student.crmId)}
                type="button"
              >
                <span className={`league-place place-${index + 1}`}>{index + 1}</span>
                <span className="league-avatar">{initials(student.displayName)}</span>
                <span className="league-name">
                  <strong>{student.displayName}{selected ? " (selected)" : ""}</strong>
                  <span className="league-progress"><span style={{ width: `${progress}%` }} /></span>
                </span>
                <span className="league-minutes">{student.minutes}m</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Roster</div>
              <div className="section-sub">Select a student to manage uploads and exercises.</div>
            </div>
          </div>
          {roster.map((student, index) => (
            <button className="student-row" key={student.crmId} type="button" onClick={() => setStudentCrmId(student.crmId)}>
              <span className={`lb-avatar av${(index % 4) + 1}`}>{initials(student.displayName)}</span>
              <span>
                <strong>{student.displayName}</strong>
                <small>{student.enrolledPrograms.join(", ")}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="card latest-notes-card">
          <div className="card-header">
            <div>
              <div className="card-title">Latest lesson notes</div>
              <div className="section-sub">{selectedStudentName}</div>
            </div>
            <div className="modal-acts">
              <button className="btn btn-sm" type="button" onClick={() => setPage("exercises")}>Add exercise</button>
              {lessons[0] ? (
                <button className="btn btn-primary btn-sm" type="button" onClick={() => onAddVideoToLesson(lessons[0])}>
                  Add video
                </button>
              ) : null}
            </div>
          </div>
          <h2>{lessons[0]?.title ?? "No lesson yet"}</h2>
          <p>{lessons[0]?.notes ?? "When a lesson is added, its notes will appear here for instructor review."}</p>
        </div>
      </section>

      <section className="card review-queue-card">
        <div className="card-header">
          <div>
            <div className="card-title">Instructor review queue</div>
            <div className="section-sub">
              {pendingPracticeReviews.length
                ? `${pendingPracticeReviews.length} student submission${pendingPracticeReviews.length === 1 ? "" : "s"} waiting`
                : "Practice submissions will appear here after students send evidence."}
            </div>
          </div>
          <span className="badge b-gold">Review loop</span>
        </div>
        {pendingPracticeReviews.slice(0, 4).map((submission) => (
          <article className="review-row" key={submission.id}>
            <div>
              <span className={`badge ${submission.status === "redo" ? "b-red" : "b-purple"}`}>
                {submission.status === "redo" ? "Redo" : "Needs review"}
              </span>
              <strong>{submission.body}</strong>
              <small>Lesson {submission.lessonId} · {new Date(submission.createdAt).toLocaleString()}</small>
            </div>
            <textarea
              className="inp ta"
              value={reviewNotes[submission.id] ?? ""}
              onChange={(event) => setReviewNotes({ ...reviewNotes, [submission.id]: event.target.value })}
              placeholder="Leave a quick instructor note..."
            />
            <div className="review-actions">
              <button className="btn btn-primary btn-sm" type="button" onClick={() => onReviewPractice(submission.id, "reviewed")}>
                Mark reviewed
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => onReviewPractice(submission.id, "redo")}>
                Request redo
              </button>
            </div>
          </article>
        ))}
        {!pendingPracticeReviews.length ? <p className="empty-copy">No practice evidence waiting right now.</p> : null}
      </section>

      <section className="grid2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent lessons</div>
          </div>
          <div className="lesson-list">
            {lessons.slice(0, 4).map((lesson) => (
              <Link key={lesson.id} className="lesson-row" href={`/student/lessons/${lesson.id}`}>
                <span className="lesson-accent" />
                <span>
                  <strong>{lesson.title}</strong>
                  <small>Lesson {lesson.lessonNumber} · {lesson.instrument} · {formatShortDate(lesson.scheduledDate)}</small>
                </span>
                <span className="badge b-purple">Open</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Next actions</div>
              <div className="section-sub">{videos.length} videos · {exercisesCount} exercises · {listeningCount} tracks</div>
            </div>
          </div>
          <button className="action-row" type="button" onClick={() => setPage("uploads")}>
            <span className="badge b-purple">Upload</span>
            <strong>Add lesson media for {selectedStudentName}</strong>
          </button>
          <button className="action-row" type="button" onClick={() => setPage("exercises")}>
            <span className="badge b-green">Notation</span>
            <strong>Create a new exercise</strong>
          </button>
          <button className="action-row" type="button" onClick={() => setPage("listening")}>
            <span className="badge b-gold">Listen</span>
            <strong>Add a YouTube listening track</strong>
          </button>
          <button className="action-row" type="button" onClick={() => setPage("videos")}>
            <span className="badge b-cyan">Library</span>
            <strong>Review student video queue</strong>
          </button>
        </div>
      </section>
    </>
  );
}
