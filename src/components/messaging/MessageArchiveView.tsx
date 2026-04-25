"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MESSAGE_BOARD_EVENT,
  formatMessageTimestampUtc,
  loadMessages,
  loadReadIds,
  markAllRead,
  type StudioMessage,
} from "@/lib/messaging/message-board-store";

type ViewerRole = "student" | "parent" | "instructor" | "admin" | "producer";

type Props = {
  viewerRole: ViewerRole;
};

function audienceForRole(role: ViewerRole) {
  if (role === "student" || role === "parent") return ["external"] as const;
  return ["internal", "external"] as const;
}

function visible(message: StudioMessage, role: ViewerRole) {
  return (audienceForRole(role) as readonly string[]).includes(message.audience);
}

export function MessageArchiveView({ viewerRole }: Props) {
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setMessages(loadMessages());
    setReadIds(loadReadIds());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes("cadenza.messageBoard")) refresh();
    };
    const onLocal = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(MESSAGE_BOARD_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MESSAGE_BOARD_EVENT, onLocal);
    };
  }, [refresh]);

  const rows = useMemo(() => {
    return [...messages]
      .filter((message) => visible(message, viewerRole))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [messages, viewerRole]);

  const unreadIds = useMemo(() => {
    const read = new Set(readIds);
    return rows.filter((message) => !read.has(message.id)).map((message) => message.id);
  }, [readIds, rows]);

  return (
    <div className="archive-shell">
      <div className="archive-head">
        <div>
          <p className="mb-kicker">History</p>
          <p className="mb-sub">Everything published to your audience, newest first.</p>
        </div>
        <div className="mb-actions">
          {unreadIds.length ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                markAllRead(unreadIds);
                refresh();
              }}
            >
              Mark all read
            </button>
          ) : null}
        </div>
      </div>

      <div className="archive-list">
        {rows.length ? (
          rows.map((message) => {
            const unread = !readIds.includes(message.id);
            return (
              <article key={message.id} className={`mb-card archive-row ${unread ? "mb-unread" : ""}`}>
                <div className="mb-card-top">
                  <span className={`mb-pill ${message.audience === "internal" ? "mb-pill-int" : "mb-pill-ext"}`}>
                    {message.audience === "internal" ? "Internal" : "External"}
                  </span>
                  {unread ? <span className="mb-dot" aria-label="Unread" /> : null}
                </div>
                {message.imageDataUrl && message.imageLayout === "header" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="mb-banner" src={message.imageDataUrl} alt="" />
                ) : null}
                <div className={`mb-body ${message.imageDataUrl && message.imageLayout === "thumbnail" ? "mb-has-thumb" : ""}`}>
                  {message.imageDataUrl && message.imageLayout === "thumbnail" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="mb-thumb" src={message.imageDataUrl} alt="" />
                  ) : null}
                  <div className="mb-copy">
                    <h3>{message.title}</h3>
                    <div className="mb-html" dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
                    <p className="mb-meta">{formatMessageTimestampUtc(message.createdAt)}</p>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="mb-empty">No archived messages yet.</div>
        )}
      </div>
    </div>
  );
}
