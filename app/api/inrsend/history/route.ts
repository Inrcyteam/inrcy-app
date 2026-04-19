import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getInrSendRetentionCutoffIso, getOldestAutoRetentionCutoffIso, isInrSendItemRetained } from "@/lib/inrsendRetention";

type Folder =
  | "mails"
  | "factures"
  | "devis"
  | "publications"
  | "recoltes"
  | "offres"
  | "informations"
  | "suivis"
  | "enquetes";

type BoxView = "sent" | "drafts";
type Status = "draft" | "sent" | "error" | "queued" | "processing" | "paused" | "partial" | "completed" | "failed";

type OutboxItem = {
  id: string;
  source: "send_items" | "app_events" | "mail_campaigns";
  module?: "booster" | "fideliser";
  folder: Folder;
  provider: string | null;
  status: Status;
  created_at: string;
  sent_at?: string | null;
  error?: string | null;
  title: string;
  subTitle?: string;
  target: string;
  preview: string;
  detailHtml?: string | null;
  detailText?: string | null;
  subject?: string | null;
  to?: string | null;
  from?: string | null;
  channels?: string[];
  attachments?: { name: string; type?: string | null; size?: number | null; url?: string | null }[];
  raw?: any;
  reopenHref?: string | null;
};

type FolderCounts = Record<Folder, number>;

type SendType = "mail" | "facture" | "devis";

