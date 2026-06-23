"use client";

import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { highlightTemplatePlaceholdersInHtml, normalizeRichMailHtmlForSend, richMailHtmlToText, sanitizeRichMailHtml, stripTemplatePlaceholderHighlights, textToRichMailHtml } from "@/lib/mailRichText";

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
  highlightTemplatePlaceholders?: boolean;
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
  highlightTemplatePlaceholders = true,
}: RichMailEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastHtmlRef = useRef("");
  const lastTouchYRef = useRef<number | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const skipNextToolbarClickRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(() => !String(text || "").trim());

  const saveSelection = () => {
    const node = editorRef.current;
    if (!node || typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount <= 0) return;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.commonAncestorContainer)) return;
    savedSelectionRef.current = range.cloneRange();
  };

  const restoreSelection = () => {
    const node = editorRef.current;
    const range = savedSelectionRef.current;
    if (!node || !range || typeof window === "undefined") return;
    try {
      if (!node.contains(range.commonAncestorContainer)) return;
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      savedSelectionRef.current = null;
    }
  };

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    const normalizedHtml = normalizeRichMailHtmlForSend(text, html || textToRichMailHtml(text));
    const nextHtml = highlightTemplatePlaceholders ? highlightTemplatePlaceholdersInHtml(normalizedHtml) : stripTemplatePlaceholderHighlights(normalizedHtml);
    if (lastHtmlRef.current === nextHtml) return;
    if (node.innerHTML === nextHtml) return;
    node.innerHTML = nextHtml;
    lastHtmlRef.current = nextHtml;
    setIsEmpty(!String(text || "").trim());
  }, [highlightTemplatePlaceholders, html, text]);

  const emitChange = (syncDisplay = false) => {
    const node = editorRef.current;
    if (!node) return;
    const rawHtml = stripTemplatePlaceholderHighlights(node.innerHTML);
    const cleanHtml = sanitizeRichMailHtml(rawHtml);
    const displayHtml = highlightTemplatePlaceholders ? highlightTemplatePlaceholdersInHtml(cleanHtml) : cleanHtml;
    const cleanText = richMailHtmlToText(cleanHtml || node.innerText || "");
    if (syncDisplay && node.innerHTML !== displayHtml) {
      node.innerHTML = displayHtml;
    }
    lastHtmlRef.current = displayHtml;
    setIsEmpty(!cleanText.trim());
    onChange({ text: cleanText, html: displayHtml || textToRichMailHtml(cleanText) });
  };

  const applyCommand = (command: "bold" | "italic" | "underline") => {
    const node = editorRef.current;
    if (!node) return;
    focusEditableWithoutScroll(node);
    restoreSelection();
    try {
      document.execCommand(command, false);
    } catch {
      // Les navigateurs anciens peuvent ignorer la commande.
    }
    emitChange();
    saveSelection();
  };

  const keepEditorSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    saveSelection();
    if (event.cancelable) event.preventDefault();
  };

  const applyToolbarCommandFromTouch = (
    event: React.TouchEvent<HTMLButtonElement>,
    command: "bold" | "italic" | "underline",
  ) => {
    saveSelection();
    if (event.cancelable) event.preventDefault();
    skipNextToolbarClickRef.current = true;
    applyCommand(command);
    window.setTimeout(() => {
      skipNextToolbarClickRef.current = false;
    }, 500);
  };

  const applyToolbarCommandFromClick = (command: "bold" | "italic" | "underline") => {
    if (skipNextToolbarClickRef.current) {
      skipNextToolbarClickRef.current = false;
      return;
    }
    applyCommand(command);
  };

  const passScrollToParent = (deltaY: number) => {
    const node = editorRef.current;
    const scrollParent = findScrollableParent(node);
    if (!scrollParent) return false;
    scrollParent.scrollTop += deltaY;
    return true;
  };

  const shouldPassScrollToParent = (deltaY: number) => {
    const node = editorRef.current;
    if (!node) return false;
    const hasInternalScroll = node.scrollHeight > node.clientHeight + 1;
    if (!hasInternalScroll) return true;

    const isScrollingUp = deltaY < 0;
    const isScrollingDown = deltaY > 0;
    const atTop = node.scrollTop <= 0;
    const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;

    return (isScrollingUp && atTop) || (isScrollingDown && atBottom);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const deltaY = event.deltaY;
    if (!deltaY || !shouldPassScrollToParent(deltaY)) return;
    if (!passScrollToParent(deltaY)) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    lastTouchYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const previousY = lastTouchYRef.current;
    const currentY = event.touches[0]?.clientY ?? null;
    if (previousY === null || currentY === null) return;

    const deltaY = previousY - currentY;
    lastTouchYRef.current = currentY;
    if (!deltaY || !shouldPassScrollToParent(deltaY)) return;
    if (!passScrollToParent(deltaY)) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };

  const handleTouchEnd = () => {
    lastTouchYRef.current = null;
  };

  const fillAvailable = minHeight === 0 || minHeight === "0" || minHeight === "0px";
  const buttonStyle = compactToolbar ? compactToolbarButtonStyle : toolbarButtonStyle;
  const toolbar = (
    <div style={{ display: "flex", gap: compactToolbar ? 5 : 6, alignItems: "center", flex: "0 0 auto" }}>
      <button type="button" onMouseDown={keepEditorSelection} onTouchStart={(event) => applyToolbarCommandFromTouch(event, "bold")} onClick={() => applyToolbarCommandFromClick("bold")} aria-label="Gras" title="Gras" style={buttonStyle}>
        <strong>B</strong>
      </button>
      <button type="button" onMouseDown={keepEditorSelection} onTouchStart={(event) => applyToolbarCommandFromTouch(event, "italic")} onClick={() => applyToolbarCommandFromClick("italic")} aria-label="Italique" title="Italique" style={buttonStyle}>
        <em>I</em>
      </button>
      <button type="button" onMouseDown={keepEditorSelection} onTouchStart={(event) => applyToolbarCommandFromTouch(event, "underline")} onClick={() => applyToolbarCommandFromClick("underline")} aria-label="Souligné" title="Souligné" style={buttonStyle}>
        <span style={{ textDecoration: "underline" }}>U</span>
      </button>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compactToolbar ? 6 : 8,
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
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

      <div
        style={{
          position: "relative",
          flex: fillAvailable ? "1 1 0" : "0 0 auto",
          minHeight: fillAvailable ? 0 : minHeight,
          display: "flex",
          overflow: "hidden",
        }}
      >
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
          onInput={() => {
            emitChange();
            saveSelection();
          }}
          onBlur={() => emitChange(true)}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = event.clipboardData.getData("text/plain") || "";
            document.execCommand("insertText", false, pasted);
            emitChange();
            saveSelection();
          }}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{
            ...editorStyle,
            width: "100%",
            flex: "1 1 auto",
            minHeight: fillAvailable ? 0 : "100%",
            height: "100%",
            maxHeight: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "auto",
            scrollbarGutter: "stable",
            scrollPaddingTop: 12,
            scrollPaddingBottom: 24,
            fontSize: 16,
            lineHeight: 1.55,
            boxSizing: "border-box",
            display: "block",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}

function focusEditableWithoutScroll(node: HTMLElement) {
  try {
    node.focus({ preventScroll: true });
  } catch {
    node.focus();
  }
}

function findScrollableParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement ?? null;

  while (parent) {
    const style = window.getComputedStyle(parent);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
    if (canScrollY && parent.scrollHeight > parent.clientHeight + 1) {
      return parent;
    }
    parent = parent.parentElement;
  }

  const scrollingElement = document.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : null;
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
