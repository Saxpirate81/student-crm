export type ProducerTaskType = "Media Upload" | "In-Room Milestone" | "System Action";
export type PlaybookVersion = string;

export type ProducerQueueTask = {
  taskId: string;
  studentName: string;
  age: number;
  instrument: string;
  triggerLesson: number;
  taskName: string;
  taskType: ProducerTaskType;
  opsInstructions: string;
  parentName: string;
  parentEmail: string;
  createdAt: string;
  playbookVersion: PlaybookVersion;
};

const seed: ProducerQueueTask[] = [
  {
    taskId: "q-101",
    studentName: "Alex Harper",
    age: 14,
    instrument: "Piano",
    triggerLesson: 6,
    taskName: "Digital Showcase Review",
    taskType: "Media Upload",
    opsInstructions: "Review uploaded milestone clip and approve parent-facing share.",
    parentName: "Jordan Harper",
    parentEmail: "jordan.harper@example.com",
    createdAt: "2026-04-25T12:05:00.000Z",
    playbookVersion: "Current",
  },
  {
    taskId: "q-102",
    studentName: "Sam Rivera",
    age: 9,
    instrument: "Guitar",
    triggerLesson: 4,
    taskName: "Parent Pulse Follow-up",
    taskType: "In-Room Milestone",
    opsInstructions: "Send pulse summary and confirm home-practice support plan.",
    parentName: "Avery Rivera",
    parentEmail: "avery.rivera@example.com",
    createdAt: "2026-04-25T11:15:00.000Z",
    playbookVersion: "Current",
  },
  {
    taskId: "q-103",
    studentName: "Mia Thompson",
    age: 17,
    instrument: "Vocals",
    triggerLesson: 16,
    taskName: "Plateau Retention Alert",
    taskType: "System Action",
    opsInstructions: "Escalate to producer lead for retention-risk intervention.",
    parentName: "Leslie Thompson",
    parentEmail: "leslie.thompson@example.com",
    createdAt: "2026-04-25T10:00:00.000Z",
    playbookVersion: "Current",
  },
  {
    taskId: "q-104",
    studentName: "Noah Bennett",
    age: 21,
    instrument: "Drums",
    triggerLesson: 11,
    taskName: "Milestone Completion Check",
    taskType: "In-Room Milestone",
    opsInstructions: "Confirm completion and update monthly journey notes.",
    parentName: "Chris Bennett",
    parentEmail: "chris.bennett@example.com",
    createdAt: "2026-04-24T18:42:00.000Z",
    playbookVersion: "Spring 2026",
  },
];

export function getMockProducerQueue(): ProducerQueueTask[] {
  return seed.map((task) => ({ ...task }));
}
