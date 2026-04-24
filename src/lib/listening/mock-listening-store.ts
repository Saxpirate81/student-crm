export type ListeningTrack = {
  id: string;
  studentCrmId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  lessonId: string | null;
  lessonTitle: string | null;
  songTitle: string | null;
  addedBy: "instructor" | "student" | "school" | "app";
  addedAt: string;
  listenedSeconds: number;
};

export type NewsUpdate = {
  id: string;
  studentCrmId: string;
  source: "instructor" | "school" | "app" | "student";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};

export type ListeningState = {
  tracks: ListeningTrack[];
  news: NewsUpdate[];
};

const STORAGE_KEY = "cadenza-listening-state-v1";

export function youtubeThumbnailFromUrl(url: string) {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&/]+)/,
    /youtube\.com\/shorts\/([^?&/]+)/,
  ];
  const match = patterns.map((pattern) => url.match(pattern)?.[1]).find(Boolean);
  if (!match) return "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
  return `https://img.youtube.com/vi/${encodeURIComponent(match)}/hqdefault.jpg`;
}

const defaultState: ListeningState = {
  tracks: [
    {
      id: "track-alex-1",
      studentCrmId: "crm-alex",
      title: "Ghost note groove reference",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      lessonId: "les-12",
      lessonTitle: "Guitar - Groove and timing",
      songTitle: "Main groove study",
      addedBy: "instructor",
      addedAt: "2026-04-22T14:00:00.000Z",
      listenedSeconds: 420,
    },
    {
      id: "track-alex-2",
      studentCrmId: "crm-alex",
      title: "Warmup tone study",
      url: "https://www.youtube.com/watch?v=oHg5SJYRHA0",
      thumbnailUrl: "https://img.youtube.com/vi/oHg5SJYRHA0/hqdefault.jpg",
      lessonId: "les-12",
      lessonTitle: "Guitar - Groove and timing",
      songTitle: "Warmup tone",
      addedBy: "student",
      addedAt: "2026-04-21T18:30:00.000Z",
      listenedSeconds: 180,
    },
  ],
  news: [
    {
      id: "news-alex-1",
      studentCrmId: "crm-alex",
      source: "instructor",
      title: "New listening track added",
      body: "Sarah added Ghost note groove reference to your listening playlist.",
      createdAt: "2026-04-22T14:00:00.000Z",
      read: false,
    },
    {
      id: "news-alex-2",
      studentCrmId: "crm-alex",
      source: "school",
      title: "Spring recital prep",
      body: "The school posted new recital preparation reminders for this month.",
      createdAt: "2026-04-20T12:00:00.000Z",
      read: false,
    },
    {
      id: "news-alex-3",
      studentCrmId: "crm-alex",
      source: "app",
      title: "Practice log update",
      body: "Practice logging now listens for music and accumulates active session time.",
      createdAt: "2026-04-19T12:00:00.000Z",
      read: true,
    },
  ],
};

function cloneDefaultState(): ListeningState {
  return JSON.parse(JSON.stringify(defaultState)) as ListeningState;
}

export function loadListeningState(): ListeningState {
  if (typeof window === "undefined") return cloneDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw) as ListeningState;
    return {
      tracks: Array.isArray(parsed.tracks)
        ? parsed.tracks.map((track) => ({
            ...track,
            thumbnailUrl: track.thumbnailUrl ?? youtubeThumbnailFromUrl(track.url),
            lessonId: track.lessonId ?? null,
            lessonTitle: track.lessonTitle ?? null,
            songTitle: track.songTitle ?? null,
          }))
        : cloneDefaultState().tracks,
      news: Array.isArray(parsed.news) ? parsed.news : cloneDefaultState().news,
    };
  } catch {
    return cloneDefaultState();
  }
}

export function saveListeningState(state: ListeningState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function addListeningTrack(input: {
  studentCrmId: string;
  title: string;
  url: string;
  lessonId?: string | null;
  lessonTitle?: string | null;
  songTitle?: string | null;
  addedBy: ListeningTrack["addedBy"];
}) {
  const state = loadListeningState();
  const created: ListeningTrack = {
    id: `track-${Date.now()}`,
    studentCrmId: input.studentCrmId,
    title: input.title,
    url: input.url,
    thumbnailUrl: youtubeThumbnailFromUrl(input.url),
    lessonId: input.lessonId ?? null,
    lessonTitle: input.lessonTitle ?? null,
    songTitle: input.songTitle ?? null,
    addedBy: input.addedBy,
    addedAt: new Date().toISOString(),
    listenedSeconds: 0,
  };
  state.tracks = [created, ...state.tracks];
  state.news = [
    {
      id: `news-${Date.now()}`,
      studentCrmId: input.studentCrmId,
      source: input.addedBy,
      title: "New listening track added",
      body: `${input.addedBy === "instructor" ? "Your instructor" : "You"} added ${input.title} to the listening playlist.`,
      createdAt: created.addedAt,
      read: input.addedBy === "student",
    },
    ...state.news,
  ];
  saveListeningState(state);
  return created;
}

export function addListeningSeconds(trackId: string, seconds: number) {
  const state = loadListeningState();
  state.tracks = state.tracks.map((track) =>
    track.id === trackId ? { ...track, listenedSeconds: track.listenedSeconds + Math.max(0, seconds) } : track,
  );
  saveListeningState(state);
}

export function markStudentNewsRead(studentCrmId: string) {
  const state = loadListeningState();
  state.news = state.news.map((item) =>
    item.studentCrmId === studentCrmId ? { ...item, read: true } : item,
  );
  saveListeningState(state);
}
