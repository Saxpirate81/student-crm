import { Suspense } from "react";
import { LessonStreamingView } from "./LessonStreamingView";

function LessonShellFallback() {
  return (
    <div className="relative left-1/2 w-screen max-w-none -translate-x-1/2 bg-slate-100 px-4 py-16 dark:bg-zinc-950 md:px-8">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6 lg:max-w-7xl">
        <div className="h-4 w-24 rounded-full bg-slate-300 dark:bg-zinc-800" />
        <div className="h-10 max-w-md rounded-lg bg-slate-300 dark:bg-zinc-800" />
        <div className="aspect-video max-w-4xl rounded-3xl bg-slate-200 dark:bg-zinc-900" />
        <div className="h-8 w-40 rounded bg-slate-300 dark:bg-zinc-800" />
        <div className="flex gap-3">
          <div className="h-36 w-52 shrink-0 rounded-2xl bg-slate-200 dark:bg-zinc-900" />
          <div className="h-36 w-52 shrink-0 rounded-2xl bg-slate-200 dark:bg-zinc-900" />
          <div className="h-36 w-52 shrink-0 rounded-2xl bg-slate-200 dark:bg-zinc-900" />
        </div>
      </div>
    </div>
  );
}

export default function LessonPage() {
  return (
    <Suspense fallback={<LessonShellFallback />}>
      <LessonStreamingView />
    </Suspense>
  );
}
