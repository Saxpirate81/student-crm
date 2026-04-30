"use client";

import Link from "next/link";
import type { AnimationEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CadenzaRichTextEditor } from "@/components/messaging/CadenzaRichTextEditor";
import {
  MESSAGE_BOARD_EVENT,
  clearMessageBoardReadIds,
  formatMessageTimestampUtc,
  loadMessages,
  loadReadIds,
  markMessageRead,
  saveMessages,
  type MessageAudience,
  type MessageImageLayout,
  type MessageSource,
  type StudioMessage,
} from "@/lib/messaging/message-board-store";

type ViewerRole = "student" | "parent" | "instructor" | "admin" | "producer";

type Props = {
  viewerRole: ViewerRole;
};

function audienceForRole(role: ViewerRole): MessageAudience[] {
  if (role === "student" || role === "parent") return ["external"];
  return ["internal", "external"];
}

function messageVisible(message: StudioMessage, role: ViewerRole) {
  return audienceForRole(role).includes(message.audience);
}

type BoardPhase = "open" | "flash" | "collapsed";

const caughtUpPhrases = [
  "All caught up · clear deck",
  "All caught up · studio is quiet",
  "All caught up · ready for the next win",
  "All caught up · clean slate",
  "All caught up · nothing waiting",
  "All caught up · nice rhythm",
  "All caught up · inbox in tune",
];

function messageSource(message: StudioMessage): MessageSource {
  return message.source ?? (message.audience === "internal" ? "internal" : "school");
}

function sourceLabel(source: MessageSource) {
  if (source === "school") return "School";
  if (source === "instructor") return "Instructor";
  if (source === "app") return "App";
  if (source === "external") return "External";
  return "Internal";
}

