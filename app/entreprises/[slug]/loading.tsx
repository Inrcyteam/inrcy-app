import styles from "./inrSearchPublic.module.css";

export default function InrSearchLoading() {
  return (
    <main className={`${styles.page} ${styles.statePage}`} aria-busy="true">
      <section className={styles.stateCard}>
        <div className={styles.stateLogoSkeleton} />
        <span className={styles.stateKicker}>iNr&apos;Search</span>
        <h1>Chargement de la page professionnelle</h1>
        <p>Nous préparons les informations publiques de cette entreprise.</p>
        <div className={styles.stateLineWide} />
        <div className={styles.stateLine} />
      </section>
    </main>
  );
}
