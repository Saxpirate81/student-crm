"use client";

import Link from "next/link";
import { useMemo } from "react";
import { StudioThread } from "@/components/studio/StudioThread";
import { sessionPath, type StudioRole } from "@/lib/ops-roster/session-href";
import type { ScheduleBlock } from "@/lib/ops-roster/schedule";
import { useRepository } from "@/lib/useRepository";

type Props = {
  block: ScheduleBlock;
  role: StudioRole;
};

export function ProgramWorkspace({ block, role }: Props) {
  const { repository, version, schedule } = useRepository();
  const students = useMemo(() => {
    void version;
    return block.studentIds
      .map((id) => repository.getStudent(id))
      .filter((student): student is NonNullable<typeof student> => Boolean(student));
  }, [block.studentIds, repository, version]);

  const lessonForStudent = (studentId: string) =>
    schedule.find(
      (row) =>
        row.kind === "lesson" &&
        row.studentId === studentId &&
        row.instructorId === block.instructorId &&
        row.date === block.date,
    );

  return (
    <div className="session-workspace">
      <header className="session-hero is-program">
        <div className="session-hero-copy">
          <p className="card-title">{block.category || "Program"}</p>
          <h1>{block.description || "Program"}</h1>
          <p>
            {block.startLabel}–{block.endLabel} · {block.instructorName}
            {block.product ? ` · ${block.product}` : ""}
            {block.location ? ` · ${block.location}` : ""}
          </p>
        </div>
        <span className="badge b-cyan">{block.studentIds.length} students</span>
      </header>

      <div className="session-grid">
        <section className="session-card">
          <div className="session-card-head">
            <p className="card-title">Class roster</p>
            <p className="session-card-sub">Open a student to reach their lesson page with this teacher.</p>
          </div>
          <div className="session-roster">
            {students.map((student) => {
              const lesson = lessonForStudent(student.crmId);
              return lesson ? (
                <Link key={student.crmId} href={sessionPath(role, lesson)} className="session-roster-row">
                  {student.displayName}
                </Link>
              ) : (
                <div key={student.crmId} className="session-roster-row">
                  {student.displayName}
                </div>
              );
            })}
          </div>
        </section>

        <div className="session-grid-span">
          <StudioThread
            threadId={`program:${block.id}`}
            fromRole={role}
            title="Class messages"
            subtitle="Teacher to the whole class, or parent to teacher for this group. Attach files, then let Quincy format the note."
          />
        </div>
      </div>
    </div>
  );
}
