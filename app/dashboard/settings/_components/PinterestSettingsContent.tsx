"use client";

import { resolveActiveBrowserUserId } from "@/lib/browserAccountCache";

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
  preferredMedia: "image" | "video" | "auto";
  autoHashtags: boolean;
  boards: PinterestBoard[];
  defaultBoardId: string;
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
  preferredMedia: "auto",
  autoHashtags: true,
  boards: [],
  defaultBoardId: "",
  scopes: "",
  expiresAt: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  return Array.isArray(value)
    ? value.map(asBoard).filter((item): item is PinterestBoard => Boolean(item))
    : [];
}

function isPinterestConfigured(
  settings: Pick<PinterestSettings, "accountConnected">,
) {
  return Boolean(settings.accountConnected);
}

function normalizeSettings(value: unknown): PinterestSettings {
  const source = asRecord(value);
  const preferredMedia = ["image", "video", "auto"].includes(
    String(source.preferredMedia),
  )
    ? (String(source.preferredMedia) as PinterestSettings["preferredMedia"])
    : DEFAULT_SETTINGS.preferredMedia;
  const mode: PinterestSettings["mode"] =
    String(source.mode || "") === "oauth" ? "oauth" : "manual";

  const next = {
    connected: false,
    accountConnected: false,
    mode,
    accountName: "",
    username: "",
    profileUrl: "",
    preferredMedia,
    autoHashtags: source.autoHashtags !== false,
    // Profil et tableaux viennent toujours de Pinterest en direct, jamais d'une copie Supabase.
    boards: [],
    // Préférence iNrCy uniquement : l'identifiant du tableau choisi par le pro.
    defaultBoardId: String(source.defaultBoardId || "").trim(),
    scopes: "",
    expiresAt: null,
  };

  return {
    ...next,
    connected: isPinterestConfigured(next),
  };
}

function mergeSettings(
  saved: PinterestSettings,
  status: any,
): PinterestSettings {
  if (!status?.ok) return saved;
  const boards = normalizeBoards(status.boards);
  const accountConnected = Boolean(status.connected);
  const profileUrl = String(status.profileUrl || "");
  return {
    ...saved,
    connected: accountConnected,
    accountConnected,
    mode: accountConnected ? "oauth" : saved.mode,
    accountName: String(status.accountName || status.username || ""),
    username: String(status.username || ""),
    profileUrl,
    boards,
    defaultBoardId: String(
      status.defaultBoardId || saved.defaultBoardId || "",
    ).trim(),
    scopes: String(status.scopes || ""),
    expiresAt: String(status.expiresAt || "") || null,
  };
}

function emitDashboardUpdate(settings: PinterestSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("inrcy:pinterest-settings-updated", {
      detail: {
        connected: settings.connected,
        profileUrl: settings.profileUrl,
        accountName: settings.accountName || settings.username,
      },
    }),
  );
}

