import type { ReactNode } from "react";
import { StudentStudioLayout } from "@/app/student/(studio)/StudentStudioShell";

export default function StudentLessonDetailLayout({ children }: { children: ReactNode }) {
  return <StudentStudioLayout>{children}</StudentStudioLayout>;
}
