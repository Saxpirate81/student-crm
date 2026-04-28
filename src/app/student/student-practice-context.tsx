"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { PracticeMilestoneFlash } from "@/components/PracticeMilestoneFlash";
import { useMicPracticeDetector } from "@/hooks/useMicPracticeDetector";
import { getRepository } from "@/lib/data";
import { MOCK_USER_KEYS } from "@/lib/data/repository";
import {
  addPracticeSeconds,
  consumePracticeMilestones,
  getPracticeTotalSeconds,
} from "@/lib/practice-total";

export type PracticeSegment = {
  id: string;
  endedAtIso: string;
  durationSec: number;
};

type StudentPracticeContextValue = {
  userKey: string;
  totalPracticeSeconds: number;
  activeSegmentSeconds: number;
  micStatus: "idle" | "listening" | "denied";
  /** Mic-based practice runs automatically on lesson and video pages. */
  micTrackingActive: boolean;
  /** Call after the user allows mic in the browser to retry capture without reloading. */
  retryMicAccess: () => void;
  recentSegments: PracticeSegment[];
  milestoneFlashMinutes: number | null;
  dismissMilestone: () => void;
};

const StudentPracticeContext = createContext<StudentPracticeContextValue | null>(null);

export function useStudentPractice() {
  const ctx = useContext(StudentPracticeContext);
  if (!ctx) {
    throw new Error("useStudentPractice must be used within StudentPracticeProvider");
  }
  return ctx;
}

export function StudentPracticeProvider({ children }: { children: React.ReactNode }) {
  const userKey = MOCK_USER_KEYS.student;
  const pathname = usePathname() ?? "";
  const micTrackingActive =
    pathname.startsWith("/student/lessons/") || pathname.startsWith("/student/videos/");

  const [totalPracticeSeconds, setTotalPracticeSeconds] = useState(0);
  const [recentSegments, setRecentSegments] = useState<PracticeSegment[]>([]);
  const [milestoneFlashMinutes, setMilestoneFlashMinutes] = useState<number | null>(null);
  const [micRetryNonce, setMicRetryNonce] = useState(0);

  const retryMicAccess = useCallback(() => {
    setMicRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    setTotalPracticeSeconds(getPracticeTotalSeconds(userKey));
  }, [userKey]);

  const onSegmentComplete = useCallback(
    (durationSec: number) => {
      const repo = getRepository();
      const lessonMatch = pathname.match(/^\/student\/lessons\/([^/]+)/);
      const videoMatch = pathname.match(/^\/student\/videos\/([^/]+)/);
      let crmId: string | null = null;
      if (lessonMatch) {
        crmId = repo.getLesson(lessonMatch[1])?.studentCrmId ?? null;
      } else if (videoMatch) {
        crmId = repo.getVideo(videoMatch[1])?.studentCrmId ?? null;
      }
      if (crmId && durationSec > 0) {
        repo.recordDailyPracticeMinutes(crmId, durationSec / 60);
      }

      const prevTotal = getPracticeTotalSeconds(userKey);
      const nextTotal = addPracticeSeconds(userKey, durationSec);
      setTotalPracticeSeconds(nextTotal);

      const milestone = consumePracticeMilestones(userKey, prevTotal, nextTotal);
      if (milestone) {
        setMilestoneFlashMinutes(milestone.minutes);
        window.setTimeout(() => setMilestoneFlashMinutes(null), 3200);
      }

      setRecentSegments((prev) => {
        const next: PracticeSegment[] = [
          {
            id: `seg-${Date.now()}`,
            endedAtIso: new Date().toISOString(),
            durationSec,
          },
          ...prev,
        ];
        return next.slice(0, 12);
      });
    },
    [userKey, pathname],
  );

  const { micStatus, activeSeconds } = useMicPracticeDetector({
    enabled: micTrackingActive,
    onSegmentComplete,
    retryNonce: micRetryNonce,
  });

  const dismissMilestone = useCallback(() => setMilestoneFlashMinutes(null), []);

  const value = useMemo(
    () => ({
      userKey,
      totalPracticeSeconds,
      activeSegmentSeconds: activeSeconds,
      micStatus,
      micTrackingActive,
      retryMicAccess,
      recentSegments,
      milestoneFlashMinutes,
      dismissMilestone,
    }),
    [
      userKey,
      totalPracticeSeconds,
      activeSeconds,
      micStatus,
      micTrackingActive,
      retryMicAccess,
      recentSegments,
      milestoneFlashMinutes,
      dismissMilestone,
    ],
  );

  return (
    <Fragment>
      <StudentPracticeContext.Provider value={value}>{children}</StudentPracticeContext.Provider>
      <PracticeMilestoneFlash minutes={milestoneFlashMinutes} onDismiss={dismissMilestone} />
    </Fragment>
  );
}
