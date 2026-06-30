"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type PinterestBoard = {
  id: string;
  name: string;
  url?: string | null;
  privacy?: string | null;
  pin_count?: number | null;
};

type PinterestSettings = {
  connected: boolean;
  accountConnected: boolean;
  mode: "oauth" | "manual";
  accountName: string;
  username: string;
  profileUrl: string;
  defaultBoardName: string;
  defaultBoardId: string;
  preferredMedia: "image" | "video" | "auto";
  autoHashtags: boolean;
  boards: PinterestBoard[];
  scopes: string;
  expiresAt: string | null;
};

const DEFAULT_SETTINGS: PinterestSettings = {
  connected: false,
  accountConnected: false,
  mode: "manual",
  accountName: "",
  username: "",
  profileUrl: "",
  defaultBoardName: "",
  defaultBoardId: "",
  preferredMedia: "auto",
  autoHashtags: true,
  boards: [],
  scopes: "",
  expiresAt: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asBoard(value: unknown): PinterestBoard | null {
  const board = asRecord(value);
  const id = String(board.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(board.name || "Tableau Pinterest"),
    url: String(board.url || "") || null,
    privacy: String(board.privacy || "") || null,
    pin_count: typeof board.pin_count === "number" ? board.pin_count : null,
  };
}

function normalizeBoards(value: unknown): PinterestBoard[] {
  return Array.isArray(value) ? value.map(asBoard).filter((item): item is PinterestBoard => Boolean(item)) : [];
}

function isPinterestConfigured(settings: Pick<PinterestSettings, "profileUrl" | "defaultBoardId" | "accountConnected">) {
  return Boolean(settings.accountConnected || settings.profileUrl.trim() || settings.defaultBoardId.trim());
}

function normalizeSettings(value: unknown): PinterestSettings {
  const source = asRecord(value);
  const preferredMedia = ["image", "video", "auto"].includes(String(source.preferredMedia))
    ? String(source.preferredMedia) as PinterestSettings["preferredMedia"]
    : DEFAULT_SETTINGS.preferredMedia;
  const mode: PinterestSettings["mode"] = String(source.mode || "") === "oauth" ? "oauth" : "manual";

  const next = {
    connected: false,
    accountConnected: Boolean(source.accountConnected),
    mode,
    accountName: String(source.accountName || source.displayName || source.username || ""),
    username: String(source.username || ""),
    profileUrl: String(source.profileUrl || source.url || ""),
    defaultBoardName: String(source.defaultBoardName || source.boardName || ""),
    defaultBoardId: String(source.defaultBoardId || source.boardId || ""),
    preferredMedia,
    autoHashtags: source.autoHashtags !== false,
    boards: normalizeBoards(source.boards),
    scopes: String(source.scopes || ""),
    expiresAt: String(source.expiresAt || "") || null,
  };

  return {
    ...next,
    connected: Boolean(source.connected) || isPinterestConfigured(next),
  };
}

function mergeSettings(saved: PinterestSettings, status: any): PinterestSettings {
  if (!status?.ok) return saved;
  const boards = normalizeBoards(status.boards);
  const defaultBoardId = String(status.defaultBoardId || saved.defaultBoardId || "");
  const selectedBoard = boards.find((board) => board.id === defaultBoardId);
  const accountConnected = Boolean(status.connected);
  const profileUrl = String(status.profileUrl || saved.profileUrl || "");
  return {
    ...saved,
    connected: accountConnected || saved.connected,
    accountConnected,
    mode: accountConnected ? "oauth" : saved.mode,
    username: String(status.username || saved.username || ""),
    profileUrl,
    defaultBoardId,
    defaultBoardName: String(status.defaultBoardName || selectedBoard?.name || saved.defaultBoardName || ""),
    boards: boards.length ? boards : saved.boards,
    scopes: String(status.scopes || saved.scopes || ""),
    expiresAt: String(status.expiresAt || saved.expiresAt || "") || null,
  };
}

function emitDashboardUpdate(settings: PinterestSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("inrcy:pinterest-settings-updated", {
    detail: {
      connected: settings.connected,
      profileUrl: settings.profileUrl,
      accountName: settings.accountName || settings.username,
    },
  }));
}

