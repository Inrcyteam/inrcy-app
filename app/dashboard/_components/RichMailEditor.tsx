"use client";

import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { normalizeRichMailHtmlForSend, richMailHtmlToText, sanitizeRichMailHtml, textToRichMailHtml } from "@/lib/mailRichText";

type RichMailEditorProps = {
  text: string;
  html: string;
  onChange: (next: { text: string; html: string }) => void;
  placeholder?: string;
  minHeight?: string | number;
  className?: string;
  editorStyle?: CSSProperties;
  toolbarTitle?: React.ReactNode;
  hideToolbarLabel?: boolean;
  compactToolbar?: boolean;
};

export default function RichMailEditor({
  text,
  html,
  onChange,
  placeholder = "Votre message…",
  minHeight = "clamp(180px, 30vh, 260px)",
  className,
  editorStyle,
  toolbarTitle,
  hideToolbarLabel = false,
  compactToolbar = false,
}: RichMailEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastHtmlRef = useRef("");
  const [isEmpty, setIsEmpty] = useState(() => !String(text || "").trim());

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    const nextHtml = normalizeRichMailHtmlForSend(text, html || textToRichMailHtml(text));
    if (lastHtmlRef.current === nextHtml) return;
    if (node.innerHTML === nextHtml) return;
    node.innerHTML = nextHtml;
    lastHtmlRef.current = nextHtml;
    setIsEmpty(!String(text || "").trim());
  }, [html, text]);

  const emitChange = () => {
    const node = editorRef.current;
    if (!node) return;
    const cleanHtml = sanitizeRichMailHtml(node.innerHTML);
    const cleanText = richMailHtmlToText(cleanHtml || node.innerText || "");
    lastHtmlRef.current = cleanHtml;
    setIsEmpty(!cleanText.trim());
    onChange({ text: cleanText, html: cleanHtml || textToRichMailHtml(cleanText) });
  };

  const applyCommand = (command: "bold" | "italic" | "underline") => {
    const node = editorRef.current;
    if (!node) return;
    node.focus();
    try {
      document.execCommand(command, false);
    } catch {
      // Les navigateurs anciens peuvent ignorer la commande.
    }
    emitChange();
  };

  const buttonStyle = compactToolbar ? compactToolbarButtonStyle : toolbarButtonStyle;
  const toolbar = (
    <div style={{ display: "flex", gap: compactToolbar ? 5 : 6, alignItems: "center", flex: "0 0 auto" }}>
      <button type="button" onClick={() => applyCommand("bold")} aria-label="Gras" title="Gras" style={buttonStyle}>
        <strong>B</strong>
      </button>
      <button type="button" onClick={() => applyCommand("italic")} aria-label="Italique" title="Italique" style={buttonStyle}>
        <em>I</em>
      </button>
      <button type="button" onClick={() => applyCommand("underline")} aria-label="Souligné" title="Souligné" style={buttonStyle}>
        <span style={{ textDecoration: "underline" }}>U</span>
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compactToolbar ? 6 : 8, flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: toolbarTitle || hideToolbarLabel ? "space-between" : "space-between",
          gap: 8,
          flexWrap: "nowrap",
          minWidth: 0,
        }}
      >
        {toolbarTitle ? (
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>{toolbarTitle}</div>
        ) : hideToolbarLabel ? (
          <span aria-hidden="true" style={{ flex: "1 1 auto" }} />
        ) : (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", minWidth: 0 }}>Mise en forme du message</span>
        )}
        {toolbar}
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        {isEmpty ? (
          <span
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              color: "rgba(255,255,255,0.42)",
              fontSize: 16,
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            {placeholder}
          </span>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          className={className}
          onInput={emitChange}
          onBlur={emitChange}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = event.clipboardData.getData("text/plain") || "";
            document.execCommand("insertText", false, pasted);
            emitChange();
          }}
          style={{
            width: "100%",
            flex: 1,
            minHeight,
            height: "100%",
            maxHeight: "100%",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            fontSize: 16,
            lineHeight: 1.55,
            boxSizing: "border-box",
            display: "block",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            outline: "none",
            ...editorStyle,
          }}
        />
      </div>
    </div>
  );
}

const toolbarButtonStyle: CSSProperties = {
  minWidth: 32,
  height: 30,
  borderRadius: 10,
  border: "1px solid rgba(56,189,248,0.36)",
  background: "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(167,139,250,0.18))",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(0,0,0,0.16)",
};

const compactToolbarButtonStyle: CSSProperties = {
  ...toolbarButtonStyle,
  minWidth: 28,
  height: 28,
  borderRadius: 9,
  fontSize: 13,
  boxShadow: "0 6px 14px rgba(0,0,0,0.14)",
};
