"use client";

import { useEffect } from "react";
import styles from "../../../dashboard/dashboard.module.css";

export default function BaseModal({
  title,
  moduleLabel,
  onClose,
  children,
}: {
  title: string;
  moduleLabel?: string; // ex: "Module Booster", "Module Fidéliser"
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        padding: 12,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={styles.blockCard}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 22,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header sticky (unique) */}
        <div
          className={styles.blockHeaderRow}
          style={{
            alignItems: "center",
            padding: 12,
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
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
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

            {/* Right close */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className={styles.ghostBtn} onClick={onClose} style={closeBtnStyle}>
                Fermer
              </button>
            </div>
          </div>
        </div>

        {/* Content scroll */}
        <div style={{ padding: 12, overflow: "auto", flex: 1 }}>
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              height: "100%",
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
  whiteSpace: "nowrap",
};

const closeBtnStyle: React.CSSProperties = {
  // garde le look "bulle" même si ghostBtn change
  borderRadius: 999,
  padding: "7px 12px",
};
