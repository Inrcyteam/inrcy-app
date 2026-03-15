"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import styles from "./orientationGuard.module.css";
import { usePathname, useRouter } from "next/navigation";

export default function OrientationGuard() {
  const pathname = usePathname();
  const router = useRouter();

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

  useEffect(() => {
    if (!pathname || !isMobileOrTablet) return;

    const target = mustBeLandscape ? "landscape" : "portrait";
    let cancelled = false;

    (async () => {
      try {
        const anyScreen = screen as Screen & {
          orientation?: {
            lock?: (mode: string) => Promise<void>;
            unlock?: () => void;
          };
        };
        if (anyScreen.orientation?.lock) {
          await anyScreen.orientation.lock(target);
          if (!cancelled) {
            setTimeout(() => {
              if (!cancelled) {
                setIsLandscape(window.innerWidth > window.innerHeight);
              }
            }, 120);
          }
        }
      } catch {
        // iOS Safari / navigateurs non compatibles: le fallback visuel prendra le relais
      }
    })();

    return () => {
      cancelled = true
    };
  }, [pathname, mustBeLandscape, isMobileOrTablet]);


  // ✅ Logo: on tente png puis svg puis sans extension
  const logoCandidates = [
    "/logo-appli-inrcy.png",
    "/logo-appli-inrcy.svg",
    "/logo-appli-inrcy",
  ];

  const [logoIdx, setLogoIdx] = useState(0);
  const logoSrc = logoCandidates[logoIdx] || logoCandidates[0];

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
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.brand}>
              <Image
                className={styles.logo}
                src={logoSrc}
                alt="Logo iNrCy"
                width={80}
                height={80}
                priority
                unoptimized
                onError={() => {
                  setLogoIdx((i) => (i + 1 < logoCandidates.length ? i + 1 : i));
                }}
              />
              <div className={styles.brandName}>iNrCy</div>
            </div>

            <span className={styles.badge}>{badge}</span>

            {showLandscapeBlock ? (
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="Fermer et revenir au dashboard"
                onClick={() => router.push("/dashboard")}
              >
                ×
              </button>
            ) : (
              <span className={styles.closeSpacer} aria-hidden />
            )}
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
