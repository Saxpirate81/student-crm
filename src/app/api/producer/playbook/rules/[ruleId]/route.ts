import { NextResponse } from "next/server";
import { updateRule } from "@/lib/producer/server-actions";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const { ruleId } = await params;
  if (!ruleId) return NextResponse.json({ error: "ruleId is required." }, { status: 400 });

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
  const patch: Record<string, unknown> = {};

  if ("playbookVersion" in row) patch.playbookVersion = String(row.playbookVersion ?? "Current");
  if ("learningTrack" in row) patch.learningTrack = String(row.learningTrack ?? "All");
  if ("targetLesson" in row) patch.targetLesson = Number(row.targetLesson);
  if ("placement" in row) patch.placement = row.placement === "between" ? "between" : "lesson";
  if ("taskName" in row) patch.taskName = String(row.taskName ?? "");
  if ("taskType" in row) patch.taskType = String(row.taskType ?? "System Action");
  if ("executionMode" in row) patch.executionMode = String(row.executionMode ?? "Manual");
  if ("assignee" in row) patch.assignee = String(row.assignee ?? "Both");
  if ("teacherDescription" in row) patch.teacherDescription = String(row.teacherDescription ?? "");
  if ("opsDescription" in row) patch.opsDescription = String(row.opsDescription ?? "");
  if ("status" in row) patch.status = String(row.status ?? "Active");

  const result = await updateRule(ruleId, patch);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error });
  return NextResponse.json({ ok: true });
}
