"use client";

import styles from "./dashboard.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import SettingsDrawer from "./SettingsDrawer";
import ProfilContent from "./settings/_components/ProfilContent";
import AbonnementContent from "./settings/_components/AbonnementContent";
import ContactContent from "./settings/_components/ContactContent";
import MailsSettingsContent from "./settings/_components/MailsSettingsContent";


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
  { key: "facturer", title: "Facturer", sub: "Factures & paiements", disabled: false, accent: "orange" },
  { key: "devis", title: "Faire devis", sub: "Devis en 30 sec", disabled: false, accent: "pink" },
  { key: "publier", title: "Publier", sub: "Posts & contenus", disabled: true, accent: "purple" },
  { key: "newsletter", title: "Communiquer", sub: "Newsletter & promos", disabled: true, accent: "cyan" },
];

export default function DashboardClient() {
  const router = useRouter();

  const searchParams = useSearchParams();
  const panel = searchParams.get("panel"); // "contact" | "profil" | "abonnement" | "mails" | null

   const openPanel = (name: "contact" | "profil" | "abonnement" | "mails") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", name);
    router.push(`/dashboard?${params.toString()}`);
  };

  const closePanel = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("panel");
    const qs = params.toString();
    router.push(qs ? `/dashboard?${qs}` : "/dashboard");
  };

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

  // ✅ AJOUT : profil incomplet -> mini pastille + tooltip
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  const REQUIRED_PROFILE_FIELDS = [
    "first_name",
    "last_name",
    "phone",
    "contact_email",
    "company_legal_name",
    "hq_address",
    "hq_zip",
    "hq_city",
    "hq_country",
    "siren",
    "rcs_city",
  ] as const;

  const checkProfile = useCallback(async () => {
    const supabase = createClient();

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "first_name,last_name,phone,contact_email,company_legal_name,hq_address,hq_zip,hq_city,hq_country,siren,rcs_city"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      setProfileIncomplete(true);
      return;
    }

    const incomplete = REQUIRED_PROFILE_FIELDS.some((field) => {
      const v = (profile as any)[field];
      return !v || String(v).trim() === "";
    });

    setProfileIncomplete(incomplete);
  }, []);

  useEffect(() => {
    checkProfile();
  }, [checkProfile]);

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

    const closeIfOutside = (target: EventTarget | null) => {
      if (!userMenuRef.current) return;
      if (!target) return;
      if (!userMenuRef.current.contains(target as Node)) setUserMenuOpen(false);
    };

    const onPointerDownMouse = (e: MouseEvent) => closeIfOutside(e.target);
    const onPointerDownTouch = (e: TouchEvent) => closeIfOutside(e.target);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDownMouse);
    window.addEventListener("touchstart", onPointerDownTouch, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
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
    const closeIfOutside = (target: EventTarget | null) => {
      if (!menuRef.current) return;
      if (!target) return;
      if (!menuRef.current.contains(target as Node)) setMenuOpen(false);
    };

    const onPointerDownMouse = (e: MouseEvent) => closeIfOutside(e.target);
    const onPointerDownTouch = (e: TouchEvent) => closeIfOutside(e.target);

    if (menuOpen) {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("mousedown", onPointerDownMouse);
      window.addEventListener("touchstart", onPointerDownTouch, { passive: true });
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
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
      // Pour l’instant href="#" (tu replaceras par les vraies URLs)
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

  // =========================
  // Mobile-only: list vs carousel for the 6 bubbles (Canaux)
  // =========================
  type BubbleViewMode = "list" | "carousel";
  const [bubbleView, setBubbleView] = useState<BubbleViewMode>("list");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 560px)");
    const update = () => setIsMobile(mq.matches);
    update();

    // Safari fallback for older addListener/removeListener
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  // Load saved preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("inrcy_bubble_view");
    if (saved === "list" || saved === "carousel") setBubbleView(saved);
  }, []);

  // Force desktop to list + persist mobile preference
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isMobile) {
      setBubbleView("list");
      return;
    }
    window.localStorage.setItem("inrcy_bubble_view", bubbleView);
  }, [bubbleView, isMobile]);

  const renderFluxBubble = (m: Module, keyOverride?: string) => {
    const viewAction = m.actions.find((a) => a.variant === "view");

    return (
      <article
        key={keyOverride ?? m.key}
        className={`${styles.moduleCard} ${styles.moduleBubbleCard} ${styles[`accent_${m.accent}`]}`}
      >
        <div className={styles.bubbleStack}>
          <div className={styles.bubbleLogo} aria-hidden>
            <img className={styles.bubbleLogoImg} src={MODULE_ICONS[m.key]?.src} alt={MODULE_ICONS[m.key]?.alt} />
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

        <div className={styles.moduleGlow} aria-hidden />
      </article>
    );
  };

  // Carousel state (infinite loop)
  const baseModules = fluxModules;
  const hasCarousel = baseModules.length > 1;

  // clones: [last, ...real, first]
  const carouselItems = hasCarousel
    ? [baseModules[baseModules.length - 1], ...baseModules, baseModules[0]]
    : baseModules;

  const carouselRef = useRef<HTMLDivElement | null>(null);

  // index in carouselItems (includes clones)
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [carouselTransition, setCarouselTransition] = useState(true);

  // drag (track follows finger)
  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const [dragPx, setDragPx] = useState(0);

  const goPrev = useCallback(() => {
    if (!hasCarousel) return;
    setCarouselIndex((i) => i - 1);
  }, [hasCarousel]);

  const goNext = useCallback(() => {
    if (!hasCarousel) return;
    setCarouselIndex((i) => i + 1);
  }, [hasCarousel]);

  // reset cleanly when switching to carousel (mobile)
  useEffect(() => {
    if (!isMobile) return;
    if (bubbleView !== "carousel") return;

    setCarouselTransition(false);
    setCarouselIndex(1);
    setDragPx(0);

    const id = window.setTimeout(() => setCarouselTransition(true), 0);
    return () => window.clearTimeout(id);
  }, [bubbleView, isMobile]);

  const onCarouselTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!hasCarousel) return;
    touchStartX.current = e.touches[0]?.clientX ?? null;
    isDragging.current = true;

    // during drag: no transition
    setCarouselTransition(false);
    setDragPx(0);
  };

  const onCarouselTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!hasCarousel) return;
    if (!isDragging.current || touchStartX.current == null) return;

    const x = e.touches[0]?.clientX ?? 0;
    setDragPx(x - touchStartX.current);
  };

  const onCarouselTouchEnd = () => {
    if (!hasCarousel) return;

    const dx = dragPx;

    isDragging.current = false;
    touchStartX.current = null;

    const threshold = 60;

    // snap back to slide positions with transition
    setCarouselTransition(true);
    setDragPx(0);

    if (Math.abs(dx) < threshold) return;

    if (dx < 0) goNext();
    else goPrev();
  };

  const onCarouselTransitionEnd = () => {
  if (!hasCarousel) return;
  if (isDragging.current) return;

  const lastReal = baseModules.length;

  // clone -> vrai dernier (boucle arrière)
  if (carouselIndex === 0) {
    setCarouselTransition(false);
    setCarouselIndex(lastReal);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCarouselTransition(true);
      });
    });
    return;
  }

  // clone -> vrai premier (✨ effet fluide, pas de reset visible)
  if (carouselIndex === lastReal + 1) {
    setCarouselTransition(false);
    setCarouselIndex(1);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCarouselTransition(true);
      });
    });
  }
};

  const activeDot = hasCarousel
    ? (((carouselIndex - 1) % baseModules.length) + baseModules.length) % baseModules.length
    : 0;


  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img className={styles.logoImg} src="/logo-inrcy.png" alt="iNrCy" />
          <div className={styles.brandText}>
            <div className={styles.brandTag}>Générateur de contacts</div>
          </div>
        </div>

        {/* Desktop actions */}
        <div className={styles.topbarActions}>
          <button type="button" className={styles.ghostBtn} onClick={() => openPanel("contact")}>
            Nous contacter
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

            {/* ✅ AJOUT : mini pastille + tooltip */}
            {profileIncomplete && (
              <div className={styles.profileIndicatorWrap} style={{ marginLeft: 6 }}>
                <button
                  type="button"
                  className={styles.profileWarnBtn}
                  aria-label="Profil incomplet"
                  onClick={() => openPanel("profil")}
                >
                  <span className={styles.profileWarnDot} aria-hidden />
                </button>

                <div className={styles.profileTooltip} role="tooltip">
                  <div>
                    ⚠️ <strong>Profil incomplet</strong>
                    <br />
                    Complétez votre profil pour activer pleinement iNrCy.
                  </div>

                  <button
                    type="button"
                    className={styles.profileTooltipBtn}
                    onClick={() => openPanel("profil")}
                  >
                    Compléter mon profil
                  </button>
                </div>
              </div>
            )}

            {userMenuOpen && (
              <div className={styles.userMenuPanel} role="menu" aria-label="Menu utilisateur">
                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    openPanel("profil");
                  }}
                >
                  Mon profil
                </button>

                <button
                  type="button"
                  className={styles.userMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    openPanel("abonnement");
                  }}
                >
                  Mon abonnement
                </button>

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

  {profileIncomplete && (
    <span
      className={styles.hamburgerWarnDot}
      aria-hidden
    />
  )}
