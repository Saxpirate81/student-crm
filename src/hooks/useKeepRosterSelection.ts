"use client";

import { useEffect, useLayoutEffect, useState } from "react";

export const CADENZA_SELECTED_STUDENT_KEY = "cadenza-selected-student";

export function readStoredRosterId(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredRosterId(key: string, value: string) {
  if (typeof window === "undefined" || !value) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Same initial value on server and client; reads localStorage after mount. */
export function useHydratedStoredId(key: string, fallback = "") {
  const [id, setId] = useState(fallback);
  useLayoutEffect(() => {
    const stored = readStoredRosterId(key, fallback);
    if (stored) setId(stored);
  }, [key, fallback]);
  return [id, setId] as const;
}

export function useKeepRosterSelection(
  ids: string[],
  selected: string,
  setSelected: (id: string) => void,
) {
  useEffect(() => {
    if (!ids.length) return;
    if (!ids.includes(selected)) setSelected(ids[0]!);
  }, [ids, selected, setSelected]);
}
