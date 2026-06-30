"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import styles from "../dashboard.module.css";
import HelpButton from "./HelpButton";
import DashboardFluxBubble, { type DashboardFluxBubbleData } from "./DashboardFluxBubble";
import DashboardModulesCard from "./DashboardModulesCard";

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
  | "tiktok"
  | "youtube_shorts"
  | "pinterest"
  | "inr_agent"
  | "legal"
  | "rgpd"
  | "inertie"
  | "boutique"
  | "notifications"
  | "parrainage"
  | "documents";

type BubbleViewMode = "list" | "carousel";

type ChannelPillTone = "connected" | "available" | "warning";

const SITE_CHANNEL_KEYS = new Set(["site_inrcy", "site_web"]);

function getChannelPillLabel(item: DashboardFluxBubbleData) {
  if (!SITE_CHANNEL_KEYS.has(item.key)) return item.name;

  const progressMatch = item.bubbleStatusText.match(/(\d\/3)/);
  return progressMatch ? `${item.name} ${progressMatch[1]}` : item.name;
}

function getChannelPillTone(item: DashboardFluxBubbleData): ChannelPillTone {
  const normalizedStatusText = item.bubbleStatusText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalizedStatusText.includes("reconnect") ||
    normalizedStatusText.includes("expire") ||
    normalizedStatusText.includes("token") ||
    normalizedStatusText.includes("attention")
  ) {
    return "warning";
  }

  return item.bubbleStatus === "connected" ? "connected" : "available";
}

type DashboardChannelsSectionProps = {
  fluxBubbleItems: DashboardFluxBubbleData[];
  goToModule: (path: string) => void;
  openPanel: (panel: DashboardPanelName) => void;
  onOpenChannelsHelp: () => void;
  onOpenStats?: () => void;
  onOpenBoosterPublish?: () => void;
  onOpenBoosterStats?: () => void;
};

