"use client";

type RewardTone = "purple" | "gold" | "green" | "cyan";

type RewardStep = {
  label: string;
  value: string;
  tone: RewardTone;
  unlocked?: boolean;
};

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  pointsLabel: string;
  pointsValue: string;
  progress: number;
  steps: RewardStep[];
};

export function GamifiedRewardTrack({
  eyebrow,
  title,
  subtitle,
  pointsLabel,
  pointsValue,
  progress,
  steps,
}: Props) {
  const pct = Math.max(0, Math.min(100, progress));

  return (
    <section className="game-reward-card">
      <div className="game-orbit one" aria-hidden />
      <div className="game-orbit two" aria-hidden />
      <div className="game-reward-head">
        <div>
          <p className="card-title">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="game-xp-chip game-float">
          <span>{pointsLabel}</span>
          <strong>{pointsValue}</strong>
        </div>
      </div>
      <div className="game-track-wrap">
        <div className="game-track">
          <div className="game-track-fill" style={{ width: `${pct}%` }} />
          {steps.map((step, index) => (
            <div
              className={`game-step ${step.tone} ${step.unlocked ? "unlocked" : "locked"}`}
              key={`${step.label}-${index}`}
              style={{ left: `${steps.length === 1 ? 50 : (index / (steps.length - 1)) * 100}%` }}
            >
              <span className="game-step-token">{step.unlocked ? "★" : "🔒"}</span>
              <small>{step.label}</small>
              <strong>{step.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
