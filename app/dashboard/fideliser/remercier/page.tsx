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

export default function RemercierPage() {
  const router = useRouter();

  const templates: Template[] = useMemo(
    () => [
      {
        id: 'sms_merci',
        title: 'Merci (SMS)',
        subtitle: 'Post-chantier',
        body:
          "Bonjour [Prénom] 😊\n\nMerci pour votre confiance !\nSi vous avez la moindre question, je reste disponible.\n\n[Nom] — [Entreprise]\n[téléphone]",
        tags: ['SMS', 'Humain', 'Simple'],
      },
      {
        id: 'email_suivi',
        title: 'Merci + suivi (Email)',
        subtitle: 'Avec rappel de contact',
        body:
          "Bonjour [Prénom],\n\nMerci pour votre confiance.\nNous restons disponibles si vous avez une question suite à la prestation.\n\n📌 Rappel : [résumé intervention]\n📞 Contact : [téléphone]\n\nBien à vous,\n[Nom] — [Entreprise]",
        tags: ['Email', 'Suivi', 'Pro'],
      },
      {
        id: 'reco',
        title: 'Merci + recommandation',
        subtitle: 'Déclenche le bouche-à-oreille',
        body:
          "Merci encore [Prénom] 🙏\n\nSi vous connaissez quelqu’un qui a besoin de [prestation], n’hésitez pas à lui transmettre nos coordonnées :\n📞 [téléphone] — 🌐 [site]\n\nBelle journée !\n[Entreprise]",
        tags: ['Recommandation', 'BO', 'Naturel'],
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
          <div className={styles.kicker}>🔁 Fidéliser • Remercier</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Remercier
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            Un message post-chantier : humain, simple, efficace.
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
            <div className={styles.hubHeroTitle}>Le message le plus sous-coté.</div>
            <div className={styles.hubHeroSub}>
              Un simple merci crée une relation. Et une relation crée des retours et des recommandations.
            </div>
            <div className={styles.pills} style={{ marginTop: 12 }}>
              <span className={styles.badge}>Merci</span>
              <span className={styles.badge}>Suivi</span>
              <span className={styles.badge}>Recommandation</span>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Timing</div>
              <span className={styles.badge}>+2h</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Envoyez le message 1 à 3 heures après la fin du chantier.
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>Modèles remerciement</div>
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
                <span className={`${styles.badge} ${styles.badgeCyan}`}>Wow</span>
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

