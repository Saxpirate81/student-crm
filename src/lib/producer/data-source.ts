import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerQueueTask } from "@/lib/producer/mock-queue";

export type ProducerMatrixRow = {
  studentName: string;
  instrument: string;
  learningTrack: string;
  velocityLesson: number;
  pulseScore: number;
  pulseLabel: string;
};

export type ProducerWorkspaceSnapshot = {
  playbookVersion: PlaybookVersion;
  rules: ProducerPlaybookRule[];
  tasks: ProducerQueueTask[];
  matrixRows: ProducerMatrixRow[];
};

export type ProducerWorkspaceDataSource = {
  getInitialSnapshot: () => ProducerWorkspaceSnapshot;
  listPlaybookVersions: (rules: ProducerPlaybookRule[], tasks: ProducerQueueTask[]) => PlaybookVersion[];
  loadWorkspaceSnapshot?: () => Promise<ProducerWorkspaceSnapshot>;
};
