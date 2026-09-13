import { EASTERN_TZ, formatMinutes } from "@/lib/ops-roster/time";

export const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type WeekDay = (typeof WEEK_DAYS)[number];

const offsetCache = new Map<string, string>();

function easternOffsetForDate(year: number, month: number, day: number) {
  const key = `${year}-${month}-${day}`;
  const cached = offsetCache.get(key);
  if (cached) return cached;
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(probe)
    .find((item) => item.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let value = "-05:00";
  if (match) {
    value = `${match[1]}${match[2].padStart(2, "0")}:${(match[3] ?? "00").padStart(2, "0")}`;
  }
  offsetCache.set(key, value);
  return value;
}

export function buildEasternDateTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds = 0,
) {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return new Date(`${iso}${easternOffsetForDate(year, month, day)}`);
}

export function weekDayFromIso(iso: string): WeekDay {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return WEEK_DAYS[utc.getUTCDay()] ?? "Monday";
}

export function normalizeWeekDay(weekDay: string): WeekDay {
  const match = WEEK_DAYS.find((day) => day.toLowerCase() === weekDay.trim().toLowerCase());
  if (!match) throw new Error("Invalid week day.");
  return match;
}

export function normalizeTime(value: string): string {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error("Invalid time.");
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function timeToMinutes(time: string) {
  const [hours, minutes] = normalizeTime(time).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function snapMinutes(value: number, step = 15) {
  return Math.round(value / step) * step;
}

export function priorDayIso(fromIso: string) {
  const [year, month, day] = fromIso.split("-").map(Number);
  const utc = Date.UTC(year, (month ?? 1) - 1, (day ?? 1) - 1);
  return new Date(utc).toISOString().slice(0, 10);
}

export function isEffectiveOnIso(
  dayIso: string,
  effectiveFrom?: string | null,
  effectiveTo?: string | null,
) {
  if (effectiveFrom && dayIso < effectiveFrom) return false;
  if (effectiveTo && dayIso > effectiveTo) return false;
  return true;
}

export function formatClock(time: string) {
  return formatMinutes(timeToMinutes(time));
}

export function easternPartsFromInstant(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hours: pick("hour"),
    minutes: pick("minute"),
  };
}

export function isoFromInstant(date: Date) {
  const { year, month, day } = easternPartsFromInstant(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Interval = { id?: string; start: number; end: number };

export function mergeAdjacentIntervals(intervals: Interval[]): Interval {
  if (!intervals.length) throw new Error("No intervals to merge.");
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const current = { ...sorted[0] };
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]!;
    if (next.start > current.end) {
      throw new Error("Shift overlaps an existing block and cannot be added.");
    }
    if (next.end > current.end) current.end = next.end;
    if (!current.id && next.id) current.id = next.id;
  }
  return current;
}
