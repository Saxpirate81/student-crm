"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { VideoCompareView } from "@/components/video/VideoCompareView";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";
import { useAuth } from "@/lib/auth/auth-context";
import { useRepository } from "@/lib/useRepository";

function ParentCompareInner() {
  const searchParams = useSearchParams();
  const { session, ready } = useAuth();
  const { repository, version } = useRepository();
  const { theme } = useCadenzaTheme();

  const children = useMemo(() => {
    void version;
    const parentId = session?.kind === "parent" ? session.parentCrmId : "parent-jordan";
    return repository.listStudents().filter((s) => s.parentCrmId === parentId);
  }, [repository, session, version]);

  const defaultCrm = children[0]?.crmId ?? "crm-alex";
  const crm = searchParams.get("student") ?? defaultCrm;

  const { student, videos } = useMemo(() => {
    void version;
    const s = repository.getStudent(crm) ?? children[0];
    const vids = s ? repository.listVideosForStudent(s.crmId) : [];
    return { student: s, videos: vids };
  }, [children, crm, repository, version]);

  return (
    <div className="cadenza-app" data-theme={theme}>
      <main className="c-main">
        <div className="topbar">
          <Link className="btn btn-sm" href="/parent">
            ← Parent dashboard
          </Link>
          <div className="page-title">Compare videos</div>
        </div>
        <div className="content">
          {!ready ? <p className="section-sub">Loading…</p> : null}
          <div className="card mb-6">
            <div className="card-header">
              <div className="card-title">Student</div>
            </div>
            <div className="tabs">
              {children.map((c) => (
                <Link
                  key={c.crmId}
                  className={`tab ${c.crmId === crm ? "active" : ""}`}
                  href={`/parent/compare?student=${encodeURIComponent(c.crmId)}`}
                  scroll={false}
                >
                  {c.displayName}
                </Link>
              ))}
            </div>
          </div>
          <VideoCompareView studentName={student?.displayName ?? "Student"} videos={videos} />
        </div>
      </main>
    </div>
  );
}

export default function ParentComparePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-600">Loading…</p>}>
      <ParentCompareInner />
    </Suspense>
  );
}
