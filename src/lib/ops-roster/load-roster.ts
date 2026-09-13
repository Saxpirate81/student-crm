import {
  buildInstructorsFromStudents,
  buildRosterFromAttendance,
  type AttendanceContactRow,
  type RosterInstructor,
  type RosterStudent,
} from "@/lib/ops-roster/households";
import { getOpsAttendanceClient } from "@/lib/ops-roster/ops-client";
import { buildScheduleBlocks, type ScheduleBlock } from "@/lib/ops-roster/schedule";
import { addDaysIso, mondayOfWeek, todayEasternIso } from "@/lib/ops-roster/time";

const PAGE_SIZE = 1000;
const MAX_ROWS = 80000;
const PAGE_CONCURRENCY = 8;
const CACHE_TTL_MS = 10 * 60 * 1000;
const ROSTER_CACHE_VERSION = 6;
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

async function fetchAttendanceWindow(fromDate: string, toDate: string): Promise<AttendanceContactRow[]> {
  const supabase = getOpsAttendanceClient();
  const rows: AttendanceContactRow[] = [];
  let from = 0;

  while (rows.length < MAX_ROWS) {
    const batchSize = Math.min(PAGE_CONCURRENCY, Math.ceil((MAX_ROWS - rows.length) / PAGE_SIZE));
    const pages = await Promise.all(
      Array.from({ length: batchSize }, (_, index) => {
        const start = from + index * PAGE_SIZE;
        return supabase
          .from("master_attendance_data")
          .select(SELECT_COLS)
          .gte("date", fromDate)
          .lte("date", toDate)
          .not("student_id", "is", null)
          .order("date", { ascending: true })
          .order("student_id", { ascending: true })
          .range(start, start + PAGE_SIZE - 1);
      }),
    );

    let shortPage = false;
    for (const { data, error } of pages) {
      if (error) throw new Error(error.message);
      const page = (data ?? []) as AttendanceContactRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) {
        shortPage = true;
        break;
      }
    }
    if (shortPage) break;
    from += batchSize * PAGE_SIZE;
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
    const rows = await fetchAttendanceWindow(scheduleFrom, scheduleTo);
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
