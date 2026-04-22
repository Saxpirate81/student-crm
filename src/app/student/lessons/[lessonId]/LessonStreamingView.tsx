"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { NetflixScrollRow } from "@/components/student/NetflixScrollRow";
import { RailVideoPoster } from "@/components/student/RailVideoPoster";
import { StudentVideoTheater } from "@/components/student/StudentVideoTheater";
import type { LessonSummary, StudentVideo } from "@/lib/domain/types";
import { useRepository } from "@/lib/useRepository";

function partitionLessonVideos(
  all: StudentVideo[],
  lesson: LessonSummary,
  chronLessons: LessonSummary[],
) {
  const idx = chronLessons.findIndex((l) => l.id === lesson.id);
  const neighborIds = new Set<string>();
  if (idx > 0) neighborIds.add(chronLessons[idx - 1].id);
  if (idx >= 0 && idx < chronLessons.length - 1) neighborIds.add(chronLessons[idx + 1].id);

  const forThisLesson = all.filter((v) => v.lessonId === lesson.id);
  const forNeighbors = all.filter((v) => v.lessonId && neighborIds.has(v.lessonId));
  const general = all.filter((v) => v.lessonId === null);

  const neighborDedup = forNeighbors.filter((v) => v.lessonId !== lesson.id);

  return { forThisLesson, neighborDedup, general };
}

