const TOTAL_KEY_PREFIX = "rs-practice-total-sec-";
const MILESTONE_KEY_PREFIX = "rs-practice-milestone-celebrated-sec-";

export function practiceTotalStorageKey(userKey: string) {
  return `${TOTAL_KEY_PREFIX}${userKey}`;
}

export function practiceMilestoneStorageKey(userKey: string) {
  return `${MILESTONE_KEY_PREFIX}${userKey}`;
}

export function getPracticeTotalSeconds(userKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(practiceTotalStorageKey(userKey));
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function addPracticeSeconds(userKey: string, seconds: number) {
  if (typeof window === "undefined") return 0;
  const prev = getPracticeTotalSeconds(userKey);
  if (seconds <= 0) return prev;

  const rounded = Math.round(seconds);
  if (rounded <= 0) return prev;

  const next = prev + rounded;
  try {
    window.localStorage.setItem(practiceTotalStorageKey(userKey), String(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Highest multiple of 10 minutes (600s) already celebrated with a toast. */
export function getCelebratedPracticeFloorSec(userKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(practiceMilestoneStorageKey(userKey));
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function setCelebratedPracticeFloorSec(userKey: string, floorSec: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(practiceMilestoneStorageKey(userKey), String(floorSec));
  } catch {
    /* ignore */
  }
}

const TEN_MIN_SEC = 600;

/**
 * After adding time, returns milestone minutes to celebrate (10, 20, …), or null.
 * Only fires once per new 10-minute block crossed.
 */
export function consumePracticeMilestones(
  userKey: string,
  previousTotalSec: number,
  newTotalSec: number,
): { minutes: number; newFloor: number } | null {
  const celebrated = getCelebratedPracticeFloorSec(userKey);
  const newFloor = Math.floor(newTotalSec / TEN_MIN_SEC) * TEN_MIN_SEC;

  if (newFloor <= 0) return null;
  if (newFloor <= celebrated) return null;
  if (previousTotalSec >= newFloor) return null;

  setCelebratedPracticeFloorSec(userKey, newFloor);
  return { minutes: newFloor / 60, newFloor };
}

export function practiceTierIndex(totalSeconds: number) {
  return Math.floor(totalSeconds / TEN_MIN_SEC);
}
