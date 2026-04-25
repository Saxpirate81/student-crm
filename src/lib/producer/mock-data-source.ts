import type { ProducerWorkspaceDataSource, ProducerWorkspaceSnapshot } from "@/lib/producer/data-source";
import { getMockPlaybookRules } from "@/lib/producer/mock-playbook";
import { getMockProducerQueue, type PlaybookVersion, type ProducerQueueTask } from "@/lib/producer/mock-queue";
import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";

function toSnapshot(): ProducerWorkspaceSnapshot {
  return {
    playbookVersion: "Current",
    rules: getMockPlaybookRules(),
    tasks: getMockProducerQueue(),
  };
}

function listPlaybookVersions(rules: ProducerPlaybookRule[], tasks: ProducerQueueTask[]): PlaybookVersion[] {
  const all = new Set<PlaybookVersion>(["Current", "Master Library"]);
  rules.forEach((rule) => all.add(rule.playbookVersion));
  tasks.forEach((task) => all.add(task.playbookVersion));
  return [...all];
}

export function createMockProducerWorkspaceDataSource(): ProducerWorkspaceDataSource {
  return {
    getInitialSnapshot: toSnapshot,
    listPlaybookVersions,
  };
}
