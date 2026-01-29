"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./stats.module.css";

type Overview = {
  days: number;
  totals: {
    users: number;
    sessions: number;
    pageviews: number;
    engagementRate: number;
    avgSessionDuration: number;
    clicks: number;
    impressions: number;
    ctr: number;
  };
  topPages: Array<{ path: string; views: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  sources: any;
  note?: string;
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
}

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtSeconds(s: number) {
  const sec = Math.max(0, Math.round(s || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

export default function StatsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(28);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedBadges = useMemo(() => {
    const s = data?.sources;
    return [
      { label: "Site iNrCy · GA4", ok: !!s?.site_inrcy?.connected?.ga4 },
      { label: "Site iNrCy · GSC", ok: !!s?.site_inrcy?.connected?.gsc },
      { label: "Site Web · GA4", ok: !!s?.site_web?.connected?.ga4 },
      { label: "Site Web · GSC", ok: !!s?.site_web?.connected?.gsc },
      { label: "GMB", ok: false },
      { label: "Facebook", ok: false },
    ];
  }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats/overview?days=${encodeURIComponent(days)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Erreur API");
      setData(j);
    } catch (e: any) {
      setError(e?.message || "Erreur");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Affiche les stats directement à l’ouverture du module
  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <img
            src="/inrstats-logo.png"
            alt="iNr'Stats"
            className={styles.logo}
          />
          <p className={styles.subInline}>
            Un seul écran. Les chiffres qui comptent. Agrégé sur vos outils connectés.
          </p>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.actions}>
            <div className={styles.range}>
              <span className={styles.rangeLabel}>Période</span>
              <select className={styles.select} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>7 jours</option>
                <option value={14}>14 jours</option>
                <option value={28}>28 jours</option>
                <option value={60}>60 jours</option>
                <option value={90}>90 jours</option>
              </select>
            </div>

            <button className={styles.primaryBtn} onClick={load} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>
          </div>

          <button
            className={styles.backBtn}
            type="button"
            onClick={() => router.push("/dashboard")}
          >
            Fermer
          </button>
        </div>
      </header>

      <section className={styles.badges}>
        {connectedBadges.map((b) => (
          <span key={b.label} className={`${styles.badge} ${b.ok ? styles.badgeOk : styles.badgeOff}`}>
            <span className={styles.dot} aria-hidden />
            {b.label}
          </span>
        ))}
      </section>

      {error && <div className={styles.alert}>⚠️ {error}</div>}

      {!data && !loading && !error && (
        <div className={styles.empty}>
          <div className={styles.emptyCard}>
            <div className={styles.emptyTitle}>Prêt quand vous l’êtes.</div>
            <div className={styles.emptyText}>
              Connectez vos outils (GA4 / Search Console…) pour afficher vos chiffres ici.
            </div>
            <div className={styles.emptyHint}>
              Puis cliquez sur <strong>Rafraîchir</strong> (en haut à droite).
            </div>
          </div>
        </div>
      )}

      {data && (
        <>
          <section className={styles.grid}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Utilisateurs</div>
              <div className={styles.kpiValue}>{fmtInt(data.totals.users)}</div>
              <div className={styles.kpiSub}>GA4 (actifs)</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Sessions</div>
              <div className={styles.kpiValue}>{fmtInt(data.totals.sessions)}</div>
              <div className={styles.kpiSub}>GA4</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Pages vues</div>
              <div className={styles.kpiValue}>{fmtInt(data.totals.pageviews)}</div>
              <div className={styles.kpiSub}>GA4</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Engagement</div>
              <div className={styles.kpiValue}>{fmtPct(data.totals.engagementRate)}</div>
              <div className={styles.kpiSub}>Moyenne pondérée</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Durée moyenne</div>
              <div className={styles.kpiValue}>{fmtSeconds(data.totals.avgSessionDuration)}</div>
              <div className={styles.kpiSub}>Moyenne pondérée</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Clicks SEO</div>
              <div className={styles.kpiValue}>{fmtInt(data.totals.clicks)}</div>
              <div className={styles.kpiSub}>Search Console</div>
            </div>
          </section>

          <section className={styles.twoCols}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.cardTitle}>Top pages</div>
                  <div className={styles.cardSub}>Les pages qui génèrent le plus de vues.</div>
                </div>
              </div>
              <div className={styles.table}>
                {data.topPages.length === 0 ? (
                  <div className={styles.muted}>Aucune donnée (GA4 non connecté).</div>
                ) : (
                  data.topPages.map((p, i) => (
                    <div key={p.path + i} className={styles.row}>
                      <div className={styles.left}>
                        <span className={styles.rank}>{i + 1}</span>
                        <span className={styles.path}>{p.path}</span>
                      </div>
                      <div className={styles.right}>{fmtInt(p.views)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.cardTitle}>Canaux</div>
                  <div className={styles.cardSub}>D’où viennent vos sessions.</div>
                </div>
              </div>
              <div className={styles.table}>
                {data.channels.length === 0 ? (
                  <div className={styles.muted}>Aucune donnée (GA4 non connecté).</div>
                ) : (
                  data.channels.map((c, i) => (
                    <div key={c.channel + i} className={styles.row}>
                      <div className={styles.left}>
                        <span className={styles.rank}>{i + 1}</span>
                        <span className={styles.path}>{c.channel}</span>
                      </div>
                      <div className={styles.right}>{fmtInt(c.sessions)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className={styles.cardWide}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>Top requêtes SEO</div>
                <div className={styles.cardSub}>Ce que les gens tapent sur Google pour vous trouver.</div>
              </div>
            </div>

            <div className={styles.table}>
              {data.topQueries.length === 0 ? (
                <div className={styles.muted}>Aucune donnée (Search Console non connecté).</div>
              ) : (
                data.topQueries.map((q, i) => (
                  <div key={q.query + i} className={styles.rowWide}>
                    <div className={styles.leftWide}>
                      <span className={styles.rank}>{i + 1}</span>
                      <span className={styles.query}>{q.query}</span>
                    </div>
                    <div className={styles.metrics}>
                      <span className={styles.metric}><strong>{fmtInt(q.clicks)}</strong> clicks</span>
                      <span className={styles.metric}><strong>{fmtInt(q.impressions)}</strong> impr.</span>
                      <span className={styles.metric}><strong>{fmtPct(q.ctr)}</strong> CTR</span>
                      <span className={styles.metric}><strong>{q.position.toFixed(1)}</strong> pos.</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {data.note && <div className={styles.note}>{data.note}</div>}
          </section>
        </>
      )}
    </main>
  );
}
