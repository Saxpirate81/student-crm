"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addDaysIso,
  currentEasternMinutes,
  formatMinutes,
  mondayOfWeek,
  todayEasternIso,
} from "@/lib/ops-roster/time";
import { minutesToTime, snapMinutes, weekDayFromIso } from "@/lib/ops-staff-schedule/time";
import type {
  FrontDeskSchedulePayload,
  InstructorRegistryRow,
  StaffScheduleLayer,
  StaffShiftBlock,
  TeacherSchedulePayload,
} from "@/lib/ops-staff-schedule/types";

type BoardColumn = {
  key: string;
  label: string;
  date: string;
  instructorId?: string;
  staffName?: string;
  blocks: StaffShiftBlock[];
};

type DragCreate = {
  columnKey: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
};

type MenuState = {
  x: number;
  y: number;
  block: StaffShiftBlock;
  splitTime: string;
};

type ConfirmState = {
  layer: StaffScheduleLayer;
  date: string;
  weekDay: string;
  columnKey: string;
  staffName: string;
  instructorId?: string;
  startTime: string;
  endTime: string;
  location: string;
  roomId: string;
  kind: "permanent" | "one_off";
};

const MIN_HOUR = 8;
const MAX_HOUR = 21;
const SNAP = 15;
const DISMISS_KEY = "cadenza.fd-master-dismissed.v1";

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
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

function readDismissed() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISS_KEY) || "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeDismissed(keys: Set<string>) {
  window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...keys]));
}

async function postSchedule(body: Record<string, unknown>) {
  const response = await fetch("/api/ops-staff-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Schedule update failed.");
}

