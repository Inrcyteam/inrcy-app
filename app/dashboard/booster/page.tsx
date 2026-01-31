'use client';

import { useRouter } from 'next/navigation';
import styles from '../dashboard.module.css';

export default function BoosterHome() {
  const router = useRouter();

  return (
    <main className={styles.page}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div>
          <div className={styles.kicker}>🚀 Booster</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Accélérez votre visibilité
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            3 leviers simples, sans complexité : publiez, récoltez des avis, lancez une promo.
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
          <div className={styles.hubOrb} aria-hidden="true" />
          <div className={styles.hubHeroText}>
            <div className={styles.hubHeroTitle}>
              Un cockpit pour attirer plus de demandes.
            </div>
            <div className={styles.hubHeroSub}>
              Vous choisissez l’action. iNrCy vous guide avec des modèles prêts à l’emploi.
            </div>

            <div className={styles.pills} style={{ marginTop: 14 }}>
              <span className={`${styles.badge} ${styles.badgeCyan}`}>Simple</span>
              <span className={styles.badge}>Rapide</span>
              <span className={styles.badge}>Local</span>
              <span className={styles.badge}>Impact immédiat</span>
            </div>

            <div className={styles.hubHeroActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => router.push('/dashboard/booster/publier')}
              >
                Commencer par Publier
              </button>

              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => router.push('/dashboard/booster/avis')}
              >
                Demander des avis
              </button>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Conseil iNrCy</div>
              <span className={`${styles.badge} ${styles.badgeSoon}`}>Modèles</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Gardez un rythme simple : 1 post / semaine + 2 demandes d’avis / jour + 1 promo / mois.
            </div>
          </div>

          <div className={styles.miniCard} style={{ marginTop: 10 }}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Objectif</div>
              <span className={styles.badge}>Visibilité</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Booster est pensé pour le concret : plus de présence, plus de confiance, plus de demandes.
            </div>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>
              Vos 3 outils Booster
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
            onClick={() => router.push('/dashboard/booster/publier')}
          >
            <div className={styles.moduleTop}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>Publier</div>
                <div className={styles.moduleDesc}>Partagez une actu ou un conseil sur vos canaux.</div>
              </div>
              <span className={`${styles.badge} ${styles.badgeCyan}`}>Le plus simple</span>
            </div>

            <div className={styles.hubCardFooter}>
              <span className={styles.badge}>Actu</span>
              <span className={styles.badge}>Conseil</span>
              <span className={styles.badge}>Post pro</span>
            </div>
          </button>

          <button
            type="button"
            className={`${styles.moduleCard} ${styles.hubCardBtn}`}
            onClick={() => router.push('/dashboard/booster/avis')}
          >
            <div className={styles.moduleTop}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>Avis</div>
                <div className={styles.moduleDesc}>Demandez des avis clients pour renforcer la confiance.</div>
              </div>
              <span className={styles.badge}>Confiance</span>
            </div>

            <div className={styles.hubCardFooter}>
              <span className={styles.badge}>Message</span>
              <span className={styles.badge}>Rappel doux</span>
              <span className={styles.badge}>Réputation</span>
            </div>
          </button>

          <button
            type="button"
            className={`${styles.moduleCard} ${styles.hubCardBtn}`}
            onClick={() => router.push('/dashboard/booster/promotion')}
          >
            <div className={styles.moduleTop}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>Promotion</div>
                <div className={styles.moduleDesc}>Envoyez une offre ponctuelle (newsletter promo).</div>
              </div>
              <span className={styles.badge}>Conversion</span>
            </div>

            <div className={styles.hubCardFooter}>
              <span className={styles.badge}>Offre</span>
              <span className={styles.badge}>Urgence</span>
              <span className={styles.badge}>CTA</span>
            </div>
          </button>
        </div>
      </section>
    </main>
  );
}


