import { addDaysIso, mondayOfWeek, todayEasternIso } from "@/lib/ops-roster/time";
import {
  addInstructorSchedule,
  deleteInstructorSchedule,
  listInstructorScheduleShifts,
  splitInstructorSchedule,
  updateInstructorScheduleTimes,
} from "@/lib/ops-staff-schedule/instructor-store";
import {
  addFrontDeskDailyShift,
  deleteFrontDeskDailyShift,
  deleteFrontDeskMasterShift,
  listFrontDeskDailyShifts,
  listFrontDeskMasterShifts,
  saveFrontDeskMasterShift,
  splitFrontDeskDailyShift,
  updateFrontDeskDailyTimes,
} from "@/lib/ops-staff-schedule/front-desk-store";
import { staffScheduleActorEmail } from "@/lib/ops-staff-schedule/ops";
import { listInstructorRegistry, listRoomRegistry, resolveRoomId } from "@/lib/ops-staff-schedule/registry";
import {
  buildEasternDateTime,
  easternPartsFromInstant,
  isEffectiveOnIso,
  minutesToTime,
  timeToMinutes,
  weekDayFromIso,
} from "@/lib/ops-staff-schedule/time";
import { FD_LOCATIONS, type FrontDeskSchedulePayload, type StaffShiftBlock, type TeacherSchedulePayload } from "@/lib/ops-staff-schedule/types";

export async function loadTeacherSchedule(date: string): Promise<TeacherSchedulePayload> {
  const weekDay = weekDayFromIso(date);
  const monday = mondayOfWeek(date);
  const days = Array.from({ length: 7 }, (_, index) => addDaysIso(monday, index));
  const [instructors, rooms, rows] = await Promise.all([
    listInstructorRegistry(),
    listRoomRegistry(),
    listInstructorScheduleShifts(),
  ]);
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const instructorById = new Map(instructors.map((row) => [row.id, row]));
  const shifts: StaffShiftBlock[] = [];
  for (const iso of days) {
    const isoWeekDay = weekDayFromIso(iso);
    for (const row of rows) {
      if (row.weekDay !== isoWeekDay) continue;
      if (!isEffectiveOnIso(iso, row.effectiveFrom, row.effectiveTo)) continue;
      const instructor = instructorById.get(row.instructorId);
      const room = roomById.get(row.roomId);
      if (!instructor) continue;
      shifts.push({
        id: row.id,
        layer: "teacher",
        kind: "permanent",
        columnKey: instructor.id,
        date: iso,
        weekDay: isoWeekDay,
        startMinutes: timeToMinutes(row.startTime),
        endMinutes: timeToMinutes(row.endTime),
        startTime: row.startTime,
        endTime: row.endTime,
        title: instructor.name,
        detail: room ? `${room.name} · ${room.location}` : undefined,
        staffName: instructor.name,
        location: room?.location,
        roomId: row.roomId,
        roomName: room?.name,
        instructorId: instructor.id,
      });
    }
  }
  return { layer: "teacher", date, weekDay, instructors, rooms, shifts };
}

export async function loadFrontDeskSchedule(fromDate: string, toDate: string): Promise<FrontDeskSchedulePayload> {
  const [master, daily] = await Promise.all([
    listFrontDeskMasterShifts(),
    listFrontDeskDailyShifts(fromDate, toDate),
  ]);
  const shifts: StaffShiftBlock[] = [];
  const staffNames = new Set<string>();

  for (const row of daily) {
    const start = new Date(row.start);
    const end = new Date(row.end);
    const startParts = easternPartsFromInstant(start);
    const endParts = easternPartsFromInstant(end);
    const date = `${startParts.year}-${String(startParts.month).padStart(2, "0")}-${String(startParts.day).padStart(2, "0")}`;
    const startMinutes = startParts.hours * 60 + startParts.minutes;
    const endMinutes = endParts.hours * 60 + endParts.minutes;
    staffNames.add(row.employeeName);
    shifts.push({
      id: row.id,
      layer: "front-desk",
      kind: "daily",
      columnKey: row.employeeName,
      date,
      weekDay: weekDayFromIso(date),
      startMinutes,
      endMinutes: endMinutes > startMinutes ? endMinutes : startMinutes + 60,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes > startMinutes ? endMinutes : startMinutes + 60),
      title: row.employeeName,
      detail: row.location,
      staffName: row.employeeName,
      location: row.location,
    });
  }

  const today = todayEasternIso();
  for (let cursor = fromDate; cursor <= toDate; cursor = addDaysIso(cursor, 1)) {
    if (cursor < today) continue;
    const weekDay = weekDayFromIso(cursor);
    for (const row of master) {
      if (row.weekDay !== weekDay) continue;
      if (!isEffectiveOnIso(cursor, row.effectiveFrom, row.effectiveTo)) continue;
      const overlappingDaily = shifts.some(
        (shift) =>
          shift.kind === "daily" &&
          shift.date === cursor &&
          shift.staffName.trim().toLowerCase() === row.employeeName.trim().toLowerCase() &&
          shift.startMinutes < timeToMinutes(row.endTime) &&
          shift.endMinutes > timeToMinutes(row.startTime),
      );
      if (overlappingDaily) continue;
      staffNames.add(row.employeeName);
      shifts.push({
        id: `preview:${row.id}:${cursor}`,
        layer: "front-desk",
        kind: "master-preview",
        columnKey: row.employeeName,
        date: cursor,
        weekDay,
        startMinutes: timeToMinutes(row.startTime),
        endMinutes: timeToMinutes(row.endTime),
        startTime: row.startTime,
        endTime: row.endTime,
        title: row.employeeName,
        detail: `${row.location} · master`,
        staffName: row.employeeName,
        location: row.location,
      });
    }
  }

  return {
    layer: "front-desk",
    fromDate,
    toDate,
    locations: [...FD_LOCATIONS],
    staffNames: [...staffNames].sort((a, b) => a.localeCompare(b)),
    shifts,
  };
}

