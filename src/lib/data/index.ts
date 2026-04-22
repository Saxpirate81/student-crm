import type { AppRepository } from "@/lib/data/repository";
import { mockRepository } from "@/lib/data/mockRepository";

const dataSource = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock";

export function getRepository(): AppRepository {
  if (dataSource === "supabase") {
    return mockRepository;
  }

  return mockRepository;
}
