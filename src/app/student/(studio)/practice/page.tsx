"use client";

import { StudentStudioPracticePage } from "@/app/student/(studio)/StudentStudioShell";
import { useStudentStudio } from "@/app/student/(studio)/student-studio-context";

export default function StudentPracticeRoutePage() {
  const { practicePage } = useStudentStudio();
  return <StudentStudioPracticePage {...practicePage} />;
}
