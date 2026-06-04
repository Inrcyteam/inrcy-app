"use client";

import { useCallback, useEffect, useState } from "react";

import {
  normalizeTiktokCommercialContent,
  normalizeTiktokDefaults,
  normalizeTiktokPreferredMedia,
  normalizeTiktokSettings,
  TIKTOK_DEFAULT_MOCK_ACCOUNT,
  type TiktokCommercialContent,
  type TiktokPreferredMedia,
} from "@/lib/tiktokMockSettings";

type UseTiktokChannelArgs = {
  panel: string | null;
};

async function readJson(res: Response) {
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error || "Erreur TikTok"));
  }
  return json;
}

export function useTiktokChannel({ panel }: UseTiktokChannelArgs) {
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState(TIKTOK_DEFAULT_MOCK_ACCOUNT.username);
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

  const applyTiktok = useCallback((payload: unknown) => {
    const tiktok = normalizeTiktokSettings(payload);
    const defaults = normalizeTiktokDefaults(tiktok.defaults);

    setTiktokConnected(Boolean(tiktok.connected));
    setTiktokUsername(tiktok.username || TIKTOK_DEFAULT_MOCK_ACCOUNT.username);
    setTiktokProfileUrl(tiktok.profileUrl || "");
    setTiktokPreferredMediaState(defaults.preferredMedia);
    setTiktokAllowComments(defaults.allowComments);
    setTiktokAllowDuo(defaults.allowDuo);
    setTiktokAllowStitch(defaults.allowStitch);
    setTiktokPhotoAutoMusic(defaults.photoAutoMusic);
    setTiktokCommercialContentState(defaults.commercialContent);
    setTiktokAiContent(defaults.aiContent);
  }, []);

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

  const connectTiktokMock = useCallback(() => {
    setTiktokLoading(true);
    setTiktokProfileUrlNotice(null);
    setTiktokProfileUrlError(null);
    const returnTo = encodeURIComponent("/dashboard?panel=tiktok");
    window.location.href = `/api/integrations/tiktok/start?returnTo=${returnTo}`;
  }, []);

  const disconnectTiktokMock = useCallback(async () => {
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
    connectTiktokMock,
    disconnectTiktokMock,
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
