"use client";

import { useEffect, useRef, useState } from "react";
import HelpButton from "./HelpButton";
import { useDashboardI18n } from "../_hooks/useDashboardI18n";
import styles from "../dashboard.module.css";

type GeneratorPowerStep = {
  readonly label: string;
  readonly shortLabel: string;
  readonly weight: number;
  readonly completed: boolean;
};

type InertiaSnapshot = {
  multiplier: number;
  connectedCount: number;
  totalChannels: number;
};

type DashboardHeroProps = {
  generatorPower: number;
  generatorPowerSteps: readonly GeneratorPowerStep[];
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
  generatorPowerSteps,
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
  const t = useDashboardI18n();
  const [powerBreakdownOpen, setPowerBreakdownOpen] = useState(false);
  const powerBreakdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!powerBreakdownOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && powerBreakdownRef.current?.contains(target)) return;
      setPowerBreakdownOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPowerBreakdownOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [powerBreakdownOpen]);

  const powerInfoPanel = powerBreakdownOpen ? (
    <div className={styles.powerInfoPanel} role="dialog" aria-label={t.hero.powerDialogAria}>
      <div className={styles.powerInfoPanelTitle}>{t.hero.powerPanelTitle}</div>

      <div className={styles.powerInfoCompact}>
        {generatorPowerSteps.map((step) => (
          <span
            key={step.label}
            className={`${styles.powerInfoMiniItem} ${step.completed ? styles.powerInfoMiniItemCompleted : ""}`}
          >
            <span className={styles.powerInfoMiniDot} aria-hidden />
            <span>{step.shortLabel}</span>
            <strong>{step.weight}%</strong>
          </span>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <section className={styles.hero}>
      <div className={styles.heroLeft}>
        <div className={styles.heroTop}>
          <div className={styles.kicker}>
            <span className={styles.kickerText}>{t.hero.kicker}</span>
          </div>

          <h1 className={styles.title}>
            <span className={styles.titleAccent}>{t.hero.title}</span>
          </h1>

          <p className={styles.subtitle}>
            {t.hero.subtitle}
          </p>

          <div className={styles.signatureFlow}>
            <span>{t.hero.flowContacts}</span>
            <span className={styles.flowArrow}>→</span>
            <span>{t.hero.flowQuotes}</span>
            <span className={styles.flowArrow}>→</span>
            <span>{t.hero.flowRevenue}</span>
          </div>
        </div>

        <div className={styles.powerBlock} ref={powerBreakdownRef}>
          <div className={styles.powerHeader}>
            <div className={styles.powerInlineTitle}>
              {t.hero.powerTitle}
              <span className={styles.powerValueWrap}>
                <span className={styles.powerInlineValue}>{generatorPower}%</span>
                <button
                  type="button"
                  className={styles.powerInfoBtn}
                  onClick={() => setPowerBreakdownOpen((open) => !open)}
                  aria-label={t.hero.powerDetailsAria}
                  aria-expanded={powerBreakdownOpen}
                  title={t.hero.powerDetailsTitle}
                >
                  i
                </button>
              </span>
            </div>
            <div className={styles.powerMeta}>
              {remainingGeneratorPowerSteps === 0
                ? t.hero.fullPower
                : `${remainingGeneratorPowerSteps} ${remainingGeneratorPowerSteps > 1 ? t.hero.stepPlural : t.hero.stepSingular} ${remainingGeneratorPowerSteps > 1 ? t.hero.remainingPlural : t.hero.remainingSingular}`}
            </div>
          </div>

          {powerInfoPanel}

          <div
            className={styles.powerBar}
            role="progressbar"
            aria-label={t.hero.progressAria}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={generatorPower}
          >
            <div className={styles.powerBarFill} style={{ width: `${generatorPower}%` }} />
          </div>

          <div className={styles.powerFooter}>
            {nextGeneratorPowerStep ? (
              <span className={styles.powerHint}>
                {t.hero.nextRise} {nextGeneratorPowerStep.label} <strong>(+{nextGeneratorPowerStep.weight}%)</strong>
              </span>
            ) : (
              <span className={styles.powerHintComplete}>{t.hero.completeHint}</span>
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
              <div className={styles.generatorTitle}>{t.hero.generatorTitle}</div>
              <HelpButton onClick={onOpenGeneratorHelp} title={t.hero.generatorHelpTitle} />
            </div>
            <div className={styles.generatorDesc}>{t.hero.generatorDesc}</div>
          </div>

          <div className={styles.generatorHeaderRight}>
            <button
              type="button"
              className={styles.generatorRefreshBtn}
              onClick={onRefreshGenerator}
              disabled={kpisLoading}
              aria-label={t.hero.refreshAria}
              title={t.hero.refreshTitle}
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
              {generatorIsActive ? t.hero.active : t.hero.waiting}
            </div>
          </div>
        </div>

        <div className={styles.generatorGrid}>
          <div className={`${styles.metricCard} ${styles.metricInertia}`}>
            <div className={styles.metricLabel}>{t.hero.inertiaUnits}</div>
            <div className={styles.metricValue}>{uiBalance}</div>
            <div className={styles.metricHint}>
              Turbo UI ×{inertiaSnapshot.multiplier} — {inertiaSnapshot.connectedCount}/{inertiaSnapshot.totalChannels} {t.hero.channels}
            </div>
          </div>

          <div className={styles.generatorCoreCenter} aria-hidden>
            <div className={styles.miniCoreRing} />
            <div className={styles.miniCoreRotor} />
            <div className={styles.miniCoreGlass} />
            <div className={styles.miniCoreGlow} />
          </div>

          <div className={`${styles.metricCard} ${styles.metricCa}`}>
            <div className={styles.metricLabel}>{t.hero.potentialRevenue}</div>
            <div className={styles.metricValue}>
              {estimatedValue === null ? "—" : `${estimatedValue.toLocaleString(t.locale)} €`}
            </div>
            <div className={styles.metricHint}>{t.hero.basedOnProfile}</div>
          </div>

          <div className={`${styles.metricCard} ${styles.metricOpportunities}`}>
            <div className={styles.metricLabel}>{t.hero.opportunities}</div>

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

            <div className={styles.metricHint}>{t.hero.projection30}</div>
          </div>

          <div className={`${styles.metricCard} ${styles.metricDemandes}`}>
            <div className={styles.metricLabel}>{t.hero.capturedLeads}</div>
            <div className={styles.metricSplit}>
              <div className={styles.metricSplitItem}>
                <div className={styles.metricSplitValue}>{leadsWeek === null ? "—" : leadsWeek}</div>
                <div className={styles.metricSplitLabel}>{t.hero.last7}</div>
              </div>
              <div className={styles.metricSplitItem}>
                <div className={styles.metricSplitValue}>{leadsMonth === null ? "—" : leadsMonth}</div>
                <div className={styles.metricSplitLabel}>{t.hero.last30}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
