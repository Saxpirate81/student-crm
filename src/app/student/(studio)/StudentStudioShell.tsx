"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { StudentStudioProvider } from "@/app/student/(studio)/student-studio-context";
import type { LessonSummary, MetronomeSound, ProgramType, StudentProfile, StudentVideo } from "@/lib/domain/types";
import type { DailyPracticeSummary } from "@/lib/data/repository";
import { MOCK_USER_KEYS } from "@/lib/data/repository";
import { DEFAULT_DAILY_GOAL_MINUTES, monSunIndexForDate, weekMinutesMonToSun } from "@/lib/student-progress";
import { useAuth } from "@/lib/auth/auth-context";
import { useMetronome } from "@/hooks/useMetronome";
import { useMicPracticeDetector } from "@/hooks/useMicPracticeDetector";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";
import {
  addListeningSeconds,
  addListeningTrack,
  loadListeningState,
  markStudentNewsRead,
  type ListeningTrack,
  type ListeningState,
  type NewsUpdate,
} from "@/lib/listening/mock-listening-store";
import {
  addPracticeSubmission,
  getPracticePlanForLesson,
  listPracticeSubmissions,
  type PracticePlan,
  type PracticeSubmission,
} from "@/lib/practice-loop";
import { getStudentCopyProfile, type StudentCopyProfile } from "@/lib/student-engagement";
import { useRepository } from "@/lib/useRepository";
import { CadenzaMessageBoard } from "@/components/messaging/CadenzaMessageBoard";
import { useRotatingHeroHeadline } from "@/hooks/useRotatingHeroHeadline";
import { PracticeGoalRing } from "@/components/student/PracticeGoalRing";
import { AddVideoModal, type VideoAssignmentOption } from "@/components/video/AddVideoModal";
import { GamifiedRewardTrack } from "@/components/gamification/GamifiedRewardTrack";

export type StudioPage = "dashboard" | "practice" | "listening" | "achievements" | "progress";

/** Which main studio tab is active; `other` for /student/journey, lessons, etc. */
export type StudentStudioNav = StudioPage | "other";

function studentStudioNavFromPathname(path: string): StudentStudioNav {
  const base = path.split("?")[0] ?? path;
  const trimmed = base.replace(/\/+$/, "") || "/student";
  if (trimmed === "/student") return "dashboard";
  const seg = trimmed.replace(/^\/student\/?/, "").split("/").filter(Boolean)[0];
  if (!seg) return "dashboard";
  const tabs: StudioPage[] = ["practice", "listening", "achievements", "progress"];
  if (tabs.includes(seg as StudioPage)) return seg as StudioPage;
  return "other";
}

function studioHref(page: StudioPage): string {
  return page === "dashboard" ? "/student" : `/student/${page}`;
}

type Assignment = {
  id: string;
  title: string;
  type: "Practice" | "Theory" | "Performance";
  due: string;
  done: boolean;
  xpReward: number;
  notes?: string;
  lessonId?: string;
};

const navItems: Array<{ id: StudioPage; label: string; icon: keyof typeof icons }> = [
  { id: "dashboard", label: "Studio", icon: "grid" },
  { id: "practice", label: "Practice", icon: "music" },
  { id: "listening", label: "Listen", icon: "headphones" },
  { id: "achievements", label: "Awards", icon: "trophy" },
  { id: "progress", label: "Progress", icon: "chart" },
];

const appViewOptions = [
  { href: "/instructor", label: "Instructor" },
  { href: "/student", label: "Student" },
  { href: "/parent", label: "Parent" },
  { href: "/admin", label: "Admin" },
  { href: "/producer", label: "Producer" },
];

const programLabels: Record<ProgramType, string> = {
  lessons: "Lessons",
  bands: "Bands",
  camps: "Camps",
};

const mockStudentAges: Record<string, number> = {
  "crm-alex": 14,
  "crm-sam": 9,
};

