/**
 * Server-safe env read. Do not import `@/lib/data` here — that graph can pull
 * `supabaseRepository` into RSC / SSR evaluation.
 */
export function isSupabaseDataSource() {
  return (process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock") === "supabase";
}
