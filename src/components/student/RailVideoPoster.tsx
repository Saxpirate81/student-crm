"use client";

import type { StudentVideo } from "@/lib/domain/types";

type RailVideoPosterProps = {
  video: StudentVideo;
  selected: boolean;
  onSelect: (videoId: string) => void;
};

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export function RailVideoPoster({ video, selected, onSelect }: RailVideoPosterProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(video.id)}
      className={`group/rail snap-start shrink-0 scroll-ml-2 text-left transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 dark:focus-visible:ring-offset-zinc-950 ${
        selected ? "scale-[1.02]" : "hover:scale-[1.02] active:scale-[0.99]"
      }`}
    >
      <div
        className={`relative aspect-video w-[min(44vw,280px)] overflow-hidden rounded-2xl shadow-lg shadow-slate-900/20 dark:shadow-black/40 ring-1 transition md:w-[min(32vw,300px)] lg:w-[min(24vw,320px)] ${
          selected
            ? "ring-2 ring-violet-400"
            : "ring-slate-200/90 hover:ring-slate-300 dark:ring-white/10 dark:hover:ring-white/25"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover transition duration-500 group-hover/rail:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-90 transition group-hover/rail:opacity-100" />
        <div className="absolute inset-x-0 bottom-0 p-3 md:p-3.5">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-white md:text-sm">
            {video.title}
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
            {formatDuration(video.durationSec)}
          </p>
        </div>
        {selected ? (
          <span className="absolute right-2 top-2 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
            Now playing
          </span>
        ) : null}
      </div>
    </button>
  );
}
