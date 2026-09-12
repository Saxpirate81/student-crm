"use client";

import { useEffect, useState } from "react";
import { CadenzaRichTextEditor } from "@/components/messaging/CadenzaRichTextEditor";
import { QuincyComposeButton } from "@/components/studio/QuincyComposeButton";
import {
  STUDIO_THREAD_EVENT,
  addThreadMessage,
  listThreadMessages,
  type ThreadAttachment,
  type ThreadRole,
} from "@/lib/studio-thread/store";

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

type Props = {
  threadId: string;
  fromRole: ThreadRole;
  title?: string;
  subtitle?: string;
};

export function StudioThread({ threadId, fromRole, title = "Messages", subtitle }: Props) {
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [attachments, setAttachments] = useState<ThreadAttachment[]>([]);
  const [messages, setMessages] = useState<ReturnType<typeof listThreadMessages>>([]);

  useEffect(() => {
    const refresh = () => setMessages(listThreadMessages(threadId));
    refresh();
    window.addEventListener(STUDIO_THREAD_EVENT, refresh);
    return () => window.removeEventListener(STUDIO_THREAD_EVENT, refresh);
  }, [threadId]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    [...files].forEach((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        setAttachments((current) => [
          ...current,
          { name: file.name, type: file.type, dataUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const send = () => {
    const plain = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!plain && !attachments.length) return;
    addThreadMessage({ threadId, fromRole, bodyHtml, attachments });
    setBodyHtml("<p></p>");
    setAttachments([]);
  };

  return (
    <section className="session-card">
      <div className="session-card-head">
        <p className="card-title">{title}</p>
        {subtitle ? <p className="session-card-sub">{subtitle}</p> : null}
      </div>
      <div className="session-thread-list">
        {messages.length ? (
          messages.map((message) => (
            <article key={message.id} className={`session-thread-msg from-${message.fromRole}`}>
              <span className="session-thread-role">{message.fromRole}</span>
              <div className="session-thread-body" dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
              {message.attachments.map((file) =>
                file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={file.name + file.dataUrl.slice(-12)} src={file.dataUrl} alt={file.name} className="session-thread-img" />
                ) : (
                  <a key={file.name + file.dataUrl.slice(-12)} href={file.dataUrl} download={file.name} className="session-thread-file">
                    {file.name}
                  </a>
                ),
              )}
            </article>
          ))
        ) : (
          <p className="session-empty">No messages yet. Teacher, student, and parent threads for this class live here.</p>
        )}
      </div>
      <div className="session-compose">
        <CadenzaRichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Write a note, assignment, or update…" />
        {attachments.length ? (
          <div className="session-attach-list">
            {attachments.map((file) => (
              <span key={file.name + file.dataUrl.slice(-8)}>{file.name}</span>
            ))}
          </div>
        ) : null}
        <div className="session-compose-actions">
          <label className="btn btn-ghost btn-sm">
            Attach
            <input
              type="file"
              hidden
              multiple
              accept="image/*,.pdf,.mp3,.m4a,.wav,.mov,.mp4"
              onChange={(event) => {
                addFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <QuincyComposeButton html={bodyHtml} onApply={setBodyHtml} />
          <button type="button" className="btn btn-primary btn-sm" onClick={send}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
