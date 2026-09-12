"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionWorkspace } from "@/components/studio/SessionWorkspace";
import { StudioBackFrame } from "@/components/studio/StudioBackFrame";
import { findScheduleBlock, type StudioRole } from "@/lib/ops-roster/session-href";
import { applyLocalLessonStatus } from "@/lib/ops-roster/session-status";
import { useRepository } from "@/lib/useRepository";

export function StudioSessionPage({ role }: { role: StudioRole }) {
  const params = useParams<{ blockId: string }>();
  const { schedule, loading } = useRepository();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const block = findScheduleBlock(applyLocalLessonStatus(schedule), params.blockId ?? "");
  const backHref = `/${role}`;

  if (!ready || !block) {
    return (
      <StudioBackFrame backHref={backHref} backLabel="Schedule">
        <div className="card">
          <p className="card-title">{!ready || loading ? "Loading schedule…" : "Lesson not found"}</p>
          {ready && !loading ? (
            <Link href={backHref} className="btn btn-primary mt-4 inline-flex">
              Back to studio
            </Link>
          ) : null}
        </div>
      </StudioBackFrame>
    );
  }

  return (
    <StudioBackFrame backHref={backHref} backLabel="Schedule">
      <SessionWorkspace block={block} role={role} />
    </StudioBackFrame>
  );
}
