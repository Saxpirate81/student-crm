import Link from "next/link";
import type { StudentVideo } from "@/lib/domain/types";

type VideoCardProps = {
  video: StudentVideo;
  href: string;
  subtitle?: string;
};

export function VideoCard({ video, href, subtitle }: VideoCardProps) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 shadow-lg shadow-slate-900/[0.06] ring-1 ring-transparent transition hover:-translate-y-0.5 hover:border-indigo-300/70 hover:shadow-xl hover:ring-indigo-500/15 dark:border-white/10 dark:bg-slate-900/55 dark:shadow-black/40 dark:hover:border-indigo-400/40 dark:hover:ring-indigo-400/20">
      <Link href={href} className="relative block overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="h-40 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-80 transition group-hover:opacity-100" />
        <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-800 shadow-sm dark:bg-slate-950/90 dark:text-white">
          Play
        </span>
      </Link>
      <div className="space-y-1 p-3.5">
        <p className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-slate-50">{video.title}</p>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {subtitle ?? "Tap to open lesson view"}
        </p>
      </div>
    </article>
  );
}
