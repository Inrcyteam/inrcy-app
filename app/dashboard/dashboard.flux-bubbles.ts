import type { DashboardFluxBubbleData } from "./_components/DashboardFluxBubble";
import { fluxModules, MODULE_ICONS } from "./dashboard.constants";
import { statusLabel } from "./dashboard.utils";
import { getBubbleStatusFromBlock, getBubbleViewHrefFromBlock, normalizeExternalHref } from "./dashboard.shared";
import type { DashboardChannelKey } from "@/lib/dashboardChannels";
import type { InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";
import type { ModuleStatus } from "./dashboard.types";
import { isBubbleEnabled, normalizeAppBubbleKey, type AppBubbleAccessMap } from "@/lib/bubbleAccess";

type BuildFluxBubbleItemsArgs = {
  bubbleAccessMap: AppBubbleAccessMap;
  canConfigureSite: boolean;
  canViewSite: boolean;
  channelBlocks: any;
  facebookPageConnected: boolean;
  facebookUrl: string | null | undefined;
  getSiteBubbleProgress: (kind: "site_inrcy" | "site_web") => { status: ModuleStatus; text: string };
  gmbConnected: boolean;
  gmbUrl: string | null | undefined;
  instagramConnected: boolean;
  instagramUrl: string | null | undefined;
  inrBadgeLogoUrl?: string | null;
  inrBadgeProfileReady: boolean;
  onOpenInrBadgeModal: () => void;
  linkedinConnected: boolean;
  linkedinUrl: string | null | undefined;
  mailAccountsConnectedCount: number;
  tiktokConnected: boolean;
  tiktokUrl: string | null | undefined;
  youtubeShortsConnected: boolean;
  youtubeShortsUrl: string | null | undefined;
  openPanel: (panel: any) => void;
  savedSiteWebUrlMeta: unknown;
  setHelpSiteInrcyOpen: (open: boolean) => void;
  setHelpSiteWebOpen: (open: boolean) => void;
  siteInrcySavedUrl: string | null | undefined;
  siteWebSavedUrl: string | null | undefined;
};

export function buildFluxBubbleItems(args: BuildFluxBubbleItemsArgs): DashboardFluxBubbleData[] {
  const {
    bubbleAccessMap,
    canConfigureSite,
    canViewSite,
    channelBlocks,
    facebookPageConnected,
    facebookUrl,
    getSiteBubbleProgress,
    gmbConnected,
    gmbUrl,
    instagramConnected,
    instagramUrl,
    inrBadgeLogoUrl,
    inrBadgeProfileReady,
    onOpenInrBadgeModal,
    linkedinConnected,
    linkedinUrl,
    mailAccountsConnectedCount,
    tiktokConnected,
    tiktokUrl,
    youtubeShortsConnected,
    youtubeShortsUrl,
    openPanel,
    savedSiteWebUrlMeta,
    setHelpSiteInrcyOpen,
    setHelpSiteWebOpen,
    siteInrcySavedUrl,
    siteWebSavedUrl,
  } = args;

  return fluxModules.map((m) => {
    const bubbleKey = normalizeAppBubbleKey(m.key);
    const accessEnabled = bubbleKey ? isBubbleEnabled(bubbleAccessMap, bubbleKey) : true;
    const channelKey = m.key as DashboardChannelKey;
    const channelBlock = channelBlocks?.[channelKey] ?? null;
    const blockDrivenStatus = getBubbleStatusFromBlock(channelKey, channelBlock as InrstatsChannelBlock);
    const blockDrivenViewHref = getBubbleViewHrefFromBlock(channelKey, channelBlock);

    const viewActionRaw = m.actions.find((a) => a.variant === "view");
    const viewAction =
      (m.key === "site_inrcy" && viewActionRaw)
        ? { ...viewActionRaw, href: normalizeExternalHref(blockDrivenViewHref || siteInrcySavedUrl) || "#" }
        : (m.key === "site_web" && viewActionRaw)
          ? { ...viewActionRaw, href: normalizeExternalHref(blockDrivenViewHref || siteWebSavedUrl) || "#" }
          : (m.key === "instagram" && viewActionRaw)
            ? { ...viewActionRaw, href: normalizeExternalHref(blockDrivenViewHref || instagramUrl) || "#" }
            : (m.key === "linkedin" && viewActionRaw)
              ? { ...viewActionRaw, href: normalizeExternalHref(blockDrivenViewHref || linkedinUrl) || "#" }
              : viewActionRaw;

    const { status: bubbleStatus, text: bubbleStatusText } = !accessEnabled
      ? { status: "coming" as ModuleStatus, text: "Désactivé" }
      : (m.key === "site_inrcy")
      ? getSiteBubbleProgress("site_inrcy")
      : (m.key === "site_web")
        ? getSiteBubbleProgress("site_web")
        : blockDrivenStatus ?? (() => {
          if (m.key === "inrbadge") return inrBadgeProfileReady ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "Déconnecté" };
          if (m.key === "instagram") return instagramConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "linkedin") return linkedinConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "gmb") return gmbConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "facebook") return facebookPageConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "mails") {
            const count = Math.max(0, Math.round(Number(mailAccountsConnectedCount) || 0));
            return count > 0
              ? { status: "connected" as ModuleStatus, text: "Connecté" }
              : { status: "available" as ModuleStatus, text: "A connecter" };
          }
          if (m.key === "tiktok") return tiktokConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "youtube_shorts") return youtubeShortsConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "inr_agent") return { status: "connected" as ModuleStatus, text: "Connecté" };
          return { status: m.status, text: statusLabel(m.status) };
        })();

    const specialViewHref = m.key === "site_inrcy"
      ? (blockDrivenViewHref || normalizeExternalHref(siteInrcySavedUrl) || "#")
      : m.key === "site_web"
        ? (blockDrivenViewHref || normalizeExternalHref(siteWebSavedUrl) || "#")
        : m.key === "instagram"
          ? (blockDrivenViewHref || normalizeExternalHref(instagramUrl) || "#")
          : m.key === "linkedin"
            ? (blockDrivenViewHref || normalizeExternalHref(linkedinUrl) || "#")
            : m.key === "gmb"
              ? (blockDrivenViewHref || normalizeExternalHref(gmbUrl) || "#")
              : m.key === "facebook"
                ? (blockDrivenViewHref || normalizeExternalHref(facebookUrl) || "#")
                : m.key === "tiktok"
                  ? (blockDrivenViewHref || normalizeExternalHref(tiktokUrl) || "#")
                  : m.key === "youtube_shorts"
                    ? (blockDrivenViewHref || normalizeExternalHref(youtubeShortsUrl) || "#")
                    : undefined;

    const specialViewLabel = m.key === "inrbadge"
      ? "Voir mon badge"
      : m.key === "site_inrcy"
        ? "Voir le site"
        : m.key === "site_web"
          ? "Voir le site"
          : m.key === "gmb"
            ? "Voir la page"
            : ["instagram", "linkedin", "facebook", "tiktok"].includes(m.key)
              ? "Voir le compte"
              : m.key === "youtube_shorts"
                ? "Voir la chaîne"
                : undefined;

    const canViewSpecial = m.key === "inrbadge"
      ? inrBadgeProfileReady
      : m.key === "site_inrcy"
        ? Boolean(blockDrivenViewHref || canViewSite)
      : m.key === "site_web"
        ? Boolean(blockDrivenViewHref || savedSiteWebUrlMeta)
        : m.key === "instagram"
          ? Boolean(blockDrivenViewHref || instagramUrl)
          : m.key === "linkedin"
            ? Boolean(blockDrivenViewHref || linkedinUrl)
            : m.key === "gmb"
              ? Boolean(blockDrivenViewHref || gmbUrl)
              : m.key === "facebook"
                ? Boolean(blockDrivenViewHref || facebookUrl)
                : m.key === "tiktok"
                  ? Boolean(blockDrivenViewHref || tiktokUrl)
                  : m.key === "youtube_shorts"
                    ? Boolean(blockDrivenViewHref || youtubeShortsUrl)
                    : undefined;

    const onConfigure = () => {
      if (!accessEnabled) return;
      if (m.key === "site_inrcy") {
        if (!canConfigureSite) return;
        openPanel("site_inrcy");
        return;
      }
      if (m.key === "tiktok") {
        openPanel("tiktok");
        return;
      }
      if (m.key === "youtube_shorts") {
        openPanel("youtube_shorts");
        return;
      }
      if (m.key === "inr_agent") {
        openPanel("inr_agent");
        return;
      }
      if (m.key === "inrbadge") {
        openPanel("inrbadge");
        return;
      }
      if (m.key === "mails") {
        openPanel("mails");
        return;
      }
      if (["site_web", "instagram", "linkedin", "gmb", "facebook"].includes(m.key)) openPanel(m.key as any);
    };

    return {
      key: m.key,
      name: m.name,
      description: m.description,
      accent: m.accent,
      logoSrc: MODULE_ICONS[m.key]?.src,
      logoAlt: MODULE_ICONS[m.key]?.alt,
      bubbleStatus,
      bubbleStatusText,
      helpKind: m.key === "site_inrcy" ? "site_inrcy" : m.key === "site_web" ? "site_web" : undefined,
      onHelpSiteInrcy: () => setHelpSiteInrcyOpen(true),
      onHelpSiteWeb: () => setHelpSiteWebOpen(true),
      specialViewHref,
      specialViewLabel,
      canViewSpecial: accessEnabled ? canViewSpecial : false,
      onSpecialView: accessEnabled && m.key === "inrbadge" ? onOpenInrBadgeModal : undefined,
      viewAction: accessEnabled && !(specialViewHref || m.key === "inrbadge") ? viewAction : undefined,
      onConfigure,
      configureDisabled: !accessEnabled || (m.key === "site_inrcy" ? !canConfigureSite : false),
      configureTitle: !accessEnabled
        ? "Option désactivée"
        : m.key === "site_inrcy" && !canConfigureSite
          ? "Disponible uniquement si vous avez un site iNrCy"
          : undefined,
    };
  });
}
