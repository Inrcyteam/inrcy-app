"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./mails.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import SettingsDrawer from "../SettingsDrawer";
import MailsSettingsContent from "../settings/_components/MailsSettingsContent";
import { createClient } from "@/lib/supabaseClient";

type Folder = "inbox" | "important" | "sent" | "drafts" | "spam" | "trash";
type Source = "Gmail" | "Outlook" | "OVH" | "Messenger" | "Houzz";

type MessageItem = {
  id: string;
  folder: Folder;
  prevFolder?: Folder; // utile pour restaurer depuis Corbeille
  from: string;
  subject: string;
  preview: string;
  body: string;
  source: Source;
  dateLabel: string;
  unread?: boolean;
  // Gmail metadata (when source === 'Gmail')
  gmailId?: string;
  gmailThreadId?: string;
  gmailDraftId?: string;
  labelIds?: string[];
  internalDate?: number;
};

type CrmContact = {
  id: string;
  last_name?: string | null;
  first_name?: string | null;
  company_name?: string | null;
  email?: string | null;
};


type MobilePane = "folders" | "cockpit" | "messages";

type ViewMode = "list" | "action";

const FOLDERS: { key: Folder; label: string }[] = [
  { key: "inbox", label: "Réception" },
  { key: "important", label: "Importants" }, // ✅ NOUVEAU
  { key: "sent", label: "Envoyés" },
  { key: "drafts", label: "Brouillons" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Corbeille" },
];


const SOURCES: Source[] = ["Gmail", "Outlook", "OVH", "Messenger"];

function badgeClass(source: Source) {
  if (source === "Messenger") return `${styles.badge} ${styles.badgeMessenger}`;
  if (source === "Houzz") return `${styles.badge} ${styles.badgeHouzz}`;
  return `${styles.badge} ${styles.badgeMail}`;
}

function useIsMobile(breakpointPx = 980) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Mobile UI = small viewport + touch device (coarse pointer / no hover).
    // This prevents "small desktop windows" from being treated like mobile.
    const mqCoarse = window.matchMedia(`(max-width: ${breakpointPx}px) and (pointer: coarse)`);
    const mqNoHover = window.matchMedia(`(max-width: ${breakpointPx}px) and (hover: none)`);

    const compute = () => setIsMobile(mqCoarse.matches || mqNoHover.matches);

    compute();
    mqCoarse.addEventListener?.("change", compute);
    mqNoHover.addEventListener?.("change", compute);

    return () => {
      mqCoarse.removeEventListener?.("change", compute);
      mqNoHover.removeEventListener?.("change", compute);
    };
  }, [breakpointPx]);

  return isMobile;
}

function fmtFolderLabel(f: Folder) {
  if (f === "inbox") return "Réception";
  if (f === "important") return "Importants";
  if (f === "sent") return "Envoyés";
  if (f === "drafts") return "Brouillons";
  if (f === "spam") return "Spam";
  return "Corbeille";
}

function nowLabel() {
  return "Aujourd’hui";
}


function cleanInjectedEmailHtml(html: string) {
  // ✅ Nettoie les "blocs vides" en tête (cas fréquents sur newsletters Gmail)
  // - <br>, <div><br></div>, <p>&nbsp;</p>, etc.
  let out = html || "";

  // Supprime les <br> en tête
  out = out.replace(/^\s*(?:<br\s*\/?>\s*)+/gi, "");

  // Supprime une suite de DIV/P vides en tête
  const emptyBlock =
    "(?:<(?:div|p|span)[^>]*>\\s*(?:&nbsp;|\\s|<br\\s*\\/?>)*\\s*<\\/(?:div|p|span)>\\s*)+";
  out = out.replace(new RegExp("^\\s*" + emptyBlock, "gi"), "");

  // Parfois Gmail ajoute des commentaires/espaces (sans flag 's' pour compat ES2017)
  out = out.replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/gi, "");

  return out.trimStart();
}

export default function MailboxClient() {
  const isMobile = useIsMobile(980);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Bucket Supabase Storage où on dépose les PDF (devis/factures) à joindre dans iNrbox
  const ATTACH_BUCKET = "inrbox_attachments";

  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string>("1");

  // ✅ Multi-sélection (colonne Messages)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Source | "ALL">("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [crmAddedIds, setCrmAddedIds] = useState<Set<string>>(() => new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  // Pré-remplissage reply (évite une string multi-ligne invalide en TS)
  const [replyBody, setReplyBody] = useState("Bonjour,\n\n");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  const [mobilePane, setMobilePane] = useState<MobilePane>("messages");
  const [navOpen, setNavOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [listActionSheetOpen, setListActionSheetOpen] = useState(false);
  const [listActionMessageId, setListActionMessageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedHtml, setSelectedHtml] = useState<string | null>(null);

  const splitName = (full: string) => {
    const t = (full || "").trim();
    if (!t) return { first_name: "", last_name: "" };
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { first_name: "", last_name: parts[0] };
    return { first_name: parts.slice(0, -1).join(" "), last_name: parts.slice(-1).join(" ") };
  };

  async function addToCrm(m: MessageItem) {
    const { name, email } = getContactPrefill(m);
    if (!email) {
      notify("Impossible : aucun email détecté.");
      return;
    }
    const { first_name, last_name } = splitName(name);

    try {
      const r = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name,
          last_name,
          email,
          phone: "",
          address: "",
          category: "particulier",
          contact_type: "prospect",
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Impossible d'ajouter au CRM.");
      setCrmAddedIds((prev) => new Set(prev).add(m.id));
      notify("Ajouté au CRM");
    } catch (e: any) {
      notify(e?.message || "Erreur");
    }
  }

  const getContactPrefill = (m: { from: string }) => {
    // Si un jour tu as "Jean <jean@mail.com>", on récupère l'email.
    const emailMatch = m.from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = emailMatch?.[0] ?? "";
    // Nom = tout ce qui est avant l'email si possible
    const name = email ? m.from.replace(email, "").replace(/[<>]/g, "").trim() : m.from.trim();
    return { name, email };
  };

  // ✅ Toast
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const notify = (text: string) => {
    setToast({ text });
    window.setTimeout(() => setToast(null), 2200);
  };

  // ✅ Modals
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Mock connections
  const [connectedSources, setConnectedSources] = useState<Record<Source, boolean>>({
    Gmail: false,
    Outlook: false,
    OVH: false,
    Messenger: false,
    Houzz: false,
  });

  const toggleConnected = (s: Source) => {
    setConnectedSources((prev) => ({ ...prev, [s]: !prev[s] }));
    notify(`${s} : ${connectedSources[s] ? "déconnecté (mock)" : "connecté (mock)"}`);
  };

  const [messages, setMessages] = useState<MessageItem[]>([]);


  
// ===========================
// Gmail sync (folders + realtime)
// ===========================
const [gmailConnected, setGmailConnected] = useState(false);
const gmailSseRef = useRef<EventSource | null>(null);
const gmailPollRef = useRef<number | null>(null);

const isGmailMessage = (m: MessageItem | undefined | null) =>
  !!m && m.source === "Gmail" && m.id.startsWith("gmail_");

const rawGmailIdFromUiId = (uiId: string) => uiId.replace(/^gmail_/, "");

const matchesFolder = (m: MessageItem, f: Folder) => {
  // Gmail: Important is a label, not a separate Gmail folder.
  if (m.source === "Gmail") {
    if (f === "important") return m.folder === "inbox" && (m.labelIds || []).includes("IMPORTANT");
    return m.folder === f;
  }
  // Other sources: local folders
  return m.folder === f;
};

const folderCount = (f: Folder) => messages.filter((m) => matchesFolder(m, f)).length;

// Drawer badge counts (respect source filter for a coherent UX)
const counts = useMemo(() => {
  const pool = messages.filter((m) => (sourceFilter === "ALL" ? true : m.source === sourceFilter));
  const countFor = (f: Folder) => pool.filter((m) => matchesFolder(m, f)).length;

  return {
    inbox: countFor("inbox"),
    important: countFor("important"),
    sent: countFor("sent"),
    drafts: countFor("drafts"),
    spam: countFor("spam"),
    trash: countFor("trash"),
  } as Record<Folder, number>;
}, [messages, sourceFilter]);

const fetchGmailFolder = async (f: Folder) => {
  // Important is derived from Inbox + IMPORTANT label
  const actualFolder: Folder = f === "important" ? "inbox" : f;
  const res = await fetch(`/api/inbox/gmail/list?folder=${actualFolder}`);
  if (!res.ok) {
    setGmailConnected(false);
    return [];
  }
  setGmailConnected(true);
  const data = await res.json();

  const items: MessageItem[] = (data.items || []).map((m: any) => {
    const labelIds: string[] = Array.isArray(m.labelIds) ? m.labelIds : [];
    const unread = labelIds.includes("UNREAD");

    const internalDate = m.internalDate ? Number(m.internalDate) : undefined;

    return {
      id: `gmail_${m.id}`,
      folder: actualFolder,
      from: m.from || "",
      subject: m.subject || "(Sans objet)",
      preview: m.snippet || "",
      body: m.bodyPreview || m.snippet || "",
      source: "Gmail",
      dateLabel: m.dateLabel || (m.date ? "Aujourd’hui" : "—"),
      unread,
      gmailId: m.id,
      gmailThreadId: m.threadId,
      gmailDraftId: m.draftId,
      labelIds,
      internalDate,
    };
  });

  return items;
};

const upsertGmailMessages = (folderKey: Folder, gmailItems: MessageItem[]) => {
  // Remove existing Gmail items for the target actual folder (important => inbox)
  const actualFolder: Folder = folderKey === "important" ? "inbox" : folderKey;

  setMessages((prev) => {
    const kept = prev.filter((x) => !(x.source === "Gmail" && x.folder === actualFolder));
    // Inject gmail items at the top
    return [...gmailItems, ...kept];
  });
};

const refreshGmail = async (hintFolder?: Folder) => {
  try {
    // Always refresh inbox when viewing important to keep label-based view accurate
    const mustInbox = hintFolder === "important" || folder === "important" || hintFolder === "inbox" || folder === "inbox";
    if (mustInbox) {
      const inboxItems = await fetchGmailFolder("inbox");
      upsertGmailMessages("inbox", inboxItems);
    }

    const target = hintFolder ?? folder;
    if (target !== "inbox" && target !== "important") {
      const items = await fetchGmailFolder(target);
      upsertGmailMessages(target, items);
    }
  } catch {
    // keep UI stable
    setGmailConnected(false);
  }
};

// initial load + refresh on folder change
useEffect(() => {
  refreshGmail(folder);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [folder]);

// realtime: SSE + polling fallback
useEffect(() => {
  // Close previous
  gmailSseRef.current?.close();
  if (gmailPollRef.current) {
    window.clearInterval(gmailPollRef.current);
    gmailPollRef.current = null;
  }

  // Only if Gmail is connected (we'll find out quickly)
  // We still try once: if unauthorized, it will flip gmailConnected to false.
  let stopped = false;

  const start = async () => {
    await refreshGmail(folder);
    if (stopped) return;

    // Try SSE
    try {
      const es = new EventSource(`/api/inbox/gmail/stream?folder=${folder === "important" ? "inbox" : folder}`);
      gmailSseRef.current = es;

      es.onmessage = () => {
        // Refresh inbox for important view too
        refreshGmail(folder);
      };

      es.onerror = () => {
        // fallback to polling
        try {
          es.close();
        } catch {}
        gmailSseRef.current = null;
        if (!gmailPollRef.current) {
          gmailPollRef.current = window.setInterval(() => refreshGmail(folder), 5000) as any;
        }
      };
    } catch {
      // fallback to polling
      if (!gmailPollRef.current) {
        gmailPollRef.current = window.setInterval(() => refreshGmail(folder), 5000) as any;
      }
    }
  };



  start();

  return () => {
    stopped = true;
    gmailSseRef.current?.close();
    gmailSseRef.current = null;
    if (gmailPollRef.current) {
      window.clearInterval(gmailPollRef.current);
      gmailPollRef.current = null;
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [folder]);

  const selected = messages.find((m) => m.id === selectedId);
  const listSheetMessage = listActionMessageId ? messages.find((m) => m.id === listActionMessageId) : null;
  const isInCrm = selected ? crmAddedIds.has(selected.id) : false;

  // ✅ Helpers

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearSelection = () => setSelectedIds(new Set());

  const isSelected = (id: string) => selectedIds.has(id);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (ids: string[]) => setSelectedIds(new Set(ids));

  const computeNextSelectionAfterRemove = (removingIds: string[]) => {
    const remaining = messages
      .filter((m) => !removingIds.includes(m.id))
      .filter((m) => matchesFolder(m, folder))
      .filter((m) => (unreadOnly ? !!m.unread : true))
      .filter((m) => (sourceFilter === "ALL" ? true : m.source === sourceFilter))
      .filter((m) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        const hay = `${m.from} ${m.subject} ${m.preview} ${m.body}`.toLowerCase();
        return hay.includes(q);
      });

    return remaining[0]?.id ?? "";
  };

  const moveMessage = (id: string, target: Folder, opts?: { rememberPrev?: boolean }) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const rememberPrev = opts?.rememberPrev ?? false;
        const prevFolder = rememberPrev ? m.folder : m.prevFolder;
        return { ...m, folder: target, prevFolder };
      })
    );
  };

  const moveMany = (ids: string[], target: Folder, opts?: { rememberPrev?: boolean }) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (!ids.includes(m.id)) return m;
        const rememberPrev = opts?.rememberPrev ?? false;
        const prevFolder = rememberPrev ? m.folder : m.prevFolder;
        return { ...m, folder: target, prevFolder };
      })
    );
  };

  const hardDeleteMany = (ids: string[]) => {
    setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
  };


