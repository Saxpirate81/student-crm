import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for `app_core` (server only). Requires `SUPABASE_SERVICE_ROLE_KEY`.
 * Never import this module from client components.
 */
export function getAppCoreServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "app_core" },
  }) as unknown as SupabaseClient;
}
