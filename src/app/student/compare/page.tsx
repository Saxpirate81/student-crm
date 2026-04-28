"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { VideoCompareView } from "@/components/video/VideoCompareView";
import { useRepository } from "@/lib/useRepository";

function StudentCompareInner() {
  const searchParams = useSearchParams();
  const crm = searchParams.get("student") ?? "crm-alex";
  const { repository, version } = useRepository();

  const { student, videos } = useMemo(() => {
    void version;
    const s = repository.getStudent(crm) ?? repository.listStudents()[0];
    const vids = s ? repository.listVideosForStudent(s.crmId) : [];
    return { student: s, videos: vids };
  }, [crm, repository, version]);

  return (
    <div className="cadenza-app" data-theme="dark">
      <main className="c-main">
        <div className="topbar">
          <Link className="btn btn-sm" href="/student">
            ← Studio
          </Link>
          <div className="page-title">Compare progress</div>
        </div>
        <div className="content">
          <VideoCompareView studentName={student?.displayName ?? "Student"} videos={videos} />
        </div>
      </main>
    </div>
  );
}

export default function StudentComparePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-600">Loading…</p>}>
      <StudentCompareInner />
    </Suspense>
  );
}
