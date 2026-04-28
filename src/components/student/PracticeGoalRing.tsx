"use client";

type PracticeGoalRingProps = {
  minutes: number;
  goalMinutes: number;
  label?: string;
};

export function PracticeGoalRing({ minutes, goalMinutes, label = "Today" }: PracticeGoalRingProps) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = goalMinutes > 0 ? Math.min(1, minutes / goalMinutes) : 0;
  const offset = c * (1 - pct);

  return (
    <div className="practice-goal-ring">
      <div
        className="practice-goal-ring-wrap"
        aria-label={`${Math.round(minutes)} minutes out of ${goalMinutes}-minute daily goal`}
      >
        <svg className="practice-goal-ring-svg" width="132" height="132" viewBox="0 0 120 120" aria-hidden>
          <circle className="practice-goal-ring-track" cx="60" cy="60" r={r} fill="none" strokeWidth="10" />
          <circle
            className="practice-goal-ring-fill"
            cx="60"
            cy="60"
            r={r}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="practice-goal-ring-center">
          <span className="practice-goal-ring-min">{Math.round(minutes)}</span>
          <span className="practice-goal-ring-goal">
            out of {goalMinutes} min
          </span>
          <span className="practice-goal-ring-lbl">{label}</span>
        </div>
      </div>
    </div>
  );
}