</button>

          {menuOpen && (
            <div className={styles.mobileMenuPanel} role="menu" aria-label="Menu">

{profileIncomplete && (
  <button
    className={styles.mobileMenuItem}
    type="button"
    role="menuitem"
    onClick={() => {
      setMenuOpen(false);
      openPanel("profil");
    }}
  >
    ⚠️ Profil incomplet — compléter
  </button>
)}
              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("contact");
                }}
              >
                Nous contacter
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("profil");
                }}
              >
                Mon profil
              </button>

              <button
                className={styles.mobileMenuItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openPanel("abonnement");
                }}
              >
                Mon abonnement
              </button>

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
            <span className={styles.pill}>Canaux • Tableau de bord • Boîte de vitesse</span>
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
              <div className={styles.metricLabel}>CA GÉNÉRÉ</div>
              <div className={styles.metricValue}>
                {estimatedValue > 0 ? `${estimatedValue.toLocaleString("fr-FR")} €` : "0 €"}
              </div>
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
          <div className={styles.sectionHeadTop}>
            <h2 className={styles.h2}>Canaux</h2>

            {/* Mobile only: choix Liste / Carrousel */}
            <div className={styles.mobileViewToggle} aria-label="Affichage des canaux">
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${bubbleView === "list" ? styles.viewToggleActive : ""}`}
                onClick={() => setBubbleView("list")}
              >
                Liste
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${bubbleView === "carousel" ? styles.viewToggleActive : ""}`}
                onClick={() => setBubbleView("carousel")}
              >
                Carrousel
              </button>
            </div>
          </div>

          <p className={styles.h2Sub}>Votre autoroute de contacts entrants</p>
        </div>

        {/* ✅ Mobile: carrousel infini / Desktop: liste */}
        {isMobile && bubbleView === "carousel" ? (
          <>
            <div
              className={styles.mobileCarousel}
              ref={carouselRef}
              onTouchStart={onCarouselTouchStart}
              onTouchMove={onCarouselTouchMove}
              onTouchEnd={onCarouselTouchEnd}
            >
              <div
                className={styles.carouselTrack}
                style={{
                  transform: `translateX(calc(-${carouselIndex * 100}% + ${dragPx}px))`,
                  transition: carouselTransition ? "transform 260ms ease" : "none",
                }}
                onTransitionEnd={onCarouselTransitionEnd}
              >
                {carouselItems.map((m, idx) => (
                  <div className={styles.carouselSlide} key={`${m.key}_${idx}`}>
                    {renderFluxBubble(m, `${m.key}_${idx}`)}
                  </div>
                ))}
              </div>
            </div>

            {hasCarousel && (
              <div className={styles.carouselDots} aria-label="Position dans le carrousel">
                {baseModules.map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.carouselDot} ${i === activeDot ? styles.carouselDotActive : ""}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={styles.moduleGrid}>{fluxModules.map((m) => renderFluxBubble(m))}</div>
        )}


        <div className={styles.lowerRow}>
          <div className={styles.blockCard}>
            <div className={styles.blockHead}>
              <h3 className={styles.h3}>Tableau de bord</h3>
              <span className={styles.smallMuted}>Pilotage</span>
            </div>

            <div className={styles.loopWrap}>
              {/* ✅ TON CONTENU PILOTAGE (inchangé) */}
              {/* (tout ton SVG + loopGrid est conservé tel quel) */}
              {/* --- START --- */}
              <svg className={styles.loopWheel} viewBox="0 0 300 300" aria-hidden="true">
                <defs>
                  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.4" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

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

                <circle cx="150" cy="150" r="92" fill="none" stroke="url(#rimGrad)" strokeWidth="10" filter="url(#softGlow)" />
                <circle cx="150" cy="150" r="84" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />

                <circle cx="150" cy="150" r="70" fill="none" stroke="url(#rimInner)" strokeWidth="18" opacity="0.55" />

                <g filter="url(#softGlow)">
                  <path d="M150 150 L150 78" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                  <path d="M150 150 L222 150" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                  <path d="M150 150 L150 222" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                  <path d="M150 150 L78 150" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" />
                </g>

                <g>
                  <path d="M150 150 L150 78" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M150 150 L222 150" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M150 150 L150 222" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M150 150 L78 150" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
                </g>

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

<button
  className={styles.loopGearBtn}
  type="button"
  aria-label="Réglages Mails"
  title="Réglages"
  onClick={() => openPanel("mails")}
>
  <svg className={styles.loopGearSvg} viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
  <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6H10l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
</svg>
</button>

      <div className={styles.loopSub}>Toutes vos demandes arrivent ici</div>
      <div className={styles.loopActions}>
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={() => router.push("/dashboard/mails")}
>
  Ouvrir iNr'Box
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
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={async () => {
    const r = await fetch("/api/calendar/status");
    if (!r.ok) {
      window.location.href = "/api/integrations/google-calendar/start";
      return;
    }
    const j = await r.json().catch(() => ({}));
    if (!j.connected) {
      window.location.href = "/api/integrations/google-calendar/start";
      return;
    }
    router.push("/dashboard/agenda");
  }}
>
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
              {/* ✅ TON CONTENU BOÎTE DE VITESSE (inchangé) */}
              {/* --- START --- */}
              <div className={styles.gearRail} aria-hidden />

              <div className={styles.gearGrid}>
                <button className={`${styles.gearCapsule} ${styles.gear_cyan}`} type="button">
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>Publier</div>
                    <div className={styles.gearSub}>Active tous vos canaux</div>
                    <div className={styles.gearBtn}>Publier maintenant</div>
                  </div>
                </button>

                <button
                  className={`${styles.gearCapsule} ${styles.gear_purple}`}
                  type="button"
                  onClick={() => router.push("/dashboard/devis/new")}
                >
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>Devis</div>
                    <div className={styles.gearSub}>Déclenche des opportunités</div>
                    <div className={styles.gearBtn}>Créer un devis</div>
                  </div>
                </button>

                <button
                  className={`${styles.gearCapsule} ${styles.gear_pink}`}
                  type="button"
                  onClick={() => router.push("/dashboard/factures/new")}
                >
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>Facturer</div>
                    <div className={styles.gearSub}>Transforme en CA</div>
                    <div className={styles.gearBtn}>Créer une facture</div>
                  </div>
                </button>

                <button className={`${styles.gearCapsule} ${styles.gear_orange}`} type="button">
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>Fidéliser</div>
                    <div className={styles.gearSub}>Pérennise votre activité</div>
                    <div className={styles.gearBtn}>Communiquer</div>
                  </div>
                </button>
              </div>
              {/* --- END --- */}
            </div>
          </div>
        </div>
      </section>

      <SettingsDrawer
        title={
          panel === "contact"
            ? "Nous contacter"
            : panel === "profil"
            ? "Mon profil"
            : panel === "abonnement"
            ? "Mon abonnement"
            : panel === "mails"
            ? "Réglages iNr’Box"
            : ""
        }
        isOpen={panel === "contact" || panel === "profil" || panel === "abonnement" || panel === "mails"}
        onClose={closePanel}
      >
        {panel === "contact" && <ContactContent mode="drawer" />}
        {panel === "mails" && <MailsSettingsContent />}

        {/* ✅ AJOUT : callbacks pour mise à jour immédiate de la pastille */}
        {panel === "profil" && (
          <ProfilContent mode="drawer" onProfileSaved={checkProfile} onProfileReset={checkProfile} />
        )}

        {panel === "abonnement" && <AbonnementContent mode="drawer" onOpenContact={() => openPanel("contact")} />}
      </SettingsDrawer>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© {new Date().getFullYear()} iNrCy</div>
      </footer>
    </main>
  );
}
