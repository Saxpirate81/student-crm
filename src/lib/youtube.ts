/** Returns YouTube video id for common URL shapes, or null. */
export function parseYouTubeVideoId(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "");
    const idOk = (id: string | null | undefined) => (id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null);
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return idOk(id);
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      const vid = idOk(v);
      if (vid) return vid;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && idOk(parts[1])) return parts[1];
      if (parts[0] === "shorts" && idOk(parts[1])) return parts[1];
    }
  } catch {
    const m = input.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return m?.[1] ?? null;
  }
  return null;
}

export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}

export function youTubeThumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