type SendItemRow = {
  id: string;
  integration_id: string | null;
  type: SendType;
  status: Status;
  to_emails: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_thread_id?: string | null;
  source_doc_save_id?: string | null;
  source_doc_type?: "devis" | "facture" | null;
  source_doc_number?: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

const MAILBOX_PAGE_SIZE = 20;
const SOURCE_BATCH_SIZE = 60;
const MAX_ITERATIONS = 5000;
const ALL_FOLDERS: Folder[] = [
  "mails",
  "factures",
  "devis",
  "publications",
  "recoltes",
  "offres",
  "informations",
  "suivis",
  "enquetes",
];

function emptyFolderCounts(): FolderCounts {
  return {
    mails: 0,
    factures: 0,
    devis: 0,
    publications: 0,
    recoltes: 0,
    offres: 0,
    informations: 0,
    suivis: 0,
    enquetes: 0,
  };
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function cleanString(value: string | null) {
  return String(value || "").trim();
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function stripText(v: unknown): string {
  return String(v || "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function safeS(v: unknown, fallback = ""): string {
  const s = stripText(v);
  return s || fallback;
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

function isFolderValue(value: string): value is Folder {
  return (ALL_FOLDERS as string[]).includes(value);
}

function normalizeFolder(value: string | null): Folder {
  const cleaned = String(value || "").toLowerCase();
  return isFolderValue(cleaned) ? cleaned : "mails";
}

function normalizeBoxView(value: string | null): BoxView {
  return String(value || "").toLowerCase() === "drafts" ? "drafts" : "sent";
}

function defaultFolderFromSendType(type: SendType | string | null | undefined): Folder {
  if (type === "facture") return "factures";
  if (type === "devis") return "devis";
  return "mails";
}

function folderFromTrack(trackKind: string | null | undefined, trackType: string | null | undefined, fallback: Folder = "mails"): Folder {
  const kind = String(trackKind || "").toLowerCase();
  const type = String(trackType || "").toLowerCase();

  if (kind === "booster") {
    if (type === "review_mail") return "recoltes";
    if (type === "promo_mail") return "offres";
  }

  if (kind === "fideliser") {
    if (type === "newsletter_mail") return "informations";
    if (type === "thanks_mail") return "suivis";
    if (type === "satisfaction_mail") return "enquetes";
  }

  return fallback;
}

function resolveCampaignFolder(raw: any): Folder {
  const explicit = String(raw?.folder || "").toLowerCase();
  if (isFolderValue(explicit)) return explicit;
  const tracked = folderFromTrack(raw?.track_kind, raw?.track_type, defaultFolderFromSendType(raw?.type));
  return tracked;
}

function campaignTitleFromFolder(folder: Folder, subject: string) {
  const safeSubject = safeS(subject, "(sans objet)");
  if (folder === "offres") return `Offre — ${safeSubject}`;
  if (folder === "recoltes") return `Récolte — ${safeSubject}`;
  if (folder === "informations") return `Information — ${safeSubject}`;
  if (folder === "suivis") return `Suivi — ${safeSubject}`;
  if (folder === "enquetes") return `Enquête — ${safeSubject}`;
  if (folder === "factures") return `Envoi facture — ${safeSubject}`;
  if (folder === "devis") return `Envoi devis — ${safeSubject}`;
  return `Campagne — ${safeSubject}`;
}

function extractChannelsFromPayload(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];

  const candidates: any[] = [];
  if (Array.isArray(payload.channels)) candidates.push(...payload.channels);
  if (Array.isArray(payload.platforms)) candidates.push(...payload.platforms);
  if (Array.isArray(payload.targets)) candidates.push(...payload.targets);
  if (Array.isArray(payload.destinations)) candidates.push(...payload.destinations);

  const single = firstNonEmpty(payload.channel, payload.platform, payload.target, payload.destination);
  if (single) candidates.push(single);

  return candidates
    .flat()
    .map((x) => (typeof x === "string" ? x : x?.name || x?.label || ""))
    .map((s: string) => String(s).trim())
    .filter(Boolean);
}

function extractMessageFromPayload(payload: any): { html?: string | null; text?: string | null } {
  if (!payload || typeof payload !== "object") return { text: null };

  const pickStr = (obj: any, ...keys: string[]) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return null;
  };

  const coerceText = (v: any): string | null => {
    if (typeof v === "string") {
      const t = v.trim();
      return t ? t : null;
    }
    if (Array.isArray(v)) {
      const parts = v
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
      return parts.length ? parts.join("\n") : null;
    }
    if (v && typeof v === "object") {
      return (
        pickStr(v, "text", "message", "content", "caption", "description", "body_text", "bodyText") ||
        pickStr(v, "prompt")
      );
    }
    return null;
  };

  const html =
    pickStr(payload, "html", "body_html", "bodyHtml", "content_html", "contentHtml", "message_html", "messageHtml") ||
    pickStr(payload?.post, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    pickStr(payload?.mail, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    null;

  let text =
    pickStr(payload, "text", "body_text", "bodyText", "message", "content", "caption", "description", "prompt") ||
    coerceText(payload?.post?.content) ||
    coerceText(payload?.post?.text) ||
    coerceText(payload?.post?.message) ||
    coerceText(payload?.mail?.text) ||
    coerceText(payload?.mail?.body_text) ||
    coerceText(payload?.mail?.bodyText) ||
    coerceText(payload?.message) ||
    null;

  if (!text && payload?.post && typeof payload.post === "object") {
    const title = pickStr(payload.post, "title") || pickStr(payload, "title");
    const content =
      coerceText(payload.post.content) || coerceText(payload.post.text) || coerceText(payload.post.caption) || null;
    const cta = pickStr(payload.post, "cta") || pickStr(payload, "cta");
    const parts = [title, content, cta].filter(Boolean);
    if (parts.length) text = parts.join("\n");
  }

  const tags = payload?.hashtags ?? payload?.post?.hashtags;
  if (Array.isArray(tags) && tags.length) {
    const hashLine = tags
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .join(" ");
    if (hashLine) text = `${text ? text.trim() + "\n\n" : ""}${hashLine}`;
  }

  return { html, text };
}

function extractAttachmentsFromPayload(payload: any): { name: string; type?: string | null; size?: number | null; url?: string | null }[] {
  if (!payload || typeof payload !== "object") return [];
  const candidates =
    payload.attachments ||
    payload.files ||
    payload.images ||
    payload.media ||
    payload?.post?.attachments ||
    payload?.post?.files ||
    payload?.post?.images ||
    payload?.post?.media ||
    [];

  if (!Array.isArray(candidates)) return [];

  const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value) || value.startsWith("/");
  const buildNameFromUrl = (value: string) => {
    const cleaned = String(value || "").split("?")[0].trim();
    if (!cleaned) return "Pièce jointe";
    const last = cleaned.split("/").filter(Boolean).pop() || cleaned;
    return safeDecode(last);
  };

  return candidates
    .map((a: any) => {
      if (!a) return null;
      if (typeof a === "string") {
        const raw = String(a).trim();
        if (!raw) return null;
        return isLikelyUrl(raw)
          ? { name: buildNameFromUrl(raw), url: raw }
          : { name: raw };
      }
      const url = a.url || a.href || a.publicUrl || a.public_url || (typeof a.path === "string" && isLikelyUrl(a.path) ? a.path : null);
      const name = a.name || a.filename || a.fileName || a.originalname || (typeof a.path === "string" && !isLikelyUrl(a.path) ? a.path : null) || url;
      if (!name && !url) return null;
      return {
        name: String(name || buildNameFromUrl(String(url || ""))),
        type: a.type || a.mime || a.mimeType || null,
        size: typeof a.size === "number" ? a.size : typeof a.bytes === "number" ? a.bytes : null,
        url: url || null,
      };
    })
    .filter(Boolean) as { name: string; type?: string | null; size?: number | null; url?: string | null }[];
}

function isVisibleInFolder(folder: Folder, item: OutboxItem, view: BoxView) {
  if (item.folder !== folder) return false;
  if (view === "drafts") return item.source === "send_items" && item.status === "draft";
  return item.status !== "draft";
}

function campaignCounts(raw: any) {
  return {
    total: Math.max(0, Number(raw?.total_count || 0) || 0),
    queued: Math.max(0, Number(raw?.queued_count || 0) || 0),
    processing: Math.max(0, Number(raw?.processing_count || 0) || 0),
    sent: Math.max(0, Number(raw?.sent_count || 0) || 0),
    failed: Math.max(0, Number(raw?.failed_count || 0) || 0),
  };
}

function formatCampaignProgress(raw: any) {
  const counts = campaignCounts(raw);
  const bits = [`${counts.sent}/${counts.total || counts.sent} envoyés`];
  if (counts.processing > 0) bits.push(`${counts.processing} en cours`);
  if (counts.queued > 0) bits.push(`${counts.queued} en attente`);
  if (counts.failed > 0) bits.push(`${counts.failed} en échec`);
  return bits.join(" • ");
}

function matchesQuery(item: OutboxItem, query: string) {
  if (!query) return true;
  const hay = `${item.title || ""} ${item.subTitle || ""} ${item.target || ""} ${item.preview || ""} ${item.provider || ""}`.toLowerCase();
  return hay.includes(query);
}

function shouldQuerySendItems(folder: Folder) {
  return folder === "mails" || folder === "factures" || folder === "devis";
}

function shouldQueryCampaigns(view: BoxView) {
  return view !== "drafts";
}

function shouldQueryEvents(folder: Folder, view: BoxView) {
  if (view === "drafts") return false;
  return folder === "publications" || folder === "recoltes" || folder === "offres" || folder === "informations" || folder === "suivis" || folder === "enquetes";
}

function mapSendItems(rows: SendItemRow[]): OutboxItem[] {
  return rows
    .map<OutboxItem | null>((x) => {
      if ((x as any).status === "deleted") return null;
      const folder: Folder = x.type === "facture" ? "factures" : x.type === "devis" ? "devis" : "mails";
      const title = safeS(x.subject, folder === "factures" ? "Facture" : folder === "devis" ? "Devis" : "(sans objet)");
      const preview = safeS(x.body_text || x.body_html, "").slice(0, 140);
      const status: Status = x.status === "sent" && x.error ? "error" : (x.status as Status);
      return {
        id: x.id,
        source: "send_items",
        folder,
        provider: x.provider || "Mail",
        status,
        created_at: x.created_at,
        sent_at: x.sent_at,
        error: x.error,
        title,
        target: safeS(x.to_emails, ""),
        preview,
        detailHtml: x.body_html,
        detailText: x.body_text,
        subject: x.subject,
        to: x.to_emails,
        raw: x,
        reopenHref: x.source_doc_save_id && x.source_doc_type
          ? `/dashboard/${x.source_doc_type === "facture" ? "factures" : "devis"}/new?saveId=${encodeURIComponent(x.source_doc_save_id)}`
          : null,
      };
    })
    .filter(Boolean) as OutboxItem[];
}

function mapCampaignItems(rows: any[]): OutboxItem[] {
  return rows.map<OutboxItem>((x: any) => {
    const folder = resolveCampaignFolder(x);
    const counts = campaignCounts(x);
    const target = `${counts.total || 0} contact${counts.total > 1 ? "s" : ""}`;
    return {
      id: String(x.id || ""),
      source: "mail_campaigns",
      module: String(x.track_kind || "").toLowerCase() === "booster"
        ? "booster"
        : String(x.track_kind || "").toLowerCase() === "fideliser"
          ? "fideliser"
          : undefined,
      folder,
      provider: x.provider || "Mail",
      status: String(x.status || "processing") as Status,
      created_at: String(x.created_at || new Date().toISOString()),
      sent_at: x.finished_at || null,
      error: x.last_error || null,
      title: campaignTitleFromFolder(folder, x.subject),
      target,
      preview: formatCampaignProgress(x),
      detailHtml: x.body_html,
      detailText: x.body_text,
      subject: x.subject,
      raw: x,
      reopenHref: x.source_doc_save_id && x.source_doc_type
        ? `/dashboard/${x.source_doc_type === "facture" ? "factures" : "devis"}/new?saveId=${encodeURIComponent(x.source_doc_save_id)}`
        : null,
    };
  });
}

function mapEventItems(rows: any[]): OutboxItem[] {
  const boosterItems = rows
    .filter((e) => String(e.module) === "booster")
    .map<OutboxItem>((e: any) => {
      const t = String(e.type || "");
      const folder: Folder = t === "publish" ? "publications" : t === "review_mail" ? "recoltes" : "offres";
      const payload = (e.payload || {}) as any;
      const title =
        folder === "publications" ? "Publication" :
        folder === "recoltes" ? "Récolte" :
        folder === "offres" ? "Offre" :
        folder === "informations" ? "Information" :
        folder === "suivis" ? "Suivi" :
        folder === "enquetes" ? "Enquête" :
        "Message";

      const subTitle = firstNonEmpty(
        payload?.post?.title,
        payload?.title,
        payload?.subject,
        payload?.post?.subject,
      );

      const target =
        safeS(payload.channel) ||
        safeS(payload.platform) ||
        safeS(payload.to) ||
        safeS(payload.recipients) ||
        (folder === "publications" ? "Google / Réseaux" : "Contacts");
      const preview = safeS(payload.preview || payload.text || payload.message || payload.content, "").slice(0, 140);
      const extracted = extractMessageFromPayload(payload);
      return {
        id: e.id,
        source: "app_events",
        module: "booster",
        folder,
        provider: "Booster",
        status: "sent",
        created_at: e.created_at,
        title,
        subTitle: subTitle || undefined,
        target,
        preview,
        detailHtml: extracted.html,
        detailText: extracted.text,
        channels: extractChannelsFromPayload(payload),
        attachments: extractAttachmentsFromPayload(payload),
        raw: e,
      };
    });

  const fideliserItems = rows
    .filter((e) => String(e.module) === "fideliser")
    .map<OutboxItem>((e: any) => {
      const t = String(e.type || "");
      const folder: Folder = t === "newsletter_mail" ? "informations" : t === "thanks_mail" ? "suivis" : "enquetes";
      const payload = (e.payload || {}) as any;
      const title = folder === "informations" ? "Informations" : folder === "suivis" ? "Suivis" : "Enquêtes";
      const subTitle = firstNonEmpty(
        payload?.post?.title,
        payload?.title,
        payload?.subject,
        payload?.post?.subject,
      );
      const target = safeS(payload.to) || safeS(payload.recipients) || "Contacts";
      const preview = safeS(payload.preview || payload.text || payload.message || payload.content, "").slice(0, 140);
      const extracted = extractMessageFromPayload(payload);
      return {
        id: e.id,
        source: "app_events",
        module: "fideliser",
        folder,
        provider: "Fidéliser",
        status: "sent",
        created_at: e.created_at,
        title,
        subTitle: subTitle || undefined,
        target,
        preview,
        detailHtml: extracted.html,
        detailText: extracted.text,
        channels: extractChannelsFromPayload(payload),
        attachments: extractAttachmentsFromPayload(payload),
        raw: e,
      };
    });

  return [...boosterItems, ...fideliserItems];
}

async function fetchAllRows<T>(
  build: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  batchSize = 500,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += batchSize) {
    const to = from + batchSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }

  return rows;
}

async function computeFolderCounts(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  userId: string,
  boxView: BoxView,
  filterAccountId: string,
  query: string,
): Promise<FolderCounts> {
  const counts = emptyFolderCounts();
  const eventsCutoffIso = getOldestAutoRetentionCutoffIso(["publications", "recoltes", "offres", "informations", "suivis", "enquetes"]);

  const sendItemsPromise = fetchAllRows<SendItemRow>(async (from, to) => {
    let builder: any = supabase
      .from("send_items")
      .select("id, integration_id, type, status, to_emails, subject, body_text, body_html, provider, provider_message_id, provider_thread_id, source_doc_save_id, source_doc_type, source_doc_number, error, sent_at, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (boxView === "drafts") builder = builder.eq("status", "draft");
    else builder = builder.neq("status", "draft");

    if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

    return builder.range(from, to);
  });

  const campaignsPromise = boxView === "drafts"
    ? Promise.resolve([] as any[])
    : fetchAllRows<any>(async (from, to) => {
        let builder: any = supabase
          .from("mail_campaigns")
          .select("id, integration_id, provider, type, folder, track_kind, track_type, template_key, subject, body_text, body_html, status, total_count, queued_count, processing_count, sent_count, failed_count, source_doc_save_id, source_doc_type, source_doc_number, last_error, started_at, finished_at, created_at, updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

        return builder.range(from, to);
      });

  const eventsPromise = boxView === "drafts"
    ? Promise.resolve([] as any[])
    : fetchAllRows<any>(async (from, to) => {
        let builder: any = supabase
          .from("app_events")
          .select("id, module, type, payload, created_at")
          .eq("user_id", userId)
          .in("module", ["booster", "fideliser"])
          .order("created_at", { ascending: false });

        if (eventsCutoffIso) builder = builder.gte("created_at", eventsCutoffIso);

        return builder.range(from, to);
      });

  const [sendRows, campaignRows, eventRows] = await Promise.all([sendItemsPromise, campaignsPromise, eventsPromise]);

  const allItems = [
    ...mapSendItems(sendRows),
    ...mapCampaignItems(campaignRows),
    ...mapEventItems(eventRows),
  ];

  for (const item of allItems) {
    if (!isVisibleInFolder(item.folder, item, boxView)) continue;
    if (!isInrSendItemRetained(item.folder, item.created_at)) continue;
    if (!matchesQuery(item, query)) continue;
    counts[item.folder] += 1;
  }

  return counts;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const page = parsePositiveInt(url.searchParams.get("page"), 1, 100000);
    const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), MAILBOX_PAGE_SIZE, MAILBOX_PAGE_SIZE);
    const folder = normalizeFolder(url.searchParams.get("folder"));
    const boxView = normalizeBoxView(url.searchParams.get("boxView"));
    const filterAccountId = cleanString(url.searchParams.get("filterAccountId"));
    const query = cleanString(url.searchParams.get("q")).toLowerCase();
    const folderCutoffIso = getInrSendRetentionCutoffIso(folder);
    const eventSourceCutoffIso = getOldestAutoRetentionCutoffIso(["publications", "recoltes", "offres", "informations", "suivis", "enquetes"]);
    const targetVisibleCount = page * pageSize;

    const allItems: OutboxItem[] = [];
    const seenKeys = new Set<string>();

    const sourceState = {
      send_items: { offset: 0, exhausted: !shouldQuerySendItems(folder) },
      mail_campaigns: { offset: 0, exhausted: !shouldQueryCampaigns(boxView) },
      app_events: { offset: 0, exhausted: !shouldQueryEvents(folder, boxView) },
    };

    const pushItems = (items: OutboxItem[]) => {
      for (const item of items) {
        const key = `${item.source}:${item.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        allItems.push(item);
      }
    };

    const buildFiltered = () =>
      allItems
        .filter((item) => isVisibleInFolder(folder, item, boxView))
        .filter((item) => isInrSendItemRetained(item.folder, item.created_at))
        .filter((item) => matchesQuery(item, query))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    let filtered = buildFiltered();

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      if (filtered.length >= targetVisibleCount) break;
      if (sourceState.send_items.exhausted && sourceState.mail_campaigns.exhausted && sourceState.app_events.exhausted) break;

      const tasks: Promise<void>[] = [];

      if (!sourceState.send_items.exhausted) {
        tasks.push((async () => {
          let builder: any = supabase
            .from("send_items")
            .select("id, integration_id, type, status, to_emails, subject, body_text, body_html, provider, provider_message_id, provider_thread_id, source_doc_save_id, source_doc_type, source_doc_number, error, sent_at, created_at, updated_at")
            .eq("user_id", userData.user.id)
            .order("created_at", { ascending: false });

          if (folderCutoffIso) builder = builder.gte("created_at", folderCutoffIso);

          if (boxView === "drafts") builder = builder.eq("status", "draft");
          else builder = builder.neq("status", "draft");

          if (folder === "mails") builder = builder.eq("type", "mail");
          else if (folder === "factures") builder = builder.eq("type", "facture");
          else if (folder === "devis") builder = builder.eq("type", "devis");

          if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

          const from = sourceState.send_items.offset;
          const to = from + SOURCE_BATCH_SIZE - 1;
          const { data, error } = await builder.range(from, to);
          if (error) throw error;
          const rows = (data || []) as SendItemRow[];
          sourceState.send_items.offset += rows.length;
          if (rows.length < SOURCE_BATCH_SIZE) sourceState.send_items.exhausted = true;
          pushItems(mapSendItems(rows));
        })());
      }

      if (!sourceState.mail_campaigns.exhausted) {
        tasks.push((async () => {
          let builder: any = supabase
            .from("mail_campaigns")
            .select("id, integration_id, provider, type, folder, track_kind, track_type, template_key, subject, body_text, body_html, status, total_count, queued_count, processing_count, sent_count, failed_count, source_doc_save_id, source_doc_type, source_doc_number, last_error, started_at, finished_at, created_at, updated_at")
            .eq("user_id", userData.user.id)
            .order("created_at", { ascending: false });

          if (folderCutoffIso) builder = builder.gte("created_at", folderCutoffIso);

          if (filterAccountId) builder = builder.eq("integration_id", filterAccountId);

          const from = sourceState.mail_campaigns.offset;
          const to = from + SOURCE_BATCH_SIZE - 1;
          const { data, error } = await builder.range(from, to);
          if (error) throw error;
          const rows = (data || []) as any[];
          sourceState.mail_campaigns.offset += rows.length;
          if (rows.length < SOURCE_BATCH_SIZE) sourceState.mail_campaigns.exhausted = true;
          pushItems(mapCampaignItems(rows));
        })());
      }

      if (!sourceState.app_events.exhausted) {
        tasks.push((async () => {
          let builder: any = supabase
            .from("app_events")
            .select("id, module, type, payload, created_at")
            .eq("user_id", userData.user.id)
            .order("created_at", { ascending: false });

          if (folderCutoffIso) builder = builder.gte("created_at", folderCutoffIso);
          else if (eventSourceCutoffIso) builder = builder.gte("created_at", eventSourceCutoffIso);

          if (folder === "publications" || folder === "recoltes" || folder === "offres") {
            builder = builder.eq("module", "booster");
          } else if (folder === "informations" || folder === "suivis" || folder === "enquetes") {
            builder = builder.eq("module", "fideliser");
          } else {
            builder = builder.in("module", ["booster", "fideliser"]);
          }

          const from = sourceState.app_events.offset;
          const to = from + SOURCE_BATCH_SIZE - 1;
          const { data, error } = await builder.range(from, to);
          if (error) throw error;
          const rows = (data || []) as any[];
          sourceState.app_events.offset += rows.length;
          if (rows.length < SOURCE_BATCH_SIZE) sourceState.app_events.exhausted = true;
          pushItems(mapEventItems(rows));
        })());
      }

      await Promise.all(tasks);
      filtered = buildFiltered();
    }

    filtered = buildFiltered();

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = filtered.slice(start, end);
    const allSourcesExhausted = sourceState.send_items.exhausted && sourceState.mail_campaigns.exhausted && sourceState.app_events.exhausted;
    const total = allSourcesExhausted ? filtered.length : null;
    const hasMore = total != null ? end < total : filtered.length > end || !allSourcesExhausted;
    const folderCounts = await computeFolderCounts(supabase, userData.user.id, boxView, filterAccountId, query);

    return NextResponse.json({
      items,
      page,
      pageSize,
      hasMore,
      total,
      totalKnown: total != null,
      folderCounts,
    });
  } catch (error) {
    return jsonUserFacingError(error, { status: 500 });
  }
}
