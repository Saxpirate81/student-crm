import { NextResponse } from "next/server";
import { todayEasternIso } from "@/lib/ops-roster/time";
import {
  defaultFrontDeskRange,
  loadFrontDeskSchedule,
  loadTeacherSchedule,
  mutateFrontDeskSchedule,
  mutateTeacherSchedule,
} from "@/lib/ops-staff-schedule/load";
import { hasOpsStaffScheduleConfig } from "@/lib/ops-staff-schedule/ops";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasOpsStaffScheduleConfig()) {
    return NextResponse.json(
      { error: "Ops schedule tables need OPS_SUPABASE_URL and OPS_SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const layer = url.searchParams.get("layer") === "front-desk" ? "front-desk" : "teacher";
  const today = todayEasternIso();

  try {
    if (layer === "teacher") {
      const date = url.searchParams.get("date") || today;
      const payload = await loadTeacherSchedule(date);
      return NextResponse.json(payload);
    }
    const fromDate = url.searchParams.get("from") || defaultFrontDeskRange(today).fromDate;
    const toDate = url.searchParams.get("to") || defaultFrontDeskRange(today).toDate;
    const payload = await loadFrontDeskSchedule(fromDate, toDate);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load staff schedule.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!hasOpsStaffScheduleConfig()) {
    return NextResponse.json(
      { error: "Ops schedule tables need OPS_SUPABASE_URL and OPS_SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const layer = body.layer === "front-desk" ? "front-desk" : "teacher";
  try {
    const result =
      layer === "front-desk" ? await mutateFrontDeskSchedule(body) : await mutateTeacherSchedule(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Schedule update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
