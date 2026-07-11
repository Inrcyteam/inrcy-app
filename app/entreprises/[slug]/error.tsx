"use client";

import { useEffect } from "react";
import Link from "next/link";
import styles from "./inrSearchPublic.module.css";

export default function InrSearchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[inr-search-public] render failed", error);
  }, [error]);

  return (
    <main className={`${styles.page} ${styles.statePage}`}>
      <section className={styles.stateCard}>
        <img src="/icons/inr-search-bubble-128.png" alt="" width={74} height={74} />
        <span className={styles.stateKicker}>iNr&apos;Search</span>
        <h1>La page n’a pas pu être chargée</h1>
        <p>Une erreur temporaire est survenue. Vous pouvez réessayer immédiatement.</p>
        <div className={styles.stateActions}>
          <button type="button" onClick={reset}>Réessayer</button>
          <Link href="/entreprises">Retour aux entreprises</Link>
        </div>
      </section>
    </main>
  );
}
