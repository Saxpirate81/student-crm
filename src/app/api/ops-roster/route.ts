import { NextResponse } from "next/server";
import { loadOpsRoster } from "@/lib/ops-roster/load-roster";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  try {
    const roster = await loadOpsRoster();
    return NextResponse.json(roster);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load attendance roster.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
