/** Normalize staff names for cross-source matching ("Unger, Haley" ↔ "Haley Unger"). */
export function staffNameMatchKey(name: string) {
  const trimmed = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",").map((part) => part.trim());
    if (last && first) return `${first} ${last}`.replace(/\s+/g, " ");
  }
  return trimmed;
}

export function staffNamesMatch(a: string, b: string) {
  const keyA = staffNameMatchKey(a);
  const keyB = staffNameMatchKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}
