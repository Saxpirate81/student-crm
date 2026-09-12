import {
  instructorIdFromName,
  isLessonCategory,
  isVisibleScheduleStatus,
  normalizePersonName,
  serviceLabel,
} from "@/lib/ops-roster/households";
import { formatMinutes, parseClockToMinutes } from "@/lib/ops-roster/time";

export type AttendanceScheduleRow = {
  student_id?: string | number | null;
  student_name?: string | null;
  instructor_name?: string | null;
  description?: string | null;
  category?: string | null;
  product?: string | null;
  status?: string | null;
  date?: string | null;
  start?: string | null;
  end?: string | null;
  location?: string | null;
};

export type ScheduleBlock = {
  id: string;
  studentId: string;
  studentIds: string[];
  studentName: string;
  instructorId: string;
  instructorName: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
  description: string;
  category: string;
  product: string;
  kind: "lesson" | "program";
  status: string;
  location: string;
  mergedCount: number;
};

const MERGE_GAP_MINUTES = 5;

function compactLabel(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (!trimmed.includes(" : ")) return trimmed;
  return trimmed.split(/\s+:\s+/)[0]?.trim() || trimmed;
}

function uniqueJoin(values: string[]) {
  return [...new Set(values.map((value) => compactLabel(value)).filter(Boolean))].join(", ");
}

function programClassKey(block: ScheduleBlock) {
  return `${block.date}|${block.instructorId}|${block.description}|${block.category}`;
}

export function blockIncludesStudent(block: ScheduleBlock, studentId?: string | null) {
  if (!studentId) return false;
  if (block.studentIds?.includes(studentId)) return true;
  return block.studentId === studentId;
}

export function buildScheduleBlocks(
  rows: AttendanceScheduleRow[],
  range?: { fromDate: string; toDate: string },
): ScheduleBlock[] {
  const lessons: ScheduleBlock[] = [];
  const programs: ScheduleBlock[] = [];

  for (const row of rows) {
    if (!isVisibleScheduleStatus(row.status)) continue;
    const studentId = String(row.student_id ?? "").trim();
    const instructorName = String(row.instructor_name ?? "").trim();
    const date = String(row.date ?? "").slice(0, 10);
    if (!studentId || !instructorName || !date) continue;
    if (range && (date < range.fromDate || date > range.toDate)) continue;
    const startMinutes = parseClockToMinutes(row.start);
    if (startMinutes == null) continue;
    let endMinutes = parseClockToMinutes(row.end);
    if (endMinutes == null || endMinutes <= startMinutes) endMinutes = startMinutes + 30;
    const category = String(row.category ?? "").trim();
    const kind = isLessonCategory(category) ? "lesson" : "program";
    const description = serviceLabel(category, row.description);
    const product = compactLabel(String(row.product ?? "").trim());
    const block: ScheduleBlock = {
      id: `${kind}:${studentId}:${date}:${startMinutes}:${instructorIdFromName(instructorName)}:${description}`,
      studentId,
      studentIds: [studentId],
      studentName: normalizePersonName(row.student_name) || "Student",
      instructorId: instructorIdFromName(instructorName),
      instructorName: normalizePersonName(instructorName) || instructorName,
      date,
      startMinutes,
      endMinutes,
      startLabel: formatMinutes(startMinutes),
      endLabel: formatMinutes(endMinutes),
      description,
      category,
      product,
      kind,
      status: String(row.status ?? "").trim(),
      location: String(row.location ?? "").trim(),
      mergedCount: 1,
    };
    (kind === "lesson" ? lessons : programs).push(block);
  }

  lessons.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.instructorId !== b.instructorId) return a.instructorId.localeCompare(b.instructorId);
    if (a.studentId !== b.studentId) return a.studentId.localeCompare(b.studentId);
    if (a.description !== b.description) return a.description.localeCompare(b.description);
    return a.startMinutes - b.startMinutes;
  });

  const mergedLessons: ScheduleBlock[] = [];
  for (const block of lessons) {
    const prev = mergedLessons[mergedLessons.length - 1];
    const sameSlot =
      prev &&
      prev.date === block.date &&
      prev.studentId === block.studentId &&
      prev.instructorId === block.instructorId &&
      prev.description === block.description &&
      block.startMinutes <= prev.endMinutes + MERGE_GAP_MINUTES;
    if (prev && sameSlot) {
      prev.endMinutes = Math.max(prev.endMinutes, block.endMinutes);
      prev.endLabel = formatMinutes(prev.endMinutes);
      prev.mergedCount += 1;
      continue;
    }
    mergedLessons.push({ ...block });
  }

  programs.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.instructorId !== b.instructorId) return a.instructorId.localeCompare(b.instructorId);
    if (a.description !== b.description) return a.description.localeCompare(b.description);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.startMinutes - b.startMinutes;
  });

  const mergedPrograms: ScheduleBlock[] = [];
  for (const block of programs) {
    const prev = mergedPrograms[mergedPrograms.length - 1];
    const sameClass =
      prev &&
      programClassKey(prev) === programClassKey(block) &&
      block.startMinutes <= prev.endMinutes + MERGE_GAP_MINUTES;
    if (prev && sameClass) {
      prev.endMinutes = Math.max(prev.endMinutes, block.endMinutes);
      prev.endLabel = formatMinutes(prev.endMinutes);
      prev.studentIds = [...new Set([...prev.studentIds, ...block.studentIds])];
      prev.product = uniqueJoin([prev.product, block.product]);
      prev.mergedCount = prev.studentIds.length;
      continue;
    }
    mergedPrograms.push({
      ...block,
      id: `program:${programClassKey(block)}:${block.startMinutes}`,
    });
  }

  return [...mergedLessons, ...mergedPrograms];
}
