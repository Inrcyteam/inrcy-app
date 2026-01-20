import React from "react";
import styles from "../login/login.module.css";

export default function SetPasswordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.layout}>
      {/* Fond luxe derrière */}
      <div className={`${styles.layoutBg} inrcy-soft-noise`} />

      {/* Grain */}
      <div className="inrcy-noise-overlay" />

      {/* Contenu */}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