const markLegitMany = async (ids: string[]) => {
  const gmailRawIds: string[] = [];
  const localIds: string[] = [];

  ids.forEach((id) => {
    const m = messages.find((x) => x.id === id);
    if (m?.source === "Gmail" && id.startsWith("gmail_")) gmailRawIds.push(rawGmailIdFromUiId(id));
    else localIds.push(id);
  });

  if (localIds.length) moveMany(localIds, "inbox");

  if (gmailRawIds.length) {
    // optimistic move
    setMessages((prev) =>
      prev.map((m) => {
        if (!ids.includes(m.id)) return m;
        if (m.source !== "Gmail") return m;
        return { ...m, folder: "inbox" };
      })
    );
    await gmailModify(gmailRawIds, "unspam");
    await refreshGmail("spam");
    await refreshGmail("inbox");
  }
};


const restoreManyFromTrash = async (ids: string[]) => {
  const gmailRawIds: string[] = [];
  const localIds: string[] = [];

  ids.forEach((id) => {
    const m = messages.find((x) => x.id === id);
    if (m?.source === "Gmail" && id.startsWith("gmail_")) gmailRawIds.push(rawGmailIdFromUiId(id));
    else localIds.push(id);
  });

  // Local restore
  if (localIds.length) {
    setMessages((prev) =>
      prev.map((m) => {
        if (!localIds.includes(m.id)) return m;
        const target: Folder = m.prevFolder && m.prevFolder !== "trash" ? m.prevFolder : "inbox";
        return { ...m, folder: target, prevFolder: undefined };
      })
    );
  }

  // Gmail restore
  if (gmailRawIds.length) {
    // optimistic move
    setMessages((prev) =>
      prev.map((m) => {
        if (!ids.includes(m.id)) return m;
        if (m.source !== "Gmail") return m;
        return { ...m, folder: "inbox" };
      })
    );
    await gmailModify(gmailRawIds, "untrash");
    await refreshGmail("trash");
    await refreshGmail("inbox");
  }
};


const emptyTrash = async () => {
  const trashIds = messages.filter((m) => matchesFolder(m, "trash")).map((m) => m.id);
  if (!trashIds.length) return notify("Corbeille déjà vide");

  // Gmail: empty trash for Gmail items
  const gmailTrashRawIds = messages
    .filter((m) => m.source === "Gmail" && m.folder === "trash")
    .map((m) => rawGmailIdFromUiId(m.id));

  try {
    if (gmailTrashRawIds.length && gmailConnected) {
      const r = await fetch("/api/inbox/gmail/empty-trash", { method: "POST" });
      if (!r.ok) throw new Error("Impossible de vider la corbeille Gmail");
    }

    // Local remove of all trash items (Gmail + others)
    hardDeleteMany(trashIds);
    notify("Corbeille vidée");
    clearSelection();
    if (folder === "trash") {
      setSelectedId(computeNextSelectionAfterRemove(trashIds));
    }
  } catch (e: any) {
    notify(e?.message || "Erreur : vidage corbeille");
  } finally {
    // Refresh gmail trash/inbox after emptying
    refreshGmail("trash");
    refreshGmail("inbox");
  }
};


const gmailModify = async (rawIds: string[], action: string) => {
  const r = await fetch("/api/inbox/gmail/modify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: rawIds, action }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg =
      j?.gmailError?.error?.message ||
      j?.details?.error?.message ||
      j?.error ||
      "Action Gmail impossible";
    throw new Error(msg);
  }
};

const makeImportantMany = async (ids: string[]) => {
  const gmailRawIds: string[] = [];
  const localIds: string[] = [];
  ids.forEach((id) => {
    const m = messages.find((x) => x.id === id);
    if (m?.source === "Gmail" && id.startsWith("gmail_")) gmailRawIds.push(rawGmailIdFromUiId(id));
    else localIds.push(id);
  });

  // Local sources keep local behavior
  if (localIds.length) moveMany(localIds, "important", { rememberPrev: true });

  if (gmailRawIds.length) {
    // optimistic local label update
    setMessages((prev) =>
      prev.map((m) => {
        if (!ids.includes(m.id)) return m;
        if (m.source !== "Gmail") return m;
        const labels = new Set(m.labelIds || []);
        labels.add("IMPORTANT");
        return { ...m, labelIds: Array.from(labels) };
      })
    );
    await gmailModify(gmailRawIds, "important");
    await refreshGmail("inbox");
  }
};


