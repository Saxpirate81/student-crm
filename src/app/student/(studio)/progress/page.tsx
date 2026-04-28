"use client";

import { StudentStudioProgressPage } from "@/app/student/(studio)/StudentStudioShell";
import { useStudentStudio } from "@/app/student/(studio)/student-studio-context";

export default function StudentProgressRoutePage() {
  const { progressPage } = useStudentStudio();
  return <StudentStudioProgressPage {...progressPage} />;
}
