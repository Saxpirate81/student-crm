"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { blockIncludesStudent, type ScheduleBlock } from "@/lib/ops-roster/schedule";
import { applyLocalLessonStatus, LESSON_STATUS_EVENT } from "@/lib/ops-roster/session-status";
import {
  addDaysIso,
  currentEasternMinutes,
  formatMinutes,
  mondayOfWeek,
  todayEasternIso,
} from "@/lib/ops-roster/time";

type StudioScheduleProps = {
  blocks: ScheduleBlock[];
  selectedId?: string;
  emptyLabel?: string;
  titleField?: "student" | "instructor";
  onBlockClick?: (block: ScheduleBlock) => void;
};

const HOUR_HEIGHT = 52;
const START_HOUR = 8;
const END_HOUR = 21;

function weekdayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function StudioSchedule({
  blocks,
  selectedId,
  emptyLabel,
  titleField = "student",
  onBlockClick,
}: StudioScheduleProps) {
  const today = todayEasternIso();
  const [statusTick, setStatusTick] = useState(0);
  useEffect(() => {
    const bump = () => setStatusTick((value) => value + 1);
    window.addEventListener(LESSON_STATUS_EVENT, bump);
    return () => window.removeEventListener(LESSON_STATUS_EVENT, bump);
  }, []);
  const resolvedBlocks = useMemo(() => {
    void statusTick;
    return applyLocalLessonStatus(blocks);
  }, [blocks, statusTick]);
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  const [day, setDay] = useState(today);
  const boardRef = useRef<HTMLDivElement>(null);

  const weekDays = useMemo(() => {
    const monday = mondayOfWeek(day);
    return Array.from({ length: 7 }, (_, index) => addDaysIso(monday, index));
  }, [day]);

  const visibleDays = mode === "daily" ? [day] : weekDays;
  const visibleBlocks = useMemo(
    () => resolvedBlocks.filter((block) => visibleDays.includes(block.date)),
    [resolvedBlocks, visibleDays],
  );

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);
  const gridHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const nowMinutes = currentEasternMinutes();
  const showNow = visibleDays.includes(today) && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60;

  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const focusMinutes = Math.max(START_HOUR * 60, Math.min(nowMinutes - 30, (END_HOUR - 2) * 60));
    node.scrollTop = ((focusMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  }, [day, mode, nowMinutes]);

  return (
    <section className="studio-schedule">
      <div className="studio-schedule-head">
        <div>
          <p className="card-title">Schedule</p>
          <h2>{mode === "daily" ? weekdayLabel(day) : "This week"}</h2>
          <div className="studio-schedule-legend">
            <span className="is-lesson">Lesson</span>
            <span className="is-program">Program</span>
          </div>
        </div>
        <div className="studio-schedule-tools">
          <div className="seg">
            <button className={mode === "daily" ? "on" : ""} type="button" onClick={() => setMode("daily")}>
              Daily
            </button>
            <button className={mode === "weekly" ? "on" : ""} type="button" onClick={() => setMode("weekly")}>
              Weekly
            </button>
          </div>
          <div className="studio-schedule-nav">
            <button
              type="button"
              onClick={() => setDay(addDaysIso(day, mode === "weekly" ? -7 : -1))}
              aria-label="Previous"
            >
              ‹
            </button>
            <button type="button" onClick={() => setDay(today)}>
              Today
            </button>
            <button
              type="button"
              onClick={() => setDay(addDaysIso(day, mode === "weekly" ? 7 : 1))}
              aria-label="Next"
            >
              ›
            </button>
          </div>
        </div>
      </div>
      <div className="studio-schedule-board" ref={boardRef}>
        <div className={`studio-schedule-grid ${mode}`} style={{ minHeight: gridHeight }}>
          <div className="studio-schedule-hours" aria-hidden>
            {hours.map((hour) => (
              <div key={hour} className="studio-schedule-hour" style={{ height: HOUR_HEIGHT }}>
                {formatMinutes(hour * 60)}
              </div>
            ))}
          </div>
          {visibleDays.map((iso) => {
            const dayBlocks = visibleBlocks.filter((block) => block.date === iso);
            return (
              <div className={`studio-schedule-col ${iso === today ? "is-today" : ""}`} key={iso}>
                {mode === "weekly" ? <div className="studio-schedule-colhead">{weekdayLabel(iso)}</div> : null}
                <div className="studio-schedule-lanes" style={{ height: gridHeight }}>
                  {showNow && iso === today ? (
                    <div
                      className="studio-schedule-now"
                      style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT }}
                    />
                  ) : null}
                  {dayBlocks.map((block) => {
                    const top = ((block.startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = Math.max(28, ((block.endMinutes - block.startMinutes) / 60) * HOUR_HEIGHT);
                    const selected = blockIncludesStudent(block, selectedId);
                    const title =
                      block.kind === "program"
                        ? block.description || "Program"
                        : titleField === "instructor"
                          ? block.instructorName
                          : block.studentName;
                    const detail =
                      block.kind === "program"
                        ? [block.category, block.product].filter(Boolean).join(" · ")
                        : block.description;
                    return (
                      <button
                        key={block.id}
                        className={`studio-schedule-block is-${block.kind}${selected ? " is-selected" : ""}${/^complete/i.test(block.status) ? " is-complete" : ""}`}
                        style={{ top, height }}
                        type="button"
                        onClick={() => onBlockClick?.(block)}
                      >
                        <strong>{title}</strong>
                        <span>
                          {block.startLabel}–{block.endLabel}
                          {detail ? ` · ${detail}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {!visibleBlocks.length ? (
          <p className="studio-schedule-empty">{emptyLabel ?? "No lessons on this schedule."}</p>
        ) : null}
      </div>
    </section>
  );
}
