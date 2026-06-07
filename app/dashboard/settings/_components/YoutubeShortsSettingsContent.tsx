"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "../../dashboard.module.css";
import { createClient } from "@/lib/supabaseClient";
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

const selectStyle = {
  ...inputStyle,
  background: "rgba(15,23,42,0.95)",
} as const;

const switchRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  alignItems: "stretch",
} as const;

function PreferenceToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(15,23,42,0.45)",
        borderRadius: 12,
        padding: "10px 12px",
        color: "rgba(255,255,255,0.92)",
        fontSize: 14,
      }}
    >
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

type YoutubeShortsSettings = {
  connected: boolean;
  accountConnected: boolean;
  channelUrl: string;
  channelHandle: string;
  channelName: string;
  channelId: string;
  accountEmail: string;
  accountName: string;
  avatarUrl: string;
  scopes: string;
  expiresAt: string | null;
  defaultVisibility: "public" | "unlisted" | "private";
  preferredFormat: "shorts" | "video";
  madeForKids: boolean;
  autoHashtags: boolean;
  stats: {
    subscriberCount: number | null;
    videoCount: number | null;
    viewCount: number | null;
  };
};

const DEFAULT_SETTINGS: YoutubeShortsSettings = {
  connected: false,
  accountConnected: false,
  channelUrl: "",
  channelHandle: "",
  channelName: "",
  channelId: "",
  accountEmail: "",
  accountName: "",
  avatarUrl: "",
  scopes: "",
  expiresAt: null,
  defaultVisibility: "public",
  preferredFormat: "shorts",
  madeForKids: false,
  autoHashtags: true,
  stats: {
    subscriberCount: null,
    videoCount: null,
    viewCount: null,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeSettings(value: unknown): YoutubeShortsSettings {
  const source = asRecord(value);
  const defaults = asRecord(source.defaults);
  const stats = asRecord(source.stats);
  const defaultVisibility = ["public", "unlisted", "private"].includes(String(source.defaultVisibility || defaults.defaultVisibility))
    ? String(source.defaultVisibility || defaults.defaultVisibility) as YoutubeShortsSettings["defaultVisibility"]
    : DEFAULT_SETTINGS.defaultVisibility;
  const preferredFormat = ["shorts", "video"].includes(String(source.preferredFormat || defaults.preferredFormat))
    ? String(source.preferredFormat || defaults.preferredFormat) as YoutubeShortsSettings["preferredFormat"]
    : DEFAULT_SETTINGS.preferredFormat;

  return {
    ...DEFAULT_SETTINGS,
    connected: Boolean(source.connected),
    accountConnected: Boolean(source.accountConnected ?? source.connected),
    channelUrl: String(source.channelUrl || source.url || ""),
    channelHandle: String(source.channelHandle || source.handle || ""),
    channelName: String(source.channelName || source.name || ""),
    channelId: String(source.channelId || ""),
    accountEmail: String(source.accountEmail || ""),
    accountName: String(source.accountName || ""),
    avatarUrl: String(source.avatarUrl || ""),
    scopes: String(source.scopes || ""),
    expiresAt: typeof source.expiresAt === "string" ? source.expiresAt : null,
    defaultVisibility,
    preferredFormat,
    madeForKids: Boolean(source.madeForKids ?? defaults.madeForKids),
    autoHashtags: (source.autoHashtags ?? defaults.autoHashtags) !== false,
    stats: {
      subscriberCount: safeNum(stats.subscriberCount),
      videoCount: safeNum(stats.videoCount),
      viewCount: safeNum(stats.viewCount),
    },
  };
}

function serializeSettings(settings: YoutubeShortsSettings) {
  return {
    connected: settings.connected,
    accountConnected: settings.accountConnected,
    channelUrl: settings.channelUrl,
    channelHandle: settings.channelHandle,
    channelName: settings.channelName,
    channelId: settings.channelId,
    accountEmail: settings.accountEmail,
    accountName: settings.accountName,
    avatarUrl: settings.avatarUrl,
    scopes: settings.scopes,
    expiresAt: settings.expiresAt,
    stats: settings.stats,
    defaults: {
      defaultVisibility: settings.defaultVisibility,
      preferredFormat: settings.preferredFormat,
      madeForKids: settings.madeForKids,
      autoHashtags: settings.autoHashtags,
    },
  };
}

function emitDashboardUpdate(settings: YoutubeShortsSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("inrcy:youtube-shorts-settings-updated", {
    detail: {
      connected: settings.connected,
      channelUrl: settings.channelUrl,
      channelHandle: settings.channelHandle,
      channelName: settings.channelName,
    },
  }));
}

export default function YoutubeShortsSettingsContent() {
  const [settings, setSettings] = useState<YoutubeShortsSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const patchSettings = useCallback((patch: Partial<YoutubeShortsSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/youtube-shorts/status", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(String(json?.error || "status_failed"));

      const nextSettings = normalizeSettings(json?.youtube_shorts);
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
    } catch (err) {
      console.warn("[youtube-shorts-settings] status failed", err);
      setError("Chargement de la connexion YouTube impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("linked") !== "youtube_shorts") return;
    if (params.get("ok") === "1") setNotice("Chaîne YouTube connectée.");
    if (params.get("ok") === "0") setError(params.get("message") || "Connexion YouTube impossible.");
  }, []);

  const saveSettings = useCallback(async (nextPatch?: Partial<YoutubeShortsSettings>) => {
    const nextSettings = { ...settings, ...(nextPatch ?? {}) };
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) throw new Error("Utilisateur non authentifié.");

      const { data, error: readError } = await supabase
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();
      if (readError) throw readError;

      const current = asRecord((data as any)?.settings);
      const merged = {
        ...current,
        youtube_shorts: serializeSettings(nextSettings),
      };

      const { error: upsertError } = await supabase
        .from("pro_tools_configs")
        .upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
      if (upsertError) throw upsertError;

      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
      setNotice("Réglages YouTube enregistrés.");
    } catch (err) {
      console.warn("[youtube-shorts-settings] save failed", err);
      setError("Enregistrement des réglages YouTube impossible.");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const connectYoutube = useCallback(() => {
    const returnTo = "/dashboard?panel=youtube_shorts";
    window.location.href = `/api/integrations/youtube-shorts/start?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const disconnectYoutube = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      const res = await fetch("/api/integrations/youtube-shorts/disconnect", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(String(json?.error || "disconnect_failed"));
      const nextSettings = normalizeSettings(json?.youtube_shorts);
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
      setNotice("Chaîne YouTube déconnectée.");
    } catch (err) {
      console.warn("[youtube-shorts-settings] disconnect failed", err);
      setError("Déconnexion YouTube impossible.");
    } finally {
      setSaving(false);
    }
  }, []);



  const connected = Boolean(settings.connected);
  const statusLabel = connected ? "Connecté" : "À connecter";
  const statusColor = connected ? "rgba(34,197,94,0.95)" : "rgba(148,163,184,0.9)";

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

      {loading ? (
        <div style={{ border: "1px solid rgba(125,211,252,0.18)", background: "rgba(14,165,233,0.08)", borderRadius: 12, padding: "10px 12px", color: "rgba(224,242,254,0.96)", fontSize: 13 }}>
          Chargement de la connexion YouTube...
        </div>
      ) : null}

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Compte YouTube</div>
          <ConnectionPill connected={connected} />
        </div>
        <div className={styles.blockSub}>
          Le professionnel autorise iNrCy à publier ses vidéos sur sa chaîne YouTube depuis Booster.
        </div>

        <input
          value={connected ? (settings.channelName || settings.channelHandle || "Chaîne YouTube connectée") : ""}
          readOnly
          placeholder={connected ? "Chaîne YouTube connectée" : "Aucune chaîne connectée"}
          style={{ ...inputStyle, opacity: connected ? 1 : 0.8 }}
        />

        {connected ? (
          <div style={{ color: "rgba(226,232,240,0.86)", fontSize: 12 }}>
            Compte utilisé : <strong>{settings.accountEmail || "Compte Google connecté"}</strong>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!connected ? (
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectYoutube} disabled={saving || loading}>
              {saving ? "Connexion..." : "Connecter YouTube"}
            </button>
          ) : (
            <>
              <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={connectYoutube} disabled={saving || loading}>
                Reconnecter YouTube
              </button>
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void disconnectYoutube()} disabled={saving || loading}>
                {saving ? "Déconnexion..." : "Déconnecter"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Lien de la chaîne</div>
          <ConnectionPill connected={Boolean(connected && settings.channelUrl?.trim())} />
        </div>
        <div className={styles.blockSub}>
          Lien public utilisé pour le bouton <strong>Voir la chaîne</strong> dans la bulle du dashboard.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={settings.channelUrl}
            onChange={(event) => patchSettings({ channelUrl: event.target.value })}
            placeholder="https://www.youtube.com/@monentreprise"
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void saveSettings()} disabled={saving || loading}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <a
              href={settings.channelUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className={`${styles.actionBtn} ${styles.viewBtn}`}
              style={{ pointerEvents: settings.channelUrl ? "auto" : "none", opacity: settings.channelUrl ? 1 : 0.5 }}
            >
              Voir la chaîne
            </a>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Réglages YouTube par défaut</div>
        </div>
        <div className={styles.blockSub}>
          Ces préférences serviront dans Booster pour préparer la publication YouTube avant validation finale.
        </div>

        <div
          style={{
            border: "1px solid rgba(56,189,248,0.22)",
            background: "rgba(14,165,233,0.08)",
            borderRadius: 12,
            padding: "10px 12px",
            color: "rgba(224,242,254,0.96)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          iNrCy publie vos vidéos sur <strong>YouTube</strong>. Si la vidéo est courte et adaptée, YouTube peut l’afficher au format court ; sinon elle reste une vidéo classique.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Visibilité par défaut</span>
            <select value={settings.defaultVisibility} onChange={(event) => patchSettings({ defaultVisibility: event.target.value as YoutubeShortsSettings["defaultVisibility"] })} style={selectStyle}>
              <option value="public">Public</option>
              <option value="unlisted">Non répertorié</option>
              <option value="private">Privé</option>
            </select>
          </label>

          <div style={switchRowStyle}>
            <PreferenceToggle label="Hashtags automatiques" checked={settings.autoHashtags} onChange={(autoHashtags) => patchSettings({ autoHashtags })} />
            <PreferenceToggle label="Contenu destiné aux enfants" checked={settings.madeForKids} onChange={(madeForKids) => patchSettings({ madeForKids })} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void saveSettings()} disabled={saving || loading}>
              {saving ? "Enregistrement..." : "Enregistrer mes réglages"}
            </button>
          </div>
        </div>
      </div>

      {notice ? <StatusMessage variant="success">{notice}</StatusMessage> : null}
      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
    </div>
  );
}
