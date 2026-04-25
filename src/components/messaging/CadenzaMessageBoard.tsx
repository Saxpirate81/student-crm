"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CadenzaRichTextEditor } from "@/components/messaging/CadenzaRichTextEditor";
import {
  MESSAGE_BOARD_EVENT,
  formatMessageTimestampUtc,
  loadMessages,
  loadReadIds,
  markAllRead,
  saveMessages,
  type MessageAudience,
  type MessageImageLayout,
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

export function CadenzaMessageBoard({ viewerRole }: Props) {
  const isAdmin = viewerRole === "admin";
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);

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

  const visibleMessages = useMemo(
    () => messages.filter((message) => messageVisible(message, viewerRole)),
    [messages, viewerRole],
  );

  const unreadIds = useMemo(() => {
    const read = new Set(readIds);
    return visibleMessages.filter((message) => !read.has(message.id)).map((message) => message.id);
  }, [readIds, visibleMessages]);

  const preview = useMemo(() => {
    return [...visibleMessages]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [visibleMessages]);

  const markVisibleRead = () => {
    if (!unreadIds.length) return;
    markAllRead(unreadIds);
    refresh();
  };

  return (
    <section className="message-board" aria-label="Studio message board">
      <div className="mb-head">
        <div>
          <p className="mb-kicker">Announcements</p>
          <div className="mb-title-row">
            <h2 className="mb-title">Studio messages</h2>
            {unreadIds.length ? <span className="nav-badge">{unreadIds.length}</span> : null}
          </div>
          <p className="mb-sub">
            {viewerRole === "student" || viewerRole === "parent"
              ? "Updates for students and families."
              : "Internal + external updates for your role."}
          </p>
        </div>
        <div className="mb-actions">
          <Link className="btn btn-ghost" href={`/messages/archive?from=${viewerRole}`}>
            Past messages
          </Link>
          {unreadIds.length ? (
            <button className="btn btn-secondary" type="button" onClick={markVisibleRead}>
              Mark read
            </button>
          ) : null}
          {isAdmin ? (
            <button className="btn btn-primary" type="button" onClick={() => setComposerOpen(true)}>
              Add message
            </button>
          ) : null}
        </div>
      </div>

      {preview.length ? (
        <div className="mb-grid">
          {preview.map((message) => {
            const unread = !readIds.includes(message.id);
            return (
              <article key={message.id} className={`mb-card ${unread ? "mb-unread" : ""}`}>
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
          })}
        </div>
      ) : (
        <div className="mb-empty">No messages yet for this view.</div>
      )}

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
