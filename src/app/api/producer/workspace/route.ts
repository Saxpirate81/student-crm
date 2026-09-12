import { NextResponse } from "next/server";
import { getProducerWorkspaceSnapshot } from "@/lib/producer/server-workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getProducerWorkspaceSnapshot();
    return NextResponse.json({ snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load producer workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