const unImportantMany = async (ids: string[]) => {
  const gmailRawIds: string[] = [];
  const localIds: string[] = [];
  ids.forEach((id) => {
    const m = messages.find((x) => x.id === id);
    if (m?.source === "Gmail" && id.startsWith("gmail_")) gmailRawIds.push(rawGmailIdFromUiId(id));
    else localIds.push(id);
  });

  // Local: Important -> return prevFolder if possible, else inbox
  if (localIds.length) {
    setMessages((prev) =>
      prev.map((m) => {
        if (!localIds.includes(m.id)) return m;
        const back: Folder = m.prevFolder && m.prevFolder !== "important" ? m.prevFolder : "inbox";
        return { ...m, folder: back, prevFolder: undefined };
      })
    );
  }

  if (gmailRawIds.length) {
    // optimistic local label update
    setMessages((prev) =>
      prev.map((m) => {
        if (!ids.includes(m.id)) return m;
        if (m.source !== "Gmail") return m;
        const labels = new Set(m.labelIds || []);
        labels.delete("IMPORTANT");
        return { ...m, labelIds: Array.from(labels) };
      })
    );
    await gmailModify(gmailRawIds, "unimportant");
    await refreshGmail("inbox");
  }
};

  const removeMessageFromView = (ids: string[]) => {
    if (ids.includes(selectedId)) {
      setSelectedId(computeNextSelectionAfterRemove(ids));
    }
  };

  // ✅ Liste filtrée (par dossier)
  const filteredMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (!matchesFolder(m, folder)) return false;
      if (unreadOnly && !m.unread) return false;
      if (sourceFilter !== "ALL" && m.source !== sourceFilter) return false;

      if (!q) return true;
      const hay = `${m.from} ${m.subject} ${m.preview} ${m.body}`.toLowerCase();
      return hay.includes(q);
    });
  }, [messages, folder, query, sourceFilter, unreadOnly]);

  // Si le mail sélectionné n'est plus visible, on prend le 1er
  useEffect(() => {
    if (!filteredMessages.length) return;
    const stillThere = filteredMessages.some((m) => m.id === selectedId);
    if (!stillThere) setSelectedId(filteredMessages[0].id);
  }, [filteredMessages, selectedId]);

  // Quand on change de dossier, on vide la multi-sélection
  useEffect(() => {
    clearSelection();
  }, [folder]);


