"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExerciseCard } from "@/components/music/ExerciseCard";
import { StudioThread } from "@/components/studio/StudioThread";
import type { LessonSummary } from "@/lib/domain/types";
import { getPracticePlanForLesson } from "@/lib/practice-loop";
import type { ScheduleBlock } from "@/lib/ops-roster/schedule";
import { isLessonComplete, LESSON_STATUS_EVENT, markLessonComplete } from "@/lib/ops-roster/session-status";
import type { StudioRole } from "@/lib/ops-roster/session-href";
import { useRepository } from "@/lib/useRepository";

type Props = {
  block: ScheduleBlock;
  role: StudioRole;
};

function syntheticLesson(block: ScheduleBlock): LessonSummary {
  return {
    id: `att:${block.id}`,
    studentCrmId: block.studentId,
    program: "lessons",
    title: block.description || "Lesson",
    scheduledDate: block.date,
    lessonNumber: Number(block.date.slice(5, 7) + block.date.slice(8, 10)) || 1,
    instrument: block.description || "Lesson",
    notes: `${block.startLabel}–${block.endLabel}${block.location ? ` · ${block.location}` : ""}`,
  };
}

export function SessionWorkspace({ block, role }: Props) {
  const { repository, version, loading } = useRepository();
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const sync = () => setComplete(isLessonComplete(block));
    sync();
    window.addEventListener(LESSON_STATUS_EVENT, sync);
    return () => window.removeEventListener(LESSON_STATUS_EVENT, sync);
  }, [block]);

  const student = repository.getStudent(block.studentId);
  const lessons = useMemo(() => {
    void version;
    return student ? repository.listLessonsForStudent(student.crmId) : [];
  }, [repository, student, version]);
  const lesson =
    lessons.find((row) => row.scheduledDate === block.date) ??
    lessons[0] ??
    syntheticLesson(block);
  const videos = useMemo(() => {
    void version;
    return student ? repository.listVideosForStudent(student.crmId) : [];
  }, [repository, student, version]);
  const exercises = useMemo(() => {
    void version;
    return student ? repository.listExercisesForStudent(student.crmId) : [];
  }, [repository, student, version]);
  const plan = getPracticePlanForLesson(lesson, student?.ageBand ?? "13to18");
  const canComplete = role === "instructor" && !complete;

  return (
    <div className="session-workspace">
      <header className="session-hero">
        <div className="session-hero-copy">
          <p className="card-title">{block.instructorName}</p>
          <h1>{block.studentName}</h1>
          <p>
            {block.startLabel}–{block.endLabel} · {block.description}
            {block.location ? ` · ${block.location}` : ""}
          </p>
        </div>
        <div className="session-hero-actions">
          <span className={`badge ${complete ? "b-green" : "b-gold"}`}>{complete ? "Complete" : block.status || "Scheduled"}</span>
          {canComplete ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                markLessonComplete(block);
                setComplete(true);
              }}
            >
              Mark complete
            </button>
          ) : null}
        </div>
      </header>

      <div className="session-grid">
        <section className="session-card">
          <div className="session-card-head">
            <p className="card-title">Practice</p>
            <h2>{plan.title}</h2>
            <p className="session-card-sub">{plan.recap}</p>
          </div>
          <ul className="session-plan">
            {plan.items.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>
                  {item.minutes} min · {item.detail}
                </span>
              </li>
            ))}
          </ul>
          {role === "student" ? (
            <Link href="/student/practice" className="btn btn-secondary btn-sm">
              Open full practice
            </Link>
          ) : null}
        </section>

        <section className="session-card">
          <div className="session-card-head">
            <p className="card-title">Videos</p>
          </div>
          {videos.length ? (
            <div className="session-video-list">
              {videos.slice(0, 6).map((video) => (
                <Link key={video.id} href={`/student/videos/${video.id}`} className="session-video-row">
                  <strong>{video.title}</strong>
                  <span>{video.uploaderRole}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="session-empty">{loading ? "Loading…" : "No lesson videos yet."}</p>
          )}
        </section>

        <section className="session-card">
          <div className="session-card-head">
            <p className="card-title">Exercises</p>
          </div>
          {exercises.length ? (
            <div className="session-exercise-list">
              {exercises.slice(0, 4).map((exercise) => (
                <ExerciseCard key={exercise.id} exercise={exercise} />
              ))}
            </div>
          ) : (
            <p className="session-empty">No notation exercises assigned yet.</p>
          )}
        </section>

        <section className="session-card">
          <div className="session-card-head">
            <p className="card-title">Lesson notes</p>
          </div>
          <p className="session-notes">{lesson.notes || "No notes on this visit yet."}</p>
        </section>

        <div className="session-grid-span">
          <StudioThread
            threadId={`lesson:${block.id}`}
            fromRole={role}
            title="Lesson messages"
            subtitle="Teacher ↔ student, and teacher ↔ parent. Quincy can clean up spelling, grammar, and bullets before you send."
          />
        </div>
      </div>
    </div>
  );
}
