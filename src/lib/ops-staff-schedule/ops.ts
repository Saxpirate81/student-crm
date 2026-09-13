import { getOpsAttendanceClient } from "@/lib/ops-roster/ops-client";

export function hasOpsStaffScheduleConfig() {
  return Boolean(
    process.env.OPS_SUPABASE_URL?.trim() && process.env.OPS_SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function assertOpsStaffScheduleReady() {
  if (!hasOpsStaffScheduleConfig()) {
    throw new Error(
      "Ops attendance is not configured. Set OPS_SUPABASE_URL and OPS_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
}

export function getOpsStaffClient() {
  assertOpsStaffScheduleReady();
  return getOpsAttendanceClient();
}

export function staffScheduleActorEmail(value?: string | null) {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return process.env.CADENZA_SCHEDULE_ACTOR_EMAIL?.trim() || "cadenza-admin@realschool.local";
}
