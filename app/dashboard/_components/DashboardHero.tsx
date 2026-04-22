import HelpButton from "./HelpButton";
import styles from "../dashboard.module.css";

type GeneratorPowerStep = {
  label: string;
  weight: number;
};

type InertiaSnapshot = {
  multiplier: number;
  connectedCount: number;
  totalChannels: number;
};

type DashboardHeroProps = {
  generatorPower: number;
  remainingGeneratorPowerSteps: number;
  nextGeneratorPowerStep: GeneratorPowerStep | null;
  onOpenGeneratorHelp: () => void;
  onRefreshGenerator: () => void;
  kpisLoading: boolean;
  generatorIsActive: boolean;
  uiBalance: number;
  inertiaSnapshot: InertiaSnapshot;
  estimatedValue: number | null;
  oppTotal: number | null;
  onOpenStats: () => void;
  leadsWeek: number | null;
  leadsMonth: number | null;
};

export default function DashboardHero({
  generatorPower,
  remainingGeneratorPowerSteps,
  nextGeneratorPowerStep,
  onOpenGeneratorHelp,
  onRefreshGenerator,
  kpisLoading,
  generatorIsActive,
  uiBalance,
  inertiaSnapshot,
  estimatedValue,
  oppTotal,
  onOpenStats,
  leadsWeek,
  leadsMonth,
}: DashboardHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroLeft}>
        <div className={styles.heroTop}>
          <div className={styles.kicker}>
            <span className={styles.kickerText}>Votre cockpit iNrCy</span>
          </div>

          <h1 className={styles.title}>
            <span className={styles.titleAccent}>Le Générateur est lancé&nbsp;!</span>
          </h1>

          <p className={styles.subtitle}>
            Tous vos canaux alimentent maintenant une seule et même machine.
          </p>

          <div className={styles.signatureFlow}>
            <span>Contacts</span>
            <span className={styles.flowArrow}>→</span>
            <span>Devis</span>
            <span className={styles.flowArrow}>→</span>
            <span>Chiffre d'affaires</span>
          </div>
        </div>

        <div className={styles.powerBlock}>
          <div className={styles.powerHeader}>
            <div className={styles.powerInlineTitle}>
              Puissance du générateur : <span className={styles.powerInlineValue}>{generatorPower}%</span>
            </div>
            <div className={styles.powerMeta}>
              {remainingGeneratorPowerSteps === 0
                ? "Pleine puissance"
                : `${remainingGeneratorPowerSteps} étape${remainingGeneratorPowerSteps > 1 ? "s" : ""} restante${remainingGeneratorPowerSteps > 1 ? "s" : ""}`}
            </div>
          </div>

          <div
            className={styles.powerBar}
            role="progressbar"
            aria-label="Puissance du générateur"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={generatorPower}
          >
            <div className={styles.powerBarFill} style={{ width: `${generatorPower}%` }} />
          </div>

          <div className={styles.powerFooter}>
            {nextGeneratorPowerStep ? (
              <span className={styles.powerHint}>
                Prochaine montée : {nextGeneratorPowerStep.label} <strong>(+{nextGeneratorPowerStep.weight}%)</strong>
              </span>
            ) : (
              <span className={styles.powerHintComplete}>Tous vos leviers alimentent la machine à pleine puissance.</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.generatorCard}>
        <div className={styles.generatorFX} aria-hidden />
        <div className={styles.generatorFX2} aria-hidden />
        <div className={styles.generatorFX3} aria-hidden />

        <div className={styles.generatorHeader}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className={styles.generatorTitle}>Générateur iNrCy</div>
              <HelpButton onClick={onOpenGeneratorHelp} title="Aide : Générateur iNrCy" />
            </div>
            <div className={styles.generatorDesc}>Production de prospects et de clients dès qu’un module est connecté</div>
          </div>

          <div className={styles.generatorHeaderRight}>
            <button
              type="button"
              className={styles.generatorRefreshBtn}
              onClick={onRefreshGenerator}
              disabled={kpisLoading}
              aria-label="Actualiser le générateur"
              title="Actualiser"
            >
              {kpisLoading ? (
                <span className={styles.miniSpinner} aria-hidden />
              ) : (
                <svg
                  className={styles.refreshIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M20 12a8 8 0 1 1-2.343-5.657"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20 4v6h-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>

            <div className={`${styles.generatorStatus} ${generatorIsActive ? styles.statusLive : styles.statusSetup}`}>
              <span className={generatorIsActive ? styles.liveDot : styles.setupDot} aria-hidden />
              {generatorIsActive ? "Actif" : "En attente"}
            </div>
          </div>
        </div>

        <div className={styles.generatorGrid}>
          <div className={`${styles.metricCard} ${styles.metricInertia}`}>
            <div className={styles.metricLabel}>Unités d'Inertie</div>
            <div className={styles.metricValue}>{uiBalance}</div>
            <div className={styles.metricHint}>
              Turbo UI ×{inertiaSnapshot.multiplier} — {inertiaSnapshot.connectedCount}/{inertiaSnapshot.totalChannels} canaux
            </div>
          </div>

          <div className={styles.generatorCoreCenter} aria-hidden>
            <div className={styles.miniCoreRing} />
            <div className={styles.miniCoreRotor} />
            <div className={styles.miniCoreGlass} />
            <div className={styles.miniCoreGlow} />
          </div>

          <div className={`${styles.metricCard} ${styles.metricCa}`}>
            <div className={styles.metricLabel}>CA POTENTIEL 30 jours</div>
            <div className={styles.metricValue}>
              {estimatedValue === null ? "—" : `${estimatedValue.toLocaleString("fr-FR")} €`}
            </div>
            <div className={styles.metricHint}>Basé sur profil + opportunités</div>
          </div>

          <div className={`${styles.metricCard} ${styles.metricOpportunities}`}>
            <div className={styles.metricLabel}>Opportunités activables</div>

            <div className={styles.metricValueRow}>
              <div className={styles.metricValue}>
                <span>{oppTotal === null ? "—" : `+${oppTotal}`}</span>
              </div>

              <button
                type="button"
                className={styles.generatorGoBtnCorner}
                onClick={onOpenStats}
                aria-label="Voir iNrStats"
                title="Voir iNrStats"
              >
                <span className={styles.generatorGoBtnLabel}>GO</span>
              </button>
            </div>

            <div className={styles.metricHint}>Projection 30 jours</div>
          </div>

          <div className={`${styles.metricCard} ${styles.metricDemandes}`}>
            <div className={styles.metricLabel}>Demandes captées</div>
            <div className={styles.metricSplit}>
              <div className={styles.metricSplitItem}>
                <div className={styles.metricSplitValue}>{leadsWeek === null ? "—" : leadsWeek}</div>
                <div className={styles.metricSplitLabel}>7 derniers jours</div>
              </div>
              <div className={styles.metricSplitItem}>
                <div className={styles.metricSplitValue}>{leadsMonth === null ? "—" : leadsMonth}</div>
                <div className={styles.metricSplitLabel}>30 derniers jours</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.generatorFooter} />

        <div className={styles.generatorGlow} aria-hidden />
      </div>
    </section>
  );
}
