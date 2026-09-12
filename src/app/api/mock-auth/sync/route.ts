import { NextResponse } from "next/server";
import { syncMockParentSignupToSupabase } from "@/lib/auth/mock-supabase-sync-server";
import type { MockSupabaseParentSignupPayload } from "@/lib/auth/mock-supabase-sync-payload";

type SyncBody = {
  kind: "parent_signup";
  payload: MockSupabaseParentSignupPayload;
};

function isPayload(value: unknown): value is MockSupabaseParentSignupPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const parent = p.parent as Record<string, unknown> | undefined;
  return (
    typeof p.mockOrganizationId === "string" &&
    typeof p.organizationName === "string" &&
    typeof p.createdNewOrganization === "boolean" &&
    !!parent &&
    typeof parent.mockParentId === "string" &&
    typeof parent.email === "string" &&
    typeof parent.password === "string" &&
    typeof parent.displayName === "string" &&
    typeof parent.parentCrmId === "string"
  );
}

export async function POST(req: Request) {
  const secret = process.env.MOCK_SUPABASE_SYNC_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Mock Supabase sync disabled (set MOCK_SUPABASE_SYNC_SECRET in .env.local)." },
      { status: 503 },
    );
  }
  if (req.headers.get("x-mock-sync-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const row = body as Partial<SyncBody>;
  if (row.kind !== "parent_signup" || !isPayload(row.payload)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await syncMockParentSignupToSupabase(row.payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
