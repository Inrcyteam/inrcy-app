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

export default function SatisfactionPage() {
  const router = useRouter();

  const templates: Template[] = useMemo(
    () => [
      {
        id: 'sms_1',
        title: 'Satisfaction (SMS)',
        subtitle: 'Question simple',
        body:
          "Bonjour [Prénom] 😊\n\nÊtes-vous satisfait de notre intervention ?\nRépondez par une note de 1 à 5 ⭐\n\nMerci !\n[Entreprise]",
        tags: ['SMS', 'Rapide', 'Humain'],
      },
      {
        id: 'email_2',
        title: 'Satisfaction (Email)',
        subtitle: 'Note + commentaire',
        body:
          "Bonjour [Prénom],\n\nMerci encore pour votre confiance.\nPourriez-vous nous donner une note de 1 à 5 et, si possible, un petit commentaire ?\n\nNote : [1-5]\nCommentaire : [...]\n\nMerci,\n[Entreprise]",
        tags: ['Email', 'Amélioration', 'Qualité'],
      },
      {
        id: 'si_5',
        title: 'Si note = 5',
        subtitle: 'Transformer en avis',
        body:
          "Merci beaucoup [Prénom] 🙏\n\nSi vous avez 30 secondes, votre avis public nous aiderait énormément :\n👉 [Lien Avis Google]\n\nMerci !\n[Entreprise]",
        tags: ['Avis', 'Google', 'Confiance'],
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
          <div className={styles.kicker}>🔁 Fidéliser • Satisfaction</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Satisfaction
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            Recueillez le ressenti client, puis transformez le positif en avis.
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
            <div className={styles.hubHeroTitle}>Écouter avant de demander un avis.</div>
            <div className={styles.hubHeroSub}>
              Un questionnaire rapide est perçu comme une attention, pas comme une demande.
            </div>
            <div className={styles.pills} style={{ marginTop: 12 }}>
              <span className={styles.badge}>Note 1–5</span>
              <span className={styles.badge}>Commentaire</span>
              <span className={styles.badge}>Avis si 5⭐</span>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Conseil</div>
              <span className={styles.badge}>Simple</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Pose une seule question. Ensuite, remercie toujours.
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>Modèles satisfaction</div>
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

