/** Local calendar day key `YYYY-MM-DD` (browser local timezone). */
export function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DEFAULT_DAILY_GOAL_MINUTES = 15;

function parseDay(key: string): Date {
  const [y, mo, da] = key.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(y, mo - 1, da);
}

function formatDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

/**
 * Counts consecutive local days ending at `anchorDay` where practice minutes >= goal.
 * If `anchorDay` is below goal, streak is 0 (today must be hit to continue the chain).
 */
export function computePracticeStreakDays(
  minutesByDay: Record<string, number>,
  anchorDay: string,
  goalMinutes: number,
): number {
  let streak = 0;
  let cursor = parseDay(anchorDay);
  for (let i = 0; i < 400; i += 1) {
    const key = formatDay(cursor);
    const minutes = minutesByDay[key] ?? 0;
    if (minutes >= goalMinutes) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

/** Monday (index 0) through Sunday (index 6) of the calendar week that contains `anchor`. */
export function weekMinutesMonToSun(
  minutesByDay: Record<string, number>,
  anchor: Date = new Date(),
): number[] {
  const anchorDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const dow = anchorDate.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(anchorDate, mondayOffset);
  const out: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(monday, i);
    out.push(minutesByDay[formatDay(d)] ?? 0);
  }
  return out;
}

/** Index 0 = Monday … 6 = Sunday for the week containing `anchor`. */
export function monSunIndexForDate(anchor: Date = new Date()): number {
  const dow = anchor.getDay();
  return dow === 0 ? 6 : dow - 1;
}
