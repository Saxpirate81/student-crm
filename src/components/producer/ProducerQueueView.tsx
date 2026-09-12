"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PlaybookVersion, ProducerQueueTask, ProducerTaskType } from "@/lib/producer/mock-queue";
import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";

type QueueFilter = "All" | ProducerTaskType;
type PhaseFilter = "All" | "Danger Zone" | "The Plateau";
type SortColumn = "studentName" | "triggerLesson" | "taskName" | "createdAt";
type ProducerQueueViewProps = {
  rules: ProducerPlaybookRule[];
  tasks: ProducerQueueTask[];
  setTasks: Dispatch<SetStateAction<ProducerQueueTask[]>>;
  playbookVersion: PlaybookVersion;
  setPlaybookVersion: Dispatch<SetStateAction<PlaybookVersion>>;
  playbookVersions: PlaybookVersion[];
  reloadWorkspace: () => Promise<void>;
};

const ENABLE_QUEUE_PREVIEW_FALLBACK = process.env.NEXT_PUBLIC_ENABLE_PRODUCER_QUEUE_PREVIEW_FALLBACK === "true";

const SAMPLE_STUDENTS = [
  { name: "Alex Harper", age: 14, instrument: "Piano", lesson: 6, track: "Kids", parentName: "Jordan Harper", parentEmail: "jordan.harper@example.com" },
  { name: "Sam Rivera", age: 9, instrument: "Guitar", lesson: 4, track: "Kids", parentName: "Avery Rivera", parentEmail: "avery.rivera@example.com" },
  { name: "Mia Thompson", age: 17, instrument: "Vocals", lesson: 16, track: "Teens", parentName: "Leslie Thompson", parentEmail: "leslie.thompson@example.com" },
];

function trackMatches(ruleTrack: string, studentTrack: string) {
  const tracks = ruleTrack
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!tracks.length) return true;
  return tracks.includes("All") || tracks.includes(studentTrack);
}

function naturalTaskKey(task: ProducerQueueTask) {
  return `${task.studentName}|${task.triggerLesson}|${task.taskName}|${task.playbookVersion}`;
}

