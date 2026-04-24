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
import {
  addChildForParent,
  completeParentPasswordReset,
  loginChild as authenticateChild,
  loginParent as authenticateParent,
  loginProducer as authenticateProducer,
  requestParentPasswordReset,
  resetChildPasswordByParent,
  signUpParentAndOptionalChild,
  type SignUpChildInput,
  type SignUpParentInput,
} from "@/lib/auth/mock-auth-store";

const SESSION_KEY = "real-school-mock-session-v1";

function readSession(): MockSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MockSession;
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
  loginAsParent: (email: string, password: string) => boolean;
  loginAsChild: (parentEmail: string, screenName: string, password: string) => boolean;
  loginAsProducer: (email: string, password: string) => boolean;
  signUp: (
    input: SignUpParentInput,
    firstChild?: SignUpChildInput | null,
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

  const loginAsParent = useCallback((email: string, password: string) => {
    const next = authenticateParent(email, password);
    if (!next) return false;
    setSession(next);
    writeSession(next);
    return true;
  }, []);

  const loginAsChild = useCallback((parentEmail: string, screenName: string, password: string) => {
    const next = authenticateChild(parentEmail, screenName, password);
    if (!next) return false;
    setSession(next);
    writeSession(next);
    return true;
  }, []);

  const loginAsProducer = useCallback((email: string, password: string) => {
    const next = authenticateProducer(email, password);
    if (!next) return false;
    setSession(next);
    writeSession(next);
    return true;
  }, []);

  const signUp = useCallback((input: SignUpParentInput, firstChild?: SignUpChildInput | null) => {
    const result = signUpParentAndOptionalChild(input, firstChild);
    if (!result.ok) return result;
    setSession(result.session);
    writeSession(result.session);
    return { ok: true as const };
  }, []);

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
