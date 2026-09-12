"use client";

import { useEffect } from "react";

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