export function LessonStreamingView() {
  const { repository, version } = useRepository();
  const params = useParams<{ lessonId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vParam = searchParams.get("v");

  const lessonId = params.lessonId ?? "";

  const lesson = useMemo(() => {
    void version;
    return repository.getLesson(lessonId);
  }, [repository, lessonId, version]);

  const { forThisLesson, neighborDedup, general, student, chronLessons } = useMemo(() => {
    void version;
    if (!lesson) {
      return {
        forThisLesson: [] as StudentVideo[],
        neighborDedup: [] as StudentVideo[],
        general: [] as StudentVideo[],
        student: undefined,
        chronLessons: [] as LessonSummary[],
      };
    }
    const s = repository.getStudent(lesson.studentCrmId);
    const chron = [...repository.listLessonsForStudent(lesson.studentCrmId, lesson.program)].sort(
      (a, b) => a.scheduledDate.localeCompare(b.scheduledDate),
    );
    const all = repository.listVideosForStudent(lesson.studentCrmId);
    const parts = partitionLessonVideos(all, lesson, chron);
    return { ...parts, student: s, chronLessons: chron };
  }, [lesson, repository, version]);

  const selectedVideo = useMemo(() => {
    if (!lesson || !vParam) return null;
    const vid = repository.getVideo(vParam);
    if (!vid || vid.studentCrmId !== lesson.studentCrmId) return null;
    return vid;
  }, [lesson, repository, vParam]);

  useEffect(() => {
    if (!lesson) return;
    if (vParam) {
      const vid = repository.getVideo(vParam);
      if (!vid || vid.studentCrmId !== lesson.studentCrmId) {
        const first = forThisLesson[0] ?? neighborDedup[0] ?? general[0];
        if (first) router.replace(`${pathname}?v=${encodeURIComponent(first.id)}`, { scroll: false });
        else router.replace(pathname, { scroll: false });
      }
      return;
    }
    const first = forThisLesson[0] ?? neighborDedup[0] ?? general[0];
    if (first) router.replace(`${pathname}?v=${encodeURIComponent(first.id)}`, { scroll: false });
  }, [lesson, vParam, pathname, router, repository, forThisLesson, neighborDedup, general]);

  const setVideo = (id: string) => {
    router.replace(`${pathname}?v=${encodeURIComponent(id)}`, { scroll: false });
  };

  if (!lesson) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-3xl border border-amber-500/20 bg-amber-950/40 p-8 text-center">
        <h1 className="text-lg font-semibold text-amber-100">Lesson not found</h1>
        <p className="text-sm text-amber-200/80">That lesson may have been removed or the link is incorrect.</p>
        <Link
          href="/student"
          className="inline-flex rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-400"
        >
          Back to schedule
        </Link>
      </div>
    );
  }

  const programLabel =
    lesson.program === "lessons" ? "Private lessons" : lesson.program === "bands" ? "Bands" : "Camps";

  return (
    <div className="relative left-1/2 w-screen max-w-none -translate-x-1/2 bg-slate-100 pb-20 pt-1 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 md:pb-28">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(52vh,520px)] bg-[radial-gradient(ellipse_90%_100%_at_50%_-10%,rgba(139,92,246,0.18),transparent_55%),radial-gradient(ellipse_60%_80%_at_100%_0%,rgba(59,130,246,0.08),transparent_50%),radial-gradient(ellipse_50%_60%_at_0%_20%,rgba(244,114,182,0.06),transparent_45%)] dark:bg-[radial-gradient(ellipse_90%_100%_at_50%_-10%,rgba(139,92,246,0.35),transparent_55%),radial-gradient(ellipse_60%_80%_at_100%_0%,rgba(59,130,246,0.12),transparent_50%),radial-gradient(ellipse_50%_60%_at_0%_20%,rgba(244,114,182,0.1),transparent_45%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-4 md:px-8 lg:max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-8 pt-4 md:pb-10 md:pt-6">
          <div className="min-w-0 space-y-3">
            <Link
              href="/student"
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-violet-700 transition hover:text-violet-600 dark:text-violet-300/90 dark:hover:text-violet-200"
            >
              ← Schedule
            </Link>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-300/90 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                Lesson {lesson.lessonNumber}
              </span>
              <span className="rounded-full border border-slate-300/90 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                {lesson.instrument}
              </span>
              <span className="rounded-full border border-violet-400/40 bg-violet-100 px-3 py-1 text-[11px] font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200">
                {programLabel}
              </span>
              <span className="rounded-full border border-slate-300/90 bg-white px-3 py-1 text-[11px] font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                {lesson.scheduledDate}
              </span>
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-white md:text-4xl lg:text-5xl">
              {lesson.title}
            </h1>
            {student ? (
              <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">{student.displayName}</p>
            ) : null}
            {lesson.notes ? (
              <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-zinc-400 md:text-base">{lesson.notes}</p>
            ) : null}
          </div>
        </header>

        {selectedVideo ? (
          <div className="pb-4 md:pb-6">
            <StudentVideoTheater video={selectedVideo} hideMetronomePanel />
          </div>
        ) : (
          <div className="mb-10 flex aspect-video max-w-4xl items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/70 text-center dark:border-white/15 dark:bg-zinc-900/50">
            <div className="px-6">
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400">No video selected</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Choose a thumbnail below to start watching.</p>
            </div>
          </div>
        )}

        {forThisLesson.length > 0 ? (
          <NetflixScrollRow
            title="This lesson"
            description="Clips your instructor tied to this visit — swipe sideways for more."
          >
            {forThisLesson.map((video) => (
              <RailVideoPoster
                key={video.id}
                video={video}
                selected={selectedVideo?.id === video.id}
                onSelect={setVideo}
              />
            ))}
          </NetflixScrollRow>
        ) : (
          <div className="rounded-2xl border border-slate-300/90 bg-white/70 px-5 py-8 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">No videos are linked to this lesson yet.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Browse nearby or general rows when available.</p>
          </div>
        )}

        {neighborDedup.length > 0 ? (
          <NetflixScrollRow
            title="Nearby on your calendar"
            description="From the lesson just before or after this one."
          >
            {neighborDedup.map((video) => (
              <RailVideoPoster
                key={video.id}
                video={video}
                selected={selectedVideo?.id === video.id}
                onSelect={setVideo}
              />
            ))}
          </NetflixScrollRow>
        ) : null}

        {general.length > 0 ? (
          <NetflixScrollRow
            title="General tutorials"
            description="Warmups and extras on your profile."
          >
            {general.map((video) => (
              <RailVideoPoster
                key={video.id}
                video={video}
                selected={selectedVideo?.id === video.id}
                onSelect={setVideo}
              />
            ))}
          </NetflixScrollRow>
        ) : null}

        {chronLessons.length > 1 ? (
          <NetflixScrollRow title="More lessons" description="Jump to another week in this program.">
            {chronLessons.map((l) => (
              <Link
                key={l.id}
                href={`/student/lessons/${l.id}`}
                scroll={false}
                className={`snap-start shrink-0 scroll-ml-1 rounded-2xl border px-5 py-6 transition md:min-w-[200px] ${
                  l.id === lesson.id
                    ? "border-violet-400/50 bg-violet-100 text-violet-900 ring-1 ring-violet-400/40 dark:bg-violet-500/20 dark:text-white"
                    : "border-slate-300/90 bg-white/75 text-slate-700 hover:border-slate-400 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Lesson</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">#{l.lessonNumber}</p>
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-zinc-400">{l.scheduledDate}</p>
                <p className="mt-2 line-clamp-2 text-left text-[13px] leading-snug text-slate-600 dark:text-zinc-300">{l.title}</p>
              </Link>
            ))}
          </NetflixScrollRow>
        ) : null}

        <footer className="mt-12 border-t border-slate-300/80 pt-8 dark:border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Lesson record</p>
          <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2 md:grid-cols-3">
            <div>
              <dt className="text-slate-500 dark:text-zinc-500">Lesson ID</dt>
              <dd className="mt-0.5 font-mono text-slate-700 dark:text-zinc-300">{lesson.id}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-zinc-500">Program</dt>
              <dd className="mt-0.5 font-medium text-slate-700 dark:text-zinc-200">{lesson.program}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-zinc-500">Student CRM</dt>
              <dd className="mt-0.5 font-mono text-slate-700 dark:text-zinc-300">{lesson.studentCrmId}</dd>
            </div>
          </dl>
        </footer>
      </div>
    </div>
  );
}
