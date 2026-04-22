"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { StudentVideoTheater } from "@/components/student/StudentVideoTheater";
import { useRepository } from "@/lib/useRepository";

export default function VideoDetailPage() {
  const { repository } = useRepository();
  const params = useParams<{ videoId: string }>();
  const video = repository.getVideo(params.videoId);

  if (!video) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-8 text-center dark:border-white/10 dark:bg-zinc-900/60">
        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">Video not found.</p>
        <Link
          href="/student"
          className="mt-4 inline-flex text-sm font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
        >
          Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className="relative left-1/2 w-screen max-w-none -translate-x-1/2 bg-slate-100 pb-16 pt-2 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 md:pb-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8 lg:max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-6 md:pb-8">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-600/90 dark:text-violet-400/90">Now watching</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-3xl">{video.title}</h1>
          </div>
          <Link
            href="/student"
            className="shrink-0 rounded-full border border-slate-300/90 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/25 dark:hover:bg-white/10 md:text-sm"
          >
            ← Library
          </Link>
        </header>

        <StudentVideoTheater video={video} hideMetronomePanel />
      </div>
    </div>
  );
}
