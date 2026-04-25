"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export function CadenzaRichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lineHeight, setLineHeight] = useState(1.35);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const exec = useCallback((command: string, valueArg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, valueArg);
    if (ref.current) {
      onChange(ref.current.innerHTML);
    }
  }, [onChange]);

  const onInput = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertEmoji = (emoji: string) => {
    ref.current?.focus();
    document.execCommand("insertText", false, emoji);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div className="rte-shell">
      <div className="rte-toolbar">
        <div className="rte-group">
          <button type="button" className="rte-btn" onClick={() => exec("bold")} title="Bold">
            B
          </button>
          <button type="button" className="rte-btn rte-italic" onClick={() => exec("italic")} title="Italic">
            I
          </button>
          <button type="button" className="rte-btn rte-under" onClick={() => exec("underline")} title="Underline">
            U
          </button>
        </div>
        <div className="rte-group">
          <select
            className="rte-select"
            defaultValue="3"
            onChange={(event) => exec("fontSize", event.target.value)}
            aria-label="Text size"
          >
            <option value="1">Small</option>
            <option value="3">Normal</option>
            <option value="5">Large</option>
            <option value="7">XL</option>
          </select>
          <select
            className="rte-select"
            defaultValue="system"
            onChange={(event) => {
              const v = event.target.value;
              if (v === "system") exec("removeFormat");
              else exec("fontName", v);
            }}
            aria-label="Font"
          >
            <option value="system">System</option>
            <option value="Georgia">Georgia</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times</option>
            <option value="Courier New">Courier</option>
          </select>
          <label className="rte-inline">
            <span>Spacing</span>
            <input
              type="range"
              min={1}
              max={2.4}
              step={0.05}
              value={lineHeight}
              onChange={(event) => {
                const next = Number(event.target.value);
                setLineHeight(next);
                if (ref.current) ref.current.style.lineHeight = String(next);
              }}
            />
          </label>
        </div>
        <div className="rte-group rte-emoji">
          {["😀", "🎉", "🎵", "✅", "📣", "❤️", "🙌", "🎓"].map((emoji) => (
            <button key={emoji} type="button" className="rte-emoji-btn" onClick={() => insertEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={ref}
        className="rte-editor"
        style={{ lineHeight }}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={onInput}
      />
    </div>
  );
}
