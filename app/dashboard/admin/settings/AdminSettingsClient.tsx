"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./settings.module.css";

type EnvItem = { name: string; ok: boolean; value: string };

type AdminSettingsPayload = {
  mode: string;
  trial: { days: number; reminderOffsets: readonly number[] };
  admin: { hardAdminCount: number; adminOnly: boolean; staffAllowed: boolean };
  bubbleAccess: {
    totalTools: number;
    defaultEnabledCount: number;
    defaultDisabledCount: number;
    defaultDisabledTools: string[];
  };
  environment: EnvItem[];
  subscriptionStatusCounts: Record<string, number> | null;
  warning: string;
};

function labelStatus(status: string) {
  switch (status) {
    case "active": return "Actifs";
    case "trialing": return "Essais";
    case "trial_expired": return "Essais terminés";
    case "past_due": return "Paiement retard";
    case "unpaid": return "Impayés";
    case "canceled": return "Résiliés";
    default: return status;
  }
}

export default function AdminSettingsClient() {
  const [settings, setSettings] = useState<AdminSettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Impossible de charger les paramètres système.");
      setSettings(json as AdminSettingsPayload);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les paramètres système.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const envMetrics = useMemo(() => {
    const total = settings?.environment?.length || 0;
    const ok = settings?.environment?.filter((item) => item.ok).length || 0;
    return { total, ok, missing: total - ok };
  }, [settings]);

  const subscriptionRows = useMemo(() => Object.entries(settings?.subscriptionStatusCounts || {}), [settings]);

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.heroCard}>
          <div className={styles.heroContent}>
            <div className={styles.kicker}>Administration iNrCy</div>
            <h1 className={styles.title}>Paramètres système</h1>
            <p className={styles.subtitle}>Vue rapide des réglages système.</p>
          </div>

          <div className={styles.headerActions}>
            <button type="button" className={styles.ghostButton} onClick={() => load(true)} disabled={refreshing}>{refreshing ? "Rafraîchissement…" : "Rafraîchir"}</button>
            <Link href="/dashboard/admin" className={styles.closeButton}>Fermer</Link>
          </div>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {loading ? <div className={styles.loading}>Chargement des paramètres système…</div> : null}

        {settings ? (
          <>
            <section className={styles.metricsGrid}>
              <article className={styles.metricCard}><span className={styles.metricLabel}>Période d’essai</span><strong className={styles.metricValue}>{settings.trial.days} j</strong><small className={styles.metricSub}>Rappels J-{settings.trial.reminderOffsets.join(" / J-")}</small></article>
              <article className={styles.metricCard}><span className={styles.metricLabel}>Accès admin</span><strong className={styles.metricValue}>{settings.admin.adminOnly ? "Admin" : "Ouvert"}</strong><small className={styles.metricSub}>Staff autorisé : {settings.admin.staffAllowed ? "oui" : "non"}</small></article>
              <article className={styles.metricCard}><span className={styles.metricLabel}>Outils par défaut</span><strong className={styles.metricValue}>{settings.bubbleAccess.defaultEnabledCount}/{settings.bubbleAccess.totalTools}</strong><small className={styles.metricSub}>activés au départ</small></article>
              <article className={styles.metricCard}><span className={styles.metricLabel}>Variables</span><strong className={styles.metricValue}>{envMetrics.ok}/{envMetrics.total}</strong><small className={styles.metricSub}>{envMetrics.missing} manquante(s)</small></article>
            </section>

            <section className={styles.grid}>
              <article className={styles.card}>
                <div className={styles.cardHeader}><h2>Environnement Vercel / serveur</h2></div>
                <div className={styles.envList}>
                  {settings.environment.map((item) => (
                    <div key={item.name} className={styles.envRow}>
                      <span>{item.name}</span>
                      <strong className={item.ok ? styles.okPill : styles.warnPill}>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className={styles.card}>
                <div className={styles.cardHeader}><h2>Abonnements</h2></div>
                {subscriptionRows.length === 0 ? <div className={styles.empty}>Aucune donnée abonnement lisible.</div> : (
                  <div className={styles.statusList}>
                    {subscriptionRows.map(([status, count]) => (
                      <div key={status} className={styles.statusRow}><span>{labelStatus(status)}</span><strong>{count}</strong></div>
                    ))}
                  </div>
                )}
              </article>

              <article className={styles.card}>
                <div className={styles.cardHeader}><h2>Règles iNrCy actuelles</h2></div>
                <div className={styles.ruleList}>
                  <div><span>Essai gratuit</span><strong>{settings.trial.days} jours</strong></div>
                  <div><span>Rappels fin essai</span><strong>J-{settings.trial.reminderOffsets.join(" · J-")}</strong></div>
                  <div><span>Sécurité zone admin</span><strong>role = admin uniquement</strong></div>
                  <div><span>Outils désactivés par défaut</span><strong>{settings.bubbleAccess.defaultDisabledTools.join(", ") || "aucun"}</strong></div>
                </div>
              </article>

              <article className={styles.card}>
                <div className={styles.cardHeader}><h2>Accès rapides</h2></div>
                <div className={styles.quickLinks}>
                  <Link className={styles.quickLink} href="/dashboard/admin/users">Comptes utilisateurs</Link>
                  <Link className={styles.quickLink} href="/dashboard/admin/tools">Accès outils / bulles</Link>
                  <Link className={styles.quickLink} href="/dashboard/admin/diagnostics">Diagnostics connexion</Link>
                  <Link className={styles.quickLink} href="/dashboard/admin/commandes">Commandes Boutique</Link>
                </div>
              </article>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
