"use client";

import { useLayoutEffect } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { AuthGate } from "@/components/auth/AuthGate";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { ensureSimpleTestOrgInBundle } from "@/lib/auth/mock-auth-store";
import { markMockRepositoryHydrated } from "@/lib/data/mockRepository";

export function Providers({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    ensureSimpleTestOrgInBundle();
    markMockRepositoryHydrated();
  }, []);

  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
      <ChunkLoadRecovery />
    </AuthProvider>
  );
}
