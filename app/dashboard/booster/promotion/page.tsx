'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../dashboard.module.css';

type Template = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  tags: string[];
};

export default function PromotionPage() {
  const router = useRouter();

  const templates: Template[] = useMemo(
    () => [
      {
        id: 'offre',
        title: 'Offre limitée',
        subtitle: 'Créer l’urgence',
        body:
          "🔥 OFFRE LIMITÉE\n\nDu [date] au [date], profitez de :\n✅ [offre]\n📍 Intervention sur [zone]\n\n👉 Réservez : [téléphone] / [site]\n",
        tags: ['Urgence', 'Conversion', 'CTA'],
      },
      {
        id: 'bienvenue',
        title: 'Offre nouveaux clients',
        subtitle: 'Parfait pour recruter',
        body:
          "🎁 BIENVENUE\n\nNouveaux clients : [offre]\n✅ Devis rapide\n📍 [zone]\n\n👉 Contact : [téléphone]\n",
        tags: ['Nouveaux', 'Simple', 'Local'],
      },
      {
        id: 'retour',
        title: 'Retour de saison',
        subtitle: 'Rappel utile + promo',
        body:
          "🌤️ SAISON\n\nC’est le bon moment pour : [prestation]\n✅ [bénéfice]\n\n🎯 Offre du mois : [offre]\n👉 [téléphone] / [site]\n",
        tags: ['Saisonnier', 'Utile', 'Promo'],
      },
    ],
    []
  );

  const [selected, setSelected] = useState<Template>(templates[0]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selected.body);
    } catch {}
  };

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <div className={styles.kicker}>🚀 Booster • Promotion</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Promotion
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            Une offre ponctuelle, claire, avec un appel à l’action.
          </p>
        </div>

        <div className={styles.topbarActions}>
          <button type="button" className={`${styles.actionBtn} ${styles.actionView}`} onClick={() => router.push('/dashboard/booster')}>
            Fermer
          </button>
        </div>
      </div>

      <section className={styles.hubHero} style={{ marginTop: 10 }}>
        <div className={styles.hubHeroLeft}>
          <div className={styles.hubOrb} aria-hidden="true" />
          <div className={styles.hubHeroText}>
            <div className={styles.hubHeroTitle}>1 promo / mois, c’est suffisant.</div>
            <div className={styles.hubHeroSub}>
              Simple, local, limité dans le temps. Objectif : déclencher une action.
            </div>
            <div className={styles.pills} style={{ marginTop: 12 }}>
              <span className={styles.badge}>Offre</span>
              <span className={styles.badge}>Urgence</span>
              <span className={styles.badge}>CTA</span>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Conseil</div>
              <span className={styles.badge}>Clair</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Une seule offre, une seule phrase de bénéfice, un seul bouton “Contact”.
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>Modèles de promotions</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4 }}>
              Cliquez un modèle → copiez → envoyez.
            </div>
          </div>
        </div>

        <div className={styles.hubGrid}>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.moduleCard} ${styles.hubCardBtn}`}
              onClick={() => setSelected(t)}
              style={{ outline: t.id === selected.id ? '2px solid rgba(56,189,248,0.30)' : 'none' }}
            >
              <div className={styles.moduleTop}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>{t.title}</div>
                  <div className={styles.moduleDesc}>{t.subtitle}</div>
                </div>
                <span className={styles.badge}>Template</span>
              </div>

              <div className={styles.hubCardFooter}>
                {t.tags.map((tag) => (
                  <span key={tag} className={styles.badge}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className={styles.miniCard} style={{ marginTop: 12 }}>
          <div className={styles.blockHeaderRow}>
            <div className={styles.blockTitle}>Aperçu</div>
            <span className={styles.badge}>Copiable</span>
          </div>

          <pre
            style={{
              marginTop: 10,
              whiteSpace: 'pre-wrap',
              color: 'rgba(255,255,255,0.78)',
              fontSize: 13,
              lineHeight: 1.55,
              background: 'rgba(0,0,0,0.22)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 14,
              padding: 14,
            }}
          >
            {selected.body}
          </pre>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className={styles.ghostBtn} onClick={copy}>
              Copier
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => router.push('/dashboard/booster')}>
              Retour Booster
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}



