import type { DashboardFluxBubbleData } from "./_components/DashboardFluxBubble";
import { fluxModules, MODULE_ICONS } from "./dashboard.constants";
import { statusLabel } from "./dashboard.utils";
import { getBubbleStatusFromBlock, getBubbleViewHrefFromBlock, normalizeExternalHref } from "./dashboard.shared";
import type { DashboardChannelKey } from "@/lib/dashboardChannels";
import type { InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";
import type { ModuleStatus } from "./dashboard.types";

type BuildFluxBubbleItemsArgs = {
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
  linkedinConnected: boolean;
  linkedinUrl: string | null | undefined;
  tiktokConnected: boolean;
  tiktokUrl: string | null | undefined;
  openPanel: (panel: any) => void;
  savedSiteWebUrlMeta: unknown;
  setHelpSiteInrcyOpen: (open: boolean) => void;
  setHelpSiteWebOpen: (open: boolean) => void;
  siteInrcySavedUrl: string | null | undefined;
  siteWebSavedUrl: string | null | undefined;
};

export function buildFluxBubbleItems(args: BuildFluxBubbleItemsArgs): DashboardFluxBubbleData[] {
  const {
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
    linkedinConnected,
    linkedinUrl,
    tiktokConnected,
    tiktokUrl,
    openPanel,
    savedSiteWebUrlMeta,
    setHelpSiteInrcyOpen,
    setHelpSiteWebOpen,
    siteInrcySavedUrl,
    siteWebSavedUrl,
  } = args;

  return fluxModules.map((m) => {
    const tiktokComingSoon = m.key === "tiktok";
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

    const { status: bubbleStatus, text: bubbleStatusText } = tiktokComingSoon
      ? { status: "coming" as ModuleStatus, text: "Arrive bientôt" }
      : (m.key === "site_inrcy")
      ? getSiteBubbleProgress("site_inrcy")
      : (m.key === "site_web")
        ? getSiteBubbleProgress("site_web")
        : blockDrivenStatus ?? (() => {
          if (m.key === "instagram") return instagramConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "linkedin") return linkedinConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "gmb") return gmbConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "facebook") return facebookPageConnected ? { status: "connected" as ModuleStatus, text: "Connecté" } : { status: "available" as ModuleStatus, text: "A connecter" };
          if (m.key === "tiktok") return tiktokConnected ? { status: "connected" as ModuleStatus, text: "Connecté (mock)" } : { status: "available" as ModuleStatus, text: "A connecter" };
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
                  ? "#"
                  : undefined;

    const specialViewLabel = m.key === "site_inrcy"
      ? "Voir le site"
      : m.key === "site_web"
        ? "Voir le site"
        : m.key === "gmb"
          ? "Voir la page"
          : ["instagram", "linkedin", "facebook", "tiktok"].includes(m.key)
            ? "Voir le compte"
            : undefined;

    const canViewSpecial = m.key === "site_inrcy"
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
                  ? false
                  : undefined;

    const onConfigure = () => {
      if (m.key === "site_inrcy") {
        if (!canConfigureSite) return;
        openPanel("site_inrcy");
        return;
      }
      if (m.key === "tiktok") return;
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
      canViewSpecial,
      viewAction: specialViewHref ? undefined : viewAction,
      onConfigure,
      configureDisabled: m.key === "site_inrcy" ? !canConfigureSite : tiktokComingSoon,
      configureTitle: tiktokComingSoon
        ? "Arrive bientôt"
        : m.key === "site_inrcy" && !canConfigureSite
          ? "Disponible uniquement si vous avez un site iNrCy"
          : undefined,
    };
  });
}
