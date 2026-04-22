"use client";

import { useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { useRepository } from "@/lib/useRepository";

const FALLBACK_VIDEO = "https://www.w3schools.com/html/mov_bbb.mp4";
const FALLBACK_POSTER =
  "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217";

export default function AdminPage() {
  const { repository, refresh } = useRepository();
  const [studentCrmId, setStudentCrmId] = useState("crm-alex");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("cat-tutorial");
  const [showArchived, setShowArchived] = useState(true);

  const videos = repository.listVideosForStudent(studentCrmId, {
    includeArchived: showArchived,
  });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Admin Command Center (Mock)</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Admin can upload, archive, restore, and delete student-attached videos.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Student
            <select
              className="ui-select mt-1 w-full rounded-lg px-2 py-1"
              value={studentCrmId}
              onChange={(event) => setStudentCrmId(event.target.value)}
            >
              {repository.listStudents().map((student) => (
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
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Weekly retention check-in"
              className="ui-input mt-1 w-full rounded-lg px-2 py-1"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!title.trim()) return;
            repository.addVideo({
              studentCrmId,
              lessonId: null,
              categoryId,
              title: title.trim(),
              playbackUrl: FALLBACK_VIDEO,
              thumbnailUrl: FALLBACK_POSTER,
              durationSec: 10,
              uploaderRole: "admin",
            });
            setTitle("");
            refresh();
          }}
          className="ui-button-primary mt-4 rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Add Admin Upload
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Video Inventory</h2>
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
              <VideoCard video={video} href={`/student/videos/${video.id}`} />
              <div className="flex flex-wrap gap-2">
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
                <button
                  type="button"
                  onClick={() => {
                    repository.deleteVideo(video.id);
                    refresh();
                  }}
                  className="ui-button-danger rounded-md px-3 py-1 text-xs font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
