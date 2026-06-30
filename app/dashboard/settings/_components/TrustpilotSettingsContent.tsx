"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "../../dashboard.module.css";
import ConnectionPill from "../../_components/ConnectionPill";
import StatusMessage from "../../_components/StatusMessage";

const cardStyle = {
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
} as const;

const inputStyle = {
  width: "100%",
  minWidth: 0,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15,23,42,0.65)",
  colorScheme: "dark" as const,
  padding: "10px 12px",
  color: "white",
  outline: "none",
} as const;

type TrustpilotSettings = {
  connected: boolean;
  accountConnected: boolean;
  mode: "manual" | "oauth";
  businessName: string;
  businessUnitId: string;
  domain: string;
  profileUrl: string;
  reviewInviteUrl: string;
  businessUserId: string;
  autoReplyDrafts: boolean;
  askReviewAfterInvoice: boolean;
  trustScore: number | null;
  numberOfReviews: number | null;
  stars: number | null;
};

type TrustpilotBusinessUnit = {
  id?: string | null;
  displayName?: string | null;
  name?: string | null;
  domain?: string | null;
  profileUrl?: string | null;
  evaluateUrl?: string | null;
  trustScore?: number | null;
  numberOfReviews?: number | null;
  stars?: number | null;
};

const DEFAULT_SETTINGS: TrustpilotSettings = {
  connected: false,
  accountConnected: false,
  mode: "manual",
  businessName: "",
  businessUnitId: "",
  domain: "",
  profileUrl: "",
  reviewInviteUrl: "",
  businessUserId: "",
  autoReplyDrafts: true,
  askReviewAfterInvoice: true,
  trustScore: null,
  numberOfReviews: null,
  stars: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTrustpilotConfigured(settings: Pick<TrustpilotSettings, "businessUnitId" | "profileUrl" | "reviewInviteUrl">) {
  return Boolean(settings.businessUnitId.trim() || settings.profileUrl.trim() || settings.reviewInviteUrl.trim());
}

function normalizeSettings(value: unknown): TrustpilotSettings {
  const source = asRecord(value);
  const next = {
    connected: false,
    accountConnected: Boolean(source.accountConnected),
    mode: source.mode === "oauth" ? "oauth" as const : "manual" as const,
    businessName: String(source.businessName || source.name || ""),
    businessUnitId: String(source.businessUnitId || source.business_unit_id || ""),
    domain: String(source.domain || ""),
    profileUrl: String(source.profileUrl || source.url || ""),
    reviewInviteUrl: String(source.reviewInviteUrl || source.inviteUrl || ""),
    businessUserId: String(source.businessUserId || source.authorBusinessUserId || ""),
    autoReplyDrafts: source.autoReplyDrafts !== false,
    askReviewAfterInvoice: source.askReviewAfterInvoice !== false,
    trustScore: numberOrNull(source.trustScore),
    numberOfReviews: numberOrNull(source.numberOfReviews),
    stars: numberOrNull(source.stars),
  };

  return {
    ...next,
    connected: Boolean(source.connected) || next.accountConnected || isTrustpilotConfigured(next),
  };
}

function emitDashboardUpdate(settings: TrustpilotSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("inrcy:trustpilot-settings-updated", {
    detail: {
      connected: settings.connected,
      profileUrl: settings.profileUrl,
      businessName: settings.businessName,
    },
  }));
}

function applyBusinessUnit(current: TrustpilotSettings, unit: TrustpilotBusinessUnit): TrustpilotSettings {
  return normalizeSettings({
    ...current,
    connected: true,
    businessName: unit.displayName || unit.name || current.businessName,
    businessUnitId: unit.id || current.businessUnitId,
    domain: unit.domain || current.domain,
    profileUrl: unit.profileUrl || current.profileUrl,
    reviewInviteUrl: unit.evaluateUrl || current.reviewInviteUrl,
    trustScore: unit.trustScore ?? current.trustScore,
    numberOfReviews: unit.numberOfReviews ?? current.numberOfReviews,
    stars: unit.stars ?? current.stars,
  });
}

