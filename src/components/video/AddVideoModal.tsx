"use client";

import { useMemo, useRef, useState } from "react";
import type { AddVideoInput } from "@/lib/data/repository";
import type { LessonSummary, MediaCategory, StudentVideo, UploaderRole } from "@/lib/domain/types";
import { parseYouTubeVideoId, youTubeEmbedUrl, youTubeThumbUrl } from "@/lib/youtube";

type VideoSource = "record" | "upload" | "url" | "library";

export type VideoAssignmentOption = {
  id: string;
  lessonId: string | null;
  title: string;
};

type Props = {
  categories: MediaCategory[];
  lessons: LessonSummary[];
  assignments?: VideoAssignmentOption[];
  savedVideos: StudentVideo[];
  studentCrmId: string;
  uploaderRole: UploaderRole;
  initialLessonId?: string | null;
  initialAssignmentId?: string | null;
  initialAssignmentTitle?: string | null;
  onClose: () => void;
  onSave: (input: AddVideoInput) => void;
};

const FALLBACK_POSTER = "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217";
const FALLBACK_VIDEO = "https://www.w3schools.com/html/mov_bbb.mp4";

function newestLesson(lessons: LessonSummary[]) {
  return [...lessons].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))[0] ?? null;
}

function sortedLessonOptions(lessons: LessonSummary[]) {
  const today = newestLesson(lessons);
  const rest = lessons
    .filter((lesson) => lesson.id !== today?.id)
    .sort((a, b) => b.title.localeCompare(a.title));
  return today ? [today, ...rest] : rest;
}

function sourceLabel(source: VideoSource) {
  if (source === "record") return "Record using device";
  if (source === "upload") return "Upload from this device";
  if (source === "url") return "Add URL";
  return "Saved videos";
}

