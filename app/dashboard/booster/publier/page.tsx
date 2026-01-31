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

export default function PublierPage() {
  const router = useRouter();

  const templates: Template[] = useMemo(
    () => [
      {
        id: 'actu',
        title: 'Actu courte',
        subtitle: 'Simple, pro, efficace',
        body:
          "📣 INFO\n\nNous sommes disponibles cette semaine pour [type de prestation].\n✅ Devis rapide\n📍 Intervention sur [zone]\n\n👉 Contact : [téléphone] / [site]\n",
        tags: ['Actu', 'Local', 'Rapide'],
      },
      {
        id: 'conseil',
        title: 'Conseil utile',
        subtitle: 'Crédibilité + confiance',
        body:
          "💡 CONSEIL DU PRO\n\n[1 phrase d’accroche]\n\n✅ Astuce : [astuce concrète]\n⚠️ À éviter : [erreur fréquente]\n\nBesoin d’un avis ? Contactez-nous : [téléphone]\n",
        tags: ['Conseil', 'Expert', 'Confiance'],
      },
      {
        id: 'avant_apres',
        title: 'Avant / Après',
        subtitle: 'Le post qui convertit',
        body:
          "✨ AVANT / APRÈS\n\n📍 Chantier : [ville]\n🔧 Intervention : [prestation]\n⏱️ Durée : [durée]\n\n✅ Résultat : [résultat concret]\n\nVous voulez le même résultat ? [téléphone] / [site]\n",
        tags: ['Preuve', 'Visuel', 'Conversion'],
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
      {/* Topbar */}
      <div className={styles.topbar}>
        <div>
          <div className={styles.kicker}>🚀 Booster • Publier</div>
          <h1 className={styles.title} style={{ marginTop: 10 }}>
            Publier
          </h1>
          <p className={styles.subtitle} style={{ marginTop: 6 }}>
            Partagez une actu ou un conseil pro. Simple. Local. Régulier.
          </p>
        </div>

        <div className={styles.topbarActions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionView}`}
            onClick={() => router.push('/dashboard/booster')}
          >
            Fermer
          </button>
        </div>
      </div>

      <section className={styles.hubHero} style={{ marginTop: 10 }}>
        <div className={styles.hubHeroLeft}>
          <div className={styles.hubOrb} aria-hidden="true" />
          <div className={styles.hubHeroText}>
            <div className={styles.hubHeroTitle}>Publiez 1 fois / semaine.</div>
            <div className={styles.hubHeroSub}>
              Les posts réguliers augmentent votre présence et déclenchent plus de demandes.
            </div>
            <div className={styles.pills} style={{ marginTop: 12 }}>
              <span className={styles.badge}>Actu</span>
              <span className={styles.badge}>Conseil</span>
              <span className={styles.badge}>Avant/Après</span>
            </div>
          </div>
        </div>

        <div className={styles.hubHeroRight}>
          <div className={styles.miniCard}>
            <div className={styles.blockHeaderRow}>
              <div className={styles.blockTitle}>Checklist</div>
              <span className={styles.badge}>10 sec</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
              1) Une phrase claire • 2) Une preuve • 3) Un appel à l’action.
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubSection}>
        <div className={styles.sectionHeadTop}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 850, fontSize: 14 }}>
              Modèles prêts à publier
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4 }}>
              Cliquez un modèle → personnalisez → copiez.
            </div>
          </div>
        </div>

        <div className={styles.hubGrid} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.moduleCard} ${styles.hubCardBtn}`}
              onClick={() => setSelected(t)}
              style={{
                outline: t.id === selected.id ? '2px solid rgba(56,189,248,0.30)' : 'none',
              }}
            >
              <div className={styles.moduleTop}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900 }}>{t.title}</div>
                  <div className={styles.moduleDesc}>{t.subtitle}</div>
                </div>
                <span className={`${styles.badge} ${styles.badgeCyan}`}>Template</span>
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
              Utiliser ce modèle
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}


