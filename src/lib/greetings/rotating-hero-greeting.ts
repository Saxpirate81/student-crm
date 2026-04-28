export type HeroGreetingRole = "student" | "instructor" | "parent" | "admin" | "producer";

function counterKey(role: HeroGreetingRole): string {
  return `cadenza.heroGreeting.counter.${role}`;
}

function poolForRole(role: HeroGreetingRole): string[] {
  switch (role) {
    case "student":
      return [
        "{name}, welcome back to your practice space.",
        "{name}, keep the streak alive.",
        "{name}, today is a great day to level up.",
        "{name}, your next breakthrough is one focused session away.",
        "{name}, small reps add up to big sound.",
        "{name}, tune in, turn up the focus, and play.",
        "{name}, consistency beats intensity—show up again today.",
        "{name}, let curiosity lead your practice.",
        "{name}, one clear goal beats a dozen half-hearted tries.",
        "{name}, warm up your ears and your habits.",
        "{name}, the metronome is waiting—so is your progress.",
      ];
    case "instructor":
      return [
        "{name}, welcome back to the instructor hub.",
        "{name}, shape the next practice session.",
        "{name}, your students feel the energy you bring.",
        "{name}, a clear plan today saves confusion tomorrow.",
        "{name}, upload, annotate, inspire—then let them run with it.",
        "{name}, great teaching is invisible preparation.",
        "{name}, meet them where they are, then nudge them forward.",
        "{name}, your studio runs smoother when notes are crystal clear.",
        "{name}, celebrate the tiny wins—they compound.",
        "{name}, one thoughtful assignment can change their week.",
        "{name}, lead with encouragement, follow with standards.",
      ];
    case "parent":
      return [
        "{name}, welcome back to the family hub.",
        "{name}, family support is half the journey.",
        "{name}, steady routines build confident musicians.",
        "{name}, your presence at home echoes in the lesson room.",
        "{name}, progress is rarely linear—cheer the effort.",
        "{name}, a calm check-in beats a rushed push.",
        "{name}, celebrate practice, not just performances.",
        "{name}, curiosity thrives when pressure stays low.",
        "{name}, you are the home team for their grit.",
        "{name}, small habits at home unlock big leaps in class.",
        "{name}, trust the process—they are building more than notes.",
      ];
    case "admin":
      return [
        "{name}, welcome back to admin mode.",
        "{name}, keep the media library trustworthy.",
        "{name}, clarity today prevents confusion tomorrow.",
        "{name}, organized archives protect everyone’s work.",
        "{name}, a clean roster is a kind roster.",
        "{name}, thoughtful uploads respect instructors and families.",
        "{name}, you are the backstage crew for the whole studio.",
        "{name}, consistency in admin work multiplies studio trust.",
        "{name}, label well, search fast, sleep better.",
        "{name}, every restored file is a win for a student.",
        "{name}, guard the details—the music depends on them.",
      ];
    case "producer":
      return [
        "{name}, welcome back to the producer console.",
        "{name}, connect the dots from queue to playbook to matrix.",
        "{name}, systems thinking keeps the studio humming.",
        "{name}, a crisp rule today prevents a fire drill tomorrow.",
        "{name}, you translate strategy into student reality.",
        "{name}, good data tells the story before anyone asks.",
        "{name}, tighten the loop: observe, adjust, ship.",
        "{name}, your scaffolding turns chaos into cadence.",
        "{name}, small automations buy back hours for humans.",
        "{name}, version the playbook—future you will thank you.",
        "{name}, ship the boring fixes—they unlock the magic.",
      ];
    default: {
      const _exhaustive: never = role;
      return [_exhaustive];
    }
  }
}

function firstNameFromDisplay(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Line 0 only — matches first client paint before `useEffect` runs. */
export function getHeroGreetingHeadlineSsr(role: HeroGreetingRole, displayName: string): string {
  const name = firstNameFromDisplay(displayName);
  const pool = poolForRole(role);
  const line = pool[0] ?? "{name}, welcome back.";
  return line.replaceAll("{name}", name);
}

function readCounter(role: HeroGreetingRole): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(counterKey(role));
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolves the visible headline after hydration. Seeds a random counter once per tab
 * if missing so demo sessions still rotate; counter increments on each successful login.
 */
export function getHeroGreetingHeadlineClient(role: HeroGreetingRole, displayName: string): string {
  const name = firstNameFromDisplay(displayName);
  const pool = poolForRole(role);
  if (!pool.length) return `${name}, welcome back.`;
  if (typeof window === "undefined") return getHeroGreetingHeadlineSsr(role, displayName);

  let counter = readCounter(role);
  if (counter === null) {
    counter = Math.floor(Math.random() * pool.length);
    window.sessionStorage.setItem(counterKey(role), String(counter));
  }
  const line = pool[counter % pool.length] ?? pool[0];
  return line.replaceAll("{name}", name);
}

/** Call after a successful sign-in for that persona so the next hero headline shifts. */
export function advanceHeroGreetingRotation(role: HeroGreetingRole): void {
  if (typeof window === "undefined") return;
  const prev = readCounter(role);
  const next = (prev ?? 0) + 1;
  window.sessionStorage.setItem(counterKey(role), String(next));
}
