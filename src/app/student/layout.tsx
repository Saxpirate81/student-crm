import { StudentPracticeProvider } from "@/app/student/student-practice-context";
import { StudentPracticeStrip } from "@/components/StudentPracticeStrip";
import { StudentSessionGate } from "@/components/StudentSessionGate";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentPracticeProvider>
      <StudentPracticeStrip />
      <StudentSessionGate>{children}</StudentSessionGate>
    </StudentPracticeProvider>
  );
}
