import React from "react";
import { useRouter } from "next/navigation";
import { readSanitizedElementHtml, sanitizeHtml } from "@/lib/sanitizeHtml";
import { editableHtmlToSiteText, renderBoosterSiteContentHtml, renderBoosterSiteInlineHtml, stripSiteTextFormatting } from "@/lib/boosterFormatting";
import styles from "../mails.module.css";
import { ChannelImageAdapterCardsPanel, ChannelPublicationPreview } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import InrcyCameraCaptureModal from "@/app/dashboard/_components/InrcyCameraCaptureModal";
import MediaLibraryPickerModal, {
  type MediaLibraryPickerItem,
} from "@/app/dashboard/_components/MediaLibraryPickerModal";
import MediaOptimizerModal, {
  type MediaOptimizerItem,
} from "@/app/dashboard/_components/MediaOptimizerModal";
import RichSiteContentEditor from "@/app/dashboard/booster/publier/components/RichSiteContentEditor";
import BoosterVideoFormatManager from "@/app/dashboard/booster/publier/components/BoosterVideoFormatManager";
import {
  buildPreferredCtaPatch,
  BOOSTER_IMAGE_ACCEPT,
  BOOSTER_MAX_IMAGE_BYTES,
  BOOSTER_MAX_VIDEO_BYTES,
  BOOSTER_PREFERRED_CTA_OPTIONS,
  BOOSTER_VIDEO_ACCEPT,
  CHANNEL_TEXT_GUIDELINES,
  getChannelDefaultCtaLabel,
  getCtaModeHelp,
  getPreferredCtaChoiceFromPost,
  getVideoFormatLabel,
  getVideoPreviewAspectRatio,
  getVideoPreviewFitMode,
  getWebsiteSourceLabelForChannel,
  getWebsiteUrlForChannel,
  isSiteDisplayKey,
  normalizeBoosterAiLanguage,
  normalizeBoosterPreferredCta,
  VIDEO_ADAPTATION_MODE_LABELS,
  type BoosterCtaDefaults,
  type BoosterCtaMode,
  type BoosterPreferredCta,
  type ChannelKey,
  type ChannelPost,
  type DisplayKey,
  type VideoAdaptationMode,
  type VideoFormat,
} from "@/app/dashboard/booster/publier/publishModal.shared";
import { darkOptionStyle, darkSelectStyle, lightFieldStyle, textAreaStyle } from "@/app/dashboard/booster/publier/publishModal.styles";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { useUnsavedExitGuard } from "@/app/dashboard/_hooks/useUnsavedExitGuard";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { getFrenchPublicationErrorMessage } from "@/lib/publicationErrorFrench";
import { detectUniversalUploadMediaType } from "@/lib/mediaUploadPolicy";
import { getMediaLibraryOptimizationRequirements } from "@/lib/mediaLibraryOptimizationPolicy";
import {
  MAILBOX_RECIPIENTS_PAGE_SIZE,
  type CampaignRecipientsFilterId,
  type PublicationEditForm,
  campaignCounts,
  extractAttachmentsFromPayload,
  extractChannelPublications,
  extractPublicationParts,
  firstNonEmpty,
  formatCampaignDuration,
  formatCampaignFilterLabel,
  formatChannelLabel,
  formatOutboxStatusLabel,
  getCampaignRecipientStatusLabel,
  getChannelIndicatorMeta,
  getFailedChannelMessage,
  getWarningChannelMessage,
  getPublicationBackgroundMode,
  arePublicationTransformsEquivalent,
  isCancelledChannelResult,
  isDeletedChannelResult,
  isFailedChannelResult,
  isWarningChannelResult,
  isImageAttachment,
  isRetryableCampaignItem,
  isVideoAttachment,
  orderChannelKeys,
  pill,
  splitList,
} from "../_lib/mailboxPhase1";
import { pillBtn, pillBtnActive } from "./mailboxInlineStyles";
import {
  campaignStatusLabel,
  completionEmailLabel,
  formatCampaignProgressFromHealth,
  formatVisibleMailError,
  getTiktokAutoPollTarget,
  getTiktokPublishId,
  getTiktokStatusMeta,
  getYoutubeShortsPublicationUrl,
  isCampaignFinishedStatus,
  sameVideoAttachment,
  type MailboxDetailsModalProps,
} from "../_lib/mailboxDetails.foundations";

function formatTiktokBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${Math.round(bytes)} octets`;
}

function formatTiktokDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return minutes
    ? `${minutes} min ${String(remainingSeconds).padStart(2, "0")} s`
    : `${remainingSeconds} s`;
}

function formatTiktokDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
}

type ConnectedChannelDetail = {
  type?: string | null;
  label?: string | null;
  href?: string | null;
};

type PublicationStatusTone = "success" | "pending" | "warning" | "danger" | "muted";

type PublicationStatusMeta = {
  label: string;
  tone: PublicationStatusTone;
  title: string;
};

type PublicationMediaOptimizerRequest = {
  source:
    | { kind: "file"; file: File }
    | { kind: "library"; item: MediaOptimizerItem };
};

function normalizeExternalHref(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^(https?:)?\/\//i.test(raw)
    ? raw.startsWith("//")
      ? `https:${raw}`
      : raw
    : /^www\./i.test(raw)
      ? `https://${raw}`
      : "";
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function getFallbackChannelAccountHref(channel: string, result: any): string {
  const candidates = [
    result?.profile_url,
    result?.profileUrl,
    result?.page_url,
    result?.pageUrl,
    result?.channel_url,
    result?.channelUrl,
    result?.organization_url,
    result?.organizationUrl,
    result?.account_url,
    result?.accountUrl,
    result?.resource_url,
    result?.resourceUrl,
    result?.website_url,
    result?.websiteUrl,
    result?.site_url,
    result?.siteUrl,
    ["inrcy_site", "site_web", "inr_search", "gmb"].includes(channel)
      ? result?.external_url
      : "",
  ];
  for (const candidate of candidates) {
    const href = normalizeExternalHref(candidate);
    if (href) return href;
  }

  const username = String(result?.username || result?.handle || "")
    .trim()
    .replace(/^@+/, "");
  if (!username) return "";
  if (channel === "instagram") return `https://www.instagram.com/${encodeURIComponent(username)}/`;
  if (channel === "tiktok") return `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  if (channel === "pinterest") return `https://www.pinterest.fr/${encodeURIComponent(username)}/`;
  return "";
}

function getChannelAccountActionLabel(channel: string, detail?: ConnectedChannelDetail | null) {
  if (channel === "inrcy_site" || channel === "site_web") return "Ouvrir le site";
  if (channel === "inr_search") return "Ouvrir la page";
  if (channel === "gmb") return "Ouvrir la fiche";
  if (channel === "youtube_shorts") return "Ouvrir la chaîne";
  const type = String(detail?.type || "").toLowerCase();
  if (type === "account" || type === "profile") return "Ouvrir le compte";
  if (type === "channel") return "Ouvrir la chaîne";
  if (type === "location") return "Ouvrir la fiche";
  return "Ouvrir la page";
}

function getLivePublicationEntry(liveStatus: any, channel: string) {
  const entries = Array.isArray(liveStatus?.summary?.entries)
    ? liveStatus.summary.entries
    : [];
  return entries.find((entry: any) => String(entry?.channel || "").trim() === channel) || null;
}

function getLivePublicationResult(liveStatus: any, channel: string) {
  const results = liveStatus?.results && typeof liveStatus.results === "object"
    ? liveStatus.results
    : null;
  if (!results) return null;
  const result = results[channel];
  return result && typeof result === "object" ? result : null;
}

function getPublicationStatusMeta(
  channel: string,
  result: any,
  liveEntry: any,
): PublicationStatusMeta {
  if (isCancelledChannelResult(result)) {
    return { label: "Annulée", tone: "muted", title: "Publication annulée" };
  }
  if (isDeletedChannelResult(result)) {
    return { label: "Supprimée", tone: "muted", title: "Publication supprimée sur ce canal" };
  }

  if (channel === "tiktok") {
    const tiktok = getTiktokStatusMeta(result);
    if (tiktok.cancelled) return { label: "Annulée", tone: "muted", title: "Publication TikTok annulée" };
    if (tiktok.failed) return { label: tiktok.label || "Échec", tone: "danger", title: tiktok.message || "Publication TikTok en échec" };
    if (tiktok.complete) return { label: "Publiée", tone: "success", title: "Publication finalisée sur TikTok" };
    if (tiktok.pending) return { label: tiktok.label || "En traitement", tone: "pending", title: tiktok.message || "TikTok finalise encore la publication" };
  }

  if (isFailedChannelResult(result) || liveEntry?.ok === false) {
    return { label: "Échec", tone: "danger", title: "La publication n'a pas abouti sur ce canal" };
  }
  if (isWarningChannelResult(result, channel)) {
    return { label: "Publiée avec avertissement", tone: "warning", title: getWarningChannelMessage(result, channel) || "Publication finalisée avec avertissement" };
  }

  const status = String(
    liveEntry?.status ||
      liveEntry?.technicalStatus ||
      result?.publication_status ||
      result?.status ||
      "",
  ).toLowerCase();
  if (["queued", "pending", "waiting", "created"].includes(status)) {
    return { label: "En attente", tone: "pending", title: "Publication en attente de traitement" };
  }
  if (["processing", "running", "submitted", "accepted", "uploading", "external_processing"].includes(status) || result?.pending === true || result?.processing === true) {
    return { label: "En traitement", tone: "pending", title: "Le canal finalise encore la publication" };
  }
  if (["failed", "error", "rejected"].includes(status)) {
    return { label: "Échec", tone: "danger", title: "La publication n'a pas abouti sur ce canal" };
  }
  if (
    liveEntry?.ok === true ||
    result?.ok === true ||
    ["published", "completed", "complete", "done", "success", "sent"].includes(status)
  ) {
    return { label: "Publiée", tone: "success", title: "Publication finalisée sur ce canal" };
  }
  return { label: "À vérifier", tone: "muted", title: "Le statut sera actualisé automatiquement" };
}

function getPublicationStatusPillStyle(tone: PublicationStatusTone): React.CSSProperties {
  if (tone === "success") {
    return { border: "1px solid rgba(74,222,128,0.34)", background: "rgba(22,101,52,0.22)", color: "#bbf7d0" };
  }
  if (tone === "danger") {
    return { border: "1px solid rgba(248,113,113,0.38)", background: "rgba(127,29,29,0.24)", color: "#fecaca" };
  }
  if (tone === "warning") {
    return { border: "1px solid rgba(251,191,36,0.36)", background: "rgba(120,53,15,0.22)", color: "#fde68a" };
  }
  if (tone === "pending") {
    return { border: "1px solid rgba(56,189,248,0.34)", background: "rgba(7,89,133,0.22)", color: "#bae6fd" };
  }
  return { border: "1px solid rgba(148,163,184,0.28)", background: "rgba(51,65,85,0.24)", color: "#e2e8f0" };
}

function shouldPollPublicationStatus(liveStatus: any) {
  const pendingCount = Number(liveStatus?.summary?.pendingCount || 0) || 0;
  return liveStatus?.done === false || liveStatus?.queued === true || pendingCount > 0;
}

