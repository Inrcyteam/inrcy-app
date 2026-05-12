"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type LinkedinOrganization = { id: string; name: string; url?: string | null };
type LinkedinConnectionTarget = "profile" | "organization";

type UseLinkedinChannelOptions = {
  panel?: string | null;
  searchParams?: { get(name: string): string | null };
  patchChannelConnectionLocally: PatchChannelConnectionLocally;
  triggerChannelRefresh: TriggerChannelRefresh;
  updateRootSettingsKey: UpdateRootSettingsKey;
};

export function useLinkedinChannel({
  panel,
  searchParams,
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
  const [linkedinOrganizations, setLinkedinOrganizations] = useState<LinkedinOrganization[]>([]);
  const [linkedinOrganizationsLoading, setLinkedinOrganizationsLoading] = useState(false);
  const [linkedinOrganizationPickerOpen, setLinkedinOrganizationPickerOpen] = useState(false);
  const [linkedinSelectedOrganizationId, setLinkedinSelectedOrganizationId] = useState<string>("");
  const [linkedinSelectedOrganizationName, setLinkedinSelectedOrganizationName] = useState<string>("");
  const organizationsAutoLoadRef = useRef(false);

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

  const connectLinkedinAccount = useCallback(async (target: LinkedinConnectionTarget = "profile") => {
    const targetParam = target === "organization" ? "&linkedinTarget=organization" : "&linkedinTarget=profile";
    const returnTo = encodeURIComponent(`/dashboard?panel=linkedin${targetParam}`);
    window.location.href = `/api/integrations/linkedin/start?returnTo=${returnTo}`;
  }, []);

  const connectLinkedinBusinessAccount = useCallback(async () => {
    await connectLinkedinAccount("organization");
  }, [connectLinkedinAccount]);

  const disconnectLinkedinAccount = useCallback(async () => {
    await fetch("/api/integrations/linkedin/disconnect-account", { method: "POST" });
    setLinkedinAccountConnected(false);
    setLinkedinConnected(false);
    setLinkedinDisplayName("");
    setLinkedinUrl("");
    setLinkedinOrganizations([]);
    setLinkedinOrganizationPickerOpen(false);
    setLinkedinSelectedOrganizationId("");
    setLinkedinSelectedOrganizationName("");
    organizationsAutoLoadRef.current = false;
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
      profileUrl: "",
      orgId: "",
      orgName: "",
      orgUrl: "",
    });
    await triggerChannelRefresh("linkedin");
    setPanelSuccess("Compte LinkedIn déconnecté.");
  }, [patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess]);

  const persistLinkedinOrganization = useCallback(async (org: LinkedinOrganization, options?: { silent?: boolean }) => {
    if (!org?.id) return false;

    const resolvedUrl = (org.url || `https://www.linkedin.com/company/${org.id}`).trim();
    const res = await fetch("/api/integrations/linkedin/select-organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: org.id, orgName: org.name, orgUrl: resolvedUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPanelError(data?.error || "Impossible de connecter cette page LinkedIn.", "Impossible de connecter cette page LinkedIn.", 4200);
      return false;
    }

    const nextUrl = String(data?.profileUrl || data?.organizationUrl || resolvedUrl || linkedinUrl || "");
    setLinkedinSelectedOrganizationId(org.id);
    setLinkedinSelectedOrganizationName(org.name);
    setLinkedinOrganizationPickerOpen(false);
    setLinkedinAccountConnected(true);
    setLinkedinConnected(true);
    setLinkedinConnectionStatus("connected");
    if (nextUrl) setLinkedinUrl(nextUrl);
    await updateRootSettingsKey("linkedin", {
      accountConnected: true,
      connected: true,
      displayName: linkedinDisplayName,
      url: nextUrl,
      orgId: org.id,
      orgName: org.name,
      orgUrl: nextUrl,
    });
    patchChannelConnectionLocally("linkedin", {
      connected: true,
      accountConnected: true,
      configured: true,
      resourceId: org.id,
      resourceLabel: org.name,
      resourceUrl: nextUrl || null,
    }, { clearData: true });
    await triggerChannelRefresh("linkedin");
    if (!options?.silent) setPanelSuccess(`Page LinkedIn « ${org.name} » connectée.`, 2400);
    return true;
  }, [linkedinDisplayName, linkedinUrl, updateRootSettingsKey, patchChannelConnectionLocally, triggerChannelRefresh, setPanelSuccess, setPanelError]);

  const loadLinkedinOrganizations = useCallback(async (options?: { resetSelection?: boolean }) => {
    if (!linkedinAccountConnected) {
      setPanelError("Connectez d'abord votre accès LinkedIn.", "Connectez d'abord votre accès LinkedIn.", 2600);
      return;
    }

    setLinkedinOrganizationsLoading(true);
    try {
      const res = await fetch("/api/integrations/linkedin/organizations", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Impossible de récupérer les pages LinkedIn.");
      const orgs: unknown[] = Array.isArray(data?.organizations) ? data.organizations : [];
      const cleanOrgs: LinkedinOrganization[] = orgs
        .map((org): LinkedinOrganization => {
          const record = org && typeof org === "object" ? (org as Record<string, unknown>) : {};
          const rawId = record.id;
          const rawName = record.name;
          const rawUrl = record.url;
          const id = typeof rawId === "string" ? rawId : String(rawId || "");
          const name = typeof rawName === "string" ? rawName : String(rawName || id || "");
          const url = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : (id ? `https://www.linkedin.com/company/${id}` : null);
          return { id, name, url };
        })
        .filter((org: LinkedinOrganization) => Boolean(org.id && org.name));

      setLinkedinOrganizations(cleanOrgs);

      if (cleanOrgs.length === 1) {
        const only = cleanOrgs[0];
        const alreadyConnected = linkedinSelectedOrganizationId === only.id && linkedinConnected && !options?.resetSelection;
        if (!alreadyConnected) {
          const ok = await persistLinkedinOrganization(only, { silent: true });
          if (ok) setPanelSuccess(`Page LinkedIn « ${only.name} » connectée automatiquement.`, 2600);
        }
        setLinkedinOrganizationPickerOpen(false);
        return;
      }

      const matchedSelected = cleanOrgs.find((org: LinkedinOrganization) => org.id === linkedinSelectedOrganizationId);
      if (matchedSelected?.name) {
        setLinkedinSelectedOrganizationName(matchedSelected.name);
        if (matchedSelected.url && !options?.resetSelection) setLinkedinUrl(matchedSelected.url);
      }

      if (!cleanOrgs.length) {
        setLinkedinOrganizationPickerOpen(false);
        setPanelError(
          "Aucune page LinkedIn administrée trouvée. Vérifie les droits OAuth puis reconnecte LinkedIn.",
          "Aucune page LinkedIn administrée trouvée.",
          4200,
        );
      } else {
        setLinkedinOrganizationPickerOpen(true);
        if (!linkedinSelectedOrganizationId || options?.resetSelection) {
          setPanelSuccess("Sélectionnez la page LinkedIn à connecter.", 2400);
        }
      }
    } catch (error) {
      setPanelError(error, "Impossible de récupérer les pages LinkedIn.", 4200);
    } finally {
      setLinkedinOrganizationsLoading(false);
    }
  }, [linkedinAccountConnected, linkedinConnected, linkedinSelectedOrganizationId, persistLinkedinOrganization, setPanelSuccess, setPanelError]);

  useEffect(() => {
    const linked = searchParams?.get("linked");
    const ok = searchParams?.get("ok");
    const target = searchParams?.get("linkedinTarget");
    const shouldAutoLoad = panel === "linkedin" && linked === "linkedin" && ok === "1" && target === "organization";

    if (!shouldAutoLoad) {
      organizationsAutoLoadRef.current = false;
      return;
    }

    if (!linkedinAccountConnected || linkedinOrganizationsLoading || organizationsAutoLoadRef.current) return;

    organizationsAutoLoadRef.current = true;
    void loadLinkedinOrganizations();
  }, [panel, searchParams, linkedinAccountConnected, linkedinOrganizationsLoading, loadLinkedinOrganizations]);

  const selectLinkedinOrganization = useCallback(async (orgId: string) => {
    const org = linkedinOrganizations.find((item: LinkedinOrganization) => item.id === orgId);
    if (!org) return;
    await persistLinkedinOrganization(org);
  }, [linkedinOrganizations, persistLinkedinOrganization]);

  const useLinkedinPersonalProfile = useCallback(async () => {
    if (!linkedinAccountConnected) {
      setPanelError("Connectez d'abord votre profil LinkedIn.", "Connectez d'abord votre profil LinkedIn.", 2600);
      return;
    }

    const res = await fetch("/api/integrations/linkedin/select-organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "profile" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPanelError(data?.error || "Impossible d'utiliser le profil LinkedIn.", "Impossible d'utiliser le profil LinkedIn.", 4200);
      return;
    }

    const nextUrl = String(data?.profileUrl || linkedinUrl || "");
    setLinkedinSelectedOrganizationId("");
    setLinkedinSelectedOrganizationName("");
    setLinkedinOrganizationPickerOpen(false);
    setLinkedinConnected(true);
    setLinkedinConnectionStatus("connected");
    if (nextUrl) setLinkedinUrl(nextUrl);
    await updateRootSettingsKey("linkedin", {
      accountConnected: true,
      connected: true,
      displayName: linkedinDisplayName,
      url: nextUrl,
      profileUrl: nextUrl,
      orgId: "",
      orgName: "",
      orgUrl: "",
    });
    patchChannelConnectionLocally("linkedin", {
      connected: true,
      accountConnected: true,
      configured: true,
      resourceId: null,
      resourceLabel: linkedinDisplayName || null,
      resourceUrl: nextUrl || null,
    }, { clearData: true });
    await triggerChannelRefresh("linkedin");
    setPanelSuccess("Profil personnel LinkedIn activé.", 2200);
  }, [linkedinAccountConnected, linkedinDisplayName, linkedinUrl, updateRootSettingsKey, patchChannelConnectionLocally, triggerChannelRefresh, setPanelSuccess, setPanelError]);

  const saveLinkedinProfileUrl = useCallback(async () => {
    const raw = (linkedinUrl ?? "").trim();

    if (raw.length > 0) {
      const ok =
        raw.startsWith("https://www.linkedin.com/in/") ||
        raw.startsWith("https://linkedin.com/in/") ||
        raw.startsWith("https://www.linkedin.com/pub/") ||
        raw.startsWith("https://linkedin.com/pub/") ||
        raw.startsWith("https://www.linkedin.com/company/") ||
        raw.startsWith("https://linkedin.com/company/");
      if (!ok) {
        setPanelError("Lien LinkedIn invalide.", "Lien LinkedIn invalide. Exemple : https://www.linkedin.com/in/ton-profil ou https://www.linkedin.com/company/ta-page", 3600);
        return;
      }
    }

    const nextLinkedinSettings: Record<string, unknown> = {
      accountConnected: linkedinAccountConnected,
      connected: linkedinConnected,
      displayName: linkedinDisplayName,
      url: raw,
      orgId: linkedinSelectedOrganizationId,
      orgName: linkedinSelectedOrganizationName,
    };
    if (linkedinSelectedOrganizationId) {
      nextLinkedinSettings.orgUrl = raw;
    } else {
      nextLinkedinSettings.profileUrl = raw;
      nextLinkedinSettings.orgUrl = "";
    }

    await updateRootSettingsKey("linkedin", nextLinkedinSettings);

    patchChannelConnectionLocally("linkedin", {
      connected: linkedinConnected,
      accountConnected: linkedinAccountConnected,
      configured: linkedinConnected,
      resourceLabel: linkedinSelectedOrganizationName || linkedinDisplayName || null,
      resourceUrl: raw || null,
    }, { clearData: false });
    triggerChannelRefresh("linkedin");
    setPanelSuccess("Lien LinkedIn enregistré.", 1800);
  }, [linkedinUrl, linkedinAccountConnected, linkedinConnected, linkedinDisplayName, linkedinSelectedOrganizationId, linkedinSelectedOrganizationName, patchChannelConnectionLocally, updateRootSettingsKey, triggerChannelRefresh, setPanelSuccess, setPanelError]);

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
    connectLinkedinBusinessAccount,
    disconnectLinkedinAccount,
    saveLinkedinProfileUrl,
    linkedinOrganizations,
    linkedinOrganizationsLoading,
    linkedinOrganizationPickerOpen,
    linkedinSelectedOrganizationId,
    setLinkedinSelectedOrganizationId,
    linkedinSelectedOrganizationName,
    setLinkedinSelectedOrganizationName,
    loadLinkedinOrganizations,
    selectLinkedinOrganization,
    useLinkedinPersonalProfile,
    clearPanelNotices,
    setPanelSuccess,
    setPanelError,
  };
}