export default function DashboardChannelsSection({
  fluxBubbleItems,
  goToModule,
  openPanel,
  onOpenChannelsHelp,
  onOpenStats,
  onOpenBoosterPublish,
  onOpenBoosterStats,
}: DashboardChannelsSectionProps) {
  const [bubbleView, setBubbleView] = useState<BubbleViewMode>("carousel");
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [carouselTransition, setCarouselTransition] = useState(true);
  const [activeChannelIndex, setActiveChannelIndex] = useState(0);
  const isAnimating = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const [dragPx, setDragPx] = useState(0);
  const desktopPointerStartX = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 560px)");
    const update = () => setIsMobile(mq.matches);
    update();

    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobile === null) return;

    if (!isMobile) {
      return;
    }

    const saved = window.localStorage.getItem("inrcy_bubble_view_mobile");

    if (saved === "list" || saved === "carousel") {
      setBubbleView(saved);
    } else {
      setBubbleView("carousel");
    }
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobile) return;

    window.localStorage.setItem("inrcy_bubble_view_mobile", bubbleView);
  }, [bubbleView, isMobile]);

  const getStatusDotClassName = (item: DashboardFluxBubbleData) => [
    styles.statusDot,
    item.bubbleStatus === "connected"
      ? styles.dotConnected
      : item.bubbleStatus === "available"
        ? styles.dotAvailable
        : styles.dotComing,
  ].join(" ");

  const renderFluxBubble = (item: DashboardFluxBubbleData, keyOverride?: string) => (
    <DashboardFluxBubble key={keyOverride ?? item.key} item={item} itemKey={keyOverride ?? item.key} />
  );

  const renderDesktopSideBubble = (item: DashboardFluxBubbleData, keyOverride?: string) => {
    const isComingSoon = item.bubbleStatus === "coming";

    return (
    <article
      key={keyOverride ?? item.key}
      className={`${styles.moduleCard} ${styles.moduleBubbleCard} ${styles.desktopSideBubbleCard} ${styles[`accent_${item.accent}`]} ${isComingSoon ? styles.moduleBubbleCardComingSoon : ""}`}
      title={isComingSoon ? item.configureTitle || "Option désactivée" : undefined}
      aria-hidden
    >
      <div className={styles.desktopSideBubbleStack}>
        <div className={`${styles.bubbleLogo} ${item.key === "mails" ? styles.bubbleLogoMail : ""} ${item.key === "inrbadge" ? styles.bubbleLogoProfile : ""} ${item.key === "youtube_shorts" ? styles.bubbleLogoYoutube : ""} ${item.key === "pinterest" ? styles.bubbleLogoPinterest : ""}`}>
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

        <div className={styles.desktopSideBubbleTitle}>{item.name}</div>

        <div className={styles.bubbleStatusCompact}>
          <span className={getStatusDotClassName(item)} aria-hidden />
          <span className={styles.bubbleStatusText}>{item.bubbleStatusText}</span>
        </div>

        <div className={styles.desktopSideBubbleTagline}>{item.description}</div>
      </div>

      <div className={styles.moduleGlow} aria-hidden />
    </article>
    );
  };

  const baseModules = fluxBubbleItems;
  const hasCarousel = baseModules.length > 1;
  const carouselItems = hasCarousel
    ? [baseModules[baseModules.length - 1], ...baseModules, baseModules[0]]
    : baseModules;

  const connectedChannelsCount = useMemo(
    () => baseModules.filter((item) => getChannelPillTone(item) === "connected").length,
    [baseModules],
  );

  const channelPillRows = useMemo(() => {
    if (baseModules.length <= 7) return [baseModules];
    const firstRowCount = baseModules.length >= 11 ? 7 : Math.ceil(baseModules.length / 2);
    return [baseModules.slice(0, firstRowCount), baseModules.slice(firstRowCount)].filter((row) => row.length > 0);
  }, [baseModules]);

  const normalizeIndex = useCallback((index: number) => {
    if (!baseModules.length) return 0;
    return ((index % baseModules.length) + baseModules.length) % baseModules.length;
  }, [baseModules.length]);

  const desktopPrevIndex = normalizeIndex(activeChannelIndex - 1);
  const desktopNextIndex = normalizeIndex(activeChannelIndex + 1);
  const desktopActiveItem = baseModules[normalizeIndex(activeChannelIndex)] ?? null;
  const desktopPrevItem = baseModules[desktopPrevIndex] ?? null;
  const desktopNextItem = baseModules[desktopNextIndex] ?? null;

  const goPrevDesktop = useCallback(() => {
    setActiveChannelIndex((index) => normalizeIndex(index - 1));
  }, [normalizeIndex]);

  const goNextDesktop = useCallback(() => {
    setActiveChannelIndex((index) => normalizeIndex(index + 1));
  }, [normalizeIndex]);

  const goPrev = useCallback(() => {
    if (!hasCarousel) return;
    if (isAnimating.current) return;
    isAnimating.current = true;
    setCarouselIndex((i) => i - 1);
  }, [hasCarousel]);

  const goNext = useCallback(() => {
    if (!hasCarousel) return;
    if (isAnimating.current) return;
    isAnimating.current = true;
    setCarouselIndex((i) => i + 1);
  }, [hasCarousel]);

  useEffect(() => {
    if (!isMobile) return;
    if (bubbleView !== "carousel") return;

    setCarouselTransition(false);
    setCarouselIndex(1);
    setDragPx(0);

    const id = window.setTimeout(() => setCarouselTransition(true), 0);
    return () => window.clearTimeout(id);
  }, [bubbleView, isMobile]);

  const onCarouselTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!hasCarousel) return;
    if (isAnimating.current) return;
    touchStartX.current = e.touches[0]?.clientX ?? null;
    isDragging.current = true;
    setCarouselTransition(false);
    setDragPx(0);
  };

  const onCarouselTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!hasCarousel) return;
    if (!isDragging.current || touchStartX.current == null) return;

    const x = e.touches[0]?.clientX ?? 0;
    setDragPx(x - touchStartX.current);
  };

  const onCarouselTouchEnd = () => {
    if (!hasCarousel) return;

    const dx = dragPx;
    isDragging.current = false;
    touchStartX.current = null;

    setCarouselTransition(true);
    setDragPx(0);

    if (Math.abs(dx) < 60) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const onCarouselTransitionEnd = () => {
    if (!hasCarousel) return;
    if (isDragging.current) return;

    const lastReal = baseModules.length;

    if (carouselIndex === 0) {
      setCarouselTransition(false);
      setCarouselIndex(lastReal);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCarouselTransition(true);
          isAnimating.current = false;
        });
      });
      return;
    }

    if (carouselIndex === lastReal + 1) {
      setCarouselTransition(false);
      setCarouselIndex(1);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCarouselTransition(true);
          isAnimating.current = false;
        });
      });
      return;
    }

    isAnimating.current = false;
  };

  useEffect(() => {
    if (!baseModules.length) return;

    setActiveChannelIndex((index) => normalizeIndex(index));
  }, [baseModules.length, normalizeIndex]);

  useEffect(() => {
    if (!hasCarousel) return;
    const lastReal = baseModules.length;

    if (carouselIndex < 0) {
      setCarouselTransition(false);
      setCarouselIndex(lastReal);
      requestAnimationFrame(() => requestAnimationFrame(() => setCarouselTransition(true)));
      isAnimating.current = false;
    } else if (carouselIndex > lastReal + 1) {
      setCarouselTransition(false);
      setCarouselIndex(1);
      requestAnimationFrame(() => requestAnimationFrame(() => setCarouselTransition(true)));
      isAnimating.current = false;
    }
  }, [carouselIndex, baseModules.length, hasCarousel]);

  const activeDot = hasCarousel
    ? (((carouselIndex - 1) % baseModules.length) + baseModules.length) % baseModules.length
    : 0;

  const onDesktopPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button,a")) return;
    desktopPointerStartX.current = e.clientX;
  };

  const onDesktopPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (desktopPointerStartX.current === null) return;

    const dx = e.clientX - desktopPointerStartX.current;
    desktopPointerStartX.current = null;

    if (Math.abs(dx) < 58) return;
    if (dx < 0) goNextDesktop();
    else goPrevDesktop();
  };

  const onDesktopPointerCancel = () => {
    desktopPointerStartX.current = null;
  };

  const showDesktopRightSide = hasCarousel && desktopNextIndex !== desktopPrevIndex;

  return (
    <section className={styles.contentFull}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadTop}>
          <div className={styles.channelTitleCluster}>
            <h2 className={styles.h2}>Canaux</h2>
            <HelpButton onClick={onOpenChannelsHelp} title="Aide : Canaux" />
          </div>


          <div className={styles.channelHeaderActions}>
            <div className={styles.channelSummaryBadge}>
              {connectedChannelsCount} connectés / {baseModules.length} disponibles
            </div>

            <div className={styles.mobileViewToggle} aria-label="Affichage des canaux">
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${bubbleView === "list" ? styles.viewToggleActive : ""}`}
                onClick={() => setBubbleView("list")}
              >
                Liste
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${bubbleView === "carousel" ? styles.viewToggleActive : ""}`}
                onClick={() => setBubbleView("carousel")}
              >
                Carrousel
              </button>
            </div>
          </div>
        </div>


        <div className={styles.channelPillRail} aria-label="Liste des canaux">
          {channelPillRows.map((row, rowIndex) => (
            <div className={styles.channelPillRow} key={`channel-row-${rowIndex}`}>
              {row.map((item) => {
                const index = baseModules.findIndex((entry) => entry.key === item.key);
                const tone = getChannelPillTone(item);
                const isActive = index === normalizeIndex(activeChannelIndex);

                return (
                  <button
                    type="button"
                    key={item.key}
                    className={[
                      styles.channelPill,
                      tone === "connected" ? styles.channelPillConnected : tone === "warning" ? styles.channelPillWarning : styles.channelPillAvailable,
                      isActive ? styles.channelPillActive : "",
                    ].join(" ")}
                    onClick={() => {
                      setActiveChannelIndex(index);
                      if (isMobile) {
                        setCarouselTransition(true);
                        setCarouselIndex(index + 1);
                      }
                    }}
                    aria-pressed={isActive}
                  >
                    <span className={styles.channelPillDot} aria-hidden />
                    <span>{getChannelPillLabel(item)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {isMobile && bubbleView === "carousel" ? (
        <>
          <div
            className={styles.mobileCarousel}
            ref={carouselRef}
            onTouchStart={onCarouselTouchStart}
            onTouchMove={onCarouselTouchMove}
            onTouchEnd={onCarouselTouchEnd}
          >
            <div
              className={styles.carouselTrack}
              style={{
                transform: `translateX(calc(-${carouselIndex * 100}% + ${dragPx}px))`,
                transition: carouselTransition ? "transform 260ms ease" : "none",
              }}
              onTransitionEnd={onCarouselTransitionEnd}
            >
              {carouselItems.map((item, idx) => (
                <div className={styles.carouselSlide} key={`${item.key}_${idx}`}>
                  {renderFluxBubble(item, `${item.key}_${idx}`)}
                </div>
              ))}
            </div>
          </div>

          {hasCarousel && (
            <div className={styles.carouselNavWrap}>
              <div className={styles.carouselNav} aria-label="Position dans le carrousel">
                <button
                  type="button"
                  className={styles.carouselArrow}
                  onClick={goPrev}
                  aria-label="Canal précédent"
                >
                  <span aria-hidden="true">&lt;</span>
                </button>

                <div className={styles.carouselIconRail}>
                  {baseModules.map((item, i) => {
                    const tone = getChannelPillTone(item);

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={[
                          styles.carouselIconBtn,
                          i === activeDot ? styles.carouselIconBtnActive : "",
                          tone === "connected"
                            ? styles.carouselIconBtnConnected
                            : tone === "warning"
                              ? styles.carouselIconBtnWarning
                              : styles.carouselIconBtnAvailable,
                        ].join(" ")}
                        onClick={() => {
                          if (isAnimating.current) return;
                          isAnimating.current = true;
                          setCarouselTransition(true);
                          setCarouselIndex(i + 1);
                        }}
                        aria-label={`Aller au canal ${item.name}`}
                        aria-pressed={i === activeDot}
                        title={item.name}
                      >
                        <img className={styles.carouselIconImg} src={item.logoSrc} alt="" aria-hidden />
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className={styles.carouselArrow}
                  onClick={goNext}
                  aria-label="Canal suivant"
                >
                  <span aria-hidden="true">&gt;</span>
                </button>
              </div>

              <div className={styles.mobileChannelSummary} aria-label={`${connectedChannelsCount} canaux connectés sur ${baseModules.length}`}>
                {connectedChannelsCount}/{baseModules.length} connectés
              </div>
            </div>
          )}
        </>
      ) : isMobile && bubbleView === "list" ? (
        <>
          <div className={styles.moduleGrid}>
            {fluxBubbleItems.map((item) => renderFluxBubble(item, item.key))}
          </div>

          <div className={styles.mobileChannelSummary} aria-label={`${connectedChannelsCount} canaux connectés sur ${baseModules.length}`}>
            {connectedChannelsCount}/{baseModules.length} connectés
          </div>
        </>
      ) : (
        <>
          <div
            className={styles.desktopChannelsCarousel}
            aria-label="Carrousel des canaux"
          >
            {hasCarousel && (
              <button
                type="button"
                className={`${styles.desktopChannelArrow} ${styles.desktopChannelArrowLeft}`}
                onClick={goPrevDesktop}
                aria-label="Canal précédent"
              >
                <span aria-hidden="true">&lt;</span>
              </button>
            )}

            <div
              className={styles.desktopCoverflowStage}
              onPointerDown={onDesktopPointerDown}
              onPointerUp={onDesktopPointerUp}
              onPointerCancel={onDesktopPointerCancel}
              onPointerLeave={onDesktopPointerCancel}
            >
              {hasCarousel && desktopPrevItem && (
                <div
                  className={`${styles.desktopCoverflowItem} ${styles.desktopCoverflowSide} ${styles.desktopCoverflowLeft}`}
                  role="button"
                  tabIndex={0}
                  onClick={goPrevDesktop}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      goPrevDesktop();
                    }
                  }}
                  aria-label={`Afficher ${desktopPrevItem.name}`}
                >
                  {renderDesktopSideBubble(desktopPrevItem, `${desktopPrevItem.key}_desktop_prev`)}
                </div>
              )}

              {desktopActiveItem && (
                <div className={`${styles.desktopCoverflowItem} ${styles.desktopCoverflowCenter}`}>
                  {renderFluxBubble(desktopActiveItem, `${desktopActiveItem.key}_desktop_active`)}
                </div>
              )}

              {showDesktopRightSide && desktopNextItem && (
                <div
                  className={`${styles.desktopCoverflowItem} ${styles.desktopCoverflowSide} ${styles.desktopCoverflowRight}`}
                  role="button"
                  tabIndex={0}
                  onClick={goNextDesktop}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      goNextDesktop();
                    }
                  }}
                  aria-label={`Afficher ${desktopNextItem.name}`}
                >
                  {renderDesktopSideBubble(desktopNextItem, `${desktopNextItem.key}_desktop_next`)}
                </div>
              )}
            </div>

            {hasCarousel && (
              <button
                type="button"
                className={`${styles.desktopChannelArrow} ${styles.desktopChannelArrowRight}`}
                onClick={goNextDesktop}
                aria-label="Canal suivant"
              >
                <span aria-hidden="true">&gt;</span>
              </button>
            )}
          </div>

          {hasCarousel && (
            <div className={styles.desktopChannelDots} aria-label="Position dans les canaux">
              {baseModules.map((item, index) => (
                <button
                  type="button"
                  key={item.key}
                  className={`${styles.carouselDot} ${index === normalizeIndex(activeChannelIndex) ? styles.carouselDotActive : ""}`}
                  onClick={() => setActiveChannelIndex(index)}
                  aria-label={`Afficher ${item.name}`}
                />
              ))}
            </div>
          )}
        </>
      )}

      <DashboardModulesCard
        goToModule={goToModule}
        openPanel={openPanel}
        onOpenStats={onOpenStats}
        onOpenBoosterPublish={onOpenBoosterPublish}
        onOpenBoosterStats={onOpenBoosterStats}
      />
    </section>
  );
}
