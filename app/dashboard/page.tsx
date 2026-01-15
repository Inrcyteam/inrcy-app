"use client";

import styles from "./dashboard.module.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ✅ IMPORTANT : même client que ta page login
import { createClient } from "@/lib/supabaseClient";

type ModuleStatus = "connected" | "available" | "coming";
type Accent = "cyan" | "purple" | "pink" | "orange";

type ModuleAction = {
  key: string;
  label: string;
  variant: "view" | "connect" | "danger";
  href?: string; // si action "voir"
  onClick?: () => void; // si action "connecter" (plus tard)
  disabled?: boolean;
};

type Module = {
  key: string;
  name: string;
  description: string;
  status: ModuleStatus;
  accent: Accent;
  actions: ModuleAction[];
};

function statusLabel(s: ModuleStatus) {
  if (s === "connected") return "Connecté";
  if (s === "available") return "À connecter";
  return "Bientôt";
}

function statusClass(s: ModuleStatus) {
  if (s === "connected") return styles.badgeOk;
  if (s === "available") return styles.badgeWarn;
  return styles.badgeSoon;
}

const MODULE_ICONS: Record<string, { src: string; alt: string }> = {
  site_inrcy: { src: "/icons/inrcy.png", alt: "iNrCy" },
  site_web: { src: "/icons/site-web.jpg", alt: "Site web" },
  facebook: { src: "/icons/facebook.png", alt: "Facebook" },
  gmb: { src: "/icons/google.jpg", alt: "Google Business" },
  houzz: { src: "/icons/houzz.png", alt: "Houzz" },
  pages_jaunes: { src: "/icons/pagesjaunes.png", alt: "Pages Jaunes" },
};

// ✅ Tes 6 blocs avec tes actions (Voir + Connecter…)
const fluxModules: Module[] = [
  {
    key: "site_inrcy",
    name: "Site iNrCy",
    description: "Votre machine à leads ⚡",
    status: "available",
    accent: "purple",
    actions: [
      { key: "view", label: "Voir le site", variant: "view", href: "#" },
      { key: "ga4", label: "Connecter Analytics", variant: "connect", onClick: () => {} },
      { key: "gsc", label: "Connecter Search Console", variant: "connect", onClick: () => {} },
    ],
  },
  {
    key: "site_web",
    name: "Site web",
    description: "Convertit vos visiteurs 💡",
    status: "available",
    accent: "pink",
    actions: [
      { key: "view", label: "Voir le site", variant: "view", href: "#" },
      { key: "ga4", label: "Connecter Analytics", variant: "connect", onClick: () => {} },
      { key: "gsc", label: "Connecter Search Console", variant: "connect", onClick: () => {} },
    ],
  },
    {
    key: "gmb",
    name: "Google Business",
    description: "Augmente les appels 📞",
    status: "available",
    accent: "orange",
    actions: [
      { key: "view", label: "Voir la page", variant: "view", href: "#" },
      { key: "connect", label: "Connecter Google", variant: "connect", onClick: () => {} },
    ],
  },
 {
    key: "facebook",
    name: "Facebook",
    description: "Crée de la demande 📈",
    status: "available",
    accent: "cyan",
    actions: [
      { key: "view", label: "Voir le compte", variant: "view", href: "#" },
      { key: "connect", label: "Connecter Facebook", variant: "connect", onClick: () => {} },
    ],
  },
  {
    key: "houzz",
    name: "Houzz",
    description: "Livre des projets premium 🔥",
    status: "available",
    accent: "pink",
    actions: [{ key: "view", label: "Voir la page", variant: "view", href: "#" }],
  },
  {
    key: "pages_jaunes",
    name: "Pages Jaunes",
    description: "Capte la recherche locale 📍",
    status: "available",
    accent: "orange",
    actions: [{ key: "view", label: "Voir la page", variant: "view", href: "#" }],
  },
];

const adminModules: Array<{
  key: string;
  name: string;
  description: string;
  status: ModuleStatus;
  accent: Accent;
}> = [
  { key: "mails", name: "Mails", description: "Relances, notifications, nurturing.", status: "available", accent: "purple" },
  { key: "stats", name: "Stats", description: "ROI, performance et suivi des canaux.", status: "available", accent: "cyan" },
  { key: "agenda", name: "Agenda", description: "Rdv, réunion et échéances", status: "available", accent: "purple" },
  { key: "crm", name: "CRM", description: "Fichier clients et propects", status: "available", accent: "cyan" },
];

