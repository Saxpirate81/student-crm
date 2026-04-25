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
const JOURNEY_TRACKS: Exclude<LearningTrack, "All">[] = ["Kids", "Teens", "Adults", "Cross-Trainer"];

const emptyDraft: RuleDraft = {
  playbookVersion: "Current",
  learningTrack: "All",
  targetLesson: 1,
  placement: "lesson",
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
  const [timelineTrackFilter, setTimelineTrackFilter] = useState<LearningTrack>("All");
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
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

  const openNewRule = (defaults?: Partial<RuleDraft>) => {
    setEditingRuleId(null);
    setDraft({ ...emptyDraft, playbookVersion, ...defaults });
    setIsModalOpen(true);
  };

  const openEditRule = (rule: ProducerPlaybookRule) => {
    setEditingRuleId(rule.ruleId);
    setDraft({
      playbookVersion: rule.playbookVersion,
      learningTrack: rule.learningTrack,
      targetLesson: rule.targetLesson,
      placement: rule.placement,
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

  const timelineRules = useMemo(() => {
    return rules.filter(
      (rule) =>
        rule.playbookVersion === playbookVersion &&
        rule.status !== "Archived" &&
        (timelineTrackFilter === "All" || rule.learningTrack === timelineTrackFilter || rule.learningTrack === "All"),
    );
  }, [rules, playbookVersion, timelineTrackFilter]);

  const maxLesson = useMemo(() => {
    const highest = timelineRules.reduce((max, rule) => Math.max(max, rule.targetLesson), 1);
    return Math.max(18, highest + 2);
  }, [timelineRules]);

  const handleDropRule = (
    ruleId: string,
    track: Exclude<LearningTrack, "All">,
    lesson: number,
    placement: "lesson" | "between",
  ) => {
    setRules((current) =>
      current.map((rule) =>
        rule.ruleId === ruleId ? { ...rule, learningTrack: track, targetLesson: lesson, placement } : rule,
      ),
    );
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
          <button type="button" className="btn btn-sm" onClick={() => setIsTimelineOpen(true)}>
            Journey Map
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openNewRule()}>
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
                    {rule.taskType} • {rule.assignee} • {rule.placement === "between" ? "In-between lessons" : "On lesson"}
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
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4">
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
              <label className="form-grp">
                <span className="form-lbl">Placement</span>
                <select
                  className="inp"
                  value={draft.placement}
                  onChange={(event) => setDraft((d) => ({ ...d, placement: event.target.value as "lesson" | "between" }))}
                >
                  <option value="lesson">On lesson</option>
                  <option value="between">In-between lessons</option>
                </select>
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
                <textarea
                  className="inp"
                  placeholder="Example: During lesson closeout, confirm milestone completion, note confidence level, and flag parent follow-up if practice quality dropped."
                  value={draft.teacherDescription}
                  onChange={(event) => setDraft((d) => ({ ...d, teacherDescription: event.target.value }))}
                />
              </label>
              <label className="form-grp wide">
                <span className="form-lbl">Ops / system action plan</span>
                <textarea
                  className="inp"
                  placeholder="Example: Send parent recap email within 24 hours, update queue status, and create retention alert if pulse score is below threshold."
                  value={draft.opsDescription}
                  onChange={(event) => setDraft((d) => ({ ...d, opsDescription: event.target.value }))}
                />
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

      {isTimelineOpen ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-3">
          <div className="card h-[92vh] w-full max-w-[98vw] overflow-hidden p-0">
            <div className="card-header border-b border-white/10 px-4 py-3">
              <div>
                <div className="card-title">Curriculum Journey Map</div>
                <div className="section-sub">Drag rules between lesson points to reposition by track and trigger lesson.</div>
              </div>
              <div className="flex items-center gap-2">
                <select className="inp" value={playbookVersion} onChange={(event) => setPlaybookVersion(event.target.value)}>
                  {playbookVersions.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" onClick={() => setIsTimelineOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="border-b border-white/10 px-4 py-3">
              <div className="tabs">
                <button
                  type="button"
                  className={`tab ${timelineTrackFilter === "All" ? "active" : ""}`}
                  onClick={() => setTimelineTrackFilter("All")}
                >
                  All Tracks
                </button>
                {JOURNEY_TRACKS.map((track) => (
                  <button
                    key={track}
                    type="button"
                    className={`tab ${timelineTrackFilter === track ? "active" : ""}`}
                    onClick={() => setTimelineTrackFilter(track)}
                  >
                    {track}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[calc(92vh-130px)] overflow-y-auto p-4">
              <div className="space-y-5">
                {JOURNEY_TRACKS.filter((track) => timelineTrackFilter === "All" || timelineTrackFilter === track).map((track) => (
                  <section key={track} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                    <div className="mb-2 text-sm font-bold">{track}</div>
                    <div className="overflow-x-auto">
                      <div className="flex min-w-max gap-3 pb-2">
                        {Array.from({ length: maxLesson }, (_, idx) => idx + 1).map((lesson) => {
                          const lessonBucket = timelineRules.filter(
                            (rule) =>
                              rule.targetLesson === lesson &&
                              rule.placement === "lesson" &&
                              (rule.learningTrack === track || rule.learningTrack === "All"),
                          );
                          const betweenBucket = timelineRules.filter(
                            (rule) =>
                              rule.targetLesson === lesson &&
                              rule.placement === "between" &&
                              (rule.learningTrack === track || rule.learningTrack === "All"),
                          );
                          return (
                            <div key={`${track}-${lesson}`} className="flex items-start gap-2">
                              <div
                                className="w-44 rounded-xl border border-dashed border-white/15 bg-black/20 p-2"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  const ruleId = event.dataTransfer.getData("text/rule-id");
                                  if (ruleId) handleDropRule(ruleId, track, lesson, "lesson");
                                }}
                              >
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="badge b-cyan">L{lesson}</span>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => openNewRule({ learningTrack: track, targetLesson: lesson, placement: "lesson" })}
                                  >
                                    +
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  {lessonBucket.map((rule) => (
                                    <div
                                      key={rule.ruleId}
                                      draggable
                                      onDragStart={(event) => event.dataTransfer.setData("text/rule-id", rule.ruleId)}
                                      className={`cursor-move rounded-lg border p-2 text-xs ${
                                        rule.assignee === "Ops"
                                          ? "border-emerald-500/40 bg-emerald-500/10"
                                          : rule.assignee === "Teacher"
                                            ? "border-indigo-500/40 bg-indigo-500/10"
                                            : "border-purple-500/40 bg-purple-500/10"
                                      }`}
                                      title="Drag to move this rule"
                                    >
                                      <div className="font-semibold">{rule.taskName}</div>
                                      <div className="text-[10px] text-slate-300">
                                        {rule.assignee} • {rule.executionMode} • {rule.taskType}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {lesson < maxLesson ? (
                                <div className="w-44">
                                  <div className="mb-2 mt-2 flex h-7 items-center justify-center gap-1 text-xs text-slate-400">
                                    <span>→</span>
                                    <span>Between L{lesson} and L{lesson + 1}</span>
                                    <span>→</span>
                                  </div>
                                  <div
                                    className="rounded-xl border border-dashed border-white/15 bg-black/20 p-2"
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                      const ruleId = event.dataTransfer.getData("text/rule-id");
                                      if (ruleId) handleDropRule(ruleId, track, lesson, "between");
                                    }}
                                  >
                                    <div className="mb-2 flex items-center justify-between">
                                      <span className="badge b-purple">Queue</span>
                                      <button
                                        type="button"
                                        className="btn btn-sm"
                                        onClick={() =>
                                          openNewRule({
                                            learningTrack: track,
                                            targetLesson: lesson,
                                            placement: "between",
                                            assignee: "Ops",
                                          })
                                        }
                                      >
                                        +
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      {betweenBucket.map((rule) => (
                                        <div
                                          key={rule.ruleId}
                                          draggable
                                          onDragStart={(event) => event.dataTransfer.setData("text/rule-id", rule.ruleId)}
                                          className={`cursor-move rounded-lg border p-2 text-xs ${
                                            rule.assignee === "Ops"
                                              ? "border-emerald-500/40 bg-emerald-500/10"
                                              : rule.assignee === "Teacher"
                                                ? "border-indigo-500/40 bg-indigo-500/10"
                                                : "border-purple-500/40 bg-purple-500/10"
                                          }`}
                                          title="Drag to move this queue task"
                                        >
                                          <div className="font-semibold">{rule.taskName}</div>
                                          <div className="text-[10px] text-slate-300">
                                            {rule.assignee} • {rule.executionMode} • {rule.taskType}
                                          </div>
                                        </div>
                                      ))}
                                      {!betweenBucket.length ? <div className="text-[10px] text-slate-500">No in-between queue tasks</div> : null}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
