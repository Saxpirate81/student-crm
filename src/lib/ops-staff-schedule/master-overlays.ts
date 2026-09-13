import { instructorIdFromName, normalizePersonName } from "@/lib/ops-roster/households";
import { formatMinutes } from "@/lib/ops-roster/time";
import { staffNamesMatch } from "@/lib/ops-staff-schedule/name-match";
import type { StaffShiftBlock } from "@/lib/ops-staff-schedule/types";

export type MasterOverlayKind = "master" | "front-desk" | "front-desk-master";

export type MasterOverlayBlock = {
  id: string;
  kind: MasterOverlayKind;
  date: string;
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
  staffName: string;
  location?: string;
  roomName?: string;
  detail?: string;
};

export function overlayInstructorId(name: string) {
  return instructorIdFromName(normalizePersonName(name) || name);
}

export function overlayInstructorName(name: string) {
  return normalizePersonName(name) || name.trim();
}

export function overlayFromShift(shift: StaffShiftBlock): MasterOverlayBlock | null {
  const kind: MasterOverlayKind | null =
    shift.layer === "teacher" && shift.kind === "permanent"
      ? "master"
      : shift.layer === "front-desk" && shift.kind === "daily"
        ? "front-desk"
        : shift.layer === "front-desk" && shift.kind === "master-preview"
          ? "front-desk-master"
          : null;
  if (!kind) return null;
  return {
    id: `${kind}:${shift.id}:${shift.date}`,
    kind,
    date: shift.date,
    startMinutes: shift.startMinutes,
    endMinutes: shift.endMinutes,
    startLabel: formatMinutes(shift.startMinutes),
    endLabel: formatMinutes(shift.endMinutes),
    staffName: shift.staffName,
    location: shift.location,
    roomName: shift.roomName,
    detail: shift.detail,
  };
}

export function findStaffMatch<T extends { name: string }>(rows: T[], staffName: string) {
  return rows.find((row) => staffNamesMatch(row.name, staffName));
}

export function overlaysForStaff(overlays: MasterOverlayBlock[], staffName: string, date: string) {
  return overlays.filter((row) => row.date === date && staffNamesMatch(row.staffName, staffName));
}

export function mergeOverlayInstructors(
  attendance: Array<{ id: string; name: string }>,
  registry: Array<{ name: string }>,
) {
  const rows = [...attendance];
  for (const instructor of registry) {
    if (findStaffMatch(rows, instructor.name)) continue;
    const name = overlayInstructorName(instructor.name);
    rows.push({ id: overlayInstructorId(instructor.name), name });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
