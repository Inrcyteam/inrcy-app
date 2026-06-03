import styles from "../dashboard.module.css";
import DashboardActionButton from "./DashboardActionButton";
import type { ModuleAction, ModuleStatus } from "../dashboard.types";

export type DashboardFluxBubbleData = {
  key: string;
  name: string;
  description: string;
  accent: string;
  logoSrc?: string;
  logoAlt?: string;
  bubbleStatus: ModuleStatus;
  bubbleStatusText: string;
  helpKind?: "site_inrcy" | "site_web";
  onHelpSiteInrcy?: () => void;
  onHelpSiteWeb?: () => void;
  specialViewHref?: string;
  specialViewLabel?: string;
  canViewSpecial?: boolean;
  onSpecialView?: () => void;
  viewAction?: ModuleAction;
  onConfigure: () => void;
  configureDisabled?: boolean;
  configureTitle?: string;
};

type Props = {
  item: DashboardFluxBubbleData;
  itemKey?: string;
};

export default function DashboardFluxBubble({ item, itemKey }: Props) {
  const isComingSoon = item.bubbleStatus === "coming";
  return (
    <article
      key={itemKey ?? item.key}
      className={`${styles.moduleCard} ${styles.moduleBubbleCard} ${styles[`accent_${item.accent}`]} ${isComingSoon ? styles.moduleBubbleCardComingSoon : ""}`}
      title={isComingSoon ? item.configureTitle || "Arrive bientôt" : undefined}
      aria-disabled={isComingSoon}
    >
      <div className={styles.bubbleStack}>
        <div className={`${styles.bubbleLogo} ${item.key === "mails" ? styles.bubbleLogoMail : ""} ${item.key === "inrbadge" ? styles.bubbleLogoProfile : ""}`} aria-hidden>
          <img className={styles.bubbleLogoImg} src={item.logoSrc} alt={item.logoAlt} />
        </div>

        <div className={styles.bubbleTitleRow}>
          <div className={styles.bubbleTitle}>{item.name}</div>
        </div>

        <div className={styles.bubbleStatusCompact}>
          <span
            className={[
              styles.statusDot,
              item.bubbleStatus === "connected"
                ? styles.dotConnected
                : item.bubbleStatus === "available"
                  ? styles.dotAvailable
                  : styles.dotComing,
            ].join(" ")}
            aria-hidden
          />
          <span className={styles.bubbleStatusText}>{item.bubbleStatusText}</span>
        </div>

        <div className={styles.bubbleTagline}>{item.description}</div>

        <div className={styles.bubbleActions}>
          {item.onSpecialView && item.specialViewLabel ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionView}`}
              onClick={item.onSpecialView}
              disabled={!item.canViewSpecial}
              aria-disabled={!item.canViewSpecial}
              style={{ opacity: !item.canViewSpecial ? 0.5 : 1, pointerEvents: !item.canViewSpecial ? "none" : "auto" }}
            >
              {item.specialViewLabel}
            </button>
          ) : item.specialViewHref && item.specialViewLabel ? (
            <a
              href={item.canViewSpecial ? item.specialViewHref : "#"}
              className={`${styles.actionBtn} ${styles.actionView}`}
              target={item.canViewSpecial ? "_blank" : undefined}
              rel="noreferrer"
              aria-disabled={!item.canViewSpecial}
              style={{ opacity: !item.canViewSpecial ? 0.5 : 1, pointerEvents: !item.canViewSpecial ? "none" : "auto" }}
            >
              {item.specialViewLabel}
            </a>
          ) : item.viewAction ? (
            <DashboardActionButton action={item.viewAction} />
          ) : (
            <button className={`${styles.actionBtn} ${styles.actionView}`} type="button">
              Voir
            </button>
          )}

          <button
            className={`${styles.actionBtn} ${styles.connectBtn} ${styles.actionMain}`}
            type="button"
            onClick={item.onConfigure}
            disabled={item.configureDisabled}
            title={item.configureTitle}
          >
            {"Configurer"}
          </button>
        </div>
      </div>

      <div className={styles.moduleGlow} aria-hidden />
    </article>
  );
}
