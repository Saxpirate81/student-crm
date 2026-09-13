"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { blockIncludesStudent, type ScheduleBlock } from "@/lib/ops-roster/schedule";
import { applyLocalLessonStatus, LESSON_STATUS_EVENT } from "@/lib/ops-roster/session-status";
import {
  addDaysIso,
  currentEasternMinutes,
  formatMinutes,
  mondayOfWeek,
  todayEasternIso,
} from "@/lib/ops-roster/time";
import {
  mergeOverlayInstructors,
  overlayFromShift,
  overlaysForStaff,
  type MasterOverlayBlock,
} from "@/lib/ops-staff-schedule/master-overlays";
import { staffNamesMatch } from "@/lib/ops-staff-schedule/name-match";
import type { FrontDeskSchedulePayload, TeacherSchedulePayload } from "@/lib/ops-staff-schedule/types";

type KindFilter = "all" | "lesson" | "program";

type StudioScheduleProps = {
  blocks: ScheduleBlock[];
  selectedId?: string;
  emptyLabel?: string;
  titleField?: "student" | "instructor";
  variant?: "studio" | "master";
  onBlockClick?: (block: ScheduleBlock) => void;
};

type BlockLane = { col: number; cols: number };

type BoardColumn = {
  key: string;
  label: string;
  title?: string;
  instructorId?: string;
  date: string;
  blocks: ScheduleBlock[];
  overlays: MasterOverlayBlock[];
};

const DEFAULT_HOUR_HEIGHT = 52;
const MIN_HOUR = 6;
const MAX_HOUR = 22;
const RANGE_PAD_MINUTES = 60;
const BOARD_FIT_HEIGHT = 520;
const BLOCK_GAP = 8;
const MASTER_INSET = 10;

function gridWindow(blocks: Array<{ startMinutes: number; endMinutes: number }>) {
  if (!blocks.length) {
    return { startHour: 8, endHour: 21 };
  }
  const first = Math.min(...blocks.map((block) => block.startMinutes));
  const last = Math.max(...blocks.map((block) => block.endMinutes));
  const startHour = Math.max(MIN_HOUR, Math.floor((first - RANGE_PAD_MINUTES) / 60));
  const endHour = Math.min(MAX_HOUR, Math.ceil((last + RANGE_PAD_MINUTES) / 60));
  return { startHour, endHour: Math.max(startHour + 2, endHour) };
}

function layoutOverlappingBlocks(blocks: ScheduleBlock[]) {
  const sorted = [...blocks].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.endMinutes !== b.endMinutes) return b.endMinutes - a.endMinutes;
    return a.id.localeCompare(b.id);
  });

  const groups: ScheduleBlock[][] = [];
  let group: ScheduleBlock[] = [];
  let groupEnd = -1;
  for (const block of sorted) {
    if (group.length && block.startMinutes < groupEnd) {
      group.push(block);
      groupEnd = Math.max(groupEnd, block.endMinutes);
    } else {
      if (group.length) groups.push(group);
      group = [block];
      groupEnd = block.endMinutes;
    }
  }
  if (group.length) groups.push(group);

  const lanes = new Map<string, BlockLane>();
  for (const members of groups) {
    const colEnd: number[] = [];
    const colById = new Map<string, number>();
    for (const block of members) {
      let col = colEnd.findIndex((end) => end <= block.startMinutes);
      if (col < 0) {
        col = colEnd.length;
        colEnd.push(block.endMinutes);
      } else {
        colEnd[col] = block.endMinutes;
      }
      colById.set(block.id, col);
    }
    const cols = Math.max(1, colEnd.length);
    for (const block of members) {
      lanes.set(block.id, { col: colById.get(block.id) ?? 0, cols });
    }
  }
  return lanes;
}

function isCompleteStatus(status: string) {
  return /^complete/i.test(status);
}

function isCanceledStatus(status: string) {
  return /cancel/i.test(status);
}

function weekdayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function staffShortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function StudioSchedule({
  blocks,
  selectedId,
  emptyLabel,
  titleField = "student",
  variant = "studio",
  onBlockClick,
}: StudioScheduleProps) {
  const isMaster = variant === "master";
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
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [instructorId, setInstructorId] = useState("");
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ block: ScheduleBlock; rect: DOMRect } | null>(null);
  const [teacherShifts, setTeacherShifts] = useState<TeacherSchedulePayload["shifts"]>([]);
  const [frontDeskShifts, setFrontDeskShifts] = useState<FrontDeskSchedulePayload["shifts"]>([]);
  const [overlayInstructors, setOverlayInstructors] = useState<Array<{ id: string; name: string }>>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const snappedKey = useRef("");
  const overlayWeek = isMaster ? mondayOfWeek(day) : "";

  useEffect(() => {
    if (!isMaster || !overlayWeek) return;
    const sunday = addDaysIso(overlayWeek, 6);
    let cancelled = false;
    void (async () => {
      try {
        const [teacherRes, frontDeskRes] = await Promise.all([
          fetch(`/api/ops-staff-schedule?layer=teacher&date=${encodeURIComponent(overlayWeek)}`, {
            cache: "no-store",
          }),
          fetch(
            `/api/ops-staff-schedule?layer=front-desk&from=${encodeURIComponent(overlayWeek)}&to=${encodeURIComponent(sunday)}`,
            { cache: "no-store" },
          ),
        ]);
        const teacher = (await teacherRes.json()) as TeacherSchedulePayload & { error?: string };
        const frontDesk = (await frontDeskRes.json()) as FrontDeskSchedulePayload & { error?: string };
        if (cancelled) return;
        setTeacherShifts(teacherRes.ok ? teacher.shifts ?? [] : []);
        setFrontDeskShifts(frontDeskRes.ok ? frontDesk.shifts ?? [] : []);
        setOverlayInstructors(teacherRes.ok ? teacher.instructors ?? [] : []);
      } catch {
        if (!cancelled) {
          setTeacherShifts([]);
          setFrontDeskShifts([]);
          setOverlayInstructors([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMaster, overlayWeek]);

  const overlayBlocks = useMemo(() => {
    return [...teacherShifts, ...frontDeskShifts]
      .map(overlayFromShift)
      .filter((row): row is MasterOverlayBlock => Boolean(row))
      .filter((row) => !location || row.location === location);
  }, [frontDeskShifts, location, teacherShifts]);

  const locations = useMemo(() => {
    return [
      ...new Set(
        [
          ...resolvedBlocks.map((block) => block.location),
          ...teacherShifts.map((shift) => shift.location ?? ""),
          ...frontDeskShifts.map((shift) => shift.location ?? ""),
        ].filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [frontDeskShifts, resolvedBlocks, teacherShifts]);

  const instructors = useMemo(() => {
    const attendance = new Map<string, string>();
    for (const block of resolvedBlocks) {
      if (!attendance.has(block.instructorId)) attendance.set(block.instructorId, block.instructorName);
    }
    return mergeOverlayInstructors(
      [...attendance.entries()].map(([id, name]) => ({ id, name })),
      overlayInstructors,
    );
  }, [overlayInstructors, resolvedBlocks]);

  const filteredBlocks = useMemo(() => {
    return resolvedBlocks.filter((block) => {
      if (location && block.location !== location) return false;
      if (kind !== "all" && block.kind !== kind) return false;
      if (instructorId) {
        const named = instructors.find((row) => row.id === instructorId);
        const matchesId = block.instructorId === instructorId;
        const matchesName = named ? staffNamesMatch(block.instructorName, named.name) : false;
        if (!matchesId && !matchesName) return false;
      }
      return true;
    });
  }, [instructorId, instructors, kind, location, resolvedBlocks]);

  const weekDays = useMemo(() => {
    const monday = mondayOfWeek(day);
    return Array.from({ length: 7 }, (_, index) => addDaysIso(monday, index));
  }, [day]);

  const visibleDays = mode === "daily" ? [day] : weekDays;
  const visibleBlocks = useMemo(
    () => filteredBlocks.filter((block) => visibleDays.includes(block.date)),
    [filteredBlocks, visibleDays],
  );

  useEffect(() => {
    const key = `${mode}:${location}:${kind}:${instructorId}:${filteredBlocks.length}:${filteredBlocks[0]?.id ?? ""}:${filteredBlocks[filteredBlocks.length - 1]?.id ?? ""}`;
    if (snappedKey.current === key) return;
    if (!filteredBlocks.length) return;
    if (filteredBlocks.some((block) => visibleDays.includes(block.date))) {
      snappedKey.current = key;
      return;
    }
    const dates = [...new Set(filteredBlocks.map((block) => block.date))].sort();
    const next = dates.find((iso) => iso >= today) ?? dates[0];
    if (next) {
      setDay(next);
      snappedKey.current = key;
    }
  }, [filteredBlocks, mode, today, visibleDays]);

  const staffDaily = isMaster && mode === "daily";
  const showMasterUnderlay = isMaster && (staffDaily || Boolean(instructorId));
  const boardColumns = useMemo((): BoardColumn[] => {
    const overlaysForColumn = (staffName: string | undefined, date: string) => {
      if (!showMasterUnderlay || !staffName) return [];
      return overlaysForStaff(overlayBlocks, staffName, date);
    };

    if (!staffDaily) {
      const weeklyStaffName = instructorId
        ? instructors.find((row) => row.id === instructorId)?.name
        : undefined;
      return visibleDays.map((iso) => ({
        key: iso,
        label: weekdayLabel(iso),
        date: iso,
        blocks: visibleBlocks.filter((block) => block.date === iso),
        overlays: overlaysForColumn(weeklyStaffName, iso),
      }));
    }

    const staff = new Map<string, { id: string; name: string }>();
    for (const block of visibleBlocks) {
      if (!staff.has(block.instructorId)) {
        staff.set(block.instructorId, { id: block.instructorId, name: block.instructorName });
      }
    }
    for (const overlay of overlayBlocks.filter((row) => row.date === day && row.kind === "master")) {
      const named = instructors.find((row) => staffNamesMatch(row.name, overlay.staffName));
      if (!named) continue;
      if (instructorId && named.id !== instructorId) continue;
      if (![...staff.values()].some((row) => staffNamesMatch(row.name, named.name))) {
        staff.set(named.id, named);
      }
    }
    if (instructorId && !staff.has(instructorId)) {
      const named = instructors.find((row) => row.id === instructorId);
      if (named) staff.set(instructorId, named);
    }
    return [...staff.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({
        key: row.id,
        label: staffShortName(row.name),
        title: row.name,
        instructorId: row.id,
        date: day,
        blocks: visibleBlocks.filter(
          (block) => block.instructorId === row.id || staffNamesMatch(block.instructorName, row.name),
        ),
        overlays: overlaysForColumn(row.name, day),
      }));
  }, [
    day,
    instructorId,
    instructors,
    overlayBlocks,
    showMasterUnderlay,
    staffDaily,
    visibleBlocks,
    visibleDays,
  ]);

  const { startHour, endHour } = useMemo(
    () =>
      gridWindow([
        ...visibleBlocks,
        ...boardColumns.flatMap((column) => column.overlays),
      ]),
    [boardColumns, visibleBlocks],
  );
  const hourCount = Math.max(1, endHour - startHour);
  const hourHeight = isMaster
    ? Math.max(
        32,
        Math.min(
          64,
          boardSize.height > 40
            ? Math.floor((boardSize.height - (staffDaily || mode === "weekly" ? 28 : 12)) / hourCount)
            : 44,
        ),
      )
    : Math.max(
        DEFAULT_HOUR_HEIGHT,
        Math.min(96, Math.round(BOARD_FIT_HEIGHT / hourCount)),
      );
  const hours = Array.from({ length: hourCount }, (_, index) => startHour + index);
  const gridHeight = hourCount * hourHeight;
  const nowMinutes = currentEasternMinutes();
  const showNow =
    visibleDays.includes(today) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  const filtersOn = Boolean(location || kind !== "all" || instructorId);
  const selectedInstructorName = instructors.find((row) => row.id === instructorId)?.name;
  const heading =
    mode === "weekly"
      ? selectedInstructorName
        ? `${selectedInstructorName} · this week`
        : "This week"
      : weekdayLabel(day);
  const eventCount = visibleBlocks.length;
  const staffCount = staffDaily ? boardColumns.length : new Set(visibleBlocks.map((block) => block.instructorId)).size;

  useLayoutEffect(() => {
    const node = boardRef.current;
    if (!node || !isMaster) return;
    const measure = () => setBoardSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isMaster]);

  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    node.scrollTop = 0;
    node.scrollLeft = 0;
  }, [day, mode, startHour, endHour, instructorId, location, kind]);

  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const clear = () => setHover(null);
    node.addEventListener("scroll", clear, { passive: true });
    window.addEventListener("scroll", clear, { passive: true });
    return () => {
      node.removeEventListener("scroll", clear);
      window.removeEventListener("scroll", clear);
    };
  }, []);

  const gridTemplateColumns = staffDaily
    ? `44px repeat(${Math.max(1, boardColumns.length)}, minmax(112px, 1fr))`
    : mode === "weekly"
      ? "52px repeat(7, minmax(110px, 1fr))"
      : "52px 1fr";

  const focusStaffWeek = (id: string) => {
    setInstructorId(id);
    setMode("weekly");
  };

  return (
    <section className={`studio-schedule${isMaster ? " is-master" : ""}`}>
      <div className="studio-schedule-head">
        <div>
          <p className="card-title">{isMaster ? "Studio" : "Schedule"}</p>
          <h2>{heading}</h2>
          <div className="studio-schedule-legend">
            <span className="is-lesson">Lesson</span>
            <span className="is-program">Program</span>
            {isMaster ? (
              <>
                <span className="is-master-outline">Master</span>
                <span className="is-front-desk">Front Desk</span>
                <span className="studio-schedule-meta">
                  {eventCount} {eventCount === 1 ? "visit" : "visits"}
                  {staffCount ? ` · ${staffCount} ${staffCount === 1 ? "instructor" : "instructors"}` : ""}
                  {location ? ` · ${location}` : ""}
                </span>
              </>
            ) : null}
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
      {isMaster ? (
        <div className="studio-schedule-filters">
          <label className="profile-select compact">
            Location
            <select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">All locations</option>
              {locations.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="seg">
            <button className={kind === "all" ? "on" : ""} type="button" onClick={() => setKind("all")}>
              All
            </button>
            <button className={kind === "lesson" ? "on" : ""} type="button" onClick={() => setKind("lesson")}>
              Lessons
            </button>
            <button className={kind === "program" ? "on" : ""} type="button" onClick={() => setKind("program")}>
              Programs
            </button>
          </div>
          <label className="profile-select compact">
            Instructor
            <select value={instructorId} onChange={(event) => setInstructorId(event.target.value)}>
              <option value="">All instructors</option>
              {instructors.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          {filtersOn ? (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setLocation("");
                setKind("all");
                setInstructorId("");
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="studio-schedule-board" ref={boardRef}>
        <div
          className={`studio-schedule-grid ${mode}${staffDaily ? " staff" : ""}`}
          style={{ minHeight: gridHeight, gridTemplateColumns }}
        >
          <div className="studio-schedule-hours" aria-hidden>
            {mode === "weekly" || staffDaily ? (
              <div className="studio-schedule-colhead" />
            ) : null}
            {hours.map((hour) => (
              <div key={hour} className="studio-schedule-hour" style={{ height: hourHeight }}>
                {formatMinutes(hour * 60)}
              </div>
            ))}
          </div>
          {boardColumns.map((column) => {
            const lanes = layoutOverlappingBlocks(column.blocks);
            const showNowHere = showNow && column.date === today;
            const masterUnderlays = column.overlays.filter((row) => row.kind === "master");
            const deskOverlays = column.overlays.filter((row) => row.kind !== "master");
            const insetLessons = masterUnderlays.length > 0;
            return (
              <div
                className={`studio-schedule-col ${column.date === today ? "is-today" : ""}${masterUnderlays.length ? " has-master" : ""}`}
                key={column.key}
              >
                {mode === "weekly" || staffDaily ? (
                  staffDaily && column.instructorId ? (
                    <button
                      className="studio-schedule-colhead is-staff"
                      type="button"
                      title={`${column.title ?? column.label} · open week`}
                      onClick={() => focusStaffWeek(column.instructorId!)}
                    >
                      {column.label}
                    </button>
                  ) : (
                    <div className="studio-schedule-colhead">{column.label}</div>
                  )
                ) : null}
                <div
                  className="studio-schedule-lanes"
                  style={{ height: gridHeight, backgroundSize: `100% ${hourHeight}px` }}
                >
                  {showNowHere ? (
                    <div
                      className="studio-schedule-now"
                      style={{ top: ((nowMinutes - startHour * 60) / 60) * hourHeight }}
                    />
                  ) : null}
                  {masterUnderlays.map((overlay) => {
                    const top = ((overlay.startMinutes - startHour * 60) / 60) * hourHeight;
                    const height = Math.max(
                      18,
                      ((overlay.endMinutes - overlay.startMinutes) / 60) * hourHeight,
                    );
                    const room = overlay.roomName || overlay.location;
                    return (
                      <div
                        key={overlay.id}
                        className="studio-schedule-underlay"
                        style={{ top, height }}
                        title={`Master · ${overlay.startLabel}–${overlay.endLabel}${room ? ` · ${room}` : ""}`}
                      >
                        <span>
                          {overlay.startLabel}–{overlay.endLabel}
                          {room ? ` · ${room}` : ""}
                        </span>
                      </div>
                    );
                  })}
                  {column.blocks.map((block) => {
                    const top =
                      ((block.startMinutes - startHour * 60) / 60) * hourHeight + BLOCK_GAP / 2;
                    const height = Math.max(
                      24,
                      ((block.endMinutes - block.startMinutes) / 60) * hourHeight - BLOCK_GAP,
                    );
                    const selected = blockIncludesStudent(block, selectedId);
                    const complete = isCompleteStatus(block.status);
                    const canceled = isCanceledStatus(block.status);
                    const lane = lanes.get(block.id) ?? { col: 0, cols: 1 };
                    const widthPct = 100 / lane.cols;
                    const inset = insetLessons ? MASTER_INSET : 3;
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
                        className={`studio-schedule-block is-${block.kind}${selected ? " is-selected" : ""}${complete ? " is-complete" : ""}${canceled ? " is-canceled" : ""}`}
                        style={{
                          top,
                          height,
                          left: `calc(${lane.col * widthPct}% + ${inset}px)`,
                          width: `calc(${widthPct}% - ${inset * 2}px)`,
                          zIndex: selected ? 5 : complete ? 4 : 3,
                        }}
                        type="button"
                        onClick={() => onBlockClick?.(block)}
                        onMouseEnter={(event) =>
                          setHover({ block, rect: event.currentTarget.getBoundingClientRect() })
                        }
                        onMouseLeave={() => setHover(null)}
                      >
                        <span className="studio-schedule-block-copy">
                          <strong>{title}</strong>
                          <span>
                            {block.startLabel}–{block.endLabel}
                            {detail ? ` · ${detail}` : ""}
                          </span>
                        </span>
                        {complete ? (
                          <svg
                            className="studio-schedule-check"
                            viewBox="0 0 24 24"
                            aria-hidden
                            focusable="false"
                          >
                            <path
                              d="M3.8 12.6 9.7 18.6 20.2 5.4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="4.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                  {deskOverlays.map((overlay) => {
                    const top = ((overlay.startMinutes - startHour * 60) / 60) * hourHeight + 2;
                    const height = Math.max(
                      16,
                      ((overlay.endMinutes - overlay.startMinutes) / 60) * hourHeight - 4,
                    );
                    return (
                      <div
                        key={overlay.id}
                        className={`studio-schedule-desk-overlay is-${overlay.kind}`}
                        style={{ top, height }}
                        title={`Front Desk · ${overlay.startLabel}–${overlay.endLabel}${overlay.location ? ` · ${overlay.location}` : ""}`}
                      >
                        <span>
                          Front Desk
                          {overlay.kind === "front-desk-master" ? " · master" : ""}
                          {overlay.location ? ` · ${overlay.location}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {!visibleBlocks.length && !boardColumns.some((column) => column.overlays.length) ? (
          <p className="studio-schedule-empty">{emptyLabel ?? "No lessons on this schedule."}</p>
        ) : null}
      </div>
      {hover ? (
        <ScheduleHoverCard
          block={hover.block}
          anchor={hover.rect}
          board={boardRef.current}
          titleField={titleField}
        />
      ) : null}
    </section>
  );
}

function hoverLines(block: ScheduleBlock, titleField: "student" | "instructor") {
  const title =
    block.kind === "program"
      ? block.description || "Program"
      : titleField === "instructor"
        ? block.instructorName
        : block.studentName;
  const lines = [
    block.kind === "program" ? null : titleField === "instructor" ? block.studentName : block.instructorName,
    `${block.startLabel}–${block.endLabel}${block.location ? ` · ${block.location}` : ""}`,
    block.kind === "program"
      ? [block.category, block.product, block.studentIds.length ? `${block.studentIds.length} students` : ""]
          .filter(Boolean)
          .join(" · ")
      : [block.description, block.product].filter(Boolean).join(" · "),
    block.status && !/^scheduled$/i.test(block.status) ? block.status : null,
  ].filter((line): line is string => Boolean(line && line !== title));

  return { kind: block.kind === "program" ? "Program" : "Lesson", title, lines: [...new Set(lines)] };
}

function ScheduleHoverCard({
  block,
  anchor,
  board,
  titleField,
}: {
  block: ScheduleBlock;
  anchor: DOMRect;
  board: HTMLDivElement | null;
  titleField: "student" | "instructor";
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 8 });
  const copy = hoverLines(block, titleField);

  useLayoutEffect(() => {
    const node = popRef.current;
    if (!node) return;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const area = board?.getBoundingClientRect();
    const pad = 10;
    const minLeft = area ? area.left + pad : 12;
    const maxLeft = area ? area.right - width - pad : window.innerWidth - width - 12;
    const minTop = area ? area.top + pad : 12;
    const maxTop = area ? area.bottom - height - pad : window.innerHeight - height - 12;
    const floor = area ? area.bottom : window.innerHeight;

    const left = anchor.left;
    let top = anchor.bottom + 8;
    if (top + height > floor - pad) top = anchor.top - height - 8;

    setPos({
      left: Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft)),
      top: Math.min(Math.max(top, minTop), Math.max(minTop, maxTop)),
    });
  }, [anchor, block.id, board]);

  return (
    <div ref={popRef} className="studio-schedule-pop" role="tooltip" style={{ left: pos.left, top: pos.top }}>
      <p className="studio-schedule-pop-kind">{copy.kind}</p>
      <h3>{copy.title}</h3>
      {copy.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