function formatPublicationStatusCheckedAt(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function MailboxDetailsModal(props: MailboxDetailsModalProps) {
  const {
    open,
    onClose,
    detailsItem,
    detailsAccountLabel,
    detailsChannelKey,
    setDetailsChannelKey,
    detailsEditMode,
    setDetailsEditMode,
    detailsActionBusy,
    detailsActionError,
    detailsActionSuccess,
    setDetailsActionError,
    setDetailsActionSuccess,
    detailsSourceDocPayload,
    canNavigatePrevious,
    canNavigateNext,
    navigationLabel,
    navigationBusy,
    onNavigate,
    campaignRecipients,
    campaignRecipientsLoading,
    campaignRecipientsPage,
    setCampaignRecipientsPage,
    campaignRecipientsPageCount,
    campaignRecipientsTotal,
    campaignRecipientsFilter,
    setCampaignRecipientsFilter,
    campaignHealth,
    campaignHealthLoading,
    campaignReport,
    campaignSummaryBusyId,
    campaignActionBusyId,
    publicationEditForm,
    setPublicationEditForm,
    publicationEditFileInputId,
    activePublicationEditChannelKey,
    activePublicationEditPreset,
    activePublicationEditAssets,
    togglePublicationImage,
    openPublicationImageAdapter,
    resetPublicationImage,
    movePublicationImage,
    addPublicationFiles,
    addPublicationPhoto,
    addPublicationMediaLibraryItems,
    publicationVideoInputId,
    activePublicationEditVideo,
    addPublicationVideo,
    removePublicationVideo,
    setPublicationVideoFormatForChannel,
    setPublicationVideoAdaptationModeForChannel,
    applyPublicationVideoFormatForChannel,
    saveChannelPublication,
    deleteChannelPublication,
    retryCampaignFailedRecipients,
    resendCampaignCompletionSummary,
    openCampaignComposeFromHistory,
    loadCampaignRecipients,
    loadCampaignHealth,
    refreshHistory,
    resumeDraft,
  } = props;
  const router = useRouter();
  const [publicationPreviewOpen, setPublicationPreviewOpen] = React.useState(false);
  const [publicationCameraOpen, setPublicationCameraOpen] = React.useState(false);
  const [publicationMediaLibraryOpen, setPublicationMediaLibraryOpen] = React.useState(false);
  const [publicationOptimizerRequest, setPublicationOptimizerRequest] =
    React.useState<PublicationMediaOptimizerRequest | null>(null);
  const [publicationOptimizerQueue, setPublicationOptimizerQueue] =
    React.useState<PublicationMediaOptimizerRequest[]>([]);
  const [publicationOptimizerCompleted, setPublicationOptimizerCompleted] =
    React.useState(false);
  const [tiktokStatusChecking, setTiktokStatusChecking] = React.useState(false);
  const [tiktokRetrying, setTiktokRetrying] = React.useState(false);
  const [tiktokCancelling, setTiktokCancelling] = React.useState(false);
  const [connectedChannelDetails, setConnectedChannelDetails] = React.useState<Record<string, ConnectedChannelDetail>>({});
  const [publicationLiveStatus, setPublicationLiveStatus] = React.useState<any | null>(null);
  const [publicationStatusRefreshing, setPublicationStatusRefreshing] = React.useState(false);
  const [publicationStatusCheckedAt, setPublicationStatusCheckedAt] = React.useState("");
  const [isMobileViewport, setIsMobileViewport] = React.useState(false);
  const detailsBodyRef = React.useRef<HTMLDivElement | null>(null);
  const detailsScrollSnapshotRef = React.useRef<number | null>(null);
  const tiktokAutoPollInFlightRef = React.useRef(false);
  const publicationStatusRefreshInFlightRef = React.useRef<string | null>(null);
  const activePublicationId = React.useMemo(() => {
    if (!open || detailsItem?.source !== "app_events") return "";
    const payload = (detailsItem as any)?.raw?.payload;
    const payloadId = String(payload?.publication_id || "").trim();
    const itemId = String(detailsItem?.id || "").trim();
    const candidate = payloadId || itemId;
    return /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : "";
  }, [detailsItem, open]);
  const activePublicationIdRef = React.useRef("");
  activePublicationIdRef.current = activePublicationId;
  const detailsEditModeRef = React.useRef(detailsEditMode);
  detailsEditModeRef.current = detailsEditMode;
  const tiktokAutoPollTarget = React.useMemo(
    () => (open ? getTiktokAutoPollTarget(detailsItem) : null),
    [open, detailsItem],
  );
  const detailsMailProvider = String(detailsItem?.provider || detailsItem?.payload?.provider || "").trim();

  const refreshPublicationStatus = React.useCallback(async (silent = false) => {
    const requestedPublicationId = activePublicationId;
    if (!requestedPublicationId || publicationStatusRefreshInFlightRef.current === requestedPublicationId) return null;
    publicationStatusRefreshInFlightRef.current = requestedPublicationId;
    if (!silent) {
      setPublicationStatusRefreshing(true);
      setDetailsActionError(null);
      setDetailsActionSuccess(null);
    }
    try {
      const response = await fetch(
        `/api/booster/publications/${encodeURIComponent(requestedPublicationId)}/status`,
        { method: "GET", cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || "Actualisation du statut impossible.");
      }
      if (activePublicationIdRef.current !== requestedPublicationId) return null;
      setPublicationLiveStatus(json);
      setPublicationStatusCheckedAt(new Date().toISOString());
      if (!detailsEditModeRef.current) await refreshHistory?.();
      if (activePublicationIdRef.current !== requestedPublicationId) return null;
      if (!silent) setDetailsActionSuccess("Statut de publication mis à jour.");
      return json;
    } catch (error) {
      if (!silent) {
        setDetailsActionError(
          getSimpleFrenchErrorMessage(
            error,
            "Impossible d'actualiser le statut de cette publication pour le moment.",
          ),
        );
      }
      return null;
    } finally {
      if (publicationStatusRefreshInFlightRef.current === requestedPublicationId) {
        publicationStatusRefreshInFlightRef.current = null;
      }
      if (!silent && activePublicationIdRef.current === requestedPublicationId) {
        setPublicationStatusRefreshing(false);
      }
    }
  }, [
    activePublicationId,
    refreshHistory,
    setDetailsActionError,
    setDetailsActionSuccess,
  ]);

  const deleteChannelPublicationAndSyncStatus = React.useCallback(async () => {
    const deletion = await deleteChannelPublication();
    if (!deletion?.payload || !deletion.channel) return;

    const deletedResults =
      deletion.payload?.results && typeof deletion.payload.results === "object"
        ? deletion.payload.results
        : {};
    const deletedResult = (deletedResults as Record<string, unknown>)[deletion.channel];

    setPublicationLiveStatus((current: any) => {
      if (!current) return current;
      const currentResults =
        current?.results && typeof current.results === "object"
          ? current.results
          : {};
      const currentSummary =
        current?.summary && typeof current.summary === "object"
          ? current.summary
          : null;
      const entries = Array.isArray(currentSummary?.entries)
        ? currentSummary.entries.map((entry: any) =>
            String(entry?.channel || "").trim() === deletion.channel
              ? {
                  ...entry,
                  ok: true,
                  status: "deleted",
                  technicalStatus: "deleted",
                  pending: false,
                }
              : entry,
          )
        : currentSummary?.entries;

      return {
        ...current,
        results: {
          ...currentResults,
          ...(deletedResult ? { [deletion.channel]: deletedResult } : {}),
        },
        ...(currentSummary
          ? {
              summary: {
                ...currentSummary,
                entries,
              },
            }
          : {}),
      };
    });
    setPublicationStatusCheckedAt(new Date().toISOString());
  }, [deleteChannelPublication]);

  React.useEffect(() => {
    let cancelled = false;
    if (!open || detailsItem?.source !== "app_events") {
      setConnectedChannelDetails({});
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/booster/connected-channels", {
          method: "GET",
          cache: "no-store",
        });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && json?.channelDetails && typeof json.channelDetails === "object") {
          setConnectedChannelDetails(json.channelDetails as Record<string, ConnectedChannelDetail>);
        }
        if (!cancelled && response.ok && json?.channels?.pinterest) {
          const pinterestResponse = await fetch(
            "/api/integrations/pinterest/status?live=1",
            { method: "GET", cache: "no-store" },
          ).catch(() => null);
          const pinterestStatus = pinterestResponse?.ok
            ? await pinterestResponse.json().catch(() => null)
            : null;
          if (!cancelled && pinterestStatus?.ok && pinterestStatus?.connected) {
            const username = String(pinterestStatus.username || "")
              .replace(/^@+/, "")
              .trim();
            const href = normalizeExternalHref(
              pinterestStatus.profileUrl ||
                pinterestStatus.publicProfileUrl ||
                (username
                  ? `https://www.pinterest.fr/${encodeURIComponent(username)}/`
                  : ""),
            );
            if (href) {
              setConnectedChannelDetails((current) => ({
                ...current,
                pinterest: {
                  ...(current.pinterest || {}),
                  type: "account",
                  label: String(
                    pinterestStatus.accountName ||
                      username ||
                      "Compte Pinterest connecté",
                  ).trim(),
                  href,
                },
              }));
            }
          }
        }
      } catch {
        // Le lien enregistré dans le résultat reste disponible en repli.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailsItem?.source, open]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!open || !activePublicationId || detailsItem?.source !== "app_events") {
      setPublicationLiveStatus(null);
      setPublicationStatusCheckedAt("");
      return;
    }

    setPublicationLiveStatus(null);
    setPublicationStatusCheckedAt("");
    const startedAt = Date.now();

    const clearTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (cancelled || document.hidden) return;
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    };

    const run = async () => {
      if (cancelled || document.hidden) return;
      const status = await refreshPublicationStatus(true);
      if (cancelled || document.hidden) return;
      if (
        status &&
        shouldPollPublicationStatus(status) &&
        Date.now() - startedAt < 30 * 60_000
      ) {
        schedule(20_000);
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (document.hidden) {
        clearTimer();
        return;
      }
      schedule(0);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) void run();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activePublicationId, detailsItem?.source, open, refreshPublicationStatus]);

  React.useEffect(() => {
    if (!open || !tiktokAutoPollTarget || tiktokRetrying || tiktokStatusChecking || tiktokCancelling) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resumeRequested = false;
    const startedAt = Date.now();
    const lastCheckedAt = Date.parse(tiktokAutoPollTarget.checkedAt || "");
    const initialIntervalMs = tiktokAutoPollTarget.statusFetchFailed ? 60_000 : 20_000;
    const initialDelay = Number.isFinite(lastCheckedAt)
      ? Math.max(3_000, initialIntervalMs - Math.max(0, Date.now() - lastCheckedAt))
      : 8_000;

    const clearTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (cancelled || document.hidden) return;
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    };

    const run = async () => {
      if (cancelled || document.hidden) return;
      if (tiktokAutoPollInFlightRef.current) {
        schedule(1_000);
        return;
      }

      tiktokAutoPollInFlightRef.current = true;
      let shouldContinue = true;
      let nextDelay = Date.now() - startedAt >= 5 * 60_000 ? 60_000 : 20_000;
      try {
        const res = await fetch(
          `/api/inrsend/publications/${encodeURIComponent(tiktokAutoPollTarget.publicationId)}/tiktok/status`,
          { method: "POST", headers: { "Content-Type": "application/json" } },
        );
        const json = await res.json().catch(() => ({}));
        const status = String(json?.status?.status || "").toUpperCase();
        shouldContinue = !["PUBLISH_COMPLETE", "DONE", "SUCCESS", "FAILED", "PUBLISH_FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status);
        if (!res.ok || json?.status?.statusFetchFailed) nextDelay = 60_000;
        await refreshHistory?.();
      } catch {
        nextDelay = 60_000;
      } finally {
        tiktokAutoPollInFlightRef.current = false;
      }

      if (cancelled || document.hidden) return;
      if (resumeRequested) {
        resumeRequested = false;
        schedule(0);
        return;
      }
      if (shouldContinue && Date.now() - startedAt < 30 * 60_000) {
        schedule(nextDelay);
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (document.hidden) {
        clearTimer();
        return;
      }
      if (tiktokAutoPollInFlightRef.current) {
        resumeRequested = true;
        return;
      }
      schedule(0);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) schedule(initialDelay);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    open,
    refreshHistory,
    tiktokAutoPollTarget?.checkedAt,
    tiktokAutoPollTarget?.publicationId,
    tiktokAutoPollTarget?.publishId,
    tiktokAutoPollTarget?.statusFetchFailed,
    tiktokCancelling,
    tiktokRetrying,
    tiktokStatusChecking,
  ]);

  async function checkTiktokPublicationStatus(publicationId: string) {
    if (!publicationId || tiktokStatusChecking) return;
    setTiktokStatusChecking(true);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    try {
      const res = await fetch(`/api/inrsend/publications/${encodeURIComponent(publicationId)}/tiktok/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Vérification TikTok impossible.");
      const statusLabel = String(json?.status_label || "Statut vérifié").trim();
      const message = String(json?.message || "Statut TikTok mis à jour.").trim();
      if (json?.ok === false) {
        setDetailsActionError(`TikTok : ${statusLabel} — ${message}`);
      } else {
        setDetailsActionSuccess(`TikTok : ${statusLabel} — ${message}`);
      }
      await refreshHistory?.();
    } catch (e: any) {
      setDetailsActionError(
        getSimpleFrenchErrorMessage(
          e,
          "Impossible de vérifier le statut TikTok pour le moment.",
        ),
      );
    } finally {
      setTiktokStatusChecking(false);
    }
  }

  async function retryTiktokPublication(publicationId: string, statusMeta?: ReturnType<typeof getTiktokStatusMeta> | null) {
    if (!publicationId || tiktokRetrying) return;
    const isPending = Boolean(statusMeta?.pending);
    const ok = await confirmInrcy({
      eyebrow: isPending ? "Traitement TikTok en cours" : "Relance TikTok",
      title: isPending ? "Retenter malgré le traitement ?" : "Retenter l’envoi TikTok ?",
      message: isPending
        ? "TikTok traite peut-être encore l’ancien envoi. Retenter peut créer un doublon si TikTok finalise aussi l’ancien traitement."
        : "iNrCy va renvoyer cette publication à TikTok avec les mêmes paramètres validés.",
      cancelLabel: "Annuler",
      confirmLabel: "Retenter",
      variant: isPending ? "danger" : "default",
    });
    if (!ok) return;

    setTiktokRetrying(true);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    try {
      const res = await fetch(`/api/inrsend/publications/${encodeURIComponent(publicationId)}/tiktok/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || json?.message || "Relance TikTok impossible.");
      setDetailsActionSuccess(String(json?.message || "Nouvel envoi TikTok lancé."));
      await refreshHistory?.();
    } catch (e: any) {
      setDetailsActionError(
        getSimpleFrenchErrorMessage(
          e,
          "Impossible de retenter l’envoi TikTok pour le moment.",
        ),
      );
    } finally {
      setTiktokRetrying(false);
    }
  }

  async function cancelPendingTiktokPublication(
    publicationId: string,
    statusMeta?: ReturnType<typeof getTiktokStatusMeta> | null,
  ) {
    if (!publicationId || tiktokCancelling || !statusMeta?.pending) return;

    const ok = await confirmInrcy({
      eyebrow: "Publication TikTok en attente",
      title: "Annuler cette publication en cours ?",
      message:
        "iNrSend arrêtera immédiatement le suivi et marquera cet envoi comme annulé. TikTok ne permet pas d'interrompre à distance une tentative déjà acceptée : si TikTok la finalise malgré tout, elle pourra encore apparaître sur le compte.",
      cancelLabel: "Conserver le suivi",
      confirmLabel: "Annuler la publication",
      variant: "danger",
    });
    if (!ok) return;

    setTiktokCancelling(true);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    try {
      const res = await fetch(`/api/inrsend/publications/${encodeURIComponent(publicationId)}/tiktok`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_pending" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || json?.message || "Annulation TikTok impossible.");
      }
      setDetailsActionSuccess(
        String(json?.message || "Publication annulée dans iNrSend. Le suivi automatique est arrêté."),
      );
      await refreshHistory?.();
    } catch (e: any) {
      setDetailsActionError(
        getSimpleFrenchErrorMessage(
          e,
          "Impossible d'annuler cette publication TikTok pour le moment.",
        ),
      );
    } finally {
      setTiktokCancelling(false);
    }
  }

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobileViewport(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  React.useEffect(() => {
    if (open) setPublicationPreviewOpen(false);
  }, [open, detailsItem?.id, detailsEditMode]);

  const preserveDetailsModalScroll = React.useCallback(() => {
    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
    detailsScrollSnapshotRef.current = detailsBodyRef.current?.scrollTop ?? 0;
  }, []);

  const restoreDetailsModalScroll = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const snapshot = detailsScrollSnapshotRef.current;
    if (snapshot === null) return;
    const restore = () => {
      if (detailsBodyRef.current) detailsBodyRef.current.scrollTop = snapshot;
    };
    window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 80);
      window.setTimeout(restore, 220);
    });
  }, []);

  const openPublicationCamera = React.useCallback(() => {
    if (!isMobileViewport) return;
    preserveDetailsModalScroll();
    setPublicationCameraOpen(true);
  }, [isMobileViewport, preserveDetailsModalScroll]);

  const openPublicationMediaLibrary = React.useCallback(() => {
    preserveDetailsModalScroll();
    setPublicationMediaLibraryOpen(true);
  }, [preserveDetailsModalScroll]);

  const closePublicationMediaLibrary = React.useCallback(() => {
    setPublicationMediaLibraryOpen(false);
    restoreDetailsModalScroll();
  }, [restoreDetailsModalScroll]);

  const closePublicationCamera = React.useCallback(() => {
    setPublicationCameraOpen(false);
    restoreDetailsModalScroll();
  }, [restoreDetailsModalScroll]);

  const [publicationEditDirty, setPublicationEditDirty] = React.useState(false);
  const [publicationCtaDefaults, setPublicationCtaDefaults] = React.useState<BoosterCtaDefaults | null>(null);
  const publicationSiteContentEditorRef = React.useRef<HTMLDivElement | null>(null);

  const publicationDisplayKey = React.useMemo<DisplayKey>(() => {
    const key = String(activePublicationEditChannelKey || "");
    if (["inrcy_site", "site_web", "inr_search", "gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts", "pinterest"].includes(key)) {
      return key as DisplayKey;
    }
    return "facebook";
  }, [activePublicationEditChannelKey]);

  const markPublicationEditDirty = React.useCallback(() => {
    setPublicationEditDirty(true);
  }, []);

  const updatePublicationEdit = React.useCallback((patch: Partial<PublicationEditForm>) => {
    markPublicationEditDirty();
    setPublicationEditForm((prev) => ({ ...prev, ...patch }));
  }, [markPublicationEditDirty, setPublicationEditForm]);

  React.useEffect(() => {
    let alive = true;
    if (!open || !detailsEditMode || detailsItem?.source !== "app_events") return () => { alive = false; };

    (async () => {
      try {
        const res = await fetch("/api/booster/cta-defaults", { cache: "no-store" as const });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setPublicationCtaDefaults({
          preferredWebsiteUrl: String(json?.preferredWebsiteUrl || "").trim(),
          preferredWebsiteLabel: String(json?.preferredWebsiteLabel || "").trim(),
          siteWebUrl: String(json?.siteWebUrl || "").trim(),
          inrcySiteUrl: String(json?.inrcySiteUrl || "").trim(),
          phone: String(json?.phone || "").trim(),
          preferredCta: normalizeBoosterPreferredCta(json?.preferredCta),
          aiLanguage: normalizeBoosterAiLanguage(json?.aiLanguage),
        });
      } catch {
        // CTA defaults are helpful but not required to edit a publication.
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, detailsEditMode, detailsItem?.source]);

  const applyPublicationSiteContentFormat = React.useCallback((kind: "bold" | "italic" | "underline") => {
    if (!isSiteDisplayKey(publicationDisplayKey) || typeof document === "undefined") return;
    const editor = publicationSiteContentEditorRef.current;
    if (!editor) return;

    try {
      editor.focus({ preventScroll: true });
    } catch {
      editor.focus();
    }
    const command = kind === "bold" ? "bold" : kind === "italic" ? "italic" : "underline";
    document.execCommand(command, false);
    updatePublicationEdit({ content: editableHtmlToSiteText(readSanitizedElementHtml(editor)) });
  }, [publicationDisplayKey, updatePublicationEdit]);

  const applyPublicationPreferredCtaPrefill = React.useCallback((choice: BoosterPreferredCta) => {
    const current = {
      title: publicationEditForm.title,
      content: publicationEditForm.content,
      cta: publicationEditForm.cta,
      ctaMode: publicationEditForm.ctaMode || "none",
      ctaUrl: publicationEditForm.ctaUrl || "",
      ctaPhone: publicationEditForm.ctaPhone || "",
      hashtags: [],
    } as ChannelPost;
    const patch = buildPreferredCtaPatch(publicationDisplayKey, choice, current, publicationCtaDefaults, publicationCtaDefaults?.aiLanguage);
    updatePublicationEdit({
      ctaMode: String(patch.ctaMode || current.ctaMode || "none"),
      ...(typeof patch.cta === "string" ? { cta: patch.cta } : {}),
      ...(typeof patch.ctaUrl === "string" ? { ctaUrl: patch.ctaUrl } : {}),
      ...(typeof patch.ctaPhone === "string" ? { ctaPhone: patch.ctaPhone } : {}),
    });
  }, [publicationCtaDefaults, publicationDisplayKey, publicationEditForm.content, publicationEditForm.cta, publicationEditForm.ctaMode, publicationEditForm.ctaPhone, publicationEditForm.ctaUrl, publicationEditForm.title, updatePublicationEdit]);

  const getPublicationPreviewCta = React.useCallback((channel: DisplayKey, form: PublicationEditForm) => {
    const mode = (form.ctaMode || "none") as BoosterCtaMode;
    const explicit = String(form.cta || "").trim();
    const phone = String(form.ctaPhone || "").trim();
    if (mode === "none") return "";
    if (mode === "call") {
      const label = explicit || getChannelDefaultCtaLabel(channel, "call") || "Appeler";
      return phone ? `${label} · ${phone}` : label;
    }
    if (explicit) return explicit;
    if (mode === "website") return getChannelDefaultCtaLabel(channel, mode);
    if (mode === "message") return channel === "instagram" ? "Message privé" : "Envoyer un message";
    return "";
  }, []);

  React.useEffect(() => {
    if (!open || !detailsEditMode) setPublicationEditDirty(false);
  }, [open, detailsItem?.id, activePublicationEditChannelKey, detailsEditMode]);

  const confirmDiscardPublicationEdit = React.useCallback(async () => {
    if (!detailsEditMode) return true;
    if (detailsActionBusy) return false;

    const ok = await confirmInrcy({
      eyebrow: "Modification en cours",
      title: "Quitter la modification ?",
      message: publicationEditDirty
        ? "Vos changements ne seront pas enregistrés."
        : "Vous êtes en mode modification.",
      cancelLabel: "Continuer l’édition",
      confirmLabel: "Quitter",
      variant: "danger",
    });
    if (ok) setPublicationEditDirty(false);
    return ok;
  }, [detailsActionBusy, detailsEditMode, publicationEditDirty]);

  const requestClose = React.useCallback(async () => {
    const ok = await confirmDiscardPublicationEdit();
    if (!ok) return;
    setDetailsEditMode(false);
    onClose();
  }, [confirmDiscardPublicationEdit, onClose, setDetailsEditMode]);

  const requestNavigate = React.useCallback(async (direction: -1 | 1) => {
    if (navigationBusy) return;
    const allowed = direction < 0 ? canNavigatePrevious : canNavigateNext;
    if (!allowed) return;
    const ok = await confirmDiscardPublicationEdit();
    if (!ok) return;
    setPublicationEditDirty(false);
    setDetailsEditMode(false);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    await onNavigate(direction);
  }, [
    canNavigateNext,
    canNavigatePrevious,
    confirmDiscardPublicationEdit,
    navigationBusy,
    onNavigate,
    setDetailsActionError,
    setDetailsActionSuccess,
    setDetailsEditMode,
  ]);

  const closePublicationEditForNavigation = React.useCallback(() => {
    setPublicationEditDirty(false);
    setDetailsEditMode(false);
    onClose();
  }, [onClose, setDetailsEditMode]);

  useUnsavedExitGuard({
    active: open && detailsEditMode,
    shouldBlock: open && detailsEditMode && publicationEditDirty,
    onConfirmExit: closePublicationEditForNavigation,
    eyebrow: "Modification en cours",
    title: "Quitter la modification ?",
    message: "Vos changements ne seront pas enregistrés.",
    cancelLabel: "Continuer l’édition",
    confirmLabel: "Quitter",
    variant: "danger",
  });

  const requestChannelChange = React.useCallback(async (channelKey: string) => {
    if (!channelKey || channelKey === activePublicationEditChannelKey) return;
    const ok = await confirmDiscardPublicationEdit();
    if (!ok) return;
    setDetailsEditMode(false);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    setDetailsChannelKey(channelKey);
  }, [activePublicationEditChannelKey, confirmDiscardPublicationEdit, setDetailsActionError, setDetailsActionSuccess, setDetailsChannelKey, setDetailsEditMode]);

  React.useEffect(() => {
    if (!open) return;
    setPublicationPreviewOpen(false);
    setPublicationCameraOpen(false);
    setPublicationMediaLibraryOpen(false);
    setPublicationOptimizerRequest(null);
    setPublicationOptimizerQueue([]);
    setPublicationOptimizerCompleted(false);
    setTiktokStatusChecking(false);
    setTiktokRetrying(false);
    setTiktokCancelling(false);
    setPublicationStatusRefreshing(false);
    detailsScrollSnapshotRef.current = null;
    window.requestAnimationFrame(() => {
      detailsBodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [open, detailsItem?.id]);

  function openPublicationOptimizerForFiles(files: File[]) {
    const requests = files.map<PublicationMediaOptimizerRequest>((file) => ({
      source: { kind: "file", file },
    }));
    const [first, ...rest] = requests;
    if (!first) return;
    setPublicationOptimizerRequest(first);
    setPublicationOptimizerQueue(rest);
    setPublicationOptimizerCompleted(false);
  }

  function openPublicationOptimizerForLibraryItem(
    item: MediaLibraryPickerItem,
  ) {
    setPublicationOptimizerRequest({
      source: { kind: "library", item: item as MediaOptimizerItem },
    });
    setPublicationOptimizerQueue([]);
    setPublicationOptimizerCompleted(false);
  }

  function closePublicationOptimizer() {
    if (
      publicationOptimizerCompleted &&
      publicationOptimizerQueue.length > 0
    ) {
      const [next, ...rest] = publicationOptimizerQueue;
      setPublicationOptimizerRequest(next);
      setPublicationOptimizerQueue(rest);
      setPublicationOptimizerCompleted(false);
      return;
    }
    setPublicationOptimizerRequest(null);
    setPublicationOptimizerQueue([]);
    setPublicationOptimizerCompleted(false);
  }

  async function handleOptimizedPublicationMedia(item: MediaOptimizerItem) {
    await addPublicationMediaLibraryItems([item]);
    markPublicationEditDirty();
    setPublicationOptimizerCompleted(true);
    restoreDetailsModalScroll();
  }

  function handlePublicationImageFiles(
    fileList: FileList | File[] | null,
  ) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const insertableFiles = files.filter(
      (file) =>
        !getMediaLibraryOptimizationRequirements({
          mediaType: "image",
          sizeBytes: file.size,
          targetBytes: BOOSTER_MAX_IMAGE_BYTES,
          name: file.name,
          mimeType: file.type,
        }).needsOptimization,
    );
    const mediaToOptimize = files.filter(
      (file) => !insertableFiles.includes(file),
    );
    if (insertableFiles.length > 0) {
      markPublicationEditDirty();
      addPublicationFiles(insertableFiles);
    }
    if (mediaToOptimize.length > 0) {
      openPublicationOptimizerForFiles(mediaToOptimize);
    }
  }

  function handlePublicationVideoFiles(
    fileList: FileList | File[] | null,
  ) {
    const file = Array.from(fileList || [])[0];
    if (!file) return;
    const detectedType = detectUniversalUploadMediaType({
      name: file.name,
      mimeType: file.type,
    });
    const requirements = getMediaLibraryOptimizationRequirements({
      mediaType: "video",
      sizeBytes: file.size,
      targetBytes: BOOSTER_MAX_VIDEO_BYTES,
      name: file.name,
      mimeType: file.type,
    });
    if (detectedType === "video" && requirements.needsOptimization) {
      openPublicationOptimizerForFiles([file]);
      return;
    }
    markPublicationEditDirty();
    addPublicationVideo([file]);
  }

  function handlePublicationPhoto(file: File) {
    const requirements = getMediaLibraryOptimizationRequirements({
      mediaType: "image",
      sizeBytes: file.size,
      targetBytes: BOOSTER_MAX_IMAGE_BYTES,
      name: file.name,
      mimeType: file.type,
    });
    if (requirements.needsOptimization) {
      openPublicationOptimizerForFiles([file]);
      return;
    }
    markPublicationEditDirty();
    addPublicationPhoto(file);
  }

  if (!open) return null;

  const safeDetailHtml = detailsItem?.detailHtml ? sanitizeHtml(detailsItem.detailHtml) : "";

  return (
          <div className={styles.modalOverlay} onClick={() => void requestClose()}>
            <div className={`${styles.modalCard} ${styles.detailsModalCard}`} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div className={styles.modalTitle}>Détails</div>
                  {detailsItem ? (
                    <>
                      <span className={`${styles.badge} ${pill(detailsItem.provider).cls}`}>{pill(detailsItem.provider).label}</span>
                      {detailsItem.originSource === "inr_agent" ? (
                        <span className={styles.inrAgentDetailBadge} title={detailsItem.originLabel || "Créé par iNr’Agent"}>
                          <img src="/icons/inr-agent.png" alt="" aria-hidden="true" />
                          Créé par iNr’Agent
                        </span>
                      ) : null}
                      {detailsItem.source !== "app_events" && detailsAccountLabel ? (
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>• {detailsAccountLabel}</span>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div className={styles.detailsHeaderActions}>
                  <div className={styles.detailsNavigation} aria-label="Navigation dans la liste">
                    <button
                      className={`${styles.btnGhost} ${styles.detailsNavigationButton}`}
                      onClick={() => void requestNavigate(-1)}
                      type="button"
                      title="Élément précédent"
                      aria-label="Élément précédent"
                      disabled={!canNavigatePrevious || navigationBusy}
                    >
                      ‹
                    </button>
                    <span className={styles.detailsNavigationCounter} aria-live="polite">
                      {navigationBusy ? "…" : navigationLabel}
                    </span>
                    <button
                      className={`${styles.btnGhost} ${styles.detailsNavigationButton}`}
                      onClick={() => void requestNavigate(1)}
                      type="button"
                      title="Élément suivant"
                      aria-label="Élément suivant"
                      disabled={!canNavigateNext || navigationBusy}
                    >
                      ›
                    </button>
                  </div>
                  <button className={styles.btnGhost} onClick={() => void requestClose()} type="button" title="Fermer" aria-label="Fermer">
                    ✕
                  </button>
                </div>
              </div>

              <div ref={detailsBodyRef} className={styles.modalBody} data-inrsend-details-body="true">
                {!detailsItem ? (
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>Sélectionne un élément.</div>
                ) : (() => {
                  const payload = detailsItem.source === "app_events" ? ((detailsItem as any)?.raw?.payload || null) : null;
                  const publicationId = detailsItem.source === "app_events" ? String(payload?.publication_id || "").trim() : "";
                  const channelPublications = detailsItem.source === "app_events" ? extractChannelPublications(payload) : [];
                  const defaultParts = detailsItem.source === "app_events" ? extractPublicationParts(payload) : {};
                  const publicationChannelEntries = detailsItem.source === "app_events"
                    ? channelPublications.length
                      ? channelPublications
                      : orderChannelKeys((detailsItem.channels && detailsItem.channels.length ? detailsItem.channels : [detailsItem.target]).filter(Boolean).map((channel: unknown) => String(channel))).map((channel) => ({
                          key: channel,
                          label: formatChannelLabel(channel),
                          parts: defaultParts,
                        }))
                    : [];
                  const activePublicationEntry = detailsItem.source === "app_events"
                    ? (publicationChannelEntries.find((entry) => entry.key === detailsChannelKey) || publicationChannelEntries[0] || null)
                    : null;
                  const persistedActivePublicationResult = detailsItem.source === "app_events" && activePublicationEntry
                    ? ((payload?.results && typeof payload.results === "object" ? (payload.results as any)[activePublicationEntry.key] : null) || null)
                    : null;
                  const activePublicationLiveEntry = activePublicationEntry
                    ? getLivePublicationEntry(publicationLiveStatus, activePublicationEntry.key)
                    : null;
                  const activePublicationLiveResult = activePublicationEntry
                    ? getLivePublicationResult(publicationLiveStatus, activePublicationEntry.key)
                    : null;
                  const activePublicationResult = activePublicationLiveResult || persistedActivePublicationResult;
                  const activePublicationDeleted = isDeletedChannelResult(activePublicationResult);
                  const activePublicationFailed = isFailedChannelResult(activePublicationResult);
                  const activePublicationFailureMessage = getFailedChannelMessage(
                    activePublicationResult,
                    activePublicationEntry?.key || "",
                  );
                  const activePublicationWarning = isWarningChannelResult(
                    activePublicationResult,
                    activePublicationEntry?.key || "",
                  );
                  const activePublicationWarningMessage = getWarningChannelMessage(
                    activePublicationResult,
                    activePublicationEntry?.key || "",
                  );
                  const visiblePublicationItemError =
                    detailsItem.source === "app_events" && detailsItem.error
                      ? getFrenchPublicationErrorMessage(
                          activePublicationEntry?.key || "site_web",
                          detailsItem.error,
                          "La publication n'a pas pu être finalisée. Merci de réessayer.",
                        )
                      : "";
                  const isTiktokPublicationEntry = activePublicationEntry?.key === "tiktok";
                  const isYoutubeShortsPublicationEntry = activePublicationEntry?.key === "youtube_shorts";
                  const isExternalVideoPublicationEntry = isTiktokPublicationEntry || isYoutubeShortsPublicationEntry;
                  const tiktokPublishId = isTiktokPublicationEntry ? getTiktokPublishId(activePublicationResult) : "";
                  const tiktokStatusMeta = isTiktokPublicationEntry ? getTiktokStatusMeta(activePublicationResult) : null;
                  const youtubeShortsPublicationHref = isYoutubeShortsPublicationEntry ? getYoutubeShortsPublicationUrl(activePublicationResult) : "";
                  const activeConnectedChannelDetail = activePublicationEntry
                    ? connectedChannelDetails[activePublicationEntry.key] || null
                    : null;
                  const activeChannelAccountHref = activePublicationEntry
                    ? getFallbackChannelAccountHref(activePublicationEntry.key, activePublicationResult) ||
                      normalizeExternalHref(activeConnectedChannelDetail?.href)
                    : "";
                  const activeChannelAccountActionLabel = activePublicationEntry
                    ? getChannelAccountActionLabel(activePublicationEntry.key, activeConnectedChannelDetail)
                    : "Ouvrir le canal";
                  const activePublicationStatusMeta = activePublicationEntry
                    ? getPublicationStatusMeta(
                        activePublicationEntry.key,
                        activePublicationResult,
                        activePublicationLiveEntry,
                      )
                    : null;
                  const activePublicationStatusTime = formatPublicationStatusCheckedAt(
                    (isTiktokPublicationEntry ? tiktokStatusMeta?.checkedAt : "") || publicationStatusCheckedAt,
                  );
                  const tiktokDirectPublicationHref = isTiktokPublicationEntry
                    ? normalizeExternalHref(
                        activePublicationResult?.share_url ||
                          activePublicationResult?.post_url ||
                          activePublicationResult?.video_url ||
                          activePublicationResult?.external_url,
                      )
                    : "";
                  const activeParts = activePublicationEntry?.parts || defaultParts;
                  const sourceDocAttachments = detailsItem.source === "send_items"
                    ? extractAttachmentsFromPayload(detailsSourceDocPayload)
                    : [];
                  const campaignAttachments = detailsItem.source === "mail_campaigns"
                    ? [...(detailsItem.attachments || []), ...extractAttachmentsFromPayload((detailsItem as any).raw)]
                    : [];
                  const publicationDraftAttachments = detailsItem.source === "app_events" && Array.isArray(payload?.imageDrafts)
                    ? payload.imageDrafts
                        .map((image: any) => ({
                          url: String(image?.originalPublicUrl || image?.originalUrl || image?.publicUrl || image?.url || image?.dataUrl || "").trim(),
                          name: String(image?.originalName || image?.name || "Image brouillon"),
                          type: String(image?.originalType || image?.type || "image/jpeg"),
                          size: Number(image?.originalSize || image?.size || 0) || undefined,
                        }))
                        .filter((att: any) => att.url)
                    : [];
                  const attachmentCandidates = detailsItem.source === "send_items"
                    ? [...(detailsItem.attachments || []), ...extractAttachmentsFromPayload((detailsItem as any).raw), ...sourceDocAttachments]
                    : detailsItem.source === "mail_campaigns"
                    ? campaignAttachments
                    : detailsItem.source === "app_events"
                    ? [...(activeParts.attachments || []), ...publicationDraftAttachments]
                    : [...(detailsItem.attachments || [])];
                  const dedupedAttachments = attachmentCandidates.filter((att, idx, arr) => {
                    const key = `${att.url || ""}|${att.name || ""}`;
                    return arr.findIndex((x) => `${x.url || ""}|${x.name || ""}` === key) === idx;
                  });
                  const imageAttachments = dedupedAttachments.filter((att) => att?.url && isImageAttachment(att));
                  const videoAttachments = dedupedAttachments.filter((att) => att?.url && isVideoAttachment(att));
                  const activeVideoAttachment = videoAttachments[0] || null;
                  const activeSourceVideoAttachment = activeParts.sourceVideo && !sameVideoAttachment(activeParts.sourceVideo, activeVideoAttachment)
                    ? activeParts.sourceVideo
                    : null;
                  // iNrSend conserve la vidéo originale comme source de travail, même si une variante publiée existe.
                  const activeVideoDisplayAttachment = activeSourceVideoAttachment || activeVideoAttachment;
                  const activeVideoSourceMetadata = (activeSourceVideoAttachment as any)?.sourceMetadata || (activeVideoAttachment as any)?.sourceMetadata || null;
                  const isVideoPublication = detailsItem.source === "app_events" && (
                    String(payload?.mediaType || payload?.media_type || "").toLowerCase() === "video" ||
                    Boolean(activeVideoAttachment)
                  );
                  const activeVideoSettings = isVideoPublication ? activeParts.videoSettings || null : null;
                  const activeVideoFormatLabel = activeVideoSettings && activePublicationEntry
                    ? getVideoFormatLabel(activePublicationEntry.key as any, activeVideoSettings.format as any, activeVideoSourceMetadata as any)
                    : null;
                  const activeVideoAdaptationLabel = activeVideoSettings
                    ? VIDEO_ADAPTATION_MODE_LABELS[activeVideoSettings.adaptationMode]
                    : null;
                  const fileAttachments = dedupedAttachments.filter((att) => !imageAttachments.includes(att) && !videoAttachments.includes(att));
                  const showFallbackMessage = (() => {
                    if (detailsItem.source !== "app_events") return true;
                    const activeHasStructured = !!(activeParts.title || activeParts.content || activeParts.cta || activeParts.hashtags?.length || activeParts.attachments?.length);
                    const fallbackTitle = firstNonEmpty(payload?.post?.title, payload?.subject, payload?.title);
                    const fallbackContent = firstNonEmpty(payload?.post?.content, payload?.post?.text, payload?.content, payload?.text, payload?.message);
                    const fallbackCta = firstNonEmpty(payload?.post?.cta, payload?.cta);
                    const fallbackHashtags = Array.isArray(payload?.post?.hashtags || payload?.hashtags)
                      ? (payload?.post?.hashtags || payload?.hashtags).map((x: any) => String(x || "").trim()).filter(Boolean)
                      : [];
                    const fallbackAttachments = extractAttachmentsFromPayload(payload);
                    return !(activeHasStructured || fallbackTitle || fallbackContent || fallbackCta || fallbackHashtags.length || fallbackAttachments.length);
                  })();
                  const isDraftItem = String((detailsItem as any)?.status || (detailsItem as any)?.raw?.status || "").toLowerCase() === "draft";
                  const publicationPreviewData = (() => {
                    if (detailsItem.source !== "app_events" || !activePublicationEntry) return null;
                    const selectedAssets = detailsEditMode
                      ? activePublicationEditAssets.filter((asset) => asset.selected)
                      : imageAttachments.map((attachment) => ({
                          previewUrl: attachment.url || "",
                          transform: undefined,
                          preset: activePublicationEditPreset,
                        }));
                    const firstAsset = selectedAssets[0] || null;
                    const hashtags = detailsEditMode
                      ? publicationEditForm.hashtags
                          .split(/[;,\n\s]+/)
                          .map((tag) => tag.trim().replace(/^#+/, ""))
                          .filter(Boolean)
                      : (Array.isArray(activeParts.hashtags) ? activeParts.hashtags : [])
                          .map((tag: string) => String(tag || "").trim().replace(/^#+/, ""))
                          .filter(Boolean);
                    const previewTitle = detailsEditMode ? publicationEditForm.title : (activeParts.title || "");
                    const previewContent = detailsEditMode ? publicationEditForm.content : (activeParts.content || "");
                    const previewCta = detailsEditMode
                      ? getPublicationPreviewCta(publicationDisplayKey, publicationEditForm)
                      : (activeParts.cta || "");
                    return {
                      channelKey: activePublicationEntry.key,
                      mediaType: isVideoPublication ? "video" as const : "images" as const,
                      channelLabel: activePublicationEntry?.label || formatChannelLabel(activePublicationEntry.key),
                      title: previewTitle,
                      content: previewContent,
                      cta: previewCta,
                      hashtags,
                      imageCount: isVideoPublication ? 0 : selectedAssets.length,
                      video: isVideoPublication && activeVideoDisplayAttachment?.url
                        ? {
                            previewUrl: activeVideoDisplayAttachment.url,
                            name: activeVideoDisplayAttachment.name || "Vidéo iNrCy",
                            type: activeVideoDisplayAttachment.type || "video/mp4",
                            size: activeVideoDisplayAttachment.size || null,
                            duration: (activeVideoDisplayAttachment as any).duration || null,
                            aspectRatio: activeVideoSettings
                              ? getVideoPreviewAspectRatio(activeVideoSettings.format as any, activeVideoSourceMetadata as any)
                              : null,
                            fitMode: activeVideoSettings ? getVideoPreviewFitMode(activeVideoSettings.adaptationMode as any) : null,
                          }
                        : null,
                      formatLabel: isVideoPublication
                        ? activeVideoFormatLabel && activeVideoAdaptationLabel
                          ? `Vidéo ${activeVideoFormatLabel} · ${activeVideoAdaptationLabel}`
                          : "Vidéo finale"
                        : activePublicationEntry.key === "inrcy_site" || activePublicationEntry.key === "site_web" ? "Rendu site / iframe" : `Image finale : ${activePublicationEditPreset.width}×${activePublicationEditPreset.height}`,
                      image: firstAsset
                        ? {
                            previewUrl: firstAsset.previewUrl,
                          transform: firstAsset.transform,
                          preset: firstAsset.preset || activePublicationEditPreset,
                          }
                        : null,
                      images: selectedAssets.map((asset) => ({
                        previewUrl: asset.previewUrl,
                        transform: asset.transform,
                        preset: asset.preset || activePublicationEditPreset,
                      })),
                    };
                  })();

                  return (
                    <>
                      <div className={styles.detailsStack}>
                        <section className={styles.detailSectionCard}>
                          <div className={styles.detailSectionHeader}>
                            <div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <div className={styles.detailsTitle}>{detailsItem.title || "(sans objet)"}</div>
                                {isVideoPublication ? <span className={styles.publicationMediaBadge}>🎬 Vidéo</span> : null}
                              </div>
                              <div className={styles.detailsSub}>{formatOutboxStatusLabel(detailsItem)}</div>
                            </div>
                          </div>

                          {detailsItem.source === "send_items" ? (
                            <>
                              <div className={styles.metaGrid}>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Boîte d’envoi</div>
                                  <div className={styles.metaVal}>{detailsAccountLabel || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Destinataires</div>
                                  <div className={styles.metaVal}>{splitList(detailsItem.to || detailsItem.target).join(", ") || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Objet</div>
                                  <div className={styles.metaVal}>{detailsItem.subject || detailsItem.title || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Document source</div>
                                  <div className={styles.metaVal}>{(detailsItem as any).raw?.source_doc_number || "—"}</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                {isDraftItem ? (
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={() => resumeDraft(detailsItem)}
                                  >
                                    Reprendre l’édition
                                  </button>
                                ) : null}
                                {detailsItem.reopenHref ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => router.push(detailsItem.reopenHref || "/dashboard/mails")}
                                  >
                                    Réouvrir dans l’outil
                                  </button>
                                ) : null}
                                {(detailsItem as any).raw?.source_doc_type === "devis" && (detailsItem as any).raw?.source_doc_save_id ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => router.push(`/dashboard/factures/new?fromDevisSaveId=${encodeURIComponent((detailsItem as any).raw.source_doc_save_id)}`)}
                                  >
                                    Créer la facture
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : detailsItem.source === "mail_campaigns" ? (
                            <>
                              <div
                                style={{
                                  padding: 16,
                                  borderRadius: 16,
                                  border: "1px solid rgba(76,195,255,0.20)",
                                  background: "rgba(76,195,255,0.06)",
                                  marginBottom: 14,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                  <div>
                                    {!isCampaignFinishedStatus(campaignReport?.status || (detailsItem as any).raw?.status) ? (
                                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginBottom: 4 }}>
                                        Suivi automatique toutes les 2 minutes
                                      </div>
                                    ) : null}
                                    <div style={{ fontSize: 17, fontWeight: 800 }}>
                                      {campaignStatusLabel(campaignReport?.status || (detailsItem as any).raw?.status)}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 28, fontWeight: 900 }}>
                                    {campaignReport?.progressPercent ?? Math.max(0, Number((detailsItem as any).raw?.progress_percent || 0))}%
                                  </div>
                                </div>
                                <div style={{ height: 9, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden", marginTop: 12 }}>
                                  <div
                                    style={{
                                      width: `${Math.max(0, Math.min(100, campaignReport?.progressPercent ?? Number((detailsItem as any).raw?.progress_percent || 0)))}%`,
                                      height: "100%",
                                      borderRadius: 999,
                                      background: "linear-gradient(90deg, rgba(76,195,255,0.85), rgba(120,105,255,0.90))",
                                      transition: "width 300ms ease",
                                    }}
                                  />
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 14 }}>
                                  <div>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>Temps restant estimé</div>
                                    <div style={{ marginTop: 3, fontWeight: 700 }}>
                                      {campaignReport?.estimatedRemainingMs != null
                                        ? formatCampaignDuration(campaignReport.estimatedRemainingMs)
                                        : "Calcul en cours"}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>Fin estimée</div>
                                    <div style={{ marginTop: 3, fontWeight: 700 }}>
                                      {campaignReport?.estimatedCompletionAt
                                        ? new Date(campaignReport.estimatedCompletionAt).toLocaleString()
                                        : "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>Durée écoulée</div>
                                    <div style={{ marginTop: 3, fontWeight: 700 }}>
                                      {campaignReport?.elapsedMs != null ? formatCampaignDuration(campaignReport.elapsedMs) : "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>Bilan de campagne</div>
                                    <div style={{ marginTop: 3, fontWeight: 700 }}>
                                      {completionEmailLabel(campaignReport?.completionEmail.status || (detailsItem as any).raw?.completion_email_status)}
                                    </div>
                                  </div>
                                </div>
                                {campaignReport?.completionEmail.lastError ? (
                                  <div style={{ marginTop: 10, color: "#ffb0b0", fontSize: 12 }}>
                                    {campaignReport.completionEmail.lastError}
                                  </div>
                                ) : null}
                              </div>
                              <div className={styles.metaGrid}>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Boîte d’envoi</div>
                                  <div className={styles.metaVal}>{detailsAccountLabel || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Destinataires</div>
                                  <div className={styles.metaVal}>{(detailsItem as any).raw?.total_count || 0} contact{Number((detailsItem as any).raw?.total_count || 0) > 1 ? "s" : ""}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Progression</div>
                                  <div className={styles.metaVal}>{formatCampaignProgressFromHealth((detailsItem as any).raw || {}, campaignHealth)}</div>
                                </div>
                                {String((detailsItem as any).raw?.status || "").toLowerCase() === "paused" ? (
                                  <div className={styles.metaRow}>
                                    <div className={styles.metaKey}>Reprise</div>
                                    <div className={styles.metaVal}>
                                      {(detailsItem as any).raw?.resume_at
                                        ? `Automatique le ${new Date((detailsItem as any).raw.resume_at).toLocaleString()}`
                                        : "Manuelle après correction de la boîte"}
                                    </div>
                                  </div>
                                ) : null}
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Objet</div>
                                  <div className={styles.metaVal}>{detailsItem.subject || detailsItem.title || "—"}</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                {isRetryableCampaignItem(detailsItem) ? (
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={() => void retryCampaignFailedRecipients(detailsItem.id)}
                                    disabled={campaignActionBusyId === detailsItem.id}
                                  >
                                    {campaignActionBusyId === detailsItem.id
                                      ? "Relance…"
                                      : String((detailsItem as any).raw?.status || "").toLowerCase() === "paused"
                                        ? "Reprendre la campagne"
                                        : "Relancer les échecs"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => {
                                    void Promise.all([
                                      loadCampaignRecipients(detailsItem.id, campaignRecipientsPage, campaignRecipientsFilter),
                                      loadCampaignHealth(detailsItem.id, (detailsItem as any).raw || {}),
                                      refreshHistory?.(),
                                    ]);
                                  }}
                                  disabled={campaignRecipientsLoading || campaignHealthLoading || campaignActionBusyId === detailsItem.id}
                                >
                                  {campaignRecipientsLoading || campaignHealthLoading ? "Actualisation…" : "Rafraîchir le suivi"}
                                </button>
                                {["completed", "partial", "failed"].includes(String(campaignReport?.status || (detailsItem as any).raw?.status || "").toLowerCase()) ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => void resendCampaignCompletionSummary(detailsItem.id)}
                                    disabled={campaignSummaryBusyId === detailsItem.id}
                                  >
                                    {campaignSummaryBusyId === detailsItem.id
                                      ? "Envoi du bilan…"
                                      : campaignReport?.completionEmail.status === "sent"
                                        ? "Renvoyer le bilan"
                                        : "Envoyer le bilan"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => void openCampaignComposeFromHistory(detailsItem, "reuse")}
                                  disabled={campaignActionBusyId === detailsItem.id}
                                >
                                  {campaignActionBusyId === detailsItem.id ? "Préparation…" : "Réutiliser"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => void openCampaignComposeFromHistory(detailsItem, "resend")}
                                  disabled={campaignActionBusyId === detailsItem.id}
                                >
                                  {campaignActionBusyId === detailsItem.id ? "Préparation…" : "Renvoyer"}
                                </button>
                                {detailsItem.reopenHref ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => router.push(detailsItem.reopenHref || "/dashboard/mails")}
                                  >
                                    Réouvrir dans l’outil
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                              <div className={styles.detailPillsWrap}>
                                {publicationChannelEntries.length ? (
                                  publicationChannelEntries.map((entry, idx) => {
                                    const entryResult = detailsItem.source === "app_events" && payload?.results && typeof payload.results === "object"
                                      ? ((payload.results as any)[entry.key] || null)
                                      : null;
                                    const entryIndicator = getChannelIndicatorMeta(
                                      entryResult,
                                      entry.key,
                                    );
                                    return (
                                      <button
                                        key={`${entry.key}-${idx}`}
                                        type="button"
                                        className={`${styles.channelBubbleBtn} ${activePublicationEntry?.key === entry.key ? styles.channelBubbleBtnActive : ""}`}
                                        onClick={() => void requestChannelChange(entry.key)}
                                      >
                                        <span className={styles.channelBubble}>
                                          <span>{entry.label}</span>
                                          {entryIndicator ? (
                                            <span
                                              className={entryIndicator.className}
                                              title={entryIndicator.title}
                                              aria-label={entryIndicator.title}
                                            />
                                          ) : null}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <span className={styles.metaVal}>—</span>
                                )}
                              </div>
                              {activePublicationEntry ? (
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
                                  {detailsActionSuccess ? (
                                    <div className={styles.detailsSuccessInline}>
                                      <b>Action :</b> {detailsActionSuccess}
                                    </div>
                                  ) : null}
                                  {!isDraftItem && activePublicationStatusMeta ? (
                                    <div
                                      title={activePublicationStatusMeta.title}
                                      style={{
                                        ...getPublicationStatusPillStyle(activePublicationStatusMeta.tone),
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        minHeight: 34,
                                        padding: "6px 10px",
                                        borderRadius: 999,
                                        fontSize: 12,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      <span
                                        aria-hidden="true"
                                        style={{
                                          width: 7,
                                          height: 7,
                                          borderRadius: 999,
                                          background: "currentColor",
                                          opacity: 0.92,
                                        }}
                                      />
                                      <span>
                                        Statut : <b>{activePublicationStatusMeta.label}</b>
                                      </span>
                                      {activePublicationStatusTime ? (
                                        <span style={{ opacity: 0.66 }}>· {activePublicationStatusTime}</span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {!isDraftItem && activePublicationId ? (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => void refreshPublicationStatus(false)}
                                      disabled={detailsActionBusy || publicationStatusRefreshing}
                                      title="Actualiser le statut de tous les canaux"
                                    >
                                      {publicationStatusRefreshing ? "Actualisation…" : "Actualiser le statut"}
                                    </button>
                                  ) : null}
                                  {!isDraftItem && activeChannelAccountHref ? (
                                    <a
                                      className={styles.btnGhost}
                                      href={activeChannelAccountHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={activeConnectedChannelDetail?.label || `Ouvrir ${activePublicationEntry.label}`}
                                      style={{ textDecoration: "none" }}
                                    >
                                      {activeChannelAccountActionLabel}
                                    </a>
                                  ) : null}
                                  {isTiktokPublicationEntry && !isDraftItem ? (
                                    <>
                                      {!tiktokStatusMeta?.cancelled ? (
                                        <button
                                          type="button"
                                          className={styles.btnGhost}
                                          onClick={() => void checkTiktokPublicationStatus(publicationId)}
                                          disabled={detailsActionBusy || tiktokStatusChecking || tiktokRetrying || tiktokCancelling || !tiktokPublishId}
                                          title={tiktokPublishId ? "Vérifier le statut réel auprès de TikTok" : "Identifiant TikTok introuvable"}
                                        >
                                          {tiktokStatusChecking ? "Vérification…" : "Vérifier le statut"}
                                        </button>
                                      ) : null}
                                      {tiktokStatusMeta?.failed || tiktokStatusMeta?.pending ? (
                                        <button
                                          type="button"
                                          className={tiktokStatusMeta?.failed ? styles.btnPrimary : styles.btnGhost}
                                          onClick={() => void retryTiktokPublication(publicationId, tiktokStatusMeta)}
                                          disabled={detailsActionBusy || tiktokStatusChecking || tiktokRetrying || tiktokCancelling}
                                          title={tiktokStatusMeta?.pending ? "Retenter avec confirmation pour éviter les doublons" : "Retenter l’envoi TikTok"}
                                        >
                                          {tiktokRetrying ? "Relance…" : "Retenter l’envoi"}
                                        </button>
                                      ) : null}
                                      {tiktokStatusMeta?.pending ? (
                                        <button
                                          type="button"
                                          className={styles.btnDangerSmall}
                                          onClick={() => void cancelPendingTiktokPublication(publicationId, tiktokStatusMeta)}
                                          disabled={detailsActionBusy || tiktokStatusChecking || tiktokRetrying || tiktokCancelling}
                                          title="Arrêter le suivi iNrSend et annuler cette publication en attente"
                                        >
                                          {tiktokCancelling ? "Annulation…" : "Annuler"}
                                        </button>
                                      ) : null}
                                      {tiktokDirectPublicationHref && tiktokDirectPublicationHref !== activeChannelAccountHref ? (
                                        <button
                                          type="button"
                                          className={styles.btnPrimary}
                                          onClick={() => {
                                            if (typeof window !== "undefined") window.open(tiktokDirectPublicationHref, "_blank", "noopener,noreferrer");
                                          }}
                                          disabled={detailsActionBusy || tiktokCancelling}
                                          title="Ouvrir la publication TikTok"
                                        >
                                          Voir la publication
                                        </button>
                                      ) : null}
                                    </>
                                  ) : isYoutubeShortsPublicationEntry && !isDraftItem ? (
                                    youtubeShortsPublicationHref && youtubeShortsPublicationHref !== activeChannelAccountHref ? (
                                      <button
                                        type="button"
                                        className={styles.btnPrimary}
                                        onClick={() => {
                                          if (typeof window !== "undefined") window.open(youtubeShortsPublicationHref, "_blank", "noopener,noreferrer");
                                        }}
                                        disabled={detailsActionBusy}
                                        title="Ouvrir la vidéo publiée sur YouTube"
                                      >
                                        Voir la vidéo
                                      </button>
                                    ) : null
                                  ) : isDraftItem ? (
                                    <button
                                      type="button"
                                      className={styles.btnPrimary}
                                      onClick={() => resumeDraft(detailsItem)}
                                      disabled={detailsActionBusy}
                                    >
                                      Reprendre l’édition
                                    </button>
                                  ) : detailsEditMode ? (
                                    <button
                                      type="button"
                                      className={styles.btnPrimary}
                                      onClick={saveChannelPublication}
                                      disabled={detailsActionBusy}
                                    >
                                      {detailsActionBusy ? "Enregistrement…" : "Enregistrer"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => { setPublicationEditDirty(false); setDetailsEditMode(true); setDetailsActionError(null); setDetailsActionSuccess(null); }}
                                      disabled={detailsActionBusy}
                                      title="Modifier la publication"
                                      aria-label="Modifier la publication"
                                    >
                                      Modifier
                                    </button>
                                  )}
                                  {!isDraftItem && !isExternalVideoPublicationEntry ? (
                                    <button
                                      type="button"
                                      className={styles.btnDangerSmall}
                                      onClick={() => void deleteChannelPublicationAndSyncStatus()}
                                      disabled={detailsActionBusy}
                                      title="Supprimer la publication"
                                      aria-label="Supprimer la publication"
                                    >
                                      {detailsActionBusy && !detailsEditMode ? "Suppression…" : "Supprimer"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : isDraftItem ? (
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
                                  {isDraftItem ? (
                                    <button
                                      type="button"
                                      className={styles.btnPrimary}
                                      onClick={() => resumeDraft(detailsItem)}
                                    >
                                      Reprendre l’édition
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          )}

                          {detailsActionError ? (
                            <div className={styles.detailsError}>
                              <b>Action :</b>{" "}
                              {detailsItem.source === "app_events"
                                ? detailsActionError
                                : formatVisibleMailError(detailsActionError, detailsMailProvider) || detailsActionError}
                            </div>
                          ) : null}

                          {isTiktokPublicationEntry && !isDraftItem && !detailsEditMode ? (
                            <div
                              style={{
                                marginTop: 12,
                                padding: "10px 12px",
                                borderRadius: 14,
                                border: tiktokStatusMeta?.failed
                                  ? "1px solid rgba(248,113,113,0.35)"
                                  : tiktokStatusMeta?.cancelled
                                    ? "1px solid rgba(168,85,247,0.35)"
                                  : tiktokStatusMeta?.pending
                                    ? "1px solid rgba(250,204,21,0.35)"
                                    : "1px solid rgba(56,189,248,0.24)",
                                background: tiktokStatusMeta?.failed
                                  ? "rgba(127,29,29,0.22)"
                                  : tiktokStatusMeta?.cancelled
                                    ? "rgba(88,28,135,0.18)"
                                  : tiktokStatusMeta?.pending
                                    ? "rgba(250,204,21,0.10)"
                                    : "rgba(56,189,248,0.08)",
                                color: "rgba(225,245,255,0.92)",
                                fontSize: 13,
                              }}
                            >
                              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <b>TikTok :</b>
                                <span>Statut réel : <b>{tiktokStatusMeta?.label || "À vérifier"}</b></span>
                                {tiktokPublishId ? (
                                  <span style={{ opacity: 0.72 }}>ID suivi : {tiktokPublishId}</span>
                                ) : null}
                                {tiktokStatusMeta?.uploadedBytes ? (
                                  <span style={{ opacity: 0.72 }}>
                                    Reçu par TikTok : {formatTiktokBytes(tiktokStatusMeta.uploadedBytes)}
                                  </span>
                                ) : null}
                                {tiktokStatusMeta?.downloadedBytes ? (
                                  <span style={{ opacity: 0.72 }}>
                                    Téléchargé : {formatTiktokBytes(tiktokStatusMeta.downloadedBytes)}
                                  </span>
                                ) : null}
                                {tiktokStatusMeta?.checkCount ? (
                                  <span style={{ opacity: 0.72 }}>
                                    Vérifications : {tiktokStatusMeta.checkCount}
                                  </span>
                                ) : null}
                                {tiktokStatusMeta?.processingDurationSeconds ? (
                                  <span style={{ opacity: 0.72 }}>
                                    Durée : {formatTiktokDuration(tiktokStatusMeta.processingDurationSeconds)}
                                  </span>
                                ) : null}
                              </div>
                              {tiktokStatusMeta?.checkedAt ? (
                                <div style={{ marginTop: 5, opacity: 0.72 }}>
                                  Dernier contrôle : {formatTiktokDate(tiktokStatusMeta.checkedAt)}
                                </div>
                              ) : null}
                              <div style={{ marginTop: 6, color: tiktokStatusMeta?.failed ? "#fecaca" : tiktokStatusMeta?.cancelled ? "#e9d5ff" : tiktokStatusMeta?.pending ? "#fde68a" : "rgba(225,245,255,0.88)" }}>
                                {tiktokStatusMeta?.message ||
                                  (tiktokStatusMeta?.cancelled
                                    ? "Publication annulée dans iNrSend. Le suivi automatique est arrêté."
                                    : tiktokStatusMeta?.pending
                                    ? "TikTok traite encore la publication. iNrSend vérifie automatiquement son résultat ; le bouton permet aussi une vérification immédiate."
                                    : "iNrSend garde l’historique et le suivi TikTok. La modification ou suppression réelle se fait dans TikTok.")}
                              </div>
                              {tiktokStatusMeta?.failReason ? (
                                <div style={{ marginTop: 5, opacity: 0.8 }}>
                                  Motif technique TikTok : <code>{tiktokStatusMeta.failReason}</code>
                                </div>
                              ) : null}
                              {tiktokStatusMeta?.providerErrorCode ? (
                                <div style={{ marginTop: 5, opacity: 0.8 }}>
                                  Code TikTok : <code>{tiktokStatusMeta.providerErrorCode}</code>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {isYoutubeShortsPublicationEntry && !isDraftItem && !detailsEditMode ? (
                            <div
                              style={{
                                marginTop: 12,
                                padding: "10px 12px",
                                borderRadius: 14,
                                border: "1px solid rgba(56,189,248,0.24)",
                                background: "rgba(56,189,248,0.08)",
                                color: "rgba(225,245,255,0.92)",
                                fontSize: 13,
                              }}
                            >
                              <b>YouTube :</b> iNrSend garde le statut et le lien de la vidéo publiée. Pour l’instant, la modification ou suppression réelle se fait dans YouTube Studio ; retirer l’entrée depuis le tableau iNrSend ne supprime pas la vidéo YouTube.
                            </div>
                          ) : null}

                          {detailsItem.source === "app_events" && activePublicationFailed && !activePublicationDeleted ? (
                            <div className={styles.detailsError}>
                              <b>Statut :</b> Publication échouée
                            </div>
                          ) : null}

                          {detailsItem.source === "app_events" && activePublicationFailed && activePublicationFailureMessage ? (
                            <div className={styles.detailsError}>
                              <b>Détail :</b> {activePublicationFailureMessage}
                            </div>
                          ) : null}

                          {detailsItem.source === "app_events" && activePublicationWarning ? (
                            <div className={styles.detailsWarning}>
                              <b>Statut :</b> Publiée avec avertissement
                              {activePublicationWarningMessage ? ` — ${activePublicationWarningMessage}` : ""}
                            </div>
                          ) : null}

                          {detailsItem.error ? (
                            <div className={styles.detailsError}>
                              <b>Détail :</b> {detailsItem.source !== "app_events" ? formatVisibleMailError(detailsItem.error, detailsMailProvider) : visiblePublicationItemError}
                            </div>
                          ) : null}
                        </section>

                        <section className={styles.detailSectionCard}>
                          <div className={styles.detailSectionHeader}>
                            <div className={styles.messageHeaderTitle}>{detailsItem.source === "app_events" && detailsEditMode ? "Contenu" : "Message"}</div>
                          </div>

                          {detailsItem.source !== "app_events" ? (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: safeDetailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : activePublicationEntry ? (
                            (() => {
                              const parts = activeParts;
                              const isSitePublication = activePublicationEntry.key === "inrcy_site" || activePublicationEntry.key === "site_web" || activePublicationEntry.key === "site";
                              const showInstagramHashtags = activePublicationEntry.key === "instagram" || activePublicationEntry.key === "tiktok";
                              const deletedAt = activePublicationResult?.deleted_at ? new Date(String(activePublicationResult.deleted_at)).toLocaleString() : null;
                              const hasAny = !!(parts.title || parts.content || parts.cta || (showInstagramHashtags && parts.hashtags?.length));
                              if (!hasAny && showFallbackMessage) {
                                return (
                                  <div className={styles.messageBody}>
                                    {detailsItem.detailHtml ? (
                                      <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: safeDetailHtml }} />
                                    ) : (
                                      <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                                    )}
                                  </div>
                                );
                              }
                              if (!hasAny && !detailsEditMode) return <div className={styles.emptyDetailText}>Aucun message disponible pour ce canal.</div>;
                              return (
                                <article key={activePublicationEntry.key} className={styles.channelPublicationCard}>
                                  {activePublicationDeleted ? (
                                    <div className={styles.detailsError} style={{ marginBottom: 12 }}>
                                      <b>Statut :</b> Supprimé{deletedAt ? ` le ${deletedAt}` : ""}
                                    </div>
                                  ) : null}
                                  <div className={styles.publicationParts}>
                                    {detailsEditMode && !activePublicationDeleted ? (
                                      <>
                                        <div>
                                          <div className={styles.publicationLabel}>Titre</div>
                                          {isMobileViewport ? (
                                            <textarea
                                              value={publicationEditForm.title}
                                              onChange={(e) => updatePublicationEdit({ title: e.target.value })}
                                              className={`${styles.publicationFieldInput} ${styles.publicationFieldInputMultiline}`}
                                              placeholder="Titre"
                                              rows={2}
                                              disabled={detailsActionBusy}
                                            />
                                          ) : (
                                            <input
                                              type="text"
                                              value={publicationEditForm.title}
                                              onChange={(e) => updatePublicationEdit({ title: e.target.value })}
                                              className={styles.publicationFieldInput}
                                              placeholder="Titre"
                                              disabled={detailsActionBusy}
                                            />
                                          )}
                                        </div>
                                        <div>
                                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                                            <div className={styles.publicationLabel} style={{ marginBottom: 0 }}>Contenu</div>
                                            {isSitePublication ? (
                                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                                {([
                                                  ["bold", "B", "Gras"],
                                                  ["italic", "I", "Italique"],
                                                  ["underline", "U", "Souligné"],
                                                ] as const).map(([kind, label, title]) => (
                                                  <button
                                                    key={kind}
                                                    type="button"
                                                    title={title}
                                                    aria-label={title}
                                                    disabled={detailsActionBusy}
                                                    onMouseDown={(event) => {
                                                      if (event.cancelable) event.preventDefault();
                                                      applyPublicationSiteContentFormat(kind);
                                                    }}
                                                    style={{
                                                      minWidth: 32,
                                                      height: 30,
                                                      borderRadius: 9,
                                                      border: "1px solid rgba(76,195,255,0.35)",
                                                      background: "rgba(76,195,255,0.12)",
                                                      color: "#eaf7ff",
                                                      fontWeight: 900,
                                                      fontStyle: kind === "italic" ? "italic" : "normal",
                                                      textDecoration: kind === "underline" ? "underline" : "none",
                                                      cursor: detailsActionBusy ? "not-allowed" : "pointer",
                                                      opacity: detailsActionBusy ? 0.55 : 1,
                                                    }}
                                                  >
                                                    {label}
                                                  </button>
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                          {isSitePublication ? (
                                            <RichSiteContentEditor
                                              value={publicationEditForm.content}
                                              onChange={(content) => updatePublicationEdit({ content })}
                                              minHeight={180}
                                              editorRef={publicationSiteContentEditorRef}
                                              style={{ ...textAreaStyle, minHeight: 180 }}
                                            />
                                          ) : (
                                            <textarea
                                              value={publicationEditForm.content}
                                              onChange={(e) => updatePublicationEdit({ content: e.target.value })}
                                              className={styles.publicationFieldTextarea}
                                              placeholder="Contenu"
                                              rows={8}
                                              disabled={detailsActionBusy}
                                            />
                                          )}
                                        </div>
                                        <div>
                                          {(() => {
                                            const ctaMode = (publicationEditForm.ctaMode || "none") as BoosterCtaMode;
                                            const publicationCtaPost: Partial<ChannelPost> = {
                                              title: publicationEditForm.title,
                                              content: publicationEditForm.content,
                                              cta: publicationEditForm.cta,
                                              ctaMode,
                                              ctaUrl: publicationEditForm.ctaUrl,
                                              ctaPhone: publicationEditForm.ctaPhone,
                                            };
                                            const ctaChoice = getPreferredCtaChoiceFromPost(publicationDisplayKey, publicationCtaPost);
                                            const activeWebsiteUrl = getWebsiteUrlForChannel(publicationDisplayKey, publicationCtaDefaults);
                                            const activeWebsiteSourceLabel = getWebsiteSourceLabelForChannel(publicationDisplayKey, publicationCtaDefaults);
                                            const websiteChoices = [
                                              publicationCtaDefaults?.inrcySiteUrl
                                                ? { label: "Site iNrCy", url: publicationCtaDefaults.inrcySiteUrl }
                                                : null,
                                              publicationCtaDefaults?.siteWebUrl
                                                ? { label: "Site web", url: publicationCtaDefaults.siteWebUrl }
                                                : null,
                                            ].filter(Boolean) as Array<{ label: string; url: string }>;
                                            const ctaGridColumns = isMobileViewport
                                              ? "1fr"
                                              : ctaMode === "website" || ctaMode === "custom"
                                                ? "minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1fr)"
                                                : ctaMode === "call"
                                                  ? "minmax(0, 0.9fr) minmax(0, 1.1fr)"
                                                  : "minmax(0, 0.9fr)";
                                            return (
                                              <>
                                                <div style={{ display: "grid", gridTemplateColumns: ctaGridColumns, gap: 10, alignItems: "start" }}>
                                                  <div>
                                                    <div className={styles.publicationLabel}>Bouton</div>
                                                    <select
                                                      value={ctaChoice}
                                                      onChange={(e) => applyPublicationPreferredCtaPrefill(e.target.value as BoosterPreferredCta)}
                                                      style={darkSelectStyle}
                                                      disabled={detailsActionBusy}
                                                    >
                                                      {BOOSTER_PREFERRED_CTA_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value} style={darkOptionStyle}>
                                                          {option.label}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>

                                                  {ctaMode === "website" ? (
                                                    <>
                                                      <div>
                                                        <div className={styles.publicationLabel}>URL de destination</div>
                                                        <input
                                                          value={publicationEditForm.ctaUrl || ""}
                                                          onChange={(e) => updatePublicationEdit({ ctaUrl: e.target.value })}
                                                          style={lightFieldStyle}
                                                          placeholder={
                                                            activeWebsiteUrl
                                                              ? `URL du site préremplie (${activeWebsiteSourceLabel})`
                                                              : websiteChoices.length > 1
                                                                ? "Choisissez Site iNrCy ou Site web"
                                                                : "URL du site (optionnel)"
                                                          }
                                                          disabled={detailsActionBusy}
                                                        />
                                                        {websiteChoices.length ? (
                                                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                                                            {websiteChoices.map((choice) => (
                                                              <button
                                                                key={choice.label}
                                                                type="button"
                                                                onClick={() => updatePublicationEdit({ ctaUrl: choice.url })}
                                                                disabled={detailsActionBusy}
                                                                style={{
                                                                  border: publicationEditForm.ctaUrl === choice.url
                                                                    ? "1px solid rgba(76,195,255,0.55)"
                                                                    : "1px solid rgba(255,255,255,0.14)",
                                                                  background: publicationEditForm.ctaUrl === choice.url
                                                                    ? "rgba(76,195,255,0.14)"
                                                                    : "rgba(255,255,255,0.06)",
                                                                  color: "rgba(255,255,255,0.86)",
                                                                  borderRadius: 999,
                                                                  padding: "5px 9px",
                                                                  fontSize: 11,
                                                                  fontWeight: 800,
                                                                  cursor: detailsActionBusy ? "not-allowed" : "pointer",
                                                                  opacity: detailsActionBusy ? 0.55 : 1,
                                                                }}
                                                              >
                                                                {choice.label}
                                                              </button>
                                                            ))}
                                                          </div>
                                                        ) : null}
                                                      </div>
                                                      <div>
                                                        <div className={styles.publicationLabel}>Texte du bouton</div>
                                                        <input
                                                          value={publicationEditForm.cta}
                                                          onChange={(e) => updatePublicationEdit({ cta: e.target.value })}
                                                          style={lightFieldStyle}
                                                          placeholder={`Texte du bouton (ex : ${getChannelDefaultCtaLabel(publicationDisplayKey, "website") || "Voir le site"})`}
                                                          disabled={detailsActionBusy}
                                                        />
                                                      </div>
                                                    </>
                                                  ) : null}

                                                  {ctaMode === "call" ? (
                                                    <div>
                                                      <div className={styles.publicationLabel}>Téléphone</div>
                                                      <input
                                                        value={publicationEditForm.ctaPhone || ""}
                                                        onChange={(e) => updatePublicationEdit({ ctaPhone: e.target.value })}
                                                        style={lightFieldStyle}
                                                        placeholder={
                                                          publicationCtaDefaults?.phone
                                                            ? "Téléphone prérempli depuis Mon profil"
                                                            : "Téléphone (optionnel)"
                                                        }
                                                        disabled={detailsActionBusy}
                                                      />
                                                    </div>
                                                  ) : null}

                                                  {ctaMode === "custom" ? (
                                                    <>
                                                      <div>
                                                        <div className={styles.publicationLabel}>URL de destination</div>
                                                        <input
                                                          value={publicationEditForm.ctaUrl || ""}
                                                          onChange={(e) => updatePublicationEdit({ ctaUrl: e.target.value })}
                                                          style={lightFieldStyle}
                                                          placeholder="URL personnalisée (optionnel)"
                                                          disabled={detailsActionBusy}
                                                        />
                                                      </div>
                                                      <div>
                                                        <div className={styles.publicationLabel}>Texte du bouton</div>
                                                        <input
                                                          value={publicationEditForm.cta}
                                                          onChange={(e) => updatePublicationEdit({ cta: e.target.value })}
                                                          style={lightFieldStyle}
                                                          placeholder="Ex : En savoir plus"
                                                          disabled={detailsActionBusy}
                                                        />
                                                      </div>
                                                    </>
                                                  ) : null}
                                                </div>
                                                <div style={{ fontSize: 11, marginTop: 6, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                                                  {getCtaModeHelp(publicationDisplayKey, ctaMode)}
                                                </div>
                                                {ctaMode === "website" && activeWebsiteUrl ? (
                                                  <div style={{ fontSize: 11, marginTop: 8, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                                                    Valeur par défaut disponible depuis {activeWebsiteSourceLabel.toLowerCase()} : {activeWebsiteUrl}
                                                  </div>
                                                ) : ctaMode === "website" && websiteChoices.length > 1 ? (
                                                  <div style={{ fontSize: 11, marginTop: 8, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                                                    Deux sites sont connectés : choisissez le lien à utiliser avec les boutons ci-dessus.
                                                  </div>
                                                ) : null}
                                                {ctaMode === "call" && publicationCtaDefaults?.phone ? (
                                                  <div style={{ fontSize: 11, marginTop: 8, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                                                    Valeur par défaut disponible depuis Mon profil : {publicationCtaDefaults.phone}
                                                  </div>
                                                ) : null}
                                                {ctaMode === "website" || ctaMode === "custom" ? (
                                                  <div style={{ fontSize: 11, marginTop: 6, textAlign: "right", color: publicationEditForm.cta.length > CHANNEL_TEXT_GUIDELINES[publicationDisplayKey].cta ? "#ff8f8f" : "rgba(255,255,255,0.62)" }}>
                                                    Bouton : {publicationEditForm.cta.length} / {CHANNEL_TEXT_GUIDELINES[publicationDisplayKey].cta}
                                                  </div>
                                                ) : null}
                                              </>
                                            );
                                          })()}
                                        </div>
                                        {activePublicationEntry.key === "instagram" || activePublicationEntry.key === "tiktok" ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Hashtags</div>
                                            <input
                                              type="text"
                                              value={publicationEditForm.hashtags}
                                              onChange={(e) => updatePublicationEdit({ hashtags: e.target.value })}
                                              className={styles.publicationFieldInput}
                                              placeholder="maçonnerie lens btp"
                                              disabled={detailsActionBusy}
                                            />
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <>
                                        {parts.title ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Titre</div>
                                            {isSitePublication ? (
                                              <div
                                                className={styles.publicationValue}
                                                dangerouslySetInnerHTML={{
                                                  __html: sanitizeHtml(renderBoosterSiteInlineHtml(parts.title)),
                                                }}
                                              />
                                            ) : (
                                              <div className={styles.publicationValue}>{stripSiteTextFormatting(parts.title)}</div>
                                            )}
                                          </div>
                                        ) : null}
                                        {parts.content ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Contenu</div>
                                            {activePublicationEntry.key === "inrcy_site" || activePublicationEntry.key === "site_web" ? (
                                              <div
                                                className={styles.publicationPre}
                                                dangerouslySetInnerHTML={{
                                                  __html: sanitizeHtml(renderBoosterSiteContentHtml(parts.content)),
                                                }}
                                              />
                                            ) : (
                                              <pre className={styles.publicationPre}>{stripSiteTextFormatting(parts.content)}</pre>
                                            )}
                                          </div>
                                        ) : null}
                                        {parts.cta ? (
                                          <div>
                                            <div className={styles.publicationLabel}>CTA</div>
                                            <div className={styles.publicationCtaBox}>{stripSiteTextFormatting(parts.cta)}</div>
                                          </div>
                                        ) : null}
                                        {(activePublicationEntry.key === "instagram" || activePublicationEntry.key === "tiktok") && parts.hashtags && parts.hashtags.length ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Hashtags</div>
                                            <div className={styles.publicationTagRow}>
                                              {parts.hashtags.map((t, idx) => (
                                                <span key={idx} className={styles.publicationTag}>#{t.replace(/^#/, "")}</span>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                </article>
                              );
                            })()
                          ) : showFallbackMessage ? (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: safeDetailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : (
                            <div className={styles.emptyDetailText}>Aucun message disponible.</div>
                          )}
                        </section>

                        {detailsItem.source === "app_events" && activePublicationEntry && !activePublicationDeleted ? (
                          <>
                            {detailsEditMode && !isVideoPublication ? (
                              <InrcyCameraCaptureModal
                                open={publicationCameraOpen}
                                title="Appareil iNrCy"
                                onClose={closePublicationCamera}
                                onCapture={async (file) => {
                                  handlePublicationPhoto(file);
                                  restoreDetailsModalScroll();
                                }}
                              />
                            ) : null}

                            {detailsEditMode ? (
                              <>
                                <input
                                  id={publicationEditFileInputId}
                                  type="file"
                                  accept={BOOSTER_IMAGE_ACCEPT}
                                  multiple
                                  className={styles.hiddenFileInput}
                                  onChange={(e) => {
                                    const input = e.currentTarget;
                                    const files = input?.files ?? null;
                                    handlePublicationImageFiles(files);
                                    if (input) input.value = "";
                                  }}
                                />
                                <input
                                  id={publicationVideoInputId}
                                  type="file"
                                  accept={BOOSTER_VIDEO_ACCEPT}
                                  className={styles.hiddenFileInput}
                                  onChange={(e) => {
                                    const input = e.currentTarget;
                                    const files = input?.files ?? null;
                                    handlePublicationVideoFiles(files);
                                    if (input) input.value = "";
                                  }}
                                />
                                <MediaOptimizerModal
                                  open={Boolean(publicationOptimizerRequest)}
                                  sourceFile={
                                    publicationOptimizerRequest?.source.kind === "file"
                                      ? publicationOptimizerRequest.source.file
                                      : null
                                  }
                                  sourceItem={
                                    publicationOptimizerRequest?.source.kind === "library"
                                      ? publicationOptimizerRequest.source.item
                                      : null
                                  }
                                  origin="booster"
                                  onClose={closePublicationOptimizer}
                                  onOptimized={handleOptimizedPublicationMedia}
                                />
                                <MediaLibraryPickerModal
                                  open={publicationMediaLibraryOpen}
                                  title="Ajouter depuis la Médiathèque"
                                  subtitle="Sélectionnez une image ou une vidéo pour remplacer le média de cette publication."
                                  accept="all"
                                  multiple
                                  maxSelection={5}
                                  maxImageBytes={BOOSTER_MAX_IMAGE_BYTES}
                                  maxVideoBytes={BOOSTER_MAX_VIDEO_BYTES}
                                  confirmLabel="Utiliser la sélection"
                                  selectedHint="Choisissez jusqu’à 5 images ou 1 vidéo."
                                  onOpenOptimizer={openPublicationOptimizerForLibraryItem}
                                  onOversizedMedia={openPublicationOptimizerForLibraryItem}
                                  onClose={closePublicationMediaLibrary}
                                  onConfirm={async (items) => {
                                    if (items.length) markPublicationEditDirty();
                                    await addPublicationMediaLibraryItems(items);
                                    restoreDetailsModalScroll();
                                  }}
                                />
                              </>
                            ) : null}

                            {(detailsEditMode ? (activePublicationEditVideo?.removed ? false : Boolean(activePublicationEditVideo?.previewUrl) || isVideoPublication) : isVideoPublication) ? (
                              <section
                                className={styles.detailSectionCard}
                                style={{
                                  background: "#111827",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                }}
                              >
                                <div className={styles.detailSectionHeader}>
                                  <div>
                                    <div className={styles.messageHeaderTitle}>Média de la publication</div>
                                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.66)", marginTop: 4 }}>
                                      {detailsEditMode
                                        ? "Modifiez la vidéo, son format et son rendu avant d’enregistrer."
                                        : `Média source original conservé pour ${activePublicationEntry.label || formatChannelLabel(activePublicationEntry.key)}.`}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "grid", gap: 12 }}>
                                  {detailsEditMode ? (
                                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                      <label htmlFor={publicationEditFileInputId} className={styles.btnAttach}>
                                        📎 Ajouter des images
                                      </label>
                                      <button
                                        type="button"
                                        className={styles.btnAttach}
                                        onClick={() => document.getElementById(publicationVideoInputId)?.click()}
                                      >
                                        🎥 Ajouter / remplacer la vidéo
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.btnAttach}
                                        onClick={openPublicationMediaLibrary}
                                      >
                                        🗂️ Médiathèque
                                      </button>
                                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                                        1 vidéo maximum pour {activePublicationEntry?.label || "ce canal"}.
                                      </span>
                                    </div>
                                  ) : null}

                                  <BoosterVideoFormatManager
                                    isMobile={isMobileViewport}
                                    channel={(activePublicationEntry.key as ChannelKey)}
                                    videoName={detailsEditMode ? (activePublicationEditVideo?.name || activeVideoDisplayAttachment?.name) : activeVideoDisplayAttachment?.name}
                                    videoDisplayUrl={detailsEditMode ? (activePublicationEditVideo?.previewUrl || "") : (activeVideoDisplayAttachment?.url || "")}
                                    videoSize={detailsEditMode ? (activePublicationEditVideo?.size || activeVideoDisplayAttachment?.size || 0) : (activeVideoDisplayAttachment?.size || 0)}
                                    videoDurationSeconds={detailsEditMode ? (activePublicationEditVideo?.duration || activeVideoDisplayAttachment?.duration || null) : (activeVideoDisplayAttachment?.duration || null)}
                                    videoSourceMetadata={detailsEditMode ? (activePublicationEditVideo?.sourceMetadata || null) : null}
                                    currentFormat={(detailsEditMode ? (activePublicationEditVideo?.format || activeVideoSettings?.format || "original") : (activeVideoSettings?.format || "original")) as VideoFormat}
                                    adaptationMode={(detailsEditMode ? (activePublicationEditVideo?.adaptationMode || activeVideoSettings?.adaptationMode || "safe_frame") : (activeVideoSettings?.adaptationMode || "safe_frame")) as VideoAdaptationMode}
                                    videoTransformedVariants={[]}
                                    preparationState={detailsEditMode ? (activePublicationEditVideo?.preparation || null) : null}
                                    preparing={detailsEditMode ? Boolean(activePublicationEditVideo?.preparing) : false}
                                    onFormatChange={detailsEditMode ? (format) => { markPublicationEditDirty(); setPublicationVideoFormatForChannel(activePublicationEntry.key, format); } : undefined}
                                    onAdaptationModeChange={detailsEditMode ? (mode) => { markPublicationEditDirty(); setPublicationVideoAdaptationModeForChannel(activePublicationEntry.key, mode); } : undefined}
                                    onApplyFormat={detailsEditMode ? async () => { markPublicationEditDirty(); await applyPublicationVideoFormatForChannel(activePublicationEntry.key); } : undefined}
                                    onDeleteVideo={detailsEditMode ? () => { markPublicationEditDirty(); removePublicationVideo(activePublicationEntry.key); } : undefined}
                                    deleteVideoLabel="Retirer la vidéo de ce canal"
                                    onPickVideoClick={detailsEditMode ? () => document.getElementById(publicationVideoInputId)?.click() : undefined}
                                    showApplyAll={false}
                                    buttonClassName={styles.btnGhost}
                                    compact={detailsEditMode}
                                  />

                                  {activeVideoDisplayAttachment?.url && !detailsEditMode ? (
                                    <a className={styles.attachmentDownloadHint} href={activeVideoDisplayAttachment.url} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>
                                      Télécharger
                                    </a>
                                  ) : null}

                                  {detailsEditMode && (!activePublicationEditVideo || activePublicationEditVideo.removed || !activePublicationEditVideo.previewUrl) ? (
                                    <div style={{ borderRadius: 14, padding: "10px 12px", border: "1px solid rgba(251,191,36,0.25)", background: "rgba(251,191,36,0.10)", color: "#fde68a", fontSize: 12, lineHeight: 1.45, fontWeight: 750 }}>
                                      Ajoutez une nouvelle vidéo avant d’enregistrer cette publication.
                                    </div>
                                  ) : null}

                                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.45 }}>
                                    {detailsEditMode
                                      ? "Enregistrez ensuite pour republier ce canal avec la vidéo et le format affichés."
                                      : "Ce détail affiche l’original réutilisable. Les adaptations propres au canal ne remplacent jamais le fichier source."}
                                  </div>
                                </div>
                              </section>
                            ) : detailsEditMode ? (
                              <section className={styles.detailSectionCard}>
                                <div className={styles.detailSectionHeader}>
                                  <div className={styles.messageHeaderTitle}>Images de la publication</div>
                                </div>
                                <div style={{ display: "grid", gap: 12 }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                  <label htmlFor={publicationEditFileInputId} className={styles.btnAttach}>📎 Ajouter des images</label>
                                  <button
                                    type="button"
                                    className={styles.btnAttach}
                                    onClick={() => document.getElementById(publicationVideoInputId)?.click()}
                                  >
                                    🎥 Ajouter une vidéo
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.btnAttach}
                                    onClick={openPublicationMediaLibrary}
                                  >
                                    🗂️ Médiathèque
                                  </button>
                                  <span
                                    title={
                                      isMobileViewport
                                        ? activePublicationEditAssets.length >= 5
                                          ? "5 images maximum"
                                          : "Prendre une photo dans iNrCy"
                                        : "Utilisable en version mobile"
                                    }
                                    style={{ display: "inline-flex" }}
                                  >
                                    <button
                                      type="button"
                                      className={styles.btnAttach}
                                      onClick={isMobileViewport ? openPublicationCamera : undefined}
                                      disabled={!isMobileViewport || activePublicationEditAssets.length >= 5}
                                      aria-disabled={!isMobileViewport || activePublicationEditAssets.length >= 5}
                                      style={{
                                        opacity: !isMobileViewport || activePublicationEditAssets.length >= 5 ? 0.55 : 1,
                                        filter: !isMobileViewport || activePublicationEditAssets.length >= 5 ? "grayscale(1)" : undefined,
                                        cursor: !isMobileViewport || activePublicationEditAssets.length >= 5 ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      📷 Appareil iNrCy
                                    </button>
                                  </span>
                                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                                    {activePublicationEditAssets.length} image(s) pour {activePublicationEntry?.label || "ce canal"}
                                  </span>
                                </div>

                                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                  iNrCy prépare automatiquement le rendu du canal. Utilisez Adapter seulement si le cadrage doit être corrigé. Site iNrCy et Site web restent indépendants.
                                </div>

                                <ChannelImageAdapterCardsPanel
                                  tabs={[{ key: activePublicationEditChannelKey, label: activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey) }]}
                                  activeChannel={activePublicationEditChannelKey}
                                  onActiveChannelChange={() => {}}
                                  channelTitle={activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey)}
                                  formatLabel={activePublicationEditChannelKey === "inrcy_site" || activePublicationEditChannelKey === "site_web" ? "Rendu site / iframe" : `Rendu final : ${activePublicationEditPreset.width}×${activePublicationEditPreset.height}`}
                                  aspectRatio={`${activePublicationEditPreset.width} / ${activePublicationEditPreset.height}`}
                                  items={activePublicationEditAssets.map((asset, index) => {
                                    const selectedAssets = activePublicationEditAssets.filter((candidate) => candidate.selected);
                                    const selectedIndex = selectedAssets.findIndex((candidate) => candidate.key === asset.key);
                                    const isSingleImageChannel = activePublicationEditChannelKey === "pinterest";
                                    const disabledBySingleImageLimit = isSingleImageChannel && selectedAssets.length >= 1 && !asset.selected;
                                    return {
                                      key: asset.key,
                                      previewUrl: asset.previewUrl,
                                      included: asset.selected,
                                      disabled: disabledBySingleImageLimit,
                                      title: `Image ${index + 1}`,
                                      subtitle: disabledBySingleImageLimit
                                        ? "Une seule image par épingle Pinterest"
                                        : asset.selected
                                          ? "Publiée sur ce canal"
                                          : "Non publiée sur ce canal",
                                      fitLabel:
                                        asset.originalUrl &&
                                        asset.savedTransform &&
                                        arePublicationTransformsEquivalent(asset.transform, asset.savedTransform)
                                          ? "Originale"
                                          : "Personnalisée",
                                      backgroundMode: getPublicationBackgroundMode(asset.transform),
                                      backgroundColor: asset.transform.backgroundColor,
                                      transform: asset.transform,
                                      preset: activePublicationEditPreset,
                                      onToggle: () => { markPublicationEditDirty(); togglePublicationImage(activePublicationEditChannelKey, asset.key); },
                                      onAdapt: () => openPublicationImageAdapter(activePublicationEditChannelKey, asset.key),
                                      onReset: resetPublicationImage ? () => { markPublicationEditDirty(); resetPublicationImage(activePublicationEditChannelKey, asset.key); } : undefined,
                                      onRemove: asset.selected ? () => { markPublicationEditDirty(); togglePublicationImage(activePublicationEditChannelKey, asset.key); } : undefined,
                                      removeLabel: "Retirer de ce canal",
                                      onMovePrevious: movePublicationImage && asset.selected && selectedIndex > 0 ? () => { markPublicationEditDirty(); movePublicationImage(activePublicationEditChannelKey, asset.key, -1); } : undefined,
                                      onMoveNext: movePublicationImage && asset.selected && selectedIndex >= 0 && selectedIndex < selectedAssets.length - 1 ? () => { markPublicationEditDirty(); movePublicationImage(activePublicationEditChannelKey, asset.key, 1); } : undefined,
                                    };
                                  })}
                                  buttonClassName={styles.btnGhost}
                                  pillButtonStyle={pillBtn}
                                  pillButtonActiveStyle={pillBtnActive}
                                  showTabs={false}
                                  emptyMessage="Aucune image pour ce canal."
                                />
                                </div>
                              </section>
                            ) : null}

                            <section className={styles.detailSectionCard}>
                              <div className={styles.detailSectionHeader}>
                                <div>
                                  <div className={styles.messageHeaderTitle}>Aperçu</div>
                                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginTop: 4 }}>
                                    Aperçu du canal sélectionné : {activePublicationEntry?.label || formatChannelLabel(activePublicationEntry?.key || activePublicationEditChannelKey)}.
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => setPublicationPreviewOpen((value) => !value)}
                                >
                                  {publicationPreviewOpen ? "Masquer l’aperçu" : "Afficher l’aperçu"}
                                </button>
                              </div>

                              {publicationPreviewOpen && publicationPreviewData ? (
                                <ChannelPublicationPreview preview={publicationPreviewData} />
                              ) : (
                                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
                                  {publicationPreviewData ? "L’aperçu est masqué par défaut." : "Aucun aperçu disponible pour ce canal."}
                                </div>
                              )}
                            </section>
                          </>
                        ) : null}

                        {detailsItem.source === "mail_campaigns" ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>Suivi destinataires</div>
                            </div>
                            {campaignReport ? (
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
                                {[
                                  { label: "Acceptés par le provider", value: campaignReport.counts.accepted },
                                  { label: "Livraisons confirmées", value: campaignReport.counts.delivered },
                                  { label: "Rebonds durs", value: campaignReport.counts.hardBounce },
                                  { label: "Rebonds temporaires", value: campaignReport.counts.softBounce },
                                ].map((stat) => (
                                  <div
                                    key={stat.label}
                                    style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.10)" }}
                                  >
                                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", marginBottom: 4 }}>{stat.label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                              {[
                                { key: "sent", label: "Acceptés par le provider", value: campaignHealth?.sent ?? campaignCounts((detailsItem as any).raw || {}).sent },
                                { key: "queued", label: "En attente", value: campaignHealth?.queued ?? campaignCounts((detailsItem as any).raw || {}).queued },
                                { key: "processing", label: "En cours", value: campaignHealth?.processing ?? campaignCounts((detailsItem as any).raw || {}).processing },
                                { key: "failed", label: "Échecs", value: campaignHealth?.failed ?? campaignCounts((detailsItem as any).raw || {}).failed },
                                { key: "blocked", label: "Bloqués", value: campaignHealth?.blocked ?? 0 },
                                { key: "opt_out", label: "Désinscrits", value: campaignHealth?.opt_out ?? 0 },
                                { key: "blacklist", label: "Blacklist", value: campaignHealth?.blacklist ?? 0 },
                              ].map((stat) => {
                                const isActive = campaignRecipientsFilter === stat.key;
                                return (
                                  <button
                                    key={stat.key}
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => {
                                      setCampaignRecipientsPage(1);
                                      setCampaignRecipientsFilter((prev) => (prev === stat.key ? "all" : (stat.key as CampaignRecipientsFilterId)));
                                    }}
                                    style={{
                                      textAlign: "left",
                                      padding: "12px 14px",
                                      borderRadius: 14,
                                      background: isActive ? "rgba(76,195,255,0.12)" : "rgba(255,255,255,0.03)",
                                      border: isActive ? "1px solid rgba(76,195,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                                    }}
                                  >
                                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", marginBottom: 4 }}>{stat.label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                              {([
                                { key: "all", label: "Tous", value: campaignHealth?.total ?? Number((detailsItem as any).raw?.total_count || 0) },
                                { key: "sent", label: "Envoyés", value: campaignHealth?.sent ?? campaignCounts((detailsItem as any).raw || {}).sent },
                                { key: "queued", label: "En attente", value: campaignHealth?.queued ?? campaignCounts((detailsItem as any).raw || {}).queued },
                                { key: "processing", label: "En cours", value: campaignHealth?.processing ?? campaignCounts((detailsItem as any).raw || {}).processing },
                                { key: "failed", label: "Échecs", value: campaignHealth?.failed ?? campaignCounts((detailsItem as any).raw || {}).failed },
                                { key: "blocked", label: "Bloqués", value: campaignHealth?.blocked ?? 0 },
                                { key: "opt_out", label: "Désinscrits", value: campaignHealth?.opt_out ?? 0 },
                                { key: "blacklist", label: "Blacklist", value: campaignHealth?.blacklist ?? 0 },
                              ] as Array<{ key: CampaignRecipientsFilterId | "all"; label: string; value: number }>).map((chip) => {
                                const active = campaignRecipientsFilter === chip.key;
                                return (
                                  <button
                                    key={chip.key}
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => {
                                      setCampaignRecipientsPage(1);
                                      setCampaignRecipientsFilter(chip.key as CampaignRecipientsFilterId);
                                    }}
                                    style={{
                                      ...(active ? pillBtnActive : {}),
                                      minHeight: 34,
                                      padding: "0 12px",
                                      borderRadius: 999,
                                      background: active ? "rgba(76,195,255,0.10)" : "rgba(255,255,255,0.03)",
                                    }}
                                  >
                                    {chip.label} • {chip.value}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12, marginBottom: 12 }}>
                              {campaignHealthLoading ? "Actualisation des statuts campagne…" : `Filtre actif : ${formatCampaignFilterLabel(campaignRecipientsFilter)}.`}
                              {campaignHealth && campaignHealth.retryable > 0 ? ` Relançables : ${campaignHealth.retryable}.` : ""}
                            </div>
                            {campaignRecipientsLoading ? (
                              <div style={{ color: "rgba(255,255,255,0.68)" }}>Chargement des destinataires…</div>
                            ) : campaignRecipients.length === 0 ? (
                              <div style={{ color: "rgba(255,255,255,0.68)" }}>Aucun destinataire chargé.</div>
                            ) : (
                              <>
                                <div className={styles.attachmentsList}>
                                {campaignRecipients.map((recipient) => {
                                  const attemptLabel = recipient.attempt_count != null && recipient.max_attempts != null
                                    ? `Tentative ${recipient.attempt_count}/${recipient.max_attempts}`
                                    : null;
                                  const statusLabel = getCampaignRecipientStatusLabel(recipient);
                                  return (
                                    <div key={recipient.id} className={styles.attachmentItem}>
                                      <span className={styles.attachmentName}>{recipient.display_name ? `${recipient.display_name} — ${recipient.email}` : recipient.email}</span>
                                      <span className={styles.attachmentMeta}>{statusLabel}</span>
                                      {attemptLabel ? <span className={styles.attachmentMeta}>{attemptLabel}</span> : null}
                                      {recipient.last_error || recipient.error ? (
                                        <span className={styles.attachmentMeta} style={{ color: "#ffb0b0" }}>{formatVisibleMailError(recipient.last_error || recipient.error, detailsMailProvider)}</span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                                <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12 }}>
                                  {campaignRecipientsTotal > 0
                                    ? `Affichage ${(campaignRecipientsPage - 1) * MAILBOX_RECIPIENTS_PAGE_SIZE + 1}–${Math.min(campaignRecipientsPage * MAILBOX_RECIPIENTS_PAGE_SIZE, campaignRecipientsTotal)} sur ${campaignRecipientsTotal} (${formatCampaignFilterLabel(campaignRecipientsFilter).toLowerCase()})`
                                    : `Aucun destinataire (${formatCampaignFilterLabel(campaignRecipientsFilter).toLowerCase()})`}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setCampaignRecipientsPage((prev) => Math.max(1, prev - 1))}
                                    disabled={campaignRecipientsPage <= 1 || campaignRecipientsLoading}
                                  >
                                    ← Précédent
                                  </button>
                                  <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                                    Page {campaignRecipientsPage} / {campaignRecipientsPageCount}
                                  </div>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setCampaignRecipientsPage((prev) => Math.min(campaignRecipientsPageCount, prev + 1))}
                                    disabled={campaignRecipientsPage >= campaignRecipientsPageCount || campaignRecipientsLoading}
                                  >
                                    Suivant →
                                  </button>
                                </div>
                                </div>
                              </>
                            )}
                          </section>
                        ) : null}

                        {(imageAttachments.length > 0 || fileAttachments.length > 0 || (videoAttachments.length > 0 && !(detailsItem.source === "app_events" && isVideoPublication))) && !(detailsItem.source === "app_events" && detailsEditMode) ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>
                                {detailsItem.source === "app_events" ? "Images de la publication" : "Documents envoyés"}
                              </div>
                            </div>

                            <div className={styles.attachmentsPanel}>
                              {imageAttachments.length ? (
                                <div className={styles.attachmentGallery}>
                                  {imageAttachments.map((a, idx) => (
                                    <a
                                      key={`${a.url || a.name}-${idx}`}
                                      className={styles.attachmentPreviewCard}
                                      href={a.url || undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <img src={a.url || ""} alt={a.name || `Pièce jointe ${idx + 1}`} className={styles.attachmentPreviewImage} />
                                      <div className={styles.attachmentPreviewCaption}>{a.name}</div>
                                      {a.url ? <span className={styles.attachmentDownloadHint}>Télécharger</span> : null}
                                    </a>
                                  ))}
                                </div>
                              ) : null}

                              {videoAttachments.length && !(detailsItem.source === "app_events" && isVideoPublication) ? (
                                <div className={styles.attachmentGallery}>
                                  {videoAttachments.map((a, idx) => (
                                    <div key={`${a.url || a.name}-${idx}`} className={styles.attachmentPreviewCard}>
                                      <video
                                        src={a.url || ""}
                                        className={styles.attachmentPreviewImage}
                                        controls
                                        preload="metadata"
                                      />
                                      <div className={styles.attachmentPreviewCaption}>{a.name}</div>
                                      {a.url ? (
                                        <a className={styles.attachmentDownloadHint} href={a.url} target="_blank" rel="noreferrer">
                                          Télécharger
                                        </a>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {fileAttachments.length ? (
                                <div className={styles.attachmentsList}>
                                  {fileAttachments.map((a, idx) => (
                                    <div key={`${a.url || a.name}-${idx}`} className={styles.attachmentItem}>
                                      <span className={styles.attachmentName}>{a.name}</span>
                                      {a.type ? <span className={styles.attachmentMeta}>{a.type}</span> : null}
                                      {typeof a.size === "number" ? <span className={styles.attachmentMeta}>{Math.round(a.size / 1024)} Ko</span> : null}
                                      {a.downloadUrl || a.url ? (
                                        <a className={styles.attachmentLink} href={a.downloadUrl || a.url || "#"} target="_blank" rel="noreferrer">
                                          Télécharger
                                        </a>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </section>
                        ) : null}
                      </div>

                      {isDraftItem ? (
                        <div style={{ marginTop: 14, color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                          Astuce : utilisez “Reprendre l’édition” pour rouvrir ce brouillon dans le bon outil.
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
  );
}
