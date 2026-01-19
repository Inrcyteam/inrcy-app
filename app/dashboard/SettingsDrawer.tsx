"use client";

import React, { useEffect } from "react";

type Props = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export default function SettingsDrawer({ title, isOpen, onClose, children }: Props) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
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
        justifyContent: "flex-end",
      }}
    >
      <aside
  onClick={(e) => e.stopPropagation()}
  style={{
    width: "min(560px, 92vw)",
    height: "100%",
    background: "rgba(16,16,16,0.98)",
    borderLeft: "1px solid rgba(255,255,255,0.08)",
    padding: 16,
    overflowY: "auto",
    overflowX: "hidden", // ✅ AJOUTE ÇA
  }}
>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
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

        <div style={{ marginTop: 12 }}>{children}</div>
      </aside>
    </div>
  );
}

