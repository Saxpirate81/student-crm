"use client";

import { StudentStudioListeningPage } from "@/app/student/(studio)/StudentStudioShell";
import { useStudentStudio } from "@/app/student/(studio)/student-studio-context";

export default function StudentListeningRoutePage() {
  const { listeningPage } = useStudentStudio();
  return <StudentStudioListeningPage {...listeningPage} />;
}
