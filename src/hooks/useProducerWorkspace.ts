"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProducerWorkspaceDataSource } from "@/lib/producer/data-source";
import { createApiProducerWorkspaceDataSource } from "@/lib/producer/api-data-source";
import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerQueueTask } from "@/lib/producer/mock-queue";
import type { ProducerMatrixRow, ProducerWorkspaceSnapshot } from "@/lib/producer/data-source";

const LOCAL_WORKSPACE_KEY = "producer-workspace-local-v2";

type LocalWorkspacePayload = {
  savedAt: string;
  snapshot: ProducerWorkspaceSnapshot;
};

function isMockRuleId(ruleId: string) {
  return /^r-\d+$/.test(ruleId);
}

function isMockTaskId(taskId: string) {
  return /^q-\d+$/.test(taskId);
}

function isLocalDraftRuleId(ruleId: string) {
  return ruleId.startsWith("local-");
}

function isLocalDraftTaskId(taskId: string) {
  return taskId.startsWith("local-");
}

function sanitizeLocalSnapshot(snapshot: ProducerWorkspaceSnapshot): ProducerWorkspaceSnapshot {
  return {
    ...snapshot,
    rules: (snapshot.rules ?? []).filter((rule) => !isMockRuleId(rule.ruleId)),
    tasks: (snapshot.tasks ?? []).filter((task) => !isMockTaskId(task.taskId)),
    matrixRows: [],
  };
}

function readLocalWorkspace(): ProducerWorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalWorkspacePayload;
    if (!parsed?.snapshot) return null;
    return sanitizeLocalSnapshot(parsed.snapshot);
  } catch {
    return null;
  }
}

function writeLocalWorkspace(snapshot: ProducerWorkspaceSnapshot) {
  if (typeof window === "undefined") return;
  try {
    const payload: LocalWorkspacePayload = {
      savedAt: new Date().toISOString(),
      snapshot,
    };
    window.localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(payload));
  } catch {
    // ignore local storage write errors
  }
}

function mergeRules(localRules: ProducerPlaybookRule[], serverRules: ProducerPlaybookRule[]) {
  const merged = new Map<string, ProducerPlaybookRule>();
  for (const row of serverRules) merged.set(row.ruleId, row);
  for (const row of localRules) {
    if (!isLocalDraftRuleId(row.ruleId)) continue;
    if (!merged.has(row.ruleId)) merged.set(row.ruleId, row);
  }
  return [...merged.values()];
}

function mergeTasks(localTasks: ProducerQueueTask[], serverTasks: ProducerQueueTask[]) {
  const merged = new Map<string, ProducerQueueTask>();
  for (const row of serverTasks) merged.set(row.taskId, row);
  for (const row of localTasks) {
    if (!isLocalDraftTaskId(row.taskId)) continue;
    if (!merged.has(row.taskId)) merged.set(row.taskId, row);
  }
  return [...merged.values()];
}

function mergeMatrixRows(localRows: ProducerMatrixRow[], serverRows: ProducerMatrixRow[]) {
  void localRows;
  return serverRows;
}

export function useProducerWorkspace(dataSource?: ProducerWorkspaceDataSource) {
  const source = useMemo<ProducerWorkspaceDataSource>(
    () => dataSource ?? createApiProducerWorkspaceDataSource(),
    [dataSource],
  );
  const initial = useMemo(() => source.getInitialSnapshot(), [source]);
  const [playbookVersion, setPlaybookVersion] = useState<PlaybookVersion>(initial.playbookVersion);
  const [rules, setRules] = useState<ProducerPlaybookRule[]>(initial.rules);
  const [tasks, setTasks] = useState<ProducerQueueTask[]>(initial.tasks);
  const [matrixRows, setMatrixRows] = useState<ProducerMatrixRow[]>(initial.matrixRows ?? []);
  const [didHydrateClientState, setDidHydrateClientState] = useState(false);

  const reloadWorkspace = async () => {
    if (!source.loadWorkspaceSnapshot) return;
    const snapshot = await source.loadWorkspaceSnapshot();
    const local = readLocalWorkspace();
    if (local) {
      setPlaybookVersion(local.playbookVersion || snapshot.playbookVersion);
      setRules(mergeRules(local.rules, snapshot.rules));
      setTasks(mergeTasks(local.tasks, snapshot.tasks));
      setMatrixRows(mergeMatrixRows(local.matrixRows ?? [], snapshot.matrixRows ?? []));
      return;
    }
    setPlaybookVersion(snapshot.playbookVersion);
    setRules(snapshot.rules);
    setTasks(snapshot.tasks);
    setMatrixRows(snapshot.matrixRows ?? []);
  };

  useEffect(() => {
    if (didHydrateClientState) return;
    const local = readLocalWorkspace();
    if (local) {
      setPlaybookVersion(local.playbookVersion || initial.playbookVersion);
      setRules(local.rules);
      setTasks(local.tasks);
      setMatrixRows(initial.matrixRows ?? []);
    }
    setDidHydrateClientState(true);
  }, [didHydrateClientState, initial.playbookVersion, initial.rules, initial.tasks, initial.matrixRows]);

  useEffect(() => {
    if (!didHydrateClientState) return;
    let cancelled = false;
    if (!source.loadWorkspaceSnapshot) return;
    void source.loadWorkspaceSnapshot().then((snapshot) => {
      if (cancelled) return;
      const local = readLocalWorkspace();
      if (local) {
        setPlaybookVersion(local.playbookVersion || snapshot.playbookVersion);
        setRules(mergeRules(local.rules, snapshot.rules));
        setTasks(mergeTasks(local.tasks, snapshot.tasks));
        setMatrixRows(mergeMatrixRows(local.matrixRows ?? [], snapshot.matrixRows ?? []));
      } else {
        setPlaybookVersion(snapshot.playbookVersion);
        setRules(snapshot.rules);
        setTasks(snapshot.tasks);
        setMatrixRows(snapshot.matrixRows ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source, didHydrateClientState]);

  useEffect(() => {
    if (!didHydrateClientState) return;
    writeLocalWorkspace({
      playbookVersion,
      rules,
      tasks,
      matrixRows,
    });
  }, [playbookVersion, rules, tasks, matrixRows, didHydrateClientState]);

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
    matrixRows,
    setMatrixRows,
    playbookVersions,
    reloadWorkspace,
  };
}
