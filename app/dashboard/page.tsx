import styles from "./dashboard.module.css";

type ModuleStatus = "connected" | "available" | "coming";

type Module = {
  key: string;
  name: string;
  description: string;
  status: ModuleStatus;
  accent: "blue" | "green" | "purple" | "orange" | "pink" | "teal";
  metricLabel: string;
  metricValue: string;
};

const modules: Module[] = [
  {
    key: "facebook",
    name: "Facebook",
    description: "Campagnes & formulaires — capte la demande.",
    status: "available",
    accent: "blue",
    metricLabel: "Leads 7j",
    metricValue: "—",
  },
  {
    key: "site",
    name: "Site iNrCy",
    description: "Landing + tracking — transforme en contacts.",
    status: "connected",
    accent: "green",
    metricLabel: "Conversion",
    metricValue: "4.8%",
  },
  {
    key: "mail",
    name: "Mail",
    description: "Nurturing & relances — fait mûrir les leads.",
    status: "available",
    accent: "purple",
    metricLabel: "Ouverture",
    metricValue: "—",
  },
  {
    key: "stats",
    name: "Stats",
    description: "ROI & performance — pilote comme un pro.",
    status: "connected",
    accent: "teal",
    metricLabel: "ROI",
    metricValue: "x3.1",
  },
  {
    key: "annuaire",
    name: "Annuaire",
    description: "Présence locale — crédibilité & trafic.",
    status: "available",
    accent: "orange",
    metricLabel: "Citations",
    metricValue: "—",
  },
  {
    key: "gmb",
    name: "Google Business",
    description: "Appels, itinéraires, avis — le local qui convertit.",
    status: "available",
    accent: "green",
    metricLabel: "Actions",
    metricValue: "—",
  },
  {
    key: "houzz",
    name: "Houzz",
    description: "Demandes qualifiées — projets à valeur.",
    status: "available",
    accent: "pink",
    metricLabel: "Demandes",
    metricValue: "—",
  },
  {
    key: "publier",
    name: "Publier",
    description: "Posts, actus, offres — nourrit tous les canaux.",
    status: "coming",
    accent: "purple",
    metricLabel: "Planifié",
    metricValue: "Bientôt",
  },
  {
    key: "devis",
    name: "Devis",
    description: "Transformer un lead en devis en 30 secondes.",
    status: "coming",
    accent: "orange",
    metricLabel: "Devis",
    metricValue: "Bientôt",
  },
  {
    key: "facturer",
    name: "Facturer",
    description: "Encaissement & suivi — propre et automatique.",
    status: "coming",
    accent: "teal",
    metricLabel: "Factures",
    metricValue: "Bientôt",
  },
];

type Lead = {
  id: string;
  name: string;
  service: string;
  city: string;
  source: string;
  score: "Chaud" | "Tiède" | "Froid";
  minutesAgo: number;
};

const leads: Lead[] = [
  { id: "L-1021", name: "M. Dupont", service: "Toiture", city: "Calais", source: "Site iNrCy", score: "Chaud", minutesAgo: 6 },
  { id: "L-1020", name: "Mme Martin", service: "Dératisation", city: "Berck", source: "Google Business", score: "Tiède", minutesAgo: 22 },
  { id: "L-1019", name: "Société Lemoine", service: "Rénovation", city: "Boulogne-sur-Mer", source: "Facebook", score: "Froid", minutesAgo: 48 },
];

function statusLabel(s: ModuleStatus) {
  if (s === "connected") return "Connecté";
  if (s === "available") return "À connecter";
  return "Bientôt";
}

