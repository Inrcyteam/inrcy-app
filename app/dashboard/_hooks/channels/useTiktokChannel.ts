"use client";

import { useCallback, useEffect, useState } from "react";

import type { DashboardChannelKey } from "@/lib/dashboardChannels";
import type { InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";

import {
  normalizeTiktokCommercialContent,
  normalizeTiktokDefaults,
  normalizeTiktokPreferredMedia,
  normalizeTiktokSettings,
  type TiktokCommercialContent,
  type TiktokPreferredMedia,
} from "@/lib/tiktokSettings";

type UseTiktokChannelArgs = {
  panel: string | null;
  patchChannelConnectionLocally?: (
    channel: DashboardChannelKey,
    patch: Partial<InrstatsChannelBlock["connection"]>,
    options?: { clearData?: boolean; clearError?: boolean },
  ) => void;
  triggerChannelRefresh?: (channel: DashboardChannelKey) => Promise<void>;
};

async function readJson(res: Response) {
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error || "Erreur TikTok"));
  }
  return json;
}

export function useTiktokChannel({ panel, patchChannelConnectionLocally, triggerChannelRefresh }: UseTiktokChannelArgs) {
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [tiktokProfileUrl, setTiktokProfileUrl] = useState("");
  const [tiktokProfileUrlNotice, setTiktokProfileUrlNotice] = useState<string | null>(null);
  const [tiktokProfileUrlError, setTiktokProfileUrlError] = useState<string | null>(null);
  const [tiktokSettingsNotice, setTiktokSettingsNotice] = useState<string | null>(null);
  const [tiktokSettingsError, setTiktokSettingsError] = useState<string | null>(null);
  const [tiktokLoading, setTiktokLoading] = useState(false);

  const [tiktokPreferredMedia, setTiktokPreferredMediaState] = useState<TiktokPreferredMedia>("video");
  const [tiktokAllowComments, setTiktokAllowComments] = useState(true);
  const [tiktokAllowDuo, setTiktokAllowDuo] = useState(true);
  const [tiktokAllowStitch, setTiktokAllowStitch] = useState(true);
  const [tiktokPhotoAutoMusic, setTiktokPhotoAutoMusic] = useState(true);
  const [tiktokCommercialContent, setTiktokCommercialContentState] = useState<TiktokCommercialContent>("none");
  const [tiktokAiContent, setTiktokAiContent] = useState(false);

  const setTiktokPreferredMedia = useCallback((value: string) => {
    setTiktokPreferredMediaState(normalizeTiktokPreferredMedia(value));
    setTiktokSettingsNotice(null);
    setTiktokSettingsError(null);
  }, []);

  const setTiktokCommercialContent = useCallback((value: string) => {
    setTiktokCommercialContentState(normalizeTiktokCommercialContent(value));
    setTiktokSettingsNotice(null);
    setTiktokSettingsError(null);
  }, []);

  const applyTiktok = useCallback((payload: unknown, options?: { refresh?: boolean }) => {
    const tiktok = normalizeTiktokSettings(payload);
    const defaults = normalizeTiktokDefaults(tiktok.defaults);

    const connected = Boolean(tiktok.connected);
    const username = connected ? (tiktok.username || "") : "";
    const profileUrl = connected ? (tiktok.profileUrl || "") : "";

    setTiktokConnected(connected);
    setTiktokUsername(username);
    setTiktokProfileUrl(profileUrl);
    setTiktokPreferredMediaState(defaults.preferredMedia);
    setTiktokAllowComments(defaults.allowComments);
    setTiktokAllowDuo(defaults.allowDuo);
    setTiktokAllowStitch(defaults.allowStitch);
    setTiktokPhotoAutoMusic(defaults.photoAutoMusic);
    setTiktokCommercialContentState(defaults.commercialContent);
    setTiktokAiContent(defaults.aiContent);

    patchChannelConnectionLocally?.("tiktok", {
      connected,
      accountConnected: connected,
      configured: connected,
      statsConnected: connected,
      expired: false,
      requiresUpdate: false,
      connectionStatus: connected ? "connected" : "disconnected",
      resourceId: connected ? (username || profileUrl || null) : null,
      resourceLabel: connected ? (username || null) : null,
      resourceUrl: connected ? (profileUrl || null) : null,
    }, { clearData: !connected, clearError: true });

    if (options?.refresh !== false) {
      void triggerChannelRefresh?.("tiktok").catch((error) => {
        console.warn("[tiktok] channel refresh failed", error);
      });
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inrcy:tiktok-settings-updated", {
        detail: { connected, username, profileUrl },
      }));
    }
  }, [patchChannelConnectionLocally, triggerChannelRefresh]);

  const loadTiktokStatus = useCallback(async () => {
    setTiktokLoading(true);
    try {
      const json = await readJson(await fetch("/api/integrations/tiktok/status", { credentials: "include" }));
      applyTiktok(json.tiktok);
    } catch (error) {
      setTiktokSettingsError(error instanceof Error ? error.message : "Impossible de charger TikTok.");
    } finally {
      setTiktokLoading(false);
    }
  }, [applyTiktok]);

  useEffect(() => {
    void loadTiktokStatus();
  }, [loadTiktokStatus]);

  useEffect(() => {
    if (panel !== "tiktok") return;
    void loadTiktokStatus();
  }, [panel, loadTiktokStatus]);

  const connectTiktok = useCallback(() => {
    setTiktokLoading(true);
    setTiktokProfileUrlNotice(null);
    setTiktokProfileUrlError(null);
    const returnTo = encodeURIComponent("/dashboard?panel=tiktok");
    window.location.href = `/api/integrations/tiktok/start?returnTo=${returnTo}`;
  }, []);

  const disconnectTiktok = useCallback(async () => {
    setTiktokLoading(true);
    try {
      const json = await readJson(await fetch("/api/integrations/tiktok/disconnect-account", {
        method: "POST",
        credentials: "include",
      }));
      applyTiktok(json.tiktok);
      setTiktokProfileUrlNotice("Compte TikTok déconnecté.");
      setTiktokProfileUrlError(null);
      setTiktokSettingsError(null);
    } catch (error) {
      setTiktokProfileUrlError(error instanceof Error ? error.message : "Déconnexion TikTok impossible.");
    } finally {
      setTiktokLoading(false);
    }
  }, [applyTiktok]);

  const saveTiktokProfileUrl = useCallback(async () => {
    setTiktokLoading(true);
    try {
      const json = await readJson(await fetch("/api/integrations/tiktok/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl: tiktokProfileUrl }),
      }));
      applyTiktok(json.tiktok);
      setTiktokProfileUrlNotice("Lien TikTok enregistré.");
      setTiktokProfileUrlError(null);
    } catch (error) {
      setTiktokProfileUrlError(error instanceof Error ? error.message : "Lien TikTok invalide.");
      setTiktokProfileUrlNotice(null);
    } finally {
      setTiktokLoading(false);
    }
  }, [applyTiktok, tiktokProfileUrl]);

  const saveTiktokDefaults = useCallback(async () => {
    setTiktokLoading(true);
    try {
      const json = await readJson(await fetch("/api/integrations/tiktok/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaults: {
            preferredMedia: tiktokPreferredMedia,
            allowComments: tiktokAllowComments,
            allowDuo: tiktokAllowDuo,
            allowStitch: tiktokAllowStitch,
            photoAutoMusic: tiktokPhotoAutoMusic,
            commercialContent: tiktokCommercialContent,
            aiContent: tiktokAiContent,
          },
        }),
      }));
      applyTiktok(json.tiktok);
      setTiktokSettingsNotice("Réglages TikTok enregistrés.");
      setTiktokSettingsError(null);
    } catch (error) {
      setTiktokSettingsError(error instanceof Error ? error.message : "Réglages TikTok impossibles à enregistrer.");
      setTiktokSettingsNotice(null);
    } finally {
      setTiktokLoading(false);
    }
  }, [applyTiktok, tiktokAiContent, tiktokAllowComments, tiktokAllowDuo, tiktokAllowStitch, tiktokCommercialContent, tiktokPhotoAutoMusic, tiktokPreferredMedia]);

  return {
    tiktokConnected,
    tiktokUsername,
    tiktokProfileUrl,
    setTiktokProfileUrl,
    tiktokProfileUrlNotice,
    tiktokProfileUrlError,
    tiktokSettingsNotice,
    tiktokSettingsError,
    tiktokLoading,
    connectTiktok,
    disconnectTiktok,
    saveTiktokProfileUrl,
    tiktokPreferredMedia,
    setTiktokPreferredMedia,
    tiktokAllowComments,
    setTiktokAllowComments,
    tiktokAllowDuo,
    setTiktokAllowDuo,
    tiktokAllowStitch,
    setTiktokAllowStitch,
    tiktokPhotoAutoMusic,
    setTiktokPhotoAutoMusic,
    tiktokCommercialContent,
    setTiktokCommercialContent,
    tiktokAiContent,
    setTiktokAiContent,
    saveTiktokDefaults,
    loadTiktokStatus,
  };
}
