"use client";

import React, { useEffect, useState } from "react";

type Props = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  /** Ajout optionnel (ex: bouton ? d'aide) placé à gauche de "Fermer" */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
};

export default function SettingsDrawer({ title, isOpen, onClose, headerActions, children }: Props) {
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window === "undefined" ? 1440 : window.innerWidth);
  const isMobile = viewportWidth <= 640;

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen]);

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
        zIndex: 9999,
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
          height: isMobile ? "100dvh" : "100%",
          boxSizing: "border-box",
          background: "rgba(16,16,16,0.98)",
          borderLeft: isMobile ? 0 : "1px solid rgba(255,255,255,0.08)",
          padding: isMobile ? "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))" : 16,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: 12, minWidth: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 17 : 18, fontWeight: 700, minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere", lineHeight: 1.2 }}>{title}</h2>

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
