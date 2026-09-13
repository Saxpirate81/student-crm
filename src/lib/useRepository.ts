"use client";

import { useLayoutEffect, useState } from "react";
import type { AppRepository } from "@/lib/data/repository";
import { getRepository } from "@/lib/data";
import { mockRepository } from "@/lib/data/mockRepository";
import {
  hydrateSupabaseRepository,
  SUPABASE_REPOSITORY_UPDATED_EVENT,
  getSupabaseRepositoryStatus,
} from "@/lib/data/supabaseRepository";
import { isSupabaseDataSource } from "@/lib/config/data-source";

const bootstrapSupabaseClient =
  (process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock") === "supabase";

export function useRepository() {
  const [repository, setRepository] = useState<AppRepository>(() =>
    bootstrapSupabaseClient ? mockRepository : getRepository(),
  );
  const [version, setVersion] = useState(0);

  useLayoutEffect(() => {
    setRepository(getRepository());
    const bump = () => setVersion((prev) => prev + 1);
    window.addEventListener("mock-repository-updated", bump);
    window.addEventListener(SUPABASE_REPOSITORY_UPDATED_EVENT, bump);
    if (isSupabaseDataSource()) hydrateSupabaseRepository();
    setVersion((prev) => prev + 1);
    return () => {
      window.removeEventListener("mock-repository-updated", bump);
      window.removeEventListener(SUPABASE_REPOSITORY_UPDATED_EVENT, bump);
    };
  }, []);

  const status = isSupabaseDataSource()
    ? getSupabaseRepositoryStatus()
    : { loading: false, error: null, rosterMeta: null, instructors: [], schedule: [] };

  return {
    repository,
    version,
    loading: status.loading,
    error: status.error,
    rosterMeta: status.rosterMeta,
    instructors: status.instructors ?? [],
    schedule: status.schedule ?? [],
    refresh: () => setVersion((prev) => prev + 1),
  };
}