const onSelectMessage = (id: string) => {
  setSelectedId(id);
  setSelectedIds(new Set([id]));

  setMessages((prev) => {
    const msg = prev.find((x) => x.id === id);

    // mark read locally
    const next = prev.map((x) => (x.id === id ? { ...x, unread: false } : x));

    // fetch html gmail + mark read on Gmail
    if (msg?.source === "Gmail" && id.startsWith("gmail_")) {
      setSelectedHtml(null);

      // mark as read on Gmail (best effort)
      const rawId = rawGmailIdFromUiId(id);
      gmailModify([rawId], "read").catch(() => {});

      fetch(`/api/inbox/gmail/message?id=${encodeURIComponent(rawId)}`)
        .then((r) => r.json())
        .then((d) => setSelectedHtml(d?.html ? cleanInjectedEmailHtml(d.html) : null))
        .catch(() => setSelectedHtml(null));
    } else {
      setSelectedHtml(null);
    }

    return next;
  });
};

  const openAction = (id: string) => {
    onSelectMessage(id);
    setViewMode("action");
    if (isMobile) setMobilePane("cockpit");
  };

  const closeAction = () => {
    setViewMode("list");
    if (isMobile) setMobilePane("messages");
  };

  // ESC modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setReplyOpen(false);
        setComposeOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const titleByFolder: Record<Folder, string> = {
    inbox: "Messages",
    important: "Importants",
    sent: "Envoyés",
    drafts: "Brouillons",
    spam: "Indésirables",
    trash: "Corbeille",
  };

  const showFolders = viewMode === "list" && !isMobile;
  const showCockpit = viewMode === "action";
  const showMessages = viewMode === "list";

  // Mobile: close overlays when leaving mobile layout
  useEffect(() => {
    if (!isMobile) {
      setNavOpen(false);
      setActionSheetOpen(false);
    }
  }, [isMobile]);

  // ✅ Compose state (local)
  const [composeTo, setComposeTo] = useState("");

  // --- CRM: import d'un contact dans le compose mail
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [selectedCrmContactId, setSelectedCrmContactId] = useState<string>("");

  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSource, setComposeSource] = useState<Source>("Gmail");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);

  // ✅ Applique un contact CRM au compose (pré-remplit le destinataire et optionnellement une salutation)
  const applyCrmContactToCompose = (c: CrmContact) => {
    const email = (c.email || "").trim();
    if (email) setComposeTo(email);

    // Ajoute une salutation si le body est vide ou juste "Bonjour,".
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    const displayName = fullName || (c.company_name || "").trim();
    const normalized = (composeBody || "").trim();
    const looksEmpty = normalized === "" || normalized === "Bonjour," || normalized === "Bonjour";
    if (looksEmpty) {
      const greet = displayName ? `Bonjour ${displayName},\n\n` : "Bonjour,\n\n";
      setComposeBody(greet);
    }
  };

  // ✅ Pré-remplissage depuis le CRM (ex: /dashboard/mails?compose=1&to=a@x.fr,b@y.fr)
  useEffect(() => {
    const compose = searchParams.get("compose");
    const to = (searchParams.get("to") || "").trim();
    const attachKey = (searchParams.get("attachKey") || "").trim();
    const attachName = (searchParams.get("attachName") || "").trim();
    if ((compose === "1" || compose === "true") && to) {
      setComposeTo(to);
      setComposeSubject("");
      setComposeBody("Bonjour,\n\n");
      setComposeOpen(true);

      // ✅ Si un PDF a été uploadé dans Supabase Storage, on le récupère et on l'ajoute en PJ
      // (utile pour facture/devis → iNrbox)
      if (attachKey) {
        (async () => {
          try {
            const { data, error } = await supabase
              .storage
              .from(ATTACH_BUCKET)
              .download(attachKey);
            if (error) throw error;

            const blob = data as Blob;
            const name = attachName || attachKey.split("/").pop() || "document.pdf";
            const file = new File([blob], name, { type: blob.type || "application/pdf" });
            setComposeFiles((prev) => [file, ...prev]);
          } catch (e) {
            console.error("Impossible de charger la pièce jointe", e);
          }
        })();
      }

      // Nettoie l'URL (évite de ré-ouvrir la fenêtre au refresh/back)
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("compose");
      cleaned.searchParams.delete("to");
      cleaned.searchParams.delete("from");
      cleaned.searchParams.delete("attachKey");
      cleaned.searchParams.delete("attachName");
      router.replace(cleaned.pathname + (cleaned.search ? cleaned.search : ""));
    }
  }, [searchParams, supabase]);

  const createMessagePreview = (body: string) => {
    const firstLine = body.replace(/\n+/g, " ").trim();
    if (!firstLine) return "—";
    return firstLine.length > 46 ? `${firstLine.slice(0, 46)}…` : firstLine;
  };

  const openComposeBlank = () => {
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeSource("Gmail");
    setComposeFiles([]);
    setComposeOpen(true);
  };

  const openComposeFromDraft = (draft: MessageItem) => {
    setComposeTo(draft.from === "(Sans destinataire)" ? "" : draft.from);
    setComposeSubject(draft.subject.replace(/^Brouillon —\s*/i, ""));
    setComposeBody(draft.body || "");
    setComposeSource(draft.source);
    setComposeFiles([]);
    setComposeOpen(true);
  };

  const saveDraftFromCompose = () => {
    const id = `${Date.now()}`;
    const draft: MessageItem = {
      id,
      folder: "drafts",
      from: composeTo || "(Sans destinataire)",
      subject: composeSubject ? `Brouillon — ${composeSubject}` : "Brouillon — (sans objet)",
      preview: createMessagePreview(composeBody),
      body: composeBody || "",
      source: composeSource,
      dateLabel: "Brouillon",
      unread: false,
    };

    setMessages((prev) => [draft, ...prev]);
    notify("Brouillon enregistré");
    setComposeOpen(false);
    setFolder("drafts");
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    if (isMobile) setMobilePane("cockpit");
  };

  const sendFromCompose = async () => {
    try {
      if (!composeTo?.trim()) {
        notify("Ajoute un destinataire");
        return;
      }

      const fd = new FormData();
      fd.append("to", composeTo.trim());
      fd.append("subject", composeSubject || "(sans objet)");
      fd.append("text", composeBody || "");
      composeFiles.forEach((f) => fd.append("files", f));

      const r = await fetch("/api/inbox/gmail/send", {
        method: "POST",
        body: fd,
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          j?.gmailError?.error?.message ||
          j?.details?.error?.message ||
          j?.error ||
          "Envoi impossible";
        throw new Error(msg);
      }

      const id = `gmail_sent_${j.id || Date.now()}`;
      const msg: MessageItem = {
        id,
        folder: "sent",
        from: composeTo || "(Sans destinataire)",
        subject: composeSubject || "(sans objet)",
        preview: createMessagePreview(composeBody),
        body: composeBody || "",
        source: composeSource,
        dateLabel: nowLabel(),
        unread: false,
      };

      setMessages((prev) => [msg, ...prev]);
      notify("Message envoyé ✅");
      setComposeOpen(false);
      setComposeFiles([]);
      setFolder("sent");
      setSelectedId(id);
      setSelectedIds(new Set([id]));
      if (isMobile) setMobilePane("cockpit");
    } catch (e: any) {
      notify(e?.message || "Erreur d’envoi");
    }
  };

  const openReply = () => {
    setReplyBody("Bonjour,\n\n");
    setReplyFiles([]);
    setReplyOpen(true);
  };

  // ✅ Reply handlers
  const replySendLocal = async () => {
    if (!selected) return;

    // ✅ Si le mail vient de Gmail, on répond dans le thread Gmail
    if (selected.id.startsWith("gmail_") && selected.source === "Gmail") {
      try {
        const gmailId = selected.id.replace(/^gmail_/, "");

        const fd = new FormData();
        fd.append("text", replyBody || "");
        replyFiles.forEach((f) => fd.append("files", f));

        const r = await fetch(`/api/inbox/gmail/reply?id=${encodeURIComponent(gmailId)}`, {
          method: "POST",
          body: fd,
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg =
            j?.gmailError?.error?.message ||
            j?.details?.error?.message ||
            j?.error ||
            "Réponse impossible";
          throw new Error(msg);
        }

        const id = `gmail_sent_${j.id || Date.now()}`;
        const msg: MessageItem = {
          id,
          folder: "sent",
          from: selected.from,
          subject: `Re: ${selected.subject}`,
          preview: createMessagePreview(replyBody || ""),
          body: replyBody || "",
          source: "Gmail",
          dateLabel: nowLabel(),
          unread: false,
        };

        setMessages((prev) => [msg, ...prev]);
        notify("Réponse envoyée ✅");
        setReplyOpen(false);
        setReplyFiles([]);
        setFolder("sent");
        setSelectedId(id);
        setSelectedIds(new Set([id]));
        if (isMobile) setMobilePane("cockpit");
      } catch (e: any) {
        notify(e?.message || "Erreur d’envoi");
      }
      return;
    }

    // Fallback : autres sources => local
    const id = `${Date.now()}`;
    const msg: MessageItem = {
      id,
      folder: "sent",
      from: selected.from,
      subject: `Re: ${selected.subject}`,
      preview: createMessagePreview(replyBody || ""),
      body: replyBody || "Réponse envoyée (local)\n\n(Étape OAuth plus tard)",
      source: selected.source === "Houzz" ? "Houzz" : selected.source,
      dateLabel: nowLabel(),
      unread: false,
    };
    setMessages((prev) => [msg, ...prev]);
    notify("Réponse envoyée (local)");
    setReplyOpen(false);
    setReplyFiles([]);
    setFolder("sent");
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    if (isMobile) setMobilePane("cockpit");
  };

  const replySaveDraftLocal = () => {
    if (!selected) return;
    const id = `${Date.now()}`;
    const draft: MessageItem = {
      id,
      folder: "drafts",
      from: selected.from,
      subject: `Brouillon — Re: ${selected.subject}`,
      preview: createMessagePreview(replyBody || ""),
      body: replyBody || "",
      source: selected.source,
      dateLabel: "Brouillon",
      unread: false,
    };
    setMessages((prev) => [draft, ...prev]);
    notify("Brouillon créé");
    setReplyOpen(false);
    setFolder("drafts");
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    if (isMobile) setMobilePane("cockpit");
  };

  // ✅ Actions selon dossier (multi sélection)
  const visibleIds = filteredMessages.map((m) => m.id);
  const hasSelection = selectedIds.size > 0;
  const selectionIds = Array.from(selectedIds);


const moveToTrashMany = async (ids: string[]) => {
  const gmailRawIds: string[] = [];
  const localIds: string[] = [];

  ids.forEach((id) => {
    const m = messages.find((x) => x.id === id);
    if (m?.source === "Gmail" && id.startsWith("gmail_")) gmailRawIds.push(rawGmailIdFromUiId(id));
    else localIds.push(id);
  });

  if (localIds.length) moveMany(localIds, "trash", { rememberPrev: true });

  if (gmailRawIds.length) {
    // optimistic move
    setMessages((prev) =>
      prev.map((m) => {
        if (!ids.includes(m.id)) return m;
        if (m.source !== "Gmail") return m;
        return { ...m, folder: "trash" };
      })
    );
    await gmailModify(gmailRawIds, "trash");
    await refreshGmail("inbox");
    await refreshGmail("trash");
  }
};

const bulkDeleteToTrash = async () => {
  if (!selectionIds.length) return;
  await moveToTrashMany(selectionIds);
  notify(`Supprimé (${selectionIds.length}) → Corbeille`);
  removeMessageFromView(selectionIds);
  clearSelection();
};

  const bulkRestoreFromTrash = async () => {
    if (!selectionIds.length) return;
    await restoreManyFromTrash(selectionIds);
    notify(`Restauré (${selectionIds.length})`);
    removeMessageFromView(selectionIds);
    clearSelection();
  };

  const bulkLegitFromSpam = async () => {
    if (!selectionIds.length) return;
    await markLegitMany(selectionIds);
    notify(`Courrier légitime (${selectionIds.length}) → Réception`);
    removeMessageFromView(selectionIds);
    clearSelection();
  };

  const bulkImportant = async () => {
    if (!selectionIds.length) return;
    await makeImportantMany(selectionIds);
    notify(`Ajouté aux Importants (${selectionIds.length})`);
    removeMessageFromView(selectionIds);
    clearSelection();
  };

  const bulkUnImportant = async () => {
    if (!selectionIds.length) return;
    await unImportantMany(selectionIds);
    notify(`Retiré des Importants (${selectionIds.length})`);
    removeMessageFromView(selectionIds);
    clearSelection();
  };

  const bulkDeleteForever = () => {
    if (!selectionIds.length) return;
    hardDeleteMany(selectionIds);
    notify(`Supprimé définitivement (${selectionIds.length})`);
    removeMessageFromView(selectionIds);
    clearSelection();
  };

  // ✅ Cockpit actions (message sélectionné)
  const singleMoveToTrash = async () => {
    if (!selected) return;
    await moveToTrashMany([selected.id]);
    notify("Déplacé vers Corbeille");
    removeMessageFromView([selected.id]);
    clearSelection();
  };


const singleMoveToSpam = async () => {
  if (!selected) return;

  if (isGmailMessage(selected)) {
    const rawId = rawGmailIdFromUiId(selected.id);
    // optimistic
    setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, folder: "spam" } : m)));
    try {
      await gmailModify([rawId], "spam");
      notify("Déplacé vers Spam");
      await refreshGmail("inbox");
      await refreshGmail("spam");
    } catch (e: any) {
      notify(e?.message || "Erreur spam");
      await refreshGmail("inbox");
      await refreshGmail("spam");
    }
    removeMessageFromView([selected.id]);
    clearSelection();
    return;
  }

  moveMessage(selected.id, "spam", { rememberPrev: true });
  notify("Déplacé vers Spam");
  removeMessageFromView([selected.id]);
  clearSelection();
};

  const singleLegit = async () => {
    if (!selected) return;
    await markLegitMany([selected.id]);
    notify("Courrier légitime → Réception");
    removeMessageFromView([selected.id]);
    clearSelection();
  };

  const singleRestore = async () => {
    if (!selected) return;
    await restoreManyFromTrash([selected.id]);
    notify("Restauré depuis Corbeille");
    removeMessageFromView([selected.id]);
    clearSelection();
  };

  const singleImportant = async () => {
    if (!selected) return;
    await makeImportantMany([selected.id]);
    notify("Ajouté aux Importants");
    removeMessageFromView([selected.id]);
    clearSelection();
  };

  const singleUnImportant = async () => {
    if (!selected) return;
    await unImportantMany([selected.id]);
    notify("Retiré des Importants");
    removeMessageFromView([selected.id]);
    clearSelection();
  };

  const singleResumeDraft = () => {
    if (!selected) return;
    openComposeFromDraft(selected);
    notify("Reprendre le brouillon");
  };

  // ✅ Swipe helpers (operate on a specific message id)
  const isImportantMessage = (m?: MessageItem | null) => {
    if (!m) return false;
    if (m.source === "Gmail") return (m.labelIds || []).includes("IMPORTANT");
    return m.folder === "important";
  };

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        {/* Header */}
        <div className={styles.topbar}>
          {!isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src="/inrbox-logo.png"
                alt="iNr’Box"
                style={{ width: 154, height: 64, display: "block" }}
              />
            </div>
          ) : (
            <div className={styles.mobileTopbarLeft}>
              {viewMode === "action" ? (
                <button
                  className={styles.mobileNavBtn}
                  type="button"
                  onClick={closeAction}
                  aria-label="Retour"
                  title="Retour"
                >
                  ←
                </button>
              ) : (
                <button
                  className={styles.mobileNavBtn}
                  type="button"
                  onClick={() => setNavOpen(true)}
                  aria-label="Menu"
                  title="Menu"
                >
                  ☰
                </button>
              )}

              <div className={styles.mobileTopbarTitle}>
                {viewMode === "action" ? "Action" : titleByFolder[folder]}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            {viewMode === "action" && !isMobile && (
              <button className={styles.btnGhost} type="button" onClick={closeAction} title="Retour à la liste">
                ← Retour
              </button>
            )}

            {!isMobile ? (
              <>
                <button
                  className={styles.btnGhost}
                  title="Réglages iNr’Box"
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                >
                  ⚙️ Réglages
                </button>

                <button className={styles.btnPrimary} onClick={openComposeBlank} type="button">
                  ✍️ Écrire
                </button>

                <Link href="/dashboard" className={styles.btnGhost} title="Fermer iNr’Box">
                  Fermer
                </Link>
              </>
            ) : (
              <div className={styles.mobileTopbarRight}>
                <button
                  className={styles.mobileIconBtnPrimary}
                  title="Écrire"
                  type="button"
                  onClick={openComposeBlank}
                >
                  ✍️
                </button>

                {viewMode === "action" ? (
                  <button
                    className={styles.mobileActionsPill}
                    type="button"
                    onClick={() => setActionSheetOpen(true)}
                    title="Ouvrir les actions"
                  >
                    ☰ Actions
                  </button>
                ) : (
                  <button
                    className={styles.mobileIconBtn}
                    title="Recherche (bientôt)"
                    type="button"
                    onClick={() => notify("Recherche bientôt disponible")}
                  >
                    🔎
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile navigation drawer */}
        {isMobile && (
          <>
            <div
              className={`${styles.mobileOverlay} ${navOpen ? styles.mobileOverlayOpen : ""}`}
              onClick={() => setNavOpen(false)}
              aria-hidden="true"
            />
            <aside
              className={`${styles.mobileDrawer} ${navOpen ? styles.mobileDrawerOpen : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label="Menu iNr’Box"
            >
              <div className={styles.mobileDrawerHeader}>
                <div className={styles.mobileDrawerBrand}>iNr’Box</div>
                <button
                  className={styles.mobileDrawerClose}
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Fermer"
                  title="Fermer"
                >
                  ✕
                </button>
              </div>

              <div className={styles.mobileDrawerSection}>
                <div className={styles.mobileDrawerSectionTitle}>Dossiers</div>
                <div className={styles.mobileDrawerList}>
                  {FOLDERS.map((f) => {
                    const active = f.key === folder;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        className={`${styles.mobileDrawerItem} ${active ? styles.mobileDrawerItemActive : ""}`}
                        onClick={() => {
                          setFolder(f.key);
                          setNavOpen(false);
                          setViewMode("list");
                        }}
                      >
                        <span className={styles.mobileDrawerItemLabel}>{f.label}</span>
                        {counts[f.key] > 0 && (
                          <span className={styles.mobileDrawerBadge} aria-label={`${counts[f.key]} messages`}>
                            {counts[f.key]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.mobileDrawerSection}>
                <div className={styles.mobileDrawerSectionTitle}>Comptes</div>
                <div className={styles.mobileDrawerChips}>
                  {(["ALL", ...SOURCES] as const).map((s) => {
                    const active = sourceFilter === s;
                    const label = s === "ALL" ? "Tous" : s;
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`${styles.mobileChip} ${active ? styles.mobileChipActive : ""}`}
                        onClick={() => {
                          setSourceFilter(s);
                          setNavOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.mobileDrawerFooter}>
                <button
                  className={styles.mobileDrawerFooterBtn}
                  type="button"
                  onClick={() => {
                    setSettingsOpen(true);
                    setNavOpen(false);
                  }}
                >
                  ⚙️ Réglages
                </button>
                <Link href="/dashboard" className={styles.mobileDrawerFooterBtn} onClick={() => setNavOpen(false)}>
                  ✖️ Fermer
                </Link>
              </div>
            </aside>
          </>
        )}

        
        {/* Mobile action sheet (liste) */}
        {isMobile && viewMode === "list" && listSheetMessage && (
          <>
            <div
              className={`${styles.sheetOverlay} ${listActionSheetOpen ? styles.sheetOverlayOpen : ""}`}
              onClick={() => setListActionSheetOpen(false)}
              aria-hidden="true"
            />
            <div
              className={`${styles.sheet} ${listActionSheetOpen ? styles.sheetOpen : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label="Actions message"
            >
              <div className={styles.sheetHandle} />
              <div className={styles.sheetTitleRow}>
                <button className={styles.sheetClose} type="button" onClick={() => setListActionSheetOpen(false)} aria-label="Fermer">
                  ✕
                </button>
              </div>

              <div className={styles.sheetPrimary}>
                <button
                  className={styles.sheetPrimaryBtn}
                  type="button"
                  onClick={() => {
                    setListActionSheetOpen(false);
                    openAction(listSheetMessage.id);
                  }}
                >
                  👁️ Ouvrir le message
                </button>
              </div>

              <div className={styles.sheetList}>
                {isImportantMessage(listSheetMessage) ? (
                  <button
                    className={styles.sheetItem}
                    type="button"
                    onClick={() => {
                      setListActionSheetOpen(false);
                      singleUnImportant();
                    }}
                  >
                    ⭐ Retirer des importants
                  </button>
                ) : (
                  <button
                    className={styles.sheetItem}
                    type="button"
                    onClick={() => {
                      setListActionSheetOpen(false);
                      singleImportant();
                    }}
                  >
                    ⭐ Mettre en important
                  </button>
                )}

                <button
                  className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
                  type="button"
                  onClick={() => {
                    setListActionSheetOpen(false);
                    moveToTrashMany([listSheetMessage.id]);
                  }}
                >
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          </>
        )}

{/* Mobile action sheet */}
        {isMobile && viewMode === "action" && selected && (
          <>
            <div
              className={`${styles.sheetOverlay} ${actionSheetOpen ? styles.sheetOverlayOpen : ""}`}
              onClick={() => setActionSheetOpen(false)}
              aria-hidden="true"
            />
            <div
              className={`${styles.sheet} ${actionSheetOpen ? styles.sheetOpen : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label="Actions"
            >
              <div className={styles.sheetHandle} />
              <div className={styles.sheetTitleRow}>
                <button className={styles.sheetClose} type="button" onClick={() => setActionSheetOpen(false)} aria-label="Fermer">
                  ✕
                </button>
              </div>

              <div className={styles.sheetPrimary}>
                <button className={styles.sheetPrimaryBtn} type="button" onClick={() => { setActionSheetOpen(false); openReply(); }}>
                  🚀 Répondre & Convertir
                </button>
              </div>

              <div className={styles.sheetList}>
                {/* Important toggle */}
                {(selected.source === "Gmail" ? (selected.labelIds || []).includes("IMPORTANT") : selected.folder === "important") ? (
                  <button className={styles.sheetItem} type="button" onClick={() => { setActionSheetOpen(false); singleUnImportant(); }}>
                    ⭐ Retirer des importants
                  </button>
                ) : (
                  <button className={styles.sheetItem} type="button" onClick={() => { setActionSheetOpen(false); singleImportant(); }}>
                    ⭐ Mettre en important
                  </button>
                )}

                {/* Draft */}
                {selected.folder === "drafts" ? (
                  <button className={styles.sheetItem} type="button" onClick={() => { setActionSheetOpen(false); singleResumeDraft(); }}>
                    ▶️ Reprendre le brouillon
                  </button>
                ) : (
                  <button
                    className={styles.sheetItem}
                    type="button"
                    onClick={() => {
                      setActionSheetOpen(false);
                      const id = `${Date.now()}`;
                      const draft: MessageItem = {
                        id,
                        folder: "drafts",
                        from: selected.from,
                        subject: `Brouillon — ${selected.subject}`,
                        preview: selected.preview,
                        body: selected.body,
                        source: selected.source,
                        dateLabel: "Brouillon",
                        unread: false,
                      };
                      setMessages((prev) => [draft, ...prev]);
                      notify("Brouillon créé");
                      setFolder("drafts");
                      setSelectedId(id);
                      setSelectedIds(new Set([id]));
                    }}
                  >
                    📝 Créer un brouillon
                  </button>
                )}

                {/* Spam / Legit */}
                {selected.folder === "spam" ? (
                  <button className={styles.sheetItem} type="button" onClick={() => { setActionSheetOpen(false); singleLegit(); }}>
                    ✅ Marquer légitime
                  </button>
                ) : (
                  <button className={styles.sheetItem} type="button" onClick={() => { setActionSheetOpen(false); singleMoveToSpam(); }}>
                    🚫 Mettre en spam
                  </button>
                )}

                {/* Trash / Restore */}
                {selected.folder === "trash" ? (
                  <button className={styles.sheetItem} type="button" onClick={() => { setActionSheetOpen(false); singleRestore(); }}>
                    ♻️ Restaurer
                  </button>
                ) : (
                  <button className={`${styles.sheetItem} ${styles.sheetItemDanger}`} type="button" onClick={() => { setActionSheetOpen(false); singleMoveToTrash(); }}>
                    🗑️ Supprimer
                  </button>
                )}

                {/* Business */}
                <button
                  className={styles.sheetItem}
                  type="button"
                  onClick={() => {
                    setActionSheetOpen(false);
                    const params = new URLSearchParams();
                    params.set("from", selected.from);
                    params.set("subject", selected.subject);
                    router.push(`/dashboard/facture?${params.toString()}`);
                  }}
                >
                  🧾 Facture
                </button>
                <button
                  className={styles.sheetItem}
                  type="button"
                  onClick={() => {
                    setActionSheetOpen(false);
                    const params = new URLSearchParams();
                    params.set("from", selected.from);
                    params.set("subject", selected.subject);
                    router.push(`/dashboard/devis?${params.toString()}`);
                  }}
                >
                  📄 Devis
                </button>
                <button
                  className={styles.sheetItem}
                  type="button"
                  onClick={() => {
                    setActionSheetOpen(false);
                    notify("Ajout CRM (bientôt)");
                  }}
                >
                  👤 Ajouter CRM
                </button>
              </div>
            </div>
          </>
        )}

        {/* GRID */}
        <div className={`${styles.grid} ${viewMode === "list" ? styles.gridList : styles.gridAction}`}>
          {/* Colonne gauche */}
          {showFolders && (
            <aside className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>Dossiers</div>
              </div>

              <div className={`${styles.scrollArea} ${styles.scrollAreaAction}`}>
                <div className={styles.nav}>
                  {FOLDERS.map((f) => {
                    const active = f.key === folder;
                    return (
                      <button
                        key={f.key}
                        className={`${styles.navBtn} ${active ? styles.navBtnActive : ""}`}
                        onClick={() => setFolder(f.key)}
                        type="button"
                        title={titleByFolder[f.key]}
                      >
                        <span>{f.label}</span>
                        {/* ✅ Bulles quantité dans chaque dossier */}
                        <span className={styles.badgeCount}>{folderCount(f.key)}</span>
                      </button>
                    );
                  })}

                  <div style={{ height: 10 }} />

                  <div
                    style={{
                      color: "rgba(255,255,255,0.70)",
                      fontSize: 13,
                      fontWeight: 850,
                    }}
                  >
                    Sources
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {(["Gmail", "Outlook", "OVH", "Messenger"] as const).map((x) => (
                      <span key={x} className={badgeClass(x)}>
                        {x}
                      </span>
                    ))}
                  </div>

                  <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    {titleByFolder[folder]}
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* ACTION plein écran (au double-clic) */}
          {showCockpit && (
            <section className={styles.card}>
              <div className={`${styles.scrollArea} ${styles.scrollAreaAction}`}>
                <div style={{ minHeight: "100%" }}>
                  {!selected ? (
                    <div
                      style={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        color: "rgba(255,255,255,0.70)",
                        padding: 20,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
                          🚀 Prêt à agir
                        </div>
                        <div style={{ fontSize: 14, maxWidth: 360 }}>
                          Sélectionne un message à droite pour le lire, répondre, et le transformer.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.reader}>
                      {/* ✅ Header compact (2 lignes max) */}
                      <div className={styles.readerHeader}>
                        <div className={styles.readerSubject}>{selected.subject}</div>

                        <div className={styles.readerInfoRow}>
                          <span className={badgeClass(selected.source)}>{selected.source}</span>

                          <span className={styles.readerInfoText} title={`${selected.from} • ${selected.dateLabel}`}>
                            <b style={{ color: "rgba(255,255,255,0.90)" }}>{selected.from}</b> • {selected.dateLabel}
                          </span>

                          {/* Navigation dans la liste visible */}
                          <div className={styles.readerNav}>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              title="Message précédent"
                              onClick={() => {
                                const idx = filteredMessages.findIndex((x) => x.id === selected.id);
                                if (idx > 0) onSelectMessage(filteredMessages[idx - 1].id);
                              }}
                              disabled={filteredMessages.findIndex((x) => x.id === selected.id) <= 0}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              title="Message suivant"
                              onClick={() => {
                                const idx = filteredMessages.findIndex((x) => x.id === selected.id);
                                if (idx >= 0 && idx < filteredMessages.length - 1)
                                  onSelectMessage(filteredMessages[idx + 1].id);
                              }}
                              disabled={
                                (() => {
                                  const idx = filteredMessages.findIndex((x) => x.id === selected.id);
                                  return idx < 0 || idx >= filteredMessages.length - 1;
                                })()
                              }
                            >
                              →
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className={`${styles.actionStack} ${styles.actionFixedWidth}`}> 
  {/* CTA + Actions rapides (desktop) */}
  {!isMobile && (
    <>
{/* CTA principal */}
  <button
    className={styles.actionHero}
    type="button"
    onClick={openReply}
    title="Répondre au message"
  >
    <span className={styles.actionHeroIcon} aria-hidden="true">🚀</span>
    <span className={styles.actionHeroText}>Répondre & Convertir</span>
  </button>

  {/* Actions rapides (grandes, ordonnées) */}
  <div className={styles.actionTiles}>
    {/* <span className={styles.bulkIcon}>⭐</span><span className={styles.bulkText}>Important</span> / retirer important */}
    {(selected.source === "Gmail" ? (selected.labelIds || []).includes("IMPORTANT") : selected.folder === "important") ? (
      <button
        className={styles.actionTile}
        type="button"
        title="Retirer des Importants"
        onClick={singleUnImportant}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          ⭐
        </span>
        <span className={styles.actionTileLabel}>Retirer</span>
      </button>
    ) : (
      <button
        className={styles.actionTile}
        type="button"
        title="Mettre en Important"
        onClick={singleImportant}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          ⭐
        </span>
        <span className={styles.actionTileLabel}>Important</span>
      </button>
    )}

    {/* Brouillons : Reprendre / Créer */}
    {selected.folder === "drafts" ? (
      <button
        className={styles.actionTile}
        type="button"
        title="Reprendre le brouillon"
        onClick={singleResumeDraft}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          ▶️
        </span>
        <span className={styles.actionTileLabel}>Reprendre</span>
      </button>
    ) : (
      <button
        className={styles.actionTile}
        type="button"
        title="Créer un brouillon à partir de ce message"
        onClick={() => {
          const id = `${Date.now()}`;
          const draft: MessageItem = {
            id,
            folder: "drafts",
            from: selected.from,
            subject: `Brouillon — ${selected.subject}`,
            preview: selected.preview,
            body: selected.body,
            source: selected.source,
            dateLabel: "Brouillon",
            unread: false,
          };
          setMessages((prev) => [draft, ...prev]);
          notify("Brouillon créé");
          setFolder("drafts");
          setSelectedId(id);
          setSelectedIds(new Set([id]));
          if (isMobile) setMobilePane("cockpit");
        }}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          📝
        </span>
        <span className={styles.actionTileLabel}>Brouillon</span>
      </button>
    )}

    {/* Spam / Légitime / Houzz */}
    {selected.folder === "spam" ? (
      <button
        className={styles.actionTile}
        type="button"
        title="Courrier légitime"
        onClick={singleLegit}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          ✅
        </span>
        <span className={styles.actionTileLabel}>Légitime</span>
      </button>
    ) : selected.source === "Houzz" ? (
      <button
        className={styles.actionTile}
        type="button"
        title="Répondre dans Houzz"
        onClick={() => notify("Houzz : étape OAuth plus tard")}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          ↗️
        </span>
        <span className={styles.actionTileLabel}>Houzz</span>
      </button>
    ) : (
      <button
        className={styles.actionTile}
        type="button"
        title="Marquer comme spam"
        onClick={singleMoveToSpam}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          🚫
        </span>
        <span className={styles.actionTileLabel}>Spam</span>
      </button>
    )}

    {/* Corbeille : Restaurer / Supprimer */}
    {selected.folder === "trash" ? (
      <button
        className={styles.actionTile}
        type="button"
        title="Restaurer depuis Corbeille"
        onClick={singleRestore}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          ♻️
        </span>
        <span className={styles.actionTileLabel}>Restaurer</span>
      </button>
    ) : (
      <button
        className={`${styles.actionTile} ${styles.actionTileDanger}`}
        type="button"
        title="Supprimer"
        onClick={singleMoveToTrash}
      >
        <span className={styles.actionTileIcon} aria-hidden="true">
          🗑️
        </span>
        <span className={styles.actionTileLabel}>Supprimer</span>
      </button>
    )}
  </div>
    </>
  )}

  {/* Actions business (Devis / Facture / CRM) - desktop only */}
  {!isMobile && (
  <div className={styles.actionTilesBusiness}>
    {/* 🧾 Facture */}
    <button
      className={`${styles.actionTile} ${styles.actionTileOverlay}`}
      type="button"
      title="Envoyer une facture"
      onClick={() => {
        if (!selected) return;
        const { name, email } = getContactPrefill(selected);
        const params = new URLSearchParams({
          name,
          email,
          source: selected.source,
          from: "inrbox",
        });
        router.push(`/dashboard/facture?${params.toString()}`);
      }}
    >
      <span className={styles.actionTileIcon} aria-hidden="true">
        🧾
      </span>
      <span className={styles.actionTileLabel}>Facture</span>
      <span
        className={`${styles.iconOverlayBadge} ${styles.badgeFacture} ${styles.actionTileBadge}`}
        aria-hidden="true"
      >
        €
      </span>
    </button>

    {/* 📄 Devis */}
    <button
      className={`${styles.actionTile} ${styles.actionTileOverlay}`}
      type="button"
      title="Envoyer un devis"
      onClick={() => {
        if (!selected) return;
        const { name, email } = getContactPrefill(selected);
        const params = new URLSearchParams({
          name,
          email,
          source: selected.source,
          from: "inrbox",
        });
        router.push(`/dashboard/devis?${params.toString()}`);
      }}
    >
      <span className={styles.actionTileIcon} aria-hidden="true">
        📄
      </span>
      <span className={styles.actionTileLabel}>Devis</span>
      <span className={`${styles.iconOverlayBadge} ${styles.badgeDevis} ${styles.actionTileBadge}`} aria-hidden="true">
        ✍️
      </span>
    </button>

    {/* 👤 CRM */}
    {!isInCrm ? (
      <button
        className={`${styles.actionTile} ${styles.actionTileAccent}`}
        type="button"
        title="Ajouter au CRM"
        onClick={() => {
          if (!selected) return;
          addToCrm(selected);
        }}
      >
        <svg className={styles.actionTileSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 12c2.2 0 4-1.8 4-4S14.2 4 12 4 8 5.8 8 8s1.8 4 4 4Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M4.5 20c1.2-3.4 4.1-5.5 7.5-5.5s6.3 2.1 7.5 5.5"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M18.5 9v4M16.5 11h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.actionTileLabel}>Ajouter CRM</span>
      </button>
    ) : (
      <button
        className={`${styles.actionTile} ${styles.actionTileSuccess}`}
        type="button"
        title="Déjà dans le CRM"
        onClick={() => notify("Déjà dans le CRM")}
      >
        <svg className={styles.actionTileSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 12c2.2 0 4-1.8 4-4S14.2 4 12 4 8 5.8 8 8s1.8 4 4 4Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M4.5 20c1.2-3.4 4.1-5.5 7.5-5.5s6.3 2.1 7.5 5.5"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M16.5 11.5l1.8 1.8 3.2-3.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.actionTileLabel}>Déjà CRM</span>
      </button>
    )}
  </div>
  )}

  {/* Actions dossier “Corbeille” en plus */}
  {folder === "trash" && (
    <div style={{ width: "100%", display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className={styles.btnGhost} type="button" onClick={emptyTrash} title="Vider la corbeille">
        <span className={styles.bulkIcon}>🧹</span><span className={styles.bulkText}>Vider corbeille</span>
      </button>
    </div>
  )}
</div><div className={styles.readerBody}>
                        {selectedHtml ? (
                          <div className={styles.gmailHtml} dangerouslySetInnerHTML={{ __html: selectedHtml }} />
                        ) : (
                          <div className={styles.plainText}>{selected.body}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Colonne droite: messages (LISTE) */}
          {showMessages && (
            <section className={styles.card}>
              {/* Mobile premium search (sticky) */}
              {isMobile && viewMode === "list" && (
                <div className={styles.mobileSearchSticky}>
                  <div className={styles.mobileSearchPill}>
                    <span className={styles.mobileSearchIcon} aria-hidden="true">🔎</span>
                    <input
                      className={styles.mobileSearchInput}
                      placeholder="Rechercher dans iNr’Box…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      inputMode="search"
                    />
                    {query ? (
                      <button
                        type="button"
                        className={styles.mobileSearchClear}
                        onClick={() => setQuery("")}
                        aria-label="Effacer"
                        title="Effacer"
                      >
                        ✕
                      </button>
                    ) : (
                      <span className={styles.mobileSearchHint} aria-hidden="true">⌘</span>
                    )}
                  </div>

                  <div className={styles.mobileQuickFilters}>
                    <button
                      type="button"
                      className={`${styles.mobileQuickChip} ${unreadOnly ? styles.mobileQuickChipActive : ""}`}
                      onClick={() => setUnreadOnly((v) => !v)}
                      title="Afficher seulement les non lus"
                    >
                      Non lus
                    </button>
                    <button
                      type="button"
                      className={styles.mobileQuickChip}
                      onClick={() => setNavOpen(true)}
                      title="Choisir une source"
                    >
                      {sourceFilter === "ALL" ? "Tous" : sourceFilter}
                    </button>
                    {(sourceFilter !== "ALL" || unreadOnly) && (
                      <button
                        type="button"
                        className={styles.mobileQuickChip}
                        onClick={() => {
                          setSourceFilter("ALL");
                          setUnreadOnly(false);
                        }}
                        title="Réinitialiser"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Search + filters */}
              <div className={`${styles.filtersWrap} ${isMobile ? styles.filtersWrapDesktopOnly : ""}`}>
                <div className={styles.searchRow}>
                  <input
                    className={styles.searchInput}
                    placeholder="Rechercher un message…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className={styles.searchIconRight}>⌕</div>
                </div>

                <div className={styles.filterBar}>
                  <button
                    type="button"
                    className={styles.filterBtn}
                    onClick={() => setFiltersOpen((v) => !v)}
                    title="Ouvrir les filtres"
                  >
                    Filtrer
                  </button>

                  {(sourceFilter !== "ALL" || unreadOnly) && (
                    <button
                      type="button"
                      className={styles.filterBtn}
                      onClick={() => {
                        setSourceFilter("ALL");
                        setUnreadOnly(false);
                      }}
                      title="Réinitialiser les filtres"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>

                {filtersOpen && (
                  <div className={styles.filterPanel}>
                    <div className={styles.filterRow}>
                      <span className={styles.smallLabel}>État</span>
                      <button
                        type="button"
                        className={`${styles.chip} ${unreadOnly ? styles.chipActive : ""}`}
                        onClick={() => setUnreadOnly((v) => !v)}
                        title="Afficher seulement les non lus"
                      >
                        Non lus
                      </button>
                    </div>

                    <div className={styles.filterRow}>
                      <span className={styles.smallLabel}>Source</span>

                      <button
                        type="button"
                        className={`${styles.chip} ${sourceFilter === "ALL" ? styles.chipActive : ""}`}
                        onClick={() => setSourceFilter("ALL")}
                      >
                        Tous
                      </button>

                      {(["Gmail", "Outlook", "OVH", "Messenger", "Houzz"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`${styles.chip} ${sourceFilter === s ? styles.chipActive : ""}`}
                          onClick={() => setSourceFilter(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ✅ Barre actions multi-sélection */}
                <div className={styles.bulkBar}>
                  <div className={styles.bulkLeft}>
                    <button
                      className={styles.bulkBtn}
                      type="button"
                      onClick={() => (hasSelection ? clearSelection() : selectAllVisible(visibleIds))}
                      title={hasSelection ? "Tout désélectionner" : "Tout sélectionner"}
                    >
                      {hasSelection ? "✖ Désélectionner" : "✓ Tout sélectionner"}
                    </button>

                    <span className={styles.bulkInfo}>
                      {hasSelection ? `${selectedIds.size} sélectionné(s)` : `${filteredMessages.length} visible(s)`}
                    </span>
                  </div>

                  <div className={styles.bulkActions}>
                    {/* Important */}
                    {folder !== "important" ? (
                      <button
                        className={styles.bulkBtn}
                        type="button"
                        disabled={!hasSelection}
                        onClick={bulkImportant}
                        title="Mettre en Importants"
                      >
                        <span className={styles.bulkIcon}>⭐</span><span className={styles.bulkText}>Important</span>
                      </button>
                    ) : (
                      <button
                        className={styles.bulkBtn}
                        type="button"
                        disabled={!hasSelection}
                        onClick={bulkUnImportant}
                        title="Retirer des Importants"
                      >
                        <span className={styles.bulkIcon}>⭐</span><span className={styles.bulkText}>Retirer</span>
                      </button>
                    )}

                    {/* Corbeille / Spam contextuels */}
                    {folder === "trash" ? (
                      <>
                        <button
                          className={styles.bulkBtn}
                          type="button"
                          disabled={!hasSelection}
                          onClick={bulkRestoreFromTrash}
                          title="Restaurer depuis corbeille"
                        >
                          <span className={styles.bulkIcon}>♻️</span><span className={styles.bulkText}>Restaurer</span>
                        </button>
                        <button
                          className={styles.bulkBtnDanger}
                          type="button"
                          disabled={!hasSelection}
                          onClick={bulkDeleteForever}
                          title="Supprimer définitivement"
                        >
                          <span className={styles.bulkIcon}>🧨</span><span className={styles.bulkText}>Supprimer</span>
                        </button>
                        <button
                          className={styles.bulkBtnDanger}
                          type="button"
                          onClick={emptyTrash}
                          title="Vider corbeille"
                        >
                          <span className={styles.bulkIcon}>🧹</span><span className={styles.bulkText}>Vider</span>
                        </button>
                      </>
                    ) : folder === "spam" ? (
                      <>
                        <button
                          className={styles.bulkBtn}
                          type="button"
                          disabled={!hasSelection}
                          onClick={bulkLegitFromSpam}
                          title="Courrier légitime"
                        >
                          <span className={styles.bulkIcon}>✅</span><span className={styles.bulkText}>Légitime</span>
                        </button>
                        <button
                          className={styles.bulkBtnDanger}
                          type="button"
                          disabled={!hasSelection}
                          onClick={bulkDeleteToTrash}
                          title="Supprimer (vers corbeille)"
                        >
                          <span className={styles.bulkIcon}>🗑️</span><span className={styles.bulkText}>Supprimer</span>
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.bulkBtnDanger}
                        type="button"
                        disabled={!hasSelection}
                        onClick={bulkDeleteToTrash}
                        title="Supprimer (vers corbeille)"
                      >
                        <span className={styles.bulkIcon}>🗑️</span><span className={styles.bulkText}>Supprimer</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Liste */}
              <div className={`${styles.scrollArea} ${styles.scrollAreaMessages}`}>
                <div className={`${styles.list} ${hasSelection ? styles.selectionMode : ""}`}>
                  {filteredMessages.map((m) => {
                    const active = m.id === selectedId;
                    const checked = isSelected(m.id);

                    return (
                      <div
                        key={m.id}
                        className={`${styles.itemRow} ${active ? styles.itemRowActive : ""} ${checked ? styles.itemRowSelected : ""}`}
                      >
                        <label
                          className={`${styles.checkWrap} ${checked ? styles.checkWrapChecked : ""}`}
                          onClick={(e) => e.stopPropagation()}
                          title="Sélection multiple"
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleSelect(m.id)} />
                        </label>

                        <button
                          className={`${styles.item} ${active ? styles.itemActive : ""}`}
                          onClick={() => {
                            if (isMobile && hasSelection) {
                              toggleSelect(m.id);
                              return;
                            }
                            onSelectMessage(m.id);
                          }}
                          onDoubleClick={() => openAction(m.id)}
                          onPointerDown={() => {
                            if (!isMobile) return;

                            // long-press -> actions (important / supprimer / ouvrir)
                            longPressTriggeredRef.current = false;
                            if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = window.setTimeout(() => {
                              longPressTriggeredRef.current = true;
                              setSelectedId(m.id);
                              setListActionMessageId(m.id);
                              setListActionSheetOpen(true);
                            }, 450);
                          }}
                          onPointerUp={(e) => {
                            if (!isMobile) return;

                            if (longPressTimerRef.current) {
                              window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                            if (longPressTriggeredRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          onPointerCancel={() => {
                            if (longPressTimerRef.current) {
                              window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          type="button"
                        >
                          <div className={styles.itemTop}>
                            <div className={styles.fromRow}>
                              {m.unread && <span className={styles.dotUnread} />}
                              <div className={styles.from}>{m.from}</div>
                              <span className={badgeClass(m.source)}>{m.source}</span>
                            </div>
                            <div className={styles.date}>{m.dateLabel}</div>
                          </div>
                          <div className={styles.subject}>{m.subject}</div>
                          <div className={styles.preview}>{m.preview}</div>
                        </button>
	                      </div>
	                    );
	                  })}

	                  {!filteredMessages.length && (
                    <div style={{ padding: 16, color: "rgba(255,255,255,0.70)" }}>
                      Aucun message dans <b>{fmtFolderLabel(folder)}</b>.
                    </div>
                  )}
                </div>
              </div>

              {/* Charger plus (fixé en bas) */}
              <div className={styles.loadMoreWrap}>
                <button className={styles.btnGhost} type="button" onClick={() => notify("Charger plus (mock)")}>
                  Charger plus
                </button>
              </div>
            </section>
          )}
        </div>

        {/* SETTINGS drawer */}
<SettingsDrawer
  {...({ open: settingsOpen, isOpen: settingsOpen } as any)}
  onClose={() => setSettingsOpen(false)}
  title="Réglages iNr’Box"
>
  <MailsSettingsContent />
</SettingsDrawer>

        {/* Toast */}
        {toast && (
          <div className={styles.toast} role="status" aria-live="polite">
            {toast.text}
          </div>
        )}

        {/* Compose Modal */}
        {composeOpen && (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Écrire un message</div>
                <button className={styles.iconBtn} type="button" onClick={() => setComposeOpen(false)} title="Fermer">
                  ✖
                </button>
              </div>

              <div className={styles.modalBody}>
                
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Importer un contact (CRM)</label>
                    <select
                      className={styles.formInput}
                      value={selectedCrmContactId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedCrmContactId(id);
                        const c = crmContacts.find((x) => String(x.id) === String(id));
                        if (c) applyCrmContactToCompose(c);
                      }}
                      disabled={crmLoading}
                    >
                      <option value="">
                        {crmLoading ? "Chargement..." : "Sélectionner un contact"}
                      </option>
                      {crmContacts.map((c) => {
                        const label =
                          (c.company_name && c.company_name.trim()) ||
                          [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
                          (c.last_name || "").trim() ||
                          "(Sans nom)";
                        return (
                          <option key={c.id} value={c.id}>
                            {label}{c.email ? ` — ${c.email}` : ""}
                          </option>
                        );
                      })}
                    </select>
                    {crmError ? (
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                        ⚠️ {crmError}
                      </div>
                    ) : null}
                  </div>

<div className={styles.formGrid}>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>À</label>
                    <input
                      className={styles.formInput}
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      placeholder="destinataire@mail.com"
                    />
                  </div>

                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Objet</label>
                    <input
                      className={styles.formInput}
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      placeholder="Objet"
                    />
                  </div>

                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Source</label>
                    <select
                      className={styles.selectDark}
                      value={composeSource}
                      onChange={(e) => setComposeSource(e.target.value as Source)}
                    >
                      <option value="Gmail">Gmail</option>
                      <option value="Outlook">Outlook</option>
                      <option value="OVH">OVH</option>
                      <option value="Messenger">Messenger</option>
                      <option value="Houzz">Houzz</option>
                    </select>
                  </div>

                  <div className={styles.formRow} style={{ gridColumn: "1 / -1" }}>
                    <label className={styles.formLabel}>Message</label>
                    <textarea
                      className={styles.formTextarea}
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="Votre message…"
                      rows={8}
                    />
                  
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      <label className={styles.btnGhost} style={{ width: "fit-content", cursor: "pointer" }}>
                        📎 Joindre
                        <input
                          hidden
                          type="file"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setComposeFiles((prev) => [...prev, ...files]);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>

                      {composeFiles.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {composeFiles.map((f, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 12, opacity: 0.9 }}>{f.name}</span>
                              <button
                                type="button"
                                className={styles.btnGhost}
                                onClick={() => setComposeFiles((p) => p.filter((_, idx) => idx !== i))}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
</div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.btnGhost} type="button" onClick={saveDraftFromCompose}>
                  📝 Enregistrer brouillon
                </button>
                <button className={styles.btnPrimary} type="button" onClick={sendFromCompose}>
                  ✉️ Envoyer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reply Modal */}
        {replyOpen && selected && (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Répondre</div>
                <button className={styles.iconBtn} type="button" onClick={() => setReplyOpen(false)} title="Fermer">
                  ✖
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13 }}>
                  À : <b style={{ color: "rgba(255,255,255,0.92)" }}>{selected.from}</b>
                </div>
                <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, marginTop: 6 }}>
                  Objet : <b style={{ color: "rgba(255,255,255,0.92)" }}>{`Re: ${selected.subject}`}</b>
                </div>

                <textarea
                  className={styles.formTextarea}
                  style={{ marginTop: 12 }}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={8}
                />

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  <label className={styles.btnGhost} style={{ width: "fit-content", cursor: "pointer" }}>
                    📎 Joindre
                    <input
                      hidden
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setReplyFiles((prev) => [...prev, ...files]);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {replyFiles.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {replyFiles.map((f, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 12, opacity: 0.9 }}>{f.name}</span>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => setReplyFiles((p) => p.filter((_, idx) => idx !== i))}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.btnGhost} type="button" onClick={replySaveDraftLocal}>
                  📝 Brouillon
                </button>
                <button className={styles.btnPrimary} type="button" onClick={replySendLocal}>
                  ✉️ Envoyer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
