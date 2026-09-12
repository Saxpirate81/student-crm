export const EASTERN_TZ = "America/New_York";

export function todayEasternIso(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: EASTERN_TZ });
}

export function addDaysIso(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days);
  return new Date(utc).toISOString().slice(0, 10);
}

export function mondayOfWeek(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  const weekday = date.getUTCDay(); // 0 Sun
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysIso(iso, offset);
}

export function parseClockToMinutes(value?: string | null): number | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (!Number.isFinite(hours) || hours < 1 || hours > 12 || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatMinutes(total: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  const meridiem = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour12}${meridiem}` : `${hour12}:${String(minutes).padStart(2, "0")}${meridiem}`;
}

export function currentEasternMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hours * 60 + minutes;
}
