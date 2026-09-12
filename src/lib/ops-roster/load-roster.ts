import { createClient } from "@supabase/supabase-js";
import {
  buildInstructorsFromStudents,
  buildRosterFromAttendance,
  type AttendanceContactRow,
  type RosterInstructor,
  type RosterStudent,
} from "@/lib/ops-roster/households";
import { buildScheduleBlocks, type ScheduleBlock } from "@/lib/ops-roster/schedule";
import { addDaysIso, mondayOfWeek, todayEasternIso } from "@/lib/ops-roster/time";

const PAGE_SIZE = 1000;
const MAX_ROWS = 80000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const ROSTER_CACHE_VERSION = 5;
const SELECT_COLS =
  "student_id,student_name,primary_name,primary_email,student_email,phone_numbers,instructor_name,description,category,product,status,date,start,end,location";

export type OpsRosterPayload = {
  students: RosterStudent[];
  instructors: RosterInstructor[];
  schedule: ScheduleBlock[];
  studentCount: number;
  householdCount: number;
  instructorCount: number;
  rowCount: number;
  fromDate: string;
  scheduleFrom: string;
  scheduleTo: string;
  loadedAt: string;
};

let cache: { expiresAt: number; version: number; payload: OpsRosterPayload } | null = null;
let inflight: Promise<OpsRosterPayload> | null = null;

function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase is not configured for the attendance roster.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAttendanceWindow(fromDate: string): Promise<AttendanceContactRow[]> {
  const supabase = getPublicClient();
  const rows: AttendanceContactRow[] = [];
  let from = 0;

  while (rows.length < MAX_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("master_attendance_data")
      .select(SELECT_COLS)
      .gte("date", fromDate)
      .not("student_id", "is", null)
      .order("date", { ascending: true })
      .order("student_id", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as AttendanceContactRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function loadOpsRoster(options?: { force?: boolean }): Promise<OpsRosterPayload> {
  if (!options?.force && cache && cache.version === ROSTER_CACHE_VERSION && cache.expiresAt > Date.now()) {
    return cache.payload;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const today = todayEasternIso();
    const scheduleFrom = mondayOfWeek(today);
    const scheduleTo = addDaysIso(today, 13);
    const rows = await fetchAttendanceWindow(scheduleFrom);
    const students = buildRosterFromAttendance(rows);
    const instructors = buildInstructorsFromStudents(students);
    const schedule = buildScheduleBlocks(rows, { fromDate: scheduleFrom, toDate: scheduleTo });
    const householdCount = new Set(students.map((student) => student.parentCrmId)).size;
    const payload: OpsRosterPayload = {
      students,
      instructors,
      schedule,
      studentCount: students.length,
      householdCount,
      instructorCount: instructors.length,
      rowCount: rows.length,
      fromDate: today,
      scheduleFrom,
      scheduleTo,
      loadedAt: new Date().toISOString(),
    };
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, version: ROSTER_CACHE_VERSION, payload };
    return payload;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
