"use client";

import { createContext, useContext } from "react";

/** Built in `StudentStudioShell` — pages read this instead of duplicating studio state. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StudentStudioBundle = any;

const StudentStudioContext = createContext<StudentStudioBundle | null>(null);

export function StudentStudioProvider({ value, children }: { value: StudentStudioBundle; children: React.ReactNode }) {
  return <StudentStudioContext.Provider value={value}>{children}</StudentStudioContext.Provider>;
}

export function useStudentStudio(): StudentStudioBundle {
  const ctx = useContext(StudentStudioContext);
  if (!ctx) {
    throw new Error("useStudentStudio must be used within StudentStudioLayout");
  }
  return ctx;
}
