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

    // swipe horizontal dominant
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      lastSwipeAt.current = now;
      if (dx < 0) next();
      else prev();
    }
  }

  function openModule(i: number) {
    // Plus tard : router.push(modules[i].href)
    setActive(i);
  }

  /**
   * 4 orbites / 3 modules par orbite (12 total)
   * i -> ring: i%4, pos: floor(i/4) => 0..2
   * phase: 0 / 120 / 240
   */
  const ring = (i: number) => i % 4;
  const pos = (i: number) => Math.floor(i / 4);
  const basePhaseDeg = (i: number) => pos(i) * 120;

  // Orbites desktop
  const radiiDesktop = ["210px", "255px", "300px", "345px"];
  const speedsDesktop = ["18s", "22s", "26s", "30s"];

  // Orbites mobile (un peu plus petites, mieux cadrées autour du core)
  const radiiMobile = ["140px", "175px", "210px", "245px"];
  const speedsMobile = ["16s", "20s", "24s", "28s"];

  /**
   * MOBILE: on fait tourner TOUT l'atome pour amener le module actif en bas (devant)
   * Angle cible bas = 90deg (car rotate(90deg) + translateX = vers le bas)
   */
  const activePhase = basePhaseDeg(active);
  const atomRot = 90 - activePhase; // deg

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
          style={
            {
              // uniquement utile en mobile
              ["--atomRot" as any]: toDeg(atomRot),
            } as React.CSSProperties
          }
        >
          {/* Rings */}
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

          {/* ORBITES (desktop + mobile) : même logique, mais tailles/effets différents */}
          <div className={styles.orbitLayer} aria-label="Modules">
            {modules.map((m, i) => {
              const isA = i === active;

              const phase = toDeg(basePhaseDeg(i));
              const r = isMobile ? radiiMobile[ring(i)] : radiiDesktop[ring(i)];
              const speed = isMobile ? speedsMobile[ring(i)] : speedsDesktop[ring(i)];

              return (
                <button
                  key={m.key}
                  type="button"
                  className={[
                    styles.electron,
                    styles.orbit,
                    isMobile ? styles.electronMobile : styles.electronDesktop,
                    isMobile && isA ? styles.activeElectron : "",
                    isMobile && !isA ? styles.inactiveElectron : "",
                  ].join(" ")}
                  style={
                    {
                      // orbit params
                      ["--phase" as any]: phase,
                      ["--r" as any]: r,
                      ["--speed" as any]: speed,

                      // colors
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

                  {/* Sur mobile on laisse une micro-desc lisible */}
                  <span className={styles.bubbleDesc}>{m.desc}</span>
                </button>
              );
            })}
          </div>

          {/* MOBILE controls */}
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
          Desktop : 4 orbites • 3 bulles/orbite • Mobile : swipe / flèches (rotation de l’atome)
        </div>
      </section>
    </main>
  );
}
