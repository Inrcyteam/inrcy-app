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

  return (
    <div className={styles.overlay}>
      {showLandscapeBlock && (
        <div className={styles.box}>
          <div className={styles.icon}>📱↔️</div>
          <p>Tournez votre téléphone en mode paysage</p>
        </div>
      )}

      {showPortraitBlock && (
        <div className={styles.box}>
          <div className={styles.icon}>📱↕️</div>
          <p>Remettez votre téléphone en mode portrait</p>
        </div>
      )}
    </div>
  );
}