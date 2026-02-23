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

  const mustBeLandscape = landscapeRoutes.some((r) => pathname?.startsWith(r));

  useEffect(() => {
    const check = () => {
      setIsMobileOrTablet(window.innerWidth <= 1024);
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

  // ✅ Logo: on tente png puis svg puis sans extension
  const logoCandidates = [
    "/logo-appli-inrcy.png",
    "/logo-appli-inrcy.svg",
    "/logo-appli-inrcy",
  ];

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true">
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.brand}>
              <img
                className={styles.logo}
                src={logoCandidates[0]}
                alt="Logo iNrCy"
                onError={(e) => {
                  const img = e.currentTarget;
                  const current = img.getAttribute("data-idx")
                    ? Number(img.getAttribute("data-idx"))
                    : 0;
                  const next = current + 1;
                  if (next < logoCandidates.length) {
                    img.setAttribute("data-idx", String(next));
                    img.src = logoCandidates[next];
                  }
                }}
              />
              <div className={styles.brandName}>iNrCy</div>
            </div>
            <span className={styles.badge}>{badge}</span>
          </div>

          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>

          <div className={styles.grid} aria-hidden>
            <div className={styles.phoneWrap}>
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
            </div>

            <div>
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
    </div>
  );
}