export function StaffScheduleBoard({ layer }: { layer: StaffScheduleLayer }) {
  const today = todayEasternIso();
  const [day, setDay] = useState(today);
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  const [location, setLocation] = useState("");
  const [focusKey, setFocusKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState<TeacherSchedulePayload | null>(null);
  const [frontDesk, setFrontDesk] = useState<FrontDeskSchedulePayload | null>(null);
  const [drag, setDrag] = useState<DragCreate | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [lockIn, setLockIn] = useState<StaffShiftBlock | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);
  const [boardHeight, setBoardHeight] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragCreate | null>(null);
  const loadGen = useRef(0);

  const weekDays = useMemo(() => {
    const monday = mondayOfWeek(day);
    return Array.from({ length: 7 }, (_, index) => addDaysIso(monday, index));
  }, [day]);

  const load = async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    try {
      if (layer === "teacher") {
        const response = await fetch(`/api/ops-staff-schedule?layer=teacher&date=${encodeURIComponent(day)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as TeacherSchedulePayload & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load teacher schedule.");
        if (gen !== loadGen.current) return;
        setTeacher(payload);
      } else {
        const from = mondayOfWeek(day);
        const to = addDaysIso(from, 6);
        const response = await fetch(
          `/api/ops-staff-schedule?layer=front-desk&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as FrontDeskSchedulePayload & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load Front Desk schedule.");
        if (gen !== loadGen.current) return;
        setFrontDesk(payload);
      }
    } catch (loadError) {
      if (gen !== loadGen.current) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load schedule.");
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest(".staff-schedule-menu")) return;
      setMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, day]);

  useLayoutEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const measure = () => setBoardHeight(node.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const instructors = teacher?.instructors ?? [];
  const rooms = teacher?.rooms ?? [];
  const locations = useMemo(() => {
    if (layer === "front-desk") return frontDesk?.locations ?? [];
    return [...new Set(rooms.map((room) => room.location))].sort((a, b) => a.localeCompare(b));
  }, [frontDesk?.locations, layer, rooms]);

  const allShifts = useMemo(() => {
    const rows = layer === "teacher" ? teacher?.shifts ?? [] : frontDesk?.shifts ?? [];
    return rows.filter((shift) => {
      if (location && shift.location !== location) return false;
      if (focusKey && shift.columnKey !== focusKey) return false;
      if (shift.kind === "master-preview" && dismissed.has(shift.id)) return false;
      return true;
    });
  }, [dismissed, focusKey, frontDesk?.shifts, layer, location, teacher?.shifts]);

  const visibleDates = mode === "daily" ? [day] : weekDays;
  const staffDaily = mode === "daily";

  const columns = useMemo((): BoardColumn[] => {
    if (!staffDaily) {
      return visibleDates.map((iso) => ({
        key: iso,
        label: weekdayLabel(iso),
        date: iso,
        blocks: allShifts.filter((shift) => shift.date === iso),
      }));
    }
    if (layer === "teacher") {
      const map = new Map<string, InstructorRegistryRow>();
      for (const shift of allShifts.filter((row) => row.date === day)) {
        const named = instructors.find((row) => row.id === shift.columnKey);
        if (named) map.set(named.id, named);
      }
      if (focusKey) {
        const focused = instructors.find((row) => row.id === focusKey);
        if (focused) map.set(focused.id, focused);
      }
      const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
      return list.map((instructor) => ({
        key: instructor.id,
        label: staffShortName(instructor.name),
        date: day,
        instructorId: instructor.id,
        staffName: instructor.name,
        blocks: allShifts.filter((shift) => shift.date === day && shift.columnKey === instructor.id),
      }));
    }
    const names = new Set<string>();
    for (const name of frontDesk?.staffNames ?? []) {
      if (focusKey && name !== focusKey) continue;
      names.add(name);
    }
    for (const shift of allShifts.filter((row) => row.date === day)) names.add(shift.staffName);
    if (focusKey) names.add(focusKey);
    const list = [...names].sort((a, b) => a.localeCompare(b));
    if (!list.length) list.push("New staff");
    return list.map((name) => ({
      key: name,
      label: staffShortName(name),
      date: day,
      staffName: name,
      blocks: allShifts.filter((shift) => shift.date === day && shift.columnKey === name),
    }));
  }, [allShifts, day, focusKey, frontDesk?.staffNames, instructors, layer, location, staffDaily, visibleDates]);

  const startHour = MIN_HOUR;
  const endHour = MAX_HOUR;
  const hourCount = endHour - startHour;
  const hourHeight = Math.max(32, Math.min(56, boardHeight > 40 ? Math.floor((boardHeight - 28) / hourCount) : 40));
  const gridHeight = hourCount * hourHeight;
  const hours = Array.from({ length: hourCount }, (_, index) => startHour + index);
  const nowMinutes = currentEasternMinutes();
  const showNow = visibleDates.includes(today) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  const minutesFromY = (clientY: number, lanes: HTMLElement) => {
    const rect = lanes.getBoundingClientRect();
    const raw = ((clientY - rect.top) / hourHeight) * 60 + startHour * 60;
    return Math.max(startHour * 60, Math.min(endHour * 60, snapMinutes(raw, SNAP)));
  };

  const roomsForLocation = (value: string) => rooms.filter((room) => !value || room.location === value);

  const beginCreate = (column: BoardColumn, event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".studio-schedule-block, .staff-schedule-menu, .staff-schedule-modal")) {
      return;
    }
    event.preventDefault();
    const lanes = event.currentTarget;
    const startMinutes = minutesFromY(event.clientY, lanes);
    const next = { columnKey: column.key, date: column.date, startMinutes, endMinutes: startMinutes + 60 };
    dragRef.current = next;
    setDrag(next);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const moveCreate = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const minutes = minutesFromY(event.clientY, event.currentTarget);
    const startMinutes = Math.min(current.startMinutes, minutes);
    const endMinutes = Math.max(current.startMinutes, minutes);
    const next = { ...current, startMinutes, endMinutes: Math.max(endMinutes, startMinutes + SNAP) };
    dragRef.current = next;
    setDrag(next);
  };

  const endCreate = (column: BoardColumn) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current || current.endMinutes - current.startMinutes < SNAP) return;
    const instructor =
      instructors.find((row) => row.id === column.instructorId || row.id === column.key) ||
      instructors.find((row) => row.id === focusKey);
    const staffName =
      column.staffName && column.staffName !== "New staff"
        ? column.staffName
        : instructor?.name || (layer === "front-desk" ? "" : "");
    const guessedLocation =
      location ||
      rooms.find((room) => instructor?.locations.toLowerCase().includes(room.location.toLowerCase()))?.location ||
      locations[0] ||
      "";
    const roomChoices = roomsForLocation(guessedLocation);
    setConfirm({
      layer,
      date: column.date,
      weekDay: weekDayFromIso(column.date),
      columnKey: column.key,
      staffName,
      instructorId: instructor?.id,
      startTime: minutesToTime(current.startMinutes),
      endTime: minutesToTime(current.endMinutes),
      location: guessedLocation,
      roomId: roomChoices[0]?.id ?? "",
      kind: layer === "teacher" ? "permanent" : "permanent",
    });
  };

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await postSchedule({ layer, ...body });
      setMenu(null);
      setConfirm(null);
      setLockIn(null);
      await load();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Schedule update failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveConfirm = async () => {
    if (!confirm) return;
    if (layer === "teacher") {
      if (!confirm.instructorId) {
        setError("Pick an instructor for this permanent shift.");
        return;
      }
      await run({
        action: "add_schedule",
        instructorId: confirm.instructorId,
        weekDay: confirm.weekDay,
        startTime: confirm.startTime,
        endTime: confirm.endTime,
        location: confirm.location,
        roomId: confirm.roomId,
        effectiveFrom: confirm.date,
      });
      return;
    }
    await run({
      action: confirm.kind === "one_off" ? "add_daily" : "save_master",
      staffName: confirm.staffName,
      location: confirm.location,
      date: confirm.date,
      weekDay: confirm.weekDay,
      startTime: confirm.startTime,
      endTime: confirm.endTime,
      effectiveFrom: confirm.date,
    });
  };

  const heading = layer === "teacher" ? "Teachers" : "Front Desk";
  const eventCount = allShifts.filter((shift) => visibleDates.includes(shift.date)).length;

  return (
    <section className="studio-schedule is-master is-staff-editor">
      <div className="studio-schedule-head">
        <div>
          <p className="card-title">Studio</p>
          <h2>{mode === "weekly" ? "This week" : weekdayLabel(day)}</h2>
          <div className="studio-schedule-legend">
            {layer === "teacher" ? (
              <span className="is-lesson">Permanent teacher block</span>
            ) : (
              <>
                <span className="is-lesson">Daily lock-in</span>
                <span className="is-program">Master preview</span>
              </>
            )}
            <span className="studio-schedule-meta">
              {loading ? "Loading…" : `${eventCount} ${eventCount === 1 ? "block" : "blocks"}`}
              {busy ? " · saving" : ""}
            </span>
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
            <button type="button" onClick={() => setDay(addDaysIso(day, mode === "weekly" ? -7 : -1))} aria-label="Previous">
              ‹
            </button>
            <button type="button" onClick={() => setDay(today)}>
              Today
            </button>
            <button type="button" onClick={() => setDay(addDaysIso(day, mode === "weekly" ? 7 : 1))} aria-label="Next">
              ›
            </button>
          </div>
        </div>
      </div>
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
        {layer === "teacher" ? (
          <label className="profile-select compact">
            Instructor
            <select value={focusKey} onChange={(event) => setFocusKey(event.target.value)}>
              <option value="">All instructors</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="profile-select compact">
            Staff
            <select value={focusKey} onChange={(event) => setFocusKey(event.target.value)}>
              <option value="">All staff</option>
              {(frontDesk?.staffNames ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="staff-schedule-hint">
          Drag an empty column to create a {layer === "teacher" ? "permanent weekday shift" : "shift"}. Right-click a
          block to split or delete.
        </p>
      </div>
      {error ? (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>
      ) : null}
      <div className="studio-schedule-board" ref={boardRef}>
        <div
          className={`studio-schedule-grid ${mode}${staffDaily ? " staff" : ""}`}
          style={{
            minHeight: gridHeight,
            gridTemplateColumns: staffDaily
              ? `44px repeat(${Math.max(1, columns.length)}, minmax(112px, 1fr))`
              : "52px repeat(7, minmax(110px, 1fr))",
          }}
        >
          <div className="studio-schedule-hours" aria-hidden>
            {staffDaily || mode === "weekly" ? <div className="studio-schedule-colhead" /> : null}
            {hours.map((hour) => (
              <div key={hour} className="studio-schedule-hour" style={{ height: hourHeight }}>
                {formatMinutes(hour * 60)}
              </div>
            ))}
          </div>
          {columns.map((column) => (
            <div className={`studio-schedule-col ${column.date === today ? "is-today" : ""}`} key={column.key}>
              {staffDaily || mode === "weekly" ? (
                <div className="studio-schedule-colhead">{column.label}</div>
              ) : null}
              <div
                className="studio-schedule-lanes"
                style={{ height: gridHeight, backgroundSize: `100% ${hourHeight}px` }}
                onPointerDown={(event) => beginCreate(column, event)}
                onPointerMove={moveCreate}
                onPointerUp={() => endCreate(column)}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setDrag(null);
                }}
              >
                {showNow && column.date === today ? (
                  <div
                    className="studio-schedule-now"
                    style={{ top: ((nowMinutes - startHour * 60) / 60) * hourHeight }}
                  />
                ) : null}
                {column.blocks.map((block) => {
                  const top = ((block.startMinutes - startHour * 60) / 60) * hourHeight;
                  const height = Math.max(24, ((block.endMinutes - block.startMinutes) / 60) * hourHeight - 4);
                  return (
                    <button
                      key={block.id}
                      className={`studio-schedule-block staff-shift is-${block.kind}`}
                      type="button"
                      style={{ top, height, left: 4, right: 4, width: "auto" }}
                      onClick={() => {
                        if (block.kind === "master-preview") setLockIn(block);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const splitMinutes = Math.round((block.startMinutes + block.endMinutes) / 2 / SNAP) * SNAP;
                        setMenu({
                          x: event.clientX,
                          y: event.clientY,
                          block,
                          splitTime: minutesToTime(splitMinutes),
                        });
                      }}
                    >
                      <span className="studio-schedule-block-copy">
                        <strong>{block.title}</strong>
                        <span>
                          {formatMinutes(block.startMinutes)}–{formatMinutes(block.endMinutes)}
                          {block.detail ? ` · ${block.detail}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {drag && drag.columnKey === column.key && drag.date === column.date ? (
                  <div
                    className="studio-schedule-block staff-shift is-preview"
                    style={{
                      top: ((Math.min(drag.startMinutes, drag.endMinutes) - startHour * 60) / 60) * hourHeight,
                      height: Math.max(
                        24,
                        ((Math.abs(drag.endMinutes - drag.startMinutes)) / 60) * hourHeight,
                      ),
                      left: 4,
                      right: 4,
                    }}
                  >
                    New shift
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {!columns.length && !loading ? (
          <p className="studio-schedule-empty">
            {layer === "teacher"
              ? "No teacher blocks this day. Pick an instructor, then drag in their column to add a permanent weekday shift."
              : "No Front Desk staff on this day. Drag in a staff column, or type a name after dragging an empty space."}
          </p>
        ) : null}
      </div>

      {menu ? (
        <div className="staff-schedule-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <p>
            {menu.block.title}
            <span>
              {formatMinutes(menu.block.startMinutes)}–{formatMinutes(menu.block.endMinutes)}
            </span>
          </p>
          {menu.block.kind === "master-preview" ? (
            <>
              <button type="button" onClick={() => setLockIn(menu.block)}>
                Add to daily
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(dismissed);
                  next.add(menu.block.id);
                  writeDismissed(next);
                  setDismissed(next);
                  setMenu(null);
                }}
              >
                Hide for this day
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run({ action: "delete_master", id: menu.block.id })}
              >
                Delete master
              </button>
            </>
          ) : (
            <>
              <label>
                Split at
                <input
                  type="time"
                  value={menu.splitTime}
                  onChange={(event) => setMenu({ ...menu, splitTime: event.target.value })}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    layer === "teacher"
                      ? {
                          action: "split_times",
                          id: menu.block.id,
                          splitTime: menu.splitTime,
                          effectiveFrom: menu.block.date,
                        }
                      : {
                          action: "split_daily",
                          id: menu.block.id,
                          date: menu.block.date,
                          splitTime: menu.splitTime,
                        },
                  )
                }
              >
                Split shift
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    layer === "teacher"
                      ? { action: "delete_schedule", id: menu.block.id, effectiveFrom: menu.block.date }
                      : { action: "delete_daily", id: menu.block.id },
                  )
                }
              >
                Delete
              </button>
            </>
          )}
          <button type="button" onClick={() => setMenu(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      {confirm ? (
        <div className="staff-schedule-modal" role="dialog" aria-label="Confirm new shift">
          <div className="staff-schedule-modal-card">
            <p className="card-title">New {heading.toLowerCase()} shift</p>
            <h3>
              {confirm.staffName || "Staff"} · {weekdayLabel(confirm.date)}
            </h3>
            {layer === "front-desk" ? (
              <div className="seg">
                <button
                  className={confirm.kind === "permanent" ? "on" : ""}
                  type="button"
                  onClick={() => setConfirm({ ...confirm, kind: "permanent" })}
                >
                  Permanent
                </button>
                <button
                  className={confirm.kind === "one_off" ? "on" : ""}
                  type="button"
                  onClick={() => setConfirm({ ...confirm, kind: "one_off" })}
                >
                  One-off
                </button>
              </div>
            ) : (
              <p className="staff-schedule-hint">This writes the recurring weekday teacher schedule from this date forward.</p>
            )}
            {layer === "teacher" ? (
              <label className="profile-select compact">
                Instructor
                <select
                  value={confirm.instructorId ?? ""}
                  onChange={(event) => {
                    const instructor = instructors.find((row) => row.id === event.target.value);
                    setConfirm({
                      ...confirm,
                      instructorId: event.target.value,
                      staffName: instructor?.name ?? "",
                    });
                  }}
                >
                  <option value="">Select instructor</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="profile-select compact">
                Name
                <input
                  value={confirm.staffName}
                  onChange={(event) => setConfirm({ ...confirm, staffName: event.target.value })}
                />
              </label>
            )}
            <label className="profile-select compact">
              Location
              <select
                value={confirm.location}
                onChange={(event) => {
                  const nextLocation = event.target.value;
                  const nextRoom = roomsForLocation(nextLocation)[0]?.id ?? "";
                  setConfirm({ ...confirm, location: nextLocation, roomId: nextRoom });
                }}
              >
                {locations.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            {layer === "teacher" ? (
              <label className="profile-select compact">
                Room
                <select
                  value={confirm.roomId}
                  onChange={(event) => setConfirm({ ...confirm, roomId: event.target.value })}
                >
                  {roomsForLocation(confirm.location).map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="staff-schedule-times">
              <label>
                Start
                <input
                  type="time"
                  value={confirm.startTime}
                  onChange={(event) => setConfirm({ ...confirm, startTime: event.target.value })}
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  value={confirm.endTime}
                  onChange={(event) => setConfirm({ ...confirm, endTime: event.target.value })}
                />
              </label>
            </div>
            <div className="staff-schedule-actions">
              <button className="btn" type="button" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void saveConfirm()}>
                Save shift
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lockIn ? (
        <div className="staff-schedule-modal" role="dialog" aria-label="Lock in master shift">
          <div className="staff-schedule-modal-card">
            <p className="card-title">Master preview</p>
            <h3>
              {lockIn.staffName} · {weekdayLabel(lockIn.date)}
            </h3>
            <p className="staff-schedule-hint">
              {formatMinutes(lockIn.startMinutes)}–{formatMinutes(lockIn.endMinutes)} · {lockIn.location}. Add to daily
              to lock this day in.
            </p>
            <div className="staff-schedule-actions">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const next = new Set(dismissed);
                  next.add(lockIn.id);
                  writeDismissed(next);
                  setDismissed(next);
                  setLockIn(null);
                }}
              >
                Hide for this day
              </button>
              <button className="btn" type="button" onClick={() => setLockIn(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run({
                    action: "lock_in",
                    staffName: lockIn.staffName,
                    location: lockIn.location,
                    date: lockIn.date,
                    startTime: lockIn.startTime,
                    endTime: lockIn.endTime,
                  })
                }
              >
                Add to daily
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
