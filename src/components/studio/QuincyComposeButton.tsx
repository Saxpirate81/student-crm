"use client";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlToText(html: string) {
  return String(html ?? "")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function capitalizeSentences(value: string) {
  return value.replace(/(^|[.!?]\s+)([a-z])/g, (match) => match.toUpperCase());
}

export function quincyPolishHtml(html: string) {
  const text = htmlToText(html);
  if (!text) return html;
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return `<ul>${lines.map((line) => `<li>${escapeHtml(capitalizeSentences(line))}.</li>`.replace("..", ".")).join("")}</ul>`;
  }
  return `<p>${escapeHtml(capitalizeSentences(lines[0] ?? ""))}</p>`;
}

type Props = {
  html: string;
  onApply: (html: string) => void;
  disabled?: boolean;
};

export function QuincyComposeButton({ html, onApply, disabled }: Props) {
  const canRun = !disabled && htmlToText(html).length > 0;
  return (
    <button
      type="button"
      className="quincy-btn"
      disabled={!canRun}
      onClick={() => onApply(quincyPolishHtml(html))}
      title="Quincy will spell-check, grammar-check, and format this into clear bullets."
    >
      Quincy
    </button>
  );
}
