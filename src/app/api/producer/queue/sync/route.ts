import { NextResponse } from "next/server";
import { syncQueueFromRules } from "@/lib/producer/server-actions";

export async function POST() {
  const result = await syncQueueFromRules();
  if (!result.ok) {
    return NextResponse.json({ ok: false, inserted: 0, error: result.error });
  }
  return NextResponse.json({ ok: true, inserted: result.inserted });
}
