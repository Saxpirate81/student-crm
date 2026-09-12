/**
 * Validates `next` from query string for post-login redirects (open redirect hardening).
 * Returns a pathname only (no query/hash), or null if unsafe.
 */
export function safeInternalNextPath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  if (s.includes("..")) return null;
  if (/[\s\x00-\x1f]/.test(s)) return null;
  const pathOnly = s.split("?")[0].split("#")[0];
  if (!pathOnly || pathOnly.includes(":")) return null;
  if (!/^\/[-A-Za-z0-9/_.~]+$/.test(pathOnly)) return null;
  return pathOnly;
}
