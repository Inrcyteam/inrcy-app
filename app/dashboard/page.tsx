import styles from "./dashboard.module.css";

type ModuleKey =
  | "facebook"
  | "site"
  | "mail"
  | "stats"
  | "annuaire"
  | "gmb"
  | "houzz"
  | "publier"
  | "facturer"
  | "devis";

type ModuleStatus = "connected" | "available" | "coming";

type Module = {
  key: ModuleKey;
  name: string;
  description: string;
  accent: "blue" | "green" | "purple" | "orange" | "pink" | "teal";
  status: ModuleStatus;

  metricLabel: string;
  metricValue?: string; // undefined => "—"
};

function statusLabel(s: ModuleStatus) {
  if (s === "connected") return "Connecté";
  if (s === "available") return "À connecter";
  return "Bientôt";
}

/**
 * ✅ Tu peux basculer ces status au fur et à mesure des intégrations.
 * Plus tard, tu remplaceras ça par un fetch Supabase.
 */
const modules: Module[] = [
  {
    key: "facebook",
    name: "Facebook",
    description: "Campagnes & formulaires — capte la demande.",
    status: "available",
    accent: "blue",
    metricLabel: "Leads 7j",
  },
  {
    key: "site",
    name: "Site iNrCy",
    description: "Landing + tracking — transforme en contacts.",
    status: "available",
    accent: "green",
    metricLabel: "Conversion",
  },
  {
    key: "mail",
    name: "Mail",
    description: "Nurturing & relances — fait mûrir les leads.",
    status: "available",
    accent: "purple",
    metricLabel: "Ouverture",
  },
  {
    key: "stats",
    name: "Stats",
    description: "ROI & performance — pilote comme un pro.",
    status: "available",
    accent: "teal",
    metricLabel: "ROI",
  },
  {
    key: "annuaire",
    name: "Annuaire",
    description: "Présence locale — crédibilité & trafic.",
    status: "available",
    accent: "orange",
    metricLabel: "Citations",
  },
  {
    key: "gmb",
    name: "Google Business",
    description: "Appels, itinéraires, avis — le local qui convertit.",
    status: "available",
    accent: "green",
    metricLabel: "Actions",
  },
  {
    key: "houzz",
    name: "Houzz",
    description: "Demandes qualifiées — projets à valeur.",
    status: "available",
    accent: "pink",
    metricLabel: "Demandes",
  },
  {
    key: "publier",
    name: "Publier",
    description: "Posts, actus, offres — nourrit tous les canaux.",
    status: "coming",
    accent: "purple",
    metricLabel: "Planifié",
  },
  {
    key: "devis",
    name: "Devis",
    description: "Transformer un lead en devis en 30 secondes.",
    status: "coming",
    accent: "orange",
    metricLabel: "Devis",
  },
  {
    key: "facturer",
    name: "Facturer",
    description: "Encaissement & suivi — propre et automatique.",
    status: "coming",
    accent: "teal",
    metricLabel: "Factures",
  },
];

function computeReadiness(mods: Module[]) {
  const connected = mods.filter((m) => m.status === "connected").length;
  const available = mods.filter((m) => m.status === "available").length;
  const coming = mods.filter((m) => m.status === "coming").length;

  // Si rien n'est connecté, on n'invente pas de chiffres.
  const hasData = connected > 0;

  return { connected, available, coming, hasData };
}

