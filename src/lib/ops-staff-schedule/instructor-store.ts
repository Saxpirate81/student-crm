import crypto from "node:crypto";
import { getOpsStaffClient } from "@/lib/ops-staff-schedule/ops";
import {
  mergeAdjacentIntervals,
  minutesToTime,
  normalizeTime,
  normalizeWeekDay,
  priorDayIso,
  timeToMinutes,
} from "@/lib/ops-staff-schedule/time";

export type InstructorScheduleShift = {
  id: string;
  roomId: string;
  instructorId: string;
  weekDay: string;
  startTime: string;
  endTime: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

type DbRow = {
  id: string;
  room_id: string;
  instructor_id: string;
  week_day: string;
  start_time: string;
  end_time: string;
  effective_from: string | null;
  effective_to: string | null;
};

function rowToShift(row: DbRow): InstructorScheduleShift {
  return {
    id: row.id,
    roomId: row.room_id,
    instructorId: row.instructor_id,
    weekDay: row.week_day,
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

export async function listInstructorScheduleShifts(): Promise<InstructorScheduleShift[]> {
  const client = getOpsStaffClient();
  const { data, error } = await client
    .from("instructor_schedule_shifts")
    .select("id, room_id, instructor_id, week_day, start_time, end_time, effective_from, effective_to")
    .order("instructor_id", { ascending: true })
    .order("week_day", { ascending: true });
  if (error) throw new Error(`Failed to load instructor schedule: ${error.message}`);
  return ((data ?? []) as DbRow[]).map(rowToShift);
}

async function loadShiftById(id: string) {
  const client = getOpsStaffClient();
  const { data, error } = await client
    .from("instructor_schedule_shifts")
    .select("id, room_id, instructor_id, week_day, start_time, end_time, effective_from, effective_to")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Instructor shift not found.");
  return rowToShift(data as DbRow);
}

export async function updateInstructorScheduleTimes(input: {
  id: string;
  startTime: string;
  endTime: string;
  roomId?: string | null;
  instructorId?: string | null;
  userEmail: string;
  effectiveFrom?: string | null;
}): Promise<{ id: string; supersededId?: string }> {
  const client = getOpsStaffClient();
  const startTime = normalizeTime(input.startTime);
  const endTime = normalizeTime(input.endTime);
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new Error("End time must be after start time.");
  }

  const current = await loadShiftById(input.id);
  const roomId = input.roomId?.trim() || current.roomId;
  const instructorId = input.instructorId?.trim() || current.instructorId;
  if (
    current.startTime === startTime &&
    current.endTime === endTime &&
    current.roomId === roomId &&
    current.instructorId === instructorId
  ) {
    return { id: current.id };
  }

  const nowIso = new Date().toISOString();
  const effectiveFrom = input.effectiveFrom?.trim() || null;
  const assignment = {
    start_time: startTime,
    end_time: endTime,
    room_id: roomId,
    instructor_id: instructorId,
    updated_at: nowIso,
    updated_by: input.userEmail,
  };

  if (effectiveFrom && current.effectiveFrom !== effectiveFrom) {
    const { error: closeError } = await client
      .from("instructor_schedule_shifts")
      .update({
        effective_to: priorDayIso(effectiveFrom),
        updated_at: nowIso,
        updated_by: input.userEmail,
      })
      .eq("id", input.id);
    if (closeError) throw new Error(closeError.message);

    const newId = crypto.randomUUID();
    const { error: insertError } = await client.from("instructor_schedule_shifts").insert({
      id: newId,
      week_day: current.weekDay,
      effective_from: effectiveFrom,
      effective_to: null,
      ...assignment,
    });
    if (insertError) throw new Error(insertError.message);
    return { id: newId, supersededId: input.id };
  }

  const { error } = await client.from("instructor_schedule_shifts").update(assignment).eq("id", input.id);
  if (error) throw new Error(error.message);
  return { id: input.id };
}

export async function splitInstructorSchedule(input: {
  id: string;
  splitTime: string;
  userEmail: string;
  effectiveFrom?: string | null;
}): Promise<{ ids: [string, string] }> {
  const client = getOpsStaffClient();
  const splitTime = normalizeTime(input.splitTime);
  const current = await loadShiftById(input.id);
  const startM = timeToMinutes(current.startTime);
  const splitM = timeToMinutes(splitTime);
  const endM = timeToMinutes(current.endTime);
  if (splitM <= startM || splitM >= endM) {
    throw new Error("Split time must be between shift start and end.");
  }

  const nowIso = new Date().toISOString();
  const effectiveFrom = input.effectiveFrom?.trim() || null;
  const secondId = crypto.randomUUID();

  if (effectiveFrom && current.effectiveFrom !== effectiveFrom) {
    const { error: closeError } = await client
      .from("instructor_schedule_shifts")
      .update({
        effective_to: priorDayIso(effectiveFrom),
        updated_at: nowIso,
        updated_by: input.userEmail,
      })
      .eq("id", input.id);
    if (closeError) throw new Error(closeError.message);

    const firstId = crypto.randomUUID();
    const { error: insertError } = await client.from("instructor_schedule_shifts").insert([
      {
        id: firstId,
        room_id: current.roomId,
        instructor_id: current.instructorId,
        week_day: current.weekDay,
        start_time: current.startTime,
        end_time: splitTime,
        effective_from: effectiveFrom,
        effective_to: null,
        updated_at: nowIso,
        updated_by: input.userEmail,
      },
      {
        id: secondId,
        room_id: current.roomId,
        instructor_id: current.instructorId,
        week_day: current.weekDay,
        start_time: splitTime,
        end_time: current.endTime,
        effective_from: effectiveFrom,
        effective_to: null,
        updated_at: nowIso,
        updated_by: input.userEmail,
      },
    ]);
    if (insertError) throw new Error(insertError.message);
    return { ids: [firstId, secondId] };
  }

  const { error: updateError } = await client
    .from("instructor_schedule_shifts")
    .update({
      end_time: splitTime,
      updated_at: nowIso,
      updated_by: input.userEmail,
    })
    .eq("id", input.id);
  if (updateError) throw new Error(updateError.message);

  const { error: insertError } = await client.from("instructor_schedule_shifts").insert({
    id: secondId,
    room_id: current.roomId,
    instructor_id: current.instructorId,
    week_day: current.weekDay,
    start_time: splitTime,
    end_time: current.endTime,
    effective_from: current.effectiveFrom ?? effectiveFrom,
    effective_to: current.effectiveTo ?? null,
    updated_at: nowIso,
    updated_by: input.userEmail,
  });
  if (insertError) throw new Error(insertError.message);
  return { ids: [input.id, secondId] };
}

export async function addInstructorSchedule(input: {
  instructorId: string;
  roomId: string;
  weekDay: string;
  startTime: string;
  endTime: string;
  userEmail: string;
  effectiveFrom?: string | null;
}): Promise<{ id: string; startTime: string; endTime: string; removedIds: string[] }> {
  const client = getOpsStaffClient();
  const weekDay = normalizeWeekDay(input.weekDay);
  const startTime = normalizeTime(input.startTime);
  const endTime = normalizeTime(input.endTime);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (endMinutes <= startMinutes) throw new Error("End time must be after start time.");

  const effectiveFrom = input.effectiveFrom?.trim() || null;
  const all = await listInstructorScheduleShifts();
  const sameScope = all.filter(
    (row) =>
      row.instructorId === input.instructorId &&
      row.roomId === input.roomId &&
      row.weekDay === weekDay &&
      (row.effectiveFrom ?? null) === effectiveFrom &&
      (row.effectiveTo ?? null) == null,
  );

  const merged = mergeAdjacentIntervals([
    ...sameScope.map((row) => ({
      id: row.id,
      start: timeToMinutes(row.startTime),
      end: timeToMinutes(row.endTime),
    })),
    { start: startMinutes, end: endMinutes },
  ]);

  const mergedStart = minutesToTime(merged.start);
  const mergedEnd = minutesToTime(merged.end);
  const keepId = merged.id ?? crypto.randomUUID();
  const removedIds = sameScope.map((row) => row.id).filter((id) => id !== keepId);
  const nowIso = new Date().toISOString();

  if (merged.id) {
    const { error } = await client
      .from("instructor_schedule_shifts")
      .update({
        start_time: mergedStart,
        end_time: mergedEnd,
        updated_at: nowIso,
        updated_by: input.userEmail,
      })
      .eq("id", keepId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from("instructor_schedule_shifts").insert({
      id: keepId,
      room_id: input.roomId,
      instructor_id: input.instructorId,
      week_day: weekDay,
      start_time: mergedStart,
      end_time: mergedEnd,
      effective_from: effectiveFrom,
      effective_to: null,
      updated_at: nowIso,
      updated_by: input.userEmail,
    });
    if (error) throw new Error(error.message);
  }

  if (removedIds.length) {
    const { error } = await client.from("instructor_schedule_shifts").delete().in("id", removedIds);
    if (error) throw new Error(error.message);
  }

  return { id: keepId, startTime: mergedStart, endTime: mergedEnd, removedIds };
}

export async function deleteInstructorSchedule(input: {
  id: string;
  userEmail: string;
  effectiveFrom?: string | null;
}): Promise<{ id: string; closed: boolean }> {
  const client = getOpsStaffClient();
  const current = await loadShiftById(input.id);
  const nowIso = new Date().toISOString();
  const effectiveFrom = input.effectiveFrom?.trim() || null;

  if (!effectiveFrom || current.effectiveFrom === effectiveFrom) {
    const { error } = await client.from("instructor_schedule_shifts").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    return { id: input.id, closed: false };
  }

  const { error } = await client
    .from("instructor_schedule_shifts")
    .update({
      effective_to: priorDayIso(effectiveFrom),
      updated_at: nowIso,
      updated_by: input.userEmail,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  return { id: input.id, closed: true };
}
