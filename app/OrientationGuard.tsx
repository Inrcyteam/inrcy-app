"use client";

import { useEffect, useState } from "react";
import styles from "./orientationGuard.module.css";
import { usePathname } from "next/navigation";

export default function OrientationGuard() {
  const pathname = usePathname();
  const [isLandscape, setIsLandscape] = useState(false);

  // routes qui DOIVENT être en paysage
  const landscapeRoutes = [
    "/dashboard/factures",
    "/dashboard/devis",
    "/dashboard/crm",
  ];

  const mustBeLandscape = landscapeRoutes.some((r) =>
    pathname?.startsWith(r)
  );

  useEffect(() => {
    const check = () => {
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

  const showLandscapeBlock = mustBeLandscape && !isLandscape;
  const showPortraitBlock = !mustBeLandscape && isLandscape;

  if (!showLandscapeBlock && !showPortraitBlock) return null;

  const title = showLandscapeBlock
    ? "Passez en mode paysage"
    : "Revenez en mode portrait";

  const subtitle = showLandscapeBlock
    ? "Ce module est optimisé pour une lecture horizontale."
    : "Pour une meilleure expérience, l’app fonctionne en vertical.";

  const badge = showLandscapeBlock ? "Paysage requis" : "Portrait requis";

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <img
              className={styles.logo}
              src="/logo-inrcy.png"
              alt="iNrCy"
              draggable={false}
            />
            <div className={styles.brandText}>
              <div className={styles.brandName}>iNrCy</div>
              <div className={styles.brandTag}>Hub connecté</div>
            </div>
          </div>
          <div className={styles.badge}>{badge}</div>
        </div>

        <div className={styles.content}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>

          <div className={styles.illu} aria-hidden>
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

            <div className={styles.hintRow}>
              <span className={styles.pill}>⟲</span>
              <span className={styles.hintText}>Tournez votre téléphone</span>
              <span className={styles.pill}>⟳</span>
            </div>

            <div className={styles.hintSmall}>
              Astuce : désactivez le verrouillage d’orientation si besoin.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}