"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import styles from "./orientationGuard.module.css";
import { usePathname, useRouter } from "next/navigation";

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (_mode: "landscape") => Promise<void>;
  unlock?: () => void;
};

function readPhysicalLandscape() {
  const orientationType = window.screen.orientation?.type;
  if (orientationType) return orientationType.startsWith("landscape");

  const legacyOrientation = (window as Window & { orientation?: number }).orientation;
  if (typeof legacyOrientation === "number") {
    return Math.abs(legacyOrientation) === 90;
  }

  return window.matchMedia("(orientation: landscape)").matches;
}

export default function OrientationGuard() {
  const pathname = usePathname();
  const router = useRouter();

  const isClient = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  // Mobile + tablette uniquement.
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isCameraCaptureActive, setIsCameraCaptureActive] = useState(false);

  const landscapeRoutes = useMemo(
    () => ["/dashboard/factures", "/dashboard/devis"],
    []
  );

  const mustBeLandscape = landscapeRoutes.some((route) =>
    pathname?.startsWith(route)
  );

  useEffect(() => {
    const check = () => {
      const touchDevice = navigator.maxTouchPoints > 0;
      const tabletSizedScreen =
        Math.min(window.screen.width, window.screen.height) <= 1024;

      setIsMobileOrTablet(
        window.innerWidth <= 1024 || (touchDevice && tabletSizedScreen)
      );
      setIsLandscape(readPhysicalLandscape());
    };

    const screenOrientation = window.screen.orientation;

    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    screenOrientation?.addEventListener?.("change", check);

    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
      screenOrientation?.removeEventListener?.("change", check);
    };
  }, []);

  useEffect(() => {
    const readCameraState = () => {
      setIsCameraCaptureActive(
        document.documentElement.dataset.inrcyCameraCaptureActive === "true"
      );
    };

    const onCameraStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      if (typeof detail?.active === "boolean") {
        setIsCameraCaptureActive(detail.active);
        return;
      }
      readCameraState();
    };

    readCameraState();
    window.addEventListener("inrcy-camera-capture-active", onCameraStateChange);

    return () => {
      window.removeEventListener(
        "inrcy-camera-capture-active",
        onCameraStateChange
      );
    };
  }, []);

  useEffect(() => {
    if (!isMobileOrTablet) return;

    const orientation = window.screen.orientation as
      | ScreenOrientationWithLock
      | undefined;

    // En dehors des devis/factures, iNrCy ne force plus aucune orientation.
    // Cela évite que l'ouverture du clavier dans un formulaire soit prise pour
    // une rotation et déclenche un verrouillage portrait/paysage.
    if (!mustBeLandscape || isCameraCaptureActive) {
      try {
        orientation?.unlock?.();
      } catch {
        // Certains navigateurs refusent unlock() hors plein écran.
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await orientation?.lock?.("landscape");
        if (!cancelled) {
          window.setTimeout(() => {
            if (!cancelled) setIsLandscape(readPhysicalLandscape());
          }, 120);
        }
      } catch {
        // iOS Safari et certains navigateurs utilisent simplement l'overlay.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mustBeLandscape, isMobileOrTablet, isCameraCaptureActive]);

  const logoCandidates = [
    "/logo-appli-inrcy.png",
    "/logo-appli-inrcy.svg",
    "/logo-appli-inrcy",
  ];

  const [logoIdx, setLogoIdx] = useState(0);
  const logoSrc = logoCandidates[logoIdx] || logoCandidates[0];

  if (!isClient || !isMobileOrTablet || isCameraCaptureActive) return null;

  // L'overlay n'existe désormais que sur les modules réellement prévus en paysage.
  if (!mustBeLandscape || isLandscape) return null;

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
                  setLogoIdx((index) =>
                    index + 1 < logoCandidates.length ? index + 1 : index
                  );
                }}
              />
              <div className={styles.brandName}>iNrCy</div>
            </div>

            <span className={styles.badge}>Paysage requis</span>

            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Fermer et revenir au dashboard"
              onClick={() => router.push("/dashboard")}
            >
              ×
            </button>
          </div>

          <h2 className={styles.title}>Passe en mode paysage</h2>
          <p className={styles.subtitle}>
            Pour une meilleure lisibilité de ce module.
          </p>

          <div className={styles.grid} aria-hidden>
            <div className={styles.phoneWrap}>
              <div className={`${styles.phone} ${styles.rotateToLandscape}`}>
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
                Astuce : désactivez le verrouillage d'orientation si besoin.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
