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

export default function AvisPage() {
  const router = useRouter();

  const templates: Template[] = useMemo(
    () => [
      {
        id: 'sms',
        title: 'Demande d’avis (SMS)',
        subtitle: 'Court, direct, très efficace',
        body:
          "Bonjour [Prénom], merci pour votre confiance 😊\n\nSi vous avez 30 secondes, votre avis nous aiderait beaucoup :\n👉 [Lien Avis Google]\n\nMerci !\n[Nom / Entreprise]",
        tags: ['SMS', 'Rapide', 'Google'],
      },
      {
        id: 'email',
        title: 'Demande d’avis (Email)',
        subtitle: 'Plus détaillé, plus doux',
        body:
          "Bonjour [Prénom],\n\nMerci encore pour votre confiance.\nVotre retour nous aide à nous améliorer et à rassurer les prochains clients.\n\n👉 Laisser un avis : [Lien Avis Google]\n\nUn grand merci,\n[Nom] — [Entreprise]\n[téléphone]",
        tags: ['Email', 'Confiance', 'Réputation'],
      },
      {
        id: 'rappel',
        title: 'Rappel doux',
        subtitle: 'Si pas de réponse',
        body:
          "Bonjour [Prénom], petit rappel 😊\n\nSi vous avez un moment, votre avis compte vraiment pour nous :\n👉 [Lien Avis Google]\n\nMerci beaucoup,\n[Entreprise]",
        tags: ['Rappel', 'Soft', 'Simple'],
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
          <div className={styles.kicker}>🚀 Booster • Avis</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Avis
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            Les avis augmentent la confiance et améliorent votre visibilité locale.
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
            <div className={styles.hubHeroTitle}>Demandez juste après la prestation.</div>
            <div className={styles.hubHeroSub}>
              C’est le moment où la satisfaction est au plus haut : 2 messages = 10x plus de retours.
            </div>
            <div className={styles.pills} style={{ marginTop: 12 }}>
              <span className={styles.badge}>SMS</span>
              <span className={styles.badge}>Email</span>
              <span className={styles.badge}>Rappel doux</span>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Astuce</div>
              <span className={styles.badge}>Pro</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              Ajoutez le lien d’avis Google une seule fois, puis réutilisez vos modèles.
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>Modèles de demande d’avis</div>
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
