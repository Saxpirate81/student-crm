import type { ProgramType } from "@/lib/domain/types";

type ProgramTabsProps = {
  programs: ProgramType[];
  activeProgram: ProgramType;
  onChange: (program: ProgramType) => void;
};

const labels: Record<ProgramType, string> = {
  lessons: "Lessons",
  bands: "Bands",
  camps: "Camps",
};

export function ProgramTabs({ programs, activeProgram, onChange }: ProgramTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {programs.map((program) => {
        const active = activeProgram === program;
        return (
          <button
            key={program}
            type="button"
            onClick={() => onChange(program)}
            className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
              active
                ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/25 dark:border-indigo-400 dark:bg-indigo-500"
                : "ui-button-secondary"
            }`}
          >
            {labels[program]}
          </button>
        );
      })}
    </div>
  );
}
