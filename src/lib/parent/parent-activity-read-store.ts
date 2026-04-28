const STORAGE_KEY = "cadenza.parentActivity.readIds.v1";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function loadMap(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  return safeParse<Record<string, string[]>>(window.localStorage.getItem(STORAGE_KEY), {});
}

function saveMap(map: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadParentActivityReadIds(parentCrmId: string): string[] {
  return loadMap()[parentCrmId] ?? [];
}

/** Merge event ids into the read set for this parent (household feed). */
export function markParentActivityEventsRead(parentCrmId: string, eventIds: string[]) {
  if (typeof window === "undefined" || !eventIds.length) return;
  const map = loadMap();
  const next = new Set([...(map[parentCrmId] ?? []), ...eventIds]);
  map[parentCrmId] = [...next];
  saveMap(map);
}
