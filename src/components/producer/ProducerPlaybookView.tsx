"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  Assignee,
  ExecutionMode,
  LearningTrack,
  ProducerPlaybookRule,
  RuleStatus,
} from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerTaskType } from "@/lib/producer/mock-queue";

type RuleDraft = Omit<ProducerPlaybookRule, "ruleId">;

const TRACKS: LearningTrack[] = ["All", "Kids", "Teens", "Adults", "Cross-Trainer"];

const emptyDraft: RuleDraft = {
  playbookVersion: "Current",
  learningTrack: "All",
  targetLesson: 1,
  taskName: "",
  taskType: "In-Room Milestone",
  executionMode: "Manual",
  assignee: "Both",
  teacherDescription: "",
  opsDescription: "",
  status: "Active",
};

type ProducerPlaybookViewProps = {
  rules: ProducerPlaybookRule[];
  setRules: Dispatch<SetStateAction<ProducerPlaybookRule[]>>;
  playbookVersion: PlaybookVersion;
  setPlaybookVersion: Dispatch<SetStateAction<PlaybookVersion>>;
  playbookVersions: PlaybookVersion[];
};

export function ProducerPlaybookView({
  rules,
  setRules,
  playbookVersion,
  setPlaybookVersion,
  playbookVersions,
}: ProducerPlaybookViewProps) {
  const [trackFilter, setTrackFilter] = useState<LearningTrack>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);

  const filteredRules = useMemo(() => {
    return rules
      .filter((rule) => rule.playbookVersion === playbookVersion)
      .filter((rule) => (trackFilter === "All" ? true : rule.learningTrack === trackFilter))
      .filter((rule) => rule.status !== "Archived")
      .sort((a, b) => a.targetLesson - b.targetLesson || a.taskName.localeCompare(b.taskName));
  }, [rules, playbookVersion, trackFilter]);

  const openNewRule = () => {
    setEditingRuleId(null);
    setDraft({ ...emptyDraft, playbookVersion });
    setIsModalOpen(true);
  };

  const openEditRule = (rule: ProducerPlaybookRule) => {
    setEditingRuleId(rule.ruleId);
    setDraft({
      playbookVersion: rule.playbookVersion,
      learningTrack: rule.learningTrack,
      targetLesson: rule.targetLesson,
      taskName: rule.taskName,
      taskType: rule.taskType,
      executionMode: rule.executionMode,
      assignee: rule.assignee,
      teacherDescription: rule.teacherDescription,
      opsDescription: rule.opsDescription,
      status: rule.status,
    });
    setIsModalOpen(true);
  };

  const saveRule = () => {
    if (!draft.taskName.trim()) return;
    if (editingRuleId) {
      setRules((current) =>
        current.map((rule) => (rule.ruleId === editingRuleId ? { ...rule, ...draft, taskName: draft.taskName.trim() } : rule)),
      );
    } else {
      setRules((current) => [
        ...current,
        {
          ruleId: `r-${Date.now()}`,
          ...draft,
          taskName: draft.taskName.trim(),
        },
      ]);
    }
    setEditingRuleId(null);
    setDraft(emptyDraft);
    setIsModalOpen(false);
  };

  const retireCurrentPlaybook = () => {
    const archiveName = `Archive ${new Date().toISOString().slice(0, 10)}`;
    setRules((current) =>
      current.map((rule) => (rule.playbookVersion === "Current" ? { ...rule, playbookVersion: archiveName } : rule)),
    );
    setPlaybookVersion(archiveName);
  };

  const setRuleStatus = (ruleId: string, status: RuleStatus) => {
    setRules((current) => current.map((rule) => (rule.ruleId === ruleId ? { ...rule, status } : rule)));
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Playbook Rules Engine</div>
          <div className="section-sub">Configure automation and task templates by track, lesson trigger, and assignee.</div>
        </div>
        <div className="flex gap-2">
          <select className="inp" value={playbookVersion} onChange={(event) => setPlaybookVersion(event.target.value)}>
            {playbookVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={retireCurrentPlaybook} disabled={playbookVersion !== "Current"}>
            Retire Current
          </button>
          <button type="button" className="btn btn-sm" disabled>
            Journey Map
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openNewRule}>
            New Rule
          </button>
        </div>
      </div>

      <div className="tabs">
        {TRACKS.map((track) => (
          <button
            key={track}
            type="button"
            className={`tab ${trackFilter === track ? "active" : ""}`}
            onClick={() => setTrackFilter(track)}
          >
            {track === "All" ? "All Rules" : track}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
              <th className="py-3">Track</th>
              <th className="py-3">Trigger</th>
              <th className="py-3">Task</th>
              <th className="py-3">Mode</th>
              <th className="py-3">Status</th>
              <th className="py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map((rule) => (
              <tr key={rule.ruleId} className="border-b border-white/5">
                <td className="py-3">
                  <span className="badge b-cyan">{rule.learningTrack}</span>
                </td>
                <td className="py-3">Lesson {rule.targetLesson}</td>
                <td className="py-3">
                  <div className="font-semibold">{rule.taskName}</div>
                  <div className="text-xs text-slate-400">
                    {rule.taskType} • {rule.assignee}
                  </div>
                </td>
                <td className="py-3">{rule.executionMode}</td>
                <td className="py-3">
                  <span className={`badge ${rule.status === "Active" ? "b-green" : "b-gold"}`}>{rule.status}</span>
                </td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-sm" onClick={() => openEditRule(rule)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setRuleStatus(rule.ruleId, rule.status === "Active" ? "Inactive" : "Active")}
                    >
                      {rule.status === "Active" ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="ui-button-danger rounded-md px-3 py-1 text-xs font-semibold"
                      onClick={() => setRuleStatus(rule.ruleId, "Archived")}
                    >
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!filteredRules.length ? <p className="empty-copy">No active rules match this playbook + track filter.</p> : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="card max-h-[90vh] w-full max-w-4xl overflow-y-auto">
            <div className="card-header">
              <div className="card-title">{editingRuleId ? "Edit Rule" : "New Rule"}</div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setEditingRuleId(null);
                  setDraft(emptyDraft);
                  setIsModalOpen(false);
                }}
              >
                Close
              </button>
            </div>
            <div className="instructor-form-grid">
              <label className="form-grp">
                <span className="form-lbl">Playbook</span>
                <select className="inp" value={draft.playbookVersion} onChange={(event) => setDraft((d) => ({ ...d, playbookVersion: event.target.value }))}>
                  {playbookVersions.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-grp">
                <span className="form-lbl">Track</span>
                <select className="inp" value={draft.learningTrack} onChange={(event) => setDraft((d) => ({ ...d, learningTrack: event.target.value as LearningTrack }))}>
                  {TRACKS.map((track) => (
                    <option key={track} value={track}>
                      {track}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-grp">
                <span className="form-lbl">Trigger lesson</span>
                <input
                  className="inp"
                  type="number"
                  min={1}
                  value={draft.targetLesson}
                  onChange={(event) => setDraft((d) => ({ ...d, targetLesson: Number.parseInt(event.target.value || "1", 10) }))}
                />
              </label>
              <label className="form-grp wide">
                <span className="form-lbl">Task name</span>
                <input className="inp" value={draft.taskName} onChange={(event) => setDraft((d) => ({ ...d, taskName: event.target.value }))} />
              </label>
              <label className="form-grp">
                <span className="form-lbl">Task type</span>
                <select className="inp" value={draft.taskType} onChange={(event) => setDraft((d) => ({ ...d, taskType: event.target.value as ProducerTaskType }))}>
                  <option value="In-Room Milestone">In-Room Milestone</option>
                  <option value="Media Upload">Media Upload</option>
                  <option value="System Action">System Action</option>
                </select>
              </label>
              <label className="form-grp">
                <span className="form-lbl">Execution</span>
                <select className="inp" value={draft.executionMode} onChange={(event) => setDraft((d) => ({ ...d, executionMode: event.target.value as ExecutionMode }))}>
                  <option value="Manual">Manual</option>
                  <option value="Automated">Automated</option>
                </select>
              </label>
              <label className="form-grp">
                <span className="form-lbl">Assignee</span>
                <select className="inp" value={draft.assignee} onChange={(event) => setDraft((d) => ({ ...d, assignee: event.target.value as Assignee }))}>
                  <option value="Teacher">Teacher</option>
                  <option value="Ops">Ops</option>
                  <option value="Both">Both</option>
                </select>
              </label>
              <label className="form-grp wide">
                <span className="form-lbl">Teacher action plan</span>
                <textarea className="inp" value={draft.teacherDescription} onChange={(event) => setDraft((d) => ({ ...d, teacherDescription: event.target.value }))} />
              </label>
              <label className="form-grp wide">
                <span className="form-lbl">Ops / system action plan</span>
                <textarea className="inp" value={draft.opsDescription} onChange={(event) => setDraft((d) => ({ ...d, opsDescription: event.target.value }))} />
              </label>
            </div>
            <div className="modal-acts">
              <button type="button" className="btn btn-primary" onClick={saveRule}>
                Save Rule
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
