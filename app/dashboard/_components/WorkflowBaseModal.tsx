"use client";

import { useEffect } from "react";
import styles from "../dashboard.module.css";

export default function BaseModal({
  title,
  moduleLabel,
  onClose,
  headerHidden = false,
  headerStatus,
  headerStatusMobileHidden = false,
  headerActions,
  compact = false,
  maxWidth,
  children,
}: {
  title: string;
  moduleLabel?: string; // ex: "Module Booster", "Module Fidéliser"
  onClose: () => void | Promise<void>;
  headerHidden?: boolean;
  headerStatus?: React.ReactNode;
  headerStatusMobileHidden?: boolean;
  headerActions?: React.ReactNode;
  compact?: boolean;
  maxWidth?: number | string;
  children: React.ReactNode;
}) {
  const resolvedMaxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") void onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;
    const prevBodyOverscroll = (body.style as any).overscrollBehavior;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    (body.style as any).overscrollBehavior = "none";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
      (body.style as any).overscrollBehavior = prevBodyOverscroll;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={styles.fullscreenModalOverlay}
      onMouseDown={() => void onClose()}
      style={{
        position: "fixed",
        inset: 0,
        height: "100dvh",
        maxHeight: "100dvh",
        zIndex: 90,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex",
        alignItems: compact ? "center" : "stretch",
        justifyContent: compact ? "center" : "stretch",
        padding: compact
          ? "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))"
          : "var(--inrcy-modal-overlay-padding, max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)))",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={[styles.blockCard, styles.fullscreenModalCard].join(" ")}
        style={{
          width: compact ? "min(100%, var(--inrcy-compact-modal-width, 680px))" : "100%",
          maxWidth: compact ? (resolvedMaxWidth || "680px") : "100%",
          height: compact ? "auto" : "100%",
          maxHeight: compact ? "calc(100dvh - 32px)" : "100%",
          boxSizing: "border-box",
          minWidth: 0,
          borderRadius: "var(--inrcy-modal-card-radius, 22px)",
          overflow: "hidden",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header sticky (unique) */}
        {!headerHidden ? (
          <div
            className={[styles.blockHeaderRow, styles.fullscreenModalHeader].join(" ")}
            style={{
              alignItems: "center",
              padding: "var(--inrcy-modal-header-padding, max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)))",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              position: "sticky",
              top: 0,
              background: "rgba(10,12,24,0.60)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: "100%",
                minWidth: 0,
                display: "grid",
                gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr) minmax(0, auto)",
                alignItems: "center",
                gap: 12,
              }}
            >
              {/* Left badge */}
              <div style={{ minWidth: 0 }}>
                {moduleLabel ? (
                  <span style={pillStyle}>{moduleLabel}</span>
                ) : null}
              </div>

              {/* Center title */}
              <div style={{ textAlign: "center" }}>
                <span style={pillStyle}>{title}</span>
              </div>

              {/* Right actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                  flexWrap: "nowrap",
                }}
              >
                {headerStatus ? (
                  <div
                    className={styles.modalHeaderStatusDesktop}
                    style={{
                      minWidth: 0,
                      maxWidth: "min(360px, 42vw)",
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    {headerStatus}
                  </div>
                ) : null}
                {headerActions}
                <button
                  type="button"
                  className={[styles.ghostBtn, styles.modalCloseButton].join(" ")}
                  onClick={() => void onClose()}
                  style={closeBtnStyle}
                  aria-label="Fermer"
                  title="Fermer"
                >
                  <span className={styles.modalCloseDesktopLabel}>Fermer</span>
                  <span className={styles.modalCloseMobileLabel} aria-hidden="true">×</span>
                </button>
              </div>
            </div>
            {headerStatus && !headerStatusMobileHidden ? (
              <div className={styles.modalHeaderStatusMobile}>
                {headerStatus}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Content scroll */}
        <div
          className={styles.fullscreenModalScroll}
          style={{
            padding: "var(--inrcy-modal-content-padding, max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)))",
            overflowY: "auto",
            overflowX: "hidden",
            flex: compact ? "0 1 auto" : 1,
            minHeight: 0,
            minWidth: 0,
            boxSizing: "border-box",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
          }}
        >
          <div
            className={styles.fullscreenModalInner}
            style={{
              maxWidth: compact ? "100%" : "var(--inrcy-modal-inner-max-width, min(1400px, 100%))",
              margin: "0 auto",
              minWidth: 0,
              boxSizing: "border-box",
              minHeight: compact ? "auto" : "100%",
              height: compact ? "auto" : "100%",
              width: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  whiteSpace: "normal",
  textAlign: "center",
  maxWidth: "100%",
};

const closeBtnStyle: React.CSSProperties = {
  // garde le look "bulle" même si ghostBtn change
  borderRadius: 999,
  padding: "7px 12px",
};
