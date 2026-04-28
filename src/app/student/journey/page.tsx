"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import type { LessonSummary, StudentMilestone, StudentVideo } from "@/lib/domain/types";
import { useRepository } from "@/lib/useRepository";

type JourneyNode =
  | { kind: "lesson"; at: string; title: string; href: string; sub: string }
  | { kind: "milestone"; at: string; title: string; sub: string }
  | { kind: "video"; at: string; title: string; href: string; sub: string };

function mergeJourney(
  lessons: LessonSummary[],
  milestones: StudentMilestone[],
  videos: StudentVideo[],
): JourneyNode[] {
  const nodes: JourneyNode[] = [];
  for (const lesson of lessons) {
    nodes.push({
      kind: "lesson",
      at: `${lesson.scheduledDate}T12:00:00.000Z`,
      title: lesson.title,
      href: `/student/lessons/${lesson.id}`,
      sub: `Lesson ${lesson.lessonNumber} · ${lesson.instrument}`,
    });
  }
  for (const ms of milestones) {
    nodes.push({
      kind: "milestone",
      at: ms.achievedAt,
      title: ms.label,
      sub: `Badge · ${ms.conceptKey}`,
    });
  }
  for (const video of videos.slice(0, 8)) {
    nodes.push({
      kind: "video",
      at: video.createdAt,
      title: video.title,
      href: video.lessonId
        ? `/student/lessons/${video.lessonId}?v=${encodeURIComponent(video.id)}`
        : `/student/videos/${video.id}`,
      sub: `${video.uploaderRole} clip`,
    });
  }
  return nodes.sort((a, b) => a.at.localeCompare(b.at));
}

function formatNodeDate(at: string) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StudentJourneyInner() {
  const searchParams = useSearchParams();
  const crm = searchParams.get("student") ?? "crm-alex";
  const { repository, version } = useRepository();

  const { student, timeline } = useMemo(() => {
    void version;
    const s = repository.getStudent(crm) ?? repository.listStudents()[0];
    if (!s) return { student: undefined as undefined, timeline: [] as JourneyNode[] };
    const lessons = repository.listLessonsForStudent(s.crmId);
    const milestones = repository.listMilestones(s.crmId);
    const videos = repository.listVideosForStudent(s.crmId);
    return { student: s, timeline: mergeJourney(lessons, milestones, videos) };
  }, [crm, repository, version]);

  return (
    <div className="relative min-h-screen bg-slate-100 pb-16 pt-6 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/student" className="text-sm font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-300">
              ← Back to studio
            </Link>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Your journey</h1>
            {student ? <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{student.displayName}</p> : null}
          </div>
        </div>

        <p className="mb-6 max-w-2xl text-sm text-slate-600 dark:text-zinc-400">
          A horizontal timeline of lessons, unlocked milestones, and highlighted videos (mock ordering by dates).
        </p>

        <div className="journey-rail rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-zinc-900/50">
          {timeline.map((node, i) => (
            <div
              key={`${node.kind}-${node.at}-${i}`}
              className={`journey-node ${node.kind === "milestone" ? "milestone" : ""}`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
                {node.kind === "lesson" ? "Lesson" : node.kind === "milestone" ? "Milestone" : "Video"}
              </div>
              <div className="mt-1 text-xs text-violet-600 dark:text-violet-300">{formatNodeDate(node.at)}</div>
              <div className="mt-2 text-sm font-semibold leading-snug">
                {node.kind === "milestone" ? node.title : (
                  <Link className="text-violet-700 underline-offset-2 hover:underline dark:text-violet-200" href={node.href}>
                    {node.title}
                  </Link>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{node.sub}</div>
            </div>
          ))}
          {!timeline.length ? <p className="empty-copy px-4 py-8">Nothing on the timeline yet.</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function StudentJourneyPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-600">Loading…</p>}>
      <StudentJourneyInner />
    </Suspense>
  );
}
