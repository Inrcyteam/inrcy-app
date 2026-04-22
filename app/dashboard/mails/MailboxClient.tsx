"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./mails.module.css";
import { createClient } from "@/lib/supabaseClient";
import { ChannelImageRetouchCardsPanel, ChannelImageRetouchModal } from "@/app/dashboard/_components/ChannelImageRetouchTool";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import MailboxHeader from "./_components/MailboxHeader";
import MobileFoldersMenu from "./_components/MobileFoldersMenu";
import FolderTabs from "./_components/FolderTabs";
import MailboxToolbar from "./_components/MailboxToolbar";
import MailboxList from "./_components/MailboxList";
import {
  ALL_FOLDERS,
  BULK_CONFIRM_STRONG_THRESHOLD,
  BULK_CONFIRM_WARNING_THRESHOLD,
  MAILBOX_PAGE_SIZE,
  MAILBOX_RECIPIENTS_PAGE_SIZE,
  MAIL_ACCOUNTS_UPDATED_EVENT,
  applyCampaignRecipientsFilter,
  applySignaturePreview,
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
  getPublicationDesign,
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
  type PublicationImageDesign,
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


const pillBtn: React.CSSProperties = {
  minHeight: 38,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: "0 14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const pillBtnActive: React.CSSProperties = {
  border: "1px solid rgba(76,195,255,0.45)",
  boxShadow: "0 0 0 1px rgba(76,195,255,0.18) inset",
  background: "rgba(76,195,255,0.10)",
};



export default function MailboxClient() {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [folder, setFolder] = useState<Folder>("mails");
  const [boxView, setBoxView] = useState<BoxView>("sent");
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageRef = useRef(1);
  const [historyHasMorePotential, setHistoryHasMorePotential] = useState(false);
  const [historyTotalCount, setHistoryTotalCount] = useState<number | null>(null);
  const [folderCounts, setFolderCounts] = useState<FolderCounts>(() => emptyFolderCounts());

  // Détails : ouverture en double-clic dans une fenêtre au-dessus (modal)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsChannelKey, setDetailsChannelKey] = useState<string | null>(null);
  const [detailsEditMode, setDetailsEditMode] = useState(false);
  const [detailsActionBusy, setDetailsActionBusy] = useState(false);
  const [detailsActionError, setDetailsActionError] = useState<string | null>(null);
  const [detailsActionSuccess, setDetailsActionSuccess] = useState<string | null>(null);
  const [detailsSourceDocPayload, setDetailsSourceDocPayload] = useState<any | null>(null);
  const [campaignRecipients, setCampaignRecipients] = useState<CampaignRecipientLog[]>([]);
  const [campaignRecipientsLoading, setCampaignRecipientsLoading] = useState(false);
  const [campaignRecipientsPage, setCampaignRecipientsPage] = useState(1);
  const [campaignRecipientsPageCount, setCampaignRecipientsPageCount] = useState(1);
  const [campaignRecipientsTotal, setCampaignRecipientsTotal] = useState(0);
  const [campaignRecipientsFilter, setCampaignRecipientsFilter] = useState<CampaignRecipientsFilterId>("all");
  const [campaignHealth, setCampaignHealth] = useState<CampaignHealthSummary | null>(null);
  const [campaignHealthLoading, setCampaignHealthLoading] = useState(false);
  const [campaignActionBusyId, setCampaignActionBusyId] = useState<string | null>(null);
  const [publicationEditForm, setPublicationEditForm] = useState<PublicationEditForm>({ title: "", content: "", cta: "", hashtags: "" });
  const [publicationEditImagesByChannel, setPublicationEditImagesByChannel] = useState<Record<string, PublicationChannelImagesState>>({});
  const [publicationRetouchChannelKey, setPublicationRetouchChannelKey] = useState<string | null>(null);
  const [publicationRetouchImageKey, setPublicationRetouchImageKey] = useState<string | null>(null);
  const publicationRetouchDragRef = useRef<{ channel: string; imageKey: string; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const publicationRetouchStageRef = useRef<HTMLDivElement | null>(null);
  const [publicationRetouchStageSize, setPublicationRetouchStageSize] = useState({ width: 0, height: 0 });
  const [publicationRetouchImageMeta, setPublicationRetouchImageMeta] = useState<Record<string, { width: number; height: number }>>({});
  const [isPublicationRetouchDragging, setIsPublicationRetouchDragging] = useState(false);

  const publicationRetouchChannelState = publicationRetouchChannelKey
    ? publicationEditImagesByChannel[publicationRetouchChannelKey] || { assets: [] }
    : null;
  const publicationRetouchAsset =
    publicationRetouchChannelState?.assets.find((asset) => asset.key === publicationRetouchImageKey) || null;

  useEffect(() => {
    historyPageRef.current = historyPage;
  }, [historyPage]);

  useEffect(() => {
    if (!detailsOpen || !detailsEditMode || !publicationRetouchAsset) return;
    const key = publicationRetouchAsset.key;
    if (publicationRetouchImageMeta[key]) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      setPublicationRetouchImageMeta((prev) => ({
        ...prev,
        [key]: {
          width: image.naturalWidth || image.width || 0,
          height: image.naturalHeight || image.height || 0,
        },
      }));
    };
    image.src = publicationRetouchAsset.previewUrl;
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, detailsEditMode, publicationRetouchAsset?.key, publicationRetouchAsset?.previewUrl, publicationRetouchImageMeta]);

  useEffect(() => {
    if (!detailsOpen || !detailsEditMode || !publicationRetouchAsset || !publicationRetouchStageRef.current) return;
    const node = publicationRetouchStageRef.current;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setPublicationRetouchStageSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [detailsOpen, detailsEditMode, publicationRetouchAsset?.key]);

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
  const [files, setFiles] = useState<File[]>([]);
  const [composeAttachments, setComposeAttachments] = useState<ComposeAttachmentRef[]>([]);
  const [composeRecipientHints, setComposeRecipientHints] = useState<ComposeCrmRecipientHint[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [composeSourceDocSaveId, setComposeSourceDocSaveId] = useState<string>("");
  const [composeSourceDocType, setComposeSourceDocType] = useState<"devis" | "facture" | "">("");
  const [composeSourceDocNumber, setComposeSourceDocNumber] = useState<string>("");
  const [sendBusy, setSendBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState("Cordialement,");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [signatureImageWidth, setSignatureImageWidth] = useState(400);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [deletingHistoryItemId, setDeletingHistoryItemId] = useState<string | null>(null);
  const [deletingHistorySelection, setDeletingHistorySelection] = useState(false);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<string[]>([]);


  // Attachments uploaded by Factures / Devis screens are stored here.
  const ATTACH_BUCKET = "inrbox_attachments";
  const lastAttachKeyRef = useRef<string>("");

  // Optional tracking intent passed by Booster / Fidéliser templates.
  // iNr'Send must only count items that are actually SENT.
  type PendingTrack = {
    kind: "booster" | "fideliser";
    type: string;
    payload: Record<string, any>;
  };
  const [pendingTrack, setPendingTrack] = useState<PendingTrack | null>(null);

  // CRM selection (compose)
  type CrmContact = {
    id: string;
    full_name: string | null;
    email: string | null;
    category: "particulier" | "professionnel" | "collectivite_publique" | null;
    contact_type: "client" | "prospect" | "fournisseur" | "partenaire" | "autre" | null;
    important: boolean;
  };

  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmFilter, setCrmFilter] = useState("");
  const [crmSearchOpen, setCrmSearchOpen] = useState(false);
  const crmSearchRef = useRef<HTMLInputElement | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmPickerOpen, setCrmPickerOpen] = useState(false);
  const [crmCategory, setCrmCategory] = useState<"all" | CrmContact["category"]>("all");
  const [crmContactType, setCrmContactType] = useState<"all" | CrmContact["contact_type"]>("all");
  const [crmImportantOnly, setCrmImportantOnly] = useState(false);

  // Used to trigger the hidden file input with a nice button
  const fileInputId = MAILBOX_FILE_INPUT_ID;
  const publicationEditFileInputId = PUBLICATION_EDIT_FILE_INPUT_ID;




  function toggleEmailInTo(email: string) {
    const list = normalizeEmails(to);
    const lower = email.toLowerCase();
    const exists = list.some((x) => x.toLowerCase() === lower);
    const next = exists ? list.filter((x) => x.toLowerCase() !== lower) : [...list, email];
    setTo(next.join(", "));
  }


  async function uploadComposeFiles(nextFiles: File[]) {
    if (!nextFiles.length) return [] as ComposeAttachmentRef[];
    setAttachBusy(true);
    try {
      const uploaded: ComposeAttachmentRef[] = [];
      for (const file of nextFiles) {
        const path = makeAttachmentPath(file.name || "piece-jointe");
        const { error } = await supabase.storage.from(ATTACH_BUCKET).upload(path, file, {
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
          size: file.size || null,
        });
      }
      return uploaded;
    } finally {
      setAttachBusy(false);
    }
  }


  // Recherche dans l'historique iNr'Send
  const [historyQuery, setHistoryQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const historySearchRef = useRef<HTMLInputElement | null>(null);

  const filteredContacts = useMemo(() => {
    const q = crmFilter.trim().toLowerCase();
    return crmContacts.filter((c) => {
      if (crmImportantOnly && !c.important) return false;
      if (crmCategory !== "all" && c.category !== crmCategory) return false;
      if (crmContactType !== "all" && c.contact_type !== crmContactType) return false;
      if (!q) return true;
      const hay = `${c.full_name || ""} ${c.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [crmContacts, crmFilter, crmImportantOnly, crmCategory, crmContactType]);

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

  function resetCompose(nextType: SendType = "mail") {
    setDraftId(null);
    setComposeType(nextType);
    setComposeSourceDocSaveId("");
    setComposeSourceDocType("");
    setComposeSourceDocNumber("");
    setTo("");
    setSubject("");
    const signature = signatureEnabled ? signaturePreview : "";
    setText(buildDefaultMailText({ kind: nextType, signature }));
    setFiles([]);
    setComposeAttachments([]);
    setComposeRecipientHints([]);
    setCrmPickerOpen(false);
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

    const connected = accounts.filter((a) => a.status === "connected");
    const defaultId = connected[0]?.id || accounts[0]?.id || "";
    const accountIds = new Set(accounts.map((a) => String(a?.id || "")).filter(Boolean));

    setSelectedAccountId((prev) => (prev && accountIds.has(prev) ? prev : defaultId));
    setFilterAccountId((prev) => (prev && accountIds.has(prev) ? prev : ""));
  }

  async function loadSignature() {
    try {
      const res = await fetch("/api/inrsend/signature", { cache: "no-store" });
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

  const loadHistory = useCallback(async (options?: { page?: number }) => {
    const targetPage = Math.max(1, options?.page ?? historyPageRef.current ?? 1);

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

      const response = await fetch(`/api/inrsend/history?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible de charger l’historique iNr’Send.");
      }

      const nextItems = Array.isArray(payload?.items) ? (payload.items as OutboxItem[]) : [];
      const nextTotal = typeof payload?.total === "number" ? Math.max(0, Number(payload.total)) : null;
      const nextPage = typeof payload?.page === "number" ? Math.max(1, Number(payload.page)) : targetPage;
      const nextCounts = normalizeFolderCounts(payload?.folderCounts);

      setItems(nextItems);
      setHistoryPage(nextPage);
      setHistoryHasMorePotential(Boolean(payload?.hasMore));
      setHistoryTotalCount(nextTotal);
      setFolderCounts(nextCounts);
      setSelectedHistoryKeys([]);
      setSelectedId((prev) => (nextItems.some((item) => item.id === prev) ? prev : nextItems[0]?.id ?? null));
    } catch (error) {
      console.error(error);
      setItems([]);
      setHistoryPage(targetPage);
      setHistoryHasMorePotential(false);
      setHistoryTotalCount(0);
      setFolderCounts(emptyFolderCounts());
      setSelectedHistoryKeys([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [boxView, filterAccountId, folder, historyQuery]);

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
  const selectedHistoryKeySet = useMemo(() => new Set(selectedHistoryKeys), [selectedHistoryKeys]);
  const selectedBulkItems = useMemo(
    () => visibleBulkDeletableItems.filter((item) => selectedHistoryKeySet.has(historySelectionKey(item))),
    [selectedHistoryKeySet, visibleBulkDeletableItems],
  );
  const selectedBulkCount = selectedBulkItems.length;
  const allVisibleBulkItemsSelected = useMemo(
    () =>
      visibleBulkDeletableItems.length > 0 &&
      visibleBulkDeletableItems.every((item) => selectedHistoryKeySet.has(historySelectionKey(item))),
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
    return (acc.display_name ? `${acc.display_name} — ` : "") + acc.email_address;
  }, [detailsItem, mailAccounts]);

  const detailsPayload = useMemo(() => {
    return detailsItem && detailsItem.source === "app_events" ? (((detailsItem as any)?.raw?.payload || null) as any) : null;
  }, [detailsItem]);

  const loadCampaignRecipients = useCallback(async (campaignId: string, targetPage = campaignRecipientsPage, targetFilter = campaignRecipientsFilter) => {
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
        .select("id,email,display_name,status,error,last_error,attempt_count,max_attempts,next_attempt_at,sent_at,updated_at,suppression_reason,bounce_type,bounced_at,unsubscribed_at,delivery_status,delivery_event,delivery_last_event_at,delivered_at", { count: "exact" })
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });
      query = applyCampaignRecipientsFilter(query, targetFilter);
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      const total = Math.max(0, Number(count || 0));
      setCampaignRecipients(((data || []) as any[]).map((row: any) => ({
        id: String(row.id || ""),
        email: String(row.email || ""),
        display_name: row.display_name || null,
        status: String(row.status || "queued"),
        error: row.error || null,
        last_error: row.last_error || null,
        attempt_count: row.attempt_count == null ? null : Number(row.attempt_count),
        max_attempts: row.max_attempts == null ? null : Number(row.max_attempts),
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
      })));
      setCampaignRecipientsTotal(total);
      setCampaignRecipientsPageCount(Math.max(1, Math.ceil(total / MAILBOX_RECIPIENTS_PAGE_SIZE)));
    } catch (error) {
      console.error(error);
      setCampaignRecipients([]);
      setCampaignRecipientsTotal(0);
      setCampaignRecipientsPageCount(1);
    } finally {
      setCampaignRecipientsLoading(false);
    }
  }, [campaignRecipientsFilter, campaignRecipientsPage, supabase]);


  const loadCampaignHealth = useCallback(async (campaignId: string, raw?: any) => {
    if (!campaignId) {
      setCampaignHealth(null);
      return;
    }

    const baseCounts = campaignCounts(raw || {});
    setCampaignHealthLoading(true);
    try {
      const countRecipients = async (filter: CampaignRecipientsFilterId | "__blocked__") => {
        let query: any = supabase
          .from("mail_campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId);
        if (filter === "__blocked__") {
          query = query.eq("status", "failed").not("suppression_reason", "is", null);
        } else {
          query = applyCampaignRecipientsFilter(query, filter);
        }
        const { count, error } = await query;
        if (error) throw error;
        return Math.max(0, Number(count || 0));
      };

      const [delivered, blocked, optOut, blacklist, complaint, hardBounce, softBounce] = await Promise.all([
        countRecipients("delivered"),
        countRecipients("__blocked__"),
        countRecipients("opt_out"),
        countRecipients("blacklist"),
        countRecipients("complaint"),
        countRecipients("hard_bounce"),
        countRecipients("soft_bounce"),
      ]);

      setCampaignHealth({
        ...baseCounts,
        delivered,
        blocked,
        opt_out: optOut,
        blacklist,
        complaint,
        hard_bounce: hardBounce,
        soft_bounce: softBounce,
        retryable: Math.max(0, baseCounts.failed - blocked),
      });
    } catch (error) {
      console.error(error);
      setCampaignHealth({
        ...baseCounts,
        delivered: 0,
        blocked: 0,
        opt_out: 0,
        blacklist: 0,
        complaint: 0,
        hard_bounce: 0,
        soft_bounce: 0,
        retryable: Math.max(0, baseCounts.failed),
      });
    } finally {
      setCampaignHealthLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "mail_campaigns") {
      setCampaignHealth(null);
      setCampaignHealthLoading(false);
      return;
    }
    void loadCampaignHealth(detailsItem.id, (detailsItem as any).raw || {});
  }, [detailsOpen, detailsItem, loadCampaignHealth]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "mail_campaigns") {
      setCampaignRecipients([]);
      setCampaignRecipientsLoading(false);
      setCampaignRecipientsTotal(0);
      setCampaignRecipientsPageCount(1);
      return;
    }
    void loadCampaignRecipients(detailsItem.id, campaignRecipientsPage, campaignRecipientsFilter);
  }, [campaignRecipientsFilter, campaignRecipientsPage, detailsOpen, detailsItem, loadCampaignRecipients]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "mail_campaigns") {
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
        setDetailsSourceDocPayload(error ? null : (data?.payload || null));
      }
    };

    void loadSourceDocPayload();
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, detailsItem, supabase]);

  const detailsChannelEntries = useMemo(() => {
    if (!detailsItem || detailsItem.source !== "app_events") return [] as ChannelPublication[];
    const payload = detailsPayload;
    const channelPublications = extractChannelPublications(payload);
    if (channelPublications.length) return channelPublications;
    const defaultParts = extractPublicationParts(payload);
    return orderChannelKeys((detailsItem.channels && detailsItem.channels.length ? detailsItem.channels : [detailsItem.target]).filter(Boolean).map((channel) => String(channel))).map((channel) => ({
      key: channel,
      label: formatChannelLabel(channel),
      parts: defaultParts,
    }));
  }, [detailsItem, detailsPayload]);

  const activeDetailsChannelEntry = useMemo(() => {
    if (!detailsChannelEntries.length) return null;
    return detailsChannelEntries.find((entry) => entry.key === detailsChannelKey) || detailsChannelEntries[0] || null;
  }, [detailsChannelEntries, detailsChannelKey]);

  const activeDetailsChannelResult = useMemo(() => {
    if (!detailsPayload || !activeDetailsChannelEntry) return null;
    const results = detailsPayload?.results && typeof detailsPayload.results === "object" ? detailsPayload.results : {};
    return (results as any)?.[activeDetailsChannelEntry.key] || null;
  }, [detailsPayload, activeDetailsChannelEntry]);

  const activePublicationEditChannelKey = normalizeChannelKey(activeDetailsChannelEntry?.key || "");
  const activePublicationEditPreset = useMemo(() => getPublicationChannelPreset(activePublicationEditChannelKey), [activePublicationEditChannelKey]);
  const activePublicationEditAssets = publicationEditImagesByChannel[activePublicationEditChannelKey]?.assets || [];

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "app_events") return;
    const parts = activeDetailsChannelEntry?.parts || {};
    setPublicationEditForm({
      title: parts.title || "",
      content: parts.content || "",
      cta: parts.cta || "",
      hashtags: tagsToEditorString(parts.hashtags),
    });
    setDetailsEditMode(false);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
  }, [detailsOpen, detailsItem, activeDetailsChannelEntry?.key]);

  useEffect(() => {
    if (!detailsOpen || !detailsItem || detailsItem.source !== "app_events") return;
    const nextState: Record<string, PublicationChannelImagesState> = {};
    for (const entry of detailsChannelEntries) {
      const channel = normalizeChannelKey(entry.key);
      const defaultTransform = buildPublicationDefaultTransform(channel);
      const assets = (Array.isArray(entry.parts.attachments) ? entry.parts.attachments : [])
        .filter((att) => att?.url && isImageAttachment(att))
        .map((att, index) => ({
          key: makePublicationImageAssetKey("existing", att.name || `image-${index + 1}`, `${index}:${String(att.url || "")}`),
          name: att.name || `Image ${index + 1}`,
          type: String(att.type || "image/jpeg") || "image/jpeg",
          previewUrl: String(att.url || ""),
          sourceUrl: String(att.url || "") || null,
          file: null,
          selected: true,
          transform: { ...defaultTransform },
        }));
      nextState[channel] = { assets };
    }
    setPublicationEditImagesByChannel(nextState);
    setPublicationRetouchChannelKey(null);
    setPublicationRetouchImageKey(null);
  }, [detailsOpen, detailsItem?.id, detailsChannelEntries]);

  const selectedAccount = useMemo(() => {
    return mailAccounts.find((a) => a.id === selectedAccountId) || null;
  }, [mailAccounts, selectedAccountId]);

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
        text: "Vérifie l’objet, la boîte d’envoi et le segment sélectionné avant de lancer la campagne.",
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

      // Booster
      case "publications":
        // Deep-link vers la modale Booster "Publier"
        return { label: "📣 Publier", href: "/dashboard/booster?action=publish" };
      case "recoltes":
        // Deep-link vers la modale Booster "Récolter" (bouton "Demander")
        return { label: "⭐ Récolter", href: "/dashboard/booster?action=reviews" };
      case "offres":
        // Deep-link vers la modale Booster "Offrir" (mail promo)
        return { label: "🏷️ Offrir", href: "/dashboard/booster?action=promo" };

      // Fidéliser
      case "informations":
        // Deep-link vers la modale Fidéliser "Informer"
        return { label: "📰 Informer", href: "/dashboard/fideliser?action=inform" };
      case "suivis":
        // Deep-link vers la modale Fidéliser "Suivre" (thanks)
        return { label: "🤝 Suivre", href: "/dashboard/fideliser?action=thanks" };
      case "enquetes":
        // Deep-link vers la modale Fidéliser "Enquêter" (satisfaction)
        return { label: "😊 Enquêter", href: "/dashboard/fideliser?action=satisfaction" };

      default:
        return { label: "Ouvrir l’outil", href: null as string | null };
    }
  }, [folder]);


  // initial
  useEffect(() => {
    void loadAccounts();
  }, []);

  // refresh des changements de filtres / recherche
  useEffect(() => {
    void loadHistory({ page: 1 });
  }, [loadHistory]);

  useEffect(() => {
    const handleMailAccountsUpdated = async () => {
      await loadAccounts();
      await loadHistory();
    };

    window.addEventListener(MAIL_ACCOUNTS_UPDATED_EVENT, handleMailAccountsUpdated as EventListener);
    return () => window.removeEventListener(MAIL_ACCOUNTS_UPDATED_EVENT, handleMailAccountsUpdated as EventListener);
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
      if (!(detail?.field === "docs_version" || detail?.field === "publications_version")) return;
      void loadHistory();
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
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
      recoltes: "recoltes",
      offres: "offres",
      informations: "informations",
      suivis: "suivis",
      enquetes: "enquetes",
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
    const prefillStorage = (searchParams?.get("prefillStorage") || "").toLowerCase();
    let sessionRecipientHints: ComposeCrmRecipientHint[] = [];
    if (!toParam && prefillStorage === "session" && typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem("inrcy_pending_mail_compose");
        if (raw) {
          const payload = JSON.parse(raw) as { to?: string[] | string; recipients?: unknown; createdAt?: number };
          const ageMs = Date.now() - Number(payload?.createdAt || 0);
          const loaded = Array.isArray(payload?.to) ? payload.to.join(", ") : String(payload?.to || "");
          if (ageMs >= 0 && ageMs <= 10 * 60 * 1000) {
            if (loaded) toParam = loaded.trim();
            sessionRecipientHints = normalizeComposeRecipientHints(payload?.recipients);
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
      searchParams?.get("name") || searchParams?.get("clientName") || searchParams?.get("contactName") || ""
    ).trim();
    const contactIdParam = safeDecode(searchParams?.get("contactId") || "").trim();
    const attachKey = safeDecode(searchParams?.get("attachKey") || "").trim();
    const attachName = safeDecode(searchParams?.get("attachName") || "").trim();

    // Determine composer type (optional).
    // If not provided explicitly, we infer it from the attachment path.
    const typeParam = (searchParams?.get("type") || searchParams?.get("sendType") || "").toLowerCase();
    const sourceDocSaveIdParam = safeDecode(searchParams?.get("docSaveId") || searchParams?.get("sourceDocSaveId") || "").trim();
    const sourceDocTypeParam = (safeDecode(searchParams?.get("docType") || searchParams?.get("sourceDocType") || "").trim().toLowerCase());
    const sourceDocNumberParam = safeDecode(searchParams?.get("docNumber") || searchParams?.get("sourceDocNumber") || "").trim();
    let nextType: SendType = "mail";
    if (typeParam === "facture") nextType = "facture";
    else if (typeParam === "devis") nextType = "devis";
    else if (attachKey.includes("/factures/") || attachKey.includes("/facture/")) nextType = "facture";
    else if (attachKey.includes("/devis/")) nextType = "devis";
    setComposeType(nextType);
    setComposeSourceDocSaveId(sourceDocSaveIdParam);
    setComposeSourceDocType(sourceDocTypeParam === "facture" || sourceDocTypeParam === "devis" ? (sourceDocTypeParam as "facture" | "devis") : "");
    setComposeSourceDocNumber(sourceDocNumberParam || (attachName || attachKey.split("/").pop() || "").replace(/\.pdf$/i, ""));

    if (toParam) setTo(toParam);
    if (subjParam) setSubject(subjParam);
    if (textParam) setText(applySignaturePreview(textParam, signatureEnabled ? signaturePreview : ""));

    const urlRecipientHints = !sessionRecipientHints.length && toParam && contactIdParam
      ? normalizeEmails(toParam).map((email, index) => ({
          email,
          contact_id: index === 0 ? contactIdParam : null,
          display_name: index === 0 ? (nameParam || null) : null,
        }))
      : [];
    setComposeRecipientHints(sessionRecipientHints.length ? sessionRecipientHints : urlRecipientHints);

    // If the caller didn't provide a subject/body, we inject a friendly default template.
    // This keeps the connected tools consistent (CRM/Devis/Factures all go through iNr'SEND compose).
    const docRef = (attachName || attachKey.split("/").pop() || "").replace(/\.pdf$/i, "");
    if (!subjParam?.trim()) {
      if (nextType === "facture") setSubject((prev) => (prev?.trim() ? prev : `Envoi de votre facture ${docRef || ""}`.trim()));
      else if (nextType === "devis") setSubject((prev) => (prev?.trim() ? prev : `Envoi de votre devis ${docRef || ""}`.trim()));
      else if (nameParam) setSubject((prev) => (prev?.trim() ? prev : `Message pour ${nameParam}`));
    }
    if (!textParam?.trim()) {
      setText((prev) => (prev?.trim() ? prev : buildDefaultMailText({ kind: nextType, name: nameParam, docRef, signature: signatureEnabled ? signaturePreview : "" })));
    }

    // Open the modal.
    setComposeOpen(true);

    // If we have an attachment key, reference the existing storage object directly.
    // This avoids re-uploading the binary through the mail send endpoint.
    const run = async () => {
      if (!attachKey) return;
      if (lastAttachKeyRef.current === attachKey) return;
      lastAttachKeyRef.current = attachKey;

      const inferredName = attachName || attachKey.split("/").pop() || "document.pdf";
      setComposeAttachments((prev) => {
        const already = prev.some((f) => f.bucket === ATTACH_BUCKET && f.path === attachKey);
        if (already) return prev;
        return [{ bucket: ATTACH_BUCKET, path: attachKey, name: inferredName, type: "application/pdf", size: null }, ...prev];
      });

      setSubject((prev) => {
        if (prev?.trim()) return prev;
        if (nextType === "facture") return `Facture ${inferredName.replace(/\.pdf$/i, "")}`;
        if (nextType === "devis") return `Devis ${inferredName.replace(/\.pdf$/i, "")}`;
        return prev;
      });
    };

    void run();
  }, [searchParams, signatureEnabled, signaturePreview]);

  // Prefill compose modal from template modules (Booster / Fidéliser).
  // Usage:
  // - /dashboard/mails?folder=offres&template_key=...&prefill_subject=...&prefill_text=...&compose=1
  // If template_key is provided, we render placeholders server-side from the user's profile/activity + connected tools.
  useEffect(() => {
    const preSubjectRaw = searchParams?.get("prefill_subject") || "";
    const preTextRaw = searchParams?.get("prefill_text") || "";
    const templateKey = searchParams?.get("template_key") || "";
    const open = (searchParams?.get("compose") || "").toLowerCase();

    // Optional tracking intent (sent from Booster/Fidéliser modules)
    const trackKind = (searchParams?.get("track_kind") || "").toLowerCase();
    const trackType = searchParams?.get("track_type") || "";
    const trackPayloadRaw = searchParams?.get("track_payload") || "";

    if ((trackKind === "booster" || trackKind === "fideliser") && trackType) {
      let payload: Record<string, any> = {};
      try {
        payload = trackPayloadRaw ? (JSON.parse(safeDecode(trackPayloadRaw)) as any) : {};
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
    if (!preSubjectRaw && !preTextRaw && !templateKey) return;

    const preSubject = safeDecode(preSubjectRaw);
    const preText = safeDecode(preTextRaw);

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
          if (j?.subject) setSubject(String(j.subject));
          else if (preSubject) setSubject(preSubject);

          if (j?.body_text) setText(applySignaturePreview(String(j.body_text), signatureEnabled ? signaturePreview : ""));
          else if (preText) setText(applySignaturePreview(preText, signatureEnabled ? signaturePreview : ""));
        } catch {
          if (preSubject) setSubject(preSubject);
          if (preText) setText(applySignaturePreview(preText, signatureEnabled ? signaturePreview : ""));
        }
      } else {
        if (preSubject) setSubject(preSubject);
        if (preText) setText(applySignaturePreview(preText, signatureEnabled ? signaturePreview : ""));
      }

      setComposeType("mail");
      // Open compose by default (compose=1), but also open when not specified (better UX)
      if (open !== "0" && open !== "false") setComposeOpen(true);
    };

    run();
  }, [searchParams]);

  useEffect(() => {
    if (!composeOpen) return;
    setText((prev) => {
      const base = String(prev || "");
      if (!base.trim()) {
        return buildDefaultMailText({ kind: composeType, signature: signatureEnabled ? signaturePreview : "" });
      }
      return signatureEnabled ? applySignaturePreview(base, signaturePreview) : base;
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
        const left = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
        const company = (c.company_name || "").trim();
        const full = company && left ? `${company} — ${left}` : company || left || null;
        return {
          id: String(c.id),
          full_name: full,
          email: c.email || null,
          category: (c.category as any) ?? null,
          contact_type: (c.contact_type as any) ?? null,
          important: Boolean(c.important),
        };
      });
      setCrmContacts(mapped);
    } catch (e: any) {
      console.error("CRM load error", e);
      const msg = e?.name === "AbortError" ? "Le chargement a expiré. Veuillez réessayer." : "Impossible de charger les contacts.";
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
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    const payload = {
      user_id: userId,
      integration_id: selectedAccountId || null,
      type: composeType,
      status: "draft" as const,
      to_emails: to.trim(),
      subject: subject.trim() || null,
      body_text: text || null,
      body_html: null,
      provider: selectedAccount?.provider || null,
      source_doc_save_id: composeSourceDocSaveId || null,
      source_doc_type: composeSourceDocType || null,
      source_doc_number: composeSourceDocNumber || null,
    };

    if (draftId) {
      const { error } = await supabase.from("send_items").update(payload).eq("id", draftId);
      if (!error) {
        setToast("Brouillon sauvegardé");
        await loadHistory();
      }
      return;
    }

    const { data, error } = await supabase.from("send_items").insert(payload).select("id").single();
    if (!error && data?.id) {
      setDraftId(data.id);
      setToast("Brouillon sauvegardé");
      await loadHistory();
    }
  }


async function deleteDraftPermanently(id: string) {
  try {
    if (!id) return;
    if (deletingDraftId) return;

    const ok = window.confirm("Supprimer ce brouillon définitivement ?");
    if (!ok) return;

    setDeletingDraftId(id);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    const { error } = await supabase
      .from("send_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setToast("Impossible de supprimer ce brouillon pour le moment. Merci de réessayer.");
      return;
    }

    // Optimistic UI
    setItems((prev) => prev.filter((x) => x.id !== id));
    setSelectedHistoryKeys((prev) => prev.filter((key) => key !== `send_items:${id}`));
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
    const shouldSelect = typeof force === "boolean" ? force : !allVisibleBulkItemsSelected;
    const pageKeys = visibleBulkDeletableItems.map((item) => historySelectionKey(item));
    setSelectedHistoryKeys((prev) => {
      const next = new Set(prev);
      if (shouldSelect) pageKeys.forEach((key) => next.add(key));
      else pageKeys.forEach((key) => next.delete(key));
      return Array.from(next);
    });
  }

  async function deleteSelectedHistoryEntries() {
    try {
      if (deletingHistorySelection || deletingHistoryItemId || deletingDraftId) return;
      if (selectedBulkCount <= 0) return;

      const label = selectedBulkCount > 1 ? `${selectedBulkCount} éléments sélectionnés` : "cet élément sélectionné";
      const ok = window.confirm(`Supprimer ${label} ?`);
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
        throw new Error(payload?.error || "Suppression impossible pour le moment.");
      }

      const removedKeys = new Set(entries.map((entry) => `${entry.source}:${entry.id}`));
      const selectedItemKey = selected ? historySelectionKey(selected) : null;
      const detailsItemKey = detailsItem ? historySelectionKey(detailsItem) : null;
      setItems((prev) => prev.filter((item) => !removedKeys.has(historySelectionKey(item))));
      setSelectedHistoryKeys([]);
      if (selectedItemKey && removedKeys.has(selectedItemKey)) {
        setSelectedId(null);
      }
      if (detailsItemKey && removedKeys.has(detailsItemKey)) {
        setDetailsOpen(false);
        setDetailsId(null);
      }

      const deletedCount = typeof payload?.deletedCount === "number" ? Math.max(0, Number(payload.deletedCount)) : selectedBulkCount;
      setToast(deletedCount > 1 ? `${deletedCount} éléments supprimés.` : "Élément supprimé.");
      await loadHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Suppression impossible pour le moment.";
      setToast(message);
    } finally {
      setDeletingHistorySelection(false);
    }
  }

  async function deleteHistoryEntry(item: OutboxItem) {
    try {
      if (!canDeleteHistoryItem(item)) return;
      if (deletingHistoryItemId || deletingHistorySelection) return;

      const ok = window.confirm(`Supprimer cet élément de l’historique ${folderLabel(item.folder)} ?`);
      if (!ok) return;

      setDeletingHistoryItemId(item.id);

      const response = await fetch("/api/inrsend/history/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, source: item.source, folder: item.folder }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Suppression impossible pour le moment.");
      }

      const removedKey = historySelectionKey(item);
      setItems((prev) => prev.filter((x) => !(x.id === item.id && x.source === item.source)));
      setSelectedHistoryKeys((prev) => prev.filter((key) => key !== removedKey));
      if (selectedId === item.id) setSelectedId(null);
      if (detailsId === item.id) {
        setDetailsOpen(false);
        setDetailsId(null);
      }

      setToast(`Élément ${folderLabel(item.folder)} supprimé.`);
      await loadHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Suppression impossible pour le moment.";
      setToast(message);
    } finally {
      setDeletingHistoryItemId(null);
    }
  }

  function getBulkCampaignFolder(): Folder {
    if (composeType === "facture") return "factures";
    if (composeType === "devis") return "devis";
    if (pendingTrack?.kind && pendingTrack?.type) {
      return folderFromTrack(pendingTrack.kind, pendingTrack.type, isBusinessMailFolder(folder) ? folder : "mails");
    }
    return isBusinessMailFolder(folder) ? folder : "mails";
  }

  async function doSend() {
    if (!selectedAccount) {
      setToast("Veuillez connecter une boîte d’envoi dans les réglages.");
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

    if (recipientsList.length > 1 && composeType !== "mail") {
      setToast("L’envoi individuel en masse est disponible uniquement pour les mails classiques.");
      return;
    }

    if (recipientsList.length >= BULK_CONFIRM_WARNING_THRESHOLD) {
      const ok = window.confirm(bulkConfirmationMessage(recipientsList.length));
      if (!ok) return;
    }

    setSendBusy(true);
    try {
      if (recipientsList.length > 1) {
        const campaignFolder = getBulkCampaignFolder();
        const templateKey = searchParams?.get("template_key") || "";
        const campaignPayload = {
          accountId: selectedAccount.id,
          type: composeType,
          folder: campaignFolder,
          trackKind: pendingTrack?.kind || undefined,
          trackType: pendingTrack?.type || undefined,
          templateKey: templateKey || undefined,
          subject: subject.trim() || "(sans objet)",
          text: text || "",
          html: "",
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
          attachments: composeAttachments,
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
          setToast(data?.error || "La campagne mail n’a pas pu être lancée pour le moment.");
          return;
        }

        if (pendingTrack) setPendingTrack(null);
        const queuedCount = Math.max(0, Number(data?.queued ?? recipientsList.length));
        const blockedDuplicates = Math.max(0, Number(data?.blockedDuplicates ?? 0));
        const ignoredInvalid = Math.max(0, Number(data?.ignoredInvalid ?? 0));
        const blockedOptOut = Math.max(0, Number(data?.blockedOptOut ?? 0));
        const blockedBlacklist = Math.max(0, Number(data?.blockedBlacklist ?? 0));
        const blockedHardBounce = Math.max(0, Number(data?.blockedHardBounce ?? 0));
        const blockedComplaint = Math.max(0, Number(data?.blockedComplaint ?? 0));
        const extras: string[] = [];
        if (blockedDuplicates > 0) extras.push(`${blockedDuplicates} doublon${blockedDuplicates > 1 ? "s" : ""} bloqué${blockedDuplicates > 1 ? "s" : ""}`);
        if (ignoredInvalid > 0) extras.push(`${ignoredInvalid} destinataire${ignoredInvalid > 1 ? "s" : ""} ignoré${ignoredInvalid > 1 ? "s" : ""}`);
        if (blockedOptOut > 0) extras.push(`${blockedOptOut} désinscription${blockedOptOut > 1 ? "s" : ""}`);
        if (blockedBlacklist > 0) extras.push(`${blockedBlacklist} blacklist`);
        if (blockedHardBounce > 0) extras.push(`${blockedHardBounce} rebond${blockedHardBounce > 1 ? "s" : ""} dur${blockedHardBounce > 1 ? "s" : ""}`);
        if (blockedComplaint > 0) extras.push(`${blockedComplaint} plainte${blockedComplaint > 1 ? "s" : ""}`);
        const deliveryState = String(data?.campaignStatus || "").toLowerCase();
        const deferredReason = String(data?.deferredReason || "").trim();
        const batchSize = Math.max(1, Number(data?.batchSize || 50));
        const baseMessage = deliveryState === "paused"
          ? `Campagne mise en pause : ${queuedCount} email${queuedCount > 1 ? "s" : ""} sont enregistrés et repartiront automatiquement.`
          : deliveryState === "queued"
            ? `Campagne mise en file d’attente : ${queuedCount} email${queuedCount > 1 ? "s" : ""} sont enregistrés.`
            : `Campagne lancée : ${queuedCount} email${queuedCount > 1 ? "s" : ""} vont partir individuellement par vagues de ${batchSize}.`;
        setToast(`${baseMessage}${deferredReason ? ` ${deferredReason}` : ""}${extras.length ? ` (${extras.join(", ")})` : ""}`);
        setComposeOpen(false);
        resetCompose();
        await loadHistory();
        updateFolder(campaignFolder);
        return;
      }

      const payload = {
        accountId: selectedAccount.id,
        to: recipientsList[0],
        subject: subject.trim() || "(sans objet)",
        text: text || "",
        html: "",
        type: composeType,
        ...(draftId ? { sendItemId: draftId } : {}),
        attachments: composeAttachments,
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
        setToast(data?.error || "Le message n’a pas pu être envoyé pour le moment.");
        return;
      }

      if (pendingTrack) {
        try {
          await fetch(`/api/${pendingTrack.kind}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: pendingTrack.type,
              payload: {
                ...(pendingTrack.payload || {}),
                integration_id: selectedAccount.id,
                to: recipientsList[0],
                subject: subject.trim() || "(sans objet)",
              },
            }),
          });
        } catch {
          // Tracking must never block sending
        } finally {
          setPendingTrack(null);
        }
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
            : "mails"
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

  function updatePublicationChannelAssets(channel: string, updater: (assets: PublicationImageAsset[]) => PublicationImageAsset[]) {
    const normalizedChannel = normalizeChannelKey(channel);
    setPublicationEditImagesByChannel((prev) => ({
      ...prev,
      [normalizedChannel]: {
        assets: updater(prev[normalizedChannel]?.assets || []).slice(0, 5),
      },
    }));
  }

  function togglePublicationImage(channel: string, imageKey: string) {
    updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === imageKey ? { ...asset, selected: !asset.selected } : asset));
  }

  function removePublicationImage(channel: string, imageKey: string) {
    updatePublicationChannelAssets(channel, (assets) => assets.filter((asset) => asset.key !== imageKey));
  }

  function openPublicationRetouch(channel: string, imageKey: string) {
    setPublicationRetouchChannelKey(normalizeChannelKey(channel));
    setPublicationRetouchImageKey(imageKey);
    setDetailsActionError(null);
  }

  function closePublicationRetouch() {
    setPublicationRetouchChannelKey(null);
    setPublicationRetouchImageKey(null);
    publicationRetouchDragRef.current = null;
  }

  function addPublicationFiles(fileList: FileList | null) {
    if (!fileList) return;
    const channel = normalizeChannelKey(activeDetailsChannelEntry?.key || "");
    if (!channel) return;
    setDetailsActionError(null);
    const picked = Array.from(fileList);
    if (!picked.length) return;

    const invalid = picked.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      setDetailsActionError("Seules les images sont acceptées dans les pièces jointes d'une publication.");
      return;
    }

    const tooBig = picked.find((file) => file.size > 8 * 1024 * 1024);
    if (tooBig) {
      setDetailsActionError("Une image dépasse 8 Mo.");
      return;
    }

    updatePublicationChannelAssets(channel, (assets) => {
      const merged = [...assets];
      for (const file of picked) {
        const key = makePublicationImageAssetKey("new", file.name, `${file.size}:${file.lastModified}`);
        if (merged.some((asset) => asset.key === key)) continue;
        if (merged.length >= 5) {
          setDetailsActionError("Maximum 5 images par publication.");
          break;
        }
        merged.push({
          key,
          name: file.name,
          type: file.type || "image/jpeg",
          previewUrl: URL.createObjectURL(file),
          sourceUrl: null,
          file,
          selected: true,
          transform: buildPublicationDefaultTransform(channel),
        });
      }
      return merged;
    });
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error("Impossible de lire ce fichier."));
      reader.readAsDataURL(file);
    });

  async function saveChannelPublication() {
    if (!detailsItem || detailsItem.source !== "app_events") return;
    const publicationId = String((detailsPayload as any)?.publication_id || "").trim();
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

      const channelImages = publicationEditImagesByChannel[normalizeChannelKey(channel)]?.assets || [];
      const selectedAssets = channelImages.filter((asset) => asset.selected).slice(0, 5);
      const retainedImages: string[] = [];
      const newImages: Array<{ name: string; type: string; dataUrl: string }> = [];

      for (const asset of selectedAssets) {
        const canRetain = !!asset.sourceUrl && !asset.file && !isPublicationTransformModified(asset.transform, channel);
        if (canRetain) {
          retainedImages.push(String(asset.sourceUrl || ""));
          continue;
        }

        if (asset.file && !isPublicationTransformModified(asset.transform, channel)) {
          newImages.push({
            name: asset.name,
            type: asset.type,
            dataUrl: await fileToDataUrl(asset.file),
          });
          continue;
        }

        newImages.push(await renderPublicationImageAsset({
          source: asset.file || asset.previewUrl,
          transform: asset.transform,
          channel,
          name: asset.name,
          type: asset.type,
        }));
      }

      const res = await fetch(`/api/inrsend/publications/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelApiPath(channel))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: publicationEditForm.title,
          content: publicationEditForm.content,
          cta: publicationEditForm.cta,
          hashtags,
          externalId: (activeDetailsChannelResult as any)?.external_id || null,
          retainedImages,
          newImages,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Modification impossible.");
      setDetailsActionSuccess(`Publication ${formatChannelLabel(channel)} modifiée.`);
      setDetailsEditMode(false);
      await loadHistory();
    } catch (e: any) {
      setDetailsActionError(getSimpleFrenchErrorMessage(e, "Impossible de modifier cette publication pour le moment."));
    } finally {
      setDetailsActionBusy(false);
    }
  }

  async function deleteChannelPublication() {
    if (!detailsItem || detailsItem.source !== "app_events") return;
    const publicationId = String((detailsPayload as any)?.publication_id || "").trim();
    const channel = String(activeDetailsChannelEntry?.key || "").trim();
    if (!publicationId || !channel) return;
    const label = activeDetailsChannelEntry?.label || formatChannelLabel(channel);
    if (!window.confirm(`Supprimer la publication ${label} ?`)) return;

    setDetailsActionBusy(true);
    setDetailsActionError(null);
    setDetailsActionSuccess(null);
    try {
      const res = await fetch(`/api/inrsend/publications/${encodeURIComponent(publicationId)}/${encodeURIComponent(channelApiPath(channel))}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: (activeDetailsChannelResult as any)?.external_id || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Suppression impossible.");
      setDetailsActionSuccess(`Publication ${label} supprimée.`);
      setDetailsEditMode(false);
      await loadHistory();
      setDetailsChannelKey(channel);
    } catch (e: any) {
      const baseMessage = getSimpleFrenchErrorMessage(e, "Impossible de supprimer cette publication pour le moment.");
      setDetailsActionError(baseMessage);
    } finally {
      setDetailsActionBusy(false);
    }
  }

  async function retryCampaignFailedRecipients(campaignId: string) {
    if (!campaignId) return;
    setCampaignActionBusyId(campaignId);
    try {
      const res = await fetch(`/api/crm/campaigns/${encodeURIComponent(campaignId)}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
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
      const stateMessage = deliveryState === "paused"
        ? " Campagne mise en pause automatiquement."
        : deliveryState === "queued"
          ? " Campagne remise en file d’attente."
          : ` Relance par vagues de ${batchSize}.`;
      setToast(`${baseRetryMessage}${stateMessage}${deferredReason ? ` ${deferredReason}` : ""}`);
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
      setComposeOpen(true);
      setDraftId(it.id);
      // raw = SendItem
      const raw = (it.raw || {}) as any;
      setComposeType(raw.type as SendType);
      setTo(raw.to_emails || "");
      setSubject(raw.subject || "");
      setText(raw.body_text || "");
      setFiles([]);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <MailboxHeader
          helpOpen={helpOpen}
          settingsOpen={settingsOpen}
          onOpenHelp={() => setHelpOpen(true)}
          onCloseHelp={() => setHelpOpen(false)}
          onOpenFolders={() => setMobileFoldersOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onCloseSettings={() => setSettingsOpen(false)}
        />

        <MobileFoldersMenu
          open={mobileFoldersOpen}
          folder={folder}
          counts={counts}
          onClose={() => setMobileFoldersOpen(false)}
          onSelectFolder={updateFolder}
        />

        <div className={styles.grid}>
          <div className={`${styles.card} ${styles.listCard}`}>
            <FolderTabs folder={folder} counts={counts} onSelectFolder={updateFolder} />

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
            />

            {searchOpen ? (
              <div className={styles.searchPanel}>
                <div className={styles.searchPanelInner}>
                  <input
                    ref={historySearchRef}
                    className={styles.searchInputInline}
                    placeholder="Rechercher un envoi…"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                  />
                  {historyQuery.trim() ? (
                    <button
                      className={styles.searchClearBtn}
                      type="button"
                      onClick={() => {
                        setHistoryQuery("");
                        requestAnimationFrame(() => historySearchRef.current?.focus());
                      }}
                      title="Effacer"
                      aria-label="Effacer"
                    >
                      ×
                    </button>
                  ) : null}
                  <button
                    className={styles.searchCloseBtn}
                    type="button"
                    onClick={() => setSearchOpen(false)}
                    title="Fermer"
                    aria-label="Fermer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : null}

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

        {/* Details modal (double-clic sur un message) */}
        {detailsOpen ? (
          <div className={styles.modalOverlay} onClick={() => setDetailsOpen(false)}>
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
                  <button className={styles.btnGhost} onClick={() => setDetailsOpen(false)} type="button">
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
                      : orderChannelKeys((detailsItem.channels && detailsItem.channels.length ? detailsItem.channels : [detailsItem.target]).filter(Boolean).map((channel) => String(channel))).map((channel) => ({
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
                  const attachmentCandidates = detailsItem.source === "send_items"
                    ? [...(detailsItem.attachments || []), ...sourceDocAttachments]
                    : detailsItem.source === "app_events"
                    ? [...(activeParts.attachments || [])]
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
                                    className={styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
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
                                  disabled={campaignRecipientsLoading || campaignHealthLoading}
                                >
                                  {campaignRecipientsLoading || campaignHealthLoading ? "Actualisation…" : "Rafraîchir le suivi"}
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
                                    className={styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
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
                                        onClick={() => setDetailsChannelKey(entry.key)}
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
                                  {detailsEditMode ? (
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
                                      onClick={() => { setDetailsEditMode(true); setDetailsActionError(null); setDetailsActionSuccess(null); }}
                                      disabled={detailsActionBusy}
                                    >
                                      Modifier
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={styles.btnDangerSmall}
                                    onClick={deleteChannelPublication}
                                    disabled={detailsActionBusy}
                                  >
                                    {detailsActionBusy && !detailsEditMode ? "Suppression…" : "Supprimer"}
                                  </button>
                                  {canDeleteHistoryItem(detailsItem) ? (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => void deleteHistoryEntry(detailsItem)}
                                      disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id || detailsActionBusy}
                                    >
                                      {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                    </button>
                                  ) : null}
                                </div>
                              ) : canDeleteHistoryItem(detailsItem) ? (
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                  </button>
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
                            <div className={styles.messageHeaderTitle}>Message</div>
                          </div>

                          {detailsItem.source !== "app_events" ? (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : activePublicationEntry ? (
                            (() => {
                              const parts = activeParts;
                              const showInstagramHashtags = activePublicationEntry.key === "instagram";
                              const deletedAt = activePublicationResult?.deleted_at ? new Date(String(activePublicationResult.deleted_at)).toLocaleString() : null;
                              const hasAny = !!(parts.title || parts.content || parts.cta || (showInstagramHashtags && parts.hashtags?.length));
                              if (!hasAny && showFallbackMessage) {
                                return (
                                  <div className={styles.messageBody}>
                                    {detailsItem.detailHtml ? (
                                      <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
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
                                          <input
                                            type="text"
                                            value={publicationEditForm.title}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, title: e.target.value }))}
                                            className={styles.publicationFieldInput}
                                            placeholder="Titre"
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        <div>
                                          <div className={styles.publicationLabel}>Contenu</div>
                                          <textarea
                                            value={publicationEditForm.content}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, content: e.target.value }))}
                                            className={styles.publicationFieldTextarea}
                                            placeholder="Contenu"
                                            rows={8}
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        <div>
                                          <div className={styles.publicationLabel}>CTA</div>
                                          <input
                                            type="text"
                                            value={publicationEditForm.cta}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, cta: e.target.value }))}
                                            className={styles.publicationFieldInput}
                                            placeholder="CTA"
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        {activePublicationEntry.key === "instagram" ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Hashtags</div>
                                            <input
                                              type="text"
                                              value={publicationEditForm.hashtags}
                                              onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, hashtags: e.target.value }))}
                                              className={styles.publicationFieldInput}
                                              placeholder="maçonnerie lens btp"
                                              disabled={detailsActionBusy}
                                            />
                                          </div>
                                        ) : null}
                                        <div style={{ display: "grid", gap: 12 }}>
                                          <div className={styles.publicationLabel}>Pièces jointes</div>
                                          <input
                                            id={publicationEditFileInputId}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className={styles.hiddenFileInput}
                                            onChange={(e) => {
                                              addPublicationFiles(e.target.files);
                                              e.currentTarget.value = "";
                                            }}
                                          />
                                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                            <label htmlFor={publicationEditFileInputId} className={styles.btnAttach}>📎 Ajouter des images</label>
                                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                                              {activePublicationEditAssets.length} image(s) pour {activePublicationEntry?.label || "ce canal"}
                                            </span>
                                          </div>


                                          <div style={{ display: "grid", gap: 8 }}>
                                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                              Cochez les images à publier puis ouvrez la retouche uniquement quand vous voulez recadrer une image.
                                            </div>
                                            <ChannelImageRetouchCardsPanel
                                              tabs={[{ key: activePublicationEditChannelKey, label: activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey) }]}
                                              activeChannel={activePublicationEditChannelKey}
                                              onActiveChannelChange={() => {}}
                                              channelTitle={activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey)}
                                              formatLabel={`Format final : ${activePublicationEditPreset.width}×${activePublicationEditPreset.height}`}
                                              aspectRatio={`${activePublicationEditPreset.width} / ${activePublicationEditPreset.height}`}
                                              items={activePublicationEditAssets.map((asset, index) => ({
                                                key: asset.key,
                                                previewUrl: asset.previewUrl,
                                                included: asset.selected,
                                                title: `Image ${index + 1}`,
                                                subtitle: asset.selected ? "Publiée sur ce canal" : "Non publiée sur ce canal",
                                                fitLabel: asset.transform.fit === "cover" ? "Remplir" : "Adapter",
                                                backgroundMode: getPublicationBackgroundMode(asset.transform),
                                                onToggle: () => togglePublicationImage(activePublicationEditChannelKey, asset.key),
                                                onRetouch: () => openPublicationRetouch(activePublicationEditChannelKey, asset.key),
                                                onRemove: () => removePublicationImage(activePublicationEditChannelKey, asset.key),
                                              }))}
                                              buttonClassName={styles.btnGhost}
                                              pillButtonStyle={pillBtn}
                                              pillButtonActiveStyle={pillBtnActive}
                                              showTabs={false}
                                              emptyMessage="Aucune image pour ce canal."
                                            />
                                          </div>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        {parts.title ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Titre</div>
                                            <div className={styles.publicationValue}>{parts.title}</div>
                                          </div>
                                        ) : null}
                                        {parts.content ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Contenu</div>
                                            <pre className={styles.publicationPre}>{parts.content}</pre>
                                          </div>
                                        ) : null}
                                        {parts.cta ? (
                                          <div>
                                            <div className={styles.publicationLabel}>CTA</div>
                                            <div className={styles.publicationCtaBox}>{parts.cta}</div>
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
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : (
                            <div className={styles.emptyDetailText}>Aucun message disponible.</div>
                          )}
                        </section>

                        {detailsItem.source === "mail_campaigns" ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>Suivi destinataires</div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                              {[
                                { key: "sent", label: "Envoyés", value: campaignHealth?.sent ?? campaignCounts((detailsItem as any).raw || {}).sent },
                                { key: "delivered", label: "Délivrés", value: campaignHealth?.delivered ?? 0 },
                                { key: "queued", label: "En attente", value: campaignHealth?.queued ?? campaignCounts((detailsItem as any).raw || {}).queued },
                                { key: "processing", label: "En cours", value: campaignHealth?.processing ?? campaignCounts((detailsItem as any).raw || {}).processing },
                                { key: "failed", label: "Échecs", value: campaignHealth?.failed ?? campaignCounts((detailsItem as any).raw || {}).failed },
                                { key: "blocked", label: "Bloqués", value: campaignHealth?.blocked ?? 0 },
                                { key: "opt_out", label: "Désinscrits", value: campaignHealth?.opt_out ?? 0 },
                                { key: "hard_bounce", label: "Rebonds durs", value: campaignHealth?.hard_bounce ?? 0 },
                                { key: "soft_bounce", label: "Rebonds souples", value: campaignHealth?.soft_bounce ?? 0 },
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
                                { key: "delivered", label: "Délivrés", value: campaignHealth?.delivered ?? 0 },
                                { key: "blocked", label: "Bloqués", value: campaignHealth?.blocked ?? 0 },
                                { key: "opt_out", label: "Désinscrits", value: campaignHealth?.opt_out ?? 0 },
                                { key: "blacklist", label: "Blacklist", value: campaignHealth?.blacklist ?? 0 },
                                { key: "complaint", label: "Plaintes", value: campaignHealth?.complaint ?? 0 },
                                { key: "hard_bounce", label: "Rebonds durs", value: campaignHealth?.hard_bounce ?? 0 },
                                { key: "soft_bounce", label: "Rebonds souples", value: campaignHealth?.soft_bounce ?? 0 },
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

                        {hasAttachments ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>Pièces jointes</div>
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
                                      {a.url ? (
                                        <a className={styles.attachmentLink} href={a.url} target="_blank" rel="noreferrer">
                                          Ouvrir
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

                      {detailsItem.source === "send_items" && (detailsItem as any).raw?.status === "draft" ? (
                        <div style={{ marginTop: 14, color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                          Astuce : clique sur ce brouillon dans la liste pour l’ouvrir en édition.
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : null}

        {detailsOpen && detailsEditMode && publicationRetouchAsset && publicationRetouchChannelKey ? (() => {
          const channel = publicationRetouchChannelKey;
          const preset = getPublicationChannelPreset(channel);
          const transform = publicationRetouchAsset.transform;
          const imageMeta = publicationRetouchImageMeta[publicationRetouchAsset.key];
          const previewLayout = computePublicationPreviewLayout({
            containerWidth: publicationRetouchStageSize.width,
            containerHeight: publicationRetouchStageSize.height,
            imageWidth: imageMeta?.width || 0,
            imageHeight: imageMeta?.height || 0,
            transform,
          });
          const backgroundMode = getPublicationBackgroundMode(transform);
          const zoomLabel = `zoom ${Number(transform.zoom || 1).toFixed(2)}×`;
          return (
            <ChannelImageRetouchModal
              open
              title={`Retoucher ${publicationRetouchAsset.name}`}
              subtitle={`${formatChannelLabel(channel)} • ${preset.width}×${preset.height}`}
              aspectRatio={`${preset.width} / ${preset.height}`}
              backgroundMode={backgroundMode}
              backgroundColor={publicationRetouchAsset.transform.backgroundColor}
              fitLabel={transform.fit === "cover" ? "Remplir" : "Adapter"}
              zoomLabel={zoomLabel}
              previewSrc={publicationRetouchAsset.previewUrl}
              previewLayout={previewLayout}
              previewRef={publicationRetouchStageRef}
              isDragging={isPublicationRetouchDragging}
              onClose={closePublicationRetouch}
              buttonClassName={styles.btnGhost}
              primaryButtonClassName={styles.btnPrimary}
              onWheel={(event) => {
                if (!publicationRetouchStageRef.current || !imageMeta?.width || !imageMeta?.height) return;
                event.preventDefault();
                const rect = publicationRetouchStageRef.current.getBoundingClientRect();
                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top;
                const nextZoom = publicationClamp((transform.zoom || 1) + (event.deltaY < 0 ? 0.08 : -0.08), 0.4, 3);
                const nextLayout = computePublicationPreviewLayout({
                  containerWidth: rect.width,
                  containerHeight: rect.height,
                  imageWidth: imageMeta.width,
                  imageHeight: imageMeta.height,
                  transform: { ...transform, zoom: nextZoom },
                });
                const currentDrawW = previewLayout.drawW || nextLayout.drawW;
                const currentDrawH = previewLayout.drawH || nextLayout.drawH;
                const ux = currentDrawW ? (pointerX - previewLayout.dx) / currentDrawW : 0.5;
                const uy = currentDrawH ? (pointerY - previewLayout.dy) / currentDrawH : 0.5;
                const nextDx = pointerX - ux * nextLayout.drawW;
                const nextDy = pointerY - uy * nextLayout.drawH;
                const offsets = offsetFromPublicationDrawPosition({
                  containerWidth: rect.width,
                  containerHeight: rect.height,
                  drawW: nextLayout.drawW,
                  drawH: nextLayout.drawH,
                  dx: nextDx,
                  dy: nextDy,
                });
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: nextZoom, ...offsets } } : asset));
              }}
              onPointerDown={(event) => {
                publicationRetouchDragRef.current = {
                  channel,
                  imageKey: publicationRetouchAsset.key,
                  startX: event.clientX,
                  startY: event.clientY,
                  startOffsetX: transform.offsetX || 0,
                  startOffsetY: transform.offsetY || 0,
                };
                setIsPublicationRetouchDragging(true);
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = publicationRetouchDragRef.current;
                if (!drag || drag.imageKey !== publicationRetouchAsset.key) return;
                const maxX = Math.abs(previewLayout.drawW - publicationRetouchStageSize.width) / 2;
                const maxY = Math.abs(previewLayout.drawH - publicationRetouchStageSize.height) / 2;
                const nextOffsetX = maxX ? publicationClamp(drag.startOffsetX - ((event.clientX - drag.startX) / maxX) * 100, -100, 100) : 0;
                const nextOffsetY = maxY ? publicationClamp(drag.startOffsetY - ((event.clientY - drag.startY) / maxY) * 100, -100, 100) : 0;
                updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: nextOffsetX, offsetY: nextOffsetY } } : asset));
              }}
              onPointerUp={(event) => {
                if (publicationRetouchDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationRetouchDragRef.current = null;
                setIsPublicationRetouchDragging(false);
              }}
              onPointerCancel={(event) => {
                if (publicationRetouchDragRef.current) {
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
                publicationRetouchDragRef.current = null;
                setIsPublicationRetouchDragging(false);
              }}
              onZoomOut={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) - 0.08, 0.4, 3) } } : asset))}
              onZoomIn={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, zoom: publicationClamp((asset.transform.zoom || 1) + 0.08, 0.4, 3) } } : asset))}
              onContain={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0 }, getPublicationBackgroundMode(asset.transform)) } : asset))}
              onCover={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: withPublicationBackgroundMode({ ...asset.transform, fit: "cover", zoom: 1, offsetX: 0, offsetY: 0 }, "black") } : asset))}
              onReset={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: buildPublicationDefaultTransform(channel) } : asset))}
              onDoubleClick={() => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, offsetX: 0, offsetY: 0 } } : asset))}
              onSave={closePublicationRetouch}
              onBackgroundModeChange={(mode) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: mode === "blur" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "blur") : mode === "transparent" ? withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "transparent") : { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: asset.transform.backgroundColor || "#e8f6ff" } } : asset))}
              onBackgroundColorChange={(color) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...withPublicationBackgroundMode({ ...asset.transform, fit: "contain" }, "color"), backgroundColor: color } } : asset))}
              designState={getPublicationDesign(publicationRetouchAsset.transform)}
              onDesignChange={(patch) => updatePublicationChannelAssets(channel, (assets) => assets.map((asset) => asset.key === publicationRetouchAsset.key ? { ...asset, transform: { ...asset.transform, design: { ...getPublicationDesign(asset.transform), ...patch } } } : asset))}
              pillButtonStyle={pillBtn}
              pillButtonActiveStyle={pillBtnActive}
              sidebarItems={(publicationEditImagesByChannel[channel]?.assets || []).map((asset, index) => ({
                key: asset.key,
                previewUrl: asset.previewUrl,
                title: `Image ${index + 1}`,
                subtitle: asset.selected ? "Publiée sur ce canal" : "Non publiée sur ce canal",
                active: asset.key === publicationRetouchAsset.key,
                onClick: () => setPublicationRetouchImageKey(asset.key),
              }))}
            />
          );
        })() : null}

        {/* Compose modal */}
        {composeOpen ? (
          <div className={styles.modalOverlay} onClick={() => setComposeOpen(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                    {draftId ? "Éditer le brouillon" : "Nouveau message"}
                  </div>
                  <span className={styles.badge} style={{ opacity: 0.9 }}>Mail</span>
                </div>

                <button className={styles.btnGhost} onClick={() => setComposeOpen(false)} type="button">
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>Boîte d’envoi :</div>
                    <select
                      className={styles.selectDark}
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      style={{
                        width: "min(520px, 100%)",
                        flex: "1 1 280px",
                        minWidth: 0,
                        paddingRight: 36,
                        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                      }}
                    >
                      {mailAccounts.map((a) => (
                        <option key={a.id} value={a.id} style={{ background: "#ffffff", color: "#0b1020" }}>
                          {(a.display_name ? `${a.display_name} — ` : "") + a.email_address + ` (${a.provider})`}
                        </option>
                      ))}
                    </select>
                    {selectedAccount ? (
                      <span className={`${styles.badge} ${pill(selectedAccount.provider).cls}`}>{pill(selectedAccount.provider).label}</span>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>À</span>
                    <input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="email@exemple.com, autre@exemple.com"
                      style={inputStyle}
                    />
                    {isBulkCampaignCompose ? (
                      <span style={{ fontSize: 12, color: "rgba(125,211,252,0.95)" }}>
                        {composeRecipientList.length} destinataires détectés : iNr’SEND lancera une campagne avec un envoi individuel par contact.
                      </span>
                    ) : null}
                    {bulkCampaignNotice ? (
                      <div
                        style={{
                          marginTop: 4,
                          borderRadius: 12,
                          padding: "10px 12px",
                          border: bulkCampaignNotice.tone === "strong"
                            ? "1px solid rgba(251,146,60,0.40)"
                            : bulkCampaignNotice.tone === "warning"
                              ? "1px solid rgba(250,204,21,0.34)"
                              : "1px solid rgba(56,189,248,0.26)",
                          background: bulkCampaignNotice.tone === "strong"
                            ? "rgba(251,146,60,0.12)"
                            : bulkCampaignNotice.tone === "warning"
                              ? "rgba(250,204,21,0.10)"
                              : "rgba(56,189,248,0.10)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{bulkCampaignNotice.title}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>{bulkCampaignNotice.text}</div>
                      </div>
                    ) : null}
                  </label>

                  {/* CRM picker (dropdown + checkboxes) */}
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setCrmPickerOpen((v) => !v)}
                      style={{
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 14,
                        borderColor: "rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>Contacts CRM</span>
                        <span className={styles.badge} style={{ opacity: 0.9 }}>
                          {selectedCrmCount} sélectionné{selectedCrmCount > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span style={{ opacity: 0.85 }}>{crmPickerOpen ? "▴" : "▾"}</span>
                    </button>

                    {crmPickerOpen ? (
                      <div
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 14,
                          padding: 10,
                          background: "rgba(0,0,0,0.16)",
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                          
                          <div className={styles.crmFilterRow}>
                            <select
                              value={crmCategory ?? "all"}
                              onChange={(e) => setCrmCategory(e.target.value as any)}
                              className={styles.crmSelect}
                              title="Filtrer par catégorie"
                            >
                              <option value="all">Catégories</option>
                              <option value="particulier">Particuliers</option>
                              <option value="professionnel">Professionnels</option>
                              <option value="collectivite_publique">Collectivités</option>
                            </select>

                            <select
                              value={crmContactType ?? "all"}
                              onChange={(e) => setCrmContactType(e.target.value as any)}
                              className={styles.crmSelect}
                              title="Filtrer par type"
                            >
                              <option value="all">Types</option>
                              <option value="client">Clients</option>
                              <option value="prospect">Prospects</option>
                              <option value="fournisseur">Fournisseurs</option>
                              <option value="partenaire">Partenaires</option>
                              <option value="autre">Autres</option>
                            </select>

                            <button
                              type="button"
                              className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.crmIconBtn}`}
                              onClick={() => {
                                setCrmSearchOpen((v) => !v);
                                // focus next tick (after render)
                                setTimeout(() => crmSearchRef.current?.focus(), 0);
                              }}
                              title="Rechercher"
                              aria-label="Rechercher"
                            >
                              <span className={styles.iconWrap}>
                                🔎
                                {!crmSearchOpen && crmFilter.trim() ? <span className={styles.searchDot} /> : null}
                              </span>
                            </button>

                            <button
                              type="button"
                              className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.crmIconBtn} ${styles.starToggleBtn} ${
                                crmImportantOnly ? styles.starActive : styles.starInactive
                              }`}
                              onClick={() => setCrmImportantOnly((v) => !v)}
                              title={crmImportantOnly ? "Important uniquement" : "Tous les contacts"}
                              aria-label="Important"
                            >
                              {crmImportantOnly ? "★" : "☆"}
                            </button>
                          </div>

                          {crmSearchOpen ? (
                            <div className={styles.crmSearchRow}>
                              <input
                                ref={crmSearchRef}
                                value={crmFilter}
                                onChange={(e) => setCrmFilter(e.target.value)}
                                placeholder="Rechercher…"
                                className={styles.crmSearchInput}
                              />
                              {crmFilter.trim() ? (
                                <button
                                  type="button"
                                  className={styles.searchClearBtn}
                                  onClick={() => {
                                    setCrmFilter("");
                                    setTimeout(() => crmSearchRef.current?.focus(), 0);
                                  }}
                                  aria-label="Effacer la recherche"
                                  title="Effacer"
                                >
                                  ×
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.btnGhost}
                                onClick={() => setCrmSearchOpen(false)}
                                style={{ padding: "8px 10px" }}
                                aria-label="Fermer la recherche"
                                title="Fermer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : null}

                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const current = normalizeEmails(to);
                              const setLower = new Set(current.map((e) => e.toLowerCase()));
                              const add = filteredContacts
                                .map((c) => c.email)
                                .filter(Boolean)
                                .map((e) => String(e));
                              const next = [...current];
                              for (const e of add) {
                                if (!setLower.has(e.toLowerCase())) {
                                  next.push(e);
                                  setLower.add(e.toLowerCase());
                                }
                              }
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout sélectionner
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const removeSet = new Set(
                                filteredContacts
                                  .map((c) => c.email)
                                  .filter(Boolean)
                                  .map((e) => String(e).toLowerCase())
                              );
                              const current = normalizeEmails(to);
                              const next = current.filter((e) => !removeSet.has(e.toLowerCase()));
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout désélectionner
                          </button>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                            {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""} (filtrés)
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            border: "1px solid rgba(255,255,255,0.10)",
                            borderRadius: 12,
                            padding: 8,
                            maxHeight: 190,
                            overflow: "auto",
                          }}
                        >
                          {crmLoading ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Chargement des contacts…</div>
                          ) : crmError ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>{crmError}</div>
                              <button
                                className={styles.btnPrimary}
                                type="button"
                                onClick={() => void loadCrmContacts()}
                                style={{ width: "fit-content" }}
                              >
                                Réessayer
                              </button>
                            </div>
                          ) : filteredContacts.length === 0 ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Aucun contact.</div>
                          ) : (
                            <div style={{ display: "grid", gap: 6 }}>
                              {filteredContacts.slice(0, 200).map((c) => {
                                const email = c.email ? String(c.email) : "";
                                const checked = email ? selectedToSet.has(email.toLowerCase()) : false;
                                return (
                                  <label
                                    key={c.id}
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      alignItems: "center",
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      background: checked ? "rgba(56,189,248,0.10)" : "rgba(0,0,0,0.10)",
                                      cursor: email ? "pointer" : "not-allowed",
                                      opacity: email ? 1 : 0.6,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!email}
                                      checked={checked}
                                      onChange={() => {
                                        if (!email) return;
                                        toggleEmailInTo(email);
                                      }}
                                    />
                                    <div style={{ display: "grid", lineHeight: 1.15 }}>
                                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", fontWeight: 700 }}>
                                        {c.full_name || "(Sans nom)"}
                                        {c.important ? <span style={{ marginLeft: 8, opacity: 0.75 }}>★</span> : null}
                                      </div>
                                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>{email}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Objet</span>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet" style={inputStyle} />
                    {!subject.trim() ? (
                      <span style={{ fontSize: 12, color: "rgba(251,191,36,0.92)" }}>Le message partira avec “(sans objet)” si tu laisses ce champ vide.</span>
                    ) : null}
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Message (texte)</span>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={textareaStyle} />
                    {signatureEnabled && signatureImageUrl ? (
                      <div
                        style={{
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginBottom: 8 }}>
                          Image de signature ajoutée automatiquement au mail :
                        </div>
                        <img
                          src={signatureImageUrl}
                          alt="Signature automatique"
                          style={{ width: `${signatureImageWidth}px`, maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, display: "block" }}
                        />
                      </div>
                    ) : null}
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Pièces jointes</span>
                    <input
                      id={fileInputId}
                      type="file"
                      multiple
                      onChange={async (e) => {
                        const next = Array.from(e.target.files || []);
                        setFiles(next);
                        if (!next.length) return;
                        try {
                          const uploaded = await uploadComposeFiles(next);
                          setComposeAttachments((prev) => {
                            const merged = [...prev];
                            for (const item of uploaded) {
                              const exists = merged.some((x) => x.bucket === item.bucket && x.path === item.path);
                              if (!exists) merged.push(item);
                            }
                            return merged;
                          });
                        } catch (err) {
                          console.error("Attachment upload failed", err);
                          setToast("Impossible de préparer cette pièce jointe. Veuillez vérifier son format ou sa taille.");
                        } finally {
                          e.currentTarget.value = "";
                          setFiles([]);
                        }
                      }}
                      className={styles.hiddenFileInput}
                    />

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label htmlFor={fileInputId} className={styles.btnAttach}>
                        📎 Joindre
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                        {composeAttachments.length > 0 ? `${composeAttachments.length} fichier(s)` : attachBusy ? "Préparation des fichiers..." : "Aucun fichier"}
                      </span>
                    </div>

                    {composeAttachments.length > 0 ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {composeAttachments.map((f, idx) => (
                          <span key={`${f.bucket}:${f.path}:${idx}`} className={styles.fileChip} title={f.name}>
                            {f.name}
                            <button
                              type="button"
                              className={styles.fileChipRemove}
                              onClick={() => setComposeAttachments((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label={`Retirer ${f.name}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </label>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.btnGhost} onClick={saveDraft} type="button" disabled={sendBusy}>
                  💾 Sauvegarder brouillon
                </button>
                <button className={styles.btnPrimary} onClick={doSend} type="button" disabled={sendBusy}>
                  {sendBusy ? "Envoi…" : "Envoyer"}
                </button>
              </div>

              {toast ? (
                <div style={{ padding: "10px 14px", color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                  {toast}{" "}
                  <button className={styles.btnGhost} onClick={() => setToast(null)} type="button">
                    OK
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.22)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.92)",
  borderRadius: 12,
  padding: "10px 12px",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
};
