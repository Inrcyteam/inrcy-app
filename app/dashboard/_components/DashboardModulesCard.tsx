"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../dashboard.module.css";
import BaseModal from "./WorkflowBaseModal";
import { useDashboardI18n } from "../_hooks/useDashboardI18n";

type DashboardPanelName =
  | "contact"
  | "profil"
  | "inrbadge"
  | "compte"
  | "activite"
  | "abonnement"
  | "mails"
  | "agenda"
  | "site_inrcy"
  | "site_web"
  | "instagram"
  | "linkedin"
  | "gmb"
  | "trustpilot"
  | "facebook"
  | "legal"
  | "rgpd"
  | "inertie"
  | "boutique"
  | "notifications"
  | "parrainage"
  | "documents";

type DashboardModulesCardProps = {
  goToModule: (path: string) => void;
  openPanel: (panel: DashboardPanelName) => void;
  onOpenStats?: () => void;
  onOpenBoosterPublish?: () => void;
  onOpenBoosterStats?: () => void;
};

export default function DashboardModulesCard({ goToModule, openPanel, onOpenStats, onOpenBoosterPublish, onOpenBoosterStats }: DashboardModulesCardProps) {
  const t = useDashboardI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cashModalOpen, setCashModalOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("action") === "cash") setCashModalOpen(true);
  }, [searchParams]);

  const closeCashModal = () => {
    setCashModalOpen(false);
    if (searchParams.get("action") === "cash") {
      router.replace("/dashboard", { scroll: false });
    }
  };

  const openStats = () => {
    if (onOpenStats) {
      onOpenStats();
      return;
    }
    goToModule("/dashboard/stats");
  };
  return (
    <>
        <div className={styles.lowerRow}>
          <div className={styles.blockCard}>
            <div className={styles.blockHead}>
              <h3 className={styles.h3}>{t.modules.dashboardTitle}</h3>
              <span className={styles.smallMuted}>{t.modules.dashboardSub}</span>
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
      <div className={styles.loopSub}>{t.modules.statsSub}</div>
      <div className={styles.loopActions}>
        <button className={`${styles.actionBtn} ${styles.connectBtn}`} type="button" onClick={openStats}>
          iNr'Stats →
        </button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopRight} ${styles.loop_purple}`}>
<span className={`${styles.loopBadge} ${styles.badgePurple}`}></span>

     <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>COMS</div>
</div>

<button
  className={styles.loopGearBtn}
  type="button"
  aria-label={t.modules.mailsSettingsAria}
  title={t.notifications.settings}
  onClick={() => openPanel("mails")}
>
  <svg className={styles.loopGearSvg} viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
  <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6H10l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
</svg>
</button>

      <div className={styles.loopSub}>{t.modules.mailsSub}</div>
      <div className={styles.loopActions}>
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={() => goToModule("/dashboard/mails")}
>
  iNr'Send →
</button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopBottom} ${styles.loop_orange}`}>
<span className={`${styles.loopBadge} ${styles.badgeOrange}`}></span>

      <div className={styles.loopTopRow}>
  <div className={styles.loopTitle}>AGENDA</div>
</div>

<button
  className={styles.loopGearBtn}
  type="button"
  aria-label={t.modules.agendaSettingsAria}
  title={t.notifications.settings}
  onClick={() => openPanel("agenda")}
>
  <svg className={styles.loopGearSvg} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6H10l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
  </svg>
</button>

      <div className={styles.loopSub}>{t.modules.agendaSub}</div>
      <div className={styles.loopActions}>
        <button
  className={`${styles.actionBtn} ${styles.connectBtn}`}
  type="button"
  onClick={() => goToModule("/dashboard/agenda")}
>
  iNr'Calendar →
</button>
      </div>
    </div>

    <div className={`${styles.loopNode} ${styles.loopLeft} ${styles.loop_pink}`}>
