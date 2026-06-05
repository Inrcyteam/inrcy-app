import React from "react";
import { useRouter } from "next/navigation";
import { readSanitizedElementHtml, sanitizeHtml } from "@/lib/sanitizeHtml";
import { editableHtmlToSiteText, renderBoosterSiteContentHtml, renderBoosterSiteInlineHtml, stripSiteTextFormatting } from "@/lib/boosterFormatting";
import styles from "../mails.module.css";
import { ChannelImageAdapterCardsPanel, ChannelPublicationPreview } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import InrcyCameraCaptureModal from "@/app/dashboard/_components/InrcyCameraCaptureModal";
import RichSiteContentEditor from "@/app/dashboard/booster/publier/components/RichSiteContentEditor";
import BoosterVideoFormatManager, { type BoosterVideoPreparationState } from "@/app/dashboard/booster/publier/components/BoosterVideoFormatManager";
import {
  buildPreferredCtaPatch,
  BOOSTER_PREFERRED_CTA_OPTIONS,
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
import {
  MAILBOX_RECIPIENTS_PAGE_SIZE,
  type CampaignRecipientsFilterId,
  type PublicationEditForm,
  campaignCounts,
  canDeleteHistoryItem,
  extractAttachmentsFromPayload,
  extractChannelPublications,
  extractPublicationParts,
  firstNonEmpty,
  folderLabel,
  formatCampaignFilterLabel,
  formatCampaignProgress,
  formatChannelLabel,
  formatOutboxStatusLabel,
  getCampaignRecipientStatusLabel,
  getChannelIndicatorMeta,
  getFailedChannelMessage,
  getPublicationBackgroundMode,
  isDeletedChannelResult,
  isFailedChannelResult,
  isImageAttachment,
  isRetryableCampaignItem,
  isVideoAttachment,
  orderChannelKeys,
  pill,
  splitList,
} from "../_lib/mailboxPhase1";
import { pillBtn, pillBtnActive } from "./mailboxInlineStyles";


type PublicationEditVideoState = {
  file: File | null;
  previewUrl: string;
  name: string;
  type: string;
  size: number;
  duration: number | null;
  sourceMetadata: any | null;
  sourceVideo: any | null;
  transformedVariants: any[];
  format: VideoFormat;
  adaptationMode: VideoAdaptationMode;
  preparation?: BoosterVideoPreparationState | null;
  preparing?: boolean;
  removed?: boolean;
};

type MailboxDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  detailsItem: any | null;
  detailsAccountLabel: string | null;
  detailsChannelKey: string | null;
  setDetailsChannelKey: React.Dispatch<React.SetStateAction<string | null>>;
  detailsEditMode: boolean;
  setDetailsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  detailsActionBusy: boolean;
  detailsActionError: string | null;
  detailsActionSuccess: string | null;
  setDetailsActionError: React.Dispatch<React.SetStateAction<string | null>>;
  setDetailsActionSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  detailsSourceDocPayload: any | null;
  deletingHistoryItemId: string | null;
  deletingHistorySelection: boolean;
  campaignRecipients: any[];
  campaignRecipientsLoading: boolean;
  campaignRecipientsPage: number;
  setCampaignRecipientsPage: React.Dispatch<React.SetStateAction<number>>;
  campaignRecipientsPageCount: number;
  campaignRecipientsTotal: number;
  campaignRecipientsFilter: CampaignRecipientsFilterId;
  setCampaignRecipientsFilter: React.Dispatch<React.SetStateAction<CampaignRecipientsFilterId>>;
  campaignHealth: any | null;
  campaignHealthLoading: boolean;
  campaignActionBusyId: string | null;
  publicationEditForm: PublicationEditForm;
  setPublicationEditForm: React.Dispatch<React.SetStateAction<PublicationEditForm>>;
  publicationEditFileInputId: string;
  activePublicationEditChannelKey: string;
  activePublicationEditPreset: any;
  activePublicationEditAssets: any[];
  togglePublicationImage: (channel: string, imageKey: string) => void;
  openPublicationImageAdapter: (channel: string, imageKey: string) => void;
  resetPublicationImage?: (channel: string, imageKey: string) => void;
  movePublicationImage?: (channel: string, imageKey: string, direction: -1 | 1) => void;
  addPublicationFiles: (fileList: FileList | null) => void;
  addPublicationPhoto: (file: File) => void;
  publicationVideoInputId: string;
  activePublicationEditVideo: PublicationEditVideoState | null;
  addPublicationVideo: (fileList: FileList | null) => void;
  removePublicationVideo: (channel?: string) => void;
  setPublicationVideoFormatForChannel: (channel: string, format: VideoFormat) => void;
  setPublicationVideoAdaptationModeForChannel: (channel: string, mode: VideoAdaptationMode) => void;
  applyPublicationVideoFormatForChannel: (channel: string) => Promise<void>;
  saveChannelPublication: () => Promise<void>;
  deleteChannelPublication: () => Promise<void>;
  retryCampaignFailedRecipients: (campaignId: string) => Promise<void>;
  openCampaignComposeFromHistory: (item: any, mode: "reuse" | "resend") => Promise<void>;
  deleteHistoryEntry: (item: any) => Promise<void>;
  loadCampaignRecipients: (campaignId: string, targetPage?: number, targetFilter?: CampaignRecipientsFilterId) => Promise<void>;
  loadCampaignHealth: (campaignId: string, raw?: any) => Promise<void>;
  resumeDraft: (item: any) => void;
};

