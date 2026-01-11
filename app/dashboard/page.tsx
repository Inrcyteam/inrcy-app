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
  href?: string; // plus tard
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function wrapIndex(i: number, len: number) {
  return (i % len + len) % len;
}

function shortestDelta(i: number, active: number, len: number) {
  // delta dans [-len/2, len/2] (chemin le plus court)
  let d = i - active;
  const half = Math.floor(len / 2);
  if (d > half) d -= len;
  if (d < -half) d += len;
  return d;
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

  function openModule(m: ModuleItem) {
    // plus tard : router.push(m.href)
    if (isMobile) {
      const idx = modules.findIndex((x) => x.key === m.key);
      if (idx >= 0) setActive(idx);
      return;
    }
    // eslint-disable-next-line no-alert
    alert(`Module: ${m.label}\n(Bientôt relié)`);
  }

  // 4 orbites fixes
  const radii = ["210px", "255px", "300px", "345px"];
  const speeds = ["18s", "22s", "26s", "30s"];

  return (
    <main className={styles.page}>
      {/* Top bar */}
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
          {/* Orbital rings */}
          <div className={styles.rings} aria-hidden="true">
            <div className={styles.ring} />
            <div className={styles.ring2} />
            <div className={styles.ring3} />
          </div>

          {/* Core */}
          <div className={styles.core}>
            <div className={styles.coreBadge}>⚙️ Générateur</div>
            <div className={styles.coreTitle}>iNrCy</div>
            <div className={styles.coreSub}>Machine à leads • Automatisation • Tracking</div>
          </div>

          {/* Desktop orbit — 4 orbites / 3 bulles chacune */}
          {!isMobile && (
            <div className={styles.orbitLayer} aria-label="Modules">
              {modules.map((m, i) => {
                // 0..3 = orbite, 0..2 = position (3 bulles par orbite)
                const ring = i % 4;
                const pos = Math.floor(i / 4); // 0,1,2
                const phase = `${pos * 120}deg`;

                return (
                  <button
                    key={m.key}
                    type="button"
                    className={`${styles.electron} ${styles.orbit}`}
                    style={
                      {
                        ["--phase" as any]: phase,
                        ["--r" as any]: radii[ring],
                        ["--speed" as any]: speeds[ring],
                        ["--cA" as any]: m.colorA,
                        ["--cB" as any]: m.colorB,
                      } as React.CSSProperties
                    }
                    onClick={() => openModule(m)}
                    title={`${m.label} — ${m.desc}`}
                    aria-label={`${m.label} — ${m.desc}`}
                  >
                    <span className={styles.bubbleIcon} aria-hidden="true">
                      {m.icon}
                    </span>
                    <span className={styles.bubbleLabel}>{m.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Mobile “orbital carousel” (swipe) — version bulles aussi */}
          {isMobile && (
            <>
              <div className={styles.mobileOrbit} aria-label="Modules (swipe)">
                {modules.map((m, i) => {
                  const d = shortestDelta(i, active, modules.length);
                  const step = 0.55; // rad
                  const angle = d * step;

                  const R = 145; // rayon
                  const x = Math.sin(angle) * R;
                  const y = -Math.cos(angle) * (R * 0.55) + 28; // perspective

                  const depth = 1 - Math.abs(d) * 0.12;
                  const scale = clamp(0.66 + depth * 0.40, 0.62, 1.08);
                  const opacity = clamp(0.22 + depth * 0.85, 0.18, 1);
                  const blur = clamp((1 - depth) * 3.2, 0, 3.2);
                  const zIndex = 200 - Math.abs(d) * 10;

                  const isActive = i === active;

                  return (
                    <button
                      key={m.key}
                      type="button"
                      className={`${styles.electron} ${styles.mobileElectron} ${isActive ? styles.activeElectron : ""}`}
                      style={
                        {
                          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                          opacity,
                          filter: `blur(${blur}px)`,
                          zIndex,
                          ["--cA" as any]: m.colorA,
                          ["--cB" as any]: m.colorB,
                        } as React.CSSProperties
                      }
                      onClick={() => openModule(m)}
                      aria-label={`${m.label} — ${m.desc}`}
                      title={`${m.label} — ${m.desc}`}
                    >
                      <span className={styles.bubbleIcon} aria-hidden="true">
                        {m.icon}
                      </span>
                      <span className={styles.bubbleLabel}>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.mobileControls}>
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
            </>
          )}
        </div>

        <div className={styles.footerHint}>
          Desktop : 4 orbites • 3 bulles/orbite (0°/120°/240°) • Mobile : swipe / flèches pour focus
        </div>
      </section>
    </main>
  );
}
