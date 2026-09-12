import type { ScheduleBlock } from "@/lib/ops-roster/schedule";

const STORAGE_KEY = "cadenza.lesson-status.v1";
export const LESSON_STATUS_EVENT = "cadenza-lesson-status";

type StatusMap = Record<string, string>;

export function lessonStatusKey(block: ScheduleBlock) {
  return `${block.kind}:${block.studentId}:${block.date}:${block.startMinutes}:${block.instructorId}:${block.description}`;
}

function readMap(): StatusMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StatusMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: StatusMap) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(LESSON_STATUS_EVENT));
}

export function markLessonComplete(block: ScheduleBlock) {
  const map = readMap();
  map[lessonStatusKey(block)] = "Complete";
  writeMap(map);
}

export function isLessonComplete(block: ScheduleBlock) {
  if (/^complete/i.test(block.status)) return true;
  return readMap()[lessonStatusKey(block)] === "Complete";
}

export function applyLocalLessonStatus(blocks: ScheduleBlock[]): ScheduleBlock[] {
  const map = readMap();
  return blocks.map((block) => {
    const local = map[lessonStatusKey(block)];
    return local ? { ...block, status: local } : block;
  });
}