export default function PinterestSettingsContent() {
  const [settings, setSettings] = useState<PinterestSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [boardAction, setBoardAction] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardName, setEditingBoardName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [{ data: authData }, statusResponse] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/integrations/pinterest/status", {
          cache: "no-store" as any,
        }).catch(() => null),
      ]);
      const user = authData?.user;
      if (!user) throw new Error("Utilisateur non authentifié.");
      const { data, error: readError } = await supabase
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", resolveActiveBrowserUserId(user.id))
        .maybeSingle();
      if (readError) throw readError;

      const savedSettings = normalizeSettings(
        asRecord((data as { settings?: unknown } | null)?.settings).pinterest,
      );
      const status = statusResponse?.ok
        ? await statusResponse.json().catch(() => null)
        : null;
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

  const connectPinterest = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href =
      "/api/integrations/pinterest/start?returnTo=/dashboard?panel=pinterest";
  }, []);

  const refreshBoards = useCallback(
    async (successMessage = "Tableaux Pinterest actualisés.") => {
      setSyncing(true);
      setNotice(null);
      setError(null);
      try {
        const response = await fetch("/api/integrations/pinterest/boards", {
          cache: "no-store" as any,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok)
          throw new Error(
            String(
              json?.error || "Impossible de récupérer les tableaux Pinterest.",
            ),
          );
        const boards = normalizeBoards(json.boards);
        const defaultBoardId = String(json.defaultBoardId || "").trim();
        setSettings((current) => ({ ...current, boards, defaultBoardId }));
        if (successMessage) setNotice(successMessage);
        return boards;
      } catch (err) {
        console.warn("[pinterest-settings] boards sync failed", err);
        setError(
          err instanceof Error
            ? err.message
            : "Synchronisation des tableaux Pinterest impossible.",
        );
        return [];
      } finally {
        setSyncing(false);
      }
    },
    [],
  );

  const createBoard = useCallback(async () => {
    const name = newBoardName.trim().replace(/\s+/g, " ");
    if (!name) {
      setError("Saisis un nom de tableau.");
      return;
    }

    setBoardAction("create");
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/pinterest/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok)
        throw new Error(
          String(json?.error || "Création du tableau impossible."),
        );
      const createdBoard = asBoard(json?.board);
      const defaultBoardId = String(json?.defaultBoardId || "").trim();

      setNewBoardName("");
      setSettings((current) => {
        const boards = createdBoard
          ? [createdBoard, ...current.boards.filter((item) => item.id !== createdBoard.id)]
          : current.boards;
        return {
          ...current,
          boards,
          defaultBoardId:
            defaultBoardId || current.defaultBoardId || createdBoard?.id || "",
        };
      });
      setNotice(`Tableau « ${name} » créé sur Pinterest.`);
    } catch (err) {
      console.warn("[pinterest-settings] board create failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Création du tableau Pinterest impossible.",
      );
    } finally {
      setBoardAction(null);
    }
  }, [newBoardName]);

  const startRenameBoard = useCallback((board: PinterestBoard) => {
    setEditingBoardId(board.id);
    setEditingBoardName(board.name);
    setNotice(null);
    setError(null);
  }, []);

  const renameBoard = useCallback(
    async (board: PinterestBoard) => {
      const name = editingBoardName.trim().replace(/\s+/g, " ");
      if (!name) {
        setError("Le nom du tableau est obligatoire.");
        return;
      }
      if (name === board.name) {
        setEditingBoardId(null);
        setEditingBoardName("");
        return;
      }

      setBoardAction(`rename:${board.id}`);
      setNotice(null);
      setError(null);
      try {
        const response = await fetch(
          `/api/integrations/pinterest/boards/${encodeURIComponent(board.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          },
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok)
          throw new Error(
            String(json?.error || "Modification du tableau impossible."),
          );
        setEditingBoardId(null);
        setEditingBoardName("");
        await refreshBoards(`Tableau renommé « ${name} ».`);
      } catch (err) {
        console.warn("[pinterest-settings] board rename failed", err);
        setError(
          err instanceof Error
            ? err.message
            : "Modification du tableau Pinterest impossible.",
        );
      } finally {
        setBoardAction(null);
      }
    },
    [editingBoardName, refreshBoards],
  );

  const deleteBoard = useCallback(
    async (board: PinterestBoard) => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          `Supprimer le tableau « ${board.name} » ?\n\nCette action sera effectuée directement sur votre compte Pinterest.`,
        );
        if (!confirmed) return;
      }

      setBoardAction(`delete:${board.id}`);
      setNotice(null);
      setError(null);
      try {
        const response = await fetch(
          `/api/integrations/pinterest/boards/${encodeURIComponent(board.id)}`,
          {
            method: "DELETE",
          },
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok)
          throw new Error(
            String(json?.error || "Suppression du tableau impossible."),
          );
        if (editingBoardId === board.id) {
          setEditingBoardId(null);
          setEditingBoardName("");
        }
        await refreshBoards(`Tableau « ${board.name} » supprimé de Pinterest.`);
      } catch (err) {
        console.warn("[pinterest-settings] board delete failed", err);
        setError(
          err instanceof Error
            ? err.message
            : "Suppression du tableau Pinterest impossible.",
        );
      } finally {
        setBoardAction(null);
      }
    },
    [editingBoardId, refreshBoards],
  );

  const setDefaultBoard = useCallback(async (board: PinterestBoard) => {
    setBoardAction(`default:${board.id}`);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/pinterest/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultBoardId: board.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok)
        throw new Error(String(json?.error || "Enregistrement impossible."));
      setSettings((current) => ({ ...current, defaultBoardId: board.id }));
      setNotice(`« ${board.name} » est maintenant le tableau par défaut.`);
    } catch (err) {
      console.warn("[pinterest-settings] default board failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Enregistrement du tableau par défaut impossible.",
      );
    } finally {
      setBoardAction(null);
    }
  }, []);

  const disconnectPinterest = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/pinterest/disconnect", {
        method: "POST",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok)
        throw new Error(String(json?.error || "Déconnexion impossible."));
      const nextSettings = {
        ...settings,
        connected: false,
        accountConnected: false,
        mode: "manual" as const,
        accountName: "",
        username: "",
        profileUrl: "",
        boards: [],
        defaultBoardId: "",
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
  const statusColor = settings.accountConnected
    ? "rgba(34,197,94,0.95)"
    : "rgba(148,163,184,0.9)";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
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
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: statusColor,
            }}
          />
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
            style={{
              ...inputStyle,
              opacity: settings.accountConnected ? 1 : 0.8,
            }}
            value={
              settings.accountConnected
                ? settings.accountName ||
                  settings.username ||
                  "Compte Pinterest connecté"
                : ""
            }
            readOnly
            placeholder={
              settings.accountConnected
                ? "Compte Pinterest connecté"
                : "Aucun compte connecté"
            }
            disabled={loading || !settings.accountConnected}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "nowrap",
            alignItems: "center",
            overflowX: "auto",
          }}
        >
          {!settings.accountConnected ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.connectBtn}`}
              onClick={connectPinterest}
              disabled={loading || syncing}
            >
              {syncing ? "Connexion..." : "Connecter Pinterest"}
            </button>
          ) : (
            <>
              {settings.profileUrl ? (
                <a
                  href={settings.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.viewBtn}`}
                  style={{ flex: "0 0 auto" }}
                >
                  Voir le compte
                </a>
              ) : null}
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.secondaryBtn}`}
                onClick={connectPinterest}
                disabled={loading || syncing}
                style={{ flex: "0 0 auto" }}
              >
                Reconnecter
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.disconnectBtn}`}
                onClick={disconnectPinterest}
                disabled={syncing}
                style={{ flex: "0 0 auto" }}
              >
                {syncing ? "Déconnexion..." : "Déconnecter"}
              </button>
            </>
          )}
        </div>
      </section>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      {notice ? (
        <StatusMessage variant="success">{notice}</StatusMessage>
      ) : null}

      {settings.accountConnected ? (
        <section style={cardStyle}>
          <div className={styles.blockHeaderRow}>
            <div className={styles.blockTitle}>Mes tableaux Pinterest</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.secondaryBtn}`}
                onClick={() => void refreshBoards("")}
                disabled={Boolean(boardAction) || syncing || loading}
                title="Actualiser les tableaux"
                aria-label="Actualiser les tableaux Pinterest"
                style={{ minWidth: 34, minHeight: 30, padding: "0 9px" }}
              >
                {syncing ? "…" : "↻"}
              </button>
              <ConnectionPill connected={settings.accountConnected} />
            </div>
          </div>
          <div className={styles.blockSub}>
            Gérez ici vos tableaux. Les actions sont appliquées directement sur
            votre compte Pinterest.
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              style={{ ...inputStyle, flex: "1 1 260px" }}
              value={newBoardName}
              onChange={(event) => setNewBoardName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createBoard();
                }
              }}
              maxLength={180}
              placeholder="Nom du nouveau tableau"
              disabled={Boolean(boardAction) || syncing || loading}
            />
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.connectBtn}`}
              onClick={() => void createBoard()}
              disabled={
                Boolean(boardAction) ||
                syncing ||
                loading ||
                !newBoardName.trim()
              }
            >
              {boardAction === "create" ? "Création..." : "+ Créer un tableau"}
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {boardOptions.length === 0 ? (
              <div
                style={{
                  color: "rgba(255,255,255,0.68)",
                  fontSize: 13,
                  padding: "8px 2px",
                }}
              >
                Aucun tableau disponible. Créez votre premier tableau Pinterest.
              </div>
            ) : (
              boardOptions.map((board) => {
                const isEditing = editingBoardId === board.id;
                const isRenaming = boardAction === `rename:${board.id}`;
                const isDeleting = boardAction === `delete:${board.id}`;
                const isSettingDefault = boardAction === `default:${board.id}`;
                const isDefault = settings.defaultBoardId === board.id;
                const isBusy = Boolean(boardAction) || syncing;

                return (
                  <div
                    key={board.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(15,23,42,0.45)",
                      borderRadius: 12,
                      padding: 10,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    {isEditing ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <input
                          style={{ ...inputStyle, flex: "1 1 240px" }}
                          value={editingBoardName}
                          onChange={(event) =>
                            setEditingBoardName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void renameBoard(board);
                            }
                            if (event.key === "Escape") {
                              setEditingBoardId(null);
                              setEditingBoardName("");
                            }
                          }}
                          maxLength={180}
                          autoFocus
                          disabled={isRenaming}
                        />
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.connectBtn}`}
                          onClick={() => void renameBoard(board)}
                          disabled={isRenaming || !editingBoardName.trim()}
                        >
                          {isRenaming ? "Enregistrement..." : "Enregistrer"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.secondaryBtn}`}
                          onClick={() => {
                            setEditingBoardId(null);
                            setEditingBoardName("");
                          }}
                          disabled={isRenaming}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                color: "white",
                                fontWeight: 700,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {board.name}
                            </div>
                            {isDefault ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: "#fde68a",
                                  border: "1px solid rgba(250,204,21,0.35)",
                                  background: "rgba(250,204,21,0.10)",
                                  borderRadius: 999,
                                  padding: "3px 7px",
                                }}
                              >
                                ★ Par défaut
                              </span>
                            ) : null}
                          </div>
                          {typeof board.pin_count === "number" ? (
                            <div
                              style={{
                                color: "rgba(255,255,255,0.58)",
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              {board.pin_count}{" "}
                              {board.pin_count > 1 ? "épingles" : "épingle"}
                            </div>
                          ) : null}
                        </div>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          {!isDefault ? (
                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.secondaryBtn}`}
                              onClick={() => void setDefaultBoard(board)}
                              disabled={isBusy}
                            >
                              {isSettingDefault
                                ? "Enregistrement..."
                                : "Définir par défaut"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.secondaryBtn}`}
                            onClick={() => startRenameBoard(board)}
                            disabled={isBusy}
                          >
                            Renommer
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.pinterestConfigActionBtn} ${styles.disconnectBtn}`}
                            onClick={() => void deleteBoard(board)}
                            disabled={isBusy}
                          >
                            {isDeleting ? "Suppression..." : "Supprimer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
