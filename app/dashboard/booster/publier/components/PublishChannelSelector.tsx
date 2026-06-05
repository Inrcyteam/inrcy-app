import type { Dispatch, SetStateAction } from "react";
import {
  CHANNEL_LABELS,
  type ChannelKey,
} from "../publishModal.shared";
import {
  channelBtn,
  channelBtnDisabled,
} from "../publishModal.styles";

type PublishModalStyles = Readonly<Record<string, string>>;

type ChannelDetailInfo = {
  href: string | null;
  desktopLabel: string;
  mobileLabel: string;
  fullLabel: string;
};

type PublishChannelSelectorProps = {
  styles: PublishModalStyles;
  isMobile: boolean;
  connected: Record<ChannelKey, boolean>;
  channels: Record<ChannelKey, boolean>;
  channelInfoOpen: ChannelKey | null;
  setChannelInfoOpen: Dispatch<SetStateAction<ChannelKey | null>>;
  toggle: (key: ChannelKey) => void;
  getChannelDetailInfo: (key: ChannelKey) => ChannelDetailInfo | null;
};

const CHANNEL_ICON_SRC: Record<ChannelKey, string> = {
  inrcy_site: "/icons/inrcy.png",
  site_web: "/icons/site-web.jpg",
  gmb: "/icons/google.jpg",
  facebook: "/icons/facebook.png",
  instagram: "/icons/instagram.jpg",
  linkedin: "/icons/linkedin.png",
  tiktok: "/icons/tiktok.png",
  youtube_shorts: "/icons/youtube-shorts.png",
};

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path
        d="M10.6 13.4a3 3 0 0 0 4.24 0l3.18-3.18a3 3 0 1 0-4.24-4.24l-1.41 1.41M13.4 10.6a3 3 0 0 0-4.24 0l-3.18 3.18a3 3 0 1 0 4.24 4.24l1.41-1.41"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PublishChannelSelector({
  styles,
  isMobile,
  connected,
  channels,
  channelInfoOpen,
  setChannelInfoOpen,
  toggle,
  getChannelDetailInfo,
}: PublishChannelSelectorProps) {
  const channelKeys = Object.keys(CHANNEL_LABELS) as ChannelKey[];

  return (
    <div
      className={styles.blockCard}
      style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
    >
      <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
        Canaux
      </div>
      <div className={styles.subtitle} style={{ marginBottom: isMobile ? 10 : 8 }}>
        iNrCy publie une version adaptée sur chaque canal sélectionné.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "repeat(2, minmax(0, 1fr))"
            : `repeat(${channelKeys.length}, minmax(0, 1fr))`,
          gap: isMobile ? 8 : 6,
          alignItems: "stretch",
        }}
      >
        {channelKeys.map((key, index) => {
          const info = getChannelDetailInfo(key);
          const isConnected = connected[key];
          const isSelected = channels[key] && isConnected;
          const isInfoVisible = channelInfoOpen === key && !!info;
          const isLastOddMobileItem = isMobile && index === channelKeys.length - 1 && channelKeys.length % 2 === 1;

          if (isMobile) {
            return (
              <div
                key={key}
                onClick={() => toggle(key)}
                role="button"
                tabIndex={isConnected ? 0 : -1}
                aria-disabled={!isConnected}
                aria-pressed={isSelected}
                onKeyDown={(event) => {
                  if (!isConnected) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(key);
                  }
                }}
                style={{
                  ...channelBtn,
                  ...(!isConnected ? channelBtnDisabled : {}),
                  minHeight: 43,
                  padding: "8px 8px",
                  position: "relative",
                  overflow: "visible",
                  border: isSelected
                    ? "1px solid rgba(56,189,248,0.82)"
                    : "1px solid rgba(255,255,255,0.12)",
                  boxShadow: isSelected
                    ? "0 0 0 1px rgba(56,189,248,0.26) inset, 0 10px 24px rgba(14,165,233,0.12)"
                    : "none",
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(56,189,248,0.22), rgba(14,116,144,0.20))"
                    : "rgba(255,255,255,0.04)",
                  cursor: isConnected ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 7,
                  ...(isLastOddMobileItem
                    ? {
                        gridColumn: "1 / -1",
                        width: "calc(50% - 4px)",
                        justifySelf: "center",
                      }
                    : {}),
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: 850,
                    fontSize: 12.4,
                    lineHeight: 1.1,
                    letterSpacing: "-0.025em",
                    color: isConnected
                      ? "rgba(255,255,255,0.97)"
                      : "rgba(255,255,255,0.48)",
                  }}
                >
                  {CHANNEL_LABELS[key]}
                </span>
                <button
                  type="button"
                  aria-label={
                    info
                      ? `Voir les détails de ${CHANNEL_LABELS[key]}`
                      : `${CHANNEL_LABELS[key]} ${isConnected ? "connecté" : "non connecté"}`
                  }
                  title={
                    info
                      ? `Voir les détails de ${CHANNEL_LABELS[key]}`
                      : isConnected
                        ? "Canal connecté"
                        : "Canal non connecté"
                  }
                  disabled={!info}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!info) return;
                    setChannelInfoOpen((prev) =>
                      prev === key ? null : key,
                    );
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: isConnected
                      ? "1px solid rgba(134,239,172,0.58)"
                      : "1px solid rgba(255,255,255,0.12)",
                    background: isConnected
                      ? "linear-gradient(180deg, rgba(34,197,94,0.96), rgba(22,163,74,0.96))"
                      : "rgba(255,255,255,0.08)",
                    color: isConnected ? "#ffffff" : "rgba(255,255,255,0.46)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    cursor: info ? "pointer" : "default",
                    opacity: isConnected ? 1 : 0.6,
                    boxShadow: isConnected
                      ? "0 0 0 1px rgba(255,255,255,0.10) inset, 0 8px 18px rgba(34,197,94,0.34)"
                      : "none",
                  }}
                >
                  <LinkIcon />
                </button>
                {isInfoVisible && info ? (
                  <div
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      position: "absolute",
                      top: "50%",
                      right: 36,
                      transform: "translateY(-50%)",
                      zIndex: 20,
                      maxWidth: "min(200px, calc(100% - 54px))",
                      borderRadius: 999,
                      padding: "8px 12px",
                      background: "rgba(9,16,31,0.96)",
                      border: "1px solid rgba(148,163,184,0.22)",
                      boxShadow: "0 18px 40px rgba(0,0,0,0.34)",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.35,
                        color: "rgba(255,255,255,0.92)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {info.mobileLabel}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <div
              key={key}
              onClick={() => toggle(key)}
              role="button"
              tabIndex={isConnected ? 0 : -1}
              aria-disabled={!isConnected}
              aria-pressed={isSelected}
              title={info?.fullLabel || `${CHANNEL_LABELS[key]} ${isConnected ? "connecté" : "non connecté"}`}
              onMouseEnter={() => {
                if (info) setChannelInfoOpen(key);
              }}
              onMouseLeave={() => {
                if (info) setChannelInfoOpen((prev) => (prev === key ? null : prev));
              }}
              onFocus={() => {
                if (info) setChannelInfoOpen(key);
              }}
              onBlur={() => {
                if (info) setChannelInfoOpen((prev) => (prev === key ? null : prev));
              }}
              onKeyDown={(event) => {
                if (!isConnected) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(key);
                }
              }}
              style={{
                ...(!isConnected ? channelBtnDisabled : {}),
                minHeight: 48,
                minWidth: 0,
                padding: "6px 6px",
                position: "relative",
                overflow: "visible",
                borderRadius: 16,
                border: isSelected
                  ? "2px solid rgba(76,195,255,0.88)"
                  : "1px solid rgba(255,255,255,0.10)",
                boxShadow: isSelected
                  ? "0 0 0 1px rgba(76,195,255,0.28) inset, 0 0 18px rgba(76,195,255,0.18), 0 10px 24px rgba(8,18,34,0.16)"
                  : "none",
                background: isSelected
                  ? "linear-gradient(135deg, rgba(76,195,255,0.16), rgba(34,211,238,0.08))"
                  : "rgba(255,255,255,0.03)",
                cursor: isConnected ? "pointer" : "not-allowed",
                display: "grid",
                placeItems: "center",
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: isConnected ? "#43d17d" : "#ff6b7d",
                  boxShadow: isConnected
                    ? "0 0 12px rgba(67,209,125,0.45)"
                    : "0 0 12px rgba(255,107,125,0.25)",
                }}
              />
              {isSelected ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 7,
                    left: 7,
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: "inline-grid",
                    placeItems: "center",
                    background: "rgba(76,195,255,0.92)",
                    color: "#07111f",
                    fontSize: 12,
                    fontWeight: 950,
                    lineHeight: 1,
                  }}
                >
                  ✓
                </span>
              ) : null}
              <img
                src={CHANNEL_ICON_SRC[key]}
                alt=""
                aria-hidden="true"
                loading="eager"
                decoding="sync"
                fetchPriority="high"
                style={{
                  width: key === "site_web" ? 27 : 29,
                  height: key === "site_web" ? 27 : 29,
                  borderRadius: key === "site_web" ? 9 : 999,
                  objectFit: "cover",
                  opacity: isConnected ? 1 : 0.48,
                  filter: isConnected ? undefined : "grayscale(0.7)",
                  boxShadow: isSelected ? "0 0 18px rgba(76,195,255,0.24)" : undefined,
                }}
              />
              {isInfoVisible && info ? (
                <div
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 40,
                    width: 230,
                    maxWidth: "min(230px, 80vw)",
                    borderRadius: 14,
                    padding: "9px 11px",
                    background: "rgba(9,16,31,0.98)",
                    border: "1px solid rgba(148,163,184,0.24)",
                    boxShadow: "0 18px 44px rgba(0,0,0,0.40)",
                    textAlign: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 950, color: "rgba(255,255,255,0.96)", marginBottom: 2 }}>
                    {CHANNEL_LABELS[key]}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.35,
                      color: "rgba(255,255,255,0.76)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {info.desktopLabel}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