export default function DashboardPage() {
  const connected = modules.filter((m) => m.status === "connected").length;
  const total = modules.length;

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
          <div className={styles.kicker}>Votre cockpit iNrCy</div>
          <h1 className={styles.title}>
            Un seul écran.
            <span className={styles.titleAccent}> Tous vos canaux.</span>
            <span className={styles.titleLine2}> Une seule machine à leads.</span>
          </h1>

          <p className={styles.subtitle}>
            iNrCy est le <strong>Générateur</strong>. Chaque module (Facebook, Site, GMB, Email, Houzz, Annuaire…)
            s’y branche pour <strong>produire, suivre et convertir</strong>.
          </p>

          <div className={styles.pills}>
            <span className={styles.pill}>
              <span className={styles.pillDot} aria-hidden />
              {connected}/{total} modules connectés
            </span>
            <span className={styles.pillMuted}>Temps réel • ROI • Automatisations</span>
          </div>
        </div>

        <div className={styles.generatorCard}>
          <div className={styles.generatorHeader}>
            <div>
              <div className={styles.generatorTitle}>Le Générateur iNrCy</div>
              <div className={styles.generatorDesc}>Le point central : collecte → qualification → conversion</div>
            </div>

            <div className={styles.generatorStatus}>
              <span className={styles.liveDot} aria-hidden />
              Actif
            </div>
          </div>

          <div className={styles.generatorGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Leads aujourd’hui</div>
              <div className={styles.metricValue}>12</div>
              <div className={styles.metricHint}>+18% vs hier</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Leads ce mois</div>
              <div className={styles.metricValue}>248</div>
              <div className={styles.metricHint}>Objectif: 300</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Valeur estimée</div>
              <div className={styles.metricValue}>8 420 €</div>
              <div className={styles.metricHint}>Basé sur vos conversions</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Temps de réponse</div>
              <div className={styles.metricValue}>7 min</div>
              <div className={styles.metricHint}>Plus bas = plus de deals</div>
            </div>
          </div>

          <div className={styles.generatorFooter}>
            <button className={styles.secondaryBtn} type="button">
              Voir le flux
            </button>
            <button className={styles.primaryBtn} type="button">
              Lancer une action
            </button>
          </div>

          <div className={styles.generatorGlow} aria-hidden />
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.leftCol}>
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>Modules rattachés</h2>
            <p className={styles.h2Sub}>Connectez chaque brique au Générateur pour déclencher la machine.</p>
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
                    <div className={styles.moduleMetricValue}>{m.metricValue}</div>
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
              <span className={styles.smallMuted}>Derniers entrants</span>
            </div>

            <div className={styles.leadList}>
              {leads.map((l) => (
                <div key={l.id} className={styles.leadRow}>
                  <div className={styles.leadMain}>
                    <div className={styles.leadTitle}>
                      {l.name} <span className={styles.leadMuted}>• {l.service}</span>
                    </div>
                    <div className={styles.leadMeta}>
                      <span className={styles.metaPill}>{l.city}</span>
                      <span className={styles.metaPillSoft}>{l.source}</span>
                      <span
                        className={`${styles.score} ${
                          l.score === "Chaud"
                            ? styles.scoreHot
                            : l.score === "Tiède"
                            ? styles.scoreWarm
                            : styles.scoreCold
                        }`}
                      >
                        {l.score}
                      </span>
                    </div>
                  </div>
                  <div className={styles.leadSide}>
                    <div className={styles.timeAgo}>{l.minutesAgo} min</div>
                    <button className={styles.smallBtn} type="button">
                      Ouvrir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.panelFooter}>
              <button className={styles.secondaryBtn} type="button">
                Voir tous les leads
              </button>
              <button className={styles.primaryBtn} type="button">
                Créer un devis
              </button>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.h3}>Actions rapides</h3>
              <span className={styles.smallMuted}>Votre routine iNrCy</span>
            </div>

            <div className={styles.quickGrid}>
              <button className={styles.quickBtn} type="button">
                <span className={styles.quickTitle}>Publier</span>
                <span className={styles.quickSub}>Post GMB + réseaux</span>
              </button>
              <button className={styles.quickBtn} type="button">
                <span className={styles.quickTitle}>Relancer</span>
                <span className={styles.quickSub}>Email/SMS aux tièdes</span>
              </button>
              <button className={styles.quickBtn} type="button">
                <span className={styles.quickTitle}>Optimiser</span>
                <span className={styles.quickSub}>Pages & conversions</span>
              </button>
              <button className={styles.quickBtn} type="button">
                <span className={styles.quickTitle}>Facturer</span>
                <span className={styles.quickSub}>Paiement & suivi</span>
              </button>
            </div>
          </div>
        </aside>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>© {new Date().getFullYear()} iNrCy — Générateur & modules connectés</div>
        <div className={styles.footerRight}>
          <span className={styles.smallMuted}>Astuce :</span> connecte d’abord <strong>Site iNrCy</strong> + <strong>GMB</strong> pour un ROI immédiat.
        </div>
      </footer>
    </main>
  );
}
