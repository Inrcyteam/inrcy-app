"use client";

import { useEffect } from "react";
import styles from "../../../dashboard/dashboard.module.css";

export default function BaseModal({
  title,
  onClose,
  children,
}: {
  title: string;
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
        padding: 18,
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
        {/* Header sticky */}
        <div
          className={styles.blockHeaderRow}
          style={{
            alignItems: "center",
            gap: 10,
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            position: "sticky",
            top: 0,
            background: "rgba(10,12,24,0.55)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            zIndex: 2,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className={styles.blockTitle}>{title}</div>
            <div className={styles.subtitle}>Module Fidéliser</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>

        {/* Content scroll */}
        <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
