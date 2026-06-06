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

function formatCompact(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

export default function YoutubeShortsSettingsContent() {
  const [settings, setSettings] = useState<YoutubeShortsSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

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



  const testYoutube = useCallback(async () => {
    setTesting(true);
    setDiagnostic(null);
    setNotice(null);
    setError(null);

    try {
      const res = await fetch("/api/integrations/youtube-shorts/diagnostics", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(String(json?.error || "diagnostics_failed"));

      const checks = asRecord(json?.checks);
      const missing = Array.isArray(json?.missing_scopes) ? json.missing_scopes.length : 0;
      const details = [
        `OAuth ${checks.oauth ? "OK" : "KO"}`,
        `Chaîne ${checks.channel ? "OK" : "KO"}`,
        `Analytics ${checks.analytics ? "OK" : "KO"}`,
        `Upload ${checks.upload_scope ? "OK" : "KO"}`,
      ].join(" · ");
      const msg = String(json?.message || "Diagnostic YouTube terminé.");
      const finalMessage = missing > 0 ? `${msg} Scopes manquants : ${missing}. ${details}` : `${msg} ${details}`;
      setDiagnostic(finalMessage);
      if (json?.ready) setNotice("Diagnostic YouTube validé.");
    } catch (err) {
      console.warn("[youtube-shorts-settings] diagnostics failed", err);
      setError("Test de connexion YouTube impossible.");
    } finally {
      setTesting(false);
    }
  }, []);

  const connected = Boolean(settings.connected);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <p className={styles.blockSub} style={{ margin: 0 }}>Canal vidéo</p>
        <h2 style={{ margin: 0, fontSize: 22, color: "white" }}>Configuration YouTube</h2>
        <p className={styles.blockSub} style={{ margin: 0 }}>
          Connectez la chaîne YouTube du professionnel. Les préférences ci-dessous serviront ensuite à la publication depuis Booster.
        </p>
      </div>

      {loading ? (
        <div style={{ border: "1px solid rgba(125,211,252,0.18)", background: "rgba(14,165,233,0.08)", borderRadius: 12, padding: "10px 12px", color: "rgba(224,242,254,0.96)", fontSize: 13 }}>
          Chargement de la connexion YouTube...
        </div>
      ) : null}

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Connexion YouTube</div>
          <ConnectionPill connected={connected} />
        </div>
        <div className={styles.blockSub}>
          Connexion OAuth réelle : compte Google, chaîne YouTube, jetons sécurisés et lien public de chaîne.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Chaîne connectée</span>
            <input
              value={settings.channelName || settings.channelHandle || "Aucune chaîne connectée"}
              readOnly
              style={{ ...inputStyle, opacity: connected ? 1 : 0.72 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Lien public de la chaîne</span>
            <input
              value={settings.channelUrl}
              readOnly
              placeholder="https://www.youtube.com/@monentreprise"
              style={{ ...inputStyle, opacity: connected ? 1 : 0.72 }}
            />
          </label>

          {connected ? (
            <div style={{ display: "grid", gap: 6, color: "rgba(226,232,240,0.86)", fontSize: 12 }}>
              <span>Compte : <strong>{settings.accountEmail || "Compte Google connecté"}</strong></span>
              <span>Abonnés : <strong>{formatCompact(settings.stats.subscriberCount)}</strong> · Vidéos : <strong>{formatCompact(settings.stats.videoCount)}</strong> · Vues chaîne : <strong>{formatCompact(settings.stats.viewCount)}</strong></span>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!connected ? (
              <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectYoutube} disabled={saving || loading}>
                Connecter YouTube
              </button>
            ) : (
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void disconnectYoutube()} disabled={saving || loading}>
                {saving ? "Déconnexion..." : "Déconnecter YouTube"}
              </button>
            )}

            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void loadSettings()} disabled={saving || loading}>
              Actualiser
            </button>

            {connected ? (
              <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void testYoutube()} disabled={saving || loading || testing}>
                {testing ? "Test..." : "Tester la connexion"}
              </button>
            ) : null}

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
          Ces préférences seront utilisées au moment de publier une vidéo depuis Booster.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Format prioritaire</span>
            <select value={settings.preferredFormat} onChange={(event) => patchSettings({ preferredFormat: event.target.value as YoutubeShortsSettings["preferredFormat"] })} style={selectStyle}>
              <option value="shorts">Vidéo courte verticale</option>
              <option value="video">Vidéo classique</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Visibilité par défaut</span>
            <select value={settings.defaultVisibility} onChange={(event) => patchSettings({ defaultVisibility: event.target.value as YoutubeShortsSettings["defaultVisibility"] })} style={selectStyle}>
              <option value="public">Public</option>
              <option value="unlisted">Non répertorié</option>
              <option value="private">Privé</option>
            </select>
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.45)", borderRadius: 12, padding: "10px 12px", color: "rgba(255,255,255,0.92)", fontSize: 14 }}>
            <span>Hashtags automatiques</span>
            <input type="checkbox" checked={settings.autoHashtags} onChange={(event) => patchSettings({ autoHashtags: event.target.checked })} />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.45)", borderRadius: 12, padding: "10px 12px", color: "rgba(255,255,255,0.92)", fontSize: 14 }}>
            <span>Contenu destiné aux enfants</span>
            <input type="checkbox" checked={settings.madeForKids} onChange={(event) => patchSettings({ madeForKids: event.target.checked })} />
          </label>

          <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void saveSettings()} disabled={saving || loading}>
            {saving ? "Enregistrement..." : "Enregistrer les réglages"}
          </button>
        </div>
      </div>

      {diagnostic ? <StatusMessage variant="success">{diagnostic}</StatusMessage> : null}
      {notice ? <StatusMessage variant="success">{notice}</StatusMessage> : null}
      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
    </div>
  );
}