export function CadenzaMessageBoard({ viewerRole }: Props) {
  const isAdmin = viewerRole === "admin";
  const isFamilyViewer = viewerRole === "student" || viewerRole === "parent";
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [boardPhase, setBoardPhase] = useState<BoardPhase>("open");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [caughtUpPhrase, setCaughtUpPhrase] = useState(caughtUpPhrases[0]);

  const refresh = useCallback(() => {
    setMessages(loadMessages());
    setReadIds(loadReadIds());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes("cadenza.messageBoard")) {
        refresh();
      }
    };
    const onLocal = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(MESSAGE_BOARD_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MESSAGE_BOARD_EVENT, onLocal);
    };
  }, [refresh]);

  useEffect(() => {
    const today = new Date();
    const dayKey = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
    const roleOffset = viewerRole.length;
    setCaughtUpPhrase(caughtUpPhrases[(dayKey + roleOffset) % caughtUpPhrases.length]);
  }, [viewerRole]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => messageVisible(message, viewerRole)),
    [messages, viewerRole],
  );

  const unreadIds = useMemo(() => {
    const read = new Set(readIds);
    return visibleMessages.filter((message) => !read.has(message.id)).map((message) => message.id);
  }, [readIds, visibleMessages]);

  useEffect(() => {
    if (boardPhase === "collapsed" && unreadIds.length > 0) {
      setBoardPhase("open");
    }
  }, [boardPhase, unreadIds.length]);

  const preview = useMemo(() => {
    const read = new Set(readIds);
    return [...visibleMessages]
      .filter((message) => !read.has(message.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4);
  }, [readIds, visibleMessages]);

  const markOneRead = (id: string) => {
    try {
      markMessageRead(id);
      refresh();
    } catch {
      return;
    }
  };

  const onCaughtUpAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    const name = event.animationName ?? "";
    if (!name.split(",").some((part) => part.trim().includes("mbCaughtUpFlash"))) return;
    setBoardPhase("collapsed");
  };

  useEffect(() => {
    if (boardPhase !== "flash") return;
    const t = window.setTimeout(() => {
      setBoardPhase((phase) => (phase === "flash" ? "collapsed" : phase));
    }, 3200);
    return () => window.clearTimeout(t);
  }, [boardPhase]);

  if (boardPhase === "collapsed") {
    if (composerOpen) {
      return (
        <MessageComposer
          onClose={() => setComposerOpen(false)}
          onPublish={(next) => {
            const merged = [next, ...messages];
            saveMessages(merged);
            refresh();
            setComposerOpen(false);
          }}
        />
      );
    }
    if (isAdmin) {
      return (
        <div className="mb-collapsed-reopen">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBoardPhase("open")}>
            Show studio messages
          </button>
        </div>
      );
    }
    if (isFamilyViewer && preview.length > 0) {
      return (
        <div className="mb-collapsed-family" role="region" aria-label="Studio messages">
          <div className="mb-collapsed-family-row">
            <p className="mb-collapsed-family-copy">
              <strong>Studio messages</strong>
              <span className="mb-collapsed-family-sep">·</span>
              All read — your practice space is next below.
            </p>
            <div className="mb-collapsed-family-actions">
              <Link className="btn btn-ghost btn-sm" href={`/messages/archive?from=${viewerRole}`}>
                Past messages
              </Link>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  try {
                    clearMessageBoardReadIds();
                    refresh();
                    setBoardPhase("open");
                  } catch {
                    return;
                  }
                }}
              >
                Show as new again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  if (boardPhase === "flash") {
    return (
      <div
        className="mb-caught-up-flash"
        role="status"
        aria-live="polite"
        onAnimationEnd={onCaughtUpAnimationEnd}
      >
        <span className="mb-caught-up-icon" aria-hidden>
          ✓
        </span>
        <span className="mb-caught-up-text">You&apos;re all caught up</span>
      </div>
    );
  }

  return (
    <section className="message-board" aria-label="Studio message board">
      <div className="mb-head">
        <div>
          <p className="mb-kicker">Announcements</p>
          <div className="mb-title-row">
            <span className="mb-title-left">
              <h2 className="mb-title">Studio messages</h2>
              {unreadIds.length ? <span className="nav-badge">{unreadIds.length}</span> : null}
              {!preview.length ? (
                <span className="mb-caught-up-pill" role="status" aria-live="polite">
                  <span className="mb-caught-up-spark" aria-hidden />
                  {caughtUpPhrase}
                </span>
              ) : null}
            </span>
            <span className="mb-actions">
              <Link className="btn btn-ghost" href={`/messages/archive?from=${viewerRole}`}>
                Past messages
              </Link>
              {isAdmin ? (
                <button className="btn btn-primary" type="button" onClick={() => setComposerOpen(true)}>
                  Add message
                </button>
              ) : null}
            </span>
          </div>
        </div>
      </div>

      {preview.length ? (
        <div className="mb-stack">
          {preview.map((message) => {
            const unread = !readIds.includes(message.id);
            const source = messageSource(message);
            const expanded = expandedIds.includes(message.id);
            const plainBody = message.bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            const canExpand = plainBody.length > 115 || message.bodyHtml.includes("</p><p");
            return (
              <article key={message.id} className={`mb-card mb-source-${source} ${expanded ? "mb-expanded" : ""} ${unread ? "mb-unread" : ""}`}>
                <div className="mb-card-top">
                  <span className={`mb-pill mb-pill-${source}`}>
                    {sourceLabel(source)}
                  </span>
                  <span className="mb-card-top-actions">
                    {unread ? <span className="mb-dot" aria-label="Unread" /> : null}
                    <button type="button" className="mb-mark-one" onClick={() => void markOneRead(message.id)}>
                      Mark read
                    </button>
                  </span>
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
                    <div className={`mb-html ${expanded ? "expanded" : "clamped"}`} dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
                    {canExpand ? (
                      <button
                        className="mb-expand"
                        type="button"
                        onClick={() =>
                          setExpandedIds((current) =>
                            current.includes(message.id)
                              ? current.filter((id) => id !== message.id)
                              : [...current, message.id],
                          )
                        }
                      >
                        {expanded ? "Show less" : "Read more"}
                      </button>
                    ) : null}
                    <p className="mb-meta">{formatMessageTimestampUtc(message.createdAt)}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {composerOpen ? (
        <MessageComposer
          onClose={() => setComposerOpen(false)}
          onPublish={(next) => {
            const merged = [next, ...messages];
            saveMessages(merged);
            refresh();
            setComposerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

type ComposerProps = {
  onClose: () => void;
  onPublish: (message: StudioMessage) => void;
};

function MessageComposer({ onClose, onPublish }: ComposerProps) {
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<MessageAudience>("external");
  const [source, setSource] = useState<MessageSource>("school");
  const [imageLayout, setImageLayout] = useState<MessageImageLayout>("header");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState("<p></p>");

  const onFile = (file: File | null) => {
    if (!file) {
      setImageDataUrl(null);
      return;
    }
    if (file.type !== "image/png") {
      alert("Please attach a PNG image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const publish = () => {
    if (!title.trim()) {
      alert("Add a title for this message.");
      return;
    }
    const message: StudioMessage = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Date.now()}`,
      title: title.trim(),
      audience,
      source,
      imageLayout,
      imageDataUrl,
      bodyHtml: bodyHtml.trim() ? bodyHtml : "<p></p>",
      createdAt: new Date().toISOString(),
    };
    onPublish(message);
  };

  return (
    <div className="mb-modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="mb-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Compose studio message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-modal-head">
          <div>
            <p className="mb-kicker">Admin</p>
            <h3>New message</h3>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close composer">
            ×
          </button>
        </div>

        <div className="mb-modal-body">
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Headline" />
          </label>

          <div className="mb-two">
            <label className="field">
              <span>Audience</span>
              <select value={audience} onChange={(event) => setAudience(event.target.value as MessageAudience)}>
                <option value="internal">Internal (instructors, admin, producers)</option>
                <option value="external">External (students & parents)</option>
              </select>
            </label>
            <label className="field">
              <span>Source</span>
              <select value={source} onChange={(event) => setSource(event.target.value as MessageSource)}>
                <option value="school">School</option>
                <option value="instructor">Instructor</option>
                <option value="app">App</option>
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </label>
            <label className="field">
              <span>Image layout</span>
              <select value={imageLayout} onChange={(event) => setImageLayout(event.target.value as MessageImageLayout)}>
                <option value="header">Header banner</option>
                <option value="thumbnail">Left thumbnail</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>PNG attachment (optional)</span>
            <input type="file" accept="image/png" onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
          </label>

          <label className="field">
            <span>Message</span>
            <CadenzaRichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Write your update..." />
          </label>
        </div>

        <div className="mb-modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={publish}>
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}
