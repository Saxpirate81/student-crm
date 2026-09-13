import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let opsClient: SupabaseClient | null = null;

/**
 * Attendance / master schedule live in the Ops Supabase project
 * (same as Operations Portal `OPS_SUPABASE_*`), not the Cue auth project.
 */
export function getOpsAttendanceClient(): SupabaseClient {
  const opsUrl = process.env.OPS_SUPABASE_URL?.trim();
  const opsKey = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (opsUrl && opsKey) {
    opsClient ??= createClient(opsUrl, opsKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return opsClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Ops attendance is not configured. Set OPS_SUPABASE_URL and OPS_SUPABASE_SERVICE_ROLE_KEY (same as the Operations Portal).",
    );
  }
  opsClient ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return opsClient;
}
