export type MessageAudience = "internal" | "external";
export type MessageImageLayout = "header" | "thumbnail";

export type StudioMessage = {
  id: string;
  title: string;
  audience: MessageAudience;
  bodyHtml: string;
  imageDataUrl?: string | null;
  imageLayout: MessageImageLayout;
  createdAt: string;
};

const STORAGE_KEY = "cadenza.messageBoard.v1";
const READ_KEY = "cadenza.messageBoard.readIds.v1";

export const MESSAGE_BOARD_EVENT = "cadenza:message-board";

/** Deterministic across Node SSR and browsers (avoids hydration mismatches from `toLocaleString`). */
export function formatMessageTimestampUtc(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadMessages(): StudioMessage[] {
  if (typeof window === "undefined") return [];
  const stored = safeParse<StudioMessage[]>(window.localStorage.getItem(STORAGE_KEY), []);
  if (stored.length) return stored;
  const seed: StudioMessage[] = [
    {
      id: "msg-seed-internal",
      title: "Studio ops update",
      audience: "internal",
      imageLayout: "thumbnail",
      imageDataUrl: null,
      createdAt: new Date().toISOString(),
      bodyHtml:
        "<p><strong>Reminder:</strong> please confirm lesson notes are published before the weekend rush.</p>",
    },
    {
      id: "msg-seed-external",
      title: "Family communication",
      audience: "external",
      imageLayout: "header",
      imageDataUrl: null,
      createdAt: new Date().toISOString(),
      bodyHtml:
        "<p>We are testing the new <em>message board</em> experience across student and parent views.</p>",
    },
  ];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

export function saveMessages(messages: StudioMessage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  window.dispatchEvent(new Event(MESSAGE_BOARD_EVENT));
}

export function loadReadIds(): string[] {
  if (typeof window === "undefined") return [];
  return safeParse<string[]>(window.localStorage.getItem(READ_KEY), []);
}

export function saveReadIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(MESSAGE_BOARD_EVENT));
  } catch (e) {
    console.error("Cadenza message board: could not save read state (private mode or storage blocked).", e);
    throw e;
  }
}

export function markAllRead(ids: string[]) {
  if (!ids.length) return;
  const current = new Set(loadReadIds());
  ids.forEach((id) => current.add(id));
  saveReadIds([...current]);
}

/** Mark a single message read (same storage as bulk). */
export function markMessageRead(id: string) {
  markAllRead([id]);
}

/** Clear which messages are read (this browser only). Student/parent UI uses this so “Mark read” can appear again after testing. */
export function clearMessageBoardReadIds() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(READ_KEY);
    window.dispatchEvent(new Event(MESSAGE_BOARD_EVENT));
  } catch (e) {
    console.error("Cadenza message board: could not clear read state.", e);
    throw e;
  }
}