<span className={`${styles.loopBadge} ${styles.badgePink}`}></span>

      <div className={styles.loopTopRow}>
        <div className={styles.loopTitle}>CRM</div>
      </div>
      <div className={styles.loopSub}>{t.modules.crmSub}</div>
      <div className={styles.loopActions}>
        <button
          className={`${styles.actionBtn} ${styles.connectBtn}`}
          type="button"
          onClick={() => goToModule("/dashboard/crm")}
        >
          iNr'CRM →
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

          <div className={`${styles.blockCard} ${styles.gearBlockCard}`}>
            <div className={styles.blockHead}>
              <h3 className={styles.h3}>{t.modules.gearboxTitle}</h3>
              <span className={styles.smallMuted}>{t.modules.gearboxSub}</span>
            </div>

            <div className={styles.gearWrap}>
              {/* ✅ TON CONTENU BOÎTE DE VITESSE (inchangé) */}
              {/* --- START --- */}
              <div className={styles.gearRail} aria-hidden />

              <div className={styles.gearGrid}>
                <button
                  type="button"
                  className={`${styles.gearCapsule} ${styles.gear_cyan}`}
                  onClick={() => {
                    if (onOpenBoosterPublish) onOpenBoosterPublish();
                    else goToModule("/dashboard?action=publish");
                  }}
                >
                  <span
                    className={`${styles.gearSettingsBtn} ${styles.gearStatsBtn}`}
                    role="button"
                    tabIndex={0}
                    title={t.modules.boosterStatsTitle}
                    aria-label={t.modules.boosterStatsTitle}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (onOpenBoosterStats) onOpenBoosterStats();
                      else goToModule("/dashboard?stats=1");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        if (onOpenBoosterStats) onOpenBoosterStats();
                        else goToModule("/dashboard?stats=1");
                      }
                    }}
                  >
                    <span className={styles.gearStatsIcon} aria-hidden="true" />
                  </span>
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>{t.modules.publishTitle}</div>
                    <div className={styles.gearSub}>{t.modules.boosterSub}</div>
                    <div className={styles.gearBtn}>{t.modules.publishCta}</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`${styles.gearCapsule} ${styles.gear_purple}`}
                  onClick={() => goToModule("/dashboard/propulser")}
                >
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>{t.modules.propulserTitle}</div>
                    <div className={styles.gearSub}>{t.modules.propulserSub}</div>
                    <div className={styles.gearBtn}>{t.modules.propulserCta}</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`${styles.gearCapsule} ${styles.gear_purple}`}
                  onClick={() => goToModule("/dashboard/fideliser")}
                >
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>{t.modules.fideliserTitle}</div>
                    <div className={styles.gearSub}>{t.modules.fideliserSub}</div>
                    <div className={styles.gearBtn}>{t.modules.fideliserCta}</div>
                  </div>
                </button>

                <button
                  className={`${styles.gearCapsule} ${styles.gear_orange}`}
                  type="button"
                  onClick={() => setCashModalOpen(true)}
                >
                  <span
                    className={styles.gearSettingsBtn}
                    role="button"
                    tabIndex={0}
                    title={t.modules.cashSettingsTitle}
                    aria-label={t.modules.cashSettingsTitle}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPanel("documents");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        openPanel("documents");
                      }
                    }}
                  >
                    <span className={styles.gearSettingsIcon} aria-hidden="true" />
                  </span>
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>{t.modules.cashTitle}</div>
                    <div className={styles.gearSub}>{t.modules.cashSub}</div>
                    <div className={styles.gearBtn}>{t.modules.cashCta}</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`${styles.gearCapsule} ${styles.gear_pink}`}
                  onClick={() => goToModule("/dashboard/e-reputation")}
                >
                  <div className={styles.gearInner}>
                    <div className={styles.gearTitle}>{t.modules.reputationTitle}</div>
                    <div className={styles.gearSub}>{t.modules.reputationSub}</div>
                    <div className={styles.gearBtn}>{t.modules.reputationCta}</div>
                  </div>
                </button>
              </div>
              {/* --- END --- */}
            </div>
          </div>
        </div>

        {cashModalOpen ? (
          <BaseModal
            title={t.modules.cashModalTitle}
            moduleLabel={t.modules.cashModalLabel}
            compact
            maxWidth={760}
            onClose={closeCashModal}
            headerActions={
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => openPanel("documents")}
                title={t.modules.cashSettingsTitle}
              >
                {t.modules.cashModalSettings}
              </button>
            }
          >
            <div className={styles.cashModalIntro}>
              <strong>{t.modules.cashModalIntroStrong}</strong> {t.modules.cashModalIntroText}
            </div>

            <div className={styles.cashChoiceGrid}>
              <button
                type="button"
                className={`${styles.cashChoiceCard} ${styles.cashChoiceInvoice}`}
                onClick={() => {
                  setCashModalOpen(false);
                  goToModule("/dashboard/factures/new");
                }}
              >
                <span className={styles.cashChoiceEyebrow}>{t.modules.invoiceEyebrow}</span>
                <span className={styles.cashChoiceTitle}>{t.modules.invoiceTitle}</span>
                <span className={styles.cashChoiceText}>{t.modules.invoiceText}</span>
                <span className={styles.cashChoiceCta}>{t.modules.invoiceCta}</span>
              </button>

              <button
                type="button"
                className={`${styles.cashChoiceCard} ${styles.cashChoiceQuote}`}
                onClick={() => {
                  setCashModalOpen(false);
                  goToModule("/dashboard/devis/new");
                }}
              >
                <span className={styles.cashChoiceEyebrow}>{t.modules.quoteEyebrow}</span>
                <span className={styles.cashChoiceTitle}>{t.modules.quoteTitle}</span>
                <span className={styles.cashChoiceText}>{t.modules.quoteText}</span>
                <span className={styles.cashChoiceCta}>{t.modules.quoteCta}</span>
              </button>
            </div>
          </BaseModal>
        ) : null}
    </>

  );
}
