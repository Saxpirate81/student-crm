"use client";

type NetflixScrollRowProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

/**
 * Horizontal rail with snap scrolling (Netflix-style). Hides scrollbars for a clean chrome look.
 */
export function NetflixScrollRow({ title, description, children }: NetflixScrollRowProps) {
  return (
    <section className="pt-8 md:pt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white md:text-lg">{title}</h2>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-xs font-medium leading-relaxed text-slate-500 dark:text-zinc-400 md:text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="relative">
        <div
          className="flex gap-3 overflow-x-auto overflow-y-visible scroll-smooth px-2 pb-4 pt-1 [scrollbar-width:none] snap-x snap-mandatory md:gap-4 md:px-3 [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-slate-100 via-slate-100/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 md:w-12"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-slate-100 via-slate-100/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 md:w-12"
          aria-hidden
        />
      </div>
    </section>
  );
}
