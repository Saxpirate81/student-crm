import type { AppRepository } from "@/lib/data/repository";
import { mockRepository } from "@/lib/data/mockRepository";
import { isSupabaseDataSource } from "@/lib/config/data-source";

export { isSupabaseDataSource } from "@/lib/config/data-source";

export function getRepository(): AppRepository {
  if (!isSupabaseDataSource()) {
    return mockRepository;
  }

  if (typeof window === "undefined") {
    return mockRepository;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync client-only load; avoids pulling this module into the server RSC graph
  const { supabaseRepository } = require("./supabaseRepository") as {
    supabaseRepository: AppRepository;
  };
  return supabaseRepository;
}
