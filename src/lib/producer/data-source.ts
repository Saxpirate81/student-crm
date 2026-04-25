import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerQueueTask } from "@/lib/producer/mock-queue";

export type ProducerWorkspaceSnapshot = {
  playbookVersion: PlaybookVersion;
  rules: ProducerPlaybookRule[];
  tasks: ProducerQueueTask[];
};

export type ProducerWorkspaceDataSource = {
  getInitialSnapshot: () => ProducerWorkspaceSnapshot;
  listPlaybookVersions: (rules: ProducerPlaybookRule[], tasks: ProducerQueueTask[]) => PlaybookVersion[];
};
