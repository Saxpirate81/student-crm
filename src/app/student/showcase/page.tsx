"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";
import { isShowcaseTextAllowed } from "@/lib/showcase-moderation";
import { useRepository } from "@/lib/useRepository";

const EMOJIS = ["👏", "🎉", "🔥", "💜"];

export default function StudentShowcasePage() {
  const { repository, refresh, version } = useRepository();
  const { theme } = useCadenzaTheme();
  const [studentCrmId, setStudentCrmId] = useState("crm-alex");
  const [videoId, setVideoId] = useState("");
  const [caption, setCaption] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const students = useMemo(() => {
    void version;
    return repository.listStudents();
  }, [repository, version]);

  const videos = useMemo(() => {
    void version;
    return repository.listVideosForStudent(studentCrmId);
  }, [repository, studentCrmId, version]);

  const posts = useMemo(() => {
    void version;
    return repository.listShowcasePosts();
  }, [repository, version]);

  useEffect(() => {
    if (videos.length && !videos.some((v) => v.id === videoId)) {
      setVideoId(videos[0].id);
    }
  }, [videos, videoId]);

  const publish = () => {
    setMessage(null);
    if (!videoId) {
      setMessage("Pick a video to publish.");
      return;
    }
    if (!isShowcaseTextAllowed(caption)) {
      setMessage("Caption blocked by mock moderation.");
      return;
    }
    try {
      repository.publishShowcasePost({ studentCrmId, videoId, caption: caption.trim() || "Studio clip" });
      setCaption("");
      refresh();
      setMessage("Posted to the studio showcase.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not publish.");
    }
  };

  return (
    <div className="cadenza-app" data-theme={theme}>
      <main className="c-main">
        <div className="topbar">
          <Link className="btn btn-sm" href="/student">
            ← Studio
          </Link>
          <div className="page-title">Studio showcase</div>
        </div>
        <div className="content">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Opt-in publish (mock)</div>
                <div className="section-sub">Share a library clip with emoji reactions and short comments. Mock moderation filters a few words.</div>
              </div>
            </div>
            <div className="instructor-form-grid">
              <label className="form-grp">
                <span className="form-lbl">Student</span>
                <select className="inp" value={studentCrmId} onChange={(e) => setStudentCrmId(e.target.value)}>
                  {students.map((s) => (
                    <option key={s.crmId} value={s.crmId}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-grp wide">
                <span className="form-lbl">Video</span>
                <select className="inp" value={videoId} onChange={(e) => setVideoId(e.target.value)}>
                  <option value="">Select…</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-grp wide">
                <span className="form-lbl">Caption</span>
                <input className="inp" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What did you work on?" />
              </label>
            </div>
            <div className="modal-acts">
              <button type="button" className="btn btn-primary" onClick={publish}>
                Publish
              </button>
            </div>
            {message ? <p className="section-sub">{message}</p> : null}
          </section>

          <section className="card mt-12">
            <div className="card-header">
              <div className="card-title">Feed</div>
            </div>
            {posts.map((post) => {
              const video = repository.getVideo(post.videoId);
              const student = repository.getStudent(post.studentCrmId);
              const draft = commentDrafts[post.id] ?? "";
              return (
                <article key={post.id} className="listen-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge b-purple">{student?.displayName ?? post.studentCrmId}</span>
                    <span className="text-xs text-slate-500">{new Date(post.publishedAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 font-semibold">{post.caption}</p>
                  {video ? (
                    <p className="text-sm text-slate-600 dark:text-zinc-400">Clip: {video.title}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={`${post.id}-${emoji}`}
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          repository.addShowcaseEmojiReaction(post.id, emoji);
                          refresh();
                        }}
                      >
                        {emoji}{" "}
                        {post.reactions.find((r) => r.emoji === emoji)?.count ? `(${post.reactions.find((r) => r.emoji === emoji)?.count})` : ""}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3 dark:border-white/10">
                    {post.textComments.map((c) => (
                      <div key={c.id} className="text-sm">
                        <strong>{c.authorLabel}</strong>: {c.body}
                      </div>
                    ))}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="inp flex-1"
                        placeholder="Short comment"
                        value={draft}
                        onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          const body = draft.trim();
                          if (!body) return;
                          repository.addShowcaseTextComment(post.id, "Viewer", body);
                          setCommentDrafts((prev) => ({ ...prev, [post.id]: "" }));
                          refresh();
                        }}
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {!posts.length ? <p className="empty-copy">No showcase posts yet.</p> : null}
          </section>
        </div>
      </main>
    </div>
  );
}
