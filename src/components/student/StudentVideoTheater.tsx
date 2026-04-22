"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { MOCK_USER_KEYS, normalizeLastPositionSec, normalizePlaybackRate } from "@/lib/data/repository";
import type { StudentVideo } from "@/lib/domain/types";
import { useRepository } from "@/lib/useRepository";
import { TheaterMetronomeBlock } from "@/components/student/TheaterMetronomeBlock";

const PLAYBACK_SPEED_OPTIONS = Array.from({ length: 11 }, (_, idx) =>
  Number((0.5 + idx * 0.1).toFixed(1)),
);

type StudentVideoTheaterProps = {
  video: StudentVideo;
  /** Lesson view already shows metronome in the top bar — hide the duplicate panel here. */
  hideMetronomePanel?: boolean;
};

export function StudentVideoTheater({ video, hideMetronomePanel = false }: StudentVideoTheaterProps) {
  const { repository, refresh, version } = useRepository();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoShellRef = useRef<HTMLDivElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [useImageWatermark, setUseImageWatermark] = useState(true);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [watermarkAnimating, setWatermarkAnimating] = useState(false);
  const settings = useMemo(() => {
    void version;
    return repository.getPlaybackSettings(MOCK_USER_KEYS.student, video.id);
  }, [repository, video.id, version]);

  const storedRate = normalizePlaybackRate(settings.playbackRate);

  /** When switching clips: restore saved position + speed. Do not depend on `version` or we snap time on every speed save. */
  useLayoutEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const s = repository.getPlaybackSettings(MOCK_USER_KEYS.student, video.id);
    const r = normalizePlaybackRate(s.playbackRate);
    const t = normalizeLastPositionSec(s.lastPositionSec);
    el.defaultPlaybackRate = r;
    el.playbackRate = r;
    try {
      el.currentTime = Math.min(t, Math.max(0, video.durationSec || Number.POSITIVE_INFINITY));
    } catch {
      el.currentTime = 0;
    }
  }, [video.id, video.durationSec, repository]);

  /** When speed changes (our UI): apply to the element without resetting currentTime. */
  useLayoutEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.defaultPlaybackRate = storedRate;
    el.playbackRate = storedRate;
  }, [storedRate, video.id]);

  const applyRateFromRepository = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      const s = repository.getPlaybackSettings(MOCK_USER_KEYS.student, video.id);
      const r = normalizePlaybackRate(s.playbackRate);
      el.defaultPlaybackRate = r;
      el.playbackRate = r;
    } catch {
      /* ignore — avoid taking down the whole app if storage is corrupt */
    }
  }, [repository, video.id]);

  const saveRate = (rate: number) => {
    const next = normalizePlaybackRate(rate);
    repository.updatePlaybackSettings(MOCK_USER_KEYS.student, video.id, { playbackRate: next });
    const el = videoRef.current;
    if (el) {
      el.defaultPlaybackRate = next;
      el.playbackRate = next;
    }
    refresh();
  };

  const togglePlayback = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      void el.play();
      return;
    }
    el.pause();
  };

  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    if (!Number.isFinite(t)) return;
    repository.updatePlaybackSettings(MOCK_USER_KEYS.student, video.id, {
      lastPositionSec: t,
    });
  };

  const buildShareUrl = () => {
    const token =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const path = `/student/videos/${encodeURIComponent(video.id)}?share=${encodeURIComponent(token)}&wm=1`;
    return base ? `${base}${path}` : path;
  };

  const openShare = async () => {
    const nextUrl = buildShareUrl();
    setShareUrl(nextUrl);
    setCopied(false);

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: video.title,
          text: `Check out this Real School video: ${video.title}`,
          url: nextUrl,
        });
        return;
      } catch {
        // fall through to explicit channel links when native share is dismissed/unsupported.
      }
    }
    setShareOpen(true);
  };

  const copyShareLink = async () => {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
  };

  const toggleFullscreen = async () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (videoShellRef.current) {
      await videoShellRef.current.requestFullscreen();
      return;
    }
    if (videoRef.current && "webkitEnterFullscreen" in videoRef.current) {
      (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    }
  };

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const onFullscreenChange = () => {
      setFullscreenActive(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200/70 backdrop-blur-sm dark:border-white/[0.08] dark:bg-black/40 dark:shadow-2xl dark:shadow-black/50 dark:ring-white/[0.06] md:rounded-3xl">
        <div ref={videoShellRef} className="relative bg-slate-950">
          <video
            key={video.id}
            ref={videoRef}
            src={video.playbackUrl}
            controls
            controlsList="nodownload noplaybackrate nofullscreen"
            playsInline
            className="aspect-video w-full bg-slate-950 object-contain"
            onClick={togglePlayback}
            onLoadedMetadata={applyRateFromRepository}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => setWatermarkAnimating(true)}
            onPause={() => setWatermarkAnimating(false)}
            onEnded={() => setWatermarkAnimating(false)}
          />
          <div className="pointer-events-none absolute right-3 top-3 z-20">
            {useImageWatermark ? (
              <div className="relative px-1.5 py-1">
                <div className="absolute inset-0 -z-10 rounded-md bg-gradient-to-l from-black/45 via-black/30 to-transparent blur-[2px]" />
                <Image
                  src="/watermark-logo.png"
                  alt="Real School watermark"
                  width={765}
                  height={248}
                  className="animate-watermark-tone h-9 w-auto opacity-90 drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)] md:h-11"
                  style={{ animationPlayState: watermarkAnimating ? "running" : "paused" }}
                  onError={() => setUseImageWatermark(false)}
                />
              </div>
            ) : (
              <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] md:text-xs">
                Real School
              </span>
            )}
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2 border-t border-slate-200/80 bg-slate-100/95 px-3 py-3 md:gap-3 md:px-5 md:py-4 dark:border-white/[0.06] dark:bg-zinc-950/80">
          <button
            type="button"
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              void el.play();
            }}
            className="rounded-full border border-slate-300/90 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 md:text-sm dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Play
          </button>
          <button
            type="button"
            onClick={() => videoRef.current?.pause()}
            className="rounded-full border border-slate-300/90 bg-slate-200/70 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 md:text-sm dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={() => {
              if (!videoRef.current) return;
              videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
            }}
            className="rounded-full border border-slate-300/90 bg-transparent px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-900 md:text-sm dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white"
          >
            −10s
          </button>
          <button
            type="button"
            onClick={() => {
              if (!videoRef.current) return;
              videoRef.current.currentTime = Math.min(
                video.durationSec,
                videoRef.current.currentTime + 10,
              );
            }}
            className="rounded-full border border-slate-300/90 bg-transparent px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-900 md:text-sm dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white"
          >
            +10s
          </button>
          <button
            type="button"
            onClick={openShare}
            className="ui-button-secondary rounded-full px-3 py-2 text-xs font-semibold md:text-sm"
          >
            Share
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="ui-button-secondary rounded-full px-3 py-2 text-xs font-semibold md:text-sm"
          >
            {fullscreenActive ? "Exit full screen" : "Full screen"}
          </button>

          <label
            className="ml-auto flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400 md:text-sm"
            htmlFor="student-video-playback-speed"
          >
            <span className="hidden sm:inline">Speed</span>
            <select
              id="student-video-playback-speed"
              value={storedRate.toFixed(1)}
              onChange={(event) => saveRate(Number.parseFloat(event.target.value))}
              className="relative z-10 min-w-[4.5rem] cursor-pointer rounded-full border border-slate-300/90 bg-white px-3 py-2 text-xs font-semibold text-slate-800 md:text-sm dark:border-white/15 dark:bg-zinc-900/90 dark:text-white"
            >
              {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                <option key={speed} value={speed.toFixed(1)}>
                  {speed.toFixed(1)}×
                </option>
              ))}
            </select>
          </label>
        </div>
        {shareOpen && shareUrl ? (
          <div className="border-t border-slate-200/80 bg-slate-50 px-3 py-3 dark:border-white/[0.06] dark:bg-zinc-900/60 md:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyShareLink}
                className="ui-button-primary rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <a
                href={`sms:?body=${encodeURIComponent(`Check out this Real School video: ${shareUrl}`)}`}
                className="ui-button-secondary rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                Text
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="ui-button-secondary rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                Facebook
              </a>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="ui-button-secondary rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                Close
              </button>
            </div>
            <p className="mt-2 break-all text-[11px] text-slate-500 dark:text-zinc-400">{shareUrl}</p>
          </div>
        ) : null}
      </div>

      {!hideMetronomePanel ? <TheaterMetronomeBlock repository={repository} /> : null}
    </div>
  );
}
