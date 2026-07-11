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
  configureLabel?: string;
  viewFallbackLabel?: string;
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
      title={isComingSoon ? item.configureTitle || item.configureLabel || "Option désactivée" : undefined}
    >
      <div className={styles.bubbleStack}>
        <div className={`${styles.bubbleLogo} ${item.key === "mails" ? styles.bubbleLogoMail : ""} ${item.key === "inrbadge" ? styles.bubbleLogoProfile : ""} ${item.key === "inr_agent" ? styles.bubbleLogoAgent : ""} ${item.key === "youtube_shorts" ? styles.bubbleLogoYoutube : ""} ${item.key === "pinterest" ? styles.bubbleLogoPinterest : ""} ${item.key === "inr_search" ? styles.bubbleLogoInrSearch : ""}`} aria-hidden>
          <img
            className={styles.bubbleLogoImg}
            src={item.logoSrc}
            alt={item.logoAlt}
            width={96}
            height={96}
            loading="eager"
            decoding="sync"
            fetchPriority="high"
          />
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
              target={item.canViewSpecial && /^https?:\/\//.test(item.specialViewHref) ? "_blank" : undefined}
              rel={item.canViewSpecial && /^https?:\/\//.test(item.specialViewHref) ? "noreferrer" : undefined}
              aria-disabled={!item.canViewSpecial}
              style={{ opacity: !item.canViewSpecial ? 0.5 : 1, pointerEvents: !item.canViewSpecial ? "none" : "auto" }}
            >
              {item.specialViewLabel}
            </a>
          ) : item.viewAction ? (
            <DashboardActionButton action={item.viewAction} />
          ) : (
            <button className={`${styles.actionBtn} ${styles.actionView}`} type="button" disabled>
              {item.viewFallbackLabel || "Voir"}
            </button>
          )}

          <button
            className={`${styles.actionBtn} ${styles.connectBtn} ${styles.actionMain}`}
            type="button"
            onClick={item.onConfigure}
            disabled={item.configureDisabled}
            title={item.configureTitle}
          >
            {item.configureLabel || "Configurer"}
          </button>
        </div>
      </div>

      <div className={styles.moduleGlow} aria-hidden />
    </article>
  );
}
