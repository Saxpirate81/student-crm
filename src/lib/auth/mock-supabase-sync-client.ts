import type { MockSupabaseParentSignupPayload } from "@/lib/auth/mock-supabase-sync-payload";

/**
 * Fire-and-forget: mirrors mock parent signup into Supabase `app_core` via `/api/mock-auth/sync`.
 * Enable with `NEXT_PUBLIC_ENABLE_MOCK_SUPABASE_SYNC=1` and matching `MOCK_SUPABASE_SYNC_SECRET`
 * (server) + `NEXT_PUBLIC_MOCK_SUPABASE_SYNC_SECRET` (client, dev only).
 */
export function requestMockParentSignupSync(payload: MockSupabaseParentSignupPayload): void {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_ENABLE_MOCK_SUPABASE_SYNC !== "1") return;
  const secret = process.env.NEXT_PUBLIC_MOCK_SUPABASE_SYNC_SECRET?.trim();
  if (!secret) return;

  void fetch("/api/mock-auth/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-sync-secret": secret,
    },
    body: JSON.stringify({ kind: "parent_signup" as const, payload }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        console.warn("[mock-supabase-sync]", res.status, text);
      }
    })
    .catch((err) => {
      console.warn("[mock-supabase-sync]", err);
    });
}
