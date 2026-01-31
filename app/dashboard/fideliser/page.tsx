'use client';

import { useRouter } from 'next/navigation';
import styles from '../dashboard.module.css';

export default function FideliserHome() {
  const router = useRouter();

  return (
    <main className={styles.page}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div>
          <div className={styles.kicker}>🔁 Fidéliser</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Faites revenir vos clients
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            Gardez le lien après la prestation : informer, écouter, remercier.
          </p>
        </div>

        <div className={styles.topbarActions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionView}`}
            onClick={() => router.push('/dashboard')}
            aria-label="Fermer"
            title="Fermer"
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className={styles.hubHero}>
        <div className={styles.hubHeroLeft}>
          <div className={styles.hubOrbAlt} aria-hidden="true" />
          <div className={styles.hubHeroText}>
            <div className={styles.hubHeroTitle}>
              Une relation client qui travaille pour vous.
            </div>
            <div className={styles.hubHeroSub}>
              Des messages utiles et humains, envoyés au bon moment, sans pression.
            </div>

            <div className={styles.pills} style={{ marginTop: 14 }}>
              <span className={`${styles.badge} ${styles.badgeCyan}`}>Humain</span>
              <span className={styles.badge}>Simple</span>
              <span className={styles.badge}>Après-chantier</span>
              <span className={styles.badge}>Long terme</span>
            </div>

            <div className={styles.hubHeroActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => router.push('/dashboard/fideliser/remercier')}
              >
                Commencer par Remercier
              </button>

              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => router.push('/dashboard/fideliser/satisfaction')}
              >
                Lancer une enquête
              </button>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Conseil iNrCy</div>
              <span className={styles.badge}>Routine</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Après chaque chantier : 1 merci + 1 question satisfaction. Ensuite : 1 info utile par mois.
            </div>
          </div>

          <div className={styles.miniCard} style={{ marginTop: 10 }}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Objectif</div>
              <span className={styles.badge}>Fidélité</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Fidéliser transforme une prestation en relation : confiance, avis, recommandations.
            </div>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>
              Vos 3 outils Fidéliser
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4 }}>
              Cliquez pour ouvrir l’outil et utiliser un modèle.
            </div>
          </div>
        </div>

        <div className={styles.hubGrid}>
          <button
            type="button"
            className={`${styles.moduleCard} ${styles.hubCardBtn}`}
            onClick={() => router.push('/dashboard/fideliser/informer')}
          >
            <div className={styles.moduleTop}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>Informer</div>
                <div className={styles.moduleDesc}>Newsletter utile : conseils, actus, rappels saisonniers.</div>
              </div>
              <span className={styles.badge}>Présence</span>
            </div>

            <div className={styles.hubCardFooter}>
              <span className={styles.badge}>Conseils</span>
              <span className={styles.badge}>Actus</span>
              <span className={styles.badge}>Rappels</span>
            </div>
          </button>

          <button
            type="button"
            className={`${styles.moduleCard} ${styles.hubCardBtn}`}
            onClick={() => router.push('/dashboard/fideliser/satisfaction')}
          >
            <div className={styles.moduleTop}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>Satisfaction</div>
                <div className={styles.moduleDesc}>Recueillez le ressenti client (questionnaire rapide).</div>
              </div>
              <span className={styles.badge}>Écoute</span>
            </div>

            <div className={styles.hubCardFooter}>
              <span className={styles.badge}>Note</span>
              <span className={styles.badge}>Commentaire</span>
              <span className={styles.badge}>Amélioration</span>
            </div>
          </button>

          <button
            type="button"
            className={`${styles.moduleCard} ${styles.hubCardBtn}`}
            onClick={() => router.push('/dashboard/fideliser/remercier')}
          >
            <div className={styles.moduleTop}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>Remercier</div>
                <div className={styles.moduleDesc}>Message post-chantier : humain, simple, efficace.</div>
              </div>
              <span className={`${styles.badge} ${styles.badgeCyan}`}>Wow</span>
            </div>

            <div className={styles.hubCardFooter}>
              <span className={styles.badge}>Merci</span>
              <span className={styles.badge}>Suivi</span>
              <span className={styles.badge}>Recommandation</span>
            </div>
          </button>
        </div>
      </section>
    </main>
  );
}


