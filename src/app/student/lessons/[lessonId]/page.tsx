import { Suspense } from "react";
import { LessonStreamingView } from "./LessonStreamingView";

function LessonShellFallback() {
  return (
    <div className="card">
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-24 rounded-full bg-[var(--bg4)]" />
        <div className="h-10 max-w-md rounded-lg bg-[var(--bg4)]" />
        <div className="aspect-video max-w-4xl rounded-xl bg-[var(--bg3)]" />
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
