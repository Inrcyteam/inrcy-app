"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./dashboard.module.css";

type ModuleItem = {
  key: string;
  label: string;
  desc: string;
  icon: string;
  colorA: string;
  colorB: string;
  href?: string;
};

function wrapIndex(i: number, len: number) {
  return (i % len + len) % len;
}

function toDeg(n: number) {
  return `${n}deg`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function DashboardPage() {
  const modules: ModuleItem[] = useMemo(
    () => [
      { key: "mail", label: "Mails", desc: "Relances & inbox", icon: "✉️", colorA: "rgba(0,180,255,1)", colorB: "rgba(120,90,255,1)" },
      { key: "facebook", label: "Facebook", desc: "Pages & ads", icon: "📘", colorA: "rgba(59,130,246,1)", colorB: "rgba(0,180,255,1)" },
      { key: "site-inrcy", label: "Site iNrCy", desc: "Pages + tracking", icon: "🧩", colorA: "rgba(168,85,247,1)", colorB: "rgba(255,55,140,1)" },
      { key: "publish", label: "Publier", desc: "Posts multi-canaux", icon: "🛰️", colorA: "rgba(6,182,212,1)", colorB: "rgba(0,180,255,1)" },

      { key: "houzz", label: "Houzz", desc: "Profil & posts", icon: "🏠", colorA: "rgba(16,185,129,1)", colorB: "rgba(0,180,255,1)" },
      { key: "gmb", label: "GMB", desc: "Business Profile", icon: "📍", colorA: "rgba(34,197,94,1)", colorB: "rgba(250,204,21,1)" },
      { key: "stats", label: "Stats", desc: "Clics, appels, leads", icon: "📈", colorA: "rgba(255,55,140,1)", colorB: "rgba(255,140,0,1)" },
      { key: "devis", label: "Devis", desc: "Créer & envoyer", icon: "🧾", colorA: "rgba(120,90,255,1)", colorB: "rgba(0,180,255,1)" },

      { key: "factures", label: "Factures", desc: "Paiements & PDF", icon: "🧮", colorA: "rgba(250,204,21,1)", colorB: "rgba(255,55,140,1)" },
      { key: "crm", label: "CRM", desc: "Pipeline leads", icon: "🧠", colorA: "rgba(14,165,233,1)", colorB: "rgba(168,85,247,1)" },
      { key: "tracking", label: "Tracking", desc: "Numéros & events", icon: "📞", colorA: "rgba(255,140,0,1)", colorB: "rgba(0,180,255,1)" },
      { key: "settings", label: "Réglages", desc: "Compte & accès", icon: "⚙️", colorA: "rgba(148,163,184,1)", colorB: "rgba(120,90,255,1)" },
    ],
    []
  );

  const [active, setActive] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const lastSwipeAt = useRef<number>(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  function prev() {
    setActive((v) => wrapIndex(v - 1, modules.length));
  }
  function next() {
    setActive((v) => wrapIndex(v + 1, modules.length));
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const sx = touchStartX.current;
    const sy = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (sx == null || sy == null) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    const now = Date.now();
    if (now - lastSwipeAt.current < 180) return;

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      lastSwipeAt.current = now;
      if (dx < 0) next();
      else prev();
    }
  }

  function openModule(i: number) {
    setActive(i);
  }

  /**
   * Nouvelle logique (sans mouvement automatique)
   * - Toutes les bulles sont sur UNE orbite autour du core.
   * - Le swipe / les flèches changent l'index actif => on "tourne" l'ensemble par pas.
   * - Impression avant/arrière via scale + opacité + blur + z-index.
   */
  const stepDeg = 360 / modules.length;
  const radiusPx = isMobile ? 175 : 265;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>iNrCy</div>
          <div className={styles.brandSub}>Location de générateurs de leads</div>
        </div>

        <div className={styles.topbarRight}>
          <button className={styles.ghostBtn} type="button">
            Support
          </button>
          <button className={styles.primaryBtn} type="button">
            Déconnexion
          </button>
        </div>
      </header>

      <section className={styles.stageWrap}>
        <div
          className={styles.stage}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          role="application"
          aria-label="Dashboard atomique iNrCy"
          style={{ ["--r" as any]: `${radiusPx}px` } as React.CSSProperties}
        >
          <div className={styles.rings} aria-hidden="true">
            <div className={styles.ring} />
            <div className={styles.ring2} />
            <div className={styles.ring3} />
          </div>

          <div className={styles.core}>
            <div className={styles.coreBadge}>⚙️ Générateur</div>
            <div className={styles.coreTitle}>iNrCy</div>
            <div className={styles.coreSub}>Machine à leads • Automatisation • Tracking</div>
          </div>

          <div className={styles.orbitLayer} aria-label="Modules">
            {modules.map((m, i) => {
              const isA = i === active;

              // active en bas (devant)
              const angleDeg = 90 + (i - active) * stepDeg;
              const angleRad = (angleDeg * Math.PI) / 180;

              // profondeur: -1 (arrière) -> +1 (avant)
              const depth = Math.sin(angleRad);
              const t = (depth + 1) / 2; // 0..1

              const scale = 0.78 + t * 0.34;
              const opacity = 0.35 + t * 0.65;
              const blurPx = (1 - t) * 1.4;
              const z = 10 + Math.round(t * 80);

              const safeOpacity = clamp(opacity, 0.22, 1);

              return (
                <button
                  key={m.key}
                  type="button"
                  className={[
                    styles.electron,
                    isMobile ? styles.electronMobile : styles.electronDesktop,
                    isA ? styles.activeElectron : styles.inactiveElectron,
                  ].join(" ")}
                  style={
                    {
                      ["--angle" as any]: toDeg(angleDeg),
                      ["--s" as any]: scale,
                      ["--o" as any]: safeOpacity,
                      ["--blur" as any]: `${blurPx}px`,
                      zIndex: z,
                      ["--cA" as any]: m.colorA,
                      ["--cB" as any]: m.colorB,
                    } as React.CSSProperties
                  }
                  onClick={() => openModule(i)}
                  aria-label={`${m.label} — ${m.desc}`}
                  title={`${m.label} — ${m.desc}`}
                >
                  <span className={styles.bubbleIcon} aria-hidden="true">
                    {m.icon}
                  </span>
                  <span className={styles.bubbleLabel}>{m.label}</span>
                  <span className={styles.bubbleDesc}>{m.desc}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.mobileControls} aria-hidden={!isMobile}>
            <button type="button" className={styles.arrowBtn} onClick={prev} aria-label="Module précédent">
              ←
            </button>

            <div className={styles.mobileHint}>
              <div className={styles.mobileHintTitle}>{modules[active]?.label}</div>
              <div className={styles.mobileHintDesc}>{modules[active]?.desc}</div>
            </div>

            <button type="button" className={styles.arrowBtn} onClick={next} aria-label="Module suivant">
              →
            </button>
          </div>
        </div>

        <div className={styles.footerHint}>
          Swipe / flèches : rotation par pas • Profondeur : avant/arrière via scale + opacité
        </div>
      </section>
    </main>
  );
}
