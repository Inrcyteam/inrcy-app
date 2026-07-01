"use client";

import { readWorkflowMailPrefillAttachments } from "@/app/dashboard/_lib/workflowMailPrefillAttachments";
import { saveWorkflowCampaignState } from "@/app/dashboard/_lib/workflowCampaignState";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./mails.module.css";
import { createClient } from "@/lib/supabaseClient";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { requestBoosterVideoTransforms } from "@/lib/boosterVideoTransformClient";
import { buildVideoTransformSignature } from "@/lib/boosterVideoTransforms";
import { confirmInrcy } from "@/lib/inrcyDialog";
import {
  PROFILE_VERSION_EVENT,
  type ProfileVersionChangeDetail,
} from "@/lib/profileVersioning";
import MailboxHeader from "./_components/MailboxHeader";
import PublishAiConfigurationDrawer from "../booster/publier/components/PublishAiConfigurationDrawer";
import MobileFoldersMenu from "./_components/MobileFoldersMenu";
import FolderTabs from "./_components/FolderTabs";
import MailboxToolbar from "./_components/MailboxToolbar";
import MailboxList from "./_components/MailboxList";
import MailboxSearchPanel from "./_components/MailboxSearchPanel";
import MailboxDetailsModal from "./_components/MailboxDetailsModal";
import type { MediaLibraryPickerItem } from "@/app/dashboard/_components/MediaLibraryPickerModal";
import MailboxPublicationImageAdapterModal from "./_components/MailboxPublicationImageAdapterModal";
import MailboxComposeModal from "./_components/MailboxComposeModal";
import {
  ALL_FOLDERS,
  BULK_CONFIRM_STRONG_THRESHOLD,
  BULK_CONFIRM_WARNING_THRESHOLD,
  MAILBOX_PAGE_SIZE,
  MAILBOX_RECIPIENTS_PAGE_SIZE,
  MAIL_ACCOUNTS_UPDATED_EVENT,
  applyCampaignRecipientsFilter,
  arePublicationTransformsEquivalent,
  buildDefaultMailText,
  bulkConfirmationMessage,
  campaignCounts,
  campaignTitleFromFolder,
  canBulkDeleteHistoryItem,
  canDeleteHistoryItem,
  channelApiPath,
  computePublicationPreviewLayout,
  defaultFolderFromSendType,
  emptyFolderCounts,
  extractAttachmentsFromPayload,
  extractChannelPublications,
  extractChannelsFromPayload,
  extractMessageFromPayload,
  extractPublicationParts,
  extractPublicationResults,
  folderFromTrack,
  folderLabel,
  folderTheme,
  formatCampaignFilterLabel,
  formatCampaignProgress,
  formatChannelLabel,
  formatOutboxStatusLabel,
  getPublicationChannelPreset,
  getCampaignRecipientStatusLabel,
  getChannelIndicatorMeta,
  getFailedChannelMessage,
  getPublicationBackgroundMode,
  buildPublicationDefaultTransform,
  getPublicationChannelStatuses,
  hasAttachmentFields,
  firstNonEmpty,
  historyEmptyState,
  historySelectionKey,
  isBusinessMailFolder,
  isDeletedChannelResult,
  isFailedChannelResult,
  isFolderValue,
  isImageAttachment,
  isPublicationTransformModified,
  isRetryableCampaignItem,
  isVideoAttachment,
  isVisibleInFolder,
  listGridTemplateColumns,
  makePublicationImageAssetKey,
  normalizeChannelKey,
  normalizeFolderCounts,
  offsetFromPublicationDrawPosition,
  orderChannelKeys,
  pill,
  publicationClamp,
  renderPublicationChannelsWithFailures,
  renderPublicationImageAsset,
  resolveCampaignFolder,
  safeDecode,
  safeS,
  splitList,
  stripText,
  tagsToEditorString,
  toolbarActionTheme,
  withPublicationBackgroundMode,
  type BoxView,
  type CampaignHealthSummary,
  type CampaignRecipientLog,
  type CampaignRecipientsFilterId,
  type ChannelPublication,
  type ComposeAttachmentRef,
  type ComposeCrmRecipientHint,
  type EditablePublicationAttachment,
  type Folder,
  type FolderCounts,
  type MailAccount,
  type OutboxItem,
  type PublicationChannelImagesState,
  type PublicationImageAsset,
  type PublicationImageBackgroundMode,
  type PublicationImageFitMode,
  type PublicationImageTransform,
  type PublicationEditForm,
  type PublicationParts,
  type SendItem,
  type SendType,
  type Status,
} from "./_lib/mailboxPhase1";

import {
  MAILBOX_FILE_INPUT_ID,
  PUBLICATION_EDIT_FILE_INPUT_ID,
  itemMailAccountId,
  makeAttachmentPath,
  normalizeComposeRecipientHints,
  normalizeEmails,
  providerSendEndpoint,
} from "./_lib/mailboxPhase25";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";
import {
  normalizeRichMailHtmlForSend,
  textToRichMailHtml,
} from "@/lib/mailRichText";
import {
  BOOSTER_MAX_IMAGE_BYTES,
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_MAX_IMAGE_MB_LABEL,
  BOOSTER_MAX_MEDIA_BYTES,
  BOOSTER_MAX_MEDIA_MB_LABEL,
  BOOSTER_MAX_VIDEO_BYTES,
  BOOSTER_MAX_VIDEO_MB_LABEL,
  uploadBoosterVideo,
  VIDEO_ADAPTATION_MODE_LABELS,
  getRecommendedVideoFormatForSource,
  getVideoFormatLabel,
  isUnsupportedBrowserImageFile,
  unsupportedBrowserImageMessage,
  type BoosterVideoSourceMetadata,
  type ChannelKey as BoosterChannelKey,
  type VideoAdaptationMode,
  type VideoFormat,
  type VideoPayload,
} from "../booster/publier/publishModal.shared";

type PublicationEditVideoState = {
  file: File | null;
  previewUrl: string;
  name: string;
  type: string;
  size: number;
  duration: number | null;
  sourceMetadata: BoosterVideoSourceMetadata | null;
  sourceVideo: VideoPayload | null;
  transformedVariants: NonNullable<VideoPayload["transformedVariants"]>;
  format: VideoFormat;
  adaptationMode: VideoAdaptationMode;
  preparation?: {
    status: "idle" | "preparing" | "ready" | "error";
    label: string;
    detail?: string;
  } | null;
  preparing?: boolean;
  removed?: boolean;
};

type CampaignDistributionNotice = {
  queuedCount: number;
  batchSize: number;
  deferredReason: string;
  extras: string[];
};

function normalizeBoosterChannelKeyForVideo(value: string): BoosterChannelKey {
  const channel = normalizeChannelKey(value);
  return (channel || "inrcy_site") as BoosterChannelKey;
}

function attachmentToVideoPayload(att: any): VideoPayload | null {
  const url = String(att?.publicUrl || att?.url || att?.videoUrl || "").trim();
  if (!url) return null;
  return {
    name: String(att?.name || "video-inrcy.mp4"),
    type: String(att?.type || "video/mp4"),
    size: Number(att?.size || 0),
    lastModified: Date.now(),
    duration: Number.isFinite(Number(att?.duration))
      ? Number(att.duration)
      : null,
    sourceMetadata: (att?.sourceMetadata ||
      att?.source_metadata ||
      null) as BoosterVideoSourceMetadata | null,
    storagePath: String(att?.storagePath || att?.storage_path || ""),
    publicUrl: url,
    url,
    transformedVariants: Array.isArray(att?.transformedVariants)
      ? att.transformedVariants
      : [],
    ...(att?.sourceVideo || att?.source_video
      ? { sourceVideo: att.sourceVideo || att.source_video }
      : {}),
  } as VideoPayload & { sourceVideo?: unknown };
}

function readPublicationVideoMetadata(
  file: File,
  previewUrl: string,
): Promise<BoosterVideoSourceMetadata> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({
        width: null,
        height: null,
        duration: null,
        size: file.size || 0,
        type: file.type || "video/mp4",
        ratio: null,
        ratioLabel: "Ratio inconnu",
        orientation: "unknown",
        orientationLabel: "Orientation inconnue",
      });
      return;
    }

    const video = document.createElement("video");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const width = Number(video.videoWidth || 0) || null;
      const height = Number(video.videoHeight || 0) || null;
      const rawDuration = Number(video.duration || 0);
      const duration =
        Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
      const ratio = width && height ? width / height : null;
      const ratioLabel =
        width && height ? `${width}:${height}` : "Ratio inconnu";
      const orientation =
        width && height
          ? width > height
            ? "horizontal"
            : width < height
              ? "vertical"
              : "square"
          : "unknown";
      const orientationLabel =
        orientation === "horizontal"
          ? "Horizontale"
          : orientation === "vertical"
            ? "Verticale"
            : orientation === "square"
              ? "Carrée"
              : "Orientation inconnue";
      video.removeAttribute("src");
      video.load();
      resolve({
        width,
        height,
        duration,
        size: file.size || 0,
        type: file.type || "video/mp4",
        ratio,
        ratioLabel,
        orientation,
        orientationLabel,
      });
    };
    window.setTimeout(finish, 2600);
    video.preload = "metadata";
    video.onloadedmetadata = finish;
    video.onerror = finish;
    video.src = previewUrl;
    video.load();
  });
}

