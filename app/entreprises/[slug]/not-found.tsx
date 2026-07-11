import Link from "next/link";
import styles from "./inrSearchPublic.module.css";

export default function InrSearchNotFound() {
  return (
    <main className={`${styles.page} ${styles.statePage}`}>
      <section className={styles.stateCard}>
        <img src="/icons/inr-search-bubble-128.png" alt="" width={74} height={74} />
        <span className={styles.stateKicker}>iNr&apos;Search</span>
        <h1>Cette page professionnelle n’est pas disponible</h1>
        <p>Elle a peut-être été désactivée ou son adresse est incorrecte.</p>
        <div className={styles.stateActions}>
          <Link href="/entreprises">Voir les entreprises</Link>
          <Link href="/metiers">Explorer les métiers</Link>
        </div>
      </section>
    </main>
  );
}