const icons = {
  grid: (
    <path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" />
  ),
  clip: (
    <>
      <rect x="3" y="2" width="10" height="13" rx="1.5" />
      <path d="M6 2a2 2 0 0 1 4 0M6 7h4M6 10h3" />
    </>
  ),
  chart: <path d="M1 12 5 7l3 2 4-5 3 2" />,
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
  trophy: (
    <>
      <path d="M5 2h6v6a3 3 0 0 1-6 0V2zM5 4H2v2a2 2 0 0 0 3 1.7M11 4h3v2a2 2 0 0 1-3 1.7M8 11v2M5 14h6" />
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
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ageBandFor(age: number) {
  if (age < 10) return "<10";
  if (age < 13) return "10-12";
  if (age <= 18) return "13-18";
  return "19+";
}

function practiceRankingFor(student: StudentProfile, roster: StudentProfile[], weekTotal: number) {
  const age = mockStudentAges[student.crmId] ?? 16;
  const band = ageBandFor(age);
  const bandRoster = roster.filter((entry) => ageBandFor(mockStudentAges[entry.crmId] ?? 16) === band);
  const scores = bandRoster
    .map((entry) => ({
      crmId: entry.crmId,
      name: entry.displayName,
      minutes: entry.crmId === student.crmId ? weekTotal : entry.crmId === "crm-sam" ? 118 : 94,
    }))
    .sort((a, b) => b.minutes - a.minutes);
  const rank = Math.max(1, scores.findIndex((entry) => entry.crmId === student.crmId) + 1);
  return { age, band, rank, total: scores.length, leaders: scores.slice(0, 3) };
}

function buildAssignments(studentName: string, lessons: LessonSummary[]) {
  const anchorLesson = lessons[0];
  return lessons.slice(0, 5).map((lesson, index): Assignment => {
    const isTheory = index % 3 === 1;
    const isPerformance = index % 3 === 2;
    return {
      id: lesson.id,
      title: isTheory
        ? `Review notes from ${lesson.title}`
        : isPerformance
          ? `Record a clean take for ${lesson.title}`
          : `Practice ${lesson.title} focus points`,
      type: isTheory ? "Theory" : isPerformance ? "Performance" : "Practice",
      due: formatShortDate(lesson.scheduledDate),
      done: index === lessons.length - 1,
      xpReward: isPerformance ? 100 : isTheory ? 35 : 50,
      notes: lesson.notes,
      lessonId: lesson.id,
    };
  }).concat([
    {
      id: `${studentName}-warmup`,
      title: anchorLesson ? `Daily warmup for ${anchorLesson.title}` : "Daily warmup with metronome",
      type: "Practice",
      due: "Today",
      done: false,
      xpReward: 30,
      notes: anchorLesson?.notes ?? "Start slow, lock the pulse, then raise tempo by 4 BPM.",
      lessonId: anchorLesson?.id,
    },
  ]);
}

function assignmentBadge(type: Assignment["type"]) {
  if (type === "Theory") return "b-gold";
  if (type === "Performance") return "b-green";
  return "b-blue";
}

function VideoTile({ video }: { video: StudentVideo }) {
  const href = video.lessonId
    ? `/student/lessons/${video.lessonId}?v=${encodeURIComponent(video.id)}`
    : `/student/videos/${video.id}`;

  return (
    <Link href={href} className="c-video-card">
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
        <span className="badge b-purple">{video.uploaderRole}</span>
        <strong>{video.title}</strong>
        <span>{video.lessonId ? "Open lesson player" : "Open player + tools"}</span>
      </div>
    </Link>
  );
}

export function StudentStudioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const studioNav = studentStudioNavFromPathname(pathname);
  const openStudioPage = useCallback(
    (next: StudioPage) => {
      router.push(studioHref(next));
    },
    [router],
  );
  const { session, ready } = useAuth();
  const { repository, version } = useRepository();
  const { theme, toggleTheme } = useCadenzaTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studentCrmId, setStudentCrmId] = useState("crm-alex");
  const [practiceSeconds, setPracticeSeconds] = useState(0);
  const [micRetryNonce, setMicRetryNonce] = useState(0);
  const [completedAssignments, setCompletedAssignments] = useState<Record<string, boolean>>({});
  const [listeningVersion, setListeningVersion] = useState(0);
  const [listeningTitle, setListeningTitle] = useState("");
  const [listeningUrl, setListeningUrl] = useState("");
  const [listeningLessonId, setListeningLessonId] = useState("latest");
  const [listeningSongTitle, setListeningSongTitle] = useState("");
  const [listeningState, setListeningState] = useState<ListeningState>({ tracks: [], news: [] });
  const [practiceLoopVersion, setPracticeLoopVersion] = useState(0);
  const [practiceSubmissions, setPracticeSubmissions] = useState<PracticeSubmission[]>([]);
  const [practiceSubmissionDraft, setPracticeSubmissionDraft] = useState("");
  const [practiceSubmissionItemId, setPracticeSubmissionItemId] = useState<string | null>(null);
  const [videoModalContext, setVideoModalContext] = useState<{
    lessonId?: string | null;
    assignmentId?: string | null;
    assignmentTitle?: string | null;
  } | null>(null);

  const selectableStudents = useMemo(() => {
    void version;
    const all = repository.listStudents();
    if (session?.kind === "parent") return all.filter((row) => row.parentCrmId === session.parentCrmId);
    return all;
  }, [repository, session, version]);

  useEffect(() => {
    if (!ready) return;
    if (session?.kind === "child") {
      setStudentCrmId(session.studentCrmId);
      return;
    }
    if (session?.kind === "parent" && selectableStudents.length) {
      setStudentCrmId((prev) =>
        selectableStudents.some((student) => student.crmId === prev) ? prev : selectableStudents[0].crmId,
      );
    }
  }, [ready, selectableStudents, session]);

  const student = repository.getStudent(studentCrmId) ?? selectableStudents[0] ?? repository.listStudents()[0];
  const programs = useMemo(
    () => repository.listProgramsForStudent(student?.crmId ?? studentCrmId),
    [repository, student?.crmId, studentCrmId],
  );
  const [activeProgram, setActiveProgram] = useState<ProgramType>(programs[0] ?? "lessons");

  useEffect(() => {
    if (!student) return;
    const next = repository.listProgramsForStudent(student.crmId);
    setActiveProgram((current) => (next.includes(current) ? current : next[0] ?? "lessons"));
  }, [student, repository, version]);

  const lessons = useMemo(() => {
    void version;
    return student ? repository.listLessonsForStudent(student.crmId, activeProgram) : [];
  }, [activeProgram, repository, student, version]);
  const allLessons = useMemo(() => {
    void version;
    return student ? repository.listLessonsForStudent(student.crmId) : [];
  }, [repository, student, version]);
  const videos = useMemo(() => {
    void version;
    return student ? repository.listVideosForStudent(student.crmId) : [];
  }, [repository, student, version]);
  const exercises = useMemo(() => {
    void version;
    return student ? repository.listExercisesForStudent(student.crmId) : [];
  }, [repository, student, version]);
  useEffect(() => {
    setListeningState(loadListeningState());
  }, [listeningVersion]);

  const listeningTracks = listeningState.tracks.filter((track) => track.studentCrmId === (student?.crmId ?? studentCrmId));
  const newsUpdates = listeningState.news.filter((item) => item.studentCrmId === (student?.crmId ?? studentCrmId));
  const unreadNewsCount = newsUpdates.filter((item) => !item.read).length;
  void listeningVersion;
  const assignments = buildAssignments(student?.displayName ?? "Student", allLessons).map((assignment) => ({
    ...assignment,
    done: completedAssignments[assignment.id] ?? assignment.done,
  }));
  const categories = repository.listCategories();
  const videoAssignmentOptions: VideoAssignmentOption[] = assignments.map((assignment) => ({
    id: assignment.id,
    lessonId: assignment.lessonId ?? null,
    title: assignment.title,
  }));
  const openAssignments = assignments.filter((assignment) => !assignment.done);
  const totalXp = 2450 + videos.length * 120 + exercises.length * 75 + assignments.filter((item) => item.done).length * 40;
  const level = Math.max(1, Math.floor(totalXp / 650));
  const dailyMap = student ? repository.getDailyPracticeMinutesMap(student.crmId) : {};
  const weekPractice = weekMinutesMonToSun(dailyMap);
  const weekTotal = weekPractice.reduce((sum, value) => sum + value, 0);
  const streak = student ? repository.getPracticeStreakDays(student.crmId) : 0;
  const dailySummary: DailyPracticeSummary = useMemo(() => {
    void version;
    return student
      ? repository.getDailyPracticeSummary(student.crmId)
      : { dayLocal: "", minutes: 0, goalMinutes: DEFAULT_DAILY_GOAL_MINUTES };
  }, [repository, student, version]);
  const todayHeatIndex = monSunIndexForDate();
  const metronome = useMetronome(repository, MOCK_USER_KEYS.student);
  const micPractice = useMicPracticeDetector({
    enabled: studioNav === "practice",
    retryNonce: micRetryNonce,
    onSegmentComplete: (durationSec) => setPracticeSeconds((value) => value + durationSec),
  });
  const livePracticeSeconds = practiceSeconds + micPractice.activeSeconds;
  const practiceRunning = studioNav === "practice" && micPractice.activeSeconds > 0;
  const latestLesson = allLessons[0];
  const studentCopy = getStudentCopyProfile(student);
  const todayPracticePlan = latestLesson && student ? getPracticePlanForLesson(latestLesson, student.ageBand ?? "13to18") : null;

  useEffect(() => {
    setPracticeSubmissions(student ? listPracticeSubmissions(student.crmId) : []);
  }, [student, student?.crmId, practiceLoopVersion]);

  useEffect(() => {
    if (!todayPracticePlan) return;
    setPracticeSubmissionItemId((current) =>
      current && todayPracticePlan.items.some((item) => item.id === current) ? current : todayPracticePlan.items[0]?.id ?? null,
    );
  }, [todayPracticePlan]);

  useEffect(() => {
    const refreshLoop = () => setPracticeLoopVersion((value) => value + 1);
    window.addEventListener("practice-loop-updated", refreshLoop);
    return () => window.removeEventListener("practice-loop-updated", refreshLoop);
  }, []);

  const practiceRanking = student
    ? practiceRankingFor(student, repository.listStudents(), weekTotal)
    : null;

  const profileName = student?.displayName ?? "Student";
  const firstName = profileName.split(" ")[0];
  const pageTitle: Record<StudioPage, string> = {
    dashboard: "My Studio",
    practice: "Practice",
    listening: "Listening",
    achievements: "Achievements",
    progress: "Progress",
  };
  const topbarTitle = studioNav === "other" ? "Student" : pageTitle[studioNav];

  const studioBundle = useMemo(
    () => ({
      openStudioPage,
      dashboardProps: {
        activeProgram,
        assignments,
        dailySummary,
        exercises: exercises.length,
        firstName,
        level,
        lessons,
        openAssignments: openAssignments.length,
        programs,
        setActiveProgram,
        setStudentCrmId,
        practiceRanking,
        selectableStudents,
        sessionKind: session?.kind,
        streak,
        student,
        studentCrmId,
        todayHeatIndex,
        toggleAssignment: (id: string) =>
          setCompletedAssignments((current) => ({
            ...current,
            [id]: !assignments.find((a) => a.id === id)?.done,
          })),
        totalXp,
        videos,
        weekPractice,
        weekTotal,
        listeningTracks,
        newsUpdates,
        unreadNewsCount,
        onOpenListening: () => openStudioPage("listening"),
        onMarkNewsRead: () => {
          if (!student) return;
          markStudentNewsRead(student.crmId);
          setListeningState(loadListeningState());
          setListeningVersion((value) => value + 1);
        },
      },
      practicePage: {
        assignments,
        toggleAssignment: (id: string) =>
          setCompletedAssignments((current) => ({
            ...current,
            [id]: !assignments.find((a) => a.id === id)?.done,
          })),
        onAddVideoToAssignment: (assignment: Assignment) =>
          setVideoModalContext({
            lessonId: assignment.lessonId,
            assignmentId: assignment.id,
            assignmentTitle: assignment.title,
          }),
        metronome,
        practiceRunning,
        latestLesson,
        micStatus: micPractice.micStatus,
        onRetryMic: () => setMicRetryNonce((value) => value + 1),
        plan: todayPracticePlan,
        submissionDraft: practiceSubmissionDraft,
        submissionItemId: practiceSubmissionItemId,
        submissions: practiceSubmissions,
        studentCopy,
        setSubmissionDraft: setPracticeSubmissionDraft,
        setSubmissionItemId: setPracticeSubmissionItemId,
        onSubmitPractice: () => {
          if (!todayPracticePlan || !practiceSubmissionDraft.trim()) return;
          addPracticeSubmission({
            plan: todayPracticePlan,
            itemId: practiceSubmissionItemId,
            body: practiceSubmissionDraft.trim(),
            durationSec: livePracticeSeconds || undefined,
          });
          repository.appendActivityEvent({
            studentCrmId: todayPracticePlan.studentCrmId,
            kind: "assignment_done",
            title: "Practice submitted for review",
            detail: todayPracticePlan.lessonTitle,
          });
          setPracticeSubmissionDraft("");
          setPracticeLoopVersion((value) => value + 1);
        },
        practiceSeconds: livePracticeSeconds,
        videos,
        weekPractice,
      },
      listeningPage: {
        title: listeningTitle,
        url: listeningUrl,
        lessonId: listeningLessonId,
        songTitle: listeningSongTitle,
        setTitle: setListeningTitle,
        setUrl: setListeningUrl,
        setLessonId: setListeningLessonId,
        setSongTitle: setListeningSongTitle,
        tracks: listeningTracks,
        newsUpdates,
        lessons: allLessons,
        onAddTrack: () => {
          if (!student || !listeningTitle.trim() || !listeningUrl.trim()) return;
          const attachedLesson =
            allLessons.find((lesson) => lesson.id === (listeningLessonId === "latest" ? allLessons[0]?.id : listeningLessonId)) ??
            null;
          addListeningTrack({
            studentCrmId: student.crmId,
            title: listeningTitle.trim(),
            url: listeningUrl.trim(),
            lessonId: attachedLesson?.id ?? null,
            lessonTitle: attachedLesson?.title ?? null,
            songTitle: listeningSongTitle.trim() || null,
            addedBy: "student",
          });
          setListeningTitle("");
          setListeningUrl("");
          setListeningSongTitle("");
          setListeningState(loadListeningState());
          setListeningVersion((value) => value + 1);
        },
        onLogListen: (trackId: string) => {
          addListeningSeconds(trackId, 180);
          setListeningState(loadListeningState());
          setListeningVersion((value) => value + 1);
        },
        onMarkNewsRead: () => {
          if (!student) return;
          markStudentNewsRead(student.crmId);
          setListeningState(loadListeningState());
          setListeningVersion((value) => value + 1);
        },
      },
      achievementsPage: {
        profileName,
        level,
        streak,
        totalXp,
        videos: videos.length,
        exercises: exercises.length,
      },
      progressPage: {
        assignments,
        exercises: exercises.length,
        level,
        streak,
        videos: videos.length,
      },
    }),
    [
      activeProgram,
      assignments,
      dailySummary,
      exercises,
      firstName,
      level,
      lessons,
      openAssignments,
      listeningLessonId,
      listeningSongTitle,
      listeningTitle,
      listeningTracks,
      listeningUrl,
      allLessons,
      livePracticeSeconds,
      metronome,
      micPractice.micStatus,
      newsUpdates,
      openStudioPage,
      practiceRanking,
      practiceSubmissionDraft,
      practiceSubmissionItemId,
      practiceSubmissions,
      practiceRunning,
      profileName,
      programs,
      repository,
      latestLesson,
      studentCopy,
      selectableStudents,
      session?.kind,
      streak,
      student,
      studentCrmId,
      todayPracticePlan,
      todayHeatIndex,
      totalXp,
      unreadNewsCount,
      videos,
      weekPractice,
      weekTotal,
    ],
  );

  if (ready && session?.kind === "parent" && !selectableStudents.length) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 p-8 text-center dark:border-amber-500/25 dark:bg-amber-950/30">
        <h1 className="text-xl font-black text-amber-950 dark:text-amber-100">No student profiles yet</h1>
        <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
          Add a family member from the parent view, then return here.
        </p>
        <Link href="/parent" className="ui-button-primary mt-5 inline-flex rounded-xl px-4 py-2 text-sm font-bold">
          Open parent view
        </Link>
      </div>
    );
  }

  return (
    <StudentStudioProvider value={studioBundle}>
    <div className="cadenza-app" data-theme={theme}>
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
            value={appViewOptions.find((option) => pathname.startsWith(option.href))?.href ?? "/student"}
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
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={studioHref(item.id)}
              className={`nav-item ${studioNav === item.id ? "active" : ""}`}
              onClick={() => setDrawerOpen(false)}
            >
              <StudioIcon icon={item.icon} className="nav-ico" />
              <span>{item.label}</span>
              {item.id === "practice" && openAssignments.length ? (
                <span className="nav-badge">{openAssignments.length}</span>
              ) : null}
              {item.id === "listening" && unreadNewsCount ? (
                <span className="nav-badge">{unreadNewsCount}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="su-inner">
            <div className="su-avatar">{initials(profileName)}</div>
            <div className="min-w-0">
              <div className="su-name">{profileName}</div>
              <div className="su-role">Lv.{level} · {programs.map((program) => programLabels[program]).join(", ")}</div>
            </div>
          </div>
          <button className="theme-toggle menu-theme-toggle" onClick={toggleTheme} type="button">
            <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
            <span className="toggle-track"><span className="toggle-knob" /></span>
            <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
        </div>
      </aside>

      <main className="c-main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setDrawerOpen(true)} aria-label="Menu" type="button">
            <span />
            <span />
            <span />
          </button>
          <div className="page-title">{topbarTitle}</div>
          <div className="topbar-right">
            <div className="xp-pill">+ {totalXp.toLocaleString()} XP</div>
            <button className="theme-toggle" onClick={toggleTheme} type="button">
              <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
              <span className="toggle-track"><span className="toggle-knob" /></span>
              <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
            <Link
              className="btn btn-primary"
              href={studioNav === "practice" ? "/student/listening" : "/student/practice"}
            >
              {studioNav === "practice" ? "Listening" : "Start Practice"}
            </Link>
          </div>
        </div>
        <div className="content">{children}</div>
      </main>

      <nav className="mobile-nav">
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={studioHref(item.id)}
            className={`mob-nav-item ${studioNav === item.id ? "active" : ""}`}
          >
            <StudioIcon icon={item.icon} />
            <span className="mob-nav-lbl">{item.label}</span>
            {item.id === "practice" && openAssignments.length ? <span className="mob-nav-dot" /> : null}
            {item.id === "listening" && unreadNewsCount ? <span className="mob-nav-dot" /> : null}
          </Link>
        ))}
      </nav>

      <button className="fab" type="button" aria-label="Add video" onClick={() => setVideoModalContext({ lessonId: latestLesson?.id })}>
        ♪
      </button>
      {videoModalContext ? (
        <AddVideoModal
          assignments={videoAssignmentOptions}
          categories={categories}
          initialAssignmentId={videoModalContext.assignmentId}
          initialAssignmentTitle={videoModalContext.assignmentTitle}
          initialLessonId={videoModalContext.lessonId}
          lessons={allLessons}
          onClose={() => setVideoModalContext(null)}
          onSave={(input) => {
            repository.addVideo(input);
            setVideoModalContext(null);
          }}
          savedVideos={videos}
          studentCrmId={student?.crmId ?? studentCrmId}
          uploaderRole="student"
        />
      ) : null}
    </div>
    </StudentStudioProvider>
  );
}

