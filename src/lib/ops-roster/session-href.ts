import type { ScheduleBlock } from "@/lib/ops-roster/schedule";

export type StudioRole = "instructor" | "student" | "parent";

export function sessionPath(role: StudioRole, block: ScheduleBlock) {
  const id = encodeURIComponent(block.id);
  if (block.kind === "program") return `/${role}/programs/${id}`;
  return `/${role}/session/${id}`;
}

export function findScheduleBlock(schedule: ScheduleBlock[], rawId: string) {
  const decoded = decodeURIComponent(rawId);
  return schedule.find((block) => block.id === rawId || block.id === decoded) ?? null;
}
