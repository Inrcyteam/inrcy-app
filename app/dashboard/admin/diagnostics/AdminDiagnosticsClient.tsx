"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getClientUserFacingErrorMessage } from "@/lib/userFacingErrors";
import styles from "./diagnostics.module.css";

type DiagnosticStatus = "open" | "resolved" | "all";

type DiagnosticReport = {
  id: string;
  created_at: string;
  updated_at: string;
  status: "open" | "resolved";
  source: string | null;
  reason: string | null;
  automatic: boolean | null;
  client_name: string | null;
  company: string | null;
  phone: string | null;
  message: string | null;
  summary: string | null;
  url: string | null;
  user_agent: string | null;
  report: string | null;
  resolved_at: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("fr-FR");
}

function shortBrowser(userAgent?: string | null) {
  const ua = userAgent || "";
  if (!ua) return "Navigateur inconnu";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  return ua.slice(0, 70);
}

export default function AdminDiagnosticsClient() {
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [status, setStatus] = useState<DiagnosticStatus>("open");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableReady, setTableReady] = useState(true);
  const [setupDetail, setSetupDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("limit", "100");
      if (q.trim()) params.set("q", q.trim());

      const response = await fetch(`/api/admin/diagnostics?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Impossible de charger les diagnostics.");

      setReports((json.reports ?? []) as DiagnosticReport[]);
      setTableReady(json.tableReady !== false);
      setSetupDetail(json.tableReady === false ? `${json.error || "Table indisponible"} · ${json.setupSql || "SQL manquant"}` : null);
    } catch (e: any) {
      setError(getClientUserFacingErrorMessage(e, "Impossible de charger les diagnostics."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, status]);

  useEffect(() => {
    load(false);
  }, [load]);

  const metrics = useMemo(() => {
    const open = reports.filter((report) => report.status === "open").length;
    const resolved = reports.filter((report) => report.status === "resolved").length;
    const automatic = reports.filter((report) => report.automatic).length;
    return { total: reports.length, open, resolved, automatic };
  }, [reports]);

  async function updateStatus(report: DiagnosticReport, nextStatus: "open" | "resolved") {
    setSavingId(report.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/diagnostics", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: report.id, status: nextStatus }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Mise à jour impossible.");
      setSuccess(nextStatus === "resolved" ? "Diagnostic marqué comme résolu." : "Diagnostic rouvert.");
      await load(true);
    } catch (e: any) {
      setError(getClientUserFacingErrorMessage(e, "Mise à jour impossible."));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.heroCard}>
          <div className={styles.heroContent}>
            <div className={styles.kicker}>Administration iNrCy</div>
            <h1 className={styles.title}>Diagnostics connexion</h1>
            <p className={styles.subtitle}>Suivi des rapports de diagnostic connexion.</p>
          </div>

          <div className={styles.headerActions}>
            <button type="button" className={`${styles.ghostButton} ${styles.refreshButton}`} onClick={() => load(true)} disabled={refreshing} aria-label="Rafraîchir">
              <span className={styles.actionIcon} aria-hidden="true">↻</span>
              <span className={styles.actionLabel}>{refreshing ? "Rafraîchissement…" : "Rafraîchir"}</span>
            </button>
            <Link href="/dashboard/admin" className={`${styles.closeButton} ${styles.closeIconButton}`} aria-label="Fermer">
              <span className={styles.actionIcon} aria-hidden="true">×</span>
              <span className={styles.actionLabel}>Fermer</span>
            </Link>
          </div>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}><span className={styles.metricLabel}>Rapports affichés</span><strong className={styles.metricValue}>{metrics.total}</strong><small className={styles.metricSub}>Vue filtrée</small></article>
          <article className={styles.metricCard}><span className={styles.metricLabel}>Ouverts</span><strong className={styles.metricValue}>{metrics.open}</strong><small className={styles.metricSub}>À traiter</small></article>
          <article className={styles.metricCard}><span className={styles.metricLabel}>Résolus</span><strong className={styles.metricValue}>{metrics.resolved}</strong><small className={styles.metricSub}>Dans cette vue</small></article>
          <article className={styles.metricCard}><span className={styles.metricLabel}>Automatiques</span><strong className={styles.metricValue}>{metrics.automatic}</strong><small className={styles.metricSub}>Depuis l’app</small></article>
        </section>

        <section className={styles.filterCard}>
          <div className={styles.filters}>
            <label className={styles.label}><span>Statut</span><select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value as DiagnosticStatus)}><option value="open">Ouverts</option><option value="resolved">Résolus</option><option value="all">Tous</option></select></label>
            <label className={styles.label}><span>Recherche</span><input className={styles.input} value={q} onChange={(event) => setQ(event.target.value)} placeholder="société, téléphone, résumé…" /></label>
            <button type="button" className={styles.primaryButton} onClick={() => load(true)}>Appliquer</button>
          </div>
        </section>

        {!tableReady ? <div className={styles.warning}>Table Supabase à créer : {setupDetail}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        <section className={styles.listCard}>
          <div className={styles.sectionTop}><div><h2>Rapports reçus</h2><p>{loading ? "Chargement…" : `${reports.length} rapport(s) affiché(s)`}</p></div></div>
          {loading ? <div className={styles.loading}>Chargement des diagnostics…</div> : reports.length === 0 ? <div className={styles.empty}>Aucun diagnostic pour ces filtres.</div> : (
            <div className={styles.reportList}>
              {reports.map((report) => {
                const expanded = expandedId === report.id;
                const saving = savingId === report.id;
                return (
                  <article key={report.id} className={styles.reportCard}>
                    <div className={styles.reportMain}>
                      <div className={styles.reportBadge}>{report.status === "resolved" ? "✓" : "!"}</div>
                      <div className={styles.reportInfo}>
                        <strong>{report.company || report.client_name || "Diagnostic sans nom"}</strong>
                        <span>{report.summary || report.message || "Aucun résumé"}</span>
                        <small>{formatDate(report.created_at)} · {report.source || "source inconnue"} · {shortBrowser(report.user_agent)}</small>
                      </div>
                      <span className={report.status === "resolved" ? styles.statusResolved : styles.statusOpen}>{report.status === "resolved" ? "Résolu" : "Ouvert"}</span>
                      <div className={styles.actions}>
                        <button type="button" className={styles.smallGhostButton} onClick={() => setExpandedId(expanded ? null : report.id)}>{expanded ? "Réduire" : "Détails"}</button>
                        <button type="button" className={styles.smallButton} disabled={saving} onClick={() => updateStatus(report, report.status === "resolved" ? "open" : "resolved")}>{report.status === "resolved" ? "Rouvrir" : "Résoudre"}</button>
                      </div>
                    </div>
                    {expanded ? (
                      <div className={styles.details}>
                        <div className={styles.detailsGrid}>
                          <div><span>Nom</span><strong>{report.client_name || "—"}</strong></div>
                          <div><span>Téléphone</span><strong>{report.phone || "—"}</strong></div>
                          <div><span>Origine</span><strong>{report.source || "—"}</strong></div>
                          <div><span>Raison</span><strong>{report.reason || "—"}</strong></div>
                          <div className={styles.wide}><span>URL</span><strong>{report.url || "—"}</strong></div>
                          <div className={styles.wide}><span>Message</span><strong>{report.message || "—"}</strong></div>
                        </div>
                        <pre>{report.report || "Rapport technique vide"}</pre>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
