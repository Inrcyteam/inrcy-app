"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./mails.module.css";
import SettingsDrawer from "../SettingsDrawer";
import MailsSettingsContent from "../settings/_components/MailsSettingsContent";
import { createClient } from "@/lib/supabaseClient";


function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function buildDefaultMailText(opts: { kind: SendType; name?: string; docRef?: string }): string {
  const name = (opts.name || "").trim();
  const hello = name ? `Bonjour ${name},` : "Bonjour,";

  const ref = (opts.docRef || "").trim();
  const refPart = ref ? ` ${ref}` : "";

  if (opts.kind === "facture") {
    return [
      hello,
      "",
      `Veuillez trouver ci-joint votre facture${refPart}.`,
      "",
      "Je reste à votre disposition si besoin.",
      "",
      "Cordialement,",
    ].join("\n");
  }

  if (opts.kind === "devis") {
    return [
      hello,
      "",
      `Veuillez trouver ci-joint votre devis${refPart}.`,
      "",
      "Je reste disponible pour toute question ou modification.",
      "",
      "Cordialement,",
    ].join("\n");
  }

  // mail (CRM / generic)
  return [
    hello,
    "",
    "Je me permets de vous contacter.",
    "",
    "Cordialement,",
  ].join("\n");
}

// iNrSend : centre d'historique des envois + envoi simple de mails.
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


// Typage historique d'envoi (ancienne table send_items)
type SendType = "mail" | "facture" | "devis";
type Status = "draft" | "sent" | "deleted" | "error";

type MailAccount = {
  id: string;
  provider: "gmail" | "microsoft" | "imap";
  email_address: string;
  display_name: string | null;
  status: string;
};

