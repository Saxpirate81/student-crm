"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { MockSession } from "@/lib/auth/types";

function isValidMockSession(value: unknown): value is MockSession {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.kind === "parent") {
    return (
      typeof row.organizationId === "string" &&
      typeof row.parentId === "string" &&
      typeof row.parentCrmId === "string" &&
      typeof row.email === "string" &&
      typeof row.displayName === "string"
    );
  }
  if (row.kind === "child") {
    return (
      typeof row.organizationId === "string" &&
      typeof row.parentId === "string" &&
      typeof row.childId === "string" &&
      typeof row.parentCrmId === "string" &&
      typeof row.studentCrmId === "string" &&
      typeof row.screenName === "string"
    );
  }
  if (row.kind === "producer") {
    return typeof row.email === "string" && typeof row.displayName === "string";
  }
  return false;
}
import {
  addChildForParent,
  completeParentPasswordReset,
  loginChild as authenticateChild,
  loginParent as authenticateParent,
  loginProducer as authenticateProducer,
  requestParentPasswordReset,
  resetChildPasswordByParent,
  signUpParentWithInvite,
  type SignUpChildInput,
  type SignUpParentInput,
} from "@/lib/auth/mock-auth-store";
import { requestMockParentSignupSync } from "@/lib/auth/mock-supabase-sync-client";
import { advanceHeroGreetingRotation } from "@/lib/greetings/rotating-hero-greeting";
import { isSupabaseDataSource } from "@/lib/config/data-source";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

const SESSION_KEY = "real-school-mock-session-v1";

function readSession(): MockSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidMockSession(parsed)) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: MockSession | null) {
  if (typeof window === "undefined") return;
  if (!session) window.sessionStorage.removeItem(SESSION_KEY);
  else window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

type AuthContextValue = {
  session: MockSession | null;
  ready: boolean;
  loginAsParent: (email: string, password: string) => Promise<boolean>;
  loginAsChild: (parentEmail: string, screenName: string, password: string) => Promise<boolean>;
  loginAsProducer: (email: string, password: string) => Promise<boolean>;
  signUp: (
    input: SignUpParentInput,
    firstChild: SignUpChildInput | null | undefined,
    inviteToken: string,
  ) => { ok: true } | { ok: false; error: string };
  addChild: (input: SignUpChildInput) => { ok: true } | { ok: false; error: string };
  requestEmailReset: (email: string) => { ok: true; token: string } | { ok: false; silent: true };
  completeEmailReset: (token: string, newPassword: string) => { ok: true } | { ok: false; error: string };
  resetChildPassword: (childId: string, newPassword: string) => { ok: true } | { ok: false; error: string };
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<MockSession | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  const loginAsParent = useCallback(async (email: string, password: string) => {
    const next = authenticateParent(email, password);
    if (!next) return false;
    advanceHeroGreetingRotation("parent");
    setSession(next);
    writeSession(next);
    return true;
  }, []);

  const loginAsChild = useCallback(async (parentEmail: string, screenName: string, password: string) => {
    const next = authenticateChild(parentEmail, screenName, password);
    if (!next) return false;
    advanceHeroGreetingRotation("student");
    setSession(next);
    writeSession(next);
    return true;
  }, []);

  const loginAsProducer = useCallback(async (email: string, password: string) => {
    const mockProducer = authenticateProducer(email, password);
    if (mockProducer) {
      advanceHeroGreetingRotation("producer");
      setSession(mockProducer);
      writeSession(mockProducer);
      return true;
    }

    if (isSupabaseDataSource() && isSupabaseConfigured()) {
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (!error) {
        const next: MockSession = {
          kind: "producer",
          email: email.trim().toLowerCase(),
          displayName: email.includes("@") ? email.split("@")[0] : "Producer",
        };
        advanceHeroGreetingRotation("producer");
        setSession(next);
        writeSession(next);
        return true;
      }
    }

    return false;
  }, []);

  const signUp = useCallback(
    (input: SignUpParentInput, firstChild: SignUpChildInput | null | undefined, inviteToken: string) => {
      const result = signUpParentWithInvite(inviteToken, input, firstChild);
      if (!result.ok) return result;
      advanceHeroGreetingRotation("parent");
      setSession(result.session);
      writeSession(result.session);
      requestMockParentSignupSync({
        mockOrganizationId: result.session.organizationId,
        organizationName: result.organizationName,
        createdNewOrganization: result.createdNewOrganization,
        parent: {
          mockParentId: result.session.parentId,
          email: result.session.email,
          password: input.password,
          displayName: result.session.displayName,
          parentCrmId: result.session.parentCrmId,
        },
        child: result.child,
      });
      return { ok: true as const };
    },
    [],
  );

  const addChild = useCallback(
    (input: SignUpChildInput) => {
      if (session?.kind !== "parent") return { ok: false as const, error: "Sign in as a parent first." };
      const result = addChildForParent(session, input);
      if (!result.ok) return result;
      return { ok: true as const };
    },
    [session],
  );

  const requestEmailReset = useCallback((email: string) => {
    return requestParentPasswordReset(email);
  }, []);

  const completeEmailReset = useCallback((token: string, newPassword: string) => {
    return completeParentPasswordReset(token, newPassword);
  }, []);

  const resetChildPassword = useCallback(
    (childId: string, newPassword: string) => {
      if (session?.kind !== "parent") return { ok: false as const, error: "Sign in as a parent first." };
      return resetChildPasswordByParent(session, childId, newPassword);
    },
    [session],
  );

  const logout = useCallback(() => {
    setSession(null);
    writeSession(null);
    if (isSupabaseConfigured()) {
      try {
        void getSupabaseBrowserClient().auth.signOut();
      } catch {
        /* ignore — misconfigured client should not block logout */
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      ready,
      loginAsParent,
      loginAsChild,
      loginAsProducer,
      signUp,
      addChild,
      requestEmailReset,
      completeEmailReset,
      resetChildPassword,
      logout,
    }),
    [
      session,
      ready,
      loginAsParent,
      loginAsChild,
      loginAsProducer,
      signUp,
      addChild,
      requestEmailReset,
      completeEmailReset,
      resetChildPassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
