import type { ProducerWorkspaceDataSource, ProducerWorkspaceSnapshot } from "@/lib/producer/data-source";
import { getMockPlaybookRules } from "@/lib/producer/mock-playbook";
import { getMockProducerQueue, type PlaybookVersion, type ProducerQueueTask } from "@/lib/producer/mock-queue";
import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";

function pulseLabel(score: number) {
  if (score < 50) return "Critical";
  if (score < 70) return "At Risk";
  if (score < 85) return "Good";
  return "Excellent";
}

function buildMockMatrixRows(tasks: ProducerQueueTask[]) {
  const byStudent = new Map<string, ProducerQueueTask[]>();
  for (const task of tasks) {
    const list = byStudent.get(task.studentName) ?? [];
    list.push(task);
    byStudent.set(task.studentName, list);
  }
  return [...byStudent.entries()].map(([studentName, entries]) => {
    const velocityLesson = Math.max(...entries.map((entry) => entry.triggerLesson));
    const rawScore = 98 - velocityLesson * 3 - entries.length * 4;
    const score = Math.max(24, Math.min(95, rawScore));
    return {
      studentName,
      instrument: entries[0]?.instrument ?? "Music",
      learningTrack: "All",
      velocityLesson,
      pulseScore: score,
      pulseLabel: pulseLabel(score),
    };
  });
}

function toSnapshot(): ProducerWorkspaceSnapshot {
  const tasks = getMockProducerQueue();
  return {
    playbookVersion: "Current",
    rules: getMockPlaybookRules(),
    tasks,
    matrixRows: buildMockMatrixRows(tasks),
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
