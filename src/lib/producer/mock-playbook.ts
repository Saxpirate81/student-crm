import type { PlaybookVersion, ProducerTaskType } from "@/lib/producer/mock-queue";

export type LearningTrack = "All" | "Kids" | "Teens" | "Adults" | "Cross-Trainer";
export type RuleStatus = "Active" | "Inactive" | "Archived";
export type ExecutionMode = "Manual" | "Automated";
export type Assignee = "Teacher" | "Ops" | "Both";

export type ProducerPlaybookRule = {
  ruleId: string;
  playbookVersion: PlaybookVersion;
  learningTrack: LearningTrack;
  targetLesson: number;
  taskName: string;
  taskType: ProducerTaskType;
  executionMode: ExecutionMode;
  assignee: Assignee;
  teacherDescription: string;
  opsDescription: string;
  status: RuleStatus;
};

const seedRules: ProducerPlaybookRule[] = [
  {
    ruleId: "r-201",
    playbookVersion: "Current",
    learningTrack: "Kids",
    targetLesson: 4,
    taskName: "Parent Pulse Follow-up",
    taskType: "In-Room Milestone",
    executionMode: "Manual",
    assignee: "Both",
    teacherDescription: "Capture pulse status at lesson end and flag any confidence gaps.",
    opsDescription: "Send recap email + home practice recommendation to parent.",
    status: "Active",
  },
  {
    ruleId: "r-202",
    playbookVersion: "Current",
    learningTrack: "All",
    targetLesson: 6,
    taskName: "Digital Showcase Review",
    taskType: "Media Upload",
    executionMode: "Manual",
    assignee: "Ops",
    teacherDescription: "",
    opsDescription: "Review uploaded clip and approve parent share.",
    status: "Active",
  },
  {
    ruleId: "r-203",
    playbookVersion: "Current",
    learningTrack: "Teens",
    targetLesson: 16,
    taskName: "Plateau Retention Alert",
    taskType: "System Action",
    executionMode: "Automated",
    assignee: "Ops",
    teacherDescription: "Flag plateau stall in lesson note.",
    opsDescription: "Auto-open retention outreach task for producer queue.",
    status: "Active",
  },
  {
    ruleId: "r-204",
    playbookVersion: "Spring 2026",
    learningTrack: "Adults",
    targetLesson: 11,
    taskName: "Milestone Completion Check",
    taskType: "In-Room Milestone",
    executionMode: "Manual",
    assignee: "Teacher",
    teacherDescription: "Confirm milestone completion in-room.",
    opsDescription: "",
    status: "Inactive",
  },
];

export function getMockPlaybookRules(): ProducerPlaybookRule[] {
  return seedRules.map((rule) => ({ ...rule }));
}
