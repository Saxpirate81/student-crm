"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ProducerPlaybookRule } from "@/lib/producer/mock-playbook";
import type { PlaybookVersion, ProducerQueueTask } from "@/lib/producer/mock-queue";

type ProducerMatrixViewProps = {
  rules: ProducerPlaybookRule[];
  tasks: ProducerQueueTask[];
  playbookVersion: PlaybookVersion;
  setPlaybookVersion: Dispatch<SetStateAction<PlaybookVersion>>;
  playbookVersions: PlaybookVersion[];
};

type MatrixRow = {
  studentName: string;
  instrument: string;
  learningTrack: string;
  velocityLesson: number;
  pulseScore: number;
  pulseLabel: string;
};

function pulseLabel(score: number) {
  if (score < 50) return "Critical";
  if (score < 70) return "At Risk";
  if (score < 85) return "Good";
  return "Excellent";
}

export function ProducerMatrixView({
  rules,
  tasks,
  playbookVersion,
  setPlaybookVersion,
  playbookVersions,
}: ProducerMatrixViewProps) {
  const [query, setQuery] = useState("");

  const matrixRows = useMemo<MatrixRow[]>(() => {
    const taskRows = tasks.filter((task) => task.playbookVersion === playbookVersion);
    const byStudent = new Map<string, ProducerQueueTask[]>();
    taskRows.forEach((task) => {
      const list = byStudent.get(task.studentName) ?? [];
      list.push(task);
      byStudent.set(task.studentName, list);
    });

    return [...byStudent.entries()].map(([studentName, entries]) => {
      const latest = [...entries].sort((a, b) => b.triggerLesson - a.triggerLesson)[0];
      const matchingRule =
        rules.find(
          (rule) =>
            rule.playbookVersion === playbookVersion &&
            rule.targetLesson === latest.triggerLesson &&
            rule.taskName === latest.taskName,
        ) ?? null;
      const velocityLesson = Math.max(...entries.map((entry) => entry.triggerLesson));
      const rawScore = 98 - velocityLesson * 3 - entries.length * 4;
      const score = Math.max(24, Math.min(95, rawScore));
      return {
        studentName,
        instrument: latest.instrument,
        learningTrack: matchingRule?.learningTrack ?? "All",
        velocityLesson,
        pulseScore: score,
        pulseLabel: pulseLabel(score),
      };
    });
  }, [tasks, rules, playbookVersion]);

  const visibleRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return matrixRows;
    return matrixRows.filter(
      (row) =>
        row.studentName.toLowerCase().includes(search) ||
        row.instrument.toLowerCase().includes(search) ||
        row.learningTrack.toLowerCase().includes(search),
    );
  }, [matrixRows, query]);

  const atRiskCount = visibleRows.filter((row) => row.pulseScore < 50).length;

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Student Matrix</div>
          <div className="section-sub">Track student pulse health, velocity, and pipeline alignment by playbook.</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="inp"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student or instrument"
          />
          <select className="inp" value={playbookVersion} onChange={(event) => setPlaybookVersion(event.target.value)}>
            {playbookVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid2 compact-grid">
        <div className="metric">
          <div className="metric-lbl">Students</div>
          <div className="metric-val" style={{ color: "var(--accent2)" }}>
            {visibleRows.length}
          </div>
          <div className="metric-sub">Visible in matrix</div>
        </div>
        <div className="metric">
          <div className="metric-lbl">At Risk</div>
          <div className="metric-val" style={{ color: "var(--red)" }}>
            {atRiskCount}
          </div>
          <div className="metric-sub">Pulse score &lt; 50</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
              <th className="py-3">Student</th>
              <th className="py-3">Pipeline Track</th>
              <th className="py-3">Velocity</th>
              <th className="py-3">Pulse Health</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.studentName} className="border-b border-white/5">
                <td className="py-3">
                  <div className="font-semibold">{row.studentName}</div>
                  <div className="text-xs text-slate-400">{row.instrument}</div>
                </td>
                <td className="py-3">
                  <span className="badge b-cyan">{row.learningTrack}</span>
                </td>
                <td className="py-3">Lesson {row.velocityLesson}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${row.pulseScore}%` }} />
                    </div>
                    <span className="text-xs text-slate-300">
                      {row.pulseScore}% • {row.pulseLabel}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visibleRows.length ? <p className="empty-copy">No matrix rows match your filters.</p> : null}
    </section>
  );
}
