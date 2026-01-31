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

export default function InformerPage() {
  const router = useRouter();

  const templates: Template[] = useMemo(
    () => [
      {
        id: 'conseil_mois',
        title: 'Conseil du mois',
        subtitle: 'Utile, non commercial',
        body:
          "Bonjour [Prénom],\n\n💡 Conseil du mois : [conseil concret]\n✅ Pourquoi : [bénéfice]\n⚠️ À éviter : [erreur fréquente]\n\nSi besoin, on est là : [téléphone]\n\n[Entreprise]",
        tags: ['Conseil', 'Utile', 'Confiance'],
      },
      {
        id: 'saisonnier',
        title: 'Rappel saisonnier',
        subtitle: 'Le bon moment pour…',
        body:
          "Bonjour [Prénom],\n\nC’est la période idéale pour : [prestation]\n✅ Avantage : [bénéfice]\n\nSi vous souhaitez un passage : [téléphone]\n\nÀ bientôt,\n[Entreprise]",
        tags: ['Saisonnier', 'Prévention', 'Simple'],
      },
      {
        id: 'actus',
        title: 'Petite actu',
        subtitle: 'Rester présent',
        body:
          "Bonjour [Prénom],\n\n📣 Petite actu : [actu]\n\n👉 Pour toute question : [téléphone]\n\nMerci,\n[Entreprise]",
        tags: ['Actu', 'Présence', 'Court'],
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
          <div className={styles.kicker}>🔁 Fidéliser • Informer</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Informer
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            Newsletter utile : conseils, actus, rappels saisonniers.
          </p>
        </div>

        <div className={styles.topbarActions}>
          <button type="button" className={`${styles.actionBtn} ${styles.actionView}`} onClick={() => router.push('/dashboard/fideliser')}>
            Fermer
          </button>
        </div>
      </div>

      <section className={styles.hubHero} style={{ marginTop: 10 }}>
        <div className={styles.hubHeroLeft}>
          <div className={styles.hubOrbAlt} aria-hidden="true" />
          <div className={styles.hubHeroText}>
            <div className={styles.hubHeroTitle}>1 message utile / mois.</div>
            <div className={styles.hubHeroSub}>
              Le but : rester présent sans vendre. Les clients reviennent plus naturellement.
            </div>
            <div className={styles.pills} style={{ marginTop: 12 }}>
              <span className={styles.badge}>Conseils</span>
              <span className={styles.badge}>Saisonnier</span>
              <span className={styles.badge}>Actus</span>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Ton</div>
              <span className={styles.badge}>Humain</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Restez simple : utile, court, et toujours une phrase “on est là si besoin”.
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>Modèles newsletter</div>
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
              style={{ outline: t.id === selected.id ? '2px solid rgba(244,114,182,0.28)' : 'none' }}
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
            <button type="button" className={styles.primaryBtn} onClick={() => router.push('/dashboard/fideliser')}>
              Retour Fidéliser
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

