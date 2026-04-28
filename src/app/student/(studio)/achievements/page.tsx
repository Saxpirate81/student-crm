"use client";

import { StudentStudioAchievementsPage } from "@/app/student/(studio)/StudentStudioShell";
import { useStudentStudio } from "@/app/student/(studio)/student-studio-context";

export default function StudentAchievementsRoutePage() {
  const { achievementsPage } = useStudentStudio();
  return <StudentStudioAchievementsPage {...achievementsPage} />;
}
