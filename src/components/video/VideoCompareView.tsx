"use client";

import { useEffect, useMemo, useState } from "react";
import { StudentVideoTheater } from "@/components/student/StudentVideoTheater";
import type { StudentVideo } from "@/lib/domain/types";

function formatClipDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function VideoCompareView({ videos, studentName }: { videos: StudentVideo[]; studentName: string }) {
  const sorted = useMemo(
    () => [...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [videos],
  );
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");

  useEffect(() => {
    if (!sorted.length) {
      setIdA("");
      setIdB("");
      return;
    }
    setIdA((prev) => (sorted.some((v) => v.id === prev) ? prev : sorted[Math.min(1, sorted.length - 1)]?.id ?? sorted[0].id));
    setIdB((prev) => (sorted.some((v) => v.id === prev) ? prev : sorted[0].id));
  }, [sorted]);

  const videoA = sorted.find((v) => v.id === idA);
  const videoB = sorted.find((v) => v.id === idB);

  return (
    <div className="space-y-6">
      <header className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Side-by-side clips</div>
            <div className="section-sub">
              Pick two recordings for {studentName} (for example “day 1” vs “day 100”). Each player keeps its own transport.
            </div>
          </div>
        </div>
        <div className="instructor-form-grid">
          <label className="form-grp">
            <span className="form-lbl">Left video</span>
            <select className="inp" value={idA} onChange={(e) => setIdA(e.target.value)}>
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} · {formatClipDate(v.createdAt)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-grp">
            <span className="form-lbl">Right video</span>
            <select className="inp" value={idB} onChange={(e) => setIdB(e.target.value)}>
              {sorted.map((v) => (
                <option key={`r-${v.id}`} value={v.id}>
                  {v.title} · {formatClipDate(v.createdAt)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {!sorted.length ? (
        <p className="empty-copy">No videos yet to compare.</p>
      ) : (
        <div className="video-compare-grid">
          <div>
            {videoA ? <StudentVideoTheater video={videoA} /> : null}
          </div>
          <div>
            {videoB ? <StudentVideoTheater video={videoB} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
