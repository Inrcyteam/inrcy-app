"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./mails.module.css";
import { createClient } from "@/lib/supabaseClient";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import MailboxHeader from "./_components/MailboxHeader";
import MobileFoldersMenu from "./_components/MobileFoldersMenu";
import FolderTabs from "./_components/FolderTabs";
import MailboxToolbar from "./_components/MailboxToolbar";
import MailboxList from "./_components/MailboxList";
import MailboxSearchPanel from "./_components/MailboxSearchPanel";
import MailboxDetailsModal from "./_components/MailboxDetailsModal";
import MailboxPublicationRetouchModal from "./_components/MailboxPublicationRetouchModal";
import MailboxComposeModal from "./_components/MailboxComposeModal";
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
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";

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
    if (subjParam) setSubject(normalizeMailSubject(subjParam));
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
          if (j?.subject) setSubject(normalizeMailSubject(String(j.subject)));
          else if (preSubject) setSubject(normalizeMailSubject(preSubject));

          if (j?.body_text) {
            const renderedBody = String(j.body_text);
            const sanitizedBody = signatureEnabled ? stripTemplateSignatureBlock(renderedBody) : renderedBody;
            setText(applySignaturePreview(sanitizedBody, signatureEnabled ? signaturePreview : ""));
          } else if (preText) {
            const sanitizedBody = signatureEnabled ? stripTemplateSignatureBlock(preText) : preText;
            setText(applySignaturePreview(sanitizedBody, signatureEnabled ? signaturePreview : ""));
          }
        } catch {
          if (preSubject) setSubject(normalizeMailSubject(preSubject));
          if (preText) {
            const sanitizedBody = signatureEnabled ? stripTemplateSignatureBlock(preText) : preText;
            setText(applySignaturePreview(sanitizedBody, signatureEnabled ? signaturePreview : ""));
          }
        }
      } else {
        if (preSubject) setSubject(normalizeMailSubject(preSubject));
        if (preText) {
          const sanitizedBody = signatureEnabled ? stripTemplateSignatureBlock(preText) : preText;
          setText(applySignaturePreview(sanitizedBody, signatureEnabled ? signaturePreview : ""));
        }
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
          subject: normalizeMailSubject(subject.trim() || "(sans objet)"),
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
        subject: normalizeMailSubject(subject.trim() || "(sans objet)"),
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
                subject: normalizeMailSubject(subject.trim() || "(sans objet)"),
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
      setSubject(normalizeMailSubject(raw.subject || ""));
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
          togglePublicationImage={togglePublicationImage}
          openPublicationRetouch={openPublicationRetouch}
          removePublicationImage={removePublicationImage}
          addPublicationFiles={addPublicationFiles}
          saveChannelPublication={saveChannelPublication}
          deleteChannelPublication={deleteChannelPublication}
          retryCampaignFailedRecipients={retryCampaignFailedRecipients}
          deleteHistoryEntry={deleteHistoryEntry}
          loadCampaignRecipients={loadCampaignRecipients}
          loadCampaignHealth={loadCampaignHealth}
        />

        <MailboxPublicationRetouchModal
          open={detailsOpen}
          detailsEditMode={detailsEditMode}
          publicationRetouchAsset={publicationRetouchAsset}
          publicationRetouchChannelKey={publicationRetouchChannelKey}
          publicationRetouchStageRef={publicationRetouchStageRef}
          publicationRetouchStageSize={publicationRetouchStageSize}
          publicationRetouchImageMeta={publicationRetouchImageMeta}
          isPublicationRetouchDragging={isPublicationRetouchDragging}
          publicationEditImagesByChannel={publicationEditImagesByChannel}
          setPublicationRetouchImageKey={setPublicationRetouchImageKey}
          publicationRetouchDragRef={publicationRetouchDragRef}
          setIsPublicationRetouchDragging={setIsPublicationRetouchDragging}
          updatePublicationChannelAssets={updatePublicationChannelAssets}
          closePublicationRetouch={closePublicationRetouch}
        />

        <MailboxComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          draftId={draftId}
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
          signatureImageUrl={signatureImageUrl}
          signatureImageWidth={signatureImageWidth}
          saveDraft={saveDraft}
          doSend={doSend}
          sendBusy={sendBusy}
          toast={toast}
          setToast={setToast}
        />
      </div>
    </div>
  );
}

