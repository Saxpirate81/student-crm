"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProgramTabs } from "@/components/ProgramTabs";
import { VideoCard } from "@/components/VideoCard";
import type { ProgramType } from "@/lib/domain/types";
import { useAuth } from "@/lib/auth/auth-context";
import { useRepository } from "@/lib/useRepository";

export default function StudentPage() {
  const { session, ready } = useAuth();
  const { repository, version } = useRepository();
  const [studentCrmId, setStudentCrmId] = useState("crm-alex");

  const selectableStudents = useMemo(() => {
    void version;
    const all = repository.listStudents();
    if (session?.kind === "parent") {
      return all.filter((row) => row.parentCrmId === session.parentCrmId);
    }
    return all;
  }, [repository, session, version]);

  useEffect(() => {
    if (!ready) return;
    if (session?.kind === "child") {
      setStudentCrmId(session.studentCrmId);
      return;
    }
    if (session?.kind === "parent") {
      if (!selectableStudents.length) return;
      setStudentCrmId((prev) => {
        const allowed = new Set(selectableStudents.map((row) => row.crmId));
        if (allowed.has(prev)) return prev;
        return selectableStudents[0].crmId;
      });
    }
  }, [ready, session, selectableStudents]);

  const programs = repository.listProgramsForStudent(studentCrmId);
  const [activeProgram, setActiveProgram] = useState<ProgramType>(programs[0] ?? "lessons");

  useEffect(() => {
    const next = repository.listProgramsForStudent(studentCrmId);
    setActiveProgram((prev) => (next.includes(prev) ? prev : next[0] ?? "lessons"));
  }, [studentCrmId, repository, version]);

  const lessons = repository.listLessonsForStudent(studentCrmId, activeProgram);
  const allVideos = repository.listVideosForStudent(studentCrmId);

  const student = repository.getStudent(studentCrmId);

  if (ready && session?.kind === "parent" && !selectableStudents.length) {
    return (
      <div className="rounded-3xl border border-amber-200/80 bg-amber-50/90 p-8 text-center dark:border-amber-500/25 dark:bg-amber-950/30">
        <h1 className="text-xl font-black text-amber-950 dark:text-amber-100">No student profiles yet</h1>
        <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
          Add a family member with a screen name and password from the parent view, then return here.
        </p>
        <Link
          href="/parent"
          className="mt-5 inline-flex rounded-xl bg-amber-800 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          Open parent view
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Branded hero — reads as “premium studio” in any app theme */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-2xl shadow-indigo-950/40 sm:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-200/90">
              Your practice space
            </p>
            <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              {student ? student.displayName.split(" ")[0] : "Student"}, keep the streak alive.
            </h1>
            <p className="text-sm leading-relaxed text-slate-300/95">
              Lessons, milestones, and tutorials in one place. Pick up where you left off — playback
              speed and position save per video.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            {session?.kind === "child" ? (
              <p className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Signed in as{" "}
                <span className="text-white normal-case">{session.screenName}</span>
              </p>
            ) : (
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Profile
                <select
                  value={studentCrmId}
                  disabled={session?.kind === "parent" && !selectableStudents.length}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setStudentCrmId(nextId);
                    const nextPrograms = repository.listProgramsForStudent(nextId);
                    setActiveProgram(nextPrograms[0] ?? "lessons");
                  }}
                  className="mt-1 block w-full min-w-[200px] rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm font-semibold text-white outline-none ring-indigo-400/0 transition focus:ring-2 focus:ring-indigo-400/60 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {(session?.kind === "parent" ? selectableStudents : repository.listStudents()).map((entry) => (
                    <option key={entry.crmId} value={entry.crmId} className="text-slate-900">
                      {entry.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-lg shadow-slate-900/[0.04] backdrop-blur-xl dark:shadow-black/30 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              Schedule
            </h2>
            <p className="text-sm text-[var(--muted)]">Programs you are enrolled in right now.</p>
          </div>
        </div>

        <div className="mt-5">
          <ProgramTabs
            programs={programs.length ? programs : ["lessons"]}
            activeProgram={activeProgram}
            onChange={setActiveProgram}
          />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {lessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/student/lessons/${lesson.id}`}
              className="group block rounded-2xl border border-slate-200/80 bg-white/60 outline-none transition hover:border-indigo-300/80 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:border-white/10 dark:bg-slate-900/40 dark:hover:border-indigo-500/40 dark:focus-visible:ring-indigo-400/50"
            >
              <article className="relative overflow-hidden p-4">
                <div className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-fuchsia-500 opacity-90" />
                <p className="pl-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Lesson {lesson.lessonNumber} · {lesson.instrument}
                </p>
                <h3 className="mt-1 pl-3 text-base font-bold text-slate-900 dark:text-slate-50">
                  {lesson.title}
                </h3>
                <p className="mt-1 pl-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {lesson.scheduledDate}
                </p>
                <p className="mt-2 pl-3 text-[10px] font-bold uppercase tracking-wider text-indigo-600 opacity-0 transition group-hover:opacity-100 dark:text-indigo-300">
                  View videos →
                </p>
              </article>
            </Link>
          ))}
          {!lessons.length && (
            <p className="text-sm text-[var(--muted)]">No lessons for this program.</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
              Watch next
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {student ? `Personal reel for ${student.displayName}` : "Your video library"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              href={
                video.lessonId
                  ? `/student/lessons/${video.lessonId}?v=${encodeURIComponent(video.id)}`
                  : `/student/videos/${video.id}`
              }
              subtitle={video.lessonId ? "Open in lesson player" : "Open player + tools"}
            />
          ))}
        </div>
        {!allVideos.length && (
          <p className="text-sm text-[var(--muted)]">No active videos yet.</p>
        )}
      </section>

      <div className="text-center sm:text-left">
        <Link
          href="/instructor"
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
        >
          Instructor upload desk
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
