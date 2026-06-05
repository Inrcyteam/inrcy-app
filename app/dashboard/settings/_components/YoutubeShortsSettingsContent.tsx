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
  channelUrl: string;
  channelHandle: string;
  defaultVisibility: "public" | "unlisted" | "private";
  preferredFormat: "shorts" | "video";
  madeForKids: boolean;
  autoHashtags: boolean;
};

const DEFAULT_SETTINGS: YoutubeShortsSettings = {
  connected: false,
  channelUrl: "",
  channelHandle: "",
  defaultVisibility: "public",
  preferredFormat: "shorts",
  madeForKids: false,
  autoHashtags: true,
};

function normalizeSettings(value: unknown): YoutubeShortsSettings {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const defaults = source.defaults && typeof source.defaults === "object" && !Array.isArray(source.defaults) ? source.defaults as Record<string, unknown> : {};
  const channelUrl = String(source.channelUrl ?? source.url ?? "");
  const channelHandle = String(source.channelHandle ?? source.handle ?? "");
  const defaultVisibility = ["public", "unlisted", "private"].includes(String(defaults.defaultVisibility))
    ? String(defaults.defaultVisibility) as YoutubeShortsSettings["defaultVisibility"]
    : DEFAULT_SETTINGS.defaultVisibility;
  const preferredFormat = ["shorts", "video"].includes(String(defaults.preferredFormat))
    ? String(defaults.preferredFormat) as YoutubeShortsSettings["preferredFormat"]
    : DEFAULT_SETTINGS.preferredFormat;

  return {
    connected: Boolean(source.connected),
    channelUrl,
    channelHandle,
    defaultVisibility,
    preferredFormat,
    madeForKids: Boolean(defaults.madeForKids),
    autoHashtags: defaults.autoHashtags !== false,
  };
}

function emitDashboardUpdate(settings: YoutubeShortsSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("inrcy:youtube-shorts-settings-updated", {
    detail: {
      connected: settings.connected,
      channelUrl: settings.channelUrl,
      channelHandle: settings.channelHandle,
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

      const nextSettings = normalizeSettings((data as any)?.settings?.youtube_shorts);
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
    } catch (err) {
      console.warn("[youtube-shorts-settings] read failed", err);
      setError("Chargement de la configuration YouTube Shorts impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

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

      const current = ((data as any)?.settings && typeof (data as any).settings === "object") ? (data as any).settings : {};
      const merged = {
        ...current,
        youtube_shorts: {
          connected: nextSettings.connected,
          channelUrl: nextSettings.channelUrl.trim(),
          channelHandle: nextSettings.channelHandle.trim(),
          defaults: {
            defaultVisibility: nextSettings.defaultVisibility,
            preferredFormat: nextSettings.preferredFormat,
            madeForKids: nextSettings.madeForKids,
            autoHashtags: nextSettings.autoHashtags,
          },
        },
      };

      const { error: upsertError } = await supabase
        .from("pro_tools_configs")
        .upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });

      if (upsertError) throw upsertError;

      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
      setNotice("Configuration YouTube Shorts enregistrée.");
    } catch (err) {
      console.warn("[youtube-shorts-settings] save failed", err);
      setError("Enregistrement de la configuration YouTube Shorts impossible.");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const connected = Boolean(settings.connected);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <p className={styles.blockSub} style={{ margin: 0 }}>Canal vidéo courte</p>
        <h2 style={{ margin: 0, fontSize: 22, color: "white" }}>Configuration YouTube Shorts</h2>
        <p className={styles.blockSub} style={{ margin: 0 }}>
          Préparez la chaîne, le lien public et les préférences qui serviront au canal YouTube Shorts dans le générateur.
        </p>
      </div>

      {loading ? (
        <div style={{ border: "1px solid rgba(125,211,252,0.18)", background: "rgba(14,165,233,0.08)", borderRadius: 12, padding: "10px 12px", color: "rgba(224,242,254,0.96)", fontSize: 13 }}>
          Chargement de la configuration YouTube Shorts...
        </div>
      ) : null}

      <div style={cardStyle}>
        <div className={styles.blockHeaderRow}>
          <div className={styles.blockTitle}>Chaîne YouTube</div>
          <ConnectionPill connected={connected} />
        </div>
        <div className={styles.blockSub}>
          L’accès client est piloté par Supabase via <strong>app_bubble_access.youtube_shorts</strong>. Ici, on configure le canal normalement.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Lien public de la chaîne</span>
            <input
              value={settings.channelUrl}
              onChange={(event) => patchSettings({ channelUrl: event.target.value })}
              placeholder="https://www.youtube.com/@monentreprise"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Identifiant / @handle</span>
            <input
              value={settings.channelHandle}
              onChange={(event) => patchSettings({ channelHandle: event.target.value })}
              placeholder="@monentreprise"
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!connected ? (
              <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={() => void saveSettings({ connected: true })} disabled={saving || loading}>
                {saving ? "Activation..." : "Activer la configuration"}
              </button>
            ) : (
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={() => void saveSettings({ connected: false })} disabled={saving || loading}>
                {saving ? "Désactivation..." : "Désactiver la configuration"}
              </button>
            )}

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
          <div className={styles.blockTitle}>Réglages YouTube Shorts par défaut</div>
        </div>
        <div className={styles.blockSub}>
          Ces préférences préparent le futur envoi vidéo depuis Booster sans exposer le canal aux clients tant qu’il reste désactivé dans Supabase.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className={styles.blockSub} style={{ opacity: 0.92 }}>Format prioritaire</span>
            <select value={settings.preferredFormat} onChange={(event) => patchSettings({ preferredFormat: event.target.value as YoutubeShortsSettings["preferredFormat"] })} style={selectStyle}>
              <option value="shorts">Shorts vertical</option>
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
        </div>
      </div>

      {notice ? <StatusMessage variant="success">{notice}</StatusMessage> : null}
      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
    </div>
  );
}
