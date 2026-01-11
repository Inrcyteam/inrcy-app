import styles from "./dashboard.module.css";

type ModuleStatus = "connected" | "available" | "coming";
type Accent = "cyan" | "purple" | "pink" | "orange";

type Module = {
  key: string;
  name: string;
  description: string;
  status: ModuleStatus;
  accent: Accent;
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

const fluxModules: Module[] = [
  { key: "facebook", name: "Facebook", description: "Campagnes & formulaires : capte la demande.", status: "available", accent: "cyan" },
  { key: "site_inrcy", name: "Site iNrCy", description: "Landing + tracking : transforme en contacts.", status: "available", accent: "purple" },
  { key: "site_web", name: "Site web", description: "Formulaires & appels : récupère les intentions.", status: "available", accent: "pink" },
  { key: "gmb", name: "Google Business", description: "Appels, itinéraires, avis : le local qui convertit.", status: "available", accent: "orange" },
  { key: "houzz", name: "Houzz", description: "Demandes qualifiées : projets à valeur.", status: "available", accent: "pink" },
];

const adminModules: Module[] = [
  { key: "mails", name: "Mails", description: "Relances, notifications, nurturing.", status: "available", accent: "purple" },
  { key: "stats", name: "Stats", description: "ROI, performance et suivi des canaux.", status: "available", accent: "cyan" },
];

const quickActions: Array<{ key: string; title: string; sub: string; disabled?: boolean; accent: Accent }> = [
  { key: "facturer", title: "Facturer", sub: "Factures & paiements", disabled: true, accent: "orange" },
  { key: "devis", title: "Faire devis", sub: "Devis en 30 sec", disabled: true, accent: "pink" },
  { key: "publier", title: "Publier", sub: "Posts & contenus", disabled: true, accent: "purple" },
  { key: "newsletter", title: "Communiquer", sub: "Newsletter & promos", disabled: true, accent: "cyan" },
];

export default function DashboardPage() {
  // ✅ Pas de données inventées : 0 tant que rien n’est connecté
  // Plus tard : tu remplaceras par des valeurs Supabase (leads du jour/semaine/mois).
  const leadsToday = 0;
  const leadsWeek = 0;
  const leadsMonth = 0;

  // Panier moyen : on le rend "réel" tout de suite, côté UI (sans backend).
  // Plus tard : tu le stockeras dans Supabase (profil) et tu hydrateras ici.
  const avgBasket = 0; // affichage neutre pour le moment
  const estimatedValue = avgBasket > 0 ? avgBasket * leadsMonth : 0;

  const profileComplete = false; // plus tard basé sur Supabase
  const profileLabel = profileComplete ? "Profil complété" : "Profil à compléter";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandZone}>
          <div className={styles.brand}>
            <div className={styles.logoWrap}>
              <img className={styles.logoImg} src="/logo-inrcy.png" alt="iNrCy" />
            </div>
            <div className={styles.brandText}>
              <div className={styles.brandName}>iNrCy</div>
              <div className={styles.brandTag}>Générateur de leads — Hub connecté</div>
            </div>
          </div>

          {/* ✅ Profil “en haut à droite du logo” */}
          <div className={styles.profileCard}>
            <div className={styles.profileTop}>
              <div className={styles.profileTitle}>Profil pro</div>
              <span className={`${styles.profileBadge} ${profileComplete ? styles.profileOk : styles.profileWarn}`}>
                {profileLabel}
              </span>
            </div>
            <div className={styles.profileHint}>
              Renseignez les infos utiles pour <strong>devis</strong>, <strong>factures</strong> et <strong>mentions</strong>.
            </div>
            <div className={styles.profileActions}>
              <button className={styles.secondaryBtn} type="button">
                Voir
              </button>
              <button className={styles.primaryBtn} type="button">
                Compléter
              </button>
            </div>
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

      {/* HERO : gauche (vision) / droite (Générateur) */}
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.kicker}>
            <span className={styles.kickerDot} aria-hidden />
            Votre cockpit iNrCy
          </div>

          <h1 className={styles.title}>
            Le <span className={styles.titleAccent}>Générateur</span>
            <span className={styles.titleLine2}>branche tous vos canaux, au même endroit.</span>
          </h1>

          <p className={styles.subtitle}>
            Connectez vos sources (Facebook, GMB, Sites, Houzz…) pour centraliser le flux et passer en mode{" "}
            <strong>machine à contacts</strong>.
          </p>

          <div className={styles.pills}>
            <span className={styles.pill}>
              <span className={styles.pillDot} aria-hidden />
              Flux • Admin • Actions rapides
            </span>
            <span className={styles.pillMuted}>Centralisation • ROI • Automatisations</span>
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

        {/* ✅ Générateur en haut à droite (ton cadre) */}
        <div className={styles.generatorCard}>
          <div className={styles.generatorHeader}>
            <div>
              <div className={styles.generatorTitle}>Générateur iNrCy</div>
              <div className={styles.generatorDesc}>
                Affiche en direct la production de leads dès qu’un module est connecté.
              </div>
            </div>

            <div className={`${styles.generatorStatus} ${leadsMonth > 0 ? styles.statusLive : styles.statusSetup}`}>
              <span className={leadsMonth > 0 ? styles.liveDot : styles.setupDot} aria-hidden />
              {leadsMonth > 0 ? "Actif" : "En attente"}
            </div>
          </div>

          <div className={styles.generatorGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Leads aujourd’hui</div>
              <div className={styles.metricValue}>{leadsToday}</div>
              <div className={styles.metricHint}>Se met à jour en temps réel</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Cette semaine</div>
              <div className={styles.metricValue}>{leadsWeek}</div>
              <div className={styles.metricHint}>Synthèse 7 jours</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Ce mois</div>
              <div className={styles.metricValue}>{leadsMonth}</div>
              <div className={styles.metricHint}>Synthèse mensuelle</div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Valeur estimée</div>
              <div className={styles.metricValue}>
                {estimatedValue > 0 ? `${estimatedValue.toLocaleString("fr-FR")} €` : "—"}
              </div>
              <div className={styles.metricHint}>
                Panier moyen × nb leads (configurable via Profil)
              </div>
            </div>
          </div>

          <div className={styles.generatorFooter}>
            <button className={styles.secondaryBtn} type="button">
              Voir le flux
            </button>
            <button className={styles.primaryBtn} type="button">
              Connecter un outil
            </button>
          </div>

          <div className={styles.generatorGlow} aria-hidden />
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.leftCol}>
          {/* FLUX */}
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>Flux de contacts</h2>
            <p className={styles.h2Sub}>Ce sont les entrées. Branche-les au Générateur.</p>
          </div>

          <div className={styles.moduleGrid}>
            {fluxModules.map((m) => (
              <article key={m.key} className={`${styles.moduleCard} ${styles[`accent_${m.accent}`]}`}>
                <div className={styles.moduleTop}>
                  <div className={styles.moduleName}>{m.name}</div>
                  <span className={`${styles.badge} ${statusClass(m.status)}`}>{statusLabel(m.status)}</span>
                </div>

                <div className={styles.moduleDesc}>{m.description}</div>

                <div className={styles.moduleBottom}>
                  <div className={styles.moduleMeta}>
                    <div className={styles.moduleMetaLabel}>État</div>
                    <div className={styles.moduleMetaValue}>
                      {m.status === "available" ? "Prêt à connecter" : m.status === "connected" ? "Connecté" : "Bientôt"}
                    </div>
                  </div>

                  {m.status === "available" ? (
                    <button className={styles.primaryBtn} type="button">
                      Connecter
                    </button>
                  ) : m.status === "connected" ? (
                    <button className={styles.ghostBtn} type="button">
                      Configurer
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

          {/* ADMIN */}
          <div className={styles.sectionHead} style={{ marginTop: 18 }}>
            <h2 className={styles.h2}>Admin</h2>
            <p className={styles.h2Sub}>Pilotage : emails + stats, pour suivre et convertir.</p>
          </div>

          <div className={styles.moduleGrid} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            {adminModules.map((m) => (
              <article key={m.key} className={`${styles.moduleCard} ${styles[`accent_${m.accent}`]}`}>
                <div className={styles.moduleTop}>
                  <div className={styles.moduleName}>{m.name}</div>
                  <span className={`${styles.badge} ${statusClass(m.status)}`}>{statusLabel(m.status)}</span>
                </div>

                <div className={styles.moduleDesc}>{m.description}</div>

                <div className={styles.moduleBottom}>
                  <div className={styles.moduleMeta}>
                    <div className={styles.moduleMetaLabel}>Données</div>
                    <div className={styles.moduleMetaValue}>—</div>
                  </div>

                  {m.status === "available" ? (
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

        {/* RIGHT COL */}
        <aside className={styles.rightCol}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.h3}>Flux en direct</h3>
              <span className={styles.smallMuted}>Derniers contacts</span>
            </div>

            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden>
                <div className={styles.emptyPulse} />
              </div>
              <div className={styles.emptyTitle}>Aucun contact pour le moment</div>
              <div className={styles.emptyText}>
                Connecte au moins <strong>Site iNrCy</strong> ou <strong>GMB</strong> : les contacts apparaîtront ici.
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
                Astuce : une fois le flux actif, tu pourras déclencher <strong>devis</strong> et <strong>factures</strong>.
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.h3}>Actions rapides</h3>
              <span className={styles.smallMuted}>Conversion</span>
            </div>

            <div className={styles.quickGrid}>
              {quickActions.map((a) => (
                <button
                  key={a.key}
                  className={`${styles.quickBtn} ${styles[`quick_${a.accent}`]}`}
                  type="button"
                  disabled={!!a.disabled}
                >
                  <span className={styles.quickTitle}>{a.title}</span>
                  <span className={styles.quickSub}>{a.sub}</span>
                  <span className={styles.quickBadge}>{a.disabled ? "Bientôt" : "Ouvrir"}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
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
