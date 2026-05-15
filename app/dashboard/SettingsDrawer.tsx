"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  /** Ajout optionnel (ex: bouton ? d'aide) placé à gauche de "Fermer" */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
};

export default function SettingsDrawer({ title, isOpen, onClose, headerActions, children }: Props) {
  // Valeurs stables côté serveur/client au premier rendu : évite les erreurs React #418
  // quand le drawer est ouvert directement via /dashboard?panel=ia sur mobile.
  const [viewportWidth, setViewportWidth] = useState<number>(1440);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const isMobile = viewportWidth <= 640;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(Math.round(window.visualViewport?.height || window.innerHeight));
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  const drawerHeight = useMemo(
    () => (isMobile ? (viewportHeight ? `${viewportHeight}px` : "100svh") : "100%"),
    [isMobile, viewportHeight],
  );

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 10050,
        display: "flex",
        justifyContent: isMobile ? "stretch" : "flex-end",
        overflow: "hidden",
        padding: isMobile ? 0 : undefined,
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? "100vw" : "min(560px, 92vw)",
          maxWidth: "100vw",
          height: drawerHeight,
          maxHeight: drawerHeight,
          boxSizing: "border-box",
          background: "rgba(16,16,16,0.98)",
          borderLeft: isMobile ? 0 : "1px solid rgba(255,255,255,0.08)",
          padding: isMobile ? "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))" : 16,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
            width: "100%",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "white",
              fontSize: "clamp(16px, 4.3vw, 18px)",
              fontWeight: 800,
              minWidth: 0,
              maxWidth: "100%",
              overflowWrap: "break-word",
              wordBreak: "normal",
              hyphens: "auto",
              lineHeight: 1.25,
            }}
          >
            {title}
          </h2>

          {/* Zone actions (ex: ?) + Fermer avec gap */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" }}>
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "white",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              Fermer
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>{children}</div>
      </aside>
    </div>
  );
}
