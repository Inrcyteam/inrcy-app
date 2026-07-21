import styles from "../dashboard.module.css";
import bubbleStyles from "./DashboardChannelBubble.module.css";
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
      className={`${bubbleStyles.card} ${styles[`accent_${item.accent}`]} ${isComingSoon ? bubbleStyles.comingSoon : ""}`}
      title={isComingSoon ? item.configureTitle || item.configureLabel || "Option désactivée" : undefined}
    >
      <div className={bubbleStyles.stack}>
        <div className={bubbleStyles.logo} aria-hidden>
          <img
            className={bubbleStyles.logoImage}
            src={item.logoSrc}
            alt={item.logoAlt}
            width={96}
            height={96}
            loading="eager"
            decoding="sync"
            fetchPriority="high"
          />
        </div>

        <div className={bubbleStyles.title}>{item.name}</div>

        <div className={bubbleStyles.status}>
          <span
            className={[
              bubbleStyles.dot,
              item.bubbleStatus === "connected"
                ? bubbleStyles.connected
                : item.bubbleStatus === "available"
                  ? bubbleStyles.available
                  : bubbleStyles.coming,
            ].join(" ")}
            aria-hidden
          />
          <span className={bubbleStyles.statusText}>{item.bubbleStatusText}</span>
        </div>

        <div className={bubbleStyles.tagline} title={item.description}>{item.description}</div>

        <div className={bubbleStyles.actions}>
          {item.onSpecialView && item.specialViewLabel ? (
            <button
              type="button"
              className={bubbleStyles.action}
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
              className={bubbleStyles.action}
              target={item.canViewSpecial && /^https?:\/\//.test(item.specialViewHref) ? "_blank" : undefined}
              rel={item.canViewSpecial && /^https?:\/\//.test(item.specialViewHref) ? "noreferrer" : undefined}
              aria-disabled={!item.canViewSpecial}
              style={{ opacity: !item.canViewSpecial ? 0.5 : 1, pointerEvents: !item.canViewSpecial ? "none" : "auto" }}
            >
              {item.specialViewLabel}
            </a>
          ) : item.viewAction ? (
            <DashboardActionButton action={item.viewAction} className={bubbleStyles.action} />
          ) : (
            <button className={bubbleStyles.action} type="button" disabled>
              {item.viewFallbackLabel || "Voir"}
            </button>
          )}

          <button
            className={`${bubbleStyles.action} ${bubbleStyles.actionMain}`}
            type="button"
            onClick={item.onConfigure}
            disabled={item.configureDisabled}
            title={item.configureTitle}
          >
            {item.configureLabel || "Configurer"}
          </button>
        </div>
      </div>
    </article>
  );
}
