"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./tools.module.css";

type ToolMeta = {
  key: string;
  label: string;
  group: string;
  description: string;
  default_enabled: boolean;
};

type AdminToolUser = {
  user_id: string;
  email: string | null;
  created_at: string | null;
  role: string | null;
  full_name: string | null;
  company_name: string | null;
  subscription: {
    plan?: string | null;
    status?: string | null;
    trial_end_at?: string | null;
    founder_offer_enabled?: boolean | null;
  } | null;
  access_map: Record<string, boolean>;
  enabled_count: number;
  disabled_count: number;
};

function statusLabel(status?: string | null) {
  switch (status) {
    case "active":
      return "Actif";
    case "trialing":
      return "Essai";
    case "trial_expired":
      return "Essai terminé";
    case "paused":
      return "Pause";
    case "past_due":
      return "Retard paiement";
    case "unpaid":
      return "Impayé";
    case "canceled":
    case "cancelled":
      return "Résilié";
    case "incomplete":
      return "Activation attente";
    case "incomplete_expired":
      return "Activation expirée";
    default:
      return status || "Sans statut";
  }
}

function groupTools(tools: ToolMeta[]) {
  const groups = new Map<string, ToolMeta[]>();
  for (const tool of tools) {
    if (!groups.has(tool.group)) groups.set(tool.group, []);
    groups.get(tool.group)!.push(tool);
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
}

export default function AdminToolsClient() {
  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [users, setUsers] = useState<AdminToolUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.user_id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users]
  );

  const groupedTools = useMemo(() => groupTools(tools), [tools]);

  const metrics = useMemo(() => {
    const enabled = selectedUser ? Object.values(selectedUser.access_map || {}).filter(Boolean).length : 0;
    const disabled = tools.length - enabled;
    const tiktokEnabled = users.filter((user) => user.access_map?.tiktok).length;
    const pinterestEnabled = users.filter((user) => user.access_map?.pinterest).length;
    const inrSearchEnabled = users.filter((user) => user.access_map?.inr_search).length;
    const agentEnabled = users.filter((user) => user.access_map?.inr_agent).length;

    return {
      users: users.length,
      enabled,
      disabled,
      tiktokEnabled,
      pinterestEnabled,
      inrSearchEnabled,
      agentEnabled,
    };
  }, [selectedUser, tools.length, users]);

  const load = useCallback(async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (q.trim()) params.set("q", q.trim());

      const response = await fetch(`/api/admin/tools?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Impossible de charger les accès outils.");

      const nextTools = (json.tools ?? []) as ToolMeta[];
      const nextUsers = (json.users ?? []) as AdminToolUser[];
      setTools(nextTools);
      setUsers(nextUsers);

      if (!selectedUserId || !nextUsers.some((user) => user.user_id === selectedUserId)) {
        setSelectedUserId(nextUsers[0]?.user_id ?? "");
      }
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les accès outils.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, selectedUserId]);

  useEffect(() => {
    load(false);
  }, [load]);

  function updateLocalAccess(userId: string, accessMap: Record<string, boolean>) {
    setUsers((prev) =>
      prev.map((user) => {
        if (user.user_id !== userId) return user;
        const nextAccessMap = { ...user.access_map, ...accessMap };
        const enabledCount = Object.values(nextAccessMap).filter(Boolean).length;
        return {
          ...user,
          access_map: nextAccessMap,
          enabled_count: enabledCount,
          disabled_count: tools.length - enabledCount,
        };
      })
    );
  }

  async function toggleTool(userId: string, toolKey: string, enabled: boolean) {
    setSaving(`${userId}:${toolKey}`);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/tools", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, bubble_key: toolKey, enabled }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Mise à jour impossible.");

      updateLocalAccess(userId, { [toolKey]: enabled });
      setSuccess(enabled ? "Outil activé." : "Outil désactivé.");
    } catch (e: any) {
      setError(e?.message || "Mise à jour impossible.");
    } finally {
      setSaving(null);
    }
  }

  async function applyPreset(userId: string, mode: "all_on" | "all_off" | "defaults") {
    setSaving(`${userId}:preset`);
    setError(null);
    setSuccess(null);

    try {
      const payload =
        mode === "defaults"
          ? { user_id: userId, reset_defaults: true }
          : {
              user_id: userId,
              access_map: Object.fromEntries(tools.map((tool) => [tool.key, mode === "all_on"])),
            };

      const response = await fetch("/api/admin/tools", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Mise à jour impossible.");

      if (mode === "defaults") {
        await load(true);
        setSuccess("Accès remis aux valeurs par défaut iNrCy.");
      } else {
        updateLocalAccess(userId, Object.fromEntries(tools.map((tool) => [tool.key, mode === "all_on"])));
        setSuccess(mode === "all_on" ? "Tous les outils sont activés." : "Tous les outils sont désactivés.");
      }
    } catch (e: any) {
      setError(e?.message || "Mise à jour impossible.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.heroCard}>
          <div className={styles.heroContent}>
            <div className={styles.kicker}>Administration iNrCy</div>
            <h1 className={styles.title}>Accès outils / bulles</h1>
            <p className={styles.subtitle}>
              Activation des outils iNrCy par compte.
            </p>
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
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Comptes affichés</span>
            <strong className={styles.metricValue}>{metrics.users}</strong>
            <small className={styles.metricSub}>Vue filtrée</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Outils actifs</span>
            <strong className={styles.metricValue}>{metrics.enabled}</strong>
            <small className={styles.metricSub}>Compte sélectionné</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Outils désactivés</span>
            <strong className={styles.metricValue}>{metrics.disabled}</strong>
            <small className={styles.metricSub}>Compte sélectionné</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Spéciaux activés</span>
            <strong className={styles.metricValueSmall}>{metrics.tiktokEnabled} TikTok · {metrics.pinterestEnabled} Pinterest · {metrics.inrSearchEnabled} iNr'Search · {metrics.agentEnabled} Agent</strong>
            <small className={styles.metricSub}>Sur les comptes affichés</small>
          </article>
        </section>

        <section className={styles.filterCard}>
          <div className={styles.sectionTop}>
            <div>
              <h2>Choisir un compte</h2>
              
            </div>
          </div>

          <div className={styles.filters}>
            <label className={styles.label}>
              <span>Recherche</span>
              <input
                className={styles.input}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="email, société, user_id…"
              />
            </label>

            <button type="button" className={styles.primaryButton} onClick={() => load(true)}>
              Appliquer
            </button>
          </div>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        <section className={styles.mainGrid}>
          <aside className={styles.accountsCard}>
            <div className={styles.cardHeader}>
              <h2>Comptes</h2>
              <p>{loading ? "Chargement…" : `${users.length} compte(s)`}</p>
            </div>

            {loading ? (
              <div className={styles.loading}>Chargement des comptes…</div>
            ) : users.length === 0 ? (
              <div className={styles.empty}>Aucun compte trouvé.</div>
            ) : (
              <div className={styles.accountList}>
                {users.map((user) => (
                  <button
                    key={user.user_id}
                    type="button"
                    className={`${styles.accountItem} ${selectedUser?.user_id === user.user_id ? styles.accountItemActive : ""}`}
                    onClick={() => setSelectedUserId(user.user_id)}
                  >
                    <span className={styles.accountAvatar}>{(user.company_name?.[0] || user.email?.[0] || "?").toUpperCase()}</span>
                    <span className={styles.accountText}>
                      <strong>{user.company_name || "Société non renseignée"}</strong>
                      <small>{user.email || "Email non renseigné"}</small>
                      <em>{statusLabel(user.subscription?.status)} · {user.enabled_count} actif(s)</em>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className={styles.toolsCard}>
            <div className={styles.cardHeaderRow}>
              <div>
                <h2>{selectedUser?.company_name || "Aucun compte sélectionné"}</h2>
                <p>{selectedUser?.email || "Sélectionne un compte pour gérer ses accès."}</p>
              </div>

              {selectedUser ? (
                <div className={styles.presetActions}>
                  <button type="button" className={styles.smallGhostButton} onClick={() => applyPreset(selectedUser.user_id, "defaults")} disabled={Boolean(saving)}>
                    Défaut iNrCy
                  </button>
                  <button type="button" className={styles.smallGhostButton} onClick={() => applyPreset(selectedUser.user_id, "all_off")} disabled={Boolean(saving)}>
                    Tout couper
                  </button>
                  <button type="button" className={styles.smallButton} onClick={() => applyPreset(selectedUser.user_id, "all_on")} disabled={Boolean(saving)}>
                    Tout activer
                  </button>
                </div>
              ) : null}
            </div>

            {!selectedUser ? (
              <div className={styles.empty}>Aucun compte sélectionné.</div>
            ) : (
              <div className={styles.toolGroups}>
                {groupedTools.map((group) => (
                  <div key={group.group} className={styles.toolGroup}>
                    <h3>{group.group}</h3>

                    <div className={styles.toolGrid}>
                      {group.items.map((tool) => {
                        const enabled = Boolean(selectedUser.access_map?.[tool.key]);
                        const isSaving = saving === `${selectedUser.user_id}:${tool.key}` || saving === `${selectedUser.user_id}:preset`;

                        return (
                          <article key={tool.key} className={`${styles.toolCard} ${enabled ? styles.toolCardOn : styles.toolCardOff}`}>
                            <div className={styles.toolText}>
                              <strong>{tool.label}</strong>
                              <span>{tool.description}</span>
                              <small>Défaut : {tool.default_enabled ? "activé" : "désactivé"}</small>
                            </div>

                            <button
                              type="button"
                              className={`${styles.toggle} ${enabled ? styles.toggleOn : ""}`}
                              onClick={() => toggleTool(selectedUser.user_id, tool.key, !enabled)}
                              disabled={isSaving}
                              aria-pressed={enabled}
                            >
                              <span />
                              {enabled ? "ON" : "OFF"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
