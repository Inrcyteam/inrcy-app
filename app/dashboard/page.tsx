"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./dashboard.module.css";

type ModuleItem = {
  key: string;
  label: string;
  icon: string;
  desc?: string;
  colorA: string;
  colorB: string;
};

function wrapIndex(i: number, len: number) {
  return (i % len + len) % len;
}

function shortestDelta(i: number, active: number, len: number) {
  let d = i - active;
  const half = Math.floor(len / 2);
  if (d > half) d -= len;
  if (d < -half) d += len;
  return d;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function DashboardPage() {
  const modules: ModuleItem[] = useMemo(
    () => [
      { key: "mail", label: "Mails", icon: "✉️", desc: "Relances", colorA: "rgba(0,180,255,1)", colorB: "rgba(120,90,255,1)" },
      { key: "facebook", label: "Facebook", icon: "📘", desc: "Pages & ads", colorA: "rgba(59,130,246,1)", colorB: "rgba(0,180,255,1)" },
      { key: "site", label: "Site iNrCy", icon: "🧩", desc: "Pages + tracking", colorA: "rgba(168,85,247,1)", colorB: "rgba(255,55,140,1)" },
      { key: "publier", label: "Publier", icon: "🛰️", desc: "Posts", colorA: "rgba(6,182,212,1)", colorB: "rgba(0,180,255,1)" },
      { key: "houzz", label: "Houzz", icon: "🏠", desc: "Profil", colorA: "rgba(16,185,129,1)", colorB: "rgba(0,180,255,1)" },
      { key: "gmb", label: "GMB", icon: "📍", desc: "Business", colorA: "rgba(34,197,94,1)", colorB: "rgba(250,204,21,1)" },
      { key: "stats", label: "Stats", icon: "📈", desc: "KPI", colorA: "rgba(255,55,140,1)", colorB: "rgba(255,140,0,1)" },
      { key: "crm", label: "CRM", icon: "🧠", desc: "Pipeline", colorA: "rgba(14,165,233,1)", colorB: "rgba(168,85,247,1)" },
      { key: "tracking", label: "Tracking", icon: "📞", desc: "Numéros", colorA: "rgba(255,140,0,1)", colorB: "rgba(0,180,255,1)" },
      { key: "devis", label: "Devis", icon: "🧾", desc: "PDF", colorA: "rgba(120,90,255,1)", colorB: "rgba(0,180,255,1)" },
      { key: "factures", label: "Factures", icon: "🧮", desc: "Paiements", colorA: "rgba(250,204,21,1)", colorB: "rgba(255,55,140,1)" },
      { key: "settings", label: "Réglages", icon: "⚙️", desc: "Compte", colorA: "rgba(148,163,184,1)", colorB: "rgba(120,90,255,1)" },
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

  // Positionnement en cercle (statique, sans anim auto)
  const N = modules.length;
  const step = (Math.PI * 2) / N;

  // ✅ module actif en bas (devant)
  const frontAngle = Math.PI / 2;

  // ✅ rayon ajusté pour que la bulle du bas arrive AU-DESSUS de la barre de nav
  // (desktop plus grand, mobile plus petit)
  const radius = isMobile ? 155 : 230;

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
        >
          {/* anneaux visuels */}
          <div className={styles.rings} aria-hidden="true">
            <div className={styles.ring} />
            <div className={styles.ring2} />
            <div className={styles.ring3} />
          </div>

          {/* noyau */}
          <div className={styles.core}>
            <div className={styles.coreBadge}>⚙️ Générateur</div>
            <div className={styles.coreTitle}>iNrCy</div>
            <div className={styles.coreSub}>Machine à leads • Automatisation • Tracking</div>
          </div>

          {/* modules autour */}
          <div className={styles.orbitLayer} aria-label="Modules autour du générateur">
            {modules.map((m, i) => {
              const d = shortestDelta(i, active, N);
              const angle = frontAngle + d * step;

              // cercle
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;

              // profondeur douce : lisible derrière
              const depth = 1 - Math.abs(d) * 0.08;
              const scale = clamp(0.88 + depth * 0.26, 0.82, 1.10);
              const opacity = clamp(0.72 + depth * 0.32, 0.72, 1);

              const zIndex = 200 - Math.abs(d) * 10;
              const isActive = i === active;

              return (
                <button
                  key={m.key}
                  type="button"
                  className={`${styles.moduleBubble} ${isActive ? styles.moduleActive : styles.moduleInactive}`}
                  style={
                    {
                      transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                      opacity,
                      zIndex,
                      ["--cA" as any]: m.colorA,
                      ["--cB" as any]: m.colorB,
                    } as React.CSSProperties
                  }
                  onClick={() => setActive(i)}
                  aria-label={m.label}
                  title={m.label}
                >
                  <span className={styles.bubbleIcon} aria-hidden="true">
                    {m.icon}
                  </span>
                  <span className={styles.bubbleLabel}>{m.label}</span>
                  {m.desc ? <span className={styles.bubbleDesc}>{m.desc}</span> : null}

                  {/* traînée */}
                  <span className={styles.trail} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {/* barre navigation */}
          <div className={styles.controls}>
            <button className={styles.arrowBtn} type="button" onClick={prev} aria-label="Module précédent">
              ←
            </button>

            <div className={styles.selectedCard} aria-live="polite">
              <div className={styles.selectedTitle}>
                {modules[active].icon} {modules[active].label}
              </div>
              <div className={styles.selectedDesc}>{modules[active].desc ?? "Module"}</div>
            </div>

            <button className={styles.arrowBtn} type="button" onClick={next} aria-label="Module suivant">
              →
            </button>
          </div>
        </div>

        <div className={styles.footerHint}>
          PC : flèches ou clic • Mobile : swipe ou flèches — le module sélectionné passe devant
        </div>
      </section>
    </main>
  );
}
