"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import styles from "../dashboard.module.css";
import HelpButton from "./HelpButton";
import DashboardFluxBubble, { type DashboardFluxBubbleData } from "./DashboardFluxBubble";
import DashboardModulesCard from "./DashboardModulesCard";

type DashboardPanelName =
  | "contact"
  | "profil"
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
  | "facebook"
  | "legal"
  | "rgpd"
  | "inertie"
  | "boutique"
  | "notifications"
  | "parrainage";

type BubbleViewMode = "list" | "carousel";

type DashboardChannelsSectionProps = {
  fluxBubbleItems: DashboardFluxBubbleData[];
  goToModule: (path: string) => void;
  openPanel: (panel: DashboardPanelName) => void;
  onOpenChannelsHelp: () => void;
};

export default function DashboardChannelsSection({
  fluxBubbleItems,
  goToModule,
  openPanel,
  onOpenChannelsHelp,
}: DashboardChannelsSectionProps) {
  const [bubbleView, setBubbleView] = useState<BubbleViewMode>("list");
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [carouselTransition, setCarouselTransition] = useState(true);
  const isAnimating = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const [dragPx, setDragPx] = useState(0);

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
    const saved = window.localStorage.getItem("inrcy_bubble_view");
    if (saved === "list" || saved === "carousel") setBubbleView(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobile === null) return;

    if (isMobile === false) {
      setBubbleView("list");
      return;
    }

    window.localStorage.setItem("inrcy_bubble_view", bubbleView);
  }, [bubbleView, isMobile]);

  const renderFluxBubble = (item: DashboardFluxBubbleData, keyOverride?: string) => (
    <DashboardFluxBubble key={keyOverride ?? item.key} item={item} itemKey={keyOverride ?? item.key} />
  );

  const baseModules = fluxBubbleItems;
  const hasCarousel = baseModules.length > 1;
  const carouselItems = hasCarousel
    ? [baseModules[baseModules.length - 1], ...baseModules, baseModules[0]]
    : baseModules;

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

  return (
    <section className={styles.contentFull}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadTop}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className={styles.h2} style={{ margin: 0 }}>Canaux</h2>
            <HelpButton onClick={onOpenChannelsHelp} title="Aide : Canaux" />
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

        <p className={styles.h2Sub}>Votre autoroute de contacts entrants</p>
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
            <div className={styles.carouselDots} aria-label="Position dans le carrousel">
              {baseModules.map((_, i) => (
                <span
                  key={i}
                  className={`${styles.carouselDot} ${i === activeDot ? styles.carouselDotActive : ""}`}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className={styles.moduleGrid}>
          {fluxBubbleItems.map((item) => renderFluxBubble(item, item.key))}
        </div>
      )}

      <DashboardModulesCard goToModule={goToModule} openPanel={openPanel} />
    </section>
  );
}
