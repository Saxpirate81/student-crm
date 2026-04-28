"use client";

import { StudentStudioDashboard } from "@/app/student/(studio)/StudentStudioShell";
import { useStudentStudio } from "@/app/student/(studio)/student-studio-context";

export default function StudentStudioHomePage() {
  const { dashboardProps } = useStudentStudio();
  return <StudentStudioDashboard {...dashboardProps} />;
}