export async function mutateTeacherSchedule(body: Record<string, unknown>) {
  const action = String(body.action || "");
  const userEmail = staffScheduleActorEmail(typeof body.actorEmail === "string" ? body.actorEmail : null);
  const effectiveFrom = typeof body.effectiveFrom === "string" ? body.effectiveFrom : null;

  if (action === "add_schedule") {
    const rooms = await listRoomRegistry();
    const location = String(body.location || rooms[0]?.location || "");
    const roomId =
      typeof body.roomId === "string" && body.roomId
        ? body.roomId
        : await resolveRoomId({
            location,
            roomName: typeof body.roomName === "string" ? body.roomName : undefined,
          });
    return addInstructorSchedule({
      instructorId: String(body.instructorId || ""),
      roomId,
      weekDay: String(body.weekDay || ""),
      startTime: String(body.startTime || ""),
      endTime: String(body.endTime || ""),
      userEmail,
      effectiveFrom,
    });
  }
  if (action === "update_times") {
    return updateInstructorScheduleTimes({
      id: String(body.id || ""),
      startTime: String(body.startTime || ""),
      endTime: String(body.endTime || ""),
      roomId: typeof body.roomId === "string" ? body.roomId : undefined,
      instructorId: typeof body.instructorId === "string" ? body.instructorId : undefined,
      userEmail,
      effectiveFrom,
    });
  }
  if (action === "split_times") {
    return splitInstructorSchedule({
      id: String(body.id || ""),
      splitTime: String(body.splitTime || ""),
      userEmail,
      effectiveFrom,
    });
  }
  if (action === "delete_schedule") {
    return deleteInstructorSchedule({
      id: String(body.id || ""),
      userEmail,
      effectiveFrom,
    });
  }
  throw new Error("Unknown teacher schedule action.");
}

export async function mutateFrontDeskSchedule(body: Record<string, unknown>) {
  const action = String(body.action || "");
  const userEmail = staffScheduleActorEmail(typeof body.actorEmail === "string" ? body.actorEmail : null);

  if (action === "add_daily") {
    return addFrontDeskDailyShift({
      employeeName: String(body.staffName || body.employeeName || ""),
      location: String(body.location || ""),
      date: String(body.date || ""),
      startTime: String(body.startTime || ""),
      endTime: String(body.endTime || ""),
      userEmail,
    });
  }
  if (action === "save_master") {
    return saveFrontDeskMasterShift({
      id: typeof body.id === "string" && !body.id.startsWith("preview:") ? body.id : null,
      employeeName: String(body.staffName || body.employeeName || ""),
      location: String(body.location || ""),
      weekDay: String(body.weekDay || ""),
      startTime: String(body.startTime || ""),
      endTime: String(body.endTime || ""),
      recurring: "Yes",
      userEmail,
      effectiveFrom: typeof body.effectiveFrom === "string" ? body.effectiveFrom : null,
    });
  }
  if (action === "lock_in") {
    return addFrontDeskDailyShift({
      employeeName: String(body.staffName || ""),
      location: String(body.location || ""),
      date: String(body.date || ""),
      startTime: String(body.startTime || ""),
      endTime: String(body.endTime || ""),
      userEmail,
    });
  }
  if (action === "update_daily_times") {
    const date = String(body.date || "");
    const [year, month, day] = date.split("-").map(Number);
    const startTime = String(body.startTime || "");
    const endTime = String(body.endTime || "");
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    return updateFrontDeskDailyTimes({
      id: String(body.id || ""),
      startIso: buildEasternDateTime(year, month, day, startHour, startMinute).toISOString(),
      endIso: buildEasternDateTime(year, month, day, endHour, endMinute).toISOString(),
      userEmail,
    });
  }
  if (action === "split_daily") {
    const date = String(body.date || "");
    const [year, month, day] = date.split("-").map(Number);
    const splitTime = String(body.splitTime || "");
    const [hours, minutes] = splitTime.split(":").map(Number);
    return splitFrontDeskDailyShift({
      id: String(body.id || ""),
      splitIso: buildEasternDateTime(year, month, day, hours, minutes).toISOString(),
      userEmail,
    });
  }
  if (action === "delete_daily") {
    await deleteFrontDeskDailyShift(String(body.id || ""), userEmail);
    return { ok: true };
  }
  if (action === "delete_master") {
    const id = String(body.id || "").replace(/^preview:/, "").split(":")[0] ?? "";
    await deleteFrontDeskMasterShift(id);
    return { ok: true };
  }
  throw new Error("Unknown Front Desk schedule action.");
}

export function defaultFrontDeskRange(today: string) {
  const fromDate = mondayOfWeek(today);
  return { fromDate, toDate: addDaysIso(fromDate, 6) };
}
