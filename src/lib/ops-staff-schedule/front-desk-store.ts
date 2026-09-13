import crypto from "node:crypto";
import { getOpsStaffClient } from "@/lib/ops-staff-schedule/ops";
import {
  buildEasternDateTime,
  isoFromInstant,
  normalizeTime,
  normalizeWeekDay,
  priorDayIso,
} from "@/lib/ops-staff-schedule/time";
import { FD_LOCATIONS, type FrontDeskLocation } from "@/lib/ops-staff-schedule/types";

export type FrontDeskMasterShift = {
  id: string;
  employeeName: string;
  location: string;
  weekDay: string;
  startTime: string;
  endTime: string;
  recurring: "Yes" | "No";
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

export type FrontDeskDailyShift = {
  id: string;
  employeeName: string;
  location: string;
  start: string;
  end: string;
  status: string;
};

type MasterRow = {
  id: string;
  employee_name: string;
  location: string;
  week_day: string;
  start_time: string;
  end_time: string;
  recurring: string;
  effective_from: string | null;
  effective_to: string | null;
};

type DailyRow = {
  id: string;
  employee_name: string;
  location: string;
  start_at: string;
  end_at: string;
  status: string;
};

function normalizeLocation(location: string): FrontDeskLocation {
  const match = FD_LOCATIONS.find((item) => item.toLowerCase() === location.trim().toLowerCase());
  if (!match) throw new Error("Invalid location.");
  return match;
}

function isInactive(status: string) {
  const value = status.trim().toLowerCase();
  return value === "delete" || value === "archived-split";
}

function rowToMaster(row: MasterRow): FrontDeskMasterShift {
  return {
    id: row.id,
    employeeName: row.employee_name,
    location: row.location,
    weekDay: row.week_day,
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    recurring: row.recurring === "Yes" ? "Yes" : "No",
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

function rowToDaily(row: DailyRow): FrontDeskDailyShift {
  return {
    id: row.id,
    employeeName: row.employee_name,
    location: row.location,
    start: row.start_at,
    end: row.end_at,
    status: row.status ?? "",
  };
}

export async function listFrontDeskMasterShifts(): Promise<FrontDeskMasterShift[]> {
  const client = getOpsStaffClient();
  const { data, error } = await client
    .from("front_desk_master_shifts")
    .select(
      "id, employee_name, location, week_day, start_time, end_time, recurring, effective_from, effective_to",
    )
    .order("employee_name", { ascending: true });
  if (error) throw new Error(`Failed to load Front Desk master: ${error.message}`);
  return ((data ?? []) as MasterRow[]).map(rowToMaster);
}

export async function listFrontDeskDailyShifts(fromDateIso: string, toDateIso: string) {
  const client = getOpsStaffClient();
  const [fromYear, fromMonth, fromDay] = fromDateIso.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDateIso.split("-").map(Number);
  const start = buildEasternDateTime(fromYear, fromMonth, fromDay, 0, 0);
  const next = new Date(Date.UTC(toYear, toMonth - 1, toDay + 1));
  const endExclusive = buildEasternDateTime(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
  );
  const { data, error } = await client
    .from("front_desk_daily_shifts")
    .select("id, employee_name, location, start_at, end_at, status")
    .gte("start_at", start.toISOString())
    .lt("start_at", endExclusive.toISOString())
    .order("start_at", { ascending: true });
  if (error) throw new Error(`Failed to load Front Desk daily: ${error.message}`);
  return ((data ?? []) as DailyRow[]).map(rowToDaily).filter((row) => !isInactive(row.status));
}

export async function saveFrontDeskMasterShift(input: {
  id?: string | null;
  employeeName: string;
  location: string;
  weekDay: string;
  startTime: string;
  endTime: string;
  recurring?: string;
  userEmail: string;
  effectiveFrom?: string | null;
}): Promise<{ id: string; supersededId?: string }> {
  const client = getOpsStaffClient();
  const employeeName = input.employeeName.trim();
  const location = normalizeLocation(input.location);
  const weekDay = normalizeWeekDay(input.weekDay);
  const startTime = normalizeTime(input.startTime);
  const endTime = normalizeTime(input.endTime);
  const recurring = input.recurring === "No" ? "No" : "Yes";
  const effectiveFrom = input.effectiveFrom?.trim() || null;
  if (!employeeName) throw new Error("Employee name is required.");
  if (endTime <= startTime) throw new Error("End time must be after start time.");

  const nowIso = new Date().toISOString();

  if (effectiveFrom && input.id) {
    const { data: existing, error: loadError } = await client
      .from("front_desk_master_shifts")
      .select(
        "id, employee_name, location, week_day, start_time, end_time, recurring, effective_from, effective_to",
      )
      .eq("id", input.id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!existing) throw new Error("Master shift not found.");
    const current = rowToMaster(existing as MasterRow);
    if (current.startTime === startTime && current.endTime === endTime) {
      const { error } = await client
        .from("front_desk_master_shifts")
        .update({
          employee_name: employeeName,
          location,
          week_day: weekDay,
          start_time: startTime,
          end_time: endTime,
          recurring,
          updated_at: nowIso,
          updated_by: input.userEmail,
        })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
      return { id: input.id };
    }
    if (current.effectiveFrom !== effectiveFrom) {
      const { error: closeError } = await client
        .from("front_desk_master_shifts")
        .update({
          effective_to: priorDayIso(effectiveFrom),
          updated_at: nowIso,
          updated_by: input.userEmail,
        })
        .eq("id", input.id);
      if (closeError) throw new Error(closeError.message);
      const newId = crypto.randomUUID();
      const { error: insertError } = await client.from("front_desk_master_shifts").insert({
        id: newId,
        employee_name: employeeName,
        location,
        week_day: weekDay,
        start_time: startTime,
        end_time: endTime,
        recurring,
        effective_from: effectiveFrom,
        effective_to: null,
        updated_at: nowIso,
        updated_by: input.userEmail,
      });
      if (insertError) throw new Error(insertError.message);
      return { id: newId, supersededId: input.id };
    }
  }

  if (input.id) {
    const { error } = await client
      .from("front_desk_master_shifts")
      .update({
        employee_name: employeeName,
        location,
        week_day: weekDay,
        start_time: startTime,
        end_time: endTime,
        recurring,
        updated_at: nowIso,
        updated_by: input.userEmail,
      })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return { id: input.id };
  }

  const id = crypto.randomUUID();
  const { error } = await client.from("front_desk_master_shifts").insert({
    id,
    employee_name: employeeName,
    location,
    week_day: weekDay,
    start_time: startTime,
    end_time: endTime,
    recurring,
    effective_from: effectiveFrom,
    effective_to: null,
    updated_at: nowIso,
    updated_by: input.userEmail,
  });
  if (error) throw new Error(error.message);
  return { id };
}

export async function deleteFrontDeskMasterShift(id: string) {
  const client = getOpsStaffClient();
  const { error } = await client.from("front_desk_master_shifts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addFrontDeskDailyShift(input: {
  employeeName: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  userEmail: string;
}) {
  const location = normalizeLocation(input.location);
  const employeeName = input.employeeName.trim();
  if (!employeeName) throw new Error("Employee name is required.");
  const [year, month, day] = input.date.split("-").map(Number);
  const [startHour, startMinute] = normalizeTime(input.startTime).split(":").map(Number);
  const [endHour, endMinute] = normalizeTime(input.endTime).split(":").map(Number);
  const start = buildEasternDateTime(year, month, day, startHour, startMinute);
  let end = buildEasternDateTime(year, month, day, endHour, endMinute);
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const client = getOpsStaffClient();
  const { error } = await client.from("front_desk_daily_shifts").insert({
    id,
    employee_name: employeeName,
    location,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    last_modified: nowIso,
    status: "",
    updated_at: nowIso,
    updated_by: input.userEmail,
  });
  if (error) throw new Error(error.message);
  return { id };
}

export async function deleteFrontDeskDailyShift(id: string, userEmail: string) {
  const client = getOpsStaffClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("front_desk_daily_shifts")
    .update({
      status: "Delete",
      last_modified: nowIso,
      updated_at: nowIso,
      updated_by: userEmail,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Shift not found.");
}

export async function updateFrontDeskDailyTimes(input: {
  id: string;
  startIso: string;
  endIso: string;
  userEmail: string;
}) {
  const client = getOpsStaffClient();
  const start = new Date(input.startIso);
  const end = new Date(input.endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid start or end time.");
  }
  if (end.getTime() <= start.getTime()) throw new Error("End time must be after start time.");
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("front_desk_daily_shifts")
    .update({
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      last_modified: nowIso,
      updated_at: nowIso,
      updated_by: input.userEmail,
    })
    .eq("id", input.id)
    .neq("status", "Delete")
    .neq("status", "Archived-Split")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Shift not found or was already updated.");
  return { id: input.id };
}

export async function splitFrontDeskDailyShift(input: {
  id: string;
  splitIso: string;
  userEmail: string;
}): Promise<{ ids: [string, string] }> {
  const client = getOpsStaffClient();
  const { data: existing, error: loadError } = await client
    .from("front_desk_daily_shifts")
    .select("id, employee_name, location, start_at, end_at, status")
    .eq("id", input.id)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Shift not found.");
  const row = existing as DailyRow;
  if (isInactive(row.status)) throw new Error("Shift was already updated.");

  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  const split = new Date(input.splitIso);
  if (split.getTime() <= start.getTime() || split.getTime() >= end.getTime()) {
    throw new Error("Split time must be between shift start and end.");
  }

  const secondId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const [updateResult, insertResult] = await Promise.all([
    client
      .from("front_desk_daily_shifts")
      .update({
        end_at: split.toISOString(),
        last_modified: nowIso,
        updated_at: nowIso,
        updated_by: input.userEmail,
      })
      .eq("id", input.id)
      .neq("status", "Delete")
      .neq("status", "Archived-Split")
      .select("id")
      .maybeSingle(),
    client.from("front_desk_daily_shifts").insert({
      id: secondId,
      employee_name: row.employee_name,
      location: row.location,
      start_at: split.toISOString(),
      end_at: end.toISOString(),
      last_modified: nowIso,
      status: "",
      updated_at: nowIso,
      updated_by: input.userEmail,
    }),
  ]);
  if (updateResult.error) throw new Error(updateResult.error.message);
  if (!updateResult.data) throw new Error("Shift not found or was already updated.");
  if (insertResult.error) {
    await client
      .from("front_desk_daily_shifts")
      .update({
        end_at: end.toISOString(),
        last_modified: nowIso,
        updated_at: nowIso,
        updated_by: input.userEmail,
      })
      .eq("id", input.id);
    throw new Error(insertResult.error.message);
  }
  return { ids: [input.id, secondId] };
}

export function dailyShiftDate(shift: FrontDeskDailyShift) {
  return isoFromInstant(new Date(shift.start));
}
