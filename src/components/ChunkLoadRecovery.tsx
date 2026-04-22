"use client";

import { useEffect, useState } from "react";

function isChunkLoadFailure(reason: unknown): boolean {
  if (reason == null) return false;
  if (typeof reason === "string") {
    return (
      reason.includes("Loading chunk") ||
      reason.includes("ChunkLoadError") ||
      reason.includes("Failed to fetch dynamically imported module")
    );
  }
  if (reason instanceof Error) {
    const name = reason.name ?? "";
    const message = reason.message ?? "";
    return (
      name === "ChunkLoadError" ||
      message.includes("Loading chunk") ||
      message.includes("ChunkLoadError") ||
      message.includes("Failed to fetch dynamically imported module")
    );
  }
  return false;
}

function isNextStaticResourceError(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) {
    return false;
  }
  const url = target instanceof HTMLScriptElement ? target.src : target.href;
  if (!url) return false;
  return url.includes("/_next/static/");
}

/**
 * After a dev rebuild or deploy, the browser can keep old HTML that references
 * removed `_next/static` chunks — Next then 400s those URLs and the app throws.
 * Offer a one-click reload instead of a blank error overlay.
 */
export function ChunkLoadRecovery() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) setVisible(true);
    };
    const onError = (event: Event) => {
      if (isNextStaticResourceError(event)) {
        setVisible(true);
        return;
      }
      if (event instanceof ErrorEvent && isChunkLoadFailure(event.error ?? event.message)) {
        setVisible(true);
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError, true);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError, true);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[9999] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
      role="status"
    >
      <div className="pointer-events-auto flex max-w-lg flex-col gap-3 rounded-2xl border border-amber-500/40 bg-zinc-950/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm text-zinc-100">
          This page is out of date with the server (common right after a rebuild). Reload to load the
          latest scripts.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