const quickActions: Array<{ key: string; title: string; sub: string; disabled?: boolean; accent: Accent }> = [
  { key: "facturer", title: "Facturer", sub: "Factures & paiements", disabled: true, accent: "orange" },
  { key: "devis", title: "Faire devis", sub: "Devis en 30 sec", disabled: true, accent: "pink" },
  { key: "publier", title: "Publier", sub: "Posts & contenus", disabled: true, accent: "purple" },
  { key: "newsletter", title: "Communiquer", sub: "Newsletter & promos", disabled: true, accent: "cyan" },
];

export default function DashboardPage() {
  const router = useRouter();

  // ✅ Déconnexion Supabase + retour /login
  const handleLogout = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Erreur déconnexion:", error.message);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  // ✅ Menu utilisateur (desktop)
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

useEffect(() => {
  const isTouch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  document.documentElement.classList.toggle("isTouch", isTouch);
}, []);

  // Ferme le menu utilisateur (clic dehors / Escape)
  useEffect(() => {
    if (!userMenuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!userMenuRef.current) return;
      const target = e.target as Node;
      if (!userMenuRef.current.contains(target)) setUserMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("touchstart", onPointerDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("touchstart", onPointerDown);
    };
  }, [userMenuOpen]);

  const userFirstLetter = (userEmail?.trim()?.[0] ?? "U").toUpperCase();

  // ✅ Menu hamburger (mobile)
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!menuRef.current) return;
      const target = e.target as Node;
      if (!menuRef.current.contains(target)) setMenuOpen(false);
    };

    if (menuOpen) {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("mousedown", onPointerDown);
      window.addEventListener("touchstart", onPointerDown);
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuOpen]);

  // (démo) valeurs neutres tant que rien n'est connecté
  const leadsToday = 0;
  const leadsWeek = 0;
  const leadsMonth = 0;

  const avgBasket = 0;
  const estimatedValue = avgBasket > 0 ? avgBasket * leadsMonth : 0;

  // helper render action
  const renderAction = (a: ModuleAction) => {
    const className =
      a.variant === "connect"
        ? `${styles.actionBtn} ${styles.connectBtn}`
        : a.variant === "danger"
        ? `${styles.actionBtn} ${styles.actionDanger}`
        : `${styles.actionBtn} ${styles.actionView}`;

    if (a.href) {
      // Pour l’instant href="#" (tu remplaceras par les vraies URLs)
      return (
        <Link
          key={a.key}
          href={a.href}
          className={className}
          target={a.href.startsWith("http") ? "_blank" : undefined}
          rel={a.href.startsWith("http") ? "noreferrer" : undefined}
        >
          {a.label}
        </Link>
      );
    }

    return (
      <button key={a.key} type="button" className={className} onClick={a.onClick} disabled={a.disabled}>
        {a.label}
      </button>
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img className={styles.logoImg} src="/logo-inrcy.png" alt="iNrCy" />
          <div className={styles.brandText}>
            <div className={styles.brandTag}>Générateur de contacts — Hub connecté</div>
          </div>
        </div>

        {/* Desktop actions */}
        <div className={styles.topbarActions}>
          <button className={styles.ghostBtn} type="button">
            Centre d’aide
          </button>

          {/* ✅ Menu utilisateur (remplace OUT) */}
          <div className={styles.userMenuWrap} ref={userMenuRef}>
            <button
              className={styles.userBubbleBtn}
              type="button"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
              title={userEmail ?? "Utilisateur"}
            >
              <span className={styles.userBubble} aria-hidden>
                {userFirstLetter}
              </span>
            </button>

            {userMenuOpen && (
              <div className={styles.userMenuPanel} role="menu" aria-label="Menu utilisateur">
                <Link
                  className={styles.userMenuItem}
                  href="/dashboard/profil"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Mon profil
                </Link>

                <Link
                  className={styles.userMenuItem}
                  href="/dashboard/abonnement"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Mon abonnement
                </Link>

                <div className={styles.userMenuDivider} />

                <button
                  className={`${styles.userMenuItem} ${styles.userMenuDanger}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    handleLogout();
                  }}
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile hamburger */}
        <div className={styles.mobileMenuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.hamburgerBtn}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.hamburgerIcon} aria-hidden />
          </button>

          {menuOpen && (
            <div className={styles.mobileMenuPanel} role="menu" aria-label="Menu">
              <button className={styles.mobileMenuItem} type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
                Centre d’aide
              </button>

              <Link className={styles.mobileMenuItem} href="/dashboard/profil" role="menuitem" onClick={() => setMenuOpen(false)}>
                Mon profil
              </Link>

              <Link className={styles.mobileMenuItem} href="/dashboard/abonnement" role="menuitem" onClick={() => setMenuOpen(false)}>
                Mon abonnement
              </Link>

              <div className={styles.mobileMenuDivider} />

              <button
                className={`${styles.mobileMenuItem} ${styles.mobileMenuDanger}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.kicker}>
            <span className={styles.kickerDot} aria-hidden />
            Votre cockpit iNrCy
          </div>

          <h1 className={styles.title}>
            <span className={styles.titleAccent}>Le Générateur est lancé&nbsp;!</span>
          </h1>

          <p className={styles.subtitle}>
            Tous vos canaux alimentent maintenant une seule et même machine.
            <br />
            <span className={styles.signatureFlow}>
              <span>Contacts</span>
              <span className={styles.flowArrow}>→</span>
              <span>Devis</span>
              <span className={styles.flowArrow}>→</span>
              <span>Chiffre d'affaires</span>
            </span>
          </p>

          <div className={styles.pills}>
            <span className={styles.pill}>
              <span className={styles.pillDot} aria-hidden />
              Flux de contacts • Tableau de bord • Boîte de vitesse
            </span>
            <span className={styles.pillMuted}>Centralisé • Rentable • Automatisé</span>
          </div>
        </div>

        <div className={styles.generatorCard}>
          <div className={styles.generatorFX} aria-hidden />
          <div className={styles.generatorFX2} aria-hidden />
          <div className={styles.generatorFX3} aria-hidden />

          <div className={styles.generatorHeader}>
            <div>
              <div className={styles.generatorTitle}>Générateur iNrCy</div>
              <div className={styles.generatorDesc}>Production de prospects et de clients dès qu’un module est connecté</div>
            </div>

            <div className={styles.generatorHeaderRight}>
              <div className={`${styles.generatorStatus} ${leadsMonth > 0 ? styles.statusLive : styles.statusSetup}`}>
                <span className={leadsMonth > 0 ? styles.liveDot : styles.setupDot} aria-hidden />
                {leadsMonth > 0 ? "Actif" : "En attente"}
              </div>
            </div>
          </div>

          <div className={styles.generatorGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Leads aujourd’hui</div>
              <div className={styles.metricValue}>{leadsToday}</div>
              <div className={styles.metricHint}>Opportunités en temps réel</div>
            </div>

            <div className={styles.generatorCoreCenter} aria-hidden>
              <div className={styles.miniCoreRing} />
              <div className={styles.miniCoreRotor} />
              <div className={styles.miniCoreGlass} />
              <div className={styles.miniCoreGlow} />
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Cette semaine</div>
              <div className={styles.metricValue}>{leadsWeek}</div>
              <div className={styles.metricHint}>Demandes captées</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Ce mois</div>
              <div className={styles.metricValue}>{leadsMonth}</div>
              <div className={styles.metricHint}>Contacts de CA potentiel</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>CHIFFRE D'AFFAIRES GÉNÉRÉ</div>
              <div className={styles.metricValue}>{estimatedValue > 0 ? `${estimatedValue.toLocaleString("fr-FR")} €` : "0 €"}</div>
              <div className={styles.metricHint}>Montant basé sur votre profil</div>
            </div>
          </div>

          <div className={styles.generatorFooter}>
            {/* ✅ On enlève le bouton "Connecter un outil" si tu veux éviter "connecter un module" partout */}
            {/* <button className={`${styles.primaryBtn} ${styles.connectBtn}`} type="button">
              Connecter un outil
            </button> */}
          </div>

          <div className={styles.generatorGlow} aria-hidden />
        </div>
      </section>

      <section className={styles.contentFull}>
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Flux de contacts</h2>
          <p className={styles.h2Sub}>Votre autoroute de demandes entrantes</p>
        </div>

        {/* ✅ 6 bulles homogènes (uniquement cette section modifiée) */}
        <div className={styles.moduleGrid}>
          {fluxModules.map((m) => {
            const viewAction = m.actions.find((a) => a.variant === "view");

            return (
              <article
                key={m.key}
                className={`${styles.moduleCard} ${styles.moduleBubbleCard} ${styles[`accent_${m.accent}`]}`}
              >
                <div className={styles.bubbleStack}>
                  <div className={styles.bubbleLogo} aria-hidden>
 <img
    className={styles.bubbleLogoImg}
    src={MODULE_ICONS[m.key]?.src}
    alt={MODULE_ICONS[m.key]?.alt}
  />
</div>

                  <div className={styles.bubbleTitle}>{m.name}</div>

                  <div className={styles.bubbleStatusCompact}>
                    <span
                      className={[
                        styles.statusDot,
                        m.status === "connected"
                          ? styles.dotConnected
                          : m.status === "available"
                          ? styles.dotAvailable
                          : styles.dotComing,
                      ].join(" ")}
                      aria-hidden
                    />
                    <span className={styles.bubbleStatusText}>{statusLabel(m.status)}</span>
                  </div>

                  <div className={styles.bubbleTagline}>{m.description}</div>

                  <div className={styles.bubbleActions}>
                    {viewAction ? (
                      renderAction(viewAction)
                    ) : (
                      <button className={`${styles.actionBtn} ${styles.actionView}`} type="button">
                        Voir
                      </button>
                    )}

                    <button className={`${styles.actionBtn} ${styles.connectBtn} ${styles.actionMain}`} type="button">
                      Configurer
                    </button>
                  </div>
                </div>

                {/* On garde le glow existant si tu veux, mais on pourra le couper en CSS pour les bulles */}
                <div className={styles.moduleGlow} aria-hidden />
              </article>
            );
          })}
        </div>

        <div className={styles.lowerRow}>
          <div className={styles.blockCard}>
            <div className={styles.blockHead}>
              <h3 className={styles.h3}>Tableau de bord</h3>
              <span className={styles.smallMuted}>Pilotage</span>
            </div>

            <div className={styles.loopWrap}>
 <svg className={styles.loopWheel} viewBox="0 0 300 300" aria-hidden="true">
  <defs>
    {/* Glow + traits premium */}
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.4" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    {/* Dégradés de jante */}
    <radialGradient id="rimGrad" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
      <stop offset="55%" stopColor="rgba(255,255,255,0.10)" />
      <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
    </radialGradient>

    <radialGradient id="rimInner" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stopColor="rgba(56,189,248,0.18)" />
      <stop offset="70%" stopColor="rgba(255,255,255,0.06)" />
      <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
    </radialGradient>

    {/* Flèche chevron */}
    <marker id="chev" markerWidth="10" markerHeight="10" refX="6.5" refY="5" orient="auto">
      <path
        d="M1,1 L7,5 L1,9"
        fill="none"
        stroke="rgba(255,255,255,0.70)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </marker>
  </defs>

  {/* JANTE (double cercle) */}
  <circle cx="150" cy="150" r="92" fill="none" stroke="url(#rimGrad)" strokeWidth="10" filter="url(#softGlow)" />
  <circle cx="150" cy="150" r="84" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />

  {/* Halo intérieur (donne l'effet "objet") */}
  <circle cx="150" cy="150" r="70" fill="none" stroke="url(#rimInner)" strokeWidth="18" opacity="0.55" />

  {/* BRANCHES (bras du volant) */}
  <g filter="url(#softGlow)">
    <path
      d="M150 150 L150 78"
      stroke="rgba(255,255,255,0.18)"
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M150 150 L222 150"
      stroke="rgba(255,255,255,0.18)"
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M150 150 L150 222"
      stroke="rgba(255,255,255,0.18)"
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M150 150 L78 150"
      stroke="rgba(255,255,255,0.18)"
      strokeWidth="6"
      strokeLinecap="round"
    />
  </g>

  {/* Traits fins par-dessus (netteté) */}
  <g>
    <path d="M150 150 L150 78" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M150 150 L222 150" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M150 150 L150 222" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M150 150 L78 150" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
  </g>

    {/* Moyeu (hub) */}
  <g filter="url(#softGlow)">
    <circle cx="150" cy="150" r="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
    <circle cx="150" cy="150" r="8" fill="rgba(56,189,248,0.20)" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
  </g>
</svg>

  <div className={styles.loopGrid}>
    <div className={`${styles.loopNode} ${styles.loopTop} ${styles.loop_cyan}`}>
<span className={`${styles.loopBadge} ${styles.badgeCyan}`}></span>

      <div className={styles.loopTopRow}>
        <div className={styles.loopTitle}>STATS</div>
      </div>
      <div className={styles.loopSub}>Tous vos leads, enfin visibles</div>
      <div className={styles.loopActions}>
        <button className={`${styles.actionBtn} ${styles.connectBtn}`} type="button">
          Voir les stats
        </button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopRight} ${styles.loop_purple}`}>
<span className={`${styles.loopBadge} ${styles.badgePurple}`}></span>

     <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>MAILS</div>
</div>

<button className={styles.loopGearBtn} type="button" aria-label="Réglages Mails" title="Réglages">
  <svg className={styles.loopGearSvg} viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
  <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6H10l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
</svg>
</button>

      <div className={styles.loopSub}>Toutes vos demandes arrivent ici</div>
      <div className={styles.loopActions}>
        <button className={`${styles.actionBtn} ${styles.connectBtn}`} type="button">
          Ouvrir l’iNr'Box
        </button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopBottom} ${styles.loop_orange}`}>
<span className={`${styles.loopBadge} ${styles.badgeOrange}`}></span>

      <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>AGENDA</div>
</div>

<button className={styles.loopGearBtn} type="button" aria-label="Réglages Agenda" title="Réglages">
  <svg className={styles.loopGearSvg} viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
  <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6H10l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
</svg>
</button>

      <div className={styles.loopSub}>Transformez les contacts en RDV</div>
      <div className={styles.loopActions}>
        <button className={`${styles.actionBtn} ${styles.connectBtn}`} type="button">
          Voir l’agenda
        </button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopLeft} ${styles.loop_pink}`}>
<span className={`${styles.loopBadge} ${styles.badgePink}`}></span>

      <div className={styles.loopTopRow}>
        <div className={styles.loopTitle}>CRM</div>
      </div>
      <div className={styles.loopSub}>Vos prospects et clients centralisés</div>
      <div className={styles.loopActions}>
        <button className={`${styles.actionBtn} ${styles.connectBtn}`} type="button">
          Ouvrir le CRM
        </button>
      </div>
    </div>

    <div className={styles.signalHub} aria-hidden="true">
      <span className={styles.signalCore} />
      <span className={`${styles.signalWave} ${styles.wave1}`} />
      <span className={`${styles.signalWave} ${styles.wave2}`} />
      <span className={`${styles.signalWave} ${styles.wave3}`} />
      <span className={`${styles.signalWave} ${styles.wave4}`} />
    </div>
  </div>
</div>

          </div>

          <div className={styles.blockCard}>
            <div className={styles.blockHead}>
              <h3 className={styles.h3}>Boîte de vitesse</h3>
              <span className={styles.smallMuted}>Conversion</span>
            </div>

            <div className={styles.gearWrap}>
  <div className={styles.gearRail} aria-hidden />

  <div className={styles.gearGrid}>
    {/* Publier */}
    <button className={`${styles.gearCapsule} ${styles.gear_cyan}`} type="button">
      <div className={styles.gearInner}>
        <div className={styles.gearTitle}>Publier</div>
        <div className={styles.gearSub}>Active tous vos canaux</div>
        <div className={styles.gearBtn}>Publier maintenant</div>
      </div>
    </button>

    {/* Devis */}
    <button className={`${styles.gearCapsule} ${styles.gear_purple}`} type="button">
      <div className={styles.gearInner}>
        <div className={styles.gearTitle}>Devis</div>
        <div className={styles.gearSub}>Déclenche des opportunités</div>
        <div className={styles.gearBtn}>Créer un devis</div>
      </div>
    </button>

    {/* Facturer */}
    <button className={`${styles.gearCapsule} ${styles.gear_pink}`} type="button">
      <div className={styles.gearInner}>
        <div className={styles.gearTitle}>Facturer</div>
        <div className={styles.gearSub}>Transforme en CA</div>
        <div className={styles.gearBtn}>Créer une facture</div>
      </div>
    </button>

    {/* Fidéliser */}
    <button className={`${styles.gearCapsule} ${styles.gear_orange}`} type="button">
      <div className={styles.gearInner}>
        <div className={styles.gearTitle}>Fidéliser</div>
        <div className={styles.gearSub}>Pérennise votre activité</div>
        <div className={styles.gearBtn}>Communiquer</div>
      </div>
    </button>
  </div>
</div>

          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© {new Date().getFullYear()} iNrCy</div>
        <div className={styles.footerRight}>
          <span className={styles.smallMuted}>Prochaine étape :</span> connecter les modules, puis activer devis/factures.
        </div>
      </footer>
    </main>
  );
}
