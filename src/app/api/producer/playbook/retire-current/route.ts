import { NextResponse } from "next/server";
import { retireCurrentPlaybook } from "@/lib/producer/server-actions";

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

  const archiveName = String((body as Record<string, unknown>).archiveName ?? "").trim();
  if (!archiveName) {
    return NextResponse.json({ error: "archiveName is required." }, { status: 400 });
  }

  const result = await retireCurrentPlaybook(archiveName);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
