import type { StudentProfile } from "@/lib/domain/types";

export type StudentAgeBand = NonNullable<StudentProfile["ageBand"]>;

export type StudentCopyProfile = {
  planTitle: string;
  planIntro: string;
  submitLabel: string;
  submitPlaceholder: string;
  submitButton: string;
  evidenceHint: string;
};

const profiles: Record<StudentAgeBand, StudentCopyProfile> = {
  under10: {
    planTitle: "Today’s music mission",
    planIntro: "Do these small steps. Try your best sound, then send your teacher one quick update.",
    submitLabel: "What did you play?",
    submitPlaceholder: "I played the groove two times. The beat felt...",
    submitButton: "Send my update",
    evidenceHint: "Short videos, claps, singing, raps, or instrument practice all count when they show the music task.",
  },
  "10to12": {
    planTitle: "Today’s practice quest",
    planIntro: "Work through the steps from your lesson, then send a short note or recording for your teacher.",
    submitLabel: "Practice update",
    submitPlaceholder: "Today I worked on... The hardest part was...",
    submitButton: "Submit practice",
    evidenceHint: "Record a short clip, rhythm, rap, or sung/instrument take that matches the assignment.",
  },
  "13to18": {
    planTitle: "Today’s practice plan",
    planIntro: "Focus on the highest-value work from your last lesson. Submit one useful snapshot for review.",
    submitLabel: "Reflection or recording note",
    submitPlaceholder: "I practiced... I want feedback on...",
    submitButton: "Send for review",
    evidenceHint: "Music, rhythm, singing, rapping, or instrument audio should count; ordinary talking should not drive practice credit.",
  },
  adult: {
    planTitle: "Practice plan",
    planIntro: "Use the lesson recap to focus your session, then submit a concise reflection or recording note.",
    submitLabel: "Session evidence",
    submitPlaceholder: "Focus, tempo, repetitions, and review request...",
    submitButton: "Submit for review",
    evidenceHint: "Submit musical evidence or a focused reflection tied to the lesson objective.",
  },
};

export function getStudentAgeBand(student?: StudentProfile | null): StudentAgeBand {
  return student?.ageBand ?? "13to18";
}

export function getStudentCopyProfile(student?: StudentProfile | null): StudentCopyProfile {
  return profiles[getStudentAgeBand(student)];
}
