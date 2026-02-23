"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./orientationGuard.module.css";
import { usePathname } from "next/navigation";

export default function OrientationGuard() {
  const pathname = usePathname();

  // ✅ Mobile + tablette uniquement (≤ 1024px)
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  const landscapeRoutes = useMemo(
    () => ["/dashboard/factures", "/dashboard/devis", "/dashboard/crm"],
    []
  );

  const mustBeLandscape = landscapeRoutes.some((r) =>
    pathname?.startsWith(r)
  );

  useEffect(() => {
    const check = () => {
      const isSmallScreen = window.innerWidth <= 1024;

      setIsMobileOrTablet(isSmallScreen);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);

    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // ✅ Desktop large → jamais d’overlay
  if (!isMobileOrTablet) return null;

  const showLandscapeBlock = mustBeLandscape && !isLandscape;
  const showPortraitBlock = !mustBeLandscape && isLandscape;

  if (!showLandscapeBlock && !showPortraitBlock) return null;

  const title = showLandscapeBlock
    ? "Passe en mode paysage"
    : "Revenez en mode portrait";

  const subtitle = showLandscapeBlock
    ? "Pour une meilleure lisibilité de ce module."
    : "Pour une meilleure expérience, l’app fonctionne en vertical.";

  const badge = showLandscapeBlock ? "Paysage requis" : "Portrait requis";

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.brand}>
            <span aria-hidden>⚡</span>
            <span>iNrCy</span>
          </div>
          <span className={styles.badge}>{badge}</span>
        </div>

        <div className={styles.content}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>

          <div className={styles.phoneWrap} aria-hidden>
            <div
              className={`${styles.phone} ${
                showLandscapeBlock
                  ? styles.rotateToLandscape
                  : styles.rotateToPortrait
              }`}
            >
              <div className={styles.notch} />
              <div className={styles.screen} />
            </div>

            <div className={styles.arrows}>
              <span className={styles.arrow}>⟲</span>
              <span>Tournez votre téléphone</span>
              <span className={styles.arrow}>⟳</span>
            </div>

            <div className={styles.hint}>
              Astuce : désactivez le verrouillage d’orientation si besoin.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}