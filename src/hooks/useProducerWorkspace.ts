"use client";

import { useMemo, useState } from "react";
import type { ProducerWorkspaceDataSource } from "@/lib/producer/data-source";
import { createMockProducerWorkspaceDataSource } from "@/lib/producer/mock-data-source";
import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerQueueTask } from "@/lib/producer/mock-queue";

export function useProducerWorkspace(dataSource?: ProducerWorkspaceDataSource) {
  const source = useMemo<ProducerWorkspaceDataSource>(() => dataSource ?? createMockProducerWorkspaceDataSource(), [dataSource]);
  const initial = useMemo(() => source.getInitialSnapshot(), [source]);
  const [playbookVersion, setPlaybookVersion] = useState<PlaybookVersion>(initial.playbookVersion);
  const [rules, setRules] = useState<ProducerPlaybookRule[]>(initial.rules);
  const [tasks, setTasks] = useState<ProducerQueueTask[]>(initial.tasks);

  const playbookVersions = useMemo(() => {
    return source.listPlaybookVersions(rules, tasks);
  }, [source, rules, tasks]);

  return {
    playbookVersion,
    setPlaybookVersion,
    rules,
    setRules,
    tasks,
    setTasks,
    playbookVersions,
  };
}
