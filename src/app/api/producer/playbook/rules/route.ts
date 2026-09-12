import { NextResponse } from "next/server";
import { createRule } from "@/lib/producer/server-actions";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const row = body as Record<string, unknown>;
  const taskName = String(row.taskName ?? "").trim();
  const targetLesson = Number(row.targetLesson);
  if (!taskName || !Number.isFinite(targetLesson) || targetLesson < 1) {
    return NextResponse.json({ error: "taskName and targetLesson are required." }, { status: 400 });
  }

  const result = await createRule({
    playbookVersion: String(row.playbookVersion ?? "Current"),
    learningTrack: String(row.learningTrack ?? "All"),
    targetLesson,
    placement: row.placement === "between" ? "between" : "lesson",
    taskName,
    taskType: String(row.taskType ?? "System Action"),
    executionMode: String(row.executionMode ?? "Manual"),
    assignee: String(row.assignee ?? "Both"),
    teacherDescription: String(row.teacherDescription ?? ""),
    opsDescription: String(row.opsDescription ?? ""),
    status: String(row.status ?? "Active"),
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error });
  return NextResponse.json({ ok: true });
}
