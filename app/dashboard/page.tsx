"use client";
import { useMemo, useState, useEffect } from "react";
import styles from "./dashboard.module.css";

type Module = {
  key: string;
  label: string;
  icon: string;
};

export default function Page() {
  const modules: Module[] = useMemo(
    () => [
      { key: "mails", label: "Mails", icon: "✉️" },
      { key: "facebook", label: "Facebook", icon: "📘" },
      { key: "site", label: "Site iNrCy", icon: "🧩" },
      { key: "publier", label: "Publier", icon: "🛰️" },
      { key: "houzz", label: "Houzz", icon: "🏠" },
      { key: "gmb", label: "GMB", icon: "📍" },
      { key: "stats", label: "Stats", icon: "📊" },
      { key: "crm", label: "CRM", icon: "🧠" },
      { key: "tracking", label: "Tracking", icon: "📞" },
      { key: "devis", label: "Devis", icon: "📄" },
      { key: "factures", label: "Factures", icon: "🧾" },
      { key: "settings", label: "Réglages", icon: "⚙️" },
    ],
    []
  );

  const [active, setActive] = useState(5); // GMB au départ

  const N = modules.length;
  const radius = 220;
  const step = (Math.PI * 2) / N;

  // Le point "bas exact"
  const baseAngle = Math.PI / 2;

  return (
    <main className={styles.page}>
      <div className={styles.stage}>
        {/* Cercles fixes */}
        <div className={styles.ring}></div>
        <div className={styles.ring2}></div>

        {/* Noyau */}
        <div className={styles.core}>
          <div className={styles.coreTitle}>iNrCy</div>
          <div className={styles.coreSub}>Générateur</div>
        </div>

        {/* Orbites */}
        <div className={styles.orbit}>
          {modules.map((m, i) => {
            const angle = baseAngle + (i - active) * step;

            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            const isActive = i === active;

            return (
              <div
                key={m.key}
                className={`${styles.bubble} ${
                  isActive ? styles.active : ""
                }`}
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                }}
                onClick={() => setActive(i)}
              >
                <div className={styles.icon}>{m.icon}</div>
                <div className={styles.label}>{m.label}</div>
              </div>
            );
          })}
        </div>

        {/* Navigation */}
        <div className={styles.controls}>
          <button onClick={() => setActive((a) => (a - 1 + N) % N)}>◀</button>
          <div className={styles.current}>{modules[active].label}</div>
          <button onClick={() => setActive((a) => (a + 1) % N)}>▶</button>
        </div>
      </div>
    </main>
  );
}