export default function DashboardPage() {
  const readiness = computeReadiness(modules);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.logoMark} aria-hidden />
          <div>
            <div className={styles.brandName}>iNrCy</div>
            <div className={styles.brandTag}>Générateur de leads — Hub connecté</div>
          </div>
        </div>

        <div className={styles.topbarActions}>
          <button className={styles.ghostBtn} type="button">
            Centre d’aide
          </button>
          <button className={styles.primaryBtn} type="button">
            Connecter un module
          </button>
          <div className={styles.avatar} title="Compte">
            IN
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.kicker}>
            <span className={styles.kickerDot} aria-hidden />
            Votre cockpit iNrCy
          </div>

          <h1 className={styles.title}>
            Le <span className={styles.titleAccent}>Générateur</span>
            <span className={styles.titleLine2}>au centre de tous vos modules.</span>
          </h1>

          <p className={styles.subtitle}>
            Connectez Facebook, Site iNrCy, GMB, Email, Houzz, Annuaire… et pilotez tout
            depuis une seule page : <strong>collecte</strong> → <strong>qualifie</strong> →{" "}
            <strong>convertit</strong>.
          </p>

          <div className={styles.pills}>
            <span className={styles.pill}>
              <span className={styles.pillDot} aria-hidden />
              {readiness.connected} connectés • {readiness.available} à connecter • {readiness.coming} bientôt
            </span>
            <span className={styles.pillMuted}>Automatisations • ROI • Centralisation</span>
          </div>

          <div className={styles.ctaRow}>
            <button className={styles.primaryBtn} type="button">
              Démarrer la configuration
            </button>
            <button className={styles.secondaryBtn} type="button">
              Voir les modules
            </button>
          </div>
        </div>

        <div className={styles.generatorCard}>
          <div className={styles.generatorHeader}>
            <div>
              <div className={styles.generatorTitle}>Le Générateur iNrCy</div>
              <div className={styles.generatorDesc}>
                Quand un module est connecté, iNrCy récupère les signaux et les transforme en leads.
              </div>
            </div>

            <div
              className={`${styles.generatorStatus} ${
                readiness.hasData ? styles.statusLive : styles.statusSetup
              }`}
            >
              <span className={readiness.hasData ? styles.liveDot : styles.setupDot} aria-hidden />
              {readiness.hasData ? "Actif" : "À configurer"}
            </div>
          </div>

          <div className={styles.generatorGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Leads aujourd’hui</div>
              <div className={styles.metricValue}>{readiness.hasData ? "—" : "0"}</div>
              <div className={styles.metricHint}>
                {readiness.hasData ? "En attente des données…" : "Connectez un module pour démarrer"}
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Leads ce mois</div>
              <div className={styles.metricValue}>{readiness.hasData ? "—" : "0"}</div>
              <div className={styles.metricHint}>
                {readiness.hasData ? "En attente des données…" : "Objectif : à définir après connexion"}
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Valeur estimée</div>
              <div className={styles.metricValue}>—</div>
              <div className={styles.metricHint}>S’affiche quand vous suivez devis/factures</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Temps de réponse</div>
              <div className={styles.metricValue}>—</div>
              <div className={styles.metricHint}>S’affiche quand le flux est actif</div>
            </div>
          </div>

          <div className={styles.generatorFooter}>
            <button className={styles.secondaryBtn} type="button">
              Voir le flux
            </button>
            <button className={styles.primaryBtn} type="button">
              Connecter maintenant
            </button>
          </div>

          <div className={styles.generatorGlow} aria-hidden />
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.leftCol}>
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>Modules rattachés</h2>
            <p className={styles.h2Sub}>
              Chaque module se branche au Générateur. Plus tu connectes, plus iNrCy devient puissant.
            </p>
          </div>

          <div className={styles.moduleGrid}>
            {modules.map((m) => (
              <article
                key={m.key}
                className={`${styles.moduleCard} ${styles[`accent_${m.accent}`]}`}
              >
                <div className={styles.moduleTop}>
                  <div className={styles.moduleName}>{m.name}</div>
                  <span
                    className={`${styles.badge} ${
                      m.status === "connected"
                        ? styles.badgeOk
                        : m.status === "available"
                        ? styles.badgeWarn
                        : styles.badgeSoon
                    }`}
                  >
                    {statusLabel(m.status)}
                  </span>
                </div>

                <div className={styles.moduleDesc}>{m.description}</div>

                <div className={styles.moduleBottom}>
                  <div className={styles.moduleMetric}>
                    <div className={styles.moduleMetricLabel}>{m.metricLabel}</div>
                    <div className={styles.moduleMetricValue}>{m.metricValue ?? "—"}</div>
                  </div>

                  {m.status === "connected" ? (
                    <button className={styles.ghostBtn} type="button">
                      Configurer
                    </button>
                  ) : m.status === "available" ? (
                    <button className={styles.primaryBtn} type="button">
                      Connecter
                    </button>
                  ) : (
                    <button className={styles.ghostBtn} type="button" disabled>
                      À venir
                    </button>
                  )}
                </div>

                <div className={styles.moduleGlow} aria-hidden />
              </article>
            ))}
          </div>
        </div>

        <aside className={styles.rightCol}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.h3}>Flux de leads</h3>
              <span className={styles.smallMuted}>En temps réel</span>
            </div>

            {!readiness.hasData ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden>
                  <div className={styles.emptyPulse} />
                </div>
                <div className={styles.emptyTitle}>Aucun lead pour le moment</div>
                <div className={styles.emptyText}>
                  Dès qu’un module est connecté (ex: Site iNrCy, GMB ou Facebook), les leads apparaissent ici.
                </div>

                <div className={styles.emptyActions}>
                  <button className={styles.primaryBtn} type="button">
                    Connecter Site iNrCy
                  </button>
                  <button className={styles.secondaryBtn} type="button">
                    Connecter GMB
                  </button>
                </div>

                <div className={styles.emptyHint}>
                  Conseil : commence par <strong>Site iNrCy</strong> + <strong>Google Business</strong> pour un ROI rapide.
                </div>
              </div>
            ) : (
              <div className={styles.leadList}>
                {/* Plus tard: map des leads Supabase */}
                <div className={styles.placeholderRow}>
                  Les leads connectés s’afficheront ici.
                </div>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.h3}>Actions rapides</h3>
              <span className={styles.smallMuted}>Pilotage</span>
            </div>

            <div className={styles.quickGrid}>
              <button className={styles.quickBtn} type="button">
                <span className={styles.quickTitle}>Connecter</span>
                <span className={styles.quickSub}>Ajouter un canal</span>
              </button>
              <button className={styles.quickBtn} type="button">
                <span className={styles.quickTitle}>Configurer</span>
                <span className={styles.quickSub}>Suivi & tracking</span>
              </button>
              <button className={styles.quickBtn} type="button" disabled>
                <span className={styles.quickTitle}>Publier</span>
                <span className={styles.quickSub}>Bientôt</span>
              </button>
              <button className={styles.quickBtn} type="button" disabled>
                <span className={styles.quickTitle}>Facturer</span>
                <span className={styles.quickSub}>Bientôt</span>
              </button>
            </div>
          </div>
        </aside>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© {new Date().getFullYear()} iNrCy</div>
        <div className={styles.footerRight}>
          <span className={styles.smallMuted}>État :</span>{" "}
          {readiness.connected === 0 ? (
            <strong>prêt à connecter vos modules</strong>
          ) : (
            <strong>collecte en cours</strong>
          )}
        </div>
      </footer>
    </main>
  );
}
