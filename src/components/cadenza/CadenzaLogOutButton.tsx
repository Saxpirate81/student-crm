"use client";

import { useAuth } from "@/lib/auth/auth-context";

/** Ends mock + Supabase session; AuthGate sends unauthenticated users to `/auth/login`. */
export function CadenzaLogOutButton() {
  const { logout } = useAuth();
  return (
    <button type="button" className="sidebar-logout-btn" onClick={() => logout()}>
      Log out
    </button>
  );
}