export function AddVideoModal({
  categories,
  lessons,
  assignments = [],
  savedVideos,
  studentCrmId,
  uploaderRole,
  initialLessonId = null,
  initialAssignmentId = null,
  initialAssignmentTitle = null,
  onClose,
  onSave,
}: Props) {
  const lessonOptions = useMemo(() => sortedLessonOptions(lessons), [lessons]);
  const latestLesson = lessonOptions[0] ?? null;
  const [source, setSource] = useState<VideoSource>("upload");
  const [title, setTitle] = useState(initialAssignmentTitle ? `${initialAssignmentTitle} support video` : "");
  const [description, setDescription] = useState(initialAssignmentTitle ? `Attached to assignment: ${initialAssignmentTitle}` : "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "cat-milestone");
  const [attachToLesson, setAttachToLesson] = useState(Boolean(initialLessonId));
  const [lessonId, setLessonId] = useState(initialLessonId ?? latestLesson?.id ?? "none");
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId ?? "none");
  const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
  const [url, setUrl] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [recordedUrl, setRecordedUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedLibraryVideoId, setSelectedLibraryVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const selectedLesson = lessons.find((lesson) => lesson.id === lessonId) ?? null;
  const lessonAssignments = assignments.filter((assignment) => assignment.lessonId === lessonId);
  const selectedAssignment = assignments.find((assignment) => assignment.id === assignmentId);
  const selectedLibraryVideo = savedVideos.find((video) => video.id === selectedLibraryVideoId) ?? null;
  const matchingVideos = savedVideos.filter((video) => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return true;
    return `${video.title} ${video.description ?? ""}`.toLowerCase().includes(q);
  });

  const startRecording = async () => {
    setStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setStatus("Camera or microphone permission was blocked. Try upload or URL instead.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const onLocalFile = (file: File | null) => {
    if (!file) return;
    setLocalPreviewUrl(URL.createObjectURL(file));
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    setStatus("Local preview ready. In production this should queue compression/transcoding before storage.");
  };

  const buildAssignmentTitle = () => {
    if (newAssignmentTitle.trim()) return newAssignmentTitle.trim();
    return selectedAssignment?.title ?? initialAssignmentTitle ?? null;
  };

  const save = () => {
    const attachedLessonId = attachToLesson && lessonId !== "none" ? lessonId : null;
    const assignmentTitle = buildAssignmentTitle();
    if (source === "library") {
      if (!selectedLibraryVideo) {
        setStatus("Choose a saved video first.");
        return;
      }
      onSave({
        studentCrmId,
        lessonId: attachedLessonId,
        assignmentId: assignmentId === "none" ? initialAssignmentId ?? null : assignmentId,
        assignmentTitle,
        categoryId,
        title: selectedLibraryVideo.title,
        description: selectedLibraryVideo.description ?? (description.trim() || null),
        playbackUrl: selectedLibraryVideo.playbackUrl,
        thumbnailUrl: selectedLibraryVideo.thumbnailUrl,
        durationSec: selectedLibraryVideo.durationSec,
        uploaderRole,
        sourceType: "library",
        compressionStatus: "compressed",
      });
      onClose();
      return;
    }

    if (!title.trim()) {
      setStatus("Add a video title.");
      return;
    }

    let playbackUrl = localPreviewUrl || recordedUrl || FALLBACK_VIDEO;
    let thumbnailUrl = FALLBACK_POSTER;
    if (source === "url") {
      const yt = parseYouTubeVideoId(url);
      if (!yt && !url.trim()) {
        setStatus("Paste a video URL.");
        return;
      }
      playbackUrl = yt ? youTubeEmbedUrl(yt) : url.trim();
      thumbnailUrl = yt ? youTubeThumbUrl(yt) : FALLBACK_POSTER;
    }
    if (source === "record" && !recordedUrl) {
      setStatus("Record a clip first, or choose another source.");
      return;
    }
    if (source === "upload" && !localPreviewUrl) {
      setStatus("Choose a local video file first.");
      return;
    }

    onSave({
      studentCrmId,
      lessonId: attachedLessonId,
      assignmentId: assignmentId === "none" ? initialAssignmentId ?? null : assignmentId,
      assignmentTitle,
      categoryId,
      title: title.trim(),
      description: description.trim() || null,
      playbackUrl,
      thumbnailUrl,
      durationSec: source === "url" ? 180 : 60,
      uploaderRole,
      sourceType: source,
      compressionStatus: source === "url" ? "compressed" : "queued",
    });
    onClose();
  };

  return (
    <div className="av-overlay" role="presentation" onMouseDown={onClose}>
      <section className="av-modal" role="dialog" aria-modal="true" aria-label="Add video" onMouseDown={(event) => event.stopPropagation()}>
        <header className="av-head">
          <div>
            <p className="card-title">Video workflow</p>
            <h2>Add video</h2>
            <p>Record, upload, paste a URL, or reuse a saved instructor video. Files are marked for compression before database storage.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close add video">
            ×
          </button>
        </header>

        <div className="av-body">
          <div className="av-source-grid" role="tablist" aria-label="Video source">
            {(["record", "upload", "url", "library"] as VideoSource[]).map((item) => (
              <button key={item} className={`av-source ${source === item ? "active" : ""}`} type="button" onClick={() => setSource(item)}>
                <span>{sourceLabel(item)}</span>
                <small>
                  {item === "record"
                    ? "Camera + mic"
                    : item === "upload"
                      ? "Device file"
                      : item === "url"
                        ? "YouTube or link"
                        : "Account library"}
                </small>
              </button>
            ))}
          </div>

          {source === "record" ? (
            <div className="av-panel">
              <div className="av-record-preview">{recordedUrl ? <video src={recordedUrl} controls /> : <span>Device recorder preview</span>}</div>
              <div className="modal-acts">
                {!recording ? <button className="btn btn-primary" type="button" onClick={() => void startRecording()}>Record</button> : null}
                {recording ? <button className="btn btn-primary" type="button" onClick={stopRecording}>Stop</button> : null}
              </div>
            </div>
          ) : null}

          {source === "upload" ? (
            <label className="av-drop">
              <input type="file" accept="video/*" onChange={(event) => onLocalFile(event.target.files?.[0] ?? null)} />
              <strong>{localPreviewUrl ? "Local video selected" : "Choose a video from this device"}</strong>
              <span>{localPreviewUrl ? "Preview URL created in this browser session." : "Cloud storage will later compress this file before saving."}</span>
            </label>
          ) : null}

          {source === "url" ? (
            <label className="form-grp">
              <span className="form-lbl">Video URL</span>
              <input className="inp" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://youtube.com/watch?v=..." />
            </label>
          ) : null}

          {source === "library" ? (
            <div className="av-panel">
              <label className="form-grp">
                <span className="form-lbl">Search saved videos</span>
                <input className="inp" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search title or description..." />
              </label>
              <div className="av-library-list">
                {matchingVideos.map((video) => (
                  <button
                    className={`av-library-row ${selectedLibraryVideoId === video.id ? "active" : ""}`}
                    key={video.id}
                    type="button"
                    onClick={() => setSelectedLibraryVideoId(video.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={video.thumbnailUrl} alt="" />
                    <span>
                      <strong>{video.title}</strong>
                      <small>{video.lessonId ? "Attached lesson video" : "General library video"} · {video.uploaderRole}</small>
                    </span>
                  </button>
                ))}
                {!matchingVideos.length ? <p className="empty-copy">No saved videos match that search.</p> : null}
              </div>
            </div>
          ) : null}

          {source !== "library" ? (
            <div className="av-form-grid">
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
                <input className="inp" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Lesson 12 groove checkpoint" />
              </label>
              <label className="form-grp wide">
                <span className="form-lbl">Description</span>
                <textarea className="inp ta" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should the student/instructor know about this video?" />
              </label>
            </div>
          ) : null}

          <div className="av-lesson-box">
            <label className="switch-row">
              <input type="checkbox" checked={attachToLesson} onChange={(event) => setAttachToLesson(event.target.checked)} />
              Add to lesson
            </label>
            {attachToLesson ? (
              <>
                <label className="form-grp">
                  <span className="form-lbl">Lesson</span>
                  <select className="inp" value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
                    {latestLesson ? <option value={latestLesson.id}>Today · Lesson {latestLesson.lessonNumber}: {latestLesson.title}</option> : null}
                    <option value="none">No lesson</option>
                    {lessonOptions
                      .filter((lesson) => lesson.id !== latestLesson?.id)
                      .map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>Lesson {lesson.lessonNumber}: {lesson.title}</option>
                      ))}
                  </select>
                </label>
                {selectedLesson && latestLesson && selectedLesson.id !== latestLesson.id ? (
                  <p className="av-warning">Just a heads up: you are attaching this video to a past lesson.</p>
                ) : null}
                {lessonId !== "none" ? (
                  <div className="av-assignments">
                    <label className="form-grp">
                      <span className="form-lbl">Assignment</span>
                      <select className="inp" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
                        <option value="none">No assignment selected</option>
                        {lessonAssignments.map((assignment) => (
                          <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="form-grp">
                      <span className="form-lbl">Add another assignment</span>
                      <input className="inp" value={newAssignmentTitle} onChange={(event) => setNewAssignmentTitle(event.target.value)} placeholder="Optional assignment title" />
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {status ? <p className="av-status">{status}</p> : null}
        </div>

        <footer className="av-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={save}>Save video</button>
        </footer>
      </section>
    </div>
  );
}