function formatVideoBytes(value: unknown) {
  const bytes = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${Math.round(bytes)} o`;
}

function formatVideoDuration(value: unknown) {
  const seconds = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function getVideoAttachmentUrl(att: any) {
  return String(att?.url || att?.publicUrl || att?.renderedUrl || att?.downloadUrl || "").trim();
}

function sameVideoAttachment(a: any, b: any) {
  const au = getVideoAttachmentUrl(a);
  const bu = getVideoAttachmentUrl(b);
  if (au && bu) return au === bu;
  const ap = String(a?.storagePath || "").trim();
  const bp = String(b?.storagePath || "").trim();
  return Boolean(ap && bp && ap === bp);
}

function getVideoFileLabel(att: any) {
  const pieces = [
    att?.name ? String(att.name) : null,
    formatVideoBytes(att?.size),
    formatVideoDuration(att?.duration),
  ].filter(Boolean);
  return pieces.join(" · ") || "Vidéo iNrCy";
}

function firstStringDeep(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getNestedString(record: any, path: string[]) {
  let current = record;
  for (const key of path) {
    if (!current || typeof current !== "object") return "";
    current = current[key];
  }
  return typeof current === "string" ? current.trim() : "";
}

function getTiktokPublicationUrl(result: any) {
  const direct = firstStringDeep(
    result?.external_url,
    result?.share_url,
    result?.post_url,
    result?.video_url,
    result?.profile_url,
    getNestedString(result, ["diagnostics", "share_url"]),
    getNestedString(result, ["diagnostics", "status", "shareUrl"]),
    getNestedString(result, ["diagnostics", "status", "raw", "data", "share_url"]),
    getNestedString(result, ["diagnostics", "raw", "data", "share_url"]),
  );
  if (direct) return direct;

  const username = firstStringDeep(result?.username, getNestedString(result, ["diagnostics", "creatorInfo", "creator_username"]));
  const cleanUsername = username.replace(/^@+/, "").trim();
  return cleanUsername ? `https://www.tiktok.com/@${cleanUsername}` : "https://www.tiktok.com";
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
    deletingHistoryItemId,
    deletingHistorySelection,
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
    openCampaignComposeFromHistory,
    deleteHistoryEntry,
    loadCampaignRecipients,
    loadCampaignHealth,
    resumeDraft,
  } = props;
  const router = useRouter();
  const [publicationPreviewOpen, setPublicationPreviewOpen] = React.useState(false);
  const [publicationCameraOpen, setPublicationCameraOpen] = React.useState(false);
  const [isMobileViewport, setIsMobileViewport] = React.useState(false);
  const detailsBodyRef = React.useRef<HTMLDivElement | null>(null);
  const detailsScrollSnapshotRef = React.useRef<number | null>(null);

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
    preserveDetailsModalScroll();
    setPublicationCameraOpen(true);
  }, [preserveDetailsModalScroll]);

  const closePublicationCamera = React.useCallback(() => {
    setPublicationCameraOpen(false);
    restoreDetailsModalScroll();
  }, [restoreDetailsModalScroll]);

  const [publicationEditDirty, setPublicationEditDirty] = React.useState(false);
  const [publicationCtaDefaults, setPublicationCtaDefaults] = React.useState<BoosterCtaDefaults | null>(null);
  const publicationSiteContentEditorRef = React.useRef<HTMLDivElement | null>(null);

  const publicationDisplayKey = React.useMemo<DisplayKey>(() => {
    const key = String(activePublicationEditChannelKey || "");
    if (["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok"].includes(key)) {
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

    editor.focus();
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
    const patch = buildPreferredCtaPatch(publicationDisplayKey, choice, current, publicationCtaDefaults);
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

  const requestChannelChange = React.useCallback(async (channelKey: string) => {
    if (!channelKey || channelKey === activePublicationEditChannelKey) return;
    const ok = await confirmDiscardPublicationEdit();
    if (!ok) return;
    setDetailsEditMode(false);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    setDetailsChannelKey(channelKey);
  }, [activePublicationEditChannelKey, confirmDiscardPublicationEdit, setDetailsActionError, setDetailsActionSuccess, setDetailsChannelKey, setDetailsEditMode]);

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
                      {detailsItem.source !== "app_events" && detailsAccountLabel ? (
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>• {detailsAccountLabel}</span>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Trash removed intentionally */}
                  <button className={styles.btnGhost} onClick={() => void requestClose()} type="button">
                    ✕
                  </button>
                </div>
              </div>

              <div ref={detailsBodyRef} className={styles.modalBody} data-inrsend-details-body="true">
                {!detailsItem ? (
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>Sélectionne un élément.</div>
                ) : (() => {
                  const payload = detailsItem.source === "app_events" ? ((detailsItem as any)?.raw?.payload || null) : null;
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
                  const activePublicationResult = detailsItem.source === "app_events" && activePublicationEntry
                    ? ((payload?.results && typeof payload.results === "object" ? (payload.results as any)[activePublicationEntry.key] : null) || null)
                    : null;
                  const activePublicationDeleted = isDeletedChannelResult(activePublicationResult);
                  const activePublicationFailed = isFailedChannelResult(activePublicationResult);
                  const activePublicationFailureMessage = getFailedChannelMessage(activePublicationResult);
                  const isTiktokPublicationEntry = activePublicationEntry?.key === "tiktok";
                  const tiktokPublicationHref = isTiktokPublicationEntry ? getTiktokPublicationUrl(activePublicationResult) : "";
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
                          url: String(image?.publicUrl || image?.url || image?.dataUrl || "").trim(),
                          name: String(image?.name || "Image brouillon"),
                          type: String(image?.type || "image/jpeg"),
                          size: Number(image?.size || 0) || undefined,
                        }))
                        .filter((att: any) => att.url)
                    : [];
                  const attachmentCandidates = detailsItem.source === "send_items"
                    ? [...(detailsItem.attachments || []), ...extractAttachmentsFromPayload((detailsItem as any).raw), ...sourceDocAttachments]
                    : detailsItem.source === "mail_campaigns"
                    ? campaignAttachments
                    : detailsItem.source === "app_events"
                    ? [...(activeParts.attachments || []), ...publicationDraftAttachments]
                    : [];
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
                            aspectRatio: activeVideoSettings ? getVideoPreviewAspectRatio(activeVideoSettings.format as any) : null,
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
                                {canDeleteHistoryItem(detailsItem) ? (
                                  <button
                                    type="button"
                                    className={isDraftItem ? styles.btnDangerSmall : styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : isDraftItem ? "Supprimer le brouillon" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : detailsItem.source === "mail_campaigns" ? (
                            <>
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
                                  <div className={styles.metaVal}>{formatCampaignProgress((detailsItem as any).raw || {})}</div>
                                </div>
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
                                    {campaignActionBusyId === detailsItem.id ? "Relance…" : "Relancer les échecs"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => {
                                    void Promise.all([
                                      loadCampaignRecipients(detailsItem.id, campaignRecipientsPage, campaignRecipientsFilter),
                                      loadCampaignHealth(detailsItem.id, (detailsItem as any).raw || {}),
                                    ]);
                                  }}
                                  disabled={campaignRecipientsLoading || campaignHealthLoading || campaignActionBusyId === detailsItem.id}
                                >
                                  {campaignRecipientsLoading || campaignHealthLoading ? "Actualisation…" : "Rafraîchir le suivi"}
                                </button>
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
                                {canDeleteHistoryItem(detailsItem) ? (
                                  <button
                                    type="button"
                                    className={isDraftItem ? styles.btnDangerSmall : styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : isDraftItem ? "Supprimer le brouillon" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
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
                                    const entryIndicator = getChannelIndicatorMeta(entryResult);
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
                                  {isTiktokPublicationEntry && !isDraftItem ? (
                                    <button
                                      type="button"
                                      className={styles.btnPrimary}
                                      onClick={() => {
                                        if (typeof window !== "undefined") window.open(tiktokPublicationHref || "https://www.tiktok.com", "_blank", "noopener,noreferrer");
                                      }}
                                      disabled={detailsActionBusy}
                                      title="Ouvrir TikTok pour gérer la publication"
                                    >
                                      Ouvrir TikTok
                                    </button>
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
                                    >
                                      Modifier
                                    </button>
                                  )}
                                  {!isDraftItem && !isTiktokPublicationEntry ? (
                                    <button
                                      type="button"
                                      className={styles.btnDangerSmall}
                                      onClick={deleteChannelPublication}
                                      disabled={detailsActionBusy}
                                    >
                                      {detailsActionBusy && !detailsEditMode ? "Suppression…" : "Supprimer"}
                                    </button>
                                  ) : null}
                                  {canDeleteHistoryItem(detailsItem) ? (
                                    <button
                                      type="button"
                                      className={isDraftItem ? styles.btnDangerSmall : styles.btnGhost}
                                      onClick={() => void deleteHistoryEntry(detailsItem)}
                                      disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id || detailsActionBusy}
                                    >
                                      {deletingHistoryItemId === detailsItem.id ? "Suppression…" : isDraftItem ? "Supprimer le brouillon" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                    </button>
                                  ) : null}
                                </div>
                              ) : isDraftItem || canDeleteHistoryItem(detailsItem) ? (
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
                                  {canDeleteHistoryItem(detailsItem) ? (
                                    <button
                                      type="button"
                                      className={isDraftItem ? styles.btnDangerSmall : styles.btnGhost}
                                      onClick={() => void deleteHistoryEntry(detailsItem)}
                                      disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                    >
                                      {deletingHistoryItemId === detailsItem.id ? "Suppression…" : isDraftItem ? "Supprimer le brouillon" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          )}

                          {detailsActionError ? (
                            <div className={styles.detailsError}>
                              <b>Action :</b> {detailsActionError}
                            </div>
                          ) : null}

                          {isTiktokPublicationEntry && !isDraftItem && !detailsEditMode ? (
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
                              <b>TikTok :</b> iNrSend garde l’historique et l’ouverture du post. La modification ou suppression réelle se fait dans TikTok ; supprimer l’historique ne supprime pas le post TikTok.
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

                          {detailsItem.error ? (
                            <div className={styles.detailsError}>
                              <b>Détail :</b> {detailsItem.error}
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
                                  markPublicationEditDirty();
                                  addPublicationPhoto(file);
                                  restoreDetailsModalScroll();
                                }}
                              />
                            ) : null}

                            {isVideoPublication ? (
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
                                        : `${activePublicationEntry.label || formatChannelLabel(activePublicationEntry.key)} utilise sa propre variante vidéo préparée par iNrCy.`}
                                    </div>
                                  </div>
                                </div>

                                <input
                                  id={publicationVideoInputId}
                                  type="file"
                                  accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.m4v,.mov,.webm"
                                  className={styles.hiddenFileInput}
                                  onChange={(e) => {
                                    const input = e.currentTarget;
                                    const files = input?.files ?? null;
                                    if (files?.length) markPublicationEditDirty();
                                    addPublicationVideo(files);
                                    if (input) input.value = "";
                                  }}
                                />

                                <div style={{ display: "grid", gap: 12 }}>
                                  {detailsEditMode ? (
                                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                      <button
                                        type="button"
                                        className={styles.btnAttach}
                                        onClick={() => document.getElementById(publicationVideoInputId)?.click()}
                                      >
                                        🎥 Ajouter / remplacer la vidéo
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
                                    adaptationMode={(detailsEditMode ? (activePublicationEditVideo?.adaptationMode || activeVideoSettings?.adaptationMode || "safe_blur") : (activeVideoSettings?.adaptationMode || "safe_blur")) as VideoAdaptationMode}
                                    videoTransformedVariants={[]}
                                    preparationState={detailsEditMode ? (activePublicationEditVideo?.preparation || null) : null}
                                    preparing={detailsEditMode ? Boolean(activePublicationEditVideo?.preparing) : false}
                                    onFormatChange={detailsEditMode ? (format) => { markPublicationEditDirty(); setPublicationVideoFormatForChannel(activePublicationEntry.key, format); } : undefined}
                                    onAdaptationModeChange={detailsEditMode ? (mode) => { markPublicationEditDirty(); setPublicationVideoAdaptationModeForChannel(activePublicationEntry.key, mode); } : undefined}
                                    onApplyFormat={detailsEditMode ? async () => { markPublicationEditDirty(); await applyPublicationVideoFormatForChannel(activePublicationEntry.key); } : undefined}
                                    onDeleteVideo={detailsEditMode ? () => { markPublicationEditDirty(); removePublicationVideo(activePublicationEntry.key); } : undefined}
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
                                      : "Ce détail affiche la vidéo réellement utilisée pour ce canal au moment de la publication."}
                                  </div>
                                </div>
                              </section>
                            ) : detailsEditMode ? (
                              <section className={styles.detailSectionCard}>
                                <div className={styles.detailSectionHeader}>
                                  <div className={styles.messageHeaderTitle}>Images de la publication</div>
                                </div>
                                <div style={{ display: "grid", gap: 12 }}>
                                <input
                                  id={publicationEditFileInputId}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className={styles.hiddenFileInput}
                                  onChange={(e) => {
                                    const input = e.currentTarget;
                                    const files = input?.files ?? null;
                                    if (files?.length) markPublicationEditDirty();
                                    addPublicationFiles(files);
                                    if (input) input.value = "";
                                  }}
                                />
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                  <label htmlFor={publicationEditFileInputId} className={styles.btnAttach}>📎 Ajouter des images</label>
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
                                      disabled={isMobileViewport && activePublicationEditAssets.length >= 5}
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
                                    const disabledByGoogleBusinessLimit = activePublicationEditChannelKey === "gmb" && selectedAssets.length >= 1 && !asset.selected;
                                    return {
                                      key: asset.key,
                                      previewUrl: asset.previewUrl,
                                      included: asset.selected,
                                      disabled: disabledByGoogleBusinessLimit,
                                      title: `Image ${index + 1}`,
                                      subtitle: disabledByGoogleBusinessLimit
                                        ? "Une seule photo par publication Google Business"
                                        : asset.selected
                                          ? "Publiée sur ce canal"
                                          : "Non publiée sur ce canal",
                                      fitLabel: asset.transform.fit === "cover" ? "Remplir" : "Adapter",
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
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                              {[
                                { key: "sent", label: "Envoyés au provider", value: campaignHealth?.sent ?? campaignCounts((detailsItem as any).raw || {}).sent },
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
                                        <span className={styles.attachmentMeta} style={{ color: "#ffb0b0" }}>{recipient.last_error || recipient.error}</span>
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