type SendItem = {
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
  // present in DB (used by Gmail), but not always selected previously
  provider_thread_id?: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type OutboxItem = {
  id: string;
  source: "send_items" | "app_events";
  module?: "booster" | "fideliser";
  folder: Folder;
  provider: string | null; // Gmail / Microsoft / IMAP / Booster / Fidéliser / Admin
  status: Status;
  created_at: string;
  sent_at?: string | null;
  error?: string | null;

  // Affichage liste
  title: string;
  subTitle?: string;
  target: string;
  preview: string;

  // Détails
  detailHtml?: string | null;
  detailText?: string | null;
  // Optional richer details (when available)
  subject?: string | null;
  to?: string | null;
  from?: string | null;
  channels?: string[];
  attachments?: { name: string; type?: string | null; size?: number | null; url?: string | null }[];
  raw?: any;
};

type PublicationParts = {
  title?: string | null;
  content?: string | null;
  cta?: string | null;
  hashtags?: string[];
  attachments?: { name: string; type?: string | null; size?: number | null; url?: string | null }[];
};

function splitList(v?: string | null): string[] {
  if (!v) return [];
  return String(v)
    .split(/[;,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

function extractChannelsFromPayload(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];

  const candidates: any[] = [];
  // common patterns
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

  // 1) HTML (flat or nested)
  const html =
    pickStr(payload, "html", "body_html", "bodyHtml", "content_html", "contentHtml", "message_html", "messageHtml") ||
    pickStr(payload?.post, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    pickStr(payload?.mail, "html", "body_html", "bodyHtml", "content_html", "contentHtml") ||
    null;

  // 2) Text (flat or nested)
  let text =
    pickStr(
      payload,
      "text",
      "body_text",
      "bodyText",
      "message",
      "content",
      "caption",
      "description",
      "prompt"
    ) ||
    coerceText(payload?.post?.content) ||
    coerceText(payload?.post?.text) ||
    coerceText(payload?.post?.message) ||
    coerceText(payload?.mail?.text) ||
    coerceText(payload?.mail?.body_text) ||
    coerceText(payload?.mail?.bodyText) ||
    coerceText(payload?.message) ||
    null;

  // Booster "publish-now" payload: payload.post is an object { title, content, cta, hashtags }
  if (!text && payload?.post && typeof payload.post === "object") {
    const title = pickStr(payload.post, "title") || pickStr(payload, "title");
    const content =
      coerceText(payload.post.content) || coerceText(payload.post.text) || coerceText(payload.post.caption) || null;
    const cta = pickStr(payload.post, "cta") || pickStr(payload, "cta");
    const parts = [title, content, cta].filter(Boolean);
    if (parts.length) text = parts.join("\n");
  }

  // If there are hashtags, append them at the end (nice for publications)
  const tags = (payload as any).hashtags ?? (payload as any)?.post?.hashtags;
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

  return candidates
    .map((a: any) => {
      if (!a) return null;
      if (typeof a === "string") return { name: a };
      const name = a.name || a.filename || a.fileName || a.originalname || a.path || a.url || a.href;
      if (!name) return null;
      return {
        name: String(name),
        type: a.type || a.mime || a.mimeType || null,
        size: typeof a.size === "number" ? a.size : typeof a.bytes === "number" ? a.bytes : null,
        url: a.url || a.href || a.publicUrl || a.public_url || null,
      };
    })
    .filter(Boolean) as any;
}

function extractPublicationParts(payload: any): PublicationParts {
  if (!payload || typeof payload !== "object") return {};
  const post = payload.post && typeof payload.post === "object" ? payload.post : payload;

  const title =
    (typeof post.title === "string" && post.title.trim() ? post.title.trim() : null) ||
    (typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : null) ||
    null;

  const content =
    (typeof post.content === "string" && post.content.trim() ? post.content.trim() : null) ||
    (typeof post.text === "string" && post.text.trim() ? post.text.trim() : null) ||
    (typeof post.message === "string" && post.message.trim() ? post.message.trim() : null) ||
    null;

  const cta =
    (typeof post.cta === "string" && post.cta.trim() ? post.cta.trim() : null) ||
    (typeof payload.cta === "string" && payload.cta.trim() ? payload.cta.trim() : null) ||
    null;

  const hashtagsRaw = (post as any).hashtags ?? (payload as any).hashtags;
  const hashtags = Array.isArray(hashtagsRaw)
    ? hashtagsRaw.map((x: any) => String(x || "").trim()).filter(Boolean)
    : [];

  const attachments = extractAttachmentsFromPayload(payload);

  return { title, content, cta, hashtags, attachments };
}

function folderLabel(f: Folder) {
  switch (f) {
    case "mails":
      return "Mails";
    case "factures":
      return "Factures";
    case "devis":
      return "Devis";
    // Booster (actions: Publier / Récolter / Offrir)
    case "publications":
      return "Publications";
    case "recoltes":
      return "Récoltes";
    case "offres":
      return "Offres";
    // Fidéliser (actions: Informer / Suivre / Enquêter)
    case "informations":
      return "Informations";
    case "suivis":
      return "Suivis";
    case "enquetes":
      return "Enquêtes";
  }
}

type BoxView = "sent" | "drafts" | "trash";

function isVisibleInFolder(folder: Folder, item: OutboxItem, view: BoxView) {
  if (item.folder !== folder) return false;

  // Brouillons : uniquement pour l'historique send_items.
  if (view === "drafts") return item.source === "send_items" && item.status === "draft";
  // Corbeille : tous les éléments "deleted" (send_items + soft-delete local Booster/Fidéliser)
  if (view === "trash") return item.status === "deleted";

  // Vue principale: uniquement les éléments réellement "envoyés" (ou en erreur), jamais les drafts/supprimés.
  return item.status !== "draft" && item.status !== "deleted";
}

function pill(provider?: string | null) {
  const p = (provider || "").toLowerCase();
  if (p === "gmail") return { label: "Gmail", cls: styles.badgeGmail };
  if (p === "microsoft") return { label: "Microsoft", cls: styles.badgeMicrosoft };
  if (p === "imap") return { label: "IMAP", cls: styles.badgeImap };
  return { label: provider || "Mail", cls: styles.badgeDefault };
}

export default function MailboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [folder, setFolder] = useState<Folder>("mails");
  const [boxView, setBoxView] = useState<BoxView>("sent");
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Détails : ouverture en double-clic dans une fenêtre au-dessus (modal)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

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
  const [sendBusy, setSendBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmPickerOpen, setCrmPickerOpen] = useState(false);
  const [crmCategory, setCrmCategory] = useState<"all" | CrmContact["category"]>("all");
  const [crmContactType, setCrmContactType] = useState<"all" | CrmContact["contact_type"]>("all");
  const [crmImportantOnly, setCrmImportantOnly] = useState(false);

  // Used to trigger the hidden file input with a nice button
  const fileInputId = "inrsend-attachments";


  // --- Corbeille locale (Booster / Fidéliser) ---
  // On n'a pas de statut "deleted" côté DB pour app_events,
  // donc on fait un soft-delete côté client (localStorage), par utilisateur.
  function trashKey(userId: string) {
    return `inrsend_trash_ids_${userId}`;
  }

  function readLocalTrash(userId: string): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(trashKey(userId));
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function writeLocalTrash(userId: string, ids: Set<string>) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(trashKey(userId), JSON.stringify(Array.from(ids)));
    } catch {}
  }

  async function softDeleteNonSendItem(id: string) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;
    const s = readLocalTrash(userId);
    s.add(id);
    writeLocalTrash(userId, s);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: "deleted" } : x)));
  }

  async function restoreNonSendItem(id: string) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;
    const s = readLocalTrash(userId);
    s.delete(id);
    writeLocalTrash(userId, s);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: "sent" } : x)));
  }

  async function markLocalTrashOnLoaded(list: OutboxItem[]): Promise<OutboxItem[]> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return list;
    const trash = readLocalTrash(userId);
    if (!trash.size) return list;
    return list.map((it) => (trash.has(it.id) && it.source !== "send_items" ? { ...it, status: "deleted" } : it));
  }

  async function moveToTrash(it: OutboxItem) {
    if (it.source === "send_items") return moveToDeleted(it.id);
    return softDeleteNonSendItem(it.id);
  }

  function itemMailAccountId(it: OutboxItem): string {
    try {
      if (it.source === "send_items") return String((it.raw as any)?.integration_id || "");
      const payload = (it.raw as any)?.payload || (it.raw as any)?.raw?.payload || (it.raw as any)?.meta || {};
      return String((payload as any)?.integration_id || (payload as any)?.mailAccountId || (payload as any)?.accountId || "");
    } catch {
      return "";
    }
  }

  function normalizeEmails(v: string) {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function toggleEmailInTo(email: string) {
    const list = normalizeEmails(to);
    const lower = email.toLowerCase();
    const exists = list.some((x) => x.toLowerCase() === lower);
    const next = exists ? list.filter((x) => x.toLowerCase() !== lower) : [...list, email];
    setTo(next.join(", "));
  }

  // Recherche dans l'historique iNr'Send
  const [historyQuery, setHistoryQuery] = useState("");

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

  const counts = useMemo(() => {
    const c: Record<Folder, number> = {
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
    for (const it of items) {
      // Les compteurs en haut représentent les ENVOIS.
      // Donc: jamais les brouillons, jamais la corbeille.
      if (it.status === "draft" || it.status === "deleted") continue;
      c[it.folder] += 1;
    }
    return c;
  }, [items]);

  function resetCompose() {
    setDraftId(null);
    setComposeType("mail");
    setTo("");
    setSubject("");
    setText("");
    setFiles([]);
    setCrmPickerOpen(false);
  }

  async function loadAccounts() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;

    const { data, error } = await supabase
      .from("integrations")
      .select("id, provider, account_email, settings, status, created_at")
      .eq("user_id", auth.user.id)
      .eq("category", "mail")
      .order("created_at", { ascending: true });

    if (!error && data) {
      const mapped = (data as any[]).map((r) => ({
        id: r.id,
        provider: r.provider,
        email_address: r.account_email,
        display_name: r.settings?.display_name ?? null,
        status: r.status,
        created_at: r.created_at,
      }));
      setMailAccounts(mapped as any);
      // Default selection
      const connected = (data as any[]).filter((a) => a.status === "connected");
      const defaultId = connected[0]?.id || (data as any[])[0]?.id || "";
      setSelectedAccountId((prev) => prev || defaultId);
    }
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const strip = (v: any) =>
        String(v || "")
          .toString()
          .replace(/<[^>]+>/g, "")
          .trim();

      const safeS = (v: any, fallback = "") => {
        const s = strip(v);
        return s || fallback;
      };


      // Conservation max 30 jours (historique visible)
      const cutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // On charge 2 sources :
      // 1) send_items (mails / factures / devis)
      // 2) app_events (Booster + Fidéliser)
      const [sendRes, eventsRes] = await Promise.all([
        supabase
          .from("send_items")
          .select(
            "id, integration_id, type, status, to_emails, subject, body_text, body_html, provider, provider_message_id, provider_thread_id, error, sent_at, created_at, updated_at"
          )
          .eq("user_id", auth.user.id)
          .gte("created_at", cutoffIso)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("app_events")
          .select("id, module, type, payload, created_at")
          .eq("user_id", auth.user.id)
          .in("module", ["booster", "fideliser"])
          .gte("created_at", cutoffIso)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (sendRes.error) console.error(sendRes.error);
      if (eventsRes.error) console.error(eventsRes.error);

      const sendItems = ((sendRes.data || []) as SendItem[])
        .map<OutboxItem>((x) => {
          const folder: Folder = x.type === "facture" ? "factures" : x.type === "devis" ? "devis" : "mails";
          const title = safeS(x.subject, folder === "factures" ? "Facture" : folder === "devis" ? "Devis" : "(sans objet)");
          const preview = safeS(x.body_text || x.body_html, "").slice(0, 140);
          // status = draft | sent | deleted ; error est dérivé du champ error
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
          };
        });

      const eventRows = (eventsRes.data || []) as any[];

      const boosterItems = eventRows
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
  payload?.post?.subject
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

      const fideliserItems = eventRows
        .filter((e) => String(e.module) === "fideliser")
        .map<OutboxItem>((e: any) => {
        const t = String(e.type || "");
        const folder: Folder = t === "newsletter_mail" ? "informations" : t === "thanks_mail" ? "suivis" : "enquetes";
        const payload = (e.payload || {}) as any;
        const title = folder === "informations" ? "Informations" : folder === "suivis" ? "Suivis" : "Enquêtes";
        // Sous-titre affiché dans la liste (ex: titre / objet)
        const subTitle = firstNonEmpty(
          payload?.post?.title,
          payload?.title,
          payload?.subject,
          payload?.post?.subject
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

      let combined = [...sendItems, ...boosterItems, ...fideliserItems].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Filtre "Boîte d'envoi" (quand disponible dans l'item)
      if (filterAccountId) {
        combined = combined.filter((it) => itemMailAccountId(it) === filterAccountId);
      }

      combined = await markLocalTrashOnLoaded(combined);

      setItems(combined);

      if (combined.length > 0) setSelectedId((prev) => prev || combined[0].id);
      else setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  const visibleItems = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (!isVisibleInFolder(folder, it, boxView)) return false;
      if (!q) return true;
      const hay = `${it.title || ""} ${it.subTitle || ""} ${it.target || ""} ${it.preview || ""} ${it.provider || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, folder, historyQuery, boxView]);

  const selected = useMemo(() => {
    return visibleItems.find((x) => x.id === selectedId) || null;
  }, [visibleItems, selectedId]);

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

  const selectedAccount = useMemo(() => {
    return mailAccounts.find((a) => a.id === selectedAccountId) || null;
  }, [mailAccounts, selectedAccountId]);

  
  const toolCfg = useMemo(() => {
    switch (folder) {
      case "mails":
        return { label: "✉️ Envoyer", href: null as string | null };
      case "factures":
        return { label: "📄 Factures", href: "/dashboard/factures" };
      case "devis":
        return { label: "🧾 Devis", href: "/dashboard/devis" };

      // Booster
      case "publications":
        return { label: "📣 Publier", href: "/dashboard/booster?action=publier" };
      case "recoltes":
        return { label: "⭐ Récolter", href: "/dashboard/booster?action=recolter" };
      case "offres":
        return { label: "🏷️ Offrir", href: "/dashboard/booster?action=offrir" };

      // Fidéliser
      case "informations":
        return { label: "📰 Informer", href: "/dashboard/fideliser?action=informer" };
      case "suivis":
        return { label: "🤝 Suivre", href: "/dashboard/fideliser?action=suivre" };
      case "enquetes":
        return { label: "😊 Enquêter", href: "/dashboard/fideliser?action=enqueter" };

      default:
        return { label: "Ouvrir l’outil", href: null as string | null };
    }
  }, [folder]);


  // initial
  useEffect(() => {
    (async () => {
      await loadAccounts();
      await loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recharger l'historique quand le filtre "boîte d'envoi" change
  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAccountId]);

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
  }, [searchParams]);

  // Open compose + prefill basic fields from URL params.
  // Used by:
  // - CRM: /dashboard/mails?compose=1&to=...&from=crm
  // - Factures / Devis: /dashboard/mails?compose=1&to=...&attachKey=...&attachName=...
  useEffect(() => {
    const openRaw = (searchParams?.get("compose") || "").toLowerCase();
    const shouldOpen = openRaw !== "0" && openRaw !== "false" && openRaw !== "";
    if (!shouldOpen) return;

    const toParam = safeDecode(searchParams?.get("to") || "").trim();
    const subjParam = safeDecode(searchParams?.get("subject") || "");
    const textParam = safeDecode(searchParams?.get("text") || "");
    const nameParam = safeDecode(
      searchParams?.get("name") || searchParams?.get("clientName") || searchParams?.get("contactName") || ""
    ).trim();
    const attachKey = safeDecode(searchParams?.get("attachKey") || "").trim();
    const attachName = safeDecode(searchParams?.get("attachName") || "").trim();

    // Determine composer type (optional).
    // If not provided explicitly, we infer it from the attachment path.
    const typeParam = (searchParams?.get("type") || searchParams?.get("sendType") || "").toLowerCase();
    let nextType: SendType = "mail";
    if (typeParam === "facture") nextType = "facture";
    else if (typeParam === "devis") nextType = "devis";
    else if (attachKey.includes("/factures/") || attachKey.includes("/facture/")) nextType = "facture";
    else if (attachKey.includes("/devis/")) nextType = "devis";
    setComposeType(nextType);

    if (toParam) setTo(toParam);
    if (subjParam) setSubject(subjParam);
    if (textParam) setText(textParam);

    // If the caller didn't provide a subject/body, we inject a friendly default template.
    // This keeps the connected tools consistent (CRM/Devis/Factures all go through iNr'SEND compose).
    const docRef = (attachName || attachKey.split("/").pop() || "").replace(/\.pdf$/i, "");
    if (!subjParam?.trim()) {
      if (nextType === "facture") setSubject((prev) => (prev?.trim() ? prev : `Envoi de votre facture ${docRef || ""}`.trim()));
      else if (nextType === "devis") setSubject((prev) => (prev?.trim() ? prev : `Envoi de votre devis ${docRef || ""}`.trim()));
      else if (nameParam) setSubject((prev) => (prev?.trim() ? prev : `Message pour ${nameParam}`));
    }
    if (!textParam?.trim()) {
      setText((prev) => (prev?.trim() ? prev : buildDefaultMailText({ kind: nextType, name: nameParam, docRef })));
    }

    // Open the modal.
    setComposeOpen(true);

    // If we have an attachment key, download it and prefill as File.
    // Guard against re-downloading the same key on re-renders.
    const run = async () => {
      if (!attachKey) return;
      if (lastAttachKeyRef.current === attachKey) return;
      lastAttachKeyRef.current = attachKey;

      try {
        const { data, error } = await supabase.storage.from(ATTACH_BUCKET).download(attachKey);
        if (error || !data) throw error || new Error("download_failed");

        const inferredName = attachName || attachKey.split("/").pop() || "document.pdf";
        const blob = data instanceof Blob ? data : new Blob([data as any]);
        const file = new File([blob], inferredName, { type: blob.type || "application/pdf" });
        setFiles((prev) => {
          // Avoid duplicates
          const already = prev.some((f) => f.name === file.name && f.size === file.size);
          return already ? prev : [file, ...prev];
        });

        // Helpful default subject if the caller didn't prefill it.
        setSubject((prev) => {
          if (prev?.trim()) return prev;
          if (nextType === "facture") return `Facture ${inferredName.replace(/\.pdf$/i, "")}`;
          if (nextType === "devis") return `Devis ${inferredName.replace(/\.pdf$/i, "")}`;
          return prev;
        });
      } catch (e) {
        console.error("Attachment prefill failed", e);
        // Non-blocking: user can still send a mail without the attachment.
        setToast("Impossible de charger la pièce jointe automatiquement.");
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

          if (j?.body_text) setText(String(j.body_text));
          else if (preText) setText(preText);
        } catch {
          if (preSubject) setSubject(preSubject);
          if (preText) setText(preText);
        }
      } else {
        if (preSubject) setSubject(preSubject);
        if (preText) setText(preText);
      }

      setComposeType("mail");
      // Open compose by default (compose=1), but also open when not specified (better UX)
      if (open !== "0" && open !== "false") setComposeOpen(true);
    };

    run();
  }, [searchParams]);

  async function loadCrmContacts() {
    if (crmLoading) return;
    setCrmError(null);
    setCrmLoading(true);

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 12000);
    try {
      // We go through the API route so the same auth method is used as the CRM screens.
      const res = await fetch("/api/crm/contacts", {
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
      const msg = e?.name === "AbortError" ? "Le chargement a expiré. Clique sur “Réessayer”." : "Impossible de charger les contacts.";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!auth?.user) return;

    const payload = {
      user_id: auth.user.id,
      integration_id: selectedAccountId || null,
      type: composeType,
      status: "draft" as const,
      to_emails: to.trim(),
      subject: subject.trim() || null,
      body_text: text || null,
      body_html: null,
      provider: selectedAccount?.provider || null,
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

  function providerSendEndpoint(provider: string) {
    if (provider === "gmail") return "/api/inbox/gmail/send";
    if (provider === "microsoft") return "/api/inbox/microsoft/send";
    return "/api/inbox/imap/send";
  }

  async function doSend() {
    if (!selectedAccount) {
      setToast("Connecte une boîte d’envoi dans Réglages.");
      return;
    }
    const recipients = to.trim();
    if (!recipients) {
      setToast("Ajoute au moins un destinataire.");
      return;
    }
    setSendBusy(true);
    try {
      const fd = new FormData();
      fd.set("accountId", selectedAccount.id);
      fd.set("to", recipients);
      fd.set("subject", subject.trim() || "(sans objet)");
      fd.set("text", text || "");
      // iNr'Send = envoi simple (texte). On garde le champ côté API pour compatibilité,
      // mais on n'expose pas d'éditeur HTML dans l'UI.
      fd.set("html", "");
      fd.set("type", composeType);
      if (draftId) fd.set("sendItemId", draftId);

      for (const f of files) fd.append("files", f);

      const res = await fetch(providerSendEndpoint(selectedAccount.provider), { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.error || "Erreur d’envoi");
        return;
      }

      // Log Booster/Fidéliser event ONLY after a successful send.
      if (pendingTrack) {
        try {
          await fetch(`/api/${pendingTrack.kind}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: pendingTrack.type,
              payload: {
                ...(pendingTrack.payload || {}),
                // Useful context for debugging/analytics
                integration_id: selectedAccount.id,
                to: recipients,
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

      setToast("Envoyé ✅");
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

  async function moveToDeleted(id: string) {
    const { error } = await supabase.from("send_items").update({ status: "deleted" }).eq("id", id);
    if (!error) await loadHistory();
  }

  async function restoreFromDeleted(id: string) {
    // Restore as sent by default (keeps type)
    const { data, error } = await supabase.from("send_items").select("status, type").eq("id", id).single();
    if (error) return;
    const nextStatus: Status = data.status === "deleted" ? "sent" : data.status;
    const { error: e2 } = await supabase.from("send_items").update({ status: nextStatus }).eq("id", id);
    if (!e2) await loadHistory();
  }

  async function deleteForever(id: string) {
    const ok = window.confirm("Supprimer définitivement ce message ? Cette action est irréversible.");
    if (!ok) return;
    const { error } = await supabase.from("send_items").delete().eq("id", id);
    if (!error) {
      setSelectedId(null);
      setDetailsOpen(false);
      setDetailsId(null);
      await loadHistory();
    }
  }

  function openDetails(it: OutboxItem) {
    setSelectedId(it.id);
    setDetailsId(it.id);
    setDetailsOpen(true);
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
        {/* Header (aligné avec les autres modules iNrCy) */}
        <div className={styles.header}>
          {/* Ligne 1 : Logo + titre (gauche) / actions (droite) */}
          <div className={styles.brand}>
            <img src="/inrsend-logo.png" alt="" className={styles.brandIcon} aria-hidden />
            <div className={styles.brandTitle} aria-label="iNr’Send">
              iNr’Send
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.btnGhost} ${styles.iconOnlyBtn} ${styles.hamburgerBtn}`}
              onClick={() => setMobileFoldersOpen(true)}
              type="button"
              aria-label="Dossiers"
              title="Dossiers"
            >
              <span aria-hidden>☰</span>
              <span className={styles.srOnly}>Dossiers</span>
            </button>

            <button
              className={`${styles.btnGhost} ${styles.iconOnlyBtn}`}
              onClick={() => setSettingsOpen(true)}
              type="button"
              aria-label="Réglages"
              title="Réglages"
            >
              <span aria-hidden>⚙️</span>
              <span className={styles.srOnly}>Réglages</span>
            </button>

            <SettingsDrawer
              title="Réglages iNr’Send"
              isOpen={settingsOpen}
              onClose={() => setSettingsOpen(false)}
            >
              <MailsSettingsContent />
            </SettingsDrawer>

            <Link
              className={`${styles.closeBtn} ${styles.iconOnlyBtn}`}
              href="/dashboard"
              title="Fermer iNr’Send"
              aria-label="Fermer"
            >
              <span aria-hidden>✕</span>
              <span className={styles.srOnly}>Fermer</span>
            </Link>
          </div>

          {/* Ligne 2 : Accroche sur toute la largeur */}
          <div className={styles.tagline}>Toutes vos communications, depuis une seule et même machine.</div>
        </div>

        {/* Mobile: menu dossiers (hamburger) */}
        {mobileFoldersOpen ? (
          <div className={styles.mobileMenuOverlay} onClick={() => setMobileFoldersOpen(false)}>
            <div className={styles.mobileMenu} onClick={(e) => e.stopPropagation()}>
              <div className={styles.mobileMenuHeader}>
                <div className={styles.mobileMenuTitle}>Dossiers</div>
                <button className={styles.btnGhost} onClick={() => setMobileFoldersOpen(false)} type="button">
                  ✕
                </button>
              </div>
              <div className={styles.mobileMenuBody}>
                {([
                  "mails",
                  "factures",
                  "devis",
                  "publications",
                  "recoltes",
                  "offres",
                  "informations",
                  "suivis",
                  "enquetes",
                ] as Folder[]).map((f) => {
                  const active = f === folder;
                  return (
                    <button
                      key={f}
                      className={`${styles.mobileFolderBtn} ${active ? styles.mobileFolderBtnActive : ""}`}
                      onClick={() => {
                        updateFolder(f);
                        setMobileFoldersOpen(false);
                      }}
                      type="button"
                    >
                      <span>{folderLabel(f)}</span>
                      <span className={styles.badgeCount}>{counts[f] || 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.grid}>
          {/* List */}
          {/* IMPORTANT: la liste doit occuper toute la hauteur disponible (pas de max-height),
              même s'il n'y a aucun élément. */}
          <div className={`${styles.card} ${styles.listCard}`}>
            {/* Tabs (en haut comme iNr'Box) */}
            <div className={styles.folderTabs}>
              {([
                "mails",
                "factures",
                "devis",
                "publications",
                "recoltes",
                "offres",
                "informations",
                "suivis",
                "enquetes",
              ] as Folder[]).map((f) => {
                const active = f === folder;
                return (
                  <button
                    key={f}
                    className={`${styles.folderTabBtn} ${active ? styles.folderTabBtnActive : ""}`}
                    onClick={() => updateFolder(f)}
                    type="button"
                    title={folderLabel(f)}
                  >
                    <span className={styles.folderTabLabel}>{folderLabel(f)}</span>
                    <span className={styles.badgeCount}>{counts[f] || 0}</span>
                  </button>
                );
              })}
            </div>

            {/* Toolbar (recherche + sélection boîte + refresh) */}
            <div className={styles.toolbarRow}>
              <div className={styles.searchRow}>
                <input
                  className={styles.searchInput}
                  placeholder="Rechercher un envoi…"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                />
                <div className={styles.searchIconRight}>⌕</div>
              </div>

              {/* 🔁 Inversion demandée : Filtrer prend la place du bouton d'action */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className={styles.toolbarInfo}>Filtrer</div>
                <select
                  value={filterAccountId}
                  onChange={(e) => setFilterAccountId(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.22)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.9)",
                    borderRadius: 12,
                    padding: "8px 10px",
                    minWidth: 220,
                  }}
                  title="Filtrer par boîte d’envoi"
                >
                  <option value="">Toutes les boîtes</option>
                  {mailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.display_name ? `${a.display_name} — ` : "") + a.email_address + ` (${a.provider})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.toolbarActions}>
                {/* 🔁 Inversion demandée : bouton d'action passe à droite, à la place de Filtrer */}
                {toolCfg.href ? (
                  <Link className={styles.toolbarBtn} href={toolCfg.href} title={toolCfg.label}>
                    {toolCfg.label}
                  </Link>
                ) : (
                  <button
                    className={styles.toolbarBtn}
                    onClick={() => {
                      resetCompose();
                      setComposeOpen(true);
                    }}
                    type="button"
                  >
                    {toolCfg.label}
                  </button>
                )}

                <button
                  className={`${styles.toolbarBtn} ${boxView === "drafts" ? styles.toolbarBtnActive : ""}`}
                  onClick={() => setBoxView((v) => (v === "drafts" ? "sent" : "drafts"))}
                  type="button"
                  title="Brouillons"
                >
                  Brouillons
                </button>

                <button
                  className={`${styles.toolbarBtn} ${boxView === "trash" ? styles.toolbarBtnActive : ""}`}
                  onClick={() => setBoxView((v) => (v === "trash" ? "sent" : "trash"))}
                  type="button"
                  title="Corbeille"
                >
                  Corbeille
                </button>

                <button
                  className={`${styles.toolbarBtn} ${styles.iconBtn}`}
                  onClick={loadHistory}
                  type="button"
                  title="Actualiser"
                  aria-label="Actualiser"
                >
                  ↻
                </button>
              </div>
            </div>

            <div className={styles.scrollArea}>
              {loading ? (
                <div style={{ padding: 14, color: "rgba(255,255,255,0.75)" }}>Chargement…</div>
              ) : visibleItems.length === 0 ? (
                <div style={{ padding: 14, color: "rgba(255,255,255,0.65)" }}>Aucun élément.</div>
              ) : (
                <div className={styles.list}>
                  {visibleItems.map((it) => {
                    const active = it.id === selectedId;
                    const p = pill(it.provider);

                    const accountLabel = (() => {
                      const acc = mailAccounts.find((a) => a.id === itemMailAccountId(it));
                      if (!acc) return "";
                      return (acc.display_name ? `${acc.display_name} — ` : "") + acc.email_address;
                    })();

                    const midLabel =
                      it.source === "send_items"
                        ? accountLabel
                        : (it.channels && it.channels.length ? it.channels.join(" / ") : it.target);

                    // NOTE: this is a clickable row that contains action buttons.
                    // Using a <button> wrapper would create invalid HTML (nested buttons)
                    // and can trigger hydration errors in Next.js.
                    return (
                      <div
                        key={it.id}
                        className={`${styles.item} ${active ? styles.itemActive : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openItem(it)}
                        onDoubleClick={() => openDetails(it)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openItem(it);
                          }
                        }}
                      >
                        <div className={styles.itemTop}>
                          <div className={styles.fromRow}>
                            <div className={styles.from}>{(it.title || "(sans objet)").slice(0, 70)}</div>
                            <span className={`${styles.badge} ${p.cls}`}>{p.label}</span>
                          </div>

                          {/* Au centre

                          {it.subTitle ? (
                            <div className={styles.itemSubTitle} title={it.subTitle}>
                              {it.subTitle}
                            </div>
                          ) : null}

                          {/* Au centre : boîte d'envoi (mails/factures/devis) ou canaux (publications, etc.) */}
                          <div className={styles.itemMid} title={midLabel || it.target}>
                            {midLabel || ""}
                          </div>

                          <div className={styles.itemRight}>
                            <div className={styles.date}>{new Date(it.created_at).toLocaleString()}</div>


                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={`${styles.iconBtnSmall} ${styles.iconBtnSmallGhost}`}
                                title="Ouvrir"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openDetails(it);
                                }}
                              >
                                ↗
                              </button>

                              {it.status === "deleted" ? (
                                <button
                                  type="button"
                                  className={`${styles.iconBtnSmall} ${styles.iconBtnSmallGhost}`}
                                  title="Restaurer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    it.source === "send_items" ? restoreFromDeleted(it.id) : restoreNonSendItem(it.id);
                                  }}
                                >
                                  ↩
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={`${styles.iconBtnSmall} ${styles.iconBtnSmallDanger}`}
                                  title="Supprimer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    moveToTrash(it);
                                  }}
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                      {detailsItem.source === "send_items" && detailsAccountLabel ? (
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>• {detailsAccountLabel}</span>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {detailsItem ? rememberActions(detailsItem, moveToDeleted, restoreFromDeleted, deleteForever) : null}
                  <button className={styles.btnGhost} onClick={() => setDetailsOpen(false)} type="button">
                    ✕
                  </button>
                </div>
              </div>

              <div className={styles.modalBody}>
                {!detailsItem ? (
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>Sélectionne un élément.</div>
                ) : (
                  <>
                    <div className={styles.detailsLayout}>
                      {/* Meta */}
                      <div className={styles.detailsMeta}>
                        <div className={styles.detailsTitle}>{detailsItem.title || "(sans objet)"}</div>
                        <div className={styles.detailsSub}>
                          {detailsItem.status === "draft"
                            ? "Brouillon"
                            : detailsItem.status === "deleted"
                            ? "Corbeille"
                            : detailsItem.sent_at
                            ? `Envoyé • ${new Date(detailsItem.sent_at).toLocaleString()}`
                            : `Historique • ${new Date(detailsItem.created_at).toLocaleString()}`}
                        </div>

                        {detailsItem.source === "send_items" ? (
                          <div className={styles.metaGrid}>
                            <div className={styles.metaRow}>
                              <div className={styles.metaKey}>Boîte d’envoi</div>
                              <div className={styles.metaVal}>{detailsAccountLabel || "—"}</div>
                            </div>
                            <div className={styles.metaRow}>
                              <div className={styles.metaKey}>Destinataires</div>
                              <div className={styles.metaVal}>
                                {splitList(detailsItem.to || detailsItem.target).join(", ") || "—"}
                              </div>
                            </div>
                            <div className={styles.metaRow}>
                              <div className={styles.metaKey}>Objet</div>
                              <div className={styles.metaVal}>{detailsItem.subject || detailsItem.title || "—"}</div>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.metaGrid}>
                            <div className={styles.metaRow}>
                              <div className={styles.metaKey}>Canaux</div>
                              <div className={styles.metaVal}>
                                {(detailsItem.channels && detailsItem.channels.length
                                  ? detailsItem.channels
                                  : [detailsItem.target]
                                )
                                  .filter(Boolean)
                                  .join(" / ") || "—"}
                              </div>
                            </div>
                          </div>
                        )}

                        {detailsItem.error ? (
                          <div className={styles.detailsError}>
                            <b>Erreur :</b> {detailsItem.error}
                          </div>
                        ) : null}

                        {/* PJ (best-effort) */}
                        {detailsItem.attachments && detailsItem.attachments.length ? (
                          <div className={styles.attachmentsBox}>
                            <div className={styles.attachmentsTitle}>Pièces jointes</div>
                            <div className={styles.attachmentsList}>
                              {detailsItem.attachments.map((a, idx) => (
                                <div key={idx} className={styles.attachmentItem}>
                                  <span className={styles.attachmentName}>{a.name}</span>
                                  {a.type ? <span className={styles.attachmentMeta}>{a.type}</span> : null}
                                  {typeof a.size === "number" ? (
                                    <span className={styles.attachmentMeta}>{Math.round(a.size / 1024)} Ko</span>
                                  ) : null}
                                  {a.url ? (
                                    <a className={styles.attachmentLink} href={a.url} target="_blank" rel="noreferrer">
                                      Ouvrir
                                    </a>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Message */}
                      <div className={styles.detailsMessage}>
                        <div className={styles.messageHeaderRow}>
                          <div className={styles.messageHeaderTitle}>Message</div>
                          {/* Bouton supprimer à droite du message (rappel) */}
                          {detailsItem.status !== "deleted" ? (
                            <button
                              type="button"
                              className={styles.btnDangerSmall}
                              onClick={() => moveToTrash(detailsItem)}
                              title="Supprimer"
                            >
                              🗑 Supprimer
                            </button>
                          ) : null}
                        </div>

                        {/* Détails enrichis pour Publication (Booster) */}
                        {detailsItem.source !== "send_items" ? (() => {
                          const payload = (detailsItem as any)?.raw?.payload || null;
                          const parts = extractPublicationParts(payload);
                          const hasAny = !!(parts.title || parts.content || parts.cta || (parts.hashtags && parts.hashtags.length) || (parts.attachments && parts.attachments.length));
                          if (!hasAny) return null;
                          return (
                            <div className={styles.publicationParts}>
                              {parts.title ? (
                                <div className={styles.publicationTitle}>
                                  <div className={styles.publicationLabel}>Titre</div>
                                  <div className={styles.publicationValue}>{parts.title}</div>
                                </div>
                              ) : null}

                              {parts.content ? (
                                <div className={styles.publicationContent}>
                                  <div className={styles.publicationLabel}>Contenu</div>
                                  <pre className={styles.publicationPre}>{parts.content}</pre>
                                </div>
                              ) : null}

                              {parts.cta ? (
                                <div className={styles.publicationCta}>
                                  <div className={styles.publicationLabel}>CTA</div>
                                  <div className={styles.publicationCtaBox}>{parts.cta}</div>
                                </div>
                              ) : null}

                              {parts.hashtags && parts.hashtags.length ? (
                                <div className={styles.publicationTags}>
                                  <div className={styles.publicationLabel}>Hashtags</div>
                                  <div className={styles.publicationTagRow}>
                                    {parts.hashtags.map((t, idx) => (
                                      <span key={idx} className={styles.publicationTag}>#{t.replace(/^#/, "")}</span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {parts.attachments && parts.attachments.length ? (
                                <div className={styles.publicationAttachments}>
                                  <div className={styles.publicationLabel}>Pièces jointes</div>
                                  <div className={styles.attachmentsList}>
                                    {parts.attachments.map((a, idx) => (
                                      <div key={idx} className={styles.attachmentItem}>
                                        <span className={styles.attachmentName}>{a.name}</span>
                                        {a.type ? <span className={styles.attachmentMeta}>{a.type}</span> : null}
                                        {typeof a.size === "number" ? (
                                          <span className={styles.attachmentMeta}>{Math.round(a.size / 1024)} Ko</span>
                                        ) : null}
                                        {a.url ? (
                                          <a className={styles.attachmentLink} href={a.url} target="_blank" rel="noreferrer">
                                            Ouvrir
                                          </a>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })() : null}
                        {(() => {
                          if (!detailsItem) return null;

                          if (detailsItem.source === "send_items") {
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

                          const payload = (detailsItem as any)?.raw?.payload || null;
                          const parts = extractPublicationParts(payload);
                          const hasStructured = !!(parts.title || parts.content || parts.cta || (parts.hashtags && parts.hashtags.length) || (parts.attachments && parts.attachments.length));

                          const fallbackTitle = firstNonEmpty(payload?.post?.title, payload?.subject, payload?.title);
                          const fallbackContent = firstNonEmpty(payload?.post?.content, payload?.post?.text, payload?.content, payload?.text, payload?.message);
                          const fallbackCta = firstNonEmpty(payload?.post?.cta, payload?.cta);
                          const fallbackHashtags = Array.isArray(payload?.post?.hashtags || payload?.hashtags)
                            ? (payload?.post?.hashtags || payload?.hashtags).map((x: any) => String(x || "").trim()).filter(Boolean)
                            : [];
                          const fallbackAttachments = extractAttachmentsFromPayload(payload);
                          const hasFallbackStructured = !!(fallbackTitle || fallbackContent || fallbackCta || fallbackHashtags.length || fallbackAttachments.length);

                          if (hasStructured || hasFallbackStructured) return null;

                          return (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {detailsItem.source === "send_items" && (detailsItem as any).raw?.status === "draft" ? (
                      <div style={{ marginTop: 14, color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                        Astuce : clique sur ce brouillon dans la liste pour l’ouvrir en édition.
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

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
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      style={{
                        background: "rgba(0,0,0,0.22)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        color: "rgba(255,255,255,0.9)",
                        borderRadius: 12,
                        padding: "8px 10px",
                        minWidth: 280,
                      }}
                    >
                      {mailAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
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
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            <input
                              value={crmFilter}
                              onChange={(e) => setCrmFilter(e.target.value)}
                              placeholder="Rechercher…"
                              style={{ ...inputStyle, padding: "8px 10px", maxWidth: 240 }}
                            />
                            <select
                              value={crmCategory ?? "all"}
                              onChange={(e) => setCrmCategory(e.target.value as any)}
                              style={{
                                background: "rgba(0,0,0,0.22)",
                                border: "1px solid rgba(255,255,255,0.18)",
                                color: "rgba(255,255,255,0.9)",
                                borderRadius: 12,
                                padding: "8px 10px",
                              }}
                              title="Filtrer par catégorie"
                            >
                              <option value="all">Toutes catégories</option>
                              <option value="particulier">Particuliers</option>
                              <option value="professionnel">Professionnels</option>
                              <option value="collectivite_publique">Collectivités</option>
                            </select>
                            <select
                              value={crmContactType ?? "all"}
                              onChange={(e) => setCrmContactType(e.target.value as any)}
                              style={{
                                background: "rgba(0,0,0,0.22)",
                                border: "1px solid rgba(255,255,255,0.18)",
                                color: "rgba(255,255,255,0.9)",
                                borderRadius: 12,
                                padding: "8px 10px",
                              }}
                              title="Filtrer par type"
                            >
                              <option value="all">Tous types</option>
                              <option value="client">Clients</option>
                              <option value="prospect">Prospects</option>
                              <option value="fournisseur">Fournisseurs</option>
                              <option value="partenaire">Partenaires</option>
                              <option value="autre">Autres</option>
                            </select>
                            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
                              <input type="checkbox" checked={crmImportantOnly} onChange={(e) => setCrmImportantOnly(e.target.checked)} />
                              Important
                            </label>
                          </div>

                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => void loadCrmContacts()}
                            disabled={crmLoading}
                            title="Recharger les contacts"
                            style={{ padding: "8px 10px" }}
                          >
                            ↻
                          </button>
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
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Message (texte)</span>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={textareaStyle} />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Pièces jointes</span>
                    <input
                      id={fileInputId}
                      type="file"
                      multiple
                      onChange={(e) => {
                        const next = Array.from(e.target.files || []);
                        setFiles(next);
                      }}
                      className={styles.hiddenFileInput}
                    />

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label htmlFor={fileInputId} className={styles.btnAttach}>
                        📎 Joindre
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                        {files.length > 0 ? `${files.length} fichier(s)` : "Aucun fichier"}
                      </span>
                    </div>

                    {files.length > 0 ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {files.map((f, idx) => (
                          <span key={idx} className={styles.fileChip} title={f.name}>
                            {f.name}
                            <button
                              type="button"
                              className={styles.fileChipRemove}
                              onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
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

function rememberActions(
  selected: OutboxItem,
  moveToDeleted: (id: string) => Promise<void>,
  restoreFromDeleted: (id: string) => Promise<void>,
  deleteForever?: (id: string) => Promise<void>
) {
  if (!selected) return null;
  // Suppression/restauration uniquement sur l'historique "send_items".
  if (selected.source !== "send_items") return null;
  if (selected.status === "error") return null;

  if (selected.status === "deleted" || (selected as any).raw?.status === "deleted") {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className={styles.btnPrimary} onClick={() => restoreFromDeleted(selected.id)} type="button">
          Restaurer
        </button>
        {deleteForever ? (
          <button
            className={`${styles.btnGhost} ${styles.trashBtn}`}
            onClick={() => deleteForever(selected.id)}
            type="button"
            title="Supprimer définitivement"
          >
            Supprimer
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <button
      className={`${styles.btnGhost} ${styles.trashBtn}`}
      onClick={() => moveToDeleted(selected.id)}
      type="button"
      aria-label="Supprimer"
      title="Supprimer"
    >
      🗑️
    </button>
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
