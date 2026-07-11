import styles from "./inrSearchPublic.module.css";

export default function InrSearchLoading() {
  return (
    <main className={`${styles.page} ${styles.statePage}`} aria-busy="true" aria-live="polite">
      <div className={styles.stateCard}>
        <div className={styles.stateLogoSkeleton} aria-hidden="true" />
        <div className={styles.stateLineWide} aria-hidden="true" />
        <div className={styles.stateLine} aria-hidden="true" />
        <p>Chargement de la page professionnelle…</p>
      </div>
    </main>
  );
}