function collapseLegacyShadowDuplicates(tasks: ProducerQueueTask[]) {
  const byNatural = new Map<string, ProducerQueueTask[]>();
  for (const task of tasks) {
    const key = naturalTaskKey(task);
    const bucket = byNatural.get(key) ?? [];
    bucket.push(task);
    byNatural.set(key, bucket);
  }

  const collapsed: ProducerQueueTask[] = [];
  for (const bucket of byNatural.values()) {
    const sourced = bucket.filter((task) => Boolean(task.sourceRuleId));
    if (sourced.length > 0) {
      // If rule-linked rows exist, drop legacy shadows and dedupe by rule id.
      const byRule = new Map<string, ProducerQueueTask>();
      for (const task of sourced) {
        const ruleId = task.sourceRuleId as string;
        const existing = byRule.get(ruleId);
        if (!existing) {
          byRule.set(ruleId, task);
          continue;
        }
        if (new Date(task.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
          byRule.set(ruleId, task);
        }
      }
      collapsed.push(...byRule.values());
      continue;
    }

    // Legacy-only duplicates: keep oldest as canonical row.
    const oldest = [...bucket].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    collapsed.push(oldest);
  }

  return collapsed;
}

function getPhase(triggerLesson: number): "Danger Zone" | "The Plateau" {
  return triggerLesson <= 15 ? "Danger Zone" : "The Plateau";
}

function isLocalOnlyTaskId(taskId: string) {
  return taskId.startsWith("local-") || /^q-\d+$/.test(taskId);
}

function timeAgo(iso: string, nowMs: number) {
  const ms = nowMs - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)} day${hr >= 48 ? "s" : ""} ago`;
}

function TimeInQueue({ iso }: { iso: string }) {
  const [label, setLabel] = useState("—");

  useEffect(() => {
    const tick = () => setLabel(timeAgo(iso, Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return <span className="text-xs text-slate-400">{label}</span>;
}

export function ProducerQueueView({
  rules,
  tasks,
  setTasks,
  playbookVersion,
  setPlaybookVersion,
  playbookVersions,
  reloadWorkspace,
}: ProducerQueueViewProps) {
  const [taskFilter, setTaskFilter] = useState<QueueFilter>("All");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("All");
  const [sortColumn, setSortColumn] = useState<SortColumn>("createdAt");
  const [ascending, setAscending] = useState(true);
  const [activeTask, setActiveTask] = useState<ProducerQueueTask | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const hasRulesForActivePlaybook = useMemo(
    () => rules.some((rule) => rule.playbookVersion === playbookVersion && rule.status === "Active"),
    [rules, playbookVersion],
  );

  useEffect(() => {
    const collapsed = collapseLegacyShadowDuplicates(tasks);
    if (collapsed.length === tasks.length) return;
    setTasks(collapsed);
  }, [tasks, setTasks]);

  const filtered = useMemo(() => {
    if (!hasRulesForActivePlaybook) return [];
    let rows = tasks.filter((task) => task.playbookVersion === playbookVersion);
    if (taskFilter !== "All") rows = rows.filter((task) => task.taskType === taskFilter);
    if (phaseFilter !== "All") rows = rows.filter((task) => getPhase(task.triggerLesson) === phaseFilter);
    return [...rows].sort((a, b) => {
      const getValue = (task: ProducerQueueTask) => {
        if (sortColumn === "createdAt") return new Date(task.createdAt).getTime();
        if (sortColumn === "triggerLesson") return task.triggerLesson;
        return task[sortColumn].toLowerCase();
      };
      const va = getValue(a);
      const vb = getValue(b);
      if (va < vb) return ascending ? -1 : 1;
      if (va > vb) return ascending ? 1 : -1;
      return 0;
    });
  }, [tasks, playbookVersion, taskFilter, phaseFilter, sortColumn, ascending, hasRulesForActivePlaybook]);

  const counts = useMemo(() => {
    if (!hasRulesForActivePlaybook) {
      return { all: 0, media: 0, comms: 0, alerts: 0, danger: 0, plateau: 0 };
    }
    const base = tasks.filter((task) => task.playbookVersion === playbookVersion);
    return {
      all: base.length,
      media: base.filter((task) => task.taskType === "Media Upload").length,
      comms: base.filter((task) => task.taskType === "In-Room Milestone").length,
      alerts: base.filter((task) => task.taskType === "System Action").length,
      danger: base.filter((task) => getPhase(task.triggerLesson) === "Danger Zone").length,
      plateau: base.filter((task) => getPhase(task.triggerLesson) === "The Plateau").length,
    };
  }, [tasks, playbookVersion, hasRulesForActivePlaybook]);

  const onSort = (column: SortColumn) => {
    if (column === sortColumn) setAscending((value) => !value);
    else {
      setSortColumn(column);
      setAscending(true);
    }
  };

  const markComplete = async (taskId: string) => {
    if (isLocalOnlyTaskId(taskId)) {
      setTasks((current) => current.filter((task) => task.taskId !== taskId));
      setActiveTask(null);
      setSyncNotice("Removed local preview task.");
      return;
    }

    const response = await fetch(`/api/producer/queue/${taskId}/complete`, {
      method: "PATCH",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      setSyncNotice("Could not mark complete on the server. Please try again.");
      return;
    }
    setTasks((current) => current.filter((task) => task.taskId !== taskId));
    setActiveTask(null);
    await reloadWorkspace();
  };

  const generateLocalSyncTasks = () => {
    const existingRuleKeys = new Set(
      tasks
        .filter((task) => Boolean(task.sourceRuleId))
        .map((task) => `${task.studentName}|${task.triggerLesson}|${task.sourceRuleId}|${task.playbookVersion}`),
    );
    const existingLegacyNaturalKeys = new Set(
      tasks.filter((task) => !task.sourceRuleId).map((task) => naturalTaskKey(task)),
    );
    const nextRows: ProducerQueueTask[] = [];
    const activeRules = rules.filter(
      (rule) =>
        rule.playbookVersion === playbookVersion &&
        rule.status === "Active" &&
        rule.executionMode === "Manual" &&
        (rule.assignee === "Ops" || rule.assignee === "Both"),
    );

    for (const student of SAMPLE_STUDENTS) {
      for (const rule of activeRules) {
        if (rule.targetLesson !== student.lesson) continue;
        if (!trackMatches(rule.learningTrack, student.track)) continue;
        const key = `${student.name}|${rule.targetLesson}|${rule.ruleId}|${playbookVersion}`;
        if (existingRuleKeys.has(key)) continue;
        const candidateNaturalKey = `${student.name}|${rule.targetLesson}|${rule.taskName}|${playbookVersion}`;
        if (existingLegacyNaturalKeys.has(candidateNaturalKey)) continue;
        nextRows.push({
          taskId: `local-sync-${Date.now()}-${nextRows.length}`,
          sourceRuleId: rule.ruleId,
          studentName: student.name,
          age: student.age,
          instrument: student.instrument,
          triggerLesson: rule.targetLesson,
          taskName: rule.taskName,
          taskType: rule.taskType,
          opsInstructions: rule.opsDescription || "Follow the playbook action plan.",
          parentName: student.parentName,
          parentEmail: student.parentEmail,
          createdAt: new Date().toISOString(),
          playbookVersion,
        });
        existingRuleKeys.add(key);
      }
    }
    return nextRows;
  };

  const syncPlaybookRules = async () => {
    if (!hasRulesForActivePlaybook) {
      setSyncNotice("No playbook rules are configured for this playbook version yet.");
      return;
    }
    setTasks((current) => collapseLegacyShadowDuplicates(current));
    setIsSyncing(true);
    setSyncNotice("Syncing playbook rules...");
    try {
      const response = await fetch("/api/producer/queue/sync", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as { ok?: boolean; inserted?: number; error?: string };
      if (!response.ok || payload.ok === false) {
        if (ENABLE_QUEUE_PREVIEW_FALLBACK) {
          const generated = generateLocalSyncTasks();
          if (generated.length) {
            setTasks((current) => collapseLegacyShadowDuplicates([...generated, ...current]));
            setSyncNotice(`Database sync is limited. Added ${generated.length} local queue task(s) from active playbook rules.`);
          } else {
            setSyncNotice(payload.error ? `Sync issue: ${payload.error}` : "No new queue tasks were generated from current active rules.");
          }
        } else {
          setSyncNotice(payload.error ? `Sync issue: ${payload.error}` : "Sync could not write queue tasks on the server.");
        }
        setIsSyncing(false);
        return;
      }
      await reloadWorkspace();
      const inserted = Number(payload.inserted ?? 0);
      if (inserted > 0) {
        setSyncNotice(`Sync complete. Added ${inserted} queue task(s).`);
      } else {
        if (ENABLE_QUEUE_PREVIEW_FALLBACK) {
          const generated = generateLocalSyncTasks();
          if (generated.length > 0) {
            setTasks((current) => collapseLegacyShadowDuplicates([...generated, ...current]));
            setSyncNotice(`Server sync added 0 tasks, so preview mode added ${generated.length} local queue task(s).`);
          } else {
            setSyncNotice("Sync complete. No new tasks were eligible to add.");
          }
        } else {
          setSyncNotice("Sync complete. No new tasks were eligible to add.");
        }
      }
    } catch {
      setSyncNotice("Queue sync could not reach the server. Please try again in a moment.");
    }
    setIsSyncing(false);
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Daily Action Queue</div>
          <div className="section-sub">Review milestones, communications, and alert actions for the active playbook.</div>
        </div>
        <div className="flex items-center gap-2">
          <select className="inp" value={playbookVersion} onChange={(event) => setPlaybookVersion(event.target.value as PlaybookVersion)}>
            {playbookVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={syncPlaybookRules} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "Sync Playbook Rules"}
          </button>
        </div>
      </div>
      {syncNotice ? <p className="mb-3 text-sm text-slate-300">{syncNotice}</p> : null}
      {!hasRulesForActivePlaybook ? (
        <p className="mb-3 text-sm text-slate-400">
          No playbook rules found for <span className="font-semibold">{playbookVersion}</span>. Create rules in Playbook to populate queue tasks.
        </p>
      ) : null}
      <div className="tabs">
        <button type="button" className={`tab ${taskFilter === "All" ? "active" : ""}`} onClick={() => setTaskFilter("All")}>
          All Tasks ({counts.all})
        </button>
        <button
          type="button"
          className={`tab ${taskFilter === "Media Upload" ? "active" : ""}`}
          onClick={() => setTaskFilter("Media Upload")}
        >
          Media ({counts.media})
        </button>
        <button
          type="button"
          className={`tab ${taskFilter === "In-Room Milestone" ? "active" : ""}`}
          onClick={() => setTaskFilter("In-Room Milestone")}
        >
          Comms ({counts.comms})
        </button>
        <button
          type="button"
          className={`tab ${taskFilter === "System Action" ? "active" : ""}`}
          onClick={() => setTaskFilter("System Action")}
        >
          Alerts ({counts.alerts})
        </button>
      </div>
      <div className="tabs">
        <button type="button" className={`tab ${phaseFilter === "All" ? "active" : ""}`} onClick={() => setPhaseFilter("All")}>
          All Phases
        </button>
        <button
          type="button"
          className={`tab ${phaseFilter === "Danger Zone" ? "active" : ""}`}
          onClick={() => setPhaseFilter("Danger Zone")}
        >
          Danger Zone ({counts.danger})
        </button>
        <button
          type="button"
          className={`tab ${phaseFilter === "The Plateau" ? "active" : ""}`}
          onClick={() => setPhaseFilter("The Plateau")}
        >
          Plateau ({counts.plateau})
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
              <th className="py-3">
                <button type="button" onClick={() => onSort("studentName")} className="font-bold">
                  Student
                </button>
              </th>
              <th className="py-3">
                <button type="button" onClick={() => onSort("triggerLesson")} className="font-bold">
                  Trigger
                </button>
              </th>
              <th className="py-3">
                <button type="button" onClick={() => onSort("taskName")} className="font-bold">
                  Required Action
                </button>
              </th>
              <th className="py-3">
                <button type="button" onClick={() => onSort("createdAt")} className="font-bold">
                  Time in Queue
                </button>
              </th>
              <th className="py-3 text-right">Execute</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((task) => (
              <tr key={task.taskId} className="border-b border-white/5">
                <td className="py-3">
                  <div className="font-semibold">{task.studentName}</div>
                  <div className="text-xs text-slate-400">{task.age}y • {task.instrument}</div>
                </td>
                <td className="py-3">
                  <span className="badge b-cyan">Lesson {task.triggerLesson}</span>
                </td>
                <td className="py-3">
                  <div className="font-semibold">{task.taskName}</div>
                  <div className="text-xs text-slate-400">{task.taskType} • {getPhase(task.triggerLesson)}</div>
                </td>
                <td className="py-3">
                  <TimeInQueue iso={task.createdAt} />
                </td>
                <td className="py-3 text-right">
                  <button type="button" className="btn btn-sm" onClick={() => setActiveTask(task)}>
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!filtered.length ? <p className="empty-copy">No queue tasks match the selected filters.</p> : null}

      {activeTask ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-white/15 bg-slate-950/95 shadow-2xl">
            <div className="card-header border-b border-white/10 pb-3">
              <div>
                <div className="card-title">{activeTask.studentName}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
                  <span className="badge b-cyan">Lesson {activeTask.triggerLesson}</span>
                  <span>{activeTask.taskName}</span>
                </div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setActiveTask(null)}>
                Close
              </button>
            </div>
            <div className="space-y-4 pt-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs uppercase tracking-wider text-slate-400">Playbook Instruction</div>
                <p className="mt-2 text-sm leading-6 text-slate-100">{activeTask.opsInstructions}</p>
              </div>
              <div className="grid2 compact-grid">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <div className="text-xs uppercase tracking-wider text-slate-400">Parent Contact</div>
                  <p className="mt-2 font-semibold text-slate-100">{activeTask.parentName}</p>
                  <p className="text-slate-300">{activeTask.parentEmail || "No email on file"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <div className="text-xs uppercase tracking-wider text-slate-400">Task Details</div>
                  <p className="mt-2 font-semibold text-slate-100">{activeTask.taskType}</p>
                  <p className="text-slate-300">{getPhase(activeTask.triggerLesson)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="text-xs uppercase tracking-wider text-slate-400">Email Draft (Editable)</div>
                <p className="mt-2 leading-6 text-slate-100">
                  Hi {activeTask.parentName.split(" ")[0]}, we are following up on {activeTask.studentName}&apos;s lesson{" "}
                  {activeTask.triggerLesson} milestone. We&apos;ll share next steps shortly.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
                <button type="button" className="btn btn-sm" onClick={() => setActiveTask(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void markComplete(activeTask.taskId)}>
                  Mark Complete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
