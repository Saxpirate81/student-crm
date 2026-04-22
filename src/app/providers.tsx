"use client";

import { useLayoutEffect } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { markMockRepositoryHydrated } from "@/lib/data/mockRepository";

export function Providers({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    markMockRepositoryHydrated();
  }, []);

  return (
    <AuthProvider>
      {children}
      <ChunkLoadRecovery />
    </AuthProvider>
  );
}
