"use client";

import { useCallback, useState } from "react";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import type { ConnectionDisplayStatus } from "@/lib/connectionVersions";
import type { DashboardChannelKey } from "@/lib/dashboardChannels";
import type { InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";

type PatchChannelConnectionLocally = (
  channel: DashboardChannelKey,
  patch: Partial<InrstatsChannelBlock["connection"]>,
  options?: { clearData?: boolean; clearError?: boolean },
) => void;

type TriggerChannelRefresh = (channel: DashboardChannelKey) => Promise<void>;

type UpdateRootSettingsKey = (key: "gmb" | "facebook" | "instagram" | "linkedin", nextObj: any) => Promise<void>;

type UseLinkedinChannelOptions = {
  patchChannelConnectionLocally: PatchChannelConnectionLocally;
  triggerChannelRefresh: TriggerChannelRefresh;
  updateRootSettingsKey: UpdateRootSettingsKey;
};

export function useLinkedinChannel({
  patchChannelConnectionLocally,
  triggerChannelRefresh,
  updateRootSettingsKey,
}: UseLinkedinChannelOptions) {
  const [linkedinUrl, setLinkedinUrl] = useState<string>("");
  const [linkedinAccountConnected, setLinkedinAccountConnected] = useState<boolean>(false);
  const [linkedinConnected, setLinkedinConnected] = useState<boolean>(false);
  const [linkedinConnectionStatus, setLinkedinConnectionStatus] = useState<ConnectionDisplayStatus>("disconnected");
  const [linkedinDisplayName, setLinkedinDisplayName] = useState<string>("");
  const [linkedinUrlNotice, setLinkedinUrlNotice] = useState<string | null>(null);
  const [linkedinUrlError, setLinkedinUrlError] = useState<string | null>(null);

  const clearPanelNotices = useCallback(() => {
    setLinkedinUrlNotice(null);
    setLinkedinUrlError(null);
  }, []);

  const setPanelSuccess = useCallback((message: string, timeout = 2200) => {
    clearPanelNotices();
    const clean = message.trim();
    setLinkedinUrlNotice(clean);
    window.setTimeout(clearPanelNotices, timeout);
  }, [clearPanelNotices]);

  const setPanelError = useCallback((input: unknown, fallback: string, timeout = 3200) => {
    clearPanelNotices();
    const clean = getSimpleFrenchErrorMessage(input, fallback);
    setLinkedinUrlError(clean);
    window.setTimeout(clearPanelNotices, timeout);
  }, [clearPanelNotices]);

  const connectLinkedinAccount = useCallback(async () => {
    const returnTo = encodeURIComponent("/dashboard?panel=linkedin");
    window.location.href = `/api/integrations/linkedin/start?returnTo=${returnTo}`;
  }, []);

  const disconnectLinkedinAccount = useCallback(async () => {
    await fetch("/api/integrations/linkedin/disconnect-account", { method: "POST" });
    setLinkedinAccountConnected(false);
    setLinkedinConnected(false);
    setLinkedinDisplayName("");
    setLinkedinUrl("");
    patchChannelConnectionLocally("linkedin", {
      connected: false,
      accountConnected: false,
      configured: false,
      expired: false,
      resourceId: null,
      resourceLabel: null,
      resourceUrl: null,
    }, { clearData: true });
    await updateRootSettingsKey("linkedin", {
      accountConnected: false,
      connected: false,
      displayName: "",
      url: "",
    });
    triggerChannelRefresh("linkedin");
    setPanelSuccess("Compte LinkedIn déconnecté.");
  }, [patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess]);

  const saveLinkedinProfileUrl = useCallback(async () => {
    const raw = (linkedinUrl ?? "").trim();

    if (raw.length > 0) {
      const ok =
        raw.startsWith("https://www.linkedin.com/in/") ||
        raw.startsWith("https://linkedin.com/in/") ||
        raw.startsWith("https://www.linkedin.com/pub/") ||
        raw.startsWith("https://linkedin.com/pub/");
      if (!ok) {
        setPanelError("Lien LinkedIn invalide.", "Lien LinkedIn invalide. Exemple : https://www.linkedin.com/in/ton-profil", 3600);
        return;
      }
    }

    await updateRootSettingsKey("linkedin", {
      accountConnected: linkedinAccountConnected,
      connected: linkedinConnected,
      displayName: linkedinDisplayName,
      url: raw,
    });

    patchChannelConnectionLocally("linkedin", {
      connected: linkedinConnected,
      accountConnected: linkedinAccountConnected,
      configured: linkedinConnected,
      resourceLabel: linkedinDisplayName || null,
      resourceUrl: raw || null,
    }, { clearData: false });
    triggerChannelRefresh("linkedin");
    setPanelSuccess("Lien LinkedIn enregistré.", 1800);
  }, [linkedinUrl, linkedinAccountConnected, linkedinConnected, linkedinDisplayName, patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess, setPanelError]);

  return {
    linkedinUrl,
    setLinkedinUrl,
    linkedinAccountConnected,
    setLinkedinAccountConnected,
    linkedinConnected,
    setLinkedinConnected,
    linkedinConnectionStatus,
    setLinkedinConnectionStatus,
    linkedinDisplayName,
    setLinkedinDisplayName,
    linkedinUrlNotice,
    setLinkedinUrlNotice,
    linkedinUrlError,
    connectLinkedinAccount,
    disconnectLinkedinAccount,
    saveLinkedinProfileUrl,
    clearPanelNotices,
    setPanelSuccess,
    setPanelError,
  };
}