export default function TrustpilotSettingsContent() {
  const [settings, setSettings] = useState<TrustpilotSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = loading || saving || searching || disconnecting;
  const scoreLabel = useMemo(() => {
    const parts = [];
    if (settings.trustScore !== null) parts.push(`Score ${settings.trustScore.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`);
    if (settings.numberOfReviews !== null) parts.push(`${settings.numberOfReviews.toLocaleString("fr-FR")} avis`);
    if (settings.stars !== null) parts.push(`${settings.stars.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}★`);
    return parts.join(" · ");
  }, [settings.numberOfReviews, settings.stars, settings.trustScore]);

  const patch = useCallback((next: Partial<TrustpilotSettings>) => {
    setSettings((current: TrustpilotSettings) => ({ ...current, ...next }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch("/api/integrations/trustpilot/settings", { cache: "no-store", credentials: "include" }),
        fetch("/api/integrations/trustpilot/status", { cache: "no-store", credentials: "include" }).catch(() => null),
      ]);

      const settingsPayload = await settingsRes.json().catch(() => null);
      if (!settingsRes.ok || !settingsPayload?.ok) throw new Error(settingsPayload?.error || "Chargement impossible.");

      const nextSettings = normalizeSettings(settingsPayload.trustpilot);
      if (statusRes?.ok) {
        const statusPayload = await statusRes.json().catch(() => null);
        if (statusPayload?.ok) {
          Object.assign(nextSettings, normalizeSettings({
            ...nextSettings,
            connected: statusPayload.connected ?? nextSettings.connected,
            accountConnected: statusPayload.accountConnected ?? nextSettings.accountConnected,
            mode: statusPayload.mode || nextSettings.mode,
            businessName: statusPayload.businessName || nextSettings.businessName,
            businessUnitId: statusPayload.businessUnitId || nextSettings.businessUnitId,
            profileUrl: statusPayload.profileUrl || nextSettings.profileUrl,
            reviewInviteUrl: statusPayload.reviewInviteUrl || nextSettings.reviewInviteUrl,
            businessUserId: statusPayload.businessUserId || nextSettings.businessUserId,
            trustScore: statusPayload.trustScore ?? nextSettings.trustScore,
            numberOfReviews: statusPayload.numberOfReviews ?? nextSettings.numberOfReviews,
            stars: statusPayload.stars ?? nextSettings.stars,
          }));
        }
      }

      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
    } catch (err) {
      console.warn("[trustpilot-settings] load failed", err);
      setError("Chargement des réglages Trustpilot impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchBusinessUnit = useCallback(async () => {
    const domain = settings.domain.trim() || settings.profileUrl.trim();
    if (!domain) {
      setError("Renseigne le domaine ou le lien Trustpilot avant de rechercher.");
      return;
    }

    setSearching(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/trustpilot/find?domain=${encodeURIComponent(domain)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.businessUnit) {
        throw new Error(payload?.error || "Fiche Trustpilot introuvable.");
      }

      const nextSettings = applyBusinessUnit(settings, payload.businessUnit as TrustpilotBusinessUnit);
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
      setNotice("Fiche Trustpilot trouvée. Pense à enregistrer.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recherche Trustpilot impossible.";
      setError(message);
    } finally {
      setSearching(false);
    }
  }, [settings]);

  const save = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const settingsToSave = normalizeSettings({
        ...settings,
        connected: settings.accountConnected || isTrustpilotConfigured(settings),
      });
      const response = await fetch("/api/integrations/trustpilot/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settingsToSave),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Enregistrement Trustpilot impossible.");

      const nextSettings = normalizeSettings(payload.trustpilot || settingsToSave);
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
      setNotice("Réglages Trustpilot enregistrés.");
    } catch (err) {
      console.warn("[trustpilot-settings] save failed", err);
      const message = err instanceof Error ? err.message : "Enregistrement Trustpilot impossible.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const disconnect = useCallback(async () => {
    const confirmed = window.confirm("Déconnecter Trustpilot ? Les liens configurés seront conservés.");
    if (!confirmed) return;

    setDisconnecting(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/trustpilot/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Déconnexion Trustpilot impossible.");

      const nextSettings = normalizeSettings(payload.trustpilot || { ...settings, accountConnected: false, mode: "manual" });
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
      setNotice("Trustpilot déconnecté.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Déconnexion Trustpilot impossible.";
      setError(message);
    } finally {
      setDisconnecting(false);
    }
  }, [settings]);

  const statusLabel = settings.accountConnected ? "Connecté" : isTrustpilotConfigured(settings) ? "Fiche configurée" : "À connecter";
  const statusColor = settings.accountConnected
    ? "rgba(34,197,94,0.95)"
    : isTrustpilotConfigured(settings)
      ? "rgba(59,130,246,0.95)"
      : "rgba(148,163,184,0.9)";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(15,23,42,0.65)",
            padding: "8px 10px",
            borderRadius: 999,
            color: "rgba(255,255,255,0.92)",
            fontSize: 13,
          }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: statusColor }} />
          Statut : <strong>{statusLabel}</strong>
        </span>
      </div>

      <section style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Compte connecté</div>
          <ConnectionPill connected={settings.accountConnected} />
        </div>
        <div className={styles.blockSub}>
          Connectez votre compte Trustpilot pour gérer vos avis depuis iNrCy.
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <input
            style={{ ...inputStyle, opacity: settings.accountConnected ? 1 : 0.8 }}
            value={settings.accountConnected ? (settings.businessName || "Compte Trustpilot connecté") : ""}
            onChange={(event) => patch({ businessName: event.target.value })}
            placeholder={settings.accountConnected ? "Compte Trustpilot connecté" : "Aucun compte connecté"}
            disabled={disabled || !settings.accountConnected}
          />
          {scoreLabel ? <div style={{ color: "rgba(226,232,240,0.86)", fontSize: 12 }}>{scoreLabel}</div> : null}
          {settings.profileUrl ? (
            <a href={settings.profileUrl} target="_blank" rel="noreferrer" className={`${styles.actionBtn} ${styles.viewBtn}`} style={{ justifySelf: "flex-start" }}>
              Voir la page
            </a>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!settings.accountConnected ? (
            <a
              href="/api/integrations/trustpilot/start?returnTo=/dashboard?panel=trustpilot"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              style={{ textDecoration: "none", opacity: disabled ? 0.65 : 1, pointerEvents: disabled ? "none" : "auto" }}
            >
              Connecter Trustpilot
            </a>
          ) : (
            <>
              <a
                href="/api/integrations/trustpilot/start?returnTo=/dashboard?panel=trustpilot"
                className={`${styles.actionBtn} ${styles.secondaryBtn}`}
                style={{ textDecoration: "none", opacity: disabled ? 0.65 : 1, pointerEvents: disabled ? "none" : "auto" }}
              >
                Reconnecter Trustpilot
              </a>
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnect} disabled={disabled}>
                {disconnecting ? "Déconnexion..." : "Déconnexion"}
              </button>
            </>
          )}
        </div>
      </section>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      {notice ? <StatusMessage variant="success">{notice}</StatusMessage> : null}

      <section style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Fiche Trustpilot</div>
          <ConnectionPill connected={isTrustpilotConfigured(settings)} />
        </div>
        <div className={styles.blockSub}>
          Retrouvez la fiche de l’entreprise, puis enregistrez les liens utiles.
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 13 }}>Domaine de l’entreprise</span>
          <input style={inputStyle} value={settings.domain} onChange={(event) => patch({ domain: event.target.value })} placeholder="exemple.fr" disabled={disabled} />
        </label>

        <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} style={{ justifySelf: "flex-start" }} onClick={searchBusinessUnit} disabled={disabled}>
          {searching ? "Recherche..." : "Trouver la fiche Trustpilot"}
        </button>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 13 }}>Lien de la page</span>
            <input style={inputStyle} value={settings.profileUrl} onChange={(event) => patch({ profileUrl: event.target.value })} placeholder="https://fr.trustpilot.com/review/..." disabled={disabled} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 13 }}>Lien de demande d’avis</span>
            <input style={inputStyle} value={settings.reviewInviteUrl} onChange={(event) => patch({ reviewInviteUrl: event.target.value })} placeholder="https://fr.trustpilot.com/evaluate/..." disabled={disabled} />
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Réglages avis</div>
        </div>
        <div className={styles.blockSub}>
          Choisissez comment iNrCy prépare la gestion des avis Trustpilot.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.45)", borderRadius: 12, padding: "10px 12px", color: "rgba(255,255,255,0.92)", fontSize: 14 }}>
            <span>Préparer les réponses avec l’IA</span>
            <input type="checkbox" checked={settings.autoReplyDrafts} onChange={(event) => patch({ autoReplyDrafts: event.target.checked })} disabled={disabled} />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.45)", borderRadius: 12, padding: "10px 12px", color: "rgba(255,255,255,0.92)", fontSize: 14 }}>
            <span>Demander un avis après facture</span>
            <input type="checkbox" checked={settings.askReviewAfterInvoice} onChange={(event) => patch({ askReviewAfterInvoice: event.target.checked })} disabled={disabled} />
          </label>
        </div>

        <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} style={{ justifySelf: "flex-start" }} onClick={save} disabled={saving || loading}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </section>
    </div>
  );
}
