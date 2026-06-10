import Link from "next/link";
import styles from "../admin.module.css";

type AdminToolPlaceholderProps = {
  kicker: string;
  title: string;
  description: string;
  icon: string;
  chips?: string[];
};

export default function AdminToolPlaceholder({ kicker, title, description, icon, chips = [] }: AdminToolPlaceholderProps) {
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.kicker}>{kicker}</div>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>{description}</p>
            {chips.length ? (
              <div className={styles.heroChips}>{chips.map((chip) => <span key={chip} className={styles.chip}>{chip}</span>)}</div>
            ) : null}
          </div>
          <div className={styles.heroActions}>
            <Link className={`${styles.closeButton} ${styles.closeIconButton}`} href="/dashboard/admin" aria-label="Fermer">
              <span className={styles.actionIcon} aria-hidden="true">×</span>
              <span className={styles.actionLabel}>Fermer</span>
            </Link>
          </div>
        </section>

        <section className={styles.placeholder}>
          <div className={styles.placeholderContent}>
            <div className={styles.placeholderIcon} aria-hidden="true">{icon}</div>
            <h2>Page prête à brancher</h2>
            <p>
              Le design admin est déjà en place. On pourra connecter les vraies données et les actions quand tu décideras de prioriser cet outil.
            </p>
            <div className={styles.placeholderActions}>
              <Link className={styles.primaryButton} href="/dashboard/admin">Retour admin</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
