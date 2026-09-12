export type ThreadRole = "instructor" | "student" | "parent";

export type ThreadAttachment = {
  name: string;
  type: string;
  dataUrl: string;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  fromRole: ThreadRole;
  bodyHtml: string;
  attachments: ThreadAttachment[];
  createdAt: string;
};

const STORAGE_KEY = "cadenza.studio-thread.v1";
export const STUDIO_THREAD_EVENT = "cadenza-studio-thread";

type Store = Record<string, ThreadMessage[]>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(STUDIO_THREAD_EVENT));
}

export function listThreadMessages(threadId: string) {
  return [...(readStore()[threadId] ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addThreadMessage(input: {
  threadId: string;
  fromRole: ThreadRole;
  bodyHtml: string;
  attachments: ThreadAttachment[];
}) {
  const store = readStore();
  const message: ThreadMessage = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Date.now()}`,
    threadId: input.threadId,
    fromRole: input.fromRole,
    bodyHtml: input.bodyHtml,
    attachments: input.attachments,
    createdAt: new Date().toISOString(),
  };
  store[input.threadId] = [...(store[input.threadId] ?? []), message];
  writeStore(store);
  return message;
}