export default function PinterestSettingsContent() {
  const [settings, setSettings] = useState<PinterestSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback((next: Partial<PinterestSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [{ data: authData }, statusResponse] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/integrations/pinterest/status", { cache: "no-store" as any }).catch(() => null),
      ]);
      const user = authData?.user;
      if (!user) throw new Error("Utilisateur non authentifié.");
      const { data, error: readError } = await supabase
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();
      if (readError) throw readError;

      const savedSettings = normalizeSettings(asRecord((data as { settings?: unknown } | null)?.settings).pinterest);
      const status = statusResponse?.ok ? await statusResponse.json().catch(() => null) : null;
      const nextSettings = mergeSettings(savedSettings, status);
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
    } catch (err) {
      console.warn("[pinterest-settings] load failed", err);
      setError("Chargement des réglages Pinterest impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (override?: Partial<PinterestSettings>) => {
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

      const current = asRecord((data as { settings?: unknown } | null)?.settings);
      const mergedLocal = { ...settings, ...(override || {}) };
      const selectedBoard = mergedLocal.boards.find((board) => board.id === mergedLocal.defaultBoardId);
      const settingsToSave = {
        ...mergedLocal,
        defaultBoardName: selectedBoard?.name || mergedLocal.defaultBoardName,
        connected: isPinterestConfigured(mergedLocal),
      };
      const merged = { ...current, pinterest: settingsToSave };
      const { error: saveError } = await supabase
        .from("pro_tools_configs")
        .upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
      if (saveError) throw saveError;

      setSettings(settingsToSave);
      emitDashboardUpdate(settingsToSave);
      setNotice("Réglages Pinterest enregistrés.");
    } catch (err) {
      console.warn("[pinterest-settings] save failed", err);
      setError("Enregistrement Pinterest impossible.");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const connectPinterest = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = "/api/integrations/pinterest/start?returnTo=/dashboard?panel=pinterest";
  }, []);

  const refreshBoards = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/pinterest/boards", { cache: "no-store" as any });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(String(json?.error || "Impossible de récupérer les tableaux Pinterest."));
      const boards = normalizeBoards(json.boards);
      const fallbackBoard = boards[0] || null;
      const nextBoardId = boards.some((board) => board.id === settings.defaultBoardId)
        ? settings.defaultBoardId
        : fallbackBoard?.id || "";
      const nextBoardName = boards.find((board) => board.id === nextBoardId)?.name || "";
      await save({ boards, defaultBoardId: nextBoardId, defaultBoardName: nextBoardName });
      setNotice("Tableaux Pinterest synchronisés.");
    } catch (err) {
      console.warn("[pinterest-settings] boards sync failed", err);
      setError("Synchronisation des tableaux Pinterest impossible.");
    } finally {
      setSyncing(false);
    }
  }, [save, settings.defaultBoardId]);

  const disconnectPinterest = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/pinterest/disconnect", { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(String(json?.error || "Déconnexion impossible."));
      const nextSettings = {
        ...settings,
        connected: false,
        accountConnected: false,
        mode: "manual" as const,
        accountName: "",
        username: "",
        profileUrl: "",
        defaultBoardId: "",
        defaultBoardName: "",
        boards: [],
        scopes: "",
        expiresAt: null,
      };
      setSettings(nextSettings);
      emitDashboardUpdate(nextSettings);
      setNotice("Pinterest déconnecté.");
    } catch (err) {
      console.warn("[pinterest-settings] disconnect failed", err);
      setError("Déconnexion Pinterest impossible.");
    } finally {
      setSyncing(false);
    }
  }, [settings]);

  const boardOptions = useMemo(() => settings.boards, [settings.boards]);
  const statusLabel = settings.accountConnected ? "Connecté" : "À connecter";
  const statusColor = settings.accountConnected ? "rgba(34,197,94,0.95)" : "rgba(148,163,184,0.9)";

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
          Connectez le compte Pinterest utilisé pour vos publications.
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <input
            style={{ ...inputStyle, opacity: settings.accountConnected ? 1 : 0.8 }}
            value={settings.accountConnected ? (settings.accountName || settings.username || "Compte Pinterest connecté") : ""}
            onChange={(event) => patch({ accountName: event.target.value })}
            placeholder={settings.accountConnected ? "Compte Pinterest connecté" : "Aucun compte connecté"}
            disabled={loading || saving || !settings.accountConnected}
          />
          {settings.profileUrl ? (
            <a href={settings.profileUrl} target="_blank" rel="noreferrer" className={`${styles.actionBtn} ${styles.viewBtn}`} style={{ justifySelf: "flex-start" }}>
              Voir le compte
            </a>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!settings.accountConnected ? (
            <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} onClick={connectPinterest} disabled={loading || syncing}>
              {syncing ? "Connexion..." : "Connecter Pinterest"}
            </button>
          ) : (
            <>
              <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={connectPinterest} disabled={loading || syncing}>
                Reconnecter Pinterest
              </button>
              <button type="button" className={`${styles.actionBtn} ${styles.disconnectBtn}`} onClick={disconnectPinterest} disabled={syncing}>
                {syncing ? "Déconnexion..." : "Déconnexion"}
              </button>
            </>
          )}
        </div>
      </section>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      {notice ? <StatusMessage variant="success">{notice}</StatusMessage> : null}

      {settings.accountConnected ? (
        <section style={cardStyle}>
          <div className={styles.blockHeaderRow}>
            <div className={styles.blockTitle}>Tableau à utiliser</div>
            <ConnectionPill connected={Boolean(settings.defaultBoardId || settings.defaultBoardName)} />
          </div>
          <div className={styles.blockSub}>
            Choisissez où iNrCy publiera les épingles Pinterest.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={refreshBoards} disabled={syncing || loading || saving}>
              {syncing ? "Chargement..." : "Charger mes tableaux"}
            </button>

            <select
              style={{ ...inputStyle, flex: "1 1 260px" }}
              value={settings.defaultBoardId}
              onChange={(event) => {
                const board = boardOptions.find((item) => item.id === event.target.value);
                patch({ defaultBoardId: event.target.value, defaultBoardName: board?.name || "" });
              }}
              disabled={loading || saving || syncing}
            >
              <option value="">Choisir un tableau</option>
              {settings.defaultBoardId && !boardOptions.some((board) => board.id === settings.defaultBoardId) ? (
                <option value={settings.defaultBoardId}>{settings.defaultBoardName || "Tableau sélectionné"}</option>
              ) : null}
              {boardOptions.map((board) => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
          </div>

          <button type="button" className={`${styles.actionBtn} ${styles.connectBtn}`} style={{ justifySelf: "flex-start" }} onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
