import React from "react";
import styles from "./dashboard.module.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.bg} />
      <div className={styles.noise} />
      {children}
    </div>
  );
}


