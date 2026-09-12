import { NextResponse } from "next/server";
import { updateRule } from "@/lib/producer/server-actions";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const { ruleId } = await params;
  if (!ruleId) return NextResponse.json({ error: "ruleId is required." }, { status: 400 });

  const result = await updateRule(ruleId, { status: "Archived" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
