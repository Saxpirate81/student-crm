const BANNED_SUBSTRINGS = ["spam", "scam", "xxx"];

export function isShowcaseTextAllowed(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return !BANNED_SUBSTRINGS.some((w) => t.includes(w));
}
