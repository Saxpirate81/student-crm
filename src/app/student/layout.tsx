import { StudentPracticeProvider } from "@/app/student/student-practice-context";
import { StudentPracticeStrip } from "@/components/StudentPracticeStrip";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentPracticeProvider>
      <StudentPracticeStrip />
      {children}
    </StudentPracticeProvider>
  );
}