export default function MailboxClient() {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiConfigurationOpen, setAiConfigurationOpen] = useState(false);
  const [isMobileHeader, setIsMobileHeader] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileHeader(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const [folder, setFolder] = useState<Folder>("publications");
  const [boxView, setBoxView] = useState<BoxView>("sent");
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoadedOnce, setHistoryLoadedOnce] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageRef = useRef(1);
  const [historyHasMorePotential, setHistoryHasMorePotential] = useState(false);
  const [historyTotalCount, setHistoryTotalCount] = useState<number | null>(
    null,
  );
  const [folderCounts, setFolderCounts] = useState<FolderCounts>(() =>
    emptyFolderCounts(),
  );
  const [draftFolderCounts, setDraftFolderCounts] = useState<FolderCounts>(() =>
    emptyFolderCounts(),
  );

  // Détails : ouverture en double-clic dans une fenêtre au-dessus (modal)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsChannelKey, setDetailsChannelKey] = useState<string | null>(
    null,
  );
  const [detailsEditMode, setDetailsEditMode] = useState(false);
  const [detailsActionBusy, setDetailsActionBusy] = useState(false);
  const [detailsActionError, setDetailsActionError] = useState<string | null>(
    null,
  );
  const [detailsActionSuccess, setDetailsActionSuccess] = useState<
    string | null
  >(null);
  const [detailsSourceDocPayload, setDetailsSourceDocPayload] = useState<
    any | null
  >(null);
  const [campaignRecipients, setCampaignRecipients] = useState<
    CampaignRecipientLog[]
  >([]);
  const [campaignRecipientsLoading, setCampaignRecipientsLoading] =
    useState(false);
  const [campaignRecipientsPage, setCampaignRecipientsPage] = useState(1);
  const [campaignRecipientsPageCount, setCampaignRecipientsPageCount] =
    useState(1);
  const [campaignRecipientsTotal, setCampaignRecipientsTotal] = useState(0);
  const [campaignRecipientsFilter, setCampaignRecipientsFilter] =
    useState<CampaignRecipientsFilterId>("all");
  const [campaignHealth, setCampaignHealth] =
    useState<CampaignHealthSummary | null>(null);
  const [campaignHealthLoading, setCampaignHealthLoading] = useState(false);
  const [campaignActionBusyId, setCampaignActionBusyId] = useState<
    string | null
  >(null);
  const [publicationEditForm, setPublicationEditForm] =
    useState<PublicationEditForm>({
      title: "",
      content: "",
      cta: "",
      ctaMode: "none",
      ctaUrl: "",
      ctaPhone: "",
      hashtags: "",
    });
  const [publicationEditImagesByChannel, setPublicationEditImagesByChannel] =
    useState<Record<string, PublicationChannelImagesState>>({});
  const [publicationEditVideoByChannel, setPublicationEditVideoByChannel] =
    useState<Record<string, PublicationEditVideoState>>({});
  const [
    publicationImageAdapterChannelKey,
    setPublicationImageAdapterChannelKey,
  ] = useState<string | null>(null);
  const [publicationImageAdapterImageKey, setPublicationImageAdapterImageKey] =
    useState<string | null>(null);
  const publicationImageAdapterDragRef = useRef<{
    channel: string;
    imageKey: string;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const publicationImageAdapterReturnScrollTopRef = useRef<number | null>(null);
  const publicationImageAdapterStageRef = useRef<HTMLDivElement | null>(null);
  const [
    publicationImageAdapterStageSize,
    setPublicationImageAdapterStageSize,
  ] = useState({ width: 0, height: 0 });
  const [
    publicationImageAdapterImageMeta,
    setPublicationImageAdapterImageMeta,
  ] = useState<Record<string, { width: number; height: number }>>({});
  const [
    isPublicationImageAdapterDragging,
    setIsPublicationImageAdapterDragging,
  ] = useState(false);

  const publicationImageAdapterChannelState = publicationImageAdapterChannelKey
    ? publicationEditImagesByChannel[publicationImageAdapterChannelKey] || {
        assets: [],
      }
    : null;
  const publicationImageAdapterAsset =
    publicationImageAdapterChannelState?.assets.find(
      (asset) => asset.key === publicationImageAdapterImageKey,
    ) || null;

  useEffect(() => {
    historyPageRef.current = historyPage;
  }, [historyPage]);

  useEffect(() => {
    if (!detailsOpen || !detailsEditMode || !publicationImageAdapterAsset)
      return;
    const key = publicationImageAdapterAsset.key;
    if (publicationImageAdapterImageMeta[key]) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      setPublicationImageAdapterImageMeta((prev) => ({
        ...prev,
        [key]: {
          width: image.naturalWidth || image.width || 0,
          height: image.naturalHeight || image.height || 0,
        },
      }));
    };
    image.src = publicationImageAdapterAsset.previewUrl;
    return () => {
      cancelled = true;
    };
  }, [
    detailsOpen,
    detailsEditMode,
    publicationImageAdapterAsset?.key,
    publicationImageAdapterAsset?.previewUrl,
    publicationImageAdapterImageMeta,
  ]);

  useEffect(() => {
    if (
      !detailsOpen ||
      !detailsEditMode ||
      !publicationImageAdapterAsset ||
      !publicationImageAdapterStageRef.current
    )
      return;
    const node = publicationImageAdapterStageRef.current;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setPublicationImageAdapterStageSize({
        width: rect.width,
        height: rect.height,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [detailsOpen, detailsEditMode, publicationImageAdapterAsset?.key]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;

    if (detailsOpen) {
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
    };
  }, [detailsOpen]);

  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [filterAccountId, setFilterAccountId] = useState<string>("");

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [composeType, setComposeType] = useState<SendType>("mail");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [composeAttachments, setComposeAttachments] = useState<
    ComposeAttachmentRef[]
  >([]);
  const [composeRecipientHints, setComposeRecipientHints] = useState<
    ComposeCrmRecipientHint[]
  >([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [composeSourceDocSaveId, setComposeSourceDocSaveId] =
    useState<string>("");
  const [composeSourceDocType, setComposeSourceDocType] = useState<
    "devis" | "facture" | ""
  >("");
  const [composeSourceDocNumber, setComposeSourceDocNumber] =
    useState<string>("");
  const [composeTemplateKey, setComposeTemplateKey] = useState<string>("");
  const [sendBusy, setSendBusy] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [campaignDistributionNotice, setCampaignDistributionNotice] =
    useState<CampaignDistributionNotice | null>(null);
  const [signaturePreview, setSignaturePreview] = useState("Cordialement,");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [signatureImageWidth, setSignatureImageWidth] = useState(400);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [deletingHistoryItemId, setDeletingHistoryItemId] = useState<
    string | null
  >(null);
  const [deletingHistorySelection, setDeletingHistorySelection] =
    useState(false);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<string[]>([]);
  const [lastSavedComposeSnapshot, setLastSavedComposeSnapshot] = useState<
    string | null
  >(null);
  const [scheduledMailEdit, setScheduledMailEdit] =
    useState<ScheduledMailEditState | null>(null);
  const scheduledMailEditLoadRef = useRef<string>("");
  const [scheduledMailEditSaving, setScheduledMailEditSaving] = useState(false);

  // Attachments uploaded by Factures / Devis screens are stored here.
  const ATTACH_BUCKET = "inrbox_attachments";
  const lastAttachKeyRef = useRef<string>("");

  // Optional tracking intent passed by Booster / Propulser / Fidéliser templates.
  // iNr'Send must only count items that are actually SENT.
  type PendingTrack = {
    kind: "booster" | "propulser" | "fideliser";
    type: string;
    payload: Record<string, any>;
  };
  const [pendingTrack, setPendingTrack] = useState<PendingTrack | null>(null);
  type CampaignReuseMode = "reuse" | "resend";

  type ScheduledMailEditState = {
    id: string;
    scheduledAt: string | null;
    title: string;
    payload: Record<string, any>;
  };

  // CRM selection (compose)
  type CrmContact = {
    id: string;
    full_name: string | null;
    email: string | null;
    category: "particulier" | "professionnel" | "collectivite_publique" | null;
    contact_type:
      "client" | "prospect" | "fournisseur" | "partenaire" | "autre" | null;
    postal_code: string | null;
    city: string | null;
    important: boolean;
  };

  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmFilter, setCrmFilter] = useState("");
  const [crmSearchOpen, setCrmSearchOpen] = useState(false);
  const crmSearchRef = useRef<HTMLInputElement | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmPickerOpen, setCrmPickerOpen] = useState(false);
  const [crmCategory, setCrmCategory] = useState<
    "all" | CrmContact["category"]
  >("all");
  const [crmContactType, setCrmContactType] = useState<
    "all" | CrmContact["contact_type"]
  >("all");
  const [crmDepartment, setCrmDepartment] = useState("");
  const [crmImportantOnly, setCrmImportantOnly] = useState(false);

  // Used to trigger the hidden file input with a nice button
  const fileInputId = MAILBOX_FILE_INPUT_ID;
  const publicationEditFileInputId = PUBLICATION_EDIT_FILE_INPUT_ID;

  function toggleEmailInTo(email: string) {
    const list = normalizeEmails(to);
    const lower = email.toLowerCase();
    const exists = list.some((x) => x.toLowerCase() === lower);
    const next = exists
      ? list.filter((x) => x.toLowerCase() !== lower)
      : [...list, email];
    setTo(next.join(", "));
  }

  async function uploadComposeFiles(nextFiles: File[]) {
    if (!nextFiles.length) return [] as ComposeAttachmentRef[];
    setAttachBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;
      const uploaded: ComposeAttachmentRef[] = [];
      for (const file of nextFiles) {
        const path = makeAttachmentPath(file.name || "piece-jointe", userId);
        const { error } = await supabase.storage
          .from(ATTACH_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (error) throw error;
        uploaded.push({
          bucket: ATTACH_BUCKET,
          path,
          name: file.name || "piece-jointe",
          type: file.type || "application/octet-stream",
          size: file.size || 0,
        });
      }
      return uploaded;
    } finally {
      setAttachBusy(false);
    }
  }

  function serializeComposeAttachments(
    input: ComposeAttachmentRef[] = composeAttachments,
  ) {
    return input
      .map((att) => ({
        bucket: String(att.bucket || "").trim(),
        path: String(att.path || "").trim(),
        name: String(
          att.name || att.path?.split("/").pop() || "piece-jointe",
        ).trim(),
        type: att.type || null,
        size: att.size ?? null,
      }))
      .filter((att) => att.bucket && att.path && att.name);
  }

  function sanitizeCrmDepartmentFilter(value: string) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
      .replace(/[^0-9AB]/g, "")
      .slice(0, 3);
  }

  function contactDepartment(postalCode: string | null) {
    const cleaned = sanitizeCrmDepartmentFilter(postalCode || "");
    if (/^(97|98)\d/.test(cleaned)) return cleaned.slice(0, 3);
    return cleaned.slice(0, 2);
  }

  // Recherche dans l'historique iNr'Send
  const [historyQuery, setHistoryQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const historySearchRef = useRef<HTMLInputElement | null>(null);

  const filteredContacts = useMemo(() => {
    const q = crmFilter.trim().toLowerCase();
    const department = sanitizeCrmDepartmentFilter(crmDepartment);
    return crmContacts.filter((c) => {
      if (crmImportantOnly && !c.important) return false;
      if (crmCategory !== "all" && c.category !== crmCategory) return false;
      if (crmContactType !== "all" && c.contact_type !== crmContactType)
        return false;
      if (
        department &&
        !contactDepartment(c.postal_code).startsWith(department)
      )
        return false;
      if (!q) return true;
      const hay =
        `${c.full_name || ""} ${c.email || ""} ${c.postal_code || ""} ${c.city || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [
    crmContacts,
    crmFilter,
    crmImportantOnly,
    crmCategory,
    crmContactType,
    crmDepartment,
  ]);

  const selectedToSet = useMemo(() => {
    return new Set(normalizeEmails(to).map((e) => e.toLowerCase()));
  }, [to]);

  const selectedCrmCount = useMemo(() => {
    let n = 0;
    for (const c of crmContacts) {
      if (c.email && selectedToSet.has(String(c.email).toLowerCase())) n += 1;
    }
    return n;
  }, [crmContacts, selectedToSet]);

  const crmRecipientsByEmail = useMemo(() => {
    const map = new Map<string, ComposeCrmRecipientHint>();
    for (const contact of crmContacts) {
      const email = String(contact.email || "").trim();
      if (!email) continue;
      const lower = email.toLowerCase();
      if (map.has(lower)) continue;
      map.set(lower, {
        email,
        contact_id: contact.id,
        display_name: (contact.full_name || "").trim() || null,
      });
    }
    return map;
  }, [crmContacts]);

  const composeRecipientHintsByEmail = useMemo(() => {
    const map = new Map<string, ComposeCrmRecipientHint>();
    for (const hint of composeRecipientHints) {
      const email = String(hint.email || "").trim();
      if (!email) continue;
      map.set(email.toLowerCase(), {
        email,
        contact_id: hint.contact_id || null,
        display_name: hint.display_name || null,
      });
    }
    return map;
  }, [composeRecipientHints]);

  const counts = folderCounts;
  const currentFolderDraftCount = draftFolderCounts[folder] || 0;

  function makeComposeSnapshot(input?: {
    selectedAccountId?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    composeType?: SendType;
    composeAttachments?: ComposeAttachmentRef[];
    composeSourceDocSaveId?: string;
    composeSourceDocType?: string;
    composeSourceDocNumber?: string;
    composeTemplateKey?: string;
    pendingTrack?: PendingTrack | null;
  }) {
    const source = input || {};
    return JSON.stringify({
      selectedAccountId: source.selectedAccountId ?? selectedAccountId ?? "",
      to: source.to ?? to ?? "",
      subject: source.subject ?? subject ?? "",
      text: source.text ?? text ?? "",
      html: source.html ?? html ?? "",
      composeType: source.composeType ?? composeType,
      attachments: serializeComposeAttachments(
        source.composeAttachments ?? composeAttachments,
      ),
      sourceDocSaveId:
        source.composeSourceDocSaveId ?? composeSourceDocSaveId ?? "",
      sourceDocType: source.composeSourceDocType ?? composeSourceDocType ?? "",
      sourceDocNumber:
        source.composeSourceDocNumber ?? composeSourceDocNumber ?? "",
      templateKey: source.composeTemplateKey ?? composeTemplateKey ?? "",
      pendingTrack: source.pendingTrack ?? pendingTrack ?? null,
    });
  }

  const currentComposeSnapshot = useMemo(
    () => makeComposeSnapshot(),
    [
      selectedAccountId,
      to,
      subject,
      text,
      html,
      composeType,
      composeAttachments,
      composeSourceDocSaveId,
      composeSourceDocType,
      composeSourceDocNumber,
      composeTemplateKey,
      pendingTrack,
    ],
  );

  function setComposeSavedSnapshotFromCurrent() {
    setLastSavedComposeSnapshot(makeComposeSnapshot());
  }

  function asScheduledRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  function buildScheduledMailEditPayload(scheduledAt?: string | null) {
    if (!scheduledMailEdit) return null;
    if (!selectedAccount) {
      throw new Error("Veuillez connecter une boîte d’envoi dans les réglages.");
    }
    const recipientsList = normalizeEmails(to);
    if (recipientsList.length === 0) {
      throw new Error("Veuillez ajouter au moins un destinataire.");
    }

    const existingPayload = asScheduledRecord(scheduledMailEdit.payload);
    const existingCampaign = asScheduledRecord(existingPayload.campaign);
    const cleanSubject = normalizeMailSubject(subject.trim() || "(sans objet)");
    const campaignPayload = {
      ...existingCampaign,
      accountId: selectedAccount.id,
      accountEmail: selectedAccount.email_address || "",
      accountProvider: selectedAccount.provider || "",
      type: composeType,
      folder: "mails",
      trackKind: undefined,
      trackType: undefined,
      templateKey: composeTemplateKey || undefined,
      subject: cleanSubject,
      text: text || "",
      html: normalizeRichMailHtmlForSend(text, html),
      recipients: recipientsList.map((email) => {
        const lower = email.toLowerCase();
        const hint = composeRecipientHintsByEmail.get(lower);
        const crmContact = crmRecipientsByEmail.get(lower);
        return {
          email,
          contact_id: hint?.contact_id || crmContact?.contact_id || null,
          display_name: hint?.display_name || crmContact?.display_name || null,
        };
      }),
      attachments: serializeComposeAttachments(),
      sourceDocSaveId: composeSourceDocSaveId || undefined,
      sourceDocType: composeSourceDocType || undefined,
      sourceDocNumber: composeSourceDocNumber || undefined,
    };

    return {
      automationKey: null,
      actionType: "mailing",
      targetTool: "mails",
      title: `Mail — ${cleanSubject}`,
      summary: `${recipientsList.length} destinataire${recipientsList.length > 1 ? "s" : ""} · ${selectedAccount.email_address || selectedAccount.provider || "boîte connectée"}`,
      ...(scheduledAt ? { scheduledAt } : {}),
      channels: ["mails"],
      payload: {
        ...existingPayload,
        kind: "mail_campaign",
        origin: "inrsend_mail",
        workflowFinalizerKind: null,
        campaign: campaignPayload,
      },
    };
  }

  async function patchScheduledMailEdit(
    body: Record<string, unknown>,
  ): Promise<ScheduledMailEditState> {
    if (!scheduledMailEdit) {
      throw new Error("Mail programmé introuvable.");
    }
    const response = await fetch(
      `/api/agent/scheduled-actions/${scheduledMailEdit.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await response.json().catch(() => null)) as {
      scheduledAction?: any;
      error?: string;
    } | null;
    if (!response.ok || !data?.scheduledAction) {
      throw new Error(
        data?.error || "Enregistrement du mail programmé impossible.",
      );
    }
    return {
      id: String(data.scheduledAction.id),
      scheduledAt: data.scheduledAction.scheduledAt || null,
      title: String(data.scheduledAction.title || "Mail programmé"),
      payload: asScheduledRecord(data.scheduledAction.payload),
    };
  }

  async function saveScheduledMailEdit(scheduledAt?: string | null) {
    const body = buildScheduledMailEditPayload(scheduledAt);
    if (!body) return;
    setScheduledMailEditSaving(true);
    try {
      const saved = await patchScheduledMailEdit(body);
      setScheduledMailEdit(saved);
      setLastSavedComposeSnapshot(makeComposeSnapshot());
      setToast("Mail programmé enregistré.");
      setComposeOpen(false);
      setScheduledMailEdit(null);
      scheduledMailEditLoadRef.current = "";
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Enregistrement du mail programmé impossible.";
      setToast(message);
    } finally {
      setScheduledMailEditSaving(false);
    }
  }

  async function sendScheduledMailEditNow() {
    if (!scheduledMailEdit) return;
    const body = buildScheduledMailEditPayload(null);
    if (!body) return;
    setScheduledMailEditSaving(true);
    try {
      await patchScheduledMailEdit(body);
      const response = await fetch(
        `/api/agent/scheduled-actions/${scheduledMailEdit.id}/execute`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.error || "Envoi immédiat du mail programmé impossible.",
        );
      }
      setToast("Mail lancé maintenant. La programmation future est retirée.");
      setComposeOpen(false);
      setScheduledMailEdit(null);
      await loadHistory();
      updateFolder("mails");
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Envoi immédiat du mail programmé impossible.",
      );
    } finally {
      setScheduledMailEditSaving(false);
    }
  }

  function setComposeBody(nextText: string, nextHtml?: string | null) {
    const cleanText = stripTemplateSignatureBlock(String(nextText || ""));
    setText(cleanText);
    setHtml(
      normalizeRichMailHtmlForSend(
        cleanText,
        nextHtml || textToRichMailHtml(cleanText),
      ),
    );
  }

  function resetCompose(nextType: SendType = "mail") {
    setDraftId(null);
    setLastSavedComposeSnapshot(null);
    setComposeType(nextType);
    setComposeSourceDocSaveId("");
    setComposeSourceDocType("");
    setComposeSourceDocNumber("");
    setComposeTemplateKey("");
    setPendingTrack(null);
    setScheduledMailEdit(null);
    setTo("");
    setSubject("");
    setComposeBody(buildDefaultMailText({ kind: nextType }));
    setFiles([]);
    setComposeAttachments([]);
    setComposeRecipientHints([]);
    setCrmPickerOpen(false);
  }

  function inferTrackFromCampaign(item: OutboxItem): PendingTrack | null {
    if (!item || item.source !== "mail_campaigns") return null;
    const raw = ((item as any).raw || {}) as Record<string, any>;
    const rawKind = String(raw.track_kind || item.module || "")
      .trim()
      .toLowerCase();
    const rawType = String(raw.track_type || "")
      .trim()
      .toLowerCase();
    const folderName = String(item.folder || raw.folder || "")
      .trim()
      .toLowerCase();

    if (
      (rawKind === "booster" ||
        rawKind === "propulser" ||
        rawKind === "fideliser") &&
      rawType
    ) {
      return {
        kind: rawKind as "booster" | "propulser" | "fideliser",
        type: rawType,
        payload: {},
      };
    }

    if (rawType === "review_mail" || folderName === "recoltes") {
      return { kind: "propulser", type: "review_mail", payload: {} };
    }
    if (rawType === "promo_mail" || folderName === "offres") {
      return { kind: "propulser", type: "promo_mail", payload: {} };
    }
    if (rawType === "newsletter_mail" || folderName === "informations") {
      return { kind: "fideliser", type: "newsletter_mail", payload: {} };
    }
    if (rawType === "thanks_mail" || folderName === "suivis") {
      return { kind: "fideliser", type: "thanks_mail", payload: {} };
    }
    if (rawType === "satisfaction_mail" || folderName === "enquetes") {
      return { kind: "fideliser", type: "satisfaction_mail", payload: {} };
    }

    return null;
  }

  function normalizeCampaignAttachments(
    input: unknown,
  ): ComposeAttachmentRef[] {
    let values: unknown = input;
    if (typeof values === "string") {
      try {
        values = JSON.parse(values);
      } catch {
        values = [];
      }
    }
    const rows = Array.isArray(values) ? values : [];
    return rows
      .map((attachment: any) => {
        const bucket = String(attachment?.bucket || "").trim();
        const path = String(attachment?.path || "").trim();
        const name = String(
          attachment?.name ||
            attachment?.filename ||
            attachment?.fileName ||
            path.split("/").pop() ||
            "",
        ).trim();
        if (!bucket || !path || !name) return null;
        return {
          bucket,
          path,
          name,
          type:
            attachment?.type ||
            attachment?.mime_type ||
            attachment?.mimeType ||
            null,
          size:
            attachment?.size == null ? null : Number(attachment.size) || null,
        } satisfies ComposeAttachmentRef;
      })
      .filter(Boolean) as ComposeAttachmentRef[];
  }

  function workflowDraftTargetFromSendItem(
    item: OutboxItem,
    raw: Record<string, any>,
  ) {
    const trackKind = String(raw.track_kind || item.module || "")
      .trim()
      .toLowerCase();
    const trackType = String(raw.track_type || "")
      .trim()
      .toLowerCase();
    const folderName = String(raw.folder || item.folder || "")
      .trim()
      .toLowerCase();
    const workflowAction = String((item as any).workflowAction || "")
      .trim()
      .toLowerCase();

    const byTrackType: Record<
      string,
      {
        kind: "propulser" | "fideliser";
        action: string;
        folder: string;
        trackType: string;
      }
    > = {
      valorize: {
        kind: "propulser",
        action: "valorize",
        folder: "propulsions",
        trackType: "valorize",
      },
      review_mail: {
        kind: "propulser",
        action: "reviews",
        folder: "propulsions",
        trackType: "review_mail",
      },
      promo_mail: {
        kind: "propulser",
        action: "promo",
        folder: "propulsions",
        trackType: "promo_mail",
      },
      newsletter_mail: {
        kind: "fideliser",
        action: "inform",
        folder: "fidelisations",
        trackType: "newsletter_mail",
      },
      thanks_mail: {
        kind: "fideliser",
        action: "thanks",
        folder: "fidelisations",
        trackType: "thanks_mail",
      },
      satisfaction_mail: {
        kind: "fideliser",
        action: "satisfaction",
        folder: "fidelisations",
        trackType: "satisfaction_mail",
      },
    };

    const byWorkflowAction: Record<
      string,
      {
        kind: "propulser" | "fideliser";
        action: string;
        folder: string;
        trackType: string;
      }
    > = {
      valoriser: byTrackType.valorize,
      recolter: byTrackType.review_mail,
      offrir: byTrackType.promo_mail,
      informer: byTrackType.newsletter_mail,
      suivre: byTrackType.thanks_mail,
      enqueter: byTrackType.satisfaction_mail,
    };

    const byLegacyFolder: Record<
      string,
      {
        kind: "propulser" | "fideliser";
        action: string;
        folder: string;
        trackType: string;
      }
    > = {
      recoltes: byTrackType.review_mail,
      offres: byTrackType.promo_mail,
      informations: byTrackType.newsletter_mail,
      suivis: byTrackType.thanks_mail,
      enquetes: byTrackType.satisfaction_mail,
    };

    if (byTrackType[trackType]) return byTrackType[trackType];
    if (byWorkflowAction[workflowAction])
      return byWorkflowAction[workflowAction];
    if (byLegacyFolder[folderName]) return byLegacyFolder[folderName];
    if (trackKind === "propulser" || folderName === "propulsions")
      return byTrackType.valorize;
    if (trackKind === "fideliser" || folderName === "fidelisations")
      return byTrackType.newsletter_mail;
    return null;
  }

  function openWorkflowCampaignDraft(
    item: OutboxItem,
    raw: Record<string, any>,
  ) {
    const target = workflowDraftTargetFromSendItem(item, raw);
    if (!target) return false;

    const restoreKey = saveWorkflowCampaignState({
      kind: target.kind,
      action: target.action,
      folder: target.folder,
      trackKind: target.kind,
      trackType: target.trackType,
      templateKey: String(raw.template_key || "") || null,
      templateCategory: null,
      subject: normalizeMailSubject(String(raw.subject || item.subject || "")),
      bodyText: String(raw.body_text || item.detailText || ""),
      bodyHtml: String(
        raw.body_html ||
          item.detailHtml ||
          textToRichMailHtml(String(raw.body_text || item.detailText || "")),
      ),
      attachments: normalizeCampaignAttachments(raw.attachments),
      draftId: item.id,
    });

    setDetailsOpen(false);
    setComposeOpen(false);
    router.push(
      `/dashboard/${target.kind}?action=${encodeURIComponent(target.action)}&restore_key=${encodeURIComponent(restoreKey)}`,
    );
    return true;
  }

  async function loadAllCampaignRecipientsForCompose(
    campaignId: string,
  ): Promise<ComposeCrmRecipientHint[]> {
    const pageSize = 1000;
    let from = 0;
    const result: ComposeCrmRecipientHint[] = [];
    const seen = new Set<string>();

    for (let guard = 0; guard < 20; guard += 1) {
      const toRange = from + pageSize - 1;
      const { data, error } = await supabase
        .from("mail_campaign_recipients")
        .select("email,display_name,contact_id")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true })
        .range(from, toRange);

      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      for (const row of rows as any[]) {
        const email = String(row?.email || "").trim();
        const lower = email.toLowerCase();
        if (!email || seen.has(lower)) continue;
        seen.add(lower);
        result.push({
          email,
          contact_id: row?.contact_id || null,
          display_name: row?.display_name || null,
        });
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return result;
  }

  async function openCampaignComposeFromHistory(
    item: OutboxItem,
    mode: CampaignReuseMode,
  ) {
    if (!item || item.source !== "mail_campaigns") return;
    if (campaignActionBusyId) return;

    const raw = ((item as any).raw || {}) as Record<string, any>;
    setCampaignActionBusyId(item.id);

    try {
      const nextType: SendType =
        raw.type === "facture" || raw.type === "devis" ? raw.type : "mail";
      const track = inferTrackFromCampaign(item);
      const recipients =
        mode === "resend"
          ? await loadAllCampaignRecipientsForCompose(item.id)
          : [];

      if (mode === "resend" && recipients.length === 0) {
        setToast(
          "Impossible de retrouver les destinataires de cette campagne.",
        );
        return;
      }

      setDraftId(null);
      setComposeType(nextType);
      setComposeTemplateKey(String(raw.template_key || ""));
      setComposeSourceDocSaveId(String(raw.source_doc_save_id || ""));
      setComposeSourceDocType(
        raw.source_doc_type === "facture" || raw.source_doc_type === "devis"
          ? raw.source_doc_type
          : "",
      );
      setComposeSourceDocNumber(String(raw.source_doc_number || ""));
      setSubject(
        normalizeMailSubject(
          String(raw.subject || item.subject || "").trim() || "(sans objet)",
        ),
      );
      setComposeBody(
        String(raw.body_text || item.detailText || ""),
        String(raw.body_html || ""),
      );
      setFiles([]);
      setComposeAttachments(normalizeCampaignAttachments(raw.attachments));
      setTo(
        mode === "resend"
          ? recipients.map((recipient) => recipient.email).join(", ")
          : "",
      );
      setComposeRecipientHints(mode === "resend" ? recipients : []);
      setCrmPickerOpen(mode === "reuse");

      if (raw.integration_id) {
        setSelectedAccountId(String(raw.integration_id));
      }

      setPendingTrack(
        track
          ? {
              ...track,
              payload: {
                ...(track.payload || {}),
                reused_from_campaign_id: item.id,
                reuse_mode: mode,
              },
            }
          : null,
      );

      lastAttachKeyRef.current = "";
      setDetailsOpen(false);
      setComposeOpen(true);
      setToast(
        mode === "resend"
          ? "Campagne prête à renvoyer : vérifiez puis envoyez."
          : "Campagne prête à réutiliser : choisissez les nouveaux destinataires.",
      );
    } catch (error) {
      console.error(error);
      setToast("Impossible de préparer cette campagne pour le moment.");
    } finally {
      setCampaignActionBusyId(null);
    }
  }

  async function loadAccounts() {
    const res = await fetch("/api/integrations/status", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return;

    // Backward/forward compatibility:
    // - new API returns { mailAccounts }
    // - older API could return { accounts }
    const accounts = Array.isArray(j?.mailAccounts)
      ? (j.mailAccounts as any[])
      : Array.isArray(j?.accounts)
        ? (j.accounts as any[]).filter((a) => a?.category === "mail")
        : [];

    setMailAccounts(accounts as any);

    const connected = accounts.filter(
      (a) =>
        a.status === "connected" &&
        a.connection_status !== "needs_update" &&
        !a.requires_update,
    );
    const defaultId = connected[0]?.id || "";
    const usableAccountIds = new Set(
      connected.map((a) => String(a?.id || "")).filter(Boolean),
    );
    const accountIds = new Set(
      accounts.map((a) => String(a?.id || "")).filter(Boolean),
    );

    setSelectedAccountId((prev) =>
      prev && usableAccountIds.has(prev) ? prev : defaultId,
    );
    setFilterAccountId((prev) => (prev && accountIds.has(prev) ? prev : ""));
  }

  async function loadSignature(accountId?: string) {
    try {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      const url = params.toString()
        ? `/api/inrsend/signature?${params.toString()}`
        : "/api/inrsend/signature";
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setSignatureEnabled(j?.enabled !== false);
      setSignaturePreview(String(j?.preview || "").trim() || "Cordialement,");
      setSignatureImageUrl(String(j?.imageUrl || ""));
      setSignatureImageWidth(Number(j?.imageWidth || 400) || 400);
    } catch {
      // keep fallback signature
    }
  }

  const loadHistory = useCallback(
    async (options?: { page?: number }) => {
      const targetPage = Math.max(
        1,
        options?.page ?? historyPageRef.current ?? 1,
      );

      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(MAILBOX_PAGE_SIZE));
        params.set("folder", folder);
        params.set("boxView", boxView);
        if (filterAccountId) params.set("filterAccountId", filterAccountId);
        const trimmedQuery = historyQuery.trim();
        if (trimmedQuery) params.set("q", trimmedQuery);

        const response = await fetch(
          `/api/inrsend/history?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error || "Impossible de charger l’historique iNr’Send.",
          );
        }

        const nextItems = Array.isArray(payload?.items)
          ? (payload.items as OutboxItem[])
          : [];
        const nextTotal =
          typeof payload?.total === "number"
            ? Math.max(0, Number(payload.total))
            : null;
        const nextPage =
          typeof payload?.page === "number"
            ? Math.max(1, Number(payload.page))
            : targetPage;
        const nextCounts = normalizeFolderCounts(payload?.folderCounts);
        const nextDraftCounts = normalizeFolderCounts(
          payload?.draftFolderCounts,
        );

        setItems(nextItems);
        setHistoryPage(nextPage);
        setHistoryHasMorePotential(Boolean(payload?.hasMore));
        setHistoryTotalCount(nextTotal);
        setFolderCounts(nextCounts);
        setDraftFolderCounts(nextDraftCounts);
        setSelectedHistoryKeys([]);
        setSelectedId((prev) =>
          nextItems.some((item) => item.id === prev)
            ? prev
            : (nextItems[0]?.id ?? null),
        );
      } catch (error) {
        console.error(error);
        setItems([]);
        setHistoryPage(targetPage);
        setHistoryHasMorePotential(false);
        setHistoryTotalCount(0);
        setFolderCounts(emptyFolderCounts());
        setDraftFolderCounts(emptyFolderCounts());
        setSelectedHistoryKeys([]);
        setSelectedId(null);
      } finally {
        setHistoryLoadedOnce(true);
        setLoading(false);
      }
    },
    [boxView, filterAccountId, folder, historyQuery],
  );

  const filteredItems = items;

  const historyPageCount = useMemo(() => {
    if (historyTotalCount == null) {
      return Math.max(1, historyPage + (historyHasMorePotential ? 1 : 0));
    }
    return Math.max(1, Math.ceil(historyTotalCount / MAILBOX_PAGE_SIZE));
  }, [historyHasMorePotential, historyPage, historyTotalCount]);

  const visibleItems = filteredItems;

  const visibleBulkDeletableItems = useMemo(
    () => visibleItems.filter((item) => canBulkDeleteHistoryItem(item)),
    [visibleItems],
  );
  const selectedHistoryKeySet = useMemo(
    () => new Set(selectedHistoryKeys),
    [selectedHistoryKeys],
  );
  const selectedBulkItems = useMemo(
    () =>
      visibleBulkDeletableItems.filter((item) =>
        selectedHistoryKeySet.has(historySelectionKey(item)),
      ),
    [selectedHistoryKeySet, visibleBulkDeletableItems],
  );
  const selectedBulkCount = selectedBulkItems.length;
  const allVisibleBulkItemsSelected = useMemo(
    () =>
      visibleBulkDeletableItems.length > 0 &&
      visibleBulkDeletableItems.every((item) =>
        selectedHistoryKeySet.has(historySelectionKey(item)),
      ),
    [selectedHistoryKeySet, visibleBulkDeletableItems],
  );

  const selected = useMemo(() => {
    return items.find((x) => x.id === selectedId) || null;
  }, [items, selectedId]);

  const detailsItem = useMemo(() => {
    if (!detailsId) return null;
    return items.find((x) => x.id === detailsId) || null;
  }, [items, detailsId]);

  const detailsAccountLabel = useMemo(() => {
    if (!detailsItem) return "";
    const id = itemMailAccountId(detailsItem);
    if (!id) return "";
    const acc = mailAccounts.find((a) => a.id === id);
    if (!acc) return "";
    return (
      (acc.display_name ? `${acc.display_name} — ` : "") + acc.email_address
    );
  }, [detailsItem, mailAccounts]);

  const detailsPayload = useMemo(() => {
    return detailsItem && detailsItem.source === "app_events"
      ? (((detailsItem as any)?.raw?.payload || null) as any)
      : null;
  }, [detailsItem]);

  const loadCampaignRecipients = useCallback(
    async (
      campaignId: string,
      targetPage = campaignRecipientsPage,
      targetFilter = campaignRecipientsFilter,
    ) => {
      if (!campaignId) {
        setCampaignRecipients([]);
        setCampaignRecipientsTotal(0);
        setCampaignRecipientsPageCount(1);
        return;
      }
      setCampaignRecipientsLoading(true);
      try {
        const safePage = Math.max(1, targetPage);
        const from = (safePage - 1) * MAILBOX_RECIPIENTS_PAGE_SIZE;
        const to = from + MAILBOX_RECIPIENTS_PAGE_SIZE - 1;
        let query: any = supabase
          .from("mail_campaign_recipients")
          .select(
            "id,email,display_name,status,error,last_error,attempt_count,max_attempts,next_attempt_at,sent_at,updated_at,suppression_reason,bounce_type,bounced_at,unsubscribed_at,delivery_status,delivery_event,delivery_last_event_at,delivered_at",
            { count: "exact" },
          )
          .eq("campaign_id", campaignId)
          .order("created_at", { ascending: true });
        query = applyCampaignRecipientsFilter(query, targetFilter);
        const { data, error, count } = await query.range(from, to);
        if (error) throw error;
        const total = Math.max(0, Number(count || 0));
        setCampaignRecipients(
          ((data || []) as any[]).map((row: any) => ({
            id: String(row.id || ""),
            email: String(row.email || ""),
            display_name: row.display_name || null,
            status: String(row.status || "queued"),
            error: row.error || null,
            last_error: row.last_error || null,
            attempt_count:
              row.attempt_count == null ? null : Number(row.attempt_count),
            max_attempts:
              row.max_attempts == null ? null : Number(row.max_attempts),
            next_attempt_at: row.next_attempt_at || null,
            sent_at: row.sent_at || null,
            updated_at: row.updated_at || null,
            suppression_reason: row.suppression_reason || null,
            bounce_type: row.bounce_type || null,
            bounced_at: row.bounced_at || null,
            unsubscribed_at: row.unsubscribed_at || null,
            delivery_status: row.delivery_status || null,
            delivery_event: row.delivery_event || null,
            delivery_last_event_at: row.delivery_last_event_at || null,
            delivered_at: row.delivered_at || null,
          })),
        );
        setCampaignRecipientsTotal(total);
        setCampaignRecipientsPageCount(
          Math.max(1, Math.ceil(total / MAILBOX_RECIPIENTS_PAGE_SIZE)),
        );
      } catch (error) {
        console.error(error);
        setCampaignRecipients([]);
        setCampaignRecipientsTotal(0);
        setCampaignRecipientsPageCount(1);
      } finally {
        setCampaignRecipientsLoading(false);
      }
    },
    [campaignRecipientsFilter, campaignRecipientsPage, supabase],
  );

  const loadCampaignHealth = useCallback(
    async (campaignId: string, raw?: any) => {
      if (!campaignId) {
        setCampaignHealth(null);
        return;
      }

      const baseCounts = campaignCounts(raw || {});
      setCampaignHealthLoading(true);
      try {
        const countRecipients = async (
          filter: CampaignRecipientsFilterId | "__blocked__",
        ) => {
          let query: any = supabase
            .from("mail_campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaignId);
          if (filter === "__blocked__") {
            query = query
              .eq("status", "failed")
              .not("suppression_reason", "is", null);
          } else {
            query = applyCampaignRecipientsFilter(query, filter);
          }
          const { count, error } = await query;
          if (error) throw error;
          return Math.max(0, Number(count || 0));
        };

        const [total, queued, processing, sent, failed, optOut, blacklist] = await Promise.all([
          countRecipients("all"),
          countRecipients("queued"),
          countRecipients("processing"),
          countRecipients("sent"),
          countRecipients("failed"),
          countRecipients("opt_out"),
          countRecipients("blacklist"),
        ]);
        const blocked = optOut + blacklist;

        setCampaignHealth({
          total,
          queued,
          processing,
          sent,
          failed,
          blocked,
          opt_out: optOut,
          blacklist,
          retryable: Math.max(0, failed - blocked),
        });
      } catch (error) {
        console.error(error);
        setCampaignHealth({
          ...baseCounts,
          blocked: 0,
          opt_out: 0,
          blacklist: 0,
          retryable: Math.max(0, baseCounts.failed),
        });
      } finally {
        setCampaignHealthLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (
      !detailsOpen ||
      !detailsItem ||
      detailsItem.source !== "mail_campaigns"
    ) {
      setCampaignHealth(null);
      setCampaignHealthLoading(false);
      return;
    }
    void loadCampaignHealth(detailsItem.id, (detailsItem as any).raw || {});
  }, [detailsOpen, detailsItem, loadCampaignHealth]);

  useEffect(() => {
    if (
      !detailsOpen ||
      !detailsItem ||
      detailsItem.source !== "mail_campaigns"
    ) {
      setCampaignRecipients([]);
      setCampaignRecipientsLoading(false);
      setCampaignRecipientsTotal(0);
      setCampaignRecipientsPageCount(1);
      return;
    }
    void loadCampaignRecipients(
      detailsItem.id,
      campaignRecipientsPage,
      campaignRecipientsFilter,
    );
  }, [
    campaignRecipientsFilter,
    campaignRecipientsPage,
    detailsOpen,
    detailsItem,
    loadCampaignRecipients,
  ]);

  useEffect(() => {
    if (
      !detailsOpen ||
      !detailsItem ||
      detailsItem.source !== "mail_campaigns"
    ) {
      setCampaignRecipientsPage(1);
      setCampaignRecipientsFilter("all");
      return;
    }
    setCampaignRecipientsPage(1);
    setCampaignRecipientsFilter("all");
  }, [detailsItem?.id, detailsItem?.source, detailsOpen]);

  useEffect(() => {
    if (campaignRecipientsPage <= campaignRecipientsPageCount) return;
    setCampaignRecipientsPage(campaignRecipientsPageCount);
  }, [campaignRecipientsPage, campaignRecipientsPageCount]);

  useEffect(() => {
    let cancelled = false;
    if (!detailsOpen || !detailsItem || detailsItem.source !== "send_items") {
      setDetailsSourceDocPayload(null);
      return;
    }

    const saveId = (detailsItem as any)?.raw?.source_doc_save_id;
    const sourceType = (detailsItem as any)?.raw?.source_doc_type;
    if (!saveId || !sourceType) {
      setDetailsSourceDocPayload(null);
      return;
    }

    const loadSourceDocPayload = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setDetailsSourceDocPayload(null);
        return;
      }

      const { data, error } = await supabase
        .from("doc_saves")
        .select("payload")
        .eq("id", saveId)
        .eq("user_id", user.id)
        .eq("type", sourceType)
        .maybeSingle();

      if (!cancelled) {
        setDetailsSourceDocPayload(error ? null : data?.payload || null);
      }
    };

    void loadSourceDocPayload();
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, detailsItem, supabase]);

  const detailsChannelEntries = useMemo(() => {
    if (!detailsItem || detailsItem.source !== "app_events")
      return [] as ChannelPublication[];
    const payload = detailsPayload;
    const channelPublications = extractChannelPublications(payload);
    if (channelPublications.length) return channelPublications;
    const defaultParts = extractPublicationParts(payload);
    return orderChannelKeys(
      (detailsItem.channels && detailsItem.channels.length
        ? detailsItem.channels
        : [detailsItem.target]
      )
        .filter(Boolean)
        .map((channel) => String(channel)),
    ).map((channel) => ({
      key: channel,
      label: formatChannelLabel(channel),
      parts: defaultParts,
    }));
  }, [detailsItem, detailsPayload]);

  const activeDetailsChannelEntry = useMemo(() => {
    if (!detailsChannelEntries.length) return null;
    return (
      detailsChannelEntries.find((entry) => entry.key === detailsChannelKey) ||
      detailsChannelEntries[0] ||
      null
    );
  }, [detailsChannelEntries, detailsChannelKey]);

  const activeDetailsChannelResult = useMemo(() => {
    if (!detailsPayload || !activeDetailsChannelEntry) return null;
    const results =
      detailsPayload?.results && typeof detailsPayload.results === "object"
        ? detailsPayload.results
        : {};
    return (results as any)?.[activeDetailsChannelEntry.key] || null;
  }, [detailsPayload, activeDetailsChannelEntry]);

  const activePublicationEditChannelKey = normalizeChannelKey(
    activeDetailsChannelEntry?.key || "",
  );
  const activePublicationEditPreset = useMemo(
    () => getPublicationChannelPreset(activePublicationEditChannelKey),
    [activePublicationEditChannelKey],
  );
  const activePublicationEditAssets =
    publicationEditImagesByChannel[activePublicationEditChannelKey]?.assets ||
    [];
  const activePublicationEditVideo =
    publicationEditVideoByChannel[activePublicationEditChannelKey] || null;

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "app_events")
      return;
    const parts = activeDetailsChannelEntry?.parts || {};
    setPublicationEditForm({
      title: parts.title || "",
      content: parts.content || "",
      cta: parts.cta || "",
      ctaMode:
        parts.ctaMode ||
        (parts.ctaUrl
          ? "website"
          : parts.ctaPhone
            ? "call"
            : parts.cta
              ? "custom"
              : "none"),
      ctaUrl: parts.ctaUrl || "",
      ctaPhone: parts.ctaPhone || "",
      hashtags: tagsToEditorString(parts.hashtags),
    });
    setDetailsEditMode(false);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
  }, [detailsOpen, detailsItem, activeDetailsChannelEntry?.key]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "app_events")
      return;
    const nextState: Record<string, PublicationChannelImagesState> = {};
    for (const entry of detailsChannelEntries) {
      const channel = normalizeChannelKey(entry.key);
      const defaultTransform = buildPublicationDefaultTransform(channel);
      const assets = (
        Array.isArray(entry.parts.attachments) ? entry.parts.attachments : []
      )
        .filter(
          (att) =>
            (att?.url ||
              att?.originalUrl ||
              att?.originalPublicUrl ||
              att?.renderedUrl) &&
            isImageAttachment({
              ...att,
              url:
                att.url ||
                att.originalUrl ||
                att.originalPublicUrl ||
                att.renderedUrl,
            }),
        )
        .map((att, index) => {
          const renderedUrl = String(
            att.renderedUrl || att.url || att.publicUrl || "",
          ).trim();
          const originalUrl = String(
            att.originalUrl || att.originalPublicUrl || "",
          ).trim();
          const previewUrl = originalUrl || renderedUrl;
          const storedTransform =
            att.transform && typeof att.transform === "object"
              ? (att.transform as Partial<PublicationImageTransform>)
              : null;
          const initialTransform = storedTransform
            ? { ...defaultTransform, ...storedTransform }
            : { ...defaultTransform };
          return {
            key: makePublicationImageAssetKey(
              "existing",
              att.name || `image-${index + 1}`,
              `${index}:${previewUrl || renderedUrl}`,
            ),
            name: att.originalName || att.name || `Image ${index + 1}`,
            type:
              String(att.originalType || att.type || "image/jpeg") ||
              "image/jpeg",
            previewUrl,
            sourceUrl: renderedUrl || previewUrl || null,
            originalUrl: originalUrl || null,
            renderedUrl: renderedUrl || null,
            originalStoragePath: att.originalStoragePath || null,
            originalName: att.originalName || att.name || null,
            originalType: att.originalType || att.type || null,
            file: null,
            selected: channel === "gmb" ? index === 0 : true,
            transform: initialTransform,
            savedTransform: { ...initialTransform },
            imageMeta: att.imageMeta || null,
          };
        });
      nextState[channel] = { assets };
    }
    setPublicationEditImagesByChannel(nextState);
    setPublicationImageAdapterChannelKey(null);
    setPublicationImageAdapterImageKey(null);
  }, [detailsOpen, detailsItem?.id, detailsChannelEntries]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "app_events")
      return;
    const nextState: Record<string, PublicationEditVideoState> = {};
    for (const entry of detailsChannelEntries) {
      const channel = normalizeBoosterChannelKeyForVideo(entry.key);
      const parts = (entry.parts || {}) as any;
      const videoCandidate =
        parts.video ||
        (Array.isArray(parts.attachments)
          ? parts.attachments.find((att: any) => isVideoAttachment(att))
          : null);
      const finalVideo = attachmentToVideoPayload(videoCandidate);
      if (!finalVideo) continue;
      const settings = parts.videoSettings || {};
      const sourceVideo =
        attachmentToVideoPayload(parts.sourceVideo) || finalVideo;
      const sourceMetadata =
        sourceVideo.sourceMetadata || finalVideo.sourceMetadata || null;
      const defaultFormat = getRecommendedVideoFormatForSource(
        channel,
        sourceMetadata,
      );
      const format = (settings.format ||
        parts.videoFormat ||
        defaultFormat) as VideoFormat;
      const adaptationMode = (settings.adaptationMode ||
        parts.videoAdaptationMode ||
        "safe_blur") as VideoAdaptationMode;
      const signature = buildVideoTransformSignature(format, adaptationMode);
      const syntheticFinalVariant =
        finalVideo.publicUrl || finalVideo.url
          ? {
              key: `${channel}-${format}-${adaptationMode}-published`,
              channel,
              format,
              adaptationMode,
              signature,
              publicUrl: finalVideo.publicUrl || finalVideo.url || "",
              url: finalVideo.publicUrl || finalVideo.url || "",
              storagePath: finalVideo.storagePath || "",
              contentType: finalVideo.type || "video/mp4",
              size: finalVideo.size || 0,
              duration: finalVideo.duration || null,
              target: {
                label: getVideoFormatLabel(channel, format, sourceMetadata),
              },
            }
          : null;
      const storedVariants = Array.isArray(finalVideo.transformedVariants)
        ? finalVideo.transformedVariants
        : [];
      const transformedVariants = [syntheticFinalVariant, ...storedVariants]
        .filter(Boolean)
        .filter(
          (variant: any, index, arr) =>
            arr.findIndex(
              (candidate: any) =>
                String(
                  candidate?.signature ||
                    candidate?.publicUrl ||
                    candidate?.url ||
                    "",
                ) ===
                String(
                  variant?.signature ||
                    variant?.publicUrl ||
                    variant?.url ||
                    "",
                ),
            ) === index,
        ) as NonNullable<VideoPayload["transformedVariants"]>;
      nextState[channel] = {
        file: null,
        previewUrl:
          sourceVideo.publicUrl ||
          sourceVideo.url ||
          finalVideo.publicUrl ||
          finalVideo.url ||
          "",
        name: sourceVideo.name || finalVideo.name || "video-inrcy.mp4",
        type: sourceVideo.type || finalVideo.type || "video/mp4",
        size: sourceVideo.size || finalVideo.size || 0,
        duration: sourceVideo.duration || finalVideo.duration || null,
        sourceMetadata,
        sourceVideo,
        transformedVariants,
        format,
        adaptationMode,
        preparation: finalVideo.publicUrl
          ? {
              status: "ready",
              label: "Format appliqué",
              detail: `${getVideoFormatLabel(channel, format, sourceMetadata)} · ${VIDEO_ADAPTATION_MODE_LABELS[adaptationMode]}`,
            }
          : null,
      };
    }
    setPublicationEditVideoByChannel(nextState);
  }, [detailsOpen, detailsItem?.id, detailsChannelEntries]);

  const selectedAccount = useMemo(() => {
    return mailAccounts.find((a) => a.id === selectedAccountId) || null;
  }, [mailAccounts, selectedAccountId]);

  const workflowFinalizerKind = useMemo<
    "propulser" | "fideliser" | null
  >(() => {
    const raw = String(
      searchParams?.get("finalizer") ||
        searchParams?.get("workflow_finalizer") ||
        "",
    ).toLowerCase();
    return raw === "propulser" || raw === "fideliser" ? raw : null;
  }, [searchParams]);

  const workflowReturnAction = useMemo(
    () => String(searchParams?.get("workflow_action") || "").trim(),
    [searchParams],
  );
  const workflowReturnKey = useMemo(
    () => String(searchParams?.get("workflow_return_key") || "").trim(),
    [searchParams],
  );

  const composeRecipientList = useMemo(() => normalizeEmails(to), [to]);
  const isBulkCampaignCompose = composeRecipientList.length > 1;
  const bulkCampaignNotice = useMemo(() => {
    const count = composeRecipientList.length;
    if (count >= BULK_CONFIRM_STRONG_THRESHOLD) {
      return {
        tone: "strong" as const,
        title: `Campagne importante : ${count} destinataires`,
        text: "Une confirmation sera demandée avant l’envoi. Les garde-fous, quotas et reprises automatiques resteront actifs.",
      };
    }
    if (count >= BULK_CONFIRM_WARNING_THRESHOLD) {
      return {
        tone: "warning" as const,
        title: `Campagne multi-destinataires : ${count} destinataires`,
        text: "Vérifiez l’objet, la boîte d’envoi et le segment sélectionné avant de lancer la campagne.",
      };
    }
    if (count > 1) {
      return {
        tone: "info" as const,
        title: `Mode campagne activé : ${count} destinataires`,
        text: "Chaque contact recevra un email individuel depuis iNr’SEND.",
      };
    }
    return null;
  }, [composeRecipientList]);

  const toolCfg = useMemo(() => {
    switch (folder) {
      case "mails":
        return { label: "✉️ Envoyer", href: null as string | null };
      case "factures":
        return { label: "📄 Factures", href: "/dashboard/factures/new" };
      case "devis":
        return { label: "🧾 Devis", href: "/dashboard/devis/new" };

      case "publications":
        return { label: "📣 Publier", href: "/dashboard?action=publish" };
      case "propulsions":
      case "recoltes":
      case "offres":
        return { label: "🚀 Propulser", href: "/dashboard/propulser" };
      case "fidelisations":
      case "informations":
      case "suivis":
      case "enquetes":
        return { label: "💌 Fidéliser", href: "/dashboard/fideliser" };
      case "stats":
        return { label: "iNr'Stats", href: "/dashboard/stats" };

      default:
        return { label: "Ouvrir l’outil", href: null as string | null };
    }
  }, [folder]);

  // initial
  useEffect(() => {
    void loadAccounts();
    void loadSignature();
  }, []);

  useEffect(() => {
    if (!composeOpen) {
      setLastSavedComposeSnapshot(null);
      return;
    }
    void loadSignature(selectedAccountId || undefined);
  }, [composeOpen, selectedAccountId]);

  useEffect(() => {
    const handleSignatureUpdated = () => {
      void loadSignature(selectedAccountId || undefined);
    };

    window.addEventListener(
      "inrsend:signature-updated",
      handleSignatureUpdated,
    );
    return () =>
      window.removeEventListener(
        "inrsend:signature-updated",
        handleSignatureUpdated,
      );
  }, [selectedAccountId]);

  // refresh des changements de filtres / recherche
  useEffect(() => {
    void loadHistory({ page: 1 });
  }, [loadHistory]);

  useEffect(() => {
    const handleMailAccountsUpdated = async () => {
      await loadAccounts();
      await loadHistory();
    };

    window.addEventListener(
      MAIL_ACCOUNTS_UPDATED_EVENT,
      handleMailAccountsUpdated as EventListener,
    );
    return () =>
      window.removeEventListener(
        MAIL_ACCOUNTS_UPDATED_EVENT,
        handleMailAccountsUpdated as EventListener,
      );
  }, [loadHistory]);

  useEffect(() => {
    if (!composeOpen) return;
    void loadAccounts();
  }, [composeOpen]);

  // UX recherche: Ctrl/Cmd+K pour ouvrir, Esc pour fermer (sans perdre la saisie)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || "").toLowerCase();
      const isK = key === "k";
      const isEsc = key === "escape" || key === "esc";

      if ((e.ctrlKey || e.metaKey) && isK) {
        e.preventDefault();
        setSearchOpen(true);
        // focus après rendu
        requestAnimationFrame(() => historySearchRef.current?.focus());
        return;
      }

      if (isEsc && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    requestAnimationFrame(() => historySearchRef.current?.focus());
  }, [searchOpen]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (!(
        detail?.field === "docs_version" ||
        detail?.field === "publications_version"
      ))
        return;
      void loadHistory();
    };

    window.addEventListener(
      PROFILE_VERSION_EVENT,
      handleProfileVersionChange as EventListener,
    );
    return () => {
      window.removeEventListener(
        PROFILE_VERSION_EVENT,
        handleProfileVersionChange as EventListener,
      );
    };
  }, [loadHistory]);

  // open folder from URL
  useEffect(() => {
    const q = (searchParams?.get("folder") || "").toLowerCase();
    const allowed: Record<string, Folder> = {
      mails: "mails",
      factures: "factures",
      devis: "devis",
      publications: "publications",
      propulsions: "propulsions",
      fidelisations: "fidelisations",
      stats: "stats",
      bilans: "stats",
      inrstats: "stats",
      recoltes: "propulsions",
      offres: "propulsions",
      informations: "fidelisations",
      suivis: "fidelisations",
      enquetes: "fidelisations",
    };
    if (q && allowed[q]) setFolder(allowed[q]);
  }, [searchParams, signatureEnabled, signaturePreview]);

  // Open compose + prefill basic fields from URL params.
  // Used by:
  // - CRM: /dashboard/mails?compose=1&to=...&from=crm
  // - Factures / Devis: /dashboard/mails?compose=1&to=...&attachKey=...&attachName=...
  useEffect(() => {
    const openRaw = (searchParams?.get("compose") || "").toLowerCase();
    const shouldOpen = openRaw !== "0" && openRaw !== "false" && openRaw !== "";
    if (!shouldOpen) return;

    let toParam = safeDecode(searchParams?.get("to") || "").trim();
    const prefillStorage = (
      searchParams?.get("prefillStorage") || ""
    ).toLowerCase();
    let sessionRecipientHints: ComposeCrmRecipientHint[] = [];
    if (
      !toParam &&
      prefillStorage === "session" &&
      typeof window !== "undefined"
    ) {
      try {
        const raw = window.sessionStorage.getItem("inrcy_pending_mail_compose");
        if (raw) {
          const payload = JSON.parse(raw) as {
            to?: string[] | string;
            recipients?: unknown;
            createdAt?: number;
          };
          const ageMs = Date.now() - Number(payload?.createdAt || 0);
          const loaded = Array.isArray(payload?.to)
            ? payload.to.join(", ")
            : String(payload?.to || "");
          if (ageMs >= 0 && ageMs <= 10 * 60 * 1000) {
            if (loaded) toParam = loaded.trim();
            sessionRecipientHints = normalizeComposeRecipientHints(
              payload?.recipients,
            );
          }
        }
      } catch {
        // ignore invalid session payload
      } finally {
        try {
          window.sessionStorage.removeItem("inrcy_pending_mail_compose");
        } catch {}
      }
    }
    const subjParam = safeDecode(searchParams?.get("subject") || "");
    const textParam = safeDecode(searchParams?.get("text") || "");
    const nameParam = safeDecode(
      searchParams?.get("name") ||
        searchParams?.get("clientName") ||
        searchParams?.get("contactName") ||
        "",
    ).trim();
    const contactIdParam = safeDecode(
      searchParams?.get("contactId") || "",
    ).trim();
    const attachKey = safeDecode(searchParams?.get("attachKey") || "").trim();
    const attachName = safeDecode(searchParams?.get("attachName") || "").trim();

    // Determine composer type (optional).
    // If not provided explicitly, we infer it from the attachment path.
    const typeParam = (
      searchParams?.get("type") ||
      searchParams?.get("sendType") ||
      ""
    ).toLowerCase();
    const sourceDocSaveIdParam = safeDecode(
      searchParams?.get("docSaveId") ||
        searchParams?.get("sourceDocSaveId") ||
        "",
    ).trim();
    const sourceDocTypeParam = safeDecode(
      searchParams?.get("docType") || searchParams?.get("sourceDocType") || "",
    )
      .trim()
      .toLowerCase();
    const sourceDocNumberParam = safeDecode(
      searchParams?.get("docNumber") ||
        searchParams?.get("sourceDocNumber") ||
        "",
    ).trim();
    const templateKeyParam = safeDecode(
      searchParams?.get("template_key") || "",
    ).trim();
    let nextType: SendType = "mail";
    if (typeParam === "facture") nextType = "facture";
    else if (typeParam === "devis") nextType = "devis";
    else if (
      attachKey.includes("/factures/") ||
      attachKey.includes("/facture/")
    )
      nextType = "facture";
    else if (attachKey.includes("/devis/")) nextType = "devis";
    setComposeType(nextType);
    setComposeSourceDocSaveId(sourceDocSaveIdParam);
    setComposeSourceDocType(
      sourceDocTypeParam === "facture" || sourceDocTypeParam === "devis"
        ? (sourceDocTypeParam as "facture" | "devis")
        : "",
    );
    setComposeSourceDocNumber(
      sourceDocNumberParam ||
        (attachName || attachKey.split("/").pop() || "").replace(/\.pdf$/i, ""),
    );
    if (templateKeyParam) setComposeTemplateKey(templateKeyParam);

    if (toParam) setTo(toParam);
    if (subjParam) setSubject(normalizeMailSubject(subjParam));
    const htmlParam = safeDecode(
      searchParams?.get("html") || searchParams?.get("body_html") || "",
    );
    if (textParam || htmlParam)
      setComposeBody(textParam, htmlParam || undefined);

    const urlRecipientHints =
      !sessionRecipientHints.length && toParam && contactIdParam
        ? normalizeEmails(toParam).map((email, index) => ({
            email,
            contact_id: index === 0 ? contactIdParam : null,
            display_name: index === 0 ? nameParam || null : null,
          }))
        : [];
    setComposeRecipientHints(
      sessionRecipientHints.length ? sessionRecipientHints : urlRecipientHints,
    );

    // If the caller didn't provide a subject/body, we inject a friendly default template.
    // This keeps the connected tools consistent (CRM/Devis/Factures all go through iNr'SEND compose).
    const docRef = (attachName || attachKey.split("/").pop() || "").replace(
      /\.pdf$/i,
      "",
    );
    if (!subjParam?.trim()) {
      if (nextType === "facture")
        setSubject((prev) =>
          prev?.trim() ? prev : `Envoi de votre facture ${docRef || ""}`.trim(),
        );
      else if (nextType === "devis")
        setSubject((prev) =>
          prev?.trim() ? prev : `Envoi de votre devis ${docRef || ""}`.trim(),
        );
      else if (nameParam)
        setSubject((prev) =>
          prev?.trim() ? prev : `Message pour ${nameParam}`,
        );
    }
    if (!textParam?.trim() && !htmlParam?.trim()) {
      setText((prev) => {
        if (prev?.trim()) return prev;
        const fallback = buildDefaultMailText({
          kind: nextType,
          name: nameParam,
          docRef,
        });
        setHtml(textToRichMailHtml(fallback));
        return fallback;
      });
    }

    // Open the modal.
    setComposeOpen(true);

    // If we have an attachment key, reference the existing storage object directly.
    // This avoids re-uploading the binary through the mail send endpoint.
    const run = async () => {
      if (!attachKey) return;
      if (lastAttachKeyRef.current === attachKey) return;
      lastAttachKeyRef.current = attachKey;

      const inferredName =
        attachName || attachKey.split("/").pop() || "document.pdf";
      setComposeAttachments((prev) => {
        const already = prev.some(
          (f) => f.bucket === ATTACH_BUCKET && f.path === attachKey,
        );
        if (already) return prev;
        return [
          {
            bucket: ATTACH_BUCKET,
            path: attachKey,
            name: inferredName,
            type: "application/pdf",
            size: null,
          },
          ...prev,
        ];
      });

      setSubject((prev) => {
        if (prev?.trim()) return prev;
        if (nextType === "facture")
          return `Facture ${inferredName.replace(/\.pdf$/i, "")}`;
        if (nextType === "devis")
          return `Devis ${inferredName.replace(/\.pdf$/i, "")}`;
        return prev;
      });
    };

    void run();
  }, [searchParams, signatureEnabled, signaturePreview]);

  // Prefill compose modal from workflow modules (Booster / Propulser / Fidéliser).
  // Usage:
  // - /dashboard/mails?folder=propulsions&template_key=...&prefill_subject=...&prefill_text=...&compose=1
  // If template_key is provided, we render placeholders server-side from the user's profile/activity + connected tools.
  useEffect(() => {
    const preSubjectRaw = searchParams?.get("prefill_subject") || "";
    const preTextRaw = searchParams?.get("prefill_text") || "";
    const preHtmlRaw = searchParams?.get("prefill_html") || "";
    const preAttachmentsRaw = searchParams?.get("prefill_attachments") || "";
    const preAttachmentsKey =
      searchParams?.get("prefill_attachments_key") || "";
    const templateKey = searchParams?.get("template_key") || "";
    const open = (searchParams?.get("compose") || "").toLowerCase();
    if (templateKey) setComposeTemplateKey(templateKey);

    // Optional tracking intent (sent from Booster/Fidéliser modules)
    const trackKind = (searchParams?.get("track_kind") || "").toLowerCase();
    const trackType = searchParams?.get("track_type") || "";
    const trackPayloadRaw = searchParams?.get("track_payload") || "";

    if (
      (trackKind === "booster" ||
        trackKind === "propulser" ||
        trackKind === "fideliser") &&
      trackType
    ) {
      let payload: Record<string, any> = {};
      try {
        payload = trackPayloadRaw
          ? (JSON.parse(safeDecode(trackPayloadRaw)) as any)
          : {};
      } catch {
        payload = {};
      }
      setPendingTrack({ kind: trackKind as any, type: trackType, payload });

      // Remove tracking params from the URL to avoid double-counting if the user later sends another email.
      try {
        const q = new URLSearchParams(searchParams?.toString() || "");
        q.delete("track_kind");
        q.delete("track_type");
        q.delete("track_payload");
        router.replace(`/dashboard/mails?${q.toString()}`);
      } catch {
        // ignore
      }
    }

    // Only prefill when something is provided
    if (
      !preSubjectRaw &&
      !preTextRaw &&
      !preHtmlRaw &&
      !preAttachmentsRaw &&
      !preAttachmentsKey &&
      !templateKey
    )
      return;

    const preSubject = safeDecode(preSubjectRaw);
    const preText = safeDecode(preTextRaw);
    const preHtml = safeDecode(preHtmlRaw);
    const preAttachmentsFromStorage = readWorkflowMailPrefillAttachments(
      safeDecode(preAttachmentsKey),
    );
    const preAttachments = preAttachmentsFromStorage.length
      ? preAttachmentsFromStorage
      : normalizeCampaignAttachments(safeDecode(preAttachmentsRaw));

    const run = async () => {
      // If we have a template key, ask the server to render placeholders + compute links.
      if (templateKey) {
        try {
          const r = await fetch("/api/templates/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              template_key: templateKey,
              subject_override: preSubject,
              body_override: preText,
            }),
          });
          const j = await r.json().catch(() => ({}));
          if (j?.subject) setSubject(normalizeMailSubject(String(j.subject)));
          else if (preSubject) setSubject(normalizeMailSubject(preSubject));

          if (preHtml) {
            setComposeBody(preText || String(j?.body_text || ""), preHtml);
          } else if (j?.body_text) {
            const renderedBody = String(j.body_text);
            setComposeBody(renderedBody);
          } else if (preText) {
            setComposeBody(preText);
          }
        } catch {
          if (preSubject) setSubject(normalizeMailSubject(preSubject));
          if (preText || preHtml) {
            setComposeBody(preText, preHtml || undefined);
          }
        }
      } else {
        if (preSubject) setSubject(normalizeMailSubject(preSubject));
        if (preText || preHtml) {
          setComposeBody(preText, preHtml || undefined);
        }
      }

      setComposeType("mail");
      setFiles([]);
      setComposeAttachments(preAttachments);
      // Open compose by default (compose=1), but also open when not specified (better UX)
      if (open !== "0" && open !== "false") setComposeOpen(true);
    };

    run();
  }, [searchParams]);

  useEffect(() => {
    const editId = String(searchParams?.get("scheduled_edit_id") || "").trim();
    if (!editId || scheduledMailEditLoadRef.current === editId) return;
    scheduledMailEditLoadRef.current = editId;

    const run = async () => {
      try {
        const response = await fetch(`/api/agent/scheduled-actions/${editId}`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as {
          scheduledAction?: any;
          error?: string;
        } | null;
        if (!response.ok || !data?.scheduledAction) {
          throw new Error(data?.error || "Mail programmé introuvable.");
        }
        const action = data.scheduledAction;
        const payload = asScheduledRecord(action.payload);
        const campaign = asScheduledRecord(payload.campaign);
        const recipients = Array.isArray(campaign.recipients)
          ? campaign.recipients
          : Array.isArray(payload.recipients)
            ? payload.recipients
            : [];
        const recipientEmails = recipients
          .map((recipient: any) =>
            typeof recipient === "string"
              ? recipient
              : String(recipient?.email || ""),
          )
          .map((email: string) => email.trim())
          .filter(Boolean);
        const recipientHints = recipients
          .map((recipient: any) => {
            if (!recipient || typeof recipient === "string") return null;
            const email = String(recipient.email || "").trim();
            if (!email) return null;
            return {
              email,
              contact_id: recipient.contact_id || recipient.contactId || null,
              display_name:
                recipient.display_name || recipient.displayName || null,
            };
          })
          .filter(Boolean) as ComposeCrmRecipientHint[];

        const nextAccountId = String(
          campaign.accountId || payload.accountId || "",
        );
        const nextSubject = normalizeMailSubject(
          String(campaign.subject || payload.subject || action.title || "").trim() ||
            "(sans objet)",
        );
        const nextText = String(
          campaign.text || payload.campaignBody || payload.bodyText || "",
        );
        const nextHtml = normalizeRichMailHtmlForSend(
          nextText,
          String(campaign.html || payload.bodyHtml || payload.html || ""),
        );
        const nextAttachments = normalizeCampaignAttachments(
          campaign.attachments || payload.attachments,
        );
        const nextTemplateKey = String(
          campaign.templateKey || payload.templateKey || "",
        );
        const nextSourceDocSaveId = String(
          campaign.sourceDocSaveId || payload.sourceDocSaveId || "",
        );
        const nextSourceDocType =
          campaign.sourceDocType === "facture" || campaign.sourceDocType === "devis"
            ? campaign.sourceDocType
            : payload.sourceDocType === "facture" || payload.sourceDocType === "devis"
              ? payload.sourceDocType
              : "";
        const nextSourceDocNumber = String(
          campaign.sourceDocNumber || payload.sourceDocNumber || "",
        );

        setScheduledMailEdit({
          id: editId,
          scheduledAt: action.scheduledAt || null,
          title: String(action.title || "Mail programmé"),
          payload,
        });
        setDraftId(null);
        setComposeType("mail");
        setPendingTrack(null);
        setSelectedAccountId(nextAccountId);
        setTo(recipientEmails.join(", "));
        setSubject(nextSubject);
        setText(nextText);
        setHtml(nextHtml);
        setComposeAttachments(nextAttachments);
        setComposeRecipientHints(recipientHints);
        setComposeTemplateKey(nextTemplateKey);
        setComposeSourceDocSaveId(nextSourceDocSaveId);
        setComposeSourceDocType(nextSourceDocType);
        setComposeSourceDocNumber(nextSourceDocNumber);
        setFiles([]);
        setCrmPickerOpen(false);
        setLastSavedComposeSnapshot(
          makeComposeSnapshot({
            selectedAccountId: nextAccountId,
            to: recipientEmails.join(", "),
            subject: nextSubject,
            text: nextText,
            html: nextHtml,
            composeType: "mail",
            composeAttachments: nextAttachments,
            composeSourceDocSaveId: nextSourceDocSaveId,
            composeSourceDocType: nextSourceDocType,
            composeSourceDocNumber: nextSourceDocNumber,
            composeTemplateKey: nextTemplateKey,
            pendingTrack: null,
          }),
        );
        setComposeOpen(true);
        setToast("Mail programmé ouvert en réédition.");
        router.replace("/dashboard/mails?folder=mails", { scroll: false });
      } catch (error) {
        setToast(
          error instanceof Error
            ? error.message
            : "Ouverture du mail programmé impossible.",
        );
      }
    };

    void run();
  }, [searchParams]);

  useEffect(() => {
    if (!composeOpen) return;
    setText((prev) => {
      const base = String(prev || "");
      const next = base.trim()
        ? stripTemplateSignatureBlock(base)
        : buildDefaultMailText({ kind: composeType });
      setHtml((currentHtml) =>
        normalizeRichMailHtmlForSend(
          next,
          currentHtml || textToRichMailHtml(next),
        ),
      );
      return next;
    });
  }, [composeOpen, composeType, signatureEnabled, signaturePreview]);

  async function loadCrmContacts() {
    if (crmLoading) return;
    setCrmError(null);
    setCrmLoading(true);

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 12000);
    try {
      // We go through the API route so the same auth method is used as the CRM screens.
      const res = await fetch("/api/crm/contacts?all=1", {
        method: "GET",
        credentials: "include",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const json = (await res.json().catch(() => ({}))) as any;
      const rows = Array.isArray(json?.contacts) ? json.contacts : [];
      const mapped = rows.map((c: any) => {
        const left = [c.first_name, c.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        const company = (c.company_name || "").trim();
        const full =
          company && left ? `${company} — ${left}` : company || left || null;
        return {
          id: String(c.id),
          full_name: full,
          email: c.email || null,
          category: (c.category as any) ?? null,
          contact_type: (c.contact_type as any) ?? null,
          postal_code: c.postal_code || null,
          city: c.city || null,
          important: Boolean(c.important),
        };
      });
      setCrmContacts(mapped);
    } catch (e: any) {
      console.error("CRM load error", e);
      const msg =
        e?.name === "AbortError"
          ? "Le chargement a expiré. Veuillez réessayer."
          : "Impossible de charger les contacts.";
      setCrmError(msg);
    } finally {
      clearTimeout(timeout);
      setCrmLoading(false);
    }
  }

  // load CRM when compose opens (lazy)
  useEffect(() => {
    if (!composeOpen) return;
    if (crmContacts.length > 0) return;
    void loadCrmContacts();
  }, [composeOpen]);

  function updateFolder(next: Folder) {
    setFolder(next);
    // quand on change de dossier, on revient à la vue principale
    setBoxView("sent");
    router.replace(`/dashboard/mails?folder=${encodeURIComponent(next)}`);
    // reset selection to first item in that folder
    setSelectedId(null);
  }

  async function saveDraft() {
    if (attachBusy) {
      throw new Error(
        "Patientez : les pièces jointes sont encore en préparation.",
      );
    }
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    const draftFolder = getBulkCampaignFolder();
    const draftPayload = {
      user_id: userId,
      integration_id: selectedAccountId || null,
      type: composeType,
      status: "draft" as const,
      to_emails: to.trim(),
      subject: subject.trim() || null,
      body_text: text || null,
      body_html: normalizeRichMailHtmlForSend(text, html),
      provider: selectedAccount?.provider || null,
      source_doc_save_id: composeSourceDocSaveId || null,
      source_doc_type: composeSourceDocType || null,
      source_doc_number: composeSourceDocNumber || null,
      folder: draftFolder,
      track_kind: pendingTrack?.kind || null,
      track_type: pendingTrack?.type || null,
      template_key: composeTemplateKey || null,
      attachments: serializeComposeAttachments(),
    };

    const legacyPayload = {
      user_id: draftPayload.user_id,
      integration_id: draftPayload.integration_id,
      type: draftPayload.type,
      status: draftPayload.status,
      to_emails: draftPayload.to_emails,
      subject: draftPayload.subject,
      body_text: draftPayload.body_text,
      body_html: draftPayload.body_html,
      provider: draftPayload.provider,
      source_doc_save_id: draftPayload.source_doc_save_id,
      source_doc_type: draftPayload.source_doc_type,
      source_doc_number: draftPayload.source_doc_number,
    };

    const isMissingDraftMetadataColumn = (error: any) => {
      const msg = String(
        error?.message || error?.details || error?.hint || "",
      ).toLowerCase();
      return (
        error?.code === "PGRST204" ||
        msg.includes("folder") ||
        msg.includes("track_kind") ||
        msg.includes("track_type") ||
        msg.includes("template_key") ||
        msg.includes("attachments")
      );
    };

    if (draftId) {
      let usedLegacyFallback = false;
      let { error } = await supabase
        .from("send_items")
        .update(draftPayload as any)
        .eq("id", draftId);
      if (error && isMissingDraftMetadataColumn(error)) {
        ({ error } = await supabase
          .from("send_items")
          .update(legacyPayload)
          .eq("id", draftId));
        usedLegacyFallback = !error;
      }
      if (error) {
        setToast(
          getSimpleFrenchErrorMessage(
            error,
            "Impossible d’enregistrer le brouillon.",
          ),
        );
        return;
      }
      setToast(
        usedLegacyFallback
          ? "Brouillon enregistré, mais classement avancé indisponible : exécutez le SQL des brouillons iNrSend."
          : "Brouillon enregistré ✅",
      );
      setComposeSavedSnapshotFromCurrent();
      await loadHistory();
      return;
    }

    let usedLegacyFallback = false;
    let { data, error } = await supabase
      .from("send_items")
      .insert(draftPayload as any)
      .select("id")
      .single();
    if (error && isMissingDraftMetadataColumn(error)) {
      ({ data, error } = await supabase
        .from("send_items")
        .insert(legacyPayload)
        .select("id")
        .single());
      usedLegacyFallback = !error;
    }
    if (error) {
      setToast(
        getSimpleFrenchErrorMessage(
          error,
          "Impossible d’enregistrer le brouillon.",
        ),
      );
      return;
    }
    if (data?.id) {
      setDraftId(data.id);
      setToast(
        usedLegacyFallback
          ? "Brouillon enregistré, mais classement avancé indisponible : exécutez le SQL des brouillons iNrSend."
          : "Brouillon enregistré ✅",
      );
      setComposeSavedSnapshotFromCurrent();
      await loadHistory();
      if (!usedLegacyFallback && draftFolder !== folder)
        updateFolder(draftFolder);
    }
  }

  async function deleteDraftPermanently(id: string) {
    try {
      if (!id) return;
      if (deletingDraftId) return;

      const ok = await confirmInrcy({
        title: "Supprimer le brouillon ?",
        message: "Cette action supprimera définitivement ce brouillon.",
        confirmLabel: "Supprimer",
        variant: "danger",
      });
      if (!ok) return;

      setDeletingDraftId(id);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return;

      const { error } = await supabase
        .from("send_items")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "draft");

      if (error) {
        setToast(
          "Impossible de supprimer ce brouillon pour le moment. Merci de réessayer.",
        );
        return;
      }

      // Optimistic UI
      setItems((prev) => prev.filter((x) => x.id !== id));
      setSelectedHistoryKeys((prev) =>
        prev.filter((key) => key !== `send_items:${id}`),
      );
      if (selectedId === id) setSelectedId(null);
      if (detailsId === id) {
        setDetailsOpen(false);
        setDetailsId(null);
      }

      setToast("Brouillon supprimé.");
      // Reload to keep the list consistent
      await loadHistory();
    } finally {
      setDeletingDraftId(null);
    }
  }

  function toggleHistorySelection(item: OutboxItem) {
    if (!canBulkDeleteHistoryItem(item)) return;
    const key = historySelectionKey(item);
    setSelectedHistoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return Array.from(next);
    });
  }

  function toggleSelectVisibleHistoryItems(force?: boolean) {
    const shouldSelect =
      typeof force === "boolean" ? force : !allVisibleBulkItemsSelected;
    const pageKeys = visibleBulkDeletableItems.map((item) =>
      historySelectionKey(item),
    );
    setSelectedHistoryKeys((prev) => {
      const next = new Set(prev);
      if (shouldSelect) pageKeys.forEach((key) => next.add(key));
      else pageKeys.forEach((key) => next.delete(key));
      return Array.from(next);
    });
  }

  async function deleteSelectedHistoryEntries() {
    try {
      if (deletingHistorySelection || deletingHistoryItemId || deletingDraftId)
        return;
      if (selectedBulkCount <= 0) return;

      const label =
        selectedBulkCount > 1
          ? `${selectedBulkCount} éléments sélectionnés`
          : "cet élément sélectionné";
      const ok = await confirmInrcy({
        title: "Supprimer la sélection ?",
        message: `Cette action supprimera ${label} de l’historique.`,
        confirmLabel: "Supprimer",
        variant: "danger",
      });
      if (!ok) return;

      setDeletingHistorySelection(true);

      const entries = selectedBulkItems.map((item) => ({
        id: item.id,
        source: item.source,
        folder: item.folder,
      }));

      const response = await fetch("/api/inrsend/history/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: entries }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error || "Suppression impossible pour le moment.",
        );
      }

      const removedKeys = new Set(
        entries.map((entry) => `${entry.source}:${entry.id}`),
      );
      const selectedItemKey = selected ? historySelectionKey(selected) : null;
      const detailsItemKey = detailsItem
        ? historySelectionKey(detailsItem)
        : null;
      setItems((prev) =>
        prev.filter((item) => !removedKeys.has(historySelectionKey(item))),
      );
      setSelectedHistoryKeys([]);
      if (selectedItemKey && removedKeys.has(selectedItemKey)) {
        setSelectedId(null);
      }
      if (detailsItemKey && removedKeys.has(detailsItemKey)) {
        setDetailsOpen(false);
        setDetailsId(null);
      }

      const deletedCount =
        typeof payload?.deletedCount === "number"
          ? Math.max(0, Number(payload.deletedCount))
          : selectedBulkCount;
      setToast(
        deletedCount > 1
          ? `${deletedCount} éléments supprimés.`
          : "Élément supprimé.",
      );
      await loadHistory();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Suppression impossible pour le moment.";
      setToast(message);
    } finally {
      setDeletingHistorySelection(false);
    }
  }

  async function deleteHistoryEntry(item: OutboxItem) {
    try {
      if (!canDeleteHistoryItem(item)) return;
      if (deletingHistoryItemId || deletingHistorySelection) return;

      const isDraftToDelete =
        String(
          (item as any)?.status || (item as any)?.raw?.status || "",
        ).toLowerCase() === "draft";
      const ok = await confirmInrcy({
        title: isDraftToDelete
          ? "Supprimer le brouillon ?"
          : "Supprimer l’élément ?",
        message: isDraftToDelete
          ? "Ce brouillon sera définitivement supprimé."
          : `Cette action supprimera cet élément de l’historique ${folderLabel(item.folder)}.`,
        confirmLabel: "Supprimer",
        variant: "danger",
      });
      if (!ok) return;

      setDeletingHistoryItemId(item.id);

      const response = await fetch("/api/inrsend/history/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          source: item.source,
          folder: item.folder,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error || "Suppression impossible pour le moment.",
        );
      }

      const removedKey = historySelectionKey(item);
      setItems((prev) =>
        prev.filter((x) => !(x.id === item.id && x.source === item.source)),
      );
      setSelectedHistoryKeys((prev) =>
        prev.filter((key) => key !== removedKey),
      );
      if (selectedId === item.id) setSelectedId(null);
      if (detailsId === item.id) {
        setDetailsOpen(false);
        setDetailsId(null);
      }

      setToast(
        isDraftToDelete
          ? "Brouillon supprimé."
          : `Élément ${folderLabel(item.folder)} supprimé.`,
      );
      await loadHistory();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Suppression impossible pour le moment.";
      setToast(message);
    } finally {
      setDeletingHistoryItemId(null);
    }
  }

  function getBulkCampaignFolder(): Folder {
    if (composeType === "facture") return "factures";
    if (composeType === "devis") return "devis";
    if (pendingTrack?.kind && pendingTrack?.type) {
      return folderFromTrack(
        pendingTrack.kind,
        pendingTrack.type,
        isBusinessMailFolder(folder) ? folder : "mails",
      );
    }
    return isBusinessMailFolder(folder) ? folder : "mails";
  }

  async function scheduleMailWithAgent(scheduledAt: string) {
    if (attachBusy) {
      throw new Error(
        "Patientez : les pièces jointes sont encore en préparation.",
      );
    }
    const isWorkflowFinalizer =
      workflowFinalizerKind === "propulser" ||
      workflowFinalizerKind === "fideliser";
    if (!isWorkflowFinalizer && composeType !== "mail") {
      throw new Error(
        "La programmation est disponible pour les mails, les Propulsions et les Fidélisations.",
      );
    }
    if (!selectedAccount) {
      throw new Error(
        "Veuillez connecter une boîte d’envoi dans les réglages.",
      );
    }
    if (
      selectedAccount.connection_status === "needs_update" ||
      selectedAccount.requires_update
    ) {
      throw new Error(
        "Cette boîte d’envoi doit être actualisée avant de pouvoir programmer l’envoi.",
      );
    }

    const scheduledDate = new Date(String(scheduledAt || ""));
    if (
      !Number.isFinite(scheduledDate.getTime()) ||
      scheduledDate.getTime() <= Date.now() + 30_000
    ) {
      throw new Error("Choisissez une date et une heure dans le futur.");
    }

    const recipientsList = normalizeEmails(to);
    if (recipientsList.length === 0) {
      throw new Error("Veuillez ajouter au moins un destinataire.");
    }

    const trackedCampaign = pendingTrack;
    const campaignFolder =
      isWorkflowFinalizer && trackedCampaign?.kind && trackedCampaign?.type
        ? folderFromTrack(
            trackedCampaign.kind,
            trackedCampaign.type,
            isBusinessMailFolder(folder) ? folder : "mails",
          )
        : isWorkflowFinalizer
          ? getBulkCampaignFolder()
          : "mails";
    const templateKey =
      composeTemplateKey || searchParams?.get("template_key") || "";
    const cleanSubject = normalizeMailSubject(subject.trim() || "(sans objet)");
    const scheduleTargetTool = isWorkflowFinalizer
      ? workflowFinalizerKind
      : "mails";
    const scheduleActionType = isWorkflowFinalizer ? "campaign" : "mailing";
    const scheduleTypeLabel =
      workflowFinalizerKind === "propulser"
        ? "Propulsion"
        : workflowFinalizerKind === "fideliser"
          ? "Fidélisation"
          : "Mail";
    const campaignPayload = {
      accountId: selectedAccount.id,
      accountEmail: selectedAccount.email_address || "",
      accountProvider: selectedAccount.provider || "",
      type: composeType,
      folder: campaignFolder,
      trackKind: trackedCampaign?.kind || workflowFinalizerKind,
      trackType: trackedCampaign?.type || undefined,
      templateKey: templateKey || undefined,
      subject: cleanSubject,
      text: text || "",
      html: normalizeRichMailHtmlForSend(text, html),
      recipients: recipientsList.map((email) => {
        const lower = email.toLowerCase();
        const hint = composeRecipientHintsByEmail.get(lower);
        const crmContact = crmRecipientsByEmail.get(lower);
        return {
          email,
          contact_id: hint?.contact_id || crmContact?.contact_id || null,
          display_name: hint?.display_name || crmContact?.display_name || null,
        };
      }),
      attachments: serializeComposeAttachments(),
      sourceDocSaveId: composeSourceDocSaveId || undefined,
      sourceDocType: composeSourceDocType || undefined,
      sourceDocNumber: composeSourceDocNumber || undefined,
    };

    setScheduleBusy(true);
    try {
      if (scheduledMailEdit) {
        const saved = await patchScheduledMailEdit(
          buildScheduledMailEditPayload(scheduledDate.toISOString()) || {},
        );
        setScheduledMailEdit(saved);
        setLastSavedComposeSnapshot(makeComposeSnapshot());
        setToast("Mail programmé mis à jour.");
        return;
      }

      const response = await fetch("/api/agent/scheduled-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationKey: null,
          actionType: scheduleActionType,
          targetTool: scheduleTargetTool,
          source: "manual",
          title: `${scheduleTypeLabel} — ${cleanSubject}`,
          summary: `${recipientsList.length} destinataire${recipientsList.length > 1 ? "s" : ""} · ${selectedAccount.email_address || selectedAccount.provider || "boîte connectée"}`,
          scheduledAt: scheduledDate.toISOString(),
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris",
          channels: ["mails"],
          payload: {
            kind: "mail_campaign",
            origin: isWorkflowFinalizer
              ? "inrsend_workflow_finalizer"
              : "inrsend_mail",
            workflowFinalizerKind: isWorkflowFinalizer
              ? workflowFinalizerKind
              : null,
            campaign: campaignPayload,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.user_message ||
            data?.error ||
            "La campagne n’a pas pu être programmée pour le moment.",
        );
      }

      if (draftId) {
        await supabase
          .from("send_items")
          .delete()
          .eq("id", draftId)
          .eq("user_id", (await supabase.auth.getUser()).data?.user?.id || "")
          .eq("status", "draft");
      }
      setToast(
        isWorkflowFinalizer
          ? "Campagne programmée dans iNr’Agent."
          : "Mail programmé dans iNr’Agent.",
      );
      await loadHistory();
      updateFolder(campaignFolder);
    } finally {
      setScheduleBusy(false);
    }
  }

  async function doSend() {
    if (attachBusy) {
      setToast("Patientez : les pièces jointes sont encore en préparation.");
      return;
    }
    if (!selectedAccount) {
      setToast("Veuillez connecter une boîte d’envoi dans les réglages.");
      return;
    }
    if (
      selectedAccount.connection_status === "needs_update" ||
      selectedAccount.requires_update
    ) {
      setToast(
        "Cette boîte d’envoi doit être actualisée avant de pouvoir envoyer.",
      );
      return;
    }

    const recipientsList = normalizeEmails(to);
    if (recipientsList.length === 0) {
      setToast("Veuillez ajouter au moins un destinataire.");
      return;
    }
    if (attachBusy) {
      setToast("Veuillez patienter pendant le chargement des pièces jointes.");
      return;
    }

    const trackedCampaign = pendingTrack;
    const shouldSendAsCampaign =
      recipientsList.length > 1 || trackedCampaign !== null;

    if (recipientsList.length > 1 && composeType !== "mail") {
      setToast(
        "L’envoi individuel en masse est disponible uniquement pour les mails classiques.",
      );
      return;
    }

    if (recipientsList.length >= BULK_CONFIRM_WARNING_THRESHOLD) {
      const ok = await confirmInrcy({
        title: "Confirmer l’envoi en masse ?",
        message: bulkConfirmationMessage(recipientsList.length),
        confirmLabel: "Envoyer",
        variant: "warning",
      });
      if (!ok) return;
    }

    setSendBusy(true);
    try {
      if (shouldSendAsCampaign) {
        const campaignFolder =
          trackedCampaign?.kind && trackedCampaign?.type
            ? folderFromTrack(
                trackedCampaign.kind,
                trackedCampaign.type,
                isBusinessMailFolder(folder) ? folder : "mails",
              )
            : getBulkCampaignFolder();
        const templateKey =
          composeTemplateKey || searchParams?.get("template_key") || "";
        const campaignPayload = {
          accountId: selectedAccount.id,
          type: composeType,
          folder: campaignFolder,
          trackKind: trackedCampaign?.kind || undefined,
          trackType: trackedCampaign?.type || undefined,
          templateKey: templateKey || undefined,
          subject: normalizeMailSubject(subject.trim() || "(sans objet)"),
          text: text || "",
          html: normalizeRichMailHtmlForSend(text, html),
          recipients: recipientsList.map((email) => {
            const lower = email.toLowerCase();
            const hint = composeRecipientHintsByEmail.get(lower);
            const crmContact = crmRecipientsByEmail.get(lower);
            return {
              email,
              contact_id: hint?.contact_id || crmContact?.contact_id || null,
              display_name:
                hint?.display_name || crmContact?.display_name || null,
            };
          }),
          attachments: serializeComposeAttachments(),
          sourceDocSaveId: composeSourceDocSaveId || undefined,
          sourceDocType: composeSourceDocType || undefined,
          sourceDocNumber: composeSourceDocNumber || undefined,
        };

        const res = await fetch("/api/crm/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaignPayload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setToast(
            data?.error ||
              "La campagne mail n’a pas pu être lancée pour le moment.",
          );
          return;
        }

        if (draftId) {
          await supabase
            .from("send_items")
            .delete()
            .eq("id", draftId)
            .eq("user_id", (await supabase.auth.getUser()).data?.user?.id || "")
            .eq("status", "draft");
        }
        if (trackedCampaign) setPendingTrack(null);
        const queuedCount = Math.max(
          0,
          Number(data?.queued ?? recipientsList.length),
        );
        const blockedDuplicates = Math.max(
          0,
          Number(data?.blockedDuplicates ?? 0),
        );
        const ignoredInvalid = Math.max(0, Number(data?.ignoredInvalid ?? 0));
        const blockedOptOut = Math.max(0, Number(data?.blockedOptOut ?? 0));
        const blockedBlacklist = Math.max(
          0,
          Number(data?.blockedBlacklist ?? 0),
        );
        const blockedHardBounce = Math.max(
          0,
          Number(data?.blockedHardBounce ?? 0),
        );
        const blockedComplaint = Math.max(
          0,
          Number(data?.blockedComplaint ?? 0),
        );
        const extras: string[] = [];
        if (blockedDuplicates > 0)
          extras.push(
            `${blockedDuplicates} doublon${blockedDuplicates > 1 ? "s" : ""} bloqué${blockedDuplicates > 1 ? "s" : ""}`,
          );
        if (ignoredInvalid > 0)
          extras.push(
            `${ignoredInvalid} destinataire${ignoredInvalid > 1 ? "s" : ""} ignoré${ignoredInvalid > 1 ? "s" : ""}`,
          );
        if (blockedOptOut > 0)
          extras.push(
            `${blockedOptOut} désinscription${blockedOptOut > 1 ? "s" : ""}`,
          );
        if (blockedBlacklist > 0) extras.push(`${blockedBlacklist} blacklist`);
        if (blockedHardBounce > 0)
          extras.push(
            `${blockedHardBounce} rebond${blockedHardBounce > 1 ? "s" : ""} dur${blockedHardBounce > 1 ? "s" : ""}`,
          );
        if (blockedComplaint > 0)
          extras.push(
            `${blockedComplaint} plainte${blockedComplaint > 1 ? "s" : ""}`,
          );
        const deferredReason = String(data?.deferredReason || "").trim();
        const batchSize = Math.max(1, Number(data?.batchSize || 50));
        setToast(null);
        setCampaignDistributionNotice({
          queuedCount,
          batchSize,
          deferredReason,
          extras,
        });
        setComposeOpen(false);
        resetCompose();
        await loadHistory();
        updateFolder(campaignFolder);
        return;
      }

      const payload = {
        accountId: selectedAccount.id,
        to: recipientsList[0],
        subject: normalizeMailSubject(subject.trim() || "(sans objet)"),
        text: text || "",
        html: normalizeRichMailHtmlForSend(text, html),
        type: composeType,
        ...(draftId ? { sendItemId: draftId } : {}),
        attachments: serializeComposeAttachments(),
        sourceDocSaveId: composeSourceDocSaveId || undefined,
        sourceDocType: composeSourceDocType || undefined,
        sourceDocNumber: composeSourceDocNumber || undefined,
      };

      const res = await fetch(providerSendEndpoint(selectedAccount.provider), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(
          data?.user_message ||
            data?.error ||
            "Le message n’a pas pu être envoyé pour le moment.",
        );
        return;
      }

      setToast("Message envoyé.");
      setComposeOpen(false);
      resetCompose();
      await loadHistory();
      updateFolder(
        composeType === "facture"
          ? "factures"
          : composeType === "devis"
            ? "devis"
            : "mails",
      );
    } finally {
      setSendBusy(false);
    }
  }

  // Trash has been intentionally removed: the tool always shows the last sent items.

  function openDetails(it: OutboxItem) {
    setSelectedId(it.id);
    setDetailsId(it.id);
    setDetailsChannelKey(null);
    setDetailsEditMode(false);
    setDetailsActionBusy(false);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    setDetailsOpen(true);
  }

  function updatePublicationChannelAssets(
    channel: string,
    updater: (assets: PublicationImageAsset[]) => PublicationImageAsset[],
  ) {
    const normalizedChannel = normalizeChannelKey(channel);
    setPublicationEditImagesByChannel((prev) => ({
      ...prev,
      [normalizedChannel]: {
        assets: updater(prev[normalizedChannel]?.assets || []).slice(0, 5),
      },
    }));
  }

  function togglePublicationImage(channel: string, imageKey: string) {
    const normalizedChannel = normalizeChannelKey(channel);
    updatePublicationChannelAssets(normalizedChannel, (assets) => {
      if (normalizedChannel === "gmb") {
        const target = assets.find((asset) => asset.key === imageKey);
        if (!target) return assets;
        if (target.selected) {
          return assets.map((asset) =>
            asset.key === imageKey ? { ...asset, selected: false } : asset,
          );
        }
        return assets.map((asset) => ({
          ...asset,
          selected: asset.key === imageKey,
        }));
      }
      return assets.map((asset) =>
        asset.key === imageKey
          ? { ...asset, selected: !asset.selected }
          : asset,
      );
    });
  }

  function resetPublicationImage(channel: string, imageKey: string) {
    updatePublicationChannelAssets(channel, (assets) =>
      assets.map((asset) =>
        asset.key === imageKey
          ? {
              ...asset,
              transform: buildPublicationDefaultTransform(
                normalizeChannelKey(channel),
              ),
            }
          : asset,
      ),
    );
  }

  function movePublicationImage(
    channel: string,
    imageKey: string,
    direction: -1 | 1,
  ) {
    updatePublicationChannelAssets(channel, (assets) => {
      const selectedAssets = assets.filter((asset) => asset.selected);
      const selectedIndex = selectedAssets.findIndex(
        (asset) => asset.key === imageKey,
      );
      const targetSelected = selectedAssets[selectedIndex + direction];
      if (!targetSelected) return assets;
      const sourceIndex = assets.findIndex((asset) => asset.key === imageKey);
      const targetIndex = assets.findIndex(
        (asset) => asset.key === targetSelected.key,
      );
      if (sourceIndex < 0 || targetIndex < 0) return assets;
      const next = assets.slice();
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function openPublicationImageAdapter(channel: string, imageKey: string) {
    if (typeof document !== "undefined") {
      const detailsBody = document.querySelector<HTMLElement>(
        "[data-inrsend-details-body='true']",
      );
      publicationImageAdapterReturnScrollTopRef.current =
        detailsBody?.scrollTop ?? null;
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    setPublicationImageAdapterChannelKey(normalizeChannelKey(channel));
    setPublicationImageAdapterImageKey(imageKey);
    setDetailsActionError(null);
  }

  function closePublicationImageAdapter() {
    const scrollTopToRestore =
      publicationImageAdapterReturnScrollTopRef.current;
    setPublicationImageAdapterChannelKey(null);
    setPublicationImageAdapterImageKey(null);
    publicationImageAdapterDragRef.current = null;
    setIsPublicationImageAdapterDragging(false);

    if (typeof window !== "undefined" && scrollTopToRestore !== null) {
      window.requestAnimationFrame(() => {
        const detailsBody = document.querySelector<HTMLElement>(
          "[data-inrsend-details-body='true']",
        );
        if (detailsBody) detailsBody.scrollTop = scrollTopToRestore;
        publicationImageAdapterReturnScrollTopRef.current = null;
      });
    } else {
      publicationImageAdapterReturnScrollTopRef.current = null;
    }
  }

  function addPublicationPickedFiles(picked: File[]) {
    const channel = normalizeChannelKey(activeDetailsChannelEntry?.key || "");
    if (!channel) return;
    setDetailsActionError(null);
    if (!picked.length) return;

    const invalid = picked.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      setDetailsActionError(
        "Seules les images sont acceptées dans les pièces jointes d'une publication.",
      );
      return;
    }

    const unsupported = picked.find(isUnsupportedBrowserImageFile);
    if (unsupported) {
      setDetailsActionError(unsupportedBrowserImageMessage(unsupported));
      return;
    }

    const tooBig = picked.find((file) => file.size > BOOSTER_MAX_IMAGE_BYTES);
    if (tooBig) {
      setDetailsActionError(
        `L'image ${tooBig.name || "sélectionnée"} dépasse ${BOOSTER_MAX_IMAGE_MB_LABEL}.`,
      );
      return;
    }

    const currentSelectedFileBytes = (
      publicationEditImagesByChannel[channel]?.assets || []
    )
      .filter((asset) => asset.selected && asset.file)
      .reduce((sum, asset) => sum + (asset.file?.size || 0), 0);
    const nextPickedBytes = picked.reduce(
      (sum, file) => sum + (file?.size || 0),
      0,
    );
    if (currentSelectedFileBytes + nextPickedBytes > BOOSTER_MAX_MEDIA_BYTES) {
      setDetailsActionError(
        `Les images dépassent ${BOOSTER_MAX_MEDIA_MB_LABEL} au total. Réduisez le nombre ou le poids des photos.`,
      );
      return;
    }

    setPublicationEditVideoByChannel((prev) => {
      const videoChannel = normalizeBoosterChannelKeyForVideo(channel);
      const previousVideoState = prev[videoChannel];
      if (!previousVideoState) return prev;
      return {
        ...prev,
        [videoChannel]: {
          ...previousVideoState,
          file: null,
          previewUrl: "",
          sourceVideo: null,
          transformedVariants: [],
          removed: true,
          preparation: {
            status: "idle",
            label: "Images sélectionnées",
            detail: "La publication sera enregistrée en images.",
          },
        },
      };
    });

    updatePublicationChannelAssets(channel, (assets) => {
      const merged = [...assets];
      for (const file of picked) {
        const key = makePublicationImageAssetKey(
          "new",
          file.name,
          `${file.size}:${file.lastModified}`,
        );
        if (merged.some((asset) => asset.key === key)) continue;
        if (merged.length >= BOOSTER_MAX_IMAGE_COUNT) {
          setDetailsActionError(
            `Maximum ${BOOSTER_MAX_IMAGE_COUNT} images par publication.`,
          );
          break;
        }
        merged.push({
          key,
          name: file.name,
          type: file.type || "image/jpeg",
          previewUrl: URL.createObjectURL(file),
          sourceUrl: null,
          file,
          selected:
            channel === "gmb" ? !merged.some((asset) => asset.selected) : true,
          transform: buildPublicationDefaultTransform(channel),
        });
      }
      return merged;
    });
  }

  function addPublicationFiles(fileList: FileList | null) {
    if (!fileList) return;
    addPublicationPickedFiles(Array.from(fileList));
  }

  function addPublicationPhoto(file: File) {
    addPublicationPickedFiles([file]);
  }

  function getMediaLibraryDisplayName(item: MediaLibraryPickerItem) {
    return (
      item.title ||
      item.storage_path.split("/").pop() ||
      (item.media_type === "video" ? "video-inrcy.mp4" : "image-inrcy.jpg")
    );
  }

  async function mediaLibraryItemToFile(
    item: MediaLibraryPickerItem,
  ): Promise<File> {
    const sourceUrl = String(item.signed_url || "").trim();
    if (!sourceUrl) throw new Error("Média indisponible dans la Médiathèque.");
    const response = await fetch(sourceUrl);
    if (!response.ok)
      throw new Error(`Impossible de charger le média (${response.status}).`);
    const blob = await response.blob();
    const type =
      item.mime_type ||
      blob.type ||
      (item.media_type === "video" ? "video/mp4" : "image/jpeg");
    return new File([blob], getMediaLibraryDisplayName(item), {
      type,
      lastModified: Date.now(),
    });
  }

  function buildMediaLibraryVideoMetadata(
    item: MediaLibraryPickerItem,
    file: File,
  ): BoosterVideoSourceMetadata {
    const width = Number(item.width || 0) || null;
    const height = Number(item.height || 0) || null;
    const duration = Number(item.duration_seconds || 0) || null;
    const ratio = width && height ? width / height : null;
    const orientation =
      width && height
        ? width > height
          ? "horizontal"
          : width < height
            ? "vertical"
            : "square"
        : "unknown";
    return {
      width,
      height,
      duration,
      size: file.size || Number(item.size_bytes || 0) || 0,
      type: file.type || item.mime_type || "video/mp4",
      ratio,
      ratioLabel: width && height ? `${width}:${height}` : "Ratio inconnu",
      orientation,
      orientationLabel:
        orientation === "horizontal"
          ? "Horizontale"
          : orientation === "vertical"
            ? "Verticale"
            : orientation === "square"
              ? "Carrée"
              : "Orientation inconnue",
    };
  }

  async function addPublicationMediaLibraryItems(
    items: MediaLibraryPickerItem[],
  ) {
    const channel = normalizeChannelKey(activeDetailsChannelEntry?.key || "");
    if (!channel) return;
    const selectedItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!selectedItems.length) return;

    const videos = selectedItems.filter((item) => item.media_type === "video");
    const imageItems = selectedItems.filter(
      (item) => item.media_type === "image",
    );
    if (videos.length && imageItems.length) {
      const message =
        "Choisissez soit des images, soit une vidéo. Une publication ne mélange pas les deux médias.";
      setDetailsActionError(message);
      throw new Error(message);
    }
    if (videos.length > 1) {
      const message =
        "Une seule vidéo peut être utilisée pour une publication.";
      setDetailsActionError(message);
      throw new Error(message);
    }

    if (videos.length) {
      const item = videos[0];
      const file = await mediaLibraryItemToFile(item);
      if (file.size > BOOSTER_MAX_VIDEO_BYTES) {
        const message = `Vidéo trop lourde. Taille maximale : ${BOOSTER_MAX_VIDEO_MB_LABEL}.`;
        setDetailsActionError(message);
        throw new Error(message);
      }
      const previewUrl = URL.createObjectURL(file);
      const fallbackMeta = buildMediaLibraryVideoMetadata(item, file);
      const sourceMetadata =
        fallbackMeta.width || fallbackMeta.height
          ? fallbackMeta
          : await readPublicationVideoMetadata(file, previewUrl);
      const videoChannel = normalizeBoosterChannelKeyForVideo(channel);
      const defaultFormat = getRecommendedVideoFormatForSource(
        videoChannel,
        sourceMetadata,
      );
      setDetailsActionError(null);
      setPublicationEditVideoByChannel((prev) => ({
        ...prev,
        [videoChannel]: {
          file,
          previewUrl,
          name: file.name || getMediaLibraryDisplayName(item),
          type: file.type || item.mime_type || "video/mp4",
          size: file.size || Number(item.size_bytes || 0) || 0,
          duration:
            sourceMetadata.duration ||
            Number(item.duration_seconds || 0) ||
            null,
          sourceMetadata,
          sourceVideo: null,
          transformedVariants: [],
          format: defaultFormat,
          adaptationMode: prev[videoChannel]?.adaptationMode || "safe_blur",
          preparation: {
            status: "idle",
            label: "Vidéo ajoutée depuis la Médiathèque",
            detail: "Appliquez le format avant d’enregistrer.",
          },
          preparing: false,
          removed: false,
        },
      }));
      return;
    }

    if (imageItems.length) {
      const files = await Promise.all(
        imageItems.map((item) => mediaLibraryItemToFile(item)),
      );
      const invalid = files.find((file) => !file.type.startsWith("image/"));
      if (invalid) {
        const message = "Seules les images sont acceptées pour ce canal.";
        setDetailsActionError(message);
        throw new Error(message);
      }
      const tooBig = files.find((file) => file.size > BOOSTER_MAX_IMAGE_BYTES);
      if (tooBig) {
        const message = `L'image ${tooBig.name || "sélectionnée"} dépasse ${BOOSTER_MAX_IMAGE_MB_LABEL}.`;
        setDetailsActionError(message);
        throw new Error(message);
      }
      const currentSelectedFileBytes = (
        publicationEditImagesByChannel[channel]?.assets || []
      )
        .filter((asset) => asset.selected && asset.file)
        .reduce((sum, asset) => sum + (asset.file?.size || 0), 0);
      const nextPickedBytes = files.reduce(
        (sum, file) => sum + (file?.size || 0),
        0,
      );
      if (
        currentSelectedFileBytes + nextPickedBytes >
        BOOSTER_MAX_MEDIA_BYTES
      ) {
        const message = `Les images dépassent ${BOOSTER_MAX_MEDIA_MB_LABEL} au total. Réduisez le nombre ou le poids des photos.`;
        setDetailsActionError(message);
        throw new Error(message);
      }

      setPublicationEditVideoByChannel((prev) => {
        const videoChannel = normalizeBoosterChannelKeyForVideo(channel);
        const previousVideoState = prev[videoChannel];
        if (!previousVideoState) return prev;
        return {
          ...prev,
          [videoChannel]: {
            ...previousVideoState,
            file: null,
            previewUrl: "",
            sourceVideo: null,
            transformedVariants: [],
            removed: true,
            preparation: {
              status: "idle",
              label: "Images sélectionnées",
              detail: "La publication sera enregistrée en images.",
            },
          },
        };
      });

      updatePublicationChannelAssets(channel, (assets) => {
        const merged = [...assets];
        files.forEach((file, index) => {
          const item = imageItems[index];
          const key = makePublicationImageAssetKey(
            "library",
            file.name,
            item.id || `${item.storage_path}:${file.size}`,
          );
          if (merged.some((asset) => asset.key === key)) return;
          if (merged.length >= BOOSTER_MAX_IMAGE_COUNT) {
            setDetailsActionError(
              `Maximum ${BOOSTER_MAX_IMAGE_COUNT} images par publication.`,
            );
            return;
          }
          const imageMeta =
            item.width && item.height
              ? {
                  width: item.width,
                  height: item.height,
                  ratio: item.width / item.height,
                }
              : null;
          merged.push({
            key,
            name: file.name || getMediaLibraryDisplayName(item),
            type: file.type || item.mime_type || "image/jpeg",
            previewUrl: URL.createObjectURL(file),
            sourceUrl: null,
            originalUrl: item.signed_url || null,
            originalName: getMediaLibraryDisplayName(item),
            originalType: item.mime_type || file.type || "image/jpeg",
            file,
            selected:
              channel === "gmb"
                ? !merged.some((asset) => asset.selected)
                : true,
            transform: buildPublicationDefaultTransform(channel),
            imageMeta,
          });
        });
        return merged;
      });
      setDetailsActionError(null);
    }
  }

  async function addPublicationVideo(fileList: FileList | null) {
    const channel = normalizeBoosterChannelKeyForVideo(
      activeDetailsChannelEntry?.key || "",
    );
    if (!channel || !fileList?.length) return;
    const file = Array.from(fileList).find(
      (candidate) =>
        candidate.type.startsWith("video/") ||
        /\.(mp4|m4v|mov|webm)$/i.test(candidate.name || ""),
    );
    if (!file) {
      setDetailsActionError("Seuls les fichiers vidéo sont acceptés.");
      return;
    }
    if (file.size > BOOSTER_MAX_VIDEO_BYTES) {
      setDetailsActionError(
        `Vidéo trop lourde. Taille maximale : ${BOOSTER_MAX_VIDEO_MB_LABEL}.`,
      );
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const sourceMetadata = await readPublicationVideoMetadata(file, previewUrl);
    const defaultFormat = getRecommendedVideoFormatForSource(
      channel,
      sourceMetadata,
    );
    setDetailsActionError(null);
    setPublicationEditVideoByChannel((prev) => ({
      ...prev,
      [channel]: {
        file,
        previewUrl,
        name: file.name || "video-inrcy.mp4",
        type: file.type || "video/mp4",
        size: file.size || 0,
        duration: sourceMetadata.duration || null,
        sourceMetadata,
        sourceVideo: null,
        transformedVariants: [],
        format: defaultFormat,
        adaptationMode: prev[channel]?.adaptationMode || "safe_blur",
        preparation: {
          status: "idle",
          label: "Nouvelle vidéo ajoutée",
          detail: "Appliquez le format avant d’enregistrer.",
        },
        removed: false,
      },
    }));
  }

  function removePublicationVideo(channelValue?: string) {
    const channel = normalizeBoosterChannelKeyForVideo(
      channelValue || activeDetailsChannelEntry?.key || "",
    );
    if (!channel) return;
    setPublicationEditVideoByChannel((prev) => {
      const previousVideoState = prev[channel];
      return {
        ...prev,
        [channel]: {
          ...(previousVideoState || {
            file: null,
            previewUrl: "",
            name: "video-inrcy.mp4",
            type: "video/mp4",
            size: 0,
            duration: null,
            sourceMetadata: null,
            sourceVideo: null,
            transformedVariants: [],
            format: getRecommendedVideoFormatForSource(channel, null),
            adaptationMode: "safe_blur",
          }),
          file: null,
          previewUrl: "",
          sourceVideo: null,
          transformedVariants: [],
          removed: true,
          preparation: {
            status: "error",
            label: "Vidéo supprimée",
            detail: "Ajoutez une nouvelle vidéo avant d’enregistrer.",
          },
        },
      };
    });
  }

  function setPublicationVideoFormatForChannel(
    channelValue: string,
    format: VideoFormat,
  ) {
    const channel = normalizeBoosterChannelKeyForVideo(channelValue);
    setPublicationEditVideoByChannel((prev) => {
      const current = prev[channel];
      if (!current) return prev;
      return {
        ...prev,
        [channel]: {
          ...current,
          format,
          preparation:
            current.preparation?.status === "ready"
              ? {
                  status: "idle",
                  label: "Format modifié",
                  detail: "Appliquez ce format avant d’enregistrer.",
                }
              : current.preparation,
        },
      };
    });
  }

  function setPublicationVideoAdaptationModeForChannel(
    channelValue: string,
    mode: VideoAdaptationMode,
  ) {
    const channel = normalizeBoosterChannelKeyForVideo(channelValue);
    setPublicationEditVideoByChannel((prev) => {
      const current = prev[channel];
      if (!current) return prev;
      return {
        ...prev,
        [channel]: {
          ...current,
          adaptationMode: mode,
          preparation:
            current.preparation?.status === "ready"
              ? {
                  status: "idle",
                  label: "Adaptation modifiée",
                  detail: "Appliquez ce format avant d’enregistrer.",
                }
              : current.preparation,
        },
      };
    });
  }

  async function ensurePublicationEditVideoUploaded(
    channel: BoosterChannelKey,
    current: PublicationEditVideoState,
  ): Promise<VideoPayload> {
    if (!current.file && current.sourceVideo?.publicUrl)
      return current.sourceVideo;
    if (!current.file)
      throw new Error("Ajoutez une vidéo avant d’enregistrer.");
    const uploaded = await uploadBoosterVideo(current.file, {
      folder: "booster-videos",
      duration: current.duration,
      sourceMetadata: current.sourceMetadata,
    });
    setPublicationEditVideoByChannel((prev) => ({
      ...prev,
      [channel]: {
        ...(prev[channel] || current),
        sourceVideo: uploaded,
        previewUrl: uploaded.publicUrl || uploaded.url || current.previewUrl,
        transformedVariants: [],
        preparation: {
          status: "idle",
          label: "Vidéo ajoutée",
          detail: "Vous pouvez appliquer le format.",
        },
      },
    }));
    return uploaded;
  }

  async function applyPublicationVideoFormatForChannel(channelValue: string) {
    const channel = normalizeBoosterChannelKeyForVideo(channelValue);
    const current = publicationEditVideoByChannel[channel];
    if (!current || current.removed || !current.previewUrl) {
      setDetailsActionError("Ajoutez une vidéo avant d’appliquer le format.");
      return;
    }

    const format =
      current.format ||
      getRecommendedVideoFormatForSource(channel, current.sourceMetadata);
    const adaptationMode = current.adaptationMode || "safe_blur";
    const signature = buildVideoTransformSignature(format, adaptationMode);
    const existing = current.transformedVariants.find(
      (variant: any) =>
        variant.signature === signature || variant.channel === channel,
    );
    if (existing?.publicUrl || existing?.url) {
      setPublicationEditVideoByChannel((prev) => ({
        ...prev,
        [channel]: {
          ...current,
          previewUrl: existing.publicUrl || existing.url || current.previewUrl,
          preparation: {
            status: "ready",
            label: "Format appliqué",
            detail: `${getVideoFormatLabel(channel, format, current.sourceMetadata)} · ${VIDEO_ADAPTATION_MODE_LABELS[adaptationMode]}`,
          },
        },
      }));
      return;
    }

    setDetailsActionError(null);
    setPublicationEditVideoByChannel((prev) => ({
      ...prev,
      [channel]: {
        ...current,
        preparing: true,
        preparation: {
          status: "preparing",
          label: "Modification du format...",
          detail: `${getVideoFormatLabel(channel, format, current.sourceMetadata)} · ${VIDEO_ADAPTATION_MODE_LABELS[adaptationMode]}`,
        },
      },
    }));

    try {
      const base = await ensurePublicationEditVideoUploaded(channel, current);
      const response = await requestBoosterVideoTransforms({
        source: {
          storagePath: base.storagePath,
          publicUrl: base.publicUrl || base.url,
          url: base.url || base.publicUrl,
          name: base.name,
          type: base.type,
          size: base.size,
          duration: base.duration,
          sourceMetadata: base.sourceMetadata || current.sourceMetadata,
        },
        variants: [
          {
            key: `${channel}-${format}-${adaptationMode}`,
            channel,
            format,
            adaptationMode,
          },
        ],
      });
      const variants = [
        ...current.transformedVariants.filter(
          (variant: any) => variant.signature !== signature,
        ),
        ...(Array.isArray(response.variants) ? response.variants : []),
      ];
      const found = variants.find(
        (variant: any) =>
          variant.signature === signature || variant.channel === channel,
      );
      if (!found?.publicUrl && !found?.url) {
        setPublicationEditVideoByChannel((prev) => ({
          ...prev,
          [channel]: {
            ...(prev[channel] || current),
            sourceVideo: base,
            transformedVariants: variants,
            previewUrl: base.publicUrl || base.url || current.previewUrl,
            file: current.file,
            preparing: false,
            preparation: {
              status: "ready",
              label: "Vidéo originale conservée",
              detail:
                "Adaptation automatique indisponible : la vidéo originale sera utilisée.",
            },
          },
        }));
        setDetailsActionError(
          "Adaptation automatique indisponible : la vidéo originale sera utilisée.",
        );
        return;
      }
      setPublicationEditVideoByChannel((prev) => ({
        ...prev,
        [channel]: {
          ...(prev[channel] || current),
          sourceVideo: base,
          transformedVariants: variants,
          previewUrl: found.publicUrl || found.url || current.previewUrl,
          file: current.file,
          preparing: false,
          preparation: {
            status: "ready",
            label: "Format appliqué",
            detail: `${getVideoFormatLabel(channel, format, current.sourceMetadata)} · ${VIDEO_ADAPTATION_MODE_LABELS[adaptationMode]}`,
          },
        },
      }));
    } catch (error: any) {
      const fallbackDetail =
        "Adaptation automatique indisponible : la vidéo originale sera utilisée.";
      setDetailsActionError(fallbackDetail);
      setPublicationEditVideoByChannel((prev) => ({
        ...prev,
        [channel]: {
          ...(prev[channel] || current),
          preparing: false,
          preparation: {
            status: "ready",
            label: "Vidéo originale conservée",
            detail: fallbackDetail,
          },
        },
      }));
    }
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(reader.error ?? new Error("Impossible de lire ce fichier."));
      reader.readAsDataURL(file);
    });

  async function saveChannelPublication() {
    if (!detailsItem || detailsItem.source !== "app_events") return;
    const publicationId = String(
      (detailsPayload as any)?.publication_id || "",
    ).trim();
    const channel = String(activeDetailsChannelEntry?.key || "").trim();
    if (!publicationId || !channel) return;

    setDetailsActionBusy(true);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    try {
      const hashtags = publicationEditForm.hashtags
        .split(/[;,\n\s]+/)
        .map((tag) => tag.trim().replace(/^#+/, ""))
        .filter(Boolean);

      const normalizedChannel = normalizeChannelKey(channel);
      const editVideo = publicationEditVideoByChannel[normalizedChannel];
      const isVideoEdit = Boolean(
        editVideo && !editVideo.removed && editVideo.previewUrl,
      );
      let nextVideoPayload: any = null;
      let nextVideoSettings: any = null;

      if (isVideoEdit) {
        if (!editVideo || editVideo.removed || !editVideo.previewUrl) {
          throw new Error(
            "Ajoutez une vidéo avant d’enregistrer cette publication.",
          );
        }
        const boosterChannel = normalizeBoosterChannelKeyForVideo(channel);
        const baseVideo = await ensurePublicationEditVideoUploaded(
          boosterChannel,
          editVideo,
        );
        const format =
          editVideo.format ||
          getRecommendedVideoFormatForSource(
            boosterChannel,
            editVideo.sourceMetadata,
          );
        const adaptationMode = editVideo.adaptationMode || "safe_blur";
        const signature = buildVideoTransformSignature(format, adaptationMode);
        let transformedVariants = Array.isArray(editVideo.transformedVariants)
          ? [...editVideo.transformedVariants]
          : [];
        let finalVariant = transformedVariants.find(
          (variant: any) =>
            variant.signature === signature ||
            variant.channel === boosterChannel,
        );
        // Sécurité prod : l’enregistrement d’une publication ne doit pas lancer
        // une adaptation vidéo implicite. On utilise uniquement une variante déjà
        // générée via une action explicite du pro ; sinon on conserve l’original.
        if (!finalVariant?.publicUrl && !finalVariant?.url) {
          transformedVariants = transformedVariants.filter(
            (variant: any) => variant.signature !== signature,
          );
          finalVariant = undefined;
        }
        const finalVideo =
          finalVariant?.publicUrl || finalVariant?.url
            ? {
                ...baseVideo,
                ...finalVariant,
                name: finalVariant.name || baseVideo.name || editVideo.name,
                type:
                  finalVariant.contentType ||
                  finalVariant.type ||
                  baseVideo.type ||
                  editVideo.type,
                publicUrl: finalVariant.publicUrl || finalVariant.url,
                url: finalVariant.publicUrl || finalVariant.url,
                storagePath: finalVariant.storagePath || baseVideo.storagePath,
                sourceVideo: baseVideo,
                transformedVariants,
              }
            : {
                ...baseVideo,
                sourceVideo: baseVideo,
                transformedVariants,
              };
        nextVideoPayload = {
          ...finalVideo,
          videoSettings: { format, adaptationMode },
          sourceVideo: baseVideo,
          transformedVariants,
        };
        nextVideoSettings = { format, adaptationMode };
      }

      const channelImages =
        publicationEditImagesByChannel[normalizedChannel]?.assets || [];
      const selectedAssets = channelImages
        .filter((asset) => asset.selected)
        .slice(0, 5);
      const retainedImages: string[] = [];
      const newImages: Array<{ name: string; type: string; dataUrl: string }> =
        [];

      for (const asset of selectedAssets) {
        const transformChanged = asset.savedTransform
          ? !arePublicationTransformsEquivalent(
              asset.transform,
              asset.savedTransform,
            )
          : isPublicationTransformModified(asset.transform, channel);
        const canRetain = !!asset.sourceUrl && !asset.file && !transformChanged;
        if (canRetain) {
          retainedImages.push(String(asset.sourceUrl || ""));
          continue;
        }

        if (
          asset.file &&
          !isPublicationTransformModified(asset.transform, channel)
        ) {
          newImages.push({
            name: asset.name,
            type: asset.type,
            dataUrl: await fileToDataUrl(asset.file),
            originalName: asset.originalName || asset.name,
            originalType: asset.originalType || asset.type,
            transform: asset.transform,
            imageMeta:
              publicationImageAdapterImageMeta[asset.key] ||
              asset.imageMeta ||
              null,
          } as any);
          continue;
        }

        const renderedImage = await renderPublicationImageAsset({
          source: asset.file || asset.previewUrl,
          transform: asset.transform,
          channel,
          name: asset.name,
          type: asset.type,
        });
        newImages.push({
          ...renderedImage,
          originalUrl: asset.originalUrl || asset.previewUrl || null,
          originalName: asset.originalName || asset.name,
          originalType: asset.originalType || asset.type,
          transform: asset.transform,
          imageMeta:
            publicationImageAdapterImageMeta[asset.key] ||
            asset.imageMeta ||
            null,
        } as any);
      }

      const res = await fetch(
        `/api/inrsend/publications/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelApiPath(channel))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: publicationEditForm.title,
            content: publicationEditForm.content,
            cta: publicationEditForm.cta,
            ctaMode: publicationEditForm.ctaMode,
            ctaUrl: publicationEditForm.ctaUrl,
            ctaPhone: publicationEditForm.ctaPhone,
            hashtags,
            externalId:
              (activeDetailsChannelResult as any)?.external_id || null,
            mediaType: isVideoEdit ? "video" : "images",
            video: nextVideoPayload,
            videoSettings: nextVideoSettings,
            retainedImages: isVideoEdit ? [] : retainedImages,
            newImages: isVideoEdit ? [] : newImages,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Modification impossible.");
      setDetailsActionSuccess(
        `Publication ${formatChannelLabel(channel)} modifiée.`,
      );
      setDetailsEditMode(false);
      await loadHistory();
    } catch (e: any) {
      setDetailsActionError(
        getSimpleFrenchErrorMessage(
          e,
          "Impossible de modifier cette publication pour le moment.",
        ),
      );
    } finally {
      setDetailsActionBusy(false);
    }
  }

  async function deleteChannelPublication() {
    if (!detailsItem || detailsItem.source !== "app_events") return;
    const publicationId = String(
      (detailsPayload as any)?.publication_id || "",
    ).trim();
    const channel = String(activeDetailsChannelEntry?.key || "").trim();
    if (!publicationId || !channel) return;
    const label =
      activeDetailsChannelEntry?.label || formatChannelLabel(channel);
    const ok = await confirmInrcy({
      title: "Supprimer la publication ?",
      message: `Cette action supprimera la publication ${label}.`,
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;

    setDetailsActionBusy(true);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    try {
      const res = await fetch(
        `/api/inrsend/publications/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelApiPath(channel))}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalId:
              (activeDetailsChannelResult as any)?.external_id || null,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Suppression impossible.");
      setDetailsActionSuccess(`Publication ${label} supprimée.`);
      setDetailsEditMode(false);
      await loadHistory();
      setDetailsChannelKey(channel);
    } catch (e: any) {
      const baseMessage = getSimpleFrenchErrorMessage(
        e,
        "Impossible de supprimer cette publication pour le moment.",
      );
      setDetailsActionError(baseMessage);
    } finally {
      setDetailsActionBusy(false);
    }
  }

  async function retryCampaignFailedRecipients(campaignId: string) {
    if (!campaignId) return;
    setCampaignActionBusyId(campaignId);
    try {
      const res = await fetch(
        `/api/crm/campaigns/${encodeURIComponent(campaignId)}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.error || "Relance impossible pour le moment.");
        return;
      }
      const blocked = Math.max(0, Number(data?.blocked ?? 0));
      const deliveryState = String(data?.campaignStatus || "").toLowerCase();
      const deferredReason = String(data?.deferredReason || "").trim();
      const batchSize = Math.max(1, Number(data?.batchSize || 50));
      const baseRetryMessage = data?.retried
        ? `${data.retried} contact${data.retried > 1 ? "s" : ""} relancé${data.retried > 1 ? "s" : ""}.${blocked > 0 ? ` ${blocked} blocage${blocked > 1 ? "s" : ""} ignoré${blocked > 1 ? "s" : ""}.` : ""}`
        : "Échecs relancés.";
      const stateMessage =
        deliveryState === "paused"
          ? " Campagne mise en pause automatiquement."
          : deliveryState === "queued"
            ? " Campagne remise en file d’attente."
            : ` Relance par vagues de ${batchSize}.`;
      setToast(
        `${baseRetryMessage}${stateMessage}${deferredReason ? ` ${deferredReason}` : ""}`,
      );
      await loadHistory();
      if (detailsOpen && detailsId === campaignId) {
        await Promise.all([
          loadCampaignRecipients(campaignId, 1, campaignRecipientsFilter),
          loadCampaignHealth(campaignId, (detailsItem as any)?.raw || {}),
        ]);
      }
    } finally {
      setCampaignActionBusyId(null);
    }
  }

  async function openItem(it: OutboxItem) {
    setSelectedId(it.id);
    if (it.source === "send_items" && it.status === "draft") {
      // raw = SendItem
      const raw = (it.raw || {}) as any;
      if (openWorkflowCampaignDraft(it, raw)) return;
      setComposeOpen(true);
      setDraftId(it.id);
      const nextType = (
        raw.type === "facture" || raw.type === "devis" ? raw.type : "mail"
      ) as SendType;
      const nextTrack =
        raw.track_kind && raw.track_type
          ? ({
              kind: raw.track_kind,
              type: raw.track_type,
              payload: {},
            } as PendingTrack)
          : inferTrackFromCampaign(it);
      const nextAttachments = normalizeCampaignAttachments(raw.attachments);
      setComposeType(nextType);
      setComposeTemplateKey(String(raw.template_key || ""));
      setComposeSourceDocSaveId(String(raw.source_doc_save_id || ""));
      setComposeSourceDocType(
        raw.source_doc_type === "facture" || raw.source_doc_type === "devis"
          ? raw.source_doc_type
          : "",
      );
      setComposeSourceDocNumber(String(raw.source_doc_number || ""));
      setPendingTrack(nextTrack);
      setTo(raw.to_emails || "");
      setSubject(normalizeMailSubject(raw.subject || ""));
      setComposeBody(raw.body_text || "", raw.body_html || "");
      setComposeAttachments(nextAttachments);
      setFiles([]);
      setLastSavedComposeSnapshot(
        makeComposeSnapshot({
          selectedAccountId: String(
            raw.integration_id || selectedAccountId || "",
          ),
          to: String(raw.to_emails || ""),
          subject: normalizeMailSubject(raw.subject || ""),
          text: String(raw.body_text || ""),
          html: String(raw.body_html || ""),
          composeType: nextType,
          composeAttachments: nextAttachments,
          composeSourceDocSaveId: String(raw.source_doc_save_id || ""),
          composeSourceDocType:
            raw.source_doc_type === "facture" || raw.source_doc_type === "devis"
              ? raw.source_doc_type
              : "",
          composeSourceDocNumber: String(raw.source_doc_number || ""),
          composeTemplateKey: String(raw.template_key || ""),
          pendingTrack: nextTrack,
        }),
      );
    } else if (it.source === "app_events" && it.status === "draft") {
      const href =
        it.reopenHref ||
        `/dashboard?action=publish&draftId=${encodeURIComponent(String(it.id || ""))}`;
      setDetailsOpen(false);
      router.push(href);
    }
  }

  function resumeDraftFromDetails(item: OutboxItem) {
    setDetailsOpen(false);
    void openItem(item);
  }

  const handleWorkflowPrevious = useCallback(async () => {
    if (!workflowFinalizerKind || !workflowReturnAction) return;
    const nextKey =
      workflowReturnKey ||
      `${workflowFinalizerKind}_${workflowReturnAction}_${Date.now()}`;
    const trackType =
      pendingTrack?.type || String(searchParams?.get("track_type") || "");
    const trackPayload = (pendingTrack?.payload || {}) as Record<string, any>;
    saveWorkflowCampaignState(
      {
        kind: workflowFinalizerKind,
        action: workflowReturnAction,
        folder,
        trackKind: workflowFinalizerKind,
        trackType,
        templateKey:
          composeTemplateKey ||
          String(searchParams?.get("template_key") || "") ||
          null,
        templateCategory: trackPayload.template_category || null,
        subject,
        bodyText: text,
        bodyHtml: html || textToRichMailHtml(text),
        attachments: composeAttachments,
        draftId: draftId || null,
      },
      nextKey,
    );
    setComposeOpen(false);
    router.push(
      `/dashboard/${workflowFinalizerKind}?action=${encodeURIComponent(workflowReturnAction)}&restore_key=${encodeURIComponent(nextKey)}`,
    );
  }, [
    composeAttachments,
    composeTemplateKey,
    draftId,
    folder,
    html,
    pendingTrack,
    router,
    searchParams,
    subject,
    text,
    workflowFinalizerKind,
    workflowReturnAction,
    workflowReturnKey,
  ]);

  return (
    <div className={styles.page}>
      <PublishAiConfigurationDrawer
        open={aiConfigurationOpen}
        isMobile={isMobileHeader}
        drawerHeight="100dvh"
        onClose={() => setAiConfigurationOpen(false)}
      />
      <div className={styles.wrap}>
        <MailboxHeader
          helpOpen={helpOpen}
          settingsOpen={settingsOpen}
          onOpenHelp={() => setHelpOpen(true)}
          onCloseHelp={() => setHelpOpen(false)}
          onOpenFolders={() => setMobileFoldersOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onCloseSettings={() => {
            setSettingsOpen(false);
            void loadSignature(selectedAccountId || undefined);
          }}
        />

        <MobileFoldersMenu
          open={mobileFoldersOpen}
          folder={folder}
          counts={counts}
          countsLoading={!historyLoadedOnce}
          onClose={() => setMobileFoldersOpen(false)}
          onSelectFolder={updateFolder}
        />

        <div className={styles.grid}>
          <div className={`${styles.card} ${styles.listCard}`}>
            <FolderTabs
              folder={folder}
              counts={counts}
              countsLoading={!historyLoadedOnce}
              onSelectFolder={updateFolder}
            />

            <MailboxToolbar
              folder={folder}
              filterAccountId={filterAccountId}
              setFilterAccountId={setFilterAccountId}
              mailAccounts={mailAccounts}
              searchOpen={searchOpen}
              historyQuery={historyQuery}
              setSearchOpen={setSearchOpen}
              loadHistory={() => loadHistory()}
              toggleSelectVisibleHistoryItems={toggleSelectVisibleHistoryItems}
              visibleBulkDeletableItemsLength={visibleBulkDeletableItems.length}
              selectedBulkCount={selectedBulkCount}
              loading={loading}
              deletingHistorySelection={deletingHistorySelection}
              deletingDraftId={deletingDraftId}
              deletingHistoryItemId={deletingHistoryItemId}
              deleteSelectedHistoryEntries={deleteSelectedHistoryEntries}
              toolCfg={toolCfg}
              resetCompose={resetCompose}
              setComposeOpen={setComposeOpen}
              boxView={boxView}
              setBoxView={setBoxView}
              draftCount={currentFolderDraftCount}
            />

            <MailboxSearchPanel
              open={searchOpen}
              value={historyQuery}
              inputRef={historySearchRef}
              onChange={setHistoryQuery}
              onClose={() => setSearchOpen(false)}
              onClear={() => {
                setHistoryQuery("");
                requestAnimationFrame(() => historySearchRef.current?.focus());
              }}
            />

            <MailboxList
              folder={folder}
              boxView={boxView}
              loading={loading}
              visibleItems={visibleItems}
              selectedId={selectedId}
              selectedHistoryKeySet={selectedHistoryKeySet}
              deletingHistorySelection={deletingHistorySelection}
              deletingDraftId={deletingDraftId}
              deletingHistoryItemId={deletingHistoryItemId}
              openItem={openItem}
              openDetails={openDetails}
              toggleHistorySelection={toggleHistorySelection}
              mailAccounts={mailAccounts}
              itemMailAccountId={itemMailAccountId}
              filteredItemsLength={filteredItems.length}
              historyPage={historyPage}
              historyTotalCount={historyTotalCount}
              historyHasMorePotential={historyHasMorePotential}
              historyPageCount={historyPageCount}
              loadHistory={loadHistory}
              selectedBulkCount={selectedBulkCount}
              historyQuery={historyQuery}
            />
          </div>
        </div>

        <MailboxDetailsModal
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          detailsItem={detailsItem}
          detailsAccountLabel={detailsAccountLabel}
          detailsChannelKey={detailsChannelKey}
          setDetailsChannelKey={setDetailsChannelKey}
          detailsEditMode={detailsEditMode}
          setDetailsEditMode={setDetailsEditMode}
          detailsActionBusy={detailsActionBusy}
          detailsActionError={detailsActionError}
          detailsActionSuccess={detailsActionSuccess}
          setDetailsActionError={setDetailsActionError}
          setDetailsActionSuccess={setDetailsActionSuccess}
          detailsSourceDocPayload={detailsSourceDocPayload}
          deletingHistoryItemId={deletingHistoryItemId}
          deletingHistorySelection={deletingHistorySelection}
          campaignRecipients={campaignRecipients}
          campaignRecipientsLoading={campaignRecipientsLoading}
          campaignRecipientsPage={campaignRecipientsPage}
          setCampaignRecipientsPage={setCampaignRecipientsPage}
          campaignRecipientsPageCount={campaignRecipientsPageCount}
          campaignRecipientsTotal={campaignRecipientsTotal}
          campaignRecipientsFilter={campaignRecipientsFilter}
          setCampaignRecipientsFilter={setCampaignRecipientsFilter}
          campaignHealth={campaignHealth}
          campaignHealthLoading={campaignHealthLoading}
          campaignActionBusyId={campaignActionBusyId}
          publicationEditForm={publicationEditForm}
          setPublicationEditForm={setPublicationEditForm}
          publicationEditFileInputId={publicationEditFileInputId}
          activePublicationEditChannelKey={activePublicationEditChannelKey}
          activePublicationEditPreset={activePublicationEditPreset}
          activePublicationEditAssets={activePublicationEditAssets}
          publicationVideoInputId="publication-edit-video-input"
          activePublicationEditVideo={activePublicationEditVideo}
          addPublicationVideo={addPublicationVideo}
          removePublicationVideo={removePublicationVideo}
          setPublicationVideoFormatForChannel={
            setPublicationVideoFormatForChannel
          }
          setPublicationVideoAdaptationModeForChannel={
            setPublicationVideoAdaptationModeForChannel
          }
          applyPublicationVideoFormatForChannel={
            applyPublicationVideoFormatForChannel
          }
          togglePublicationImage={togglePublicationImage}
          openPublicationImageAdapter={openPublicationImageAdapter}
          resetPublicationImage={resetPublicationImage}
          movePublicationImage={movePublicationImage}
          addPublicationFiles={addPublicationFiles}
          addPublicationPhoto={addPublicationPhoto}
          addPublicationMediaLibraryItems={addPublicationMediaLibraryItems}
          saveChannelPublication={saveChannelPublication}
          deleteChannelPublication={deleteChannelPublication}
          retryCampaignFailedRecipients={retryCampaignFailedRecipients}
          openCampaignComposeFromHistory={openCampaignComposeFromHistory}
          deleteHistoryEntry={deleteHistoryEntry}
          loadCampaignRecipients={loadCampaignRecipients}
          loadCampaignHealth={loadCampaignHealth}
          refreshHistory={loadHistory}
          resumeDraft={resumeDraftFromDetails}
        />

        <MailboxPublicationImageAdapterModal
          open={detailsOpen}
          detailsEditMode={detailsEditMode}
          publicationImageAdapterAsset={publicationImageAdapterAsset}
          publicationImageAdapterChannelKey={publicationImageAdapterChannelKey}
          publicationImageAdapterStageRef={publicationImageAdapterStageRef}
          publicationImageAdapterStageSize={publicationImageAdapterStageSize}
          publicationImageAdapterImageMeta={publicationImageAdapterImageMeta}
          isPublicationImageAdapterDragging={isPublicationImageAdapterDragging}
          publicationEditImagesByChannel={publicationEditImagesByChannel}
          setPublicationImageAdapterImageKey={
            setPublicationImageAdapterImageKey
          }
          publicationImageAdapterDragRef={publicationImageAdapterDragRef}
          setIsPublicationImageAdapterDragging={
            setIsPublicationImageAdapterDragging
          }
          updatePublicationChannelAssets={updatePublicationChannelAssets}
          closePublicationImageAdapter={closePublicationImageAdapter}
        />

        <MailboxComposeModal
          open={composeOpen}
          onClose={() => {
            setComposeOpen(false);
            if (scheduledMailEdit) {
              setScheduledMailEdit(null);
              scheduledMailEditLoadRef.current = "";
            }
            if (workflowFinalizerKind)
              router.push(`/dashboard/${workflowFinalizerKind}`);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAiConfiguration={() => setAiConfigurationOpen(true)}
          draftId={draftId}
          currentComposeSnapshot={currentComposeSnapshot}
          lastSavedComposeSnapshot={lastSavedComposeSnapshot}
          mailAccounts={mailAccounts}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
          selectedAccount={selectedAccount}
          to={to}
          setTo={setTo}
          subject={subject}
          setSubject={setSubject}
          text={text}
          setText={setText}
          html={html}
          setHtml={setHtml}
          composeRecipientList={composeRecipientList}
          isBulkCampaignCompose={isBulkCampaignCompose}
          bulkCampaignNotice={bulkCampaignNotice}
          crmPickerOpen={crmPickerOpen}
          setCrmPickerOpen={setCrmPickerOpen}
          crmSearchOpen={crmSearchOpen}
          setCrmSearchOpen={setCrmSearchOpen}
          crmSearchRef={crmSearchRef}
          crmFilter={crmFilter}
          setCrmFilter={setCrmFilter}
          crmCategory={crmCategory}
          setCrmCategory={setCrmCategory}
          crmContactType={crmContactType}
          setCrmContactType={setCrmContactType}
          crmDepartment={crmDepartment}
          setCrmDepartment={(value) =>
            setCrmDepartment(
              sanitizeCrmDepartmentFilter(
                typeof value === "function" ? value(crmDepartment) : value,
              ),
            )
          }
          crmImportantOnly={crmImportantOnly}
          setCrmImportantOnly={setCrmImportantOnly}
          selectedCrmCount={selectedCrmCount}
          filteredContacts={filteredContacts}
          selectedToSet={selectedToSet}
          crmLoading={crmLoading}
          crmError={crmError}
          loadCrmContacts={loadCrmContacts}
          toggleEmailInTo={toggleEmailInTo}
          fileInputId={fileInputId}
          attachBusy={attachBusy}
          composeAttachments={composeAttachments}
          setComposeAttachments={setComposeAttachments}
          setFiles={setFiles}
          uploadComposeFiles={uploadComposeFiles}
          signatureEnabled={signatureEnabled}
          signaturePreview={signaturePreview}
          signatureImageUrl={signatureImageUrl}
          signatureImageWidth={signatureImageWidth}
          saveDraft={saveDraft}
          doSend={scheduledMailEdit ? sendScheduledMailEditNow : doSend}
          scheduledEditMode={Boolean(scheduledMailEdit)}
          scheduledEditSaving={scheduledMailEditSaving}
          scheduledEditScheduledAt={scheduledMailEdit?.scheduledAt || null}
          onSaveScheduledEdit={() => saveScheduledMailEdit()}
          scheduleWorkflowCampaign={
            composeType === "mail" || workflowFinalizerKind
              ? scheduleMailWithAgent
              : undefined
          }
          onScheduledSuccess={() => {
            setComposeOpen(false);
            if (scheduledMailEdit) {
              setScheduledMailEdit(null);
              scheduledMailEditLoadRef.current = "";
            } else {
              resetCompose();
            }
            if (workflowFinalizerKind)
              router.push(`/dashboard/${workflowFinalizerKind}`);
          }}
          sendBusy={sendBusy}
          scheduleBusy={scheduleBusy}
          toast={toast}
          setToast={setToast}
          workflowFinalizerKind={workflowFinalizerKind}
          onWorkflowPrevious={
            workflowFinalizerKind && workflowReturnAction
              ? handleWorkflowPrevious
              : undefined
          }
        />

        {campaignDistributionNotice ? (
          <div
            className={styles.campaignDistributionOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-distribution-title"
            onMouseDown={() => setCampaignDistributionNotice(null)}
          >
            <div
              className={styles.campaignDistributionCard}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div
                className={styles.campaignDistributionIcon}
                aria-hidden="true"
              >
                ✓
              </div>
              <h2
                id="campaign-distribution-title"
                className={styles.campaignDistributionTitle}
              >
                Campagne validée : en cours de distribution
              </h2>
              <p className={styles.campaignDistributionText}>
                {campaignDistributionNotice.queuedCount} email
                {campaignDistributionNotice.queuedCount > 1 ? "s" : ""} vont
                partir automatiquement par vagues de{" "}
                {campaignDistributionNotice.batchSize} maximum.
              </p>
              <p className={styles.campaignDistributionSubText}>
                Vous pouvez fermer cette fenêtre : le suivi reste disponible
                dans iNrSend.
              </p>
              {campaignDistributionNotice.deferredReason ? (
                <p className={styles.campaignDistributionNote}>
                  {campaignDistributionNotice.deferredReason}
                </p>
              ) : null}
              {campaignDistributionNotice.extras.length ? (
                <p className={styles.campaignDistributionNote}>
                  {campaignDistributionNotice.extras.join(" · ")}
                </p>
              ) : null}
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setCampaignDistributionNotice(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
