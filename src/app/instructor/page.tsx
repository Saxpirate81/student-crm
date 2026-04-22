"use client";

import { useState } from "react";
import { ExerciseCard } from "@/components/music/ExerciseCard";
import { ExerciseStaffComposer } from "@/components/music/ExerciseStaffComposer";
import { VideoCard } from "@/components/VideoCard";
import { INSTRUMENT_OPTIONS } from "@/lib/music/notation";
import { useRepository } from "@/lib/useRepository";

const FALLBACK_VIDEO = "https://www.w3schools.com/html/mov_bbb.mp4";
const FALLBACK_POSTER =
  "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217";

export default function InstructorPage() {
  const { repository, refresh } = useRepository();
  const [studentCrmId, setStudentCrmId] = useState("crm-alex");
  const [videoTitle, setVideoTitle] = useState("");
  const [categoryId, setCategoryId] = useState("cat-milestone");
  const [showArchived, setShowArchived] = useState(false);
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

  const roster = repository
    .listStudents()
    .filter((student) => student.primaryInstructorId === "instr-morgan");

  const videos = repository.listVideosForStudent(studentCrmId, {
    includeArchived: showArchived,
  });
  const lessons = repository.listLessonsForStudent(studentCrmId);
  const exercises = repository.listExercisesForStudent(studentCrmId);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Instructor Workstation</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Upload videos to specific students and archive clips when needed.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Student
            <select
              className="ui-select mt-1 w-full rounded-lg px-2 py-1"
              value={studentCrmId}
              onChange={(event) => setStudentCrmId(event.target.value)}
            >
              {roster.map((student) => (
                <option key={student.crmId} value={student.crmId}>
                  {student.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Category
            <select
              className="ui-select mt-1 w-full rounded-lg px-2 py-1"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {repository.listCategories().map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">
            Video Title
            <input
              value={videoTitle}
              onChange={(event) => setVideoTitle(event.target.value)}
              placeholder="e.g. Lesson 12 tutorial take"
              className="ui-input mt-1 w-full rounded-lg px-2 py-1"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
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
          }}
          className="ui-button-primary mt-4 rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Add Mock Upload
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Notation Exercises</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Add notes/rests directly on measures. Add another measure to continue writing to the right.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Exercise title
            <input
              value={exerciseTitle}
              onChange={(event) => setExerciseTitle(event.target.value)}
              className="ui-input mt-1 w-full rounded-lg px-2 py-1"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Lesson
            <select
              value={exerciseLessonId}
              onChange={(event) => setExerciseLessonId(event.target.value)}
              className="ui-select mt-1 w-full rounded-lg px-2 py-1"
            >
              <option value="none">General (not tied to one lesson)</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  Lesson {lesson.lessonNumber}: {lesson.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Instrument
            <select
              value={exerciseInstrument}
              onChange={(event) => setExerciseInstrument(event.target.value as (typeof INSTRUMENT_OPTIONS)[number]["value"])}
              className="ui-select mt-1 w-full rounded-lg px-2 py-1"
            >
              {INSTRUMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Tempo (BPM)
            <input
              type="number"
              min={40}
              max={220}
              value={exerciseTempo}
              onChange={(event) => setExerciseTempo(Number.parseInt(event.target.value || "90", 10))}
              className="ui-input mt-1 w-full rounded-lg px-2 py-1"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2">
            Staff composer
            <div className="mt-1">
              <ExerciseStaffComposer onChange={setExerciseNotes} />
            </div>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
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
            }}
            className="ui-button-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Save exercise
          </button>
          {exerciseMessage ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">{exerciseMessage}</p>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {exercises.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
          {exercises.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No exercises yet for this student.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Student Video Queue</h2>
          <label className="text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="mr-2"
            />
            Show archived
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <div key={video.id} className="space-y-2">
              <VideoCard video={video} href={`/student/videos/${video.id}`} subtitle="Open player" />
              <div className="flex gap-2">
                {video.archivedAt ? (
                  <button
                    type="button"
                    onClick={() => {
                      repository.unarchiveVideo(video.id);
                      refresh();
                    }}
                    className="ui-button-secondary rounded-md px-3 py-1 text-xs font-semibold"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      repository.archiveVideo(video.id);
                      refresh();
                    }}
                    className="ui-button-secondary rounded-md px-3 py-1 text-xs font-semibold"
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