export function StudentStudioDashboard(props: {
  activeProgram: ProgramType;
  assignments: Assignment[];
  dailySummary: DailyPracticeSummary;
  exercises: number;
  firstName: string;
  level: number;
  lessons: LessonSummary[];
  openAssignments: number;
  programs: ProgramType[];
  setActiveProgram: (program: ProgramType) => void;
  setStudentCrmId: (id: string) => void;
  practiceRanking: ReturnType<typeof practiceRankingFor> | null;
  selectableStudents: StudentProfile[];
  sessionKind?: string;
  streak: number;
  student?: StudentProfile;
  studentCrmId: string;
  todayHeatIndex: number;
  toggleAssignment: (id: string) => void;
  totalXp: number;
  videos: StudentVideo[];
  weekPractice: number[];
  weekTotal: number;
  listeningTracks: ListeningTrack[];
  newsUpdates: NewsUpdate[];
  unreadNewsCount: number;
  onOpenListening: () => void;
  onMarkNewsRead: () => void;
}) {
  const {
    activeProgram,
    assignments,
    dailySummary,
    exercises,
    firstName,
    level,
    lessons,
    openAssignments,
    programs,
    setActiveProgram,
    setStudentCrmId,
    practiceRanking,
    selectableStudents,
    sessionKind,
    streak,
    student,
    studentCrmId,
    todayHeatIndex,
    toggleAssignment,
    totalXp,
    videos,
    weekPractice,
    weekTotal,
    listeningTracks,
    newsUpdates,
    unreadNewsCount,
    onOpenListening,
    onMarkNewsRead,
  } = props;

  const greetingHeadline = useRotatingHeroHeadline("student", firstName);
  const topPracticeMinutes = practiceRanking ? Math.max(...practiceRanking.leaders.map((leader) => leader.minutes), weekTotal, 1) : 1;
  const nextPracticeTarget = practiceRanking
    ? practiceRanking.leaders.find((leader) => leader.minutes > weekTotal)
    : null;
  const minutesToNextRank = nextPracticeTarget ? Math.max(1, nextPracticeTarget.minutes - weekTotal + 1) : 0;

  return (
    <>
      <section className="studio-hero studio-hero--student-home">
        <div>
          <p className="card-title">Your practice space</p>
          <h1>{greetingHeadline}</h1>
        </div>
        {sessionKind === "child" ? (
          <span className="badge b-green">Family session</span>
        ) : (
          <label className="profile-select">
            Profile
            <select value={studentCrmId} onChange={(event) => setStudentCrmId(event.target.value)}>
              {selectableStudents.map((entry) => (
                <option key={entry.crmId} value={entry.crmId}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <CadenzaMessageBoard viewerRole="student" />

      <GamifiedRewardTrack
        eyebrow="Reward path"
        title="Weekly XP quest"
        subtitle="Practice minutes, listening time, and submitted checkpoints move this bar."
        pointsLabel="Studio XP"
        pointsValue={totalXp.toLocaleString()}
        progress={Math.min(100, Math.round((weekTotal / 210) * 100))}
        steps={[
          { label: "Start", value: `${streak}d`, tone: "gold", unlocked: streak > 0 },
          { label: "Listen", value: `${Math.round(listeningTracks.reduce((sum, track) => sum + track.listenedSeconds, 0) / 60)}m`, tone: "cyan", unlocked: listeningTracks.length > 0 },
          { label: "Submit", value: `${assignments.filter((item) => item.done).length}/${assignments.length}`, tone: "purple", unlocked: assignments.some((item) => item.done) },
          { label: "Goal", value: "210m", tone: "green", unlocked: weekTotal >= 210 },
        ]}
      />

      {practiceRanking ? (
        <section className="practice-league-card">
          <div className="practice-league-glow" aria-hidden />
          <div className="practice-league-head">
            <div>
              <p className="card-title">Practice league</p>
              <h2>Age division {practiceRanking.band}</h2>
              <p>
                Rank is based on this week&apos;s practice minutes. Keep stacking sessions to climb before lesson day.
              </p>
            </div>
            <div className="practice-rank-medal">
              <span>Rank</span>
              <strong>#{practiceRanking.rank}</strong>
              <small>of {practiceRanking.total}</small>
            </div>
          </div>
          <div className="practice-league-score">
            <div>
              <span>Your week</span>
              <strong>{weekTotal}m</strong>
            </div>
            <div>
              <span>Next climb</span>
              <strong>{minutesToNextRank ? `${minutesToNextRank}m` : "Top"}</strong>
            </div>
            <div>
              <span>Division</span>
              <strong>{practiceRanking.age}</strong>
            </div>
          </div>
          <div className="practice-league-board">
            {practiceRanking.leaders.map((leader, index) => {
              const isCurrent = leader.crmId === student?.crmId;
              const progress = Math.max(8, Math.round((leader.minutes / topPracticeMinutes) * 100));
              return (
                <div className={`practice-league-row ${isCurrent ? "current" : ""}`} key={leader.crmId}>
                  <span className={`league-place place-${index + 1}`}>{index + 1}</span>
                  <span className="league-avatar">{initials(leader.name)}</span>
                  <span className="league-name">
                    <strong>{leader.name}{isCurrent ? " (You)" : ""}</strong>
                    <span className="league-progress"><span style={{ width: `${progress}%` }} /></span>
                  </span>
                  <span className="league-minutes">{leader.minutes}m</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="practice-hero-card">
        <PracticeGoalRing minutes={dailySummary.minutes} goalMinutes={dailySummary.goalMinutes} />
        <div className="practice-hero-copy">
          <div className="card-title">Today&apos;s practice</div>
          <p className="section-sub">
            Your daily ring fills from lesson and video practice time (mic-detected segments). Streak counts calendar days
            where you hit at least {dailySummary.goalMinutes} minutes.
          </p>
          <p className="section-sub">
            Current streak: <strong>{streak} days</strong> · This week: <strong>{weekTotal} min</strong>
          </p>
          <div className="practice-hero-actions">
            <Link className="btn btn-sm" href="/student/journey">
              Journey
            </Link>
            <Link className="btn btn-sm" href="/student/compare">
              Compare videos
            </Link>
            <Link className="btn btn-sm" href="/student/showcase">
              Showcase
            </Link>
          </div>
        </div>
      </section>

      <section className="grid4">
        <Metric label="Streak" value={`${streak}`} sub="days" tone="gold" />
        <Metric label="XP" value={totalXp.toLocaleString()} sub={`Level ${level}`} tone="purple" />
        <Metric label="Tasks" value={`${openAssignments}`} sub="Open" tone={openAssignments ? "red" : "green"} />
        <Metric label="Week" value={`${weekTotal}m`} sub="Goal: 210" tone="cyan" />
      </section>

      <section className="grid2">
        <div className="card message-board">
          <div className="card-header">
            <div>
              <div className="card-title">Message board</div>
              <div className="section-sub">{unreadNewsCount} new updates from instructor, school, and app.</div>
            </div>
            <button className="btn btn-sm" type="button" onClick={onMarkNewsRead}>Mark read</button>
          </div>
          {newsUpdates.slice(0, 3).map((item) => (
            <div className={`news-row ${item.read ? "" : "unread"}`} key={item.id}>
              <span className={`badge ${item.source === "instructor" ? "b-purple" : item.source === "school" ? "b-gold" : "b-cyan"}`}>{item.source}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Listening</div>
              <div className="section-sub">YouTube playlist time counts toward listening rewards.</div>
            </div>
            <button className="btn btn-sm" type="button" onClick={onOpenListening}>Open</button>
          </div>
          <Metric
            label="Total listening"
            value={`${Math.round(listeningTracks.reduce((sum, track) => sum + track.listenedSeconds, 0) / 60)}m`}
            sub={`${listeningTracks.length} tracks`}
            tone="cyan"
          />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Schedule</div>
            <div className="section-sub">Programs enrolled for {student?.displayName ?? "this student"}.</div>
          </div>
        </div>
        <div className="tabs">
          {(programs.length ? programs : ["lessons" as ProgramType]).map((program) => (
            <button
              key={program}
              className={`tab ${activeProgram === program ? "active" : ""}`}
              onClick={() => setActiveProgram(program)}
              type="button"
            >
              {programLabels[program]}
            </button>
          ))}
        </div>
        <div className="lesson-list">
          {lessons.map((lesson) => (
            <Link key={lesson.id} className="lesson-row" href={`/student/lessons/${lesson.id}`}>
              <span className="lesson-accent" />
              <span>
                <strong>{lesson.title}</strong>
                <small>Lesson {lesson.lessonNumber} · {lesson.instrument} · {formatShortDate(lesson.scheduledDate)}</small>
              </span>
              <span className="badge b-purple">Open</span>
            </Link>
          ))}
          {!lessons.length ? <p className="empty-copy">No lessons for this program.</p> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">This week</div>
            <div className="section-sub">Minutes logged on the practice calendar (Mon–Sun).</div>
          </div>
          <span className="badge b-cyan">{weekTotal} min</span>
        </div>
        <HeatGrid todayIndex={todayHeatIndex} weekPractice={weekPractice} />
        <div className="pbar mt-12"><div className="xpbar-fill" style={{ width: `${Math.round((weekTotal / 210) * 100)}%` }} /></div>
        <div className="section-sub mt-6">{weekTotal} / 210 min toward weekly goal</div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">My assignments</div>
            <div className="section-sub">Tasks from your instructor — keep them, but today&apos;s ring is the headline.</div>
          </div>
          <Link className="btn btn-sm" href="/student/practice">
            Open in Practice
          </Link>
        </div>
        {assignments.slice(0, 4).map((assignment) => (
          <AssignmentRow key={assignment.id} assignment={assignment} onToggle={() => toggleAssignment(assignment.id)} />
        ))}
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Watch next</div>
            <div className="section-sub">{videos.length} current app videos ready for playback.</div>
          </div>
          <span className="badge b-gold">{exercises} exercises</span>
        </div>
        <div className="video-grid">
          {videos.map((video) => <VideoTile key={video.id} video={video} />)}
        </div>
      </section>
    </>
  );
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

function MetronomePanel({ metronome }: { metronome: ReturnType<typeof useMetronome> }) {
  return (
    <div className="metro">
      <div className="tool-head">
        <span>Metronome</span>
        <button className="btn btn-primary btn-sm" onClick={() => metronome.setMetronomeOn((value) => !value)} type="button">
          {metronome.metronomeOn ? "Stop" : "Start"}
        </button>
      </div>
      <div className="metro-bpm">{metronome.bpm}</div>
      <div className="metro-lbl">BPM</div>
      <input
        type="range"
        min={metronome.minBpm}
        max={metronome.maxBpm}
        value={metronome.bpm}
        onChange={(event) => metronome.setBpm(Number(event.target.value))}
      />
      <div className="metro-sounds">
        {metronome.soundOptions.map((option) => (
          <button
            key={option.value}
            className={`sound-btn ${metronome.metronomeSound === option.value ? "active" : ""}`}
            onClick={() => metronome.setMetronomeSound(option.value as MetronomeSound)}
            type="button"
          >
            {option.label.replace(" ", "\u00a0")}
          </button>
        ))}
      </div>
      <div className="metro-beats" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => <span key={i} className={`beat-dot ${metronome.metronomeOn && i === 0 ? "strong" : ""}`} />)}
      </div>
    </div>
  );
}

function PracticeCounter({
  running,
  seconds,
  statusLabel,
  onToggle,
  buttonLabel,
}: {
  running: boolean;
  seconds: number;
  statusLabel?: string;
  onToggle: () => void;
  buttonLabel?: string;
}) {
  return (
    <div className="practice-counter">
      <div className="tool-head">
        <span>Practice Timer</span>
        <button className="btn btn-sm" onClick={onToggle} type="button">{buttonLabel ?? (running ? "Stop" : "Start")}</button>
      </div>
      <div className="status-line"><span className={`pc-dot ${running ? "active" : ""}`} /><span>{statusLabel ?? (running ? "Session live" : "Ready to practice")}</span></div>
      <div className="pc-timer">{formatClock(seconds)}</div>
      <div className="pc-label">Session time</div>
      <div className="waveform" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className="wf-bar" style={{ height: running ? `${6 + ((i * 7 + seconds * 3) % 20)}px` : "3px", opacity: running ? 1 : 0.3 }} />
        ))}
      </div>
    </div>
  );
}

function AssignmentRow({
  assignment,
  onAddVideo,
  onToggle,
}: {
  assignment: Assignment;
  onAddVideo?: (assignment: Assignment) => void;
  onToggle: () => void;
}) {
  return (
    <div className="arow">
      <button className={`check ${assignment.done ? "done" : ""}`} onClick={onToggle} type="button" aria-label="Toggle assignment">
        {assignment.done ? "✓" : ""}
      </button>
      <div className="arow-content">
        <div className={`arow-title ${assignment.done ? "done" : ""}`}>{assignment.title}</div>
        <div className="arow-meta">
          <span className={`badge ${assignmentBadge(assignment.type)}`}>{assignment.type}</span>
          <span className="badge b-purple">+{assignment.xpReward}XP</span>
          <span>Due {assignment.due}</span>
          {assignment.lessonId ? <Link href={`/student/lessons/${assignment.lessonId}`}>Lesson</Link> : null}
          {onAddVideo ? (
            <button className="assignment-video-btn" type="button" onClick={() => onAddVideo(assignment)}>
              Add video
            </button>
          ) : null}
        </div>
        {assignment.notes ? <div className="arow-note">{assignment.notes}</div> : null}
      </div>
    </div>
  );
}

export function StudentStudioAssignmentsPage({
  assignments,
  onAddVideoToAssignment,
  toggleAssignment,
}: {
  assignments: Assignment[];
  onAddVideoToAssignment?: (assignment: Assignment) => void;
  toggleAssignment: (id: string) => void;
}) {
  const done = assignments.filter((assignment) => assignment.done).length;
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title">My assignments</div>
          <div className="section-sub">{done}/{assignments.length} complete</div>
        </div>
        <span className="badge b-purple">+{assignments.filter((item) => !item.done).reduce((sum, item) => sum + item.xpReward, 0)} XP available</span>
      </div>
      <div className="xpbar-wrap"><div className="xpbar-fill" style={{ width: `${Math.round((done / assignments.length) * 100)}%` }} /></div>
      <div className="mt-12">
        {assignments.map((assignment) => (
          <AssignmentRow
            key={assignment.id}
            assignment={assignment}
            onAddVideo={onAddVideoToAssignment}
            onToggle={() => toggleAssignment(assignment.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function StudentStudioPracticePage(props: {
  assignments: Assignment[];
  toggleAssignment: (id: string) => void;
  latestLesson?: LessonSummary;
  metronome: ReturnType<typeof useMetronome>;
  micStatus: ReturnType<typeof useMicPracticeDetector>["micStatus"];
  onRetryMic: () => void;
  onAddVideoToAssignment?: (assignment: Assignment) => void;
  onSubmitPractice: () => void;
  plan: PracticePlan | null;
  practiceRunning: boolean;
  practiceSeconds: number;
  setSubmissionDraft: (value: string) => void;
  setSubmissionItemId: (value: string | null) => void;
  studentCopy: StudentCopyProfile;
  submissionDraft: string;
  submissionItemId: string | null;
  submissions: PracticeSubmission[];
  videos: StudentVideo[];
  weekPractice: number[];
}) {
  const statusLabel =
    props.micStatus === "denied"
      ? "Microphone blocked"
      : props.practiceRunning
        ? "Music detected — timing"
        : "Listening for music";

  return (
    <>
      <section className="card latest-notes-card practice-plan-card">
        <div className="card-header">
          <div>
            <div className="card-title">{props.studentCopy.planTitle}</div>
            <div className="section-sub">
              {props.latestLesson
                ? `Lesson ${props.latestLesson.lessonNumber} · ${props.latestLesson.instrument} · ${formatShortDate(props.latestLesson.scheduledDate)}`
                : "No lesson notes yet"}
            </div>
          </div>
          {props.latestLesson ? (
            <Link className="btn btn-sm" href={`/student/lessons/${props.latestLesson.id}`}>
              Open lesson
            </Link>
          ) : null}
        </div>
        <h2>{props.plan?.lessonTitle ?? props.latestLesson?.title ?? "Practice focus will appear here"}</h2>
        <p>{props.plan?.recap ?? props.latestLesson?.notes ?? "When your instructor adds the next lesson, its notes will become the practice plan for this tab."}</p>
        <p className="practice-plan-intro">{props.studentCopy.planIntro}</p>
        {props.plan ? (
          <div className="practice-plan-grid">
            {props.plan.items.map((item) => (
              <button
                className={`practice-plan-step ${props.submissionItemId === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => props.setSubmissionItemId(item.id)}
                type="button"
              >
                <span className={`badge ${item.kind === "record" ? "b-gold" : item.kind === "focus" ? "b-purple" : "b-blue"}`}>
                  {item.minutes}m
                </span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <section className="card submission-card">
        <div className="card-header">
          <div>
            <div className="card-title">Student submission</div>
            <div className="section-sub">{props.studentCopy.evidenceHint}</div>
          </div>
          <span className="badge b-cyan">{props.submissions.filter((item) => item.status === "needs_review").length} in review</span>
        </div>
        <label className="form-grp">
          <span className="form-lbl">{props.studentCopy.submitLabel}</span>
          <textarea
            className="inp ta"
            value={props.submissionDraft}
            onChange={(event) => props.setSubmissionDraft(event.target.value)}
            placeholder={props.studentCopy.submitPlaceholder}
          />
        </label>
        <div className="modal-acts">
          <button
            className="btn btn-primary"
            disabled={!props.plan || !props.submissionDraft.trim()}
            onClick={props.onSubmitPractice}
            type="button"
          >
            {props.studentCopy.submitButton}
          </button>
        </div>
        {props.submissions.slice(0, 3).map((submission) => (
          <div className="submission-row" key={submission.id}>
            <span className={`badge ${submission.status === "reviewed" ? "b-green" : submission.status === "redo" ? "b-red" : "b-gold"}`}>
              {submission.status === "needs_review" ? "Review" : submission.status}
            </span>
            <span>{submission.body}</span>
          </div>
        ))}
      </section>
      <StudentStudioAssignmentsPage
        assignments={props.assignments}
        onAddVideoToAssignment={props.onAddVideoToAssignment}
        toggleAssignment={props.toggleAssignment}
      />
      <section className="grid2">
        <MetronomePanel metronome={props.metronome} />
        <PracticeCounter
          running={props.practiceRunning}
          seconds={props.practiceSeconds}
          statusLabel={statusLabel}
          onToggle={props.micStatus === "denied" ? props.onRetryMic : () => {}}
          buttonLabel={props.micStatus === "denied" ? "Retry mic" : "Auto"}
        />
      </section>
      <section className="card">
        <div className="card-title">Weekly</div>
        {props.weekPractice.map((minutes, index) => (
          <div className="practice-row" key={`${index}-${minutes}`}>
            <span>{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
            <div className="pbar"><div className="pbar-fill" style={{ width: `${Math.min(100, minutes * 2)}%` }} /></div>
            <small>{minutes || "-"}</small>
          </div>
        ))}
      </section>
      <section className="card">
        <div className="card-header"><div className="card-title">Tutorials</div></div>
        <div className="video-grid">{props.videos.map((video) => <VideoTile key={video.id} video={video} />)}</div>
      </section>
    </>
  );
}

export function StudentStudioListeningPage(props: {
  title: string;
  url: string;
  lessonId: string;
  songTitle: string;
  setTitle: (value: string) => void;
  setUrl: (value: string) => void;
  setLessonId: (value: string) => void;
  setSongTitle: (value: string) => void;
  tracks: ListeningTrack[];
  newsUpdates: NewsUpdate[];
  lessons: LessonSummary[];
  onAddTrack: () => void;
  onLogListen: (trackId: string) => void;
  onMarkNewsRead: () => void;
}) {
  const totalMinutes = Math.round(props.tracks.reduce((sum, track) => sum + track.listenedSeconds, 0) / 60);
  const badgeLevel = totalMinutes >= 120 ? "Deep Listener" : totalMinutes >= 45 ? "Active Listener" : "Getting Started";
  const recentTracks = [...props.tracks]
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, 3);

  return (
    <>
      <section className="listening-hero">
        <div>
          <p className="card-title">Recently added</p>
          <h2>Listen like it is part of the lesson.</h2>
          <p>Tracks can attach to the latest lesson or a specific song you are working on.</p>
        </div>
        <div className="recent-track-grid">
          {recentTracks.map((track) => <ListeningCover track={track} key={track.id} onLogListen={props.onLogListen} />)}
        </div>
      </section>
      <section className="grid2">
        <div className="card listening-add-card">
          <div className="card-header">
            <div>
              <div className="card-title">Add listening track</div>
              <div className="section-sub">Paste a YouTube URL and build a student playlist.</div>
            </div>
          </div>
          <div className="instructor-form-grid">
            <label className="form-grp">
              <span className="form-lbl">Track title</span>
              <input className="inp" value={props.title} onChange={(event) => props.setTitle(event.target.value)} placeholder="e.g. Groove reference" />
            </label>
            <label className="form-grp">
              <span className="form-lbl">YouTube URL</span>
              <input className="inp" value={props.url} onChange={(event) => props.setUrl(event.target.value)} placeholder="https://youtube.com/..." />
            </label>
            <label className="form-grp">
              <span className="form-lbl">Attach to lesson</span>
              <select className="inp" value={props.lessonId} onChange={(event) => props.setLessonId(event.target.value)}>
                <option value="latest">Latest lesson</option>
                <option value="none">No lesson attachment</option>
                {props.lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>Lesson {lesson.lessonNumber}: {lesson.title}</option>
                ))}
              </select>
            </label>
            <label className="form-grp">
              <span className="form-lbl">Song / focus</span>
              <input className="inp" value={props.songTitle} onChange={(event) => props.setSongTitle(event.target.value)} placeholder="e.g. Moonlight intro" />
            </label>
          </div>
          <div className="modal-acts">
            <button className="btn btn-primary" type="button" onClick={props.onAddTrack}>Add to playlist</button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Listening rewards</div>
          <Metric label="Total time" value={`${totalMinutes}m`} sub={badgeLevel} tone="cyan" />
          <div className="ach" style={{ marginTop: 12 }}>
            <div className="ach-icon">♪</div>
            <div>
              <div className="ach-name">{badgeLevel}</div>
              <div className="ach-desc">Listening minutes unlock reward badges.</div>
            </div>
            <span className="badge b-green">Active</span>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Playlist</div>
            <div className="section-sub">Instructor and student-added URL tracks.</div>
          </div>
        </div>
        {props.tracks.map((track) => (
          <div className={`listen-row ${recentTracks.some((recent) => recent.id === track.id) ? "recent" : ""}`} key={track.id}>
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
            <button className="btn btn-sm" type="button" onClick={() => props.onLogListen(track.id)}>+3 min</button>
          </div>
        ))}
      </section>
      <section className="card message-board">
        <div className="card-header">
          <div className="card-title">Updates</div>
          <button className="btn btn-sm" type="button" onClick={props.onMarkNewsRead}>Mark all read</button>
        </div>
        {props.newsUpdates.map((item) => (
          <div className={`news-row ${item.read ? "" : "unread"}`} key={item.id}>
            <span className={`badge ${item.source === "instructor" ? "b-purple" : item.source === "school" ? "b-gold" : "b-cyan"}`}>{item.source}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function ListeningCover({
  track,
  onLogListen,
}: {
  track: ListeningTrack;
  onLogListen: (trackId: string) => void;
}) {
  return (
    <article className="listen-cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={track.thumbnailUrl} alt="" />
      <div className="listen-cover-shade" />
      <div className="listen-cover-copy">
        <span className="badge b-gold">New</span>
        <strong>{track.title}</strong>
        <span>{track.songTitle ?? track.lessonTitle ?? track.addedBy}</span>
      </div>
      <button className="cover-play" type="button" onClick={() => onLogListen(track.id)} aria-label={`Log listening for ${track.title}`}>
        +3
      </button>
    </article>
  );
}

export function StudentStudioAchievementsPage(props: {
  profileName: string;
  level: number;
  streak: number;
  totalXp: number;
  videos: number;
  exercises: number;
}) {
  const achievements = [
    { name: "7-Day Warrior", desc: "Practice streak started", unlocked: props.streak >= 7 },
    { name: "Video Explorer", desc: "Opened the lesson library", unlocked: props.videos > 0 },
    { name: "Notation Ready", desc: "Instructor exercises assigned", unlocked: props.exercises > 0 },
    { name: "30-Day Legend", desc: "Reach a 30 day streak", unlocked: props.streak >= 30 },
  ];
  return (
    <>
      <section className="card profile-card">
        <div className="lb-avatar av1">{initials(props.profileName)}</div>
        <div>
          <h2>{props.profileName}</h2>
          <div className="profile-badges">
            <span className="level-badge">Level {props.level}</span>
            <span className="badge b-gold">{props.totalXp.toLocaleString()} XP</span>
            <span className="badge b-green">{props.streak} day streak</span>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-title">Achievements</div>
        {achievements.map((achievement) => (
          <div className={`ach ${achievement.unlocked ? "" : "ach-locked"}`} key={achievement.name}>
            <div className="ach-icon">{achievement.unlocked ? "★" : "·"}</div>
            <div>
              <div className="ach-name">{achievement.name}</div>
              <div className="ach-desc">{achievement.desc}</div>
            </div>
            <span className={`badge ${achievement.unlocked ? "b-green" : "b-cyan"}`}>{achievement.unlocked ? "Done" : "Locked"}</span>
          </div>
        ))}
      </section>
    </>
  );
}

export function StudentStudioProgressPage({
  assignments,
  exercises,
  level,
  streak,
  videos,
}: {
  assignments: Assignment[];
  exercises: number;
  level: number;
  streak: number;
  videos: number;
}) {
  const skillRows = [
    ["Practice", Math.min(96, 45 + assignments.filter((item) => item.done).length * 10)],
    ["Lessons", Math.min(96, 50 + videos * 8)],
    ["Theory", Math.min(96, 40 + exercises * 15)],
    ["Rhythm", Math.min(96, 55 + streak)],
  ] as const;
  return (
    <section className="card">
      <div className="card-header"><div className="card-title">My skills</div><span className="level-badge">Lv.{level}</span></div>
      {skillRows.map(([label, value]) => (
        <div className="srow" key={label}>
          <div className="sname">{label}</div>
          <div className="pbar"><div className={`pbar-fill ${value >= 75 ? "green" : value >= 50 ? "gold" : ""}`} style={{ width: `${value}%` }} /></div>
          <div className="sval">{value}%</div>
        </div>
      ))}
      <div className="card-title mt-12">Monthly stats</div>
      <div className="grid2 compact-grid">
        <Metric label="Videos" value={`${videos}`} sub="In library" tone="cyan" />
        <Metric label="Exercises" value={`${exercises}`} sub="Notation" tone="green" />
      </div>
    </section>
  );
}

function HeatGrid({ weekPractice, todayIndex }: { weekPractice: number[]; todayIndex: number }) {
  return (
    <div className="heat-grid">
      {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => {
        const minutes = weekPractice[index] ?? 0;
        const level = minutes === 0 ? 0 : minutes < 20 ? 1 : minutes < 35 ? 2 : 3;
        return (
          <div className="heat-day" key={`${day}-${index}`}>
            <div className="heat-lbl">{day}</div>
            <div className={`heat-box heat-${level} ${index === todayIndex ? "heat-today" : ""}`}>{minutes || ""}</div>
          </div>
        );
      })}
    </div>
  );
}
