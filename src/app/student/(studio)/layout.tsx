import type { ReactNode } from "react";
import { StudentStudioLayout } from "@/app/student/(studio)/StudentStudioShell";

export default function StudentStudioRouteLayout({ children }: { children: ReactNode }) {
  return <StudentStudioLayout>{children}</StudentStudioLayout>;
}
