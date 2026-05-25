import React from "react";
import { useRouter } from "next/navigation";
import { readSanitizedElementHtml, sanitizeHtml } from "@/lib/sanitizeHtml";
import { editableHtmlToSiteText, renderBoosterSiteContentHtml, renderBoosterSiteInlineHtml, stripSiteTextFormatting } from "@/lib/boosterFormatting";
import styles from "../mails.module.css";
import { ChannelImageAdapterCardsPanel, ChannelPublicationPreview } from "@/app/dashboard/_components/ChannelImageAdapterTool";
import InrcyCameraCaptureModal from "@/app/dashboard/_components/InrcyCameraCaptureModal";
import RichSiteContentEditor from "@/app/dashboard/booster/publier/components/RichSiteContentEditor";
import {
  buildAutoPrefillPatch,
  CHANNEL_TEXT_GUIDELINES,
  CTA_MODE_OPTIONS,
  getChannelDefaultCtaLabel,
  getCtaModeHelp,
  getWebsiteSourceLabelForChannel,
  getWebsiteUrlForChannel,
  isSiteDisplayKey,
  type BoosterCtaDefaults,
  type BoosterCtaMode,
  type ChannelPost,
  type DisplayKey,
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
  removePublicationImage: (channel: string, imageKey: string) => void;
  removePublicationImageEverywhere?: (channel: string, imageKey: string) => void;
  resetPublicationImage?: (channel: string, imageKey: string) => void;
  movePublicationImage?: (channel: string, imageKey: string, direction: -1 | 1) => void;
  addPublicationFiles: (fileList: FileList | null) => void;
  addPublicationPhoto: (file: File) => void;
  saveChannelPublication: () => Promise<void>;
  deleteChannelPublication: () => Promise<void>;
  retryCampaignFailedRecipients: (campaignId: string) => Promise<void>;
  openCampaignComposeFromHistory: (item: any, mode: "reuse" | "resend") => Promise<void>;
  deleteHistoryEntry: (item: any) => Promise<void>;
  loadCampaignRecipients: (campaignId: string, targetPage?: number, targetFilter?: CampaignRecipientsFilterId) => Promise<void>;
  loadCampaignHealth: (campaignId: string, raw?: any) => Promise<void>;
  resumeDraft: (item: any) => void;
};

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
    removePublicationImage,
    removePublicationImageEverywhere,
    resetPublicationImage,
    movePublicationImage,
    addPublicationFiles,
    addPublicationPhoto,
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

  const [publicationEditDirty, setPublicationEditDirty] = React.useState(false);
  const [publicationCtaDefaults, setPublicationCtaDefaults] = React.useState<BoosterCtaDefaults | null>(null);
  const publicationSiteContentEditorRef = React.useRef<HTMLDivElement | null>(null);

  const publicationDisplayKey = React.useMemo<DisplayKey>(() => {
    const key = String(activePublicationEditChannelKey || "");
    if (["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin"].includes(key)) {
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
          preferredCta: ["devis", "appeler", "message"].includes(String(json?.preferredCta || ""))
            ? String(json?.preferredCta || "devis") as BoosterCtaDefaults["preferredCta"]
            : "devis",
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

  const applyPublicationCtaModePrefill = React.useCallback((mode: BoosterCtaMode) => {
    const current = {
      title: publicationEditForm.title,
      content: publicationEditForm.content,
      cta: publicationEditForm.cta,
      ctaMode: publicationEditForm.ctaMode || "none",
      ctaUrl: publicationEditForm.ctaUrl || "",
      ctaPhone: publicationEditForm.ctaPhone || "",
      hashtags: [],
    } as ChannelPost;
    const patch = buildAutoPrefillPatch(publicationDisplayKey, mode, current, publicationCtaDefaults);
    updatePublicationEdit({
      ctaMode: String(patch.ctaMode || mode),
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

              <div className={styles.modalBody}>
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
                  const fileAttachments = dedupedAttachments.filter((att) => !imageAttachments.includes(att) && !videoAttachments.includes(att));
                  const hasAttachments = imageAttachments.length > 0 || videoAttachments.length > 0 || fileAttachments.length > 0;
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
                  const publicationEditPreview = (() => {
                    if (detailsItem.source !== "app_events" || !activePublicationEntry || !detailsEditMode) return null;
                    const selectedAssets = activePublicationEditAssets.filter((asset) => asset.selected);
                    const firstAsset = selectedAssets[0] || null;
                    const hashtags = publicationEditForm.hashtags
                      .split(/[;,\n\s]+/)
                      .map((tag) => tag.trim().replace(/^#+/, ""))
                      .filter(Boolean);
                    return {
                      channelKey: activePublicationEditChannelKey,
                      channelLabel: activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey),
                      title: publicationEditForm.title,
                      content: publicationEditForm.content,
                      cta: getPublicationPreviewCta(publicationDisplayKey, publicationEditForm),
                      hashtags,
                      imageCount: selectedAssets.length,
                      formatLabel: activePublicationEditChannelKey === "inrcy_site" || activePublicationEditChannelKey === "site_web" ? "Rendu site / iframe" : `Image finale : ${activePublicationEditPreset.width}×${activePublicationEditPreset.height}`,
                      image: firstAsset
                        ? {
                            previewUrl: firstAsset.previewUrl,
                            transform: firstAsset.transform,
                            preset: activePublicationEditPreset,
                          }
                        : null,
                      images: selectedAssets.map((asset) => ({
                        previewUrl: asset.previewUrl,
                        transform: asset.transform,
                        preset: activePublicationEditPreset,
                      })),
                    };
                  })();

                  return (
                    <>
                      <div className={styles.detailsStack}>
                        <section className={styles.detailSectionCard}>
                          <div className={styles.detailSectionHeader}>
                            <div>
                              <div className={styles.detailsTitle}>{detailsItem.title || "(sans objet)"}</div>
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
                                  {isDraftItem ? (
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
                                  {!isDraftItem ? (
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
                              const showInstagramHashtags = activePublicationEntry.key === "instagram";
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
                                              : ctaMode === "website"
                                                ? "minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1fr)"
                                                : ctaMode === "call" || ctaMode === "custom"
                                                  ? "minmax(0, 0.9fr) minmax(0, 1.1fr)"
                                                  : "minmax(0, 0.9fr)";
                                            return (
                                              <>
                                                <div style={{ display: "grid", gridTemplateColumns: ctaGridColumns, gap: 10, alignItems: "start" }}>
                                                  <div>
                                                    <div className={styles.publicationLabel}>CTA</div>
                                                    <select
                                                      value={ctaMode}
                                                      onChange={(e) => applyPublicationCtaModePrefill(e.target.value as BoosterCtaMode)}
                                                      style={darkSelectStyle}
                                                      disabled={detailsActionBusy}
                                                    >
                                                      {CTA_MODE_OPTIONS[publicationDisplayKey].map((option) => (
                                                        <option key={option.value} value={option.value} style={darkOptionStyle}>
                                                          {option.label}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>

                                                  {ctaMode === "website" ? (
                                                    <>
                                                      <div>
                                                        <div className={styles.publicationLabel}>Lien du CTA</div>
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
                                                        <div className={styles.publicationLabel}>Libellé du lien</div>
                                                        <input
                                                          value={publicationEditForm.cta}
                                                          onChange={(e) => updatePublicationEdit({ cta: e.target.value })}
                                                          style={lightFieldStyle}
                                                          placeholder={`Libellé du lien (ex : ${getChannelDefaultCtaLabel(publicationDisplayKey, "website") || "Demander un devis"})`}
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
                                                    <div>
                                                      <div className={styles.publicationLabel}>Libellé du CTA</div>
                                                      <input
                                                        value={publicationEditForm.cta}
                                                        onChange={(e) => updatePublicationEdit({ cta: e.target.value })}
                                                        style={lightFieldStyle}
                                                        placeholder={publicationDisplayKey === "gmb" ? "Ex : En savoir plus" : "Ex : Contactez-nous"}
                                                        disabled={detailsActionBusy}
                                                      />
                                                    </div>
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
                                                    CTA : {publicationEditForm.cta.length} / {CHANNEL_TEXT_GUIDELINES[publicationDisplayKey].cta}
                                                  </div>
                                                ) : null}
                                              </>
                                            );
                                          })()}
                                        </div>
                                        {activePublicationEntry.key === "instagram" ? (
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
                                        {activePublicationEntry.key === "instagram" && parts.hashtags && parts.hashtags.length ? (
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

                        {detailsItem.source === "app_events" && detailsEditMode && activePublicationEntry && !activePublicationDeleted ? (
                          <>
                            <InrcyCameraCaptureModal
                              open={publicationCameraOpen}
                              title="Prendre une photo"
                                                    onClose={() => setPublicationCameraOpen(false)}
                              onCapture={async (file) => { markPublicationEditDirty(); addPublicationPhoto(file); }}
                            />

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
                                  {isMobileViewport ? (
                                    <button
                                      type="button"
                                      className={styles.btnAttach}
                                      onClick={() => setPublicationCameraOpen(true)}
                                      disabled={activePublicationEditAssets.length >= 5}
                                      style={{
                                        opacity: activePublicationEditAssets.length >= 5 ? 0.55 : 1,
                                        cursor: activePublicationEditAssets.length >= 5 ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      📷 Photo
                                    </button>
                                  ) : null}
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
                                      onRemoveEverywhere: removePublicationImageEverywhere ? () => { markPublicationEditDirty(); removePublicationImageEverywhere(activePublicationEditChannelKey, asset.key); } : () => { markPublicationEditDirty(); removePublicationImage(activePublicationEditChannelKey, asset.key); },
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

                            <section className={styles.detailSectionCard}>
                              <div className={styles.detailSectionHeader}>
                                <div>
                                  <div className={styles.messageHeaderTitle}>Aperçu</div>
                                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginTop: 4 }}>
                                    Aperçu du canal sélectionné : {activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey)}.
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

                              {publicationPreviewOpen && publicationEditPreview ? (
                                <ChannelPublicationPreview preview={publicationEditPreview} />
                              ) : (
                                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
                                  L’aperçu est masqué par défaut.
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

                        {hasAttachments && !(detailsItem.source === "app_events" && detailsEditMode) ? (
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

                              {videoAttachments.length ? (
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
