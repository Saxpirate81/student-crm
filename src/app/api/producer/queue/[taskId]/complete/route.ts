import { NextResponse } from "next/server";
import { completeTask } from "@/lib/producer/server-actions";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  if (!taskId) return NextResponse.json({ error: "taskId is required." }, { status: 400 });

  const result = await completeTask(taskId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
