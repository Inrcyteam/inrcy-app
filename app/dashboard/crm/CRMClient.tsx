"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./crm.module.css";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { readAccountCacheValue, writeAccountCacheValue } from "@/lib/browserAccountCache";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";

type Category = "" | "particulier" | "professionnel" | "collectivite_publique";
type ContactType = "" | "client" | "prospect" | "fournisseur" | "partenaire" | "autre";

type CrmContact = {
  id: string;
  last_name: string;
  first_name: string;
  company_name?: string;
  siret?: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  postal_code?: string;
  category: Category;
  notes?: string;
  important?: boolean;

  contact_type: ContactType;
  created_at: string;
};

type CrmSummary = {
  total: number;
  prospects: number;
  clients: number;
  partenaires: number;
  fournisseurs: number;
  autres: number;
};

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const CATEGORY_LABEL: Record<Exclude<Category, "">, string> = {
  particulier: "Particulier",
  professionnel: "Professionnel",
  collectivite_publique: "Institution",
};

const TYPE_LABEL: Record<Exclude<ContactType, "">, string> = {
  client: "Client",
  prospect: "Prospect",
  fournisseur: "Fournisseur",
  partenaire: "Partenaire",
  autre: "Autre",
};

const CATEGORY_LABEL_SHORT: Record<Exclude<Category, "">, string> = {
  particulier: "Part",
  professionnel: "Pro",
  collectivite_publique: "Inst",
};

const TYPE_LABEL_SHORT: Record<Exclude<ContactType, "">, string> = {
  client: "Client",
  prospect: "Prosp",
  fournisseur: "Fourn",
  partenaire: "Parten",
  autre: "Autre",
};


function emptyDraft() {
  return {
    display_name: "",
    siret: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    category: "" as Category,
    contact_type: "" as ContactType,
    notes: "",
    important: false,
  };

}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsvValue(v: any) {
  const s = String(v ?? "");
  const needsWrap = /[",;\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsWrap ? `"${escaped}"` : escaped;
}

function contactsToCsv(rows: any[]) {
  const headers = [
    "display_name",
    "last_name",
    "first_name",
    "company_name",
    "siret",
    "email",
    "phone",
    "address",
    "city",
    "postal_code",
    "category",
    "contact_type",
    "notes",
    "important",
  ];
  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => toCsvValue((r as any)[h])).join(";")),
  ];
  return lines.join("\n");
}

function detectDelimiter(line: string) {
  const c = (line.match(/,/g) || []).length;
  const s = (line.match(/;/g) || []).length;
  const t = (line.match(/\t/g) || []).length;
  if (s >= c && s >= t) return ";";
  if (t >= c && t >= s) return "\t";
  return ",";
}

function parseCsv(text: string) {
  const clean = (text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [] as Record<string, string>[];
  const delim = detectDelimiter(lines[0]);

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
        if (inQ && next === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (!inQ && ch === delim) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((ln) => {
    const cols = parseLine(ln);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    return obj;
  });
}

function parseBooleanLike(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "vrai", "oui", "yes", "y", "x", "important", "★"].includes(normalized);
}

async function loadXlsxModule() {
  return (await import("@/lib/vendor/xlsx.mjs")) as any;
}

function normalizeImportedRow(row: any) {
  // mapping souple (CSV/Excel)
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (row?.[k] != null && String(row[k]).trim() !== "") return row[k];
    }
    return "";
  };

  return {
    display_name: String(pick("display_name", "Nom / RS", "Nom", "Raison sociale", "Entreprise")).trim(),
    last_name: String(pick("last_name", "Nom")).trim(),
    first_name: String(pick("first_name", "Prénom", "Prenom")).trim(),
    company_name: String(pick("company_name", "Entreprise", "Raison sociale", "Societe", "Société")).trim(),
    siret: String(pick("siret")).trim(),
    email: String(pick("email", "Email", "Mail", "E-mail")).trim(),
    phone: String(pick("phone", "Téléphone", "Telephone", "Tel")).trim(),
    address: String(pick("address", "Adresse")).trim(),
    city: String(pick("city", "Ville")).trim(),
    postal_code: String(pick("postal_code", "Code postal", "CP")).trim(),
    category: String(pick("category", "Categorie", "Catégorie")).trim(),
    contact_type: String(pick("contact_type", "Type", "Type de contact")).trim(),
    notes: String(pick("notes", "Notes", "Commentaires", "Commentaire")).trim(),
    important: parseBooleanLike(pick("important", "Important", "Favori", "Favorite", "Star")),
  };
}


function buildDisplayName(c: Pick<CrmContact, "last_name" | "first_name" | "company_name">) {
  const left = [c.last_name ?? "", c.first_name ?? ""].join(" ").replace(/\s+/g, " ").trim();
  const right = (c.company_name ?? "").trim();
  if (left && right) return `${left} / ${right}`;
  return left || right;
}

function parseDisplayName(v: string) {
  const raw = (v || "").trim();
  if (!raw) return { last_name: "", first_name: "", company_name: "" };

  const parts = raw.split("/");
  const left = (parts[0] || "").trim();
  const right = (parts.slice(1).join("/") || "").trim();

  // ⚠️ Heuristique simple (en attendant Supabase): on stocke "Nom Prénom" dans last_name,
  // first_name reste vide, et la partie après "/" va dans company_name.
  return { last_name: left, first_name: "", company_name: right };
}

function typeBadgeClass(t: ContactType) {
  if (!t) return `${styles.typeBadge}`;
  if (t === "client") return `${styles.typeBadge} ${styles.typeClient}`;
  if (t === "prospect") return `${styles.typeBadge} ${styles.typeProspect}`;
  if (t === "fournisseur") return `${styles.typeBadge} ${styles.typeFournisseur}`;
  return `${styles.typeBadge} ${styles.typePartenaire}`;
}

function categoryBadgeClass(c: Category) {
  if (!c) return `${styles.catBadge}`;
  if (c === "professionnel") return `${styles.catBadge} ${styles.catPro}`;
  if (c === "collectivite_publique") return `${styles.catBadge} ${styles.catPublic}`;
  return `${styles.catBadge} ${styles.catPart}`;
}

export default function CRMClient() {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();

  // Toujours arriver en haut du module (évite de récupérer le scroll du dashboard)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  }, []);

  // --- Responsive (table & layout) ---
  const [isResponsive, setIsResponsive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setIsResponsive(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);


  // Orientation: gérée globalement via <OrientationGuard />

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pageCount, setPageCount] = useState(1);
  const [kpis, setKpis] = useState<CrmSummary>({
    total: 0,
    prospects: 0,
    clients: 0,
    partenaires: 0,
    fournisseurs: 0,
    autres: 0,
  });
  const [query, setQuery] = useState("");
  const [serverQuery, setServerQuery] = useState("");
  const requestSeqRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  // Mobile UI
  const [addOpen, setAddOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"" | "csv" | "xlsx">("");

  // ✅ Sélection multi-contacts (pour actions : mail, etc.)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(() => new Set());
  const [selectedContactsById, setSelectedContactsById] = useState<Record<string, CrmContact>>({});
  const [importantIds, setImportantIds] = useState<Set<string>>(() => {
    try {
      const raw = readAccountCacheValue("inrcy_crm_important_ids");
      const ids = raw ? JSON.parse(raw) : [];
      return new Set<string>(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  });
  const [notesById, setNotesById] = useState<Record<string, string>>(() => {
    try {
      const raw = readAccountCacheValue("inrcy_crm_notes_by_id");
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? (obj as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft>>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  const mergeContactWithLocalState = useCallback(
    (contact: CrmContact) => ({
      ...contact,
      notes: (contact?.notes ?? notesById?.[contact.id] ?? "") as string,
      important: Boolean(contact?.important || importantIds.has(contact.id)),
    }),
    [importantIds, notesById],
  );

  const loadContacts = useCallback(
    async (options?: { page?: number; pageSize?: number; query?: string; preserveSuccess?: boolean }) => {
      const targetPage = Math.max(1, options?.page ?? page);
      const targetPageSize = options?.pageSize ?? pageSize;
      const targetQuery = options?.query ?? serverQuery;
      const requestId = ++requestSeqRef.current;

      setLoading(true);
      setError(null);
      if (!options?.preserveSuccess) setSuccess(null);

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(targetPageSize),
        });
        if (targetQuery) params.set("q", targetQuery);

        const r = await fetch(`/api/crm/contacts?${params.toString()}`, { method: "GET" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible de charger les contacts du CRM."));
        if (requestId !== requestSeqRef.current) return;

        const nextTotal = typeof j?.total === "number" ? j.total : 0;
        const nextPageCount = Math.max(1, typeof j?.pageCount === "number" ? j.pageCount : 1);
        const safePage = Math.min(targetPage, nextPageCount);

        if (targetPage > nextPageCount && nextTotal > 0) {
          setPage(safePage);
          return;
        }

        const base = Array.isArray(j?.contacts) ? j.contacts : [];
        const merged = base.map((c: CrmContact) => mergeContactWithLocalState(c));

        setContacts(merged);
        setTotal(nextTotal);
        setPage(safePage);
        setPageSize(typeof j?.pageSize === "number" ? j.pageSize : targetPageSize);
        setPageCount(nextPageCount);
        setKpis({
          total: Number(j?.summary?.total ?? nextTotal ?? 0),
          prospects: Number(j?.summary?.prospects ?? 0),
          clients: Number(j?.summary?.clients ?? 0),
          partenaires: Number(j?.summary?.partenaires ?? 0),
          fournisseurs: Number(j?.summary?.fournisseurs ?? 0),
          autres: Number(j?.summary?.autres ?? 0),
        });
      } catch (e: any) {
        if (requestId !== requestSeqRef.current) return;
        setError(getSimpleFrenchErrorMessage(e, "Impossible de charger les contacts du CRM."));
      } finally {
        if (requestId === requestSeqRef.current) setLoading(false);
      }
    },
    [mergeContactWithLocalState, page, pageSize, serverQuery],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setServerQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, serverQuery]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    // Keep derived fields in sync when local ⭐ important / notes change
    setContacts((prev) => prev.map((c) => mergeContactWithLocalState(c)));
    setSelectedContactsById((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: Record<string, CrmContact> = {};
      for (const [id, contact] of Object.entries(prev)) {
        next[id] = mergeContactWithLocalState(contact);
      }
      return next;
    });
  }, [mergeContactWithLocalState]);

  useEffect(() => {
    if (contacts.length === 0 || selectedContactIds.size === 0) return;
    setSelectedContactsById((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const contact of contacts) {
        if (!selectedContactIds.has(contact.id)) continue;
        next[contact.id] = contact;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [contacts, selectedContactIds]);

  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = actionsRef.current;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      setActionsOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [actionsOpen]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = statsRef.current;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      setStatsOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const selectedContacts = useMemo(() => {
    if (selectedContactIds.size === 0) return [] as CrmContact[];
    return Array.from(selectedContactIds)
      .map((id) => selectedContactsById[id])
      .filter(Boolean) as CrmContact[];
  }, [selectedContactIds, selectedContactsById]);

  const editingContact = useMemo(() => {
    if (!editingId) return null as CrmContact | null;
    return contacts.find((c) => c.id === editingId) ?? selectedContactsById[editingId] ?? null;
  }, [contacts, editingId, selectedContactsById]);

  const primaryContact = useMemo(() => {
    // Priority: clicked contact (editing panel), else single selected contact
    if (editingContact) return editingContact;
    if (selectedContacts.length === 1) return selectedContacts[0];
    return null;
  }, [editingContact, selectedContacts]);

  const visibleContacts = contacts;
  const allVisibleSelected = visibleContacts.length > 0 && visibleContacts.every((c) => selectedContactIds.has(c.id));
  const emptyMessage = query.trim() ? "Aucun contact trouvé pour cette recherche." : "Aucun contact pour le moment.";

  const selectedEmails = useMemo(() => {
    const emails = selectedContacts
      .map((c) => (c.email || "").trim())
      .filter(Boolean);
    // unique
    return Array.from(new Set(emails));
  }, [selectedContacts]);

  const actionEmails = useMemo(() => {
    if (selectedEmails.length > 0) return selectedEmails;
    const em = (primaryContact?.email || "").trim();
    return em ? [em] : [];
  }, [selectedEmails, primaryContact]);


  const toggleSelect = (id: string) => {
    const contact = visibleContacts.find((item) => item.id === id) ?? selectedContactsById[id];
    const isSelected = selectedContactIds.has(id);

    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    setSelectedContactsById((prev) => {
      const next = { ...prev };
      if (isSelected) delete next[id];
      else if (contact) next[id] = contact;
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleContacts.forEach((contact) => next.delete(contact.id));
      } else {
        visibleContacts.forEach((contact) => next.add(contact.id));
      }
      return next;
    });

    setSelectedContactsById((prev) => {
      const next = { ...prev };
      if (allVisibleSelected) {
        visibleContacts.forEach((contact) => {
          delete next[contact.id];
        });
      } else {
        visibleContacts.forEach((contact) => {
          next[contact.id] = contact;
        });
      }
      return next;
    });
  };


  const persistImportant = (next: Set<string>) => {
    try {
      writeAccountCacheValue("inrcy_crm_important_ids", JSON.stringify(Array.from(next)));
    } catch {}
  };

  const persistNotes = (next: Record<string, string>) => {
    try {
      writeAccountCacheValue("inrcy_crm_notes_by_id", JSON.stringify(next));
    } catch {}
  };

  const toggleImportant = (id: string) => {
    // Source of truth: the backend `important` boolean.
    // We still keep the local storage set for backward compatibility, but UI prefers `contact.important`.
    const current = contacts.find((c) => c.id === id);
    const nextImportant = !Boolean(current?.important || importantIds.has(id));

    // Optimistic UI update
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, important: nextImportant } : c)));
    setImportantIds((prev) => {
      const next = new Set(prev);
      if (nextImportant) next.add(id);
      else next.delete(id);
      persistImportant(next);
      return next;
    });

    fetch("/api/crm/contacts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, important: nextImportant }),
    }).catch(() => {
      // Revert on network error
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, important: !nextImportant } : c)));
      setImportantIds((prev) => {
        const next = new Set(prev);
        if (!nextImportant) next.add(id);
        else next.delete(id);
        persistImportant(next);
        return next;
      });
    });
  };

  const setNoteForId = (id: string, note: string) => {
    setNotesById((prev) => {
      const next = { ...prev, [id]: note };
      persistNotes(next);
      return next;
    });
  };


  
async function importContacts(rows: any[]) {
  const cleaned = rows
    .map(normalizeImportedRow)
    .filter((r) => r.display_name || r.email || r.phone || r.last_name || r.company_name);

  if (cleaned.length === 0) {
    setError("Aucune ligne exploitable trouvée dans le fichier.");
    setSuccess(null);
    return;
  }

  setImporting(true);
  setError(null);
  try {
    const r = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: cleaned }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Import impossible."));
    setPage(1);
    await loadContacts({ page: 1, preserveSuccess: true });
    setSuccess(`Import terminé : ${j?.inserted ?? cleaned.length} contact(s).`);
  } catch (e: any) {
    setError(getSimpleFrenchErrorMessage(e, "Import impossible."));
  } finally {
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
}

async function handleImportFile(file: File) {
  const name = (file?.name || "").toLowerCase();

  if (name.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Le JSON doit être un tableau de contacts.");
    await importContacts(parsed);
    return;
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await loadXlsxModule();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) throw new Error("Le fichier Excel est vide.");
    const firstSheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    await importContacts(rows);
    return;
  }

  const text = await file.text();
  const rows = parseCsv(text);
  await importContacts(rows);
}

const triggerImport = () => fileInputRef.current?.click();

const fetchAllContactsForCurrentQuery = useCallback(async () => {
  const params = new URLSearchParams({ all: "1" });
  if (serverQuery) params.set("q", serverQuery);

  const r = await fetch(`/api/crm/contacts?${params.toString()}`, { method: "GET" });
  if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Export impossible."));
  const j = await r.json().catch(() => ({}));
  const base = Array.isArray(j?.contacts) ? j.contacts : [];
  return base.map((contact: CrmContact) => mergeContactWithLocalState(contact));
}, [mergeContactWithLocalState, serverQuery]);

const buildExportRows = useCallback(
  (rows: CrmContact[]) =>
    rows.map((c) => ({
      display_name: buildDisplayName(c),
      last_name: c.last_name ?? "",
      first_name: c.first_name ?? "",
      company_name: c.company_name ?? "",
      siret: c.siret ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      postal_code: c.postal_code ?? "",
      category: c.category ?? "",
      contact_type: c.contact_type ?? "",
      notes: (c.notes ?? "") as string,
      important: Boolean((c as any).important),
    })),
  [],
);

const getExportBaseFilename = () => `crm_inrcy_${new Date().toISOString().slice(0, 10)}`;

const exportCsv = async () => {
  setExportingFormat("csv");
  setError(null);
  try {
    const exportedContacts = await fetchAllContactsForCurrentQuery();
    const rows = buildExportRows(exportedContacts);
    const csv = contactsToCsv(rows);
    downloadTextFile(`${getExportBaseFilename()}.csv`, csv, "text/csv;charset=utf-8");
  } catch (e: any) {
    setError(getSimpleFrenchErrorMessage(e, "Export CSV impossible."));
  } finally {
    setExportingFormat("");
  }
};

const exportExcel = async () => {
  setExportingFormat("xlsx");
  setError(null);
  try {
    const XLSX = await loadXlsxModule();
    const exportedContacts = await fetchAllContactsForCurrentQuery();
    const rows = buildExportRows(exportedContacts);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 28 },
      { wch: 24 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
      { wch: 28 },
      { wch: 18 },
      { wch: 28 },
      { wch: 18 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 36 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts CRM");
    XLSX.writeFile(workbook, `${getExportBaseFilename()}.xlsx`, {
      bookType: "xlsx",
      compression: true,
    });
  } catch (e: any) {
    setError(getSimpleFrenchErrorMessage(e, "Export Excel impossible."));
  } finally {
    setExportingFormat("");
  }
};

  const sendMailToAction = () => {
    if (actionEmails.length === 0) return;

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          "inrcy_pending_mail_compose",
          JSON.stringify({
            to: actionEmails,
            from: "crm",
            contactId: primaryContact?.id || "",
            contactName: primaryContact ? buildDisplayName(primaryContact) : "",
            createdAt: Date.now(),
          }),
        );
        const params = new URLSearchParams({ compose: "1", from: "crm", prefillStorage: "session" });
        if (primaryContact?.id) params.set("contactId", primaryContact.id);
        if (primaryContact) params.set("contactName", buildDisplayName(primaryContact));
        router.push(`/dashboard/mails?${params.toString()}`);
        return;
      } catch {
        // fallback URL prefill below
      }
    }

    const params = new URLSearchParams({ compose: "1", to: actionEmails.join(","), from: "crm" });
    if (primaryContact?.id) params.set("contactId", primaryContact.id);
    if (primaryContact) params.set("contactName", buildDisplayName(primaryContact));
    router.push(`/dashboard/mails?${params.toString()}`);
  };

  const sendMailToContact = (c: CrmContact) => {
    const to = (c.email || "").trim();
    if (!to) return;
    const contactName = buildDisplayName(c);
    const params = new URLSearchParams({ compose: "1", to, from: "crm" });
    if (contactName) params.set("name", contactName);
    router.push(`/dashboard/mails?${params.toString()}`);
  };

  const buildDocPrefillParams = (c: CrmContact) => {
    const clientName = buildDisplayName(c);
    const clientEmail = (c.email || "").trim();
    const addrParts = [c.address, c.postal_code ?? "", c.city ?? ""]
      .map((s) => (s || "").trim())
      .filter(Boolean);
    const clientAddress = addrParts.join(" ").trim();
    const params = new URLSearchParams();
    if (clientName) params.set("clientName", clientName);
    if (clientEmail) params.set("clientEmail", clientEmail);
    if (clientAddress) params.set("clientAddress", clientAddress);
    params.set("from", "crm");
    params.set("contactId", c.id);
    return params;
  };

  const goNewDevis = (c: CrmContact) => {
    const params = buildDocPrefillParams(c);
    router.push(`/dashboard/devis/new?${params.toString()}`);
  };

  const goNewFacture = (c: CrmContact) => {
    const params = buildDocPrefillParams(c);
    router.push(`/dashboard/factures/new?${params.toString()}`);
  };

  const goPlanifierIntervention = (c: CrmContact) => {
    const q = new URLSearchParams();
    q.set("action", "new");
    q.set("contactId", c.id);
    q.set("contactName", buildDisplayName(c));
    if ((c.email || "").trim()) q.set("contactEmail", (c.email || "").trim());
    if ((c.phone || "").trim()) q.set("contactPhone", (c.phone || "").trim());
    if ((c.address || "").trim()) q.set("contactAddress", (c.address || "").trim());
    if ((c.city || "").trim()) q.set("contactCity", (c.city || "").trim());
    if ((c.postal_code || "").trim()) q.set("contactPostalCode", (c.postal_code || "").trim());
    router.push(`/dashboard/agenda?${q.toString()}`);
  };


  function startNew() {
    setEditingId(null);
    setDraft(emptyDraft());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(c: CrmContact) {
    setEditingId(c.id);
    setDraft({
      display_name: buildDisplayName(c),
      siret: (c.siret ?? "") as string,
      email: (c.email ?? "") as string,
      phone: (c.phone ?? "") as string,
      address: (c.address ?? "") as string,
      city: (c.city ?? "") as string,
      postal_code: (c.postal_code ?? "") as string,
      // ✅ évite le warning React (uncontrolled -> controlled)
      category: ((c.category as any) ?? "") as Category,
      contact_type: ((c.contact_type as any) ?? "") as ContactType,
      notes: ((c.notes as any) ?? "") as string,
      important: Boolean((c as any).important ?? importantIds.has(c.id)),
    });
    // Mobile: on édite dans la fenêtre (modal)
    try {
      if (window.matchMedia("(max-width: 900px)").matches) {
        setAddOpen(true);
        return;
      }
    } catch {}

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setSaving(true);
    setError(null);

    const { last_name, first_name, company_name } = parseDisplayName(draft.display_name);

    const payload = {
      // champ unique
      display_name: draft.display_name.trim(),

      // champs legacy (en attendant Supabase)
      last_name,
      first_name,
      company_name,

      // autres champs
      siret: (draft.siret || "").trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      address: draft.address.trim(),
      city: (draft.city || "").trim(),
      postal_code: (draft.postal_code || "").trim(),
      category: draft.category,
      contact_type: draft.contact_type,
      notes: (draft.notes || "").trim(),
      important: Boolean(draft.important),
    };

    try {
      const r = await fetch("/api/crm/contacts", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible d'enregistrer."));
      const nextPage = editingId ? page : 1;
      if (!editingId) setPage(1);
      await loadContacts({ page: nextPage, preserveSuccess: true });
      // If editing, persist ⭐ + notes locally (works even if backend doesn't store it yet)
      if (editingId) {
        setNoteForId(editingId, (draft.notes || "").trim());
        if (draft.important) {
          setImportantIds((prev) => {
            const next = new Set(prev);
            next.add(editingId);
            persistImportant(next);
            return next;
          });
        } else {
          setImportantIds((prev) => {
            const next = new Set(prev);
            next.delete(editingId);
            persistImportant(next);
            return next;
          });
        }
      }
      startNew();
      setSuccess(editingId ? "Contact mis à jour." : "Contact ajouté.");
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, editingId ? "Impossible de mettre à jour ce contact." : "Impossible d’ajouter ce contact."));
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    if (selectedContactIds.size === 0) return;
    const n = selectedContactIds.size;
    if (!confirm(`🗑️ Supprimer ${n} contact${n > 1 ? "s" : ""} ?`)) return;

    setSaving(true);
    setError(null);
    try {
      const ids = Array.from(selectedContactIds);
      // Suppression en parallèle (API actuelle : 1 id par requête)
      await Promise.all(
        ids.map(async (id) => {
          const r = await fetch(`/api/crm/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible de supprimer."));
        })
      );

      // reload + reset states
      await loadContacts({ preserveSuccess: true });
      setSelectedContactIds(new Set());
      setSelectedContactsById({});
      if (editingId && ids.includes(editingId)) startNew();
      setSuccess(n > 1 ? "Contacts supprimés." : "Contact supprimé.");
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, n > 1 ? "Impossible de supprimer les contacts sélectionnés." : "Impossible de supprimer ce contact."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("🗑️ ce contact ?")) return;

    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/crm/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible de supprimer."));
      await loadContacts({ preserveSuccess: true });
      setSelectedContactIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSelectedContactsById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (editingId === id) startNew();
      setSuccess("Contact supprimé.");
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible de supprimer ce contact."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.shell}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        // Clique "vide" = en dehors des cards
        if (t.closest(`.${styles.card}`)) return;
        startNew();
      }}
    >
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <img src="/inrcrm-logo.png" alt="iNr’CRM" style={{ width: 154, height: 64, display: "block" }} />

          <p className={styles.subInline}>Un tableau simple et connecté pour suivre tous vos contacts.</p>
        </div>

        <div className={styles.headerRight}>
          <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’CRM" />

          <div className={styles.statsWrap} ref={statsRef}>
            <button
              type="button"
              className={`${styles.headerIconBtn} ${styles.statsBtn}`}
              onClick={() => setStatsOpen((v) => !v)}
              aria-expanded={statsOpen ? "true" : "false"}
              title="Statistiques"
            >
              ≡
            </button>

            {statsOpen ? (
              <div className={styles.statsDropdown} role="menu">
                <div className={styles.statsTitle}>Statistiques</div>
                <div className={styles.statsGrid}>
                  <div className={styles.statsItem}>
                    <span>Contacts</span>
                    <strong>{kpis.total}</strong>
                  </div>
                  <div className={styles.statsItem}>
                    <span>Prospects</span>
                    <strong>{kpis.prospects}</strong>
                  </div>
                  <div className={styles.statsItem}>
                    <span>Clients</span>
                    <strong>{kpis.clients}</strong>
                  </div>
                  <div className={styles.statsItem}>
                    <span>Partenaires</span>
                    <strong>{kpis.partenaires}</strong>
                  </div>
                  <div className={styles.statsItem}>
                    <span>Fournisseurs</span>
                    <strong>{kpis.fournisseurs}</strong>
                  </div>
                  <div className={styles.statsItem}>
                    <span>Autres</span>
                    <strong>{kpis.autres}</strong>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={`${styles.headerIconBtn} ${styles.addBtn}`}
            onClick={() => {
              startNew();
              setAddOpen(true);
            }}
            title="Ajouter un contact"
          >
            +
          </button>

          <div className={styles.closeWrap}>
            <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" onClick={() => router.push("/dashboard")} />
          </div>
        </div>
      </header>

      <HelpModal open={helpOpen} title="iNr’CRM" onClose={() => setHelpOpen(false)}>
        <p style={{ marginTop: 0 }}>
          iNr’CRM centralise tous vos contacts et prospects.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Ajoutez et enregistrez vos contacts (prospects / clients / partenaires…).</li>
          <li>Classez et retrouvez rapidement vos informations (notes, catégorie, important).</li>
          <li>Suivez vos opportunités et organisez vos actions de communication.</li>
        </ul>
      </HelpModal>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Contacts</div>
          <div className={styles.kpiValue}>{kpis.total}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Prospects</div>
          <div className={styles.kpiValue}>{kpis.prospects}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Clients</div>
          <div className={styles.kpiValue}>{kpis.clients}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Partenaires</div>
          <div className={styles.kpiValue}>{kpis.partenaires}</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Fournisseurs</div>
          <div className={styles.kpiValue}>{kpis.fournisseurs}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Autres</div>
          <div className={styles.kpiValue}>{kpis.autres}</div>
        </div>
      </div>

      <section className={`${styles.card} ${styles.formCard}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardHead}>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div style={{ color: "#22c55e", fontWeight: 800, marginTop: 8 }}>{success}</div> : null}

                
<div className={styles.formGrid}>
  {/* Ligne 1 */}
  <label className={`${styles.label} ${styles.col4} ${styles.fName}`}>
    <span>Nom Prénom / Raison sociale</span>
    <input
      className={styles.input}
      value={draft.display_name}
      onChange={(e) => setDraft((s) => ({ ...s, display_name: e.target.value }))}
      placeholder="Dupont Marie / SAS Exemple"
      autoComplete="name"
    />
  </label>

  <label className={`${styles.label} ${styles.col2} ${styles.fSiren}`}>
    <span>SIREN</span>
    <input
      className={styles.input}
      value={draft.siret}
      onChange={(e) => setDraft((s) => ({ ...s, siret: e.target.value }))}
      placeholder="123 456 789"
      inputMode="numeric"
    />
  </label>

  <label className={`${styles.label} ${styles.col2} ${styles.fCategory}`}>
    <span>Catégorie</span>
    <select
      className={styles.select}
      value={draft.category}
      onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value as Category }))}
    >
      <option value="">—</option>
      <option value="particulier">Particulier</option>
      <option value="professionnel">Professionnel</option>
      <option value="collectivite_publique">Institution</option>
    </select>
  </label>

  <label className={`${styles.label} ${styles.col2} ${styles.fType}`}>
    <span>Type</span>
    <select
      className={styles.select}
      value={draft.contact_type}
      onChange={(e) => setDraft((s) => ({ ...s, contact_type: e.target.value as ContactType }))}
    >
      <option value="">—</option>
      <option value="client">Client</option>
      <option value="prospect">Prospect</option>
      <option value="fournisseur">Fournisseur</option>
      <option value="partenaire">Partenaire</option>
      <option value="autre">Autre</option>
    </select>
  </label>

  <label className={`${styles.label} ${styles.col2} ${styles.fPhone}`}>
    <span>Téléphone</span>
    <input
      className={styles.input}
      value={draft.phone}
      onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
      placeholder="06 00 00 00 00"
      autoComplete="tel"
    />
  </label>

  {/* Ligne 2 */}
  <label className={`${styles.label} ${styles.col3} ${styles.fMail}`}>
    <span>Mail</span>
    <input
      className={styles.input}
      value={draft.email}
      onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))}
      placeholder="marie@exemple.fr"
      autoComplete="email"
    />
  </label>

  <label className={`${styles.label} ${styles.col3} ${styles.fAddress}`}>
    <span>Adresse</span>
    <input
      className={styles.input}
      value={draft.address}
      onChange={(e) => setDraft((s) => ({ ...s, address: e.target.value }))}
      placeholder="12 rue ... "
      autoComplete="street-address"
    />
  </label>

  <label className={`${styles.label} ${styles.col2} ${styles.fCity}`}>
    <span>Ville</span>
    <input
      className={styles.input}
      value={draft.city}
      onChange={(e) => setDraft((s) => ({ ...s, city: e.target.value }))}
      placeholder="Paris"
      autoComplete="address-level2"
    />
  </label>

  <label className={`${styles.label} ${styles.col1} ${styles.fCP}`}>
    <span>CP</span>
    <input
      className={styles.input}
      value={draft.postal_code}
      onChange={(e) => setDraft((s) => ({ ...s, postal_code: e.target.value }))}
      placeholder="75000"
      autoComplete="postal-code"
      inputMode="numeric"
    />
  </label>

  <label className={`${styles.label} ${styles.col2} ${styles.notesField} ${styles.fNotes}`}>
    <span>Notes</span>
    <input
      className={styles.input}
      value={draft.notes}
      onChange={(e) => {
        const v = e.target.value;
        setDraft((s) => ({ ...s, notes: v }));
        if (editingId) setNoteForId(editingId, v);
      }}
      placeholder="Info utile sur ce contact..."
    />
  </label>

  <label className={`${styles.label} ${styles.col1} ${styles.fImportant}`}>
    <span>Important</span>
    <button
      type="button"
      className={styles.starToggle}
      onClick={() => {
        // If editing: persist on the contact id. If new: just toggle the draft.
        if (editingId) toggleImportant(editingId);
        setDraft((s) => ({ ...s, important: !s.important }));
      }}
      aria-pressed={draft.important ? "true" : "false"}
      title={draft.important ? "Contact important" : "Marquer comme important"}
    >
      {draft.important ? "★" : "☆"}
    </button>
  </label>

<div className={`${styles.formActions} ${styles.col1} ${styles.fActions}`}>
    {editingId ? (
      <>
        <button
          aria-label="Retour"
          className={`${styles.ghostBtn} ${styles.iconBtn}`}
          type="button"
          onClick={startNew}
          disabled={saving}
          title="Retour"
        >
          ↩
        </button>
        <button
          aria-label="Mettre à jour"
          className={`${styles.primaryBtn} ${styles.iconBtn}`}
          type="button"
          onClick={save}
          disabled={saving}
          title="Mettre à jour"
        >
          ✔
        </button>
      </>
    ) : (
      <button
        aria-label="Ajouter"
        className={`${styles.primaryBtn} ${styles.plusBtn} ${styles.iconBtn}`}
        type="button"
        onClick={save}
        disabled={saving}
        title="Ajouter"
      >
        +
      </button>
    )}
  </div>
</div>
      </section>

      {/* Mobile: ajout/modif contact via bouton + (modal) */}
      {addOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={() => setAddOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <div className={styles.modalTitle}>{editingId ? "Modifier un contact" : "Ajouter un contact"}</div>
              <button type="button" className={styles.modalClose} onClick={() => setAddOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}

            {/*
              Responsive (mobile): formulaire "détaché" du desktop.
              On garde les mêmes champs mais une construction/grille dédiée,
              pour garantir l'ordre demandé sur petits écrans.
            */}
            {isResponsive ? (
              <div className={styles.mobileModalForm}>
                {/* Ligne 1: Nom/RS + SIREN */}
                <label className={`${styles.label} ${styles.mfName} ${styles.fName}`}>
                  <span>Nom Prénom / Raison sociale</span>
                  <input
                    className={styles.input}
                    value={draft.display_name}
                    onChange={(e) => setDraft((s) => ({ ...s, display_name: e.target.value }))}
                    placeholder="Dupont Marie / SAS Exemple"
                    autoComplete="name"
                  />
                </label>

                <label className={`${styles.label} ${styles.mfSiren} ${styles.fSiren}`}>
                  <span>SIREN</span>
                  <input
                    className={styles.input}
                    value={draft.siret}
                    onChange={(e) => setDraft((s) => ({ ...s, siret: e.target.value }))}
                    placeholder="123 456 789"
                    inputMode="numeric"
                  />
                </label>

                {/* Ligne 2: Catégorie + Type + Important */}
                <label className={`${styles.label} ${styles.mfCategory} ${styles.fCategory}`}>
                  <span>Catégorie</span>
                  <select
                    className={styles.select}
                    value={draft.category}
                    onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value as Category }))}
                  >
                    <option value="">—</option>
                    <option value="particulier">Particulier</option>
                    <option value="professionnel">Professionnel</option>
                    <option value="collectivite_publique">Institution</option>
                  </select>
                </label>

                <label className={`${styles.label} ${styles.mfType} ${styles.fType}`}>
                  <span>Type</span>
                  <select
                    className={styles.select}
                    value={draft.contact_type}
                    onChange={(e) => setDraft((s) => ({ ...s, contact_type: e.target.value as ContactType }))}
                  >
                    <option value="">—</option>
                    <option value="client">Client</option>
                    <option value="prospect">Prospect</option>
                    <option value="fournisseur">Fournisseur</option>
                    <option value="partenaire">Partenaire</option>
                    <option value="autre">Autre</option>
                  </select>
                </label>

                <label className={`${styles.label} ${styles.mfImportant} ${styles.fImportant}`}>
                  <span>Important</span>
                  <button
                    type="button"
                    className={styles.starToggle}
                    onClick={() => {
                      if (editingId) toggleImportant(editingId);
                      setDraft((s) => ({ ...s, important: !s.important }));
                    }}
                    aria-pressed={draft.important ? "true" : "false"}
                    title={draft.important ? "Contact important" : "Marquer comme important"}
                  >
                    {draft.important ? "★" : "☆"}
                  </button>
                </label>

                {/* Ligne 3: Téléphone + Mail */}
                <label className={`${styles.label} ${styles.mfPhone} ${styles.fPhone}`}>
                  <span>Téléphone</span>
                  <input
                    className={styles.input}
                    value={draft.phone}
                    onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
                    placeholder="06 00 00 00 00"
                    autoComplete="tel"
                  />
                </label>

                <label className={`${styles.label} ${styles.mfMail} ${styles.fMail}`}>
                  <span>Mail</span>
                  <input
                    className={styles.input}
                    value={draft.email}
                    onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))}
                    placeholder="marie@exemple.fr"
                    autoComplete="email"
                  />
                </label>

                {/* Ligne 4: Adresse + Ville + CP */}
                <label className={`${styles.label} ${styles.mfAddress} ${styles.fAddress}`}>
                  <span>Adresse</span>
                  <input
                    className={styles.input}
                    value={draft.address}
                    onChange={(e) => setDraft((s) => ({ ...s, address: e.target.value }))}
                    placeholder="12 rue ..."
                    autoComplete="street-address"
                  />
                </label>

                <label className={`${styles.label} ${styles.mfCity} ${styles.fCity}`}>
                  <span>Ville</span>
                  <input
                    className={styles.input}
                    value={draft.city}
                    onChange={(e) => setDraft((s) => ({ ...s, city: e.target.value }))}
                    placeholder="Paris"
                    autoComplete="address-level2"
                  />
                </label>

                <label className={`${styles.label} ${styles.mfCP} ${styles.fCP}`}>
                  <span>CP</span>
                  <input
                    className={styles.input}
                    value={draft.postal_code}
                    onChange={(e) => setDraft((s) => ({ ...s, postal_code: e.target.value }))}
                    placeholder="75000"
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </label>

                {/* Ligne 5: Notes */}
                <label className={`${styles.label} ${styles.mfNotes} ${styles.fNotes}`}>
                  <span>Notes</span>
                  <textarea
                    className={styles.textarea}
                    value={draft.notes}
                    onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="Notes internes"
                  />
                </label>
              </div>
            ) : (
              <div className={`${styles.formGrid} ${styles.modalFormGrid}`}>
                {/* Ligne 1 */}
                <label className={`${styles.label} ${styles.col3} ${styles.fName}`}>
                  <span>Nom Prénom / Raison sociale</span>
                  <input
                    className={styles.input}
                    value={draft.display_name}
                    onChange={(e) => setDraft((s) => ({ ...s, display_name: e.target.value }))}
                    placeholder="Dupont Marie / SAS Exemple"
                    autoComplete="name"
                  />
                </label>

                <label className={`${styles.label} ${styles.col2} ${styles.fSiren}`}>
                  <span>SIREN</span>
                  <input
                    className={styles.input}
                    value={draft.siret}
                    onChange={(e) => setDraft((s) => ({ ...s, siret: e.target.value }))}
                    placeholder="123 456 789"
                    inputMode="numeric"
                  />
                </label>

                <label className={`${styles.label} ${styles.col2} ${styles.fCategory}`}>
                  <span>Catégorie</span>
                  <select
                    className={styles.select}
                    value={draft.category}
                    onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value as Category }))}
                  >
                    <option value="">—</option>
                    <option value="particulier">Particulier</option>
                    <option value="professionnel">Professionnel</option>
                    <option value="collectivite_publique">Institution</option>
                  </select>
                </label>

                <label className={`${styles.label} ${styles.col2} ${styles.fType}`}>
                  <span>Type</span>
                  <select
                    className={styles.select}
                    value={draft.contact_type}
                    onChange={(e) => setDraft((s) => ({ ...s, contact_type: e.target.value as ContactType }))}
                  >
                    <option value="">—</option>
                    <option value="client">Client</option>
                    <option value="prospect">Prospect</option>
                    <option value="fournisseur">Fournisseur</option>
                    <option value="partenaire">Partenaire</option>
                    <option value="autre">Autre</option>
                  </select>
                </label>

                {/* Ligne 2 */}
                <label className={`${styles.label} ${styles.col2} ${styles.phoneField} ${styles.fPhone}`}>
                  <span>Téléphone</span>
                  <input
                    className={styles.input}
                    value={draft.phone}
                    onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
                    placeholder="06 00 00 00 00"
                    autoComplete="tel"
                  />
                </label>

                <label className={`${styles.label} ${styles.col2} ${styles.mailField} ${styles.fMail}`}>
                  <span>Mail</span>
                  <input
                    className={styles.input}
                    value={draft.email}
                    onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))}
                    placeholder="marie@exemple.fr"
                    autoComplete="email"
                  />
                </label>

                <label className={`${styles.label} ${styles.starField} ${styles.col1} ${styles.fImportant}`}>
                  <span>Important</span>
                  <button
                    type="button"
                    className={styles.starToggle}
                    onClick={() => {
                      if (editingId) toggleImportant(editingId);
                      setDraft((s) => ({ ...s, important: !s.important }));
                    }}
                    aria-pressed={draft.important ? "true" : "false"}
                    title={draft.important ? "Contact important" : "Marquer comme important"}
                  >
                    {draft.important ? "★" : "☆"}
                  </button>
                </label>

                {/* Ligne 3 */}
                <label className={`${styles.label} ${styles.col3} ${styles.fAddress}`}>
                  <span>Adresse</span>
                  <input
                    className={styles.input}
                    value={draft.address}
                    onChange={(e) => setDraft((s) => ({ ...s, address: e.target.value }))}
                    placeholder="12 rue ..."
                    autoComplete="street-address"
                  />
                </label>

                <label className={`${styles.label} ${styles.col2} ${styles.fCity}`}>
                  <span>Ville</span>
                  <input
                    className={styles.input}
                    value={draft.city}
                    onChange={(e) => setDraft((s) => ({ ...s, city: e.target.value }))}
                    placeholder="Paris"
                    autoComplete="address-level2"
                  />
                </label>

                <label className={`${styles.label} ${styles.col2} ${styles.fCP}`}>
                  <span>CP</span>
                  <input
                    className={styles.input}
                    value={draft.postal_code}
                    onChange={(e) => setDraft((s) => ({ ...s, postal_code: e.target.value }))}
                    placeholder="75000"
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </label>

                {/* Ligne 4 */}
                <label className={`${styles.label} ${styles.col6} ${styles.fNotes}`}>
                  <span>Notes</span>
                  <textarea
                    className={styles.textarea}
                    value={draft.notes}
                    onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="Notes internes"
                  />
                </label>
              </div>
            )}

            <div className={styles.modalFooter}>
              <button type="button" className={styles.ghostBtn} onClick={() => setAddOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={async () => {
                  await save();
                  setAddOpen(false);
                }}
                disabled={saving}
              >
                {editingId ? "Mettre à jour" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className={`${styles.card} ${styles.tableCard}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardHead}>
          <h2 className={styles.h2}>Tableau CRM</h2>
          <div className={styles.tableToolbar}>
  <input
    ref={fileInputRef}
    type="file"
    accept=".csv,.json,.xlsx,.xls,text/csv,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    style={{ display: "none" }}
    onChange={async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        await handleImportFile(f);
      } catch (err: any) {
        setError(getSimpleFrenchErrorMessage(err, "Import impossible."));
        setImporting(false);
      }
    }}
  />

  <div className={styles.importExportActions}>
    <button
      className={styles.ghostBtn}
      type="button"
      onClick={triggerImport}
      disabled={saving || importing}
      title="Importer un fichier CSV, JSON ou Excel (.xlsx, .xls)"
    >
      {importing ? "Import…" : "Importer"}
    </button>

    <button
      className={styles.ghostBtn}
      type="button"
      onClick={exportExcel}
      disabled={saving || Boolean(exportingFormat) || total === 0}
      title="Exporter en Excel (.xlsx)"
    >
      {exportingFormat === "xlsx" ? "Excel…" : "Exporter Excel"}
    </button>

    <button
      className={styles.ghostBtn}
      type="button"
      onClick={exportCsv}
      disabled={saving || Boolean(exportingFormat) || total === 0}
      title="Exporter en CSV"
    >
      {exportingFormat === "csv" ? "CSV…" : "Exporter CSV"}
    </button>
  </div>

            <div className={styles.searchWrap}>
              <input
                className={styles.search}
                placeholder="Rechercher..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className={styles.count}>{total}</span>
            </div>

            <label className={styles.pageSizeWrap}>
              <span>Par page</span>
              <select
                className={styles.pageSizeSelect}
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value) || DEFAULT_PAGE_SIZE);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.bulkActions}>
              <button aria-label="action"
                className={styles.ghostBtn}
                type="button"
                onClick={() => {
                  setSelectedContactIds(new Set());
                  setSelectedContactsById({});
                }}
                disabled={selectedContactIds.size === 0 || saving}
                title={selectedContactIds.size === 0 ? "Aucun contact sélectionné" : "Vider la sélection"}
              >
                Désélectionner
              </button>

              <button
                aria-label="Supprimer"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                type="button"
                onClick={removeSelected}
                disabled={selectedContactIds.size === 0 || saving}
                title={selectedContactIds.size === 0 ? "Sélectionne 1 ou plusieurs contacts" : `Supprimer ${selectedContactIds.size} contact(s)`}
              >
                🗑️
              </button>

              <div className={styles.actionsWrap} ref={actionsRef}>
                <button
                  className={styles.actionsBtn}
                  type="button"
                  onClick={() => setActionsOpen((v) => !v)}
                  disabled={(actionEmails.length === 0 && !primaryContact) || saving}
                  aria-expanded={actionsOpen ? "true" : "false"}
                  title={
                    primaryContact
                      ? "Actions sur ce contact"
                      : selectedContactIds.size > 0
                      ? "Actions sur la sélection"
                      : "Sélectionnez un contact"
                  }
                >
                  Actions <span className={styles.caret}>▾</span>
                </button>

                {actionsOpen ? (
                  <div className={styles.actionsMenu} role="menu">
                    <button
                      className={styles.actionsItem}
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        sendMailToAction();
                      }}
                      disabled={actionEmails.length === 0 || saving}
                    >
                      ✉️ Envoyer un mail
                    </button>

                    <div className={styles.actionsSep} />

                    <button
                      className={styles.actionsItem}
                      type="button"
                      onClick={() => {
                        if (!primaryContact) return;
                        setActionsOpen(false);
                        goNewDevis(primaryContact);
                      }}
                      disabled={!primaryContact || saving}
                    >
                      📄 Devis
                    </button>

                    <button
                      className={styles.actionsItem}
                      type="button"
                      onClick={() => {
                        if (!primaryContact) return;
                        setActionsOpen(false);
                        goNewFacture(primaryContact);
                      }}
                      disabled={!primaryContact || saving}
                    >
                      🧾 Factures
                    </button>


                    <div className={styles.actionsSep} />

                    <button
                      className={styles.actionsItem}
                      type="button"
                      onClick={() => {
                        if (!primaryContact) return;
                        setActionsOpen(false);
                        goPlanifierIntervention(primaryContact);
                      }}
                      disabled={!primaryContact || saving}
                    >
                      📅 Planifier une intervention
                    </button>
                  </div>
                ) : null}
              </div>
</div>
          </div>
        </div>
        {loading ? <div className={styles.muted}>Chargement...</div> : null}

        <div className={styles.tableWrap}>
          {/*
            Responsive (mobile): tableau "détaché" du desktop.
            On garde les mêmes infos mais une construction différente (grid) pour coller au design.
          */}
          {isResponsive ? (
            <div className={styles.mobileTable}>
              <div className={styles.mobileHead}>
                <div className={styles.mhName}>Nom Prénom / RS</div>
                <div className={styles.mhMail}>Mail</div>
                <div className={styles.mhTel}>Tél</div>
                <div className={styles.mhCat}>Cat</div>
                <div className={styles.mhType}>Type</div>
                <div className={styles.mhStar}>Imp</div>
              </div>

              {visibleContacts.length === 0 ? (
                <div className={styles.mobileEmpty}>{emptyMessage}</div>
              ) : (
                visibleContacts.map((c) => (
                  <div
                    key={c.id}
                    className={`${styles.mobileRow} ${selectedContactIds.has(c.id) ? styles.mobileRowSelected : ""}`.trim()}
                    onClick={() => toggleSelect(c.id)}
                    onDoubleClick={() => startEdit(c)}
                    role="row"
                    aria-label={buildDisplayName(c)}
                  >
                    <div className={`${styles.mcName} ${c.important ? styles.nameImportant : ""}`.trim()}>
                      {buildDisplayName(c)}
                    </div>
                    <div className={`${styles.mcMail} ${styles.mono}`.trim()} title={c.email}>
                      {c.email}
                    </div>
                    <div className={`${styles.mcTel} ${styles.mono}`.trim()} title={c.phone}>
                      {c.phone}
                    </div>
                    <div className={styles.mcCat}>
                      {c.category ? (
                        <span className={categoryBadgeClass(c.category)}>
                          <span className={styles.badgeLabelShort}>
                            {CATEGORY_LABEL_SHORT[c.category as Exclude<Category, "">]}
                          </span>
                        </span>
                      ) : (
                        <span className={styles.dash}>—</span>
                      )}
                    </div>
                    <div className={styles.mcType}>
                      {c.contact_type ? (
                        <span className={typeBadgeClass(c.contact_type)}>
                          <span className={styles.badgeLabelShort}>
                            {TYPE_LABEL_SHORT[c.contact_type as Exclude<ContactType, "">]}
                          </span>
                        </span>
                      ) : (
                        <span className={styles.dash}>—</span>
                      )}
                    </div>
                    <div className={styles.mcStar}>
                      {c.important ? (
                        <span className={styles.starStatic} title="Important" aria-label="Important">
                          ★
                        </span>
                      ) : (
                        <span className={styles.dash}> </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thSelect}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      onClick={(e) => e.stopPropagation()}
                      onChange={toggleSelectAllVisible}
                      checked={allVisibleSelected}
                      aria-label="Sélectionner tous les contacts de la page"
                    />
                  </th>
                  <th className={styles.thName}>Nom Prénom / RS</th>
                  <th className={styles.thMail}>Mail</th>
                  <th className={styles.thTel}>Téléphone</th>
                  <th className={styles.thCp}>CP</th>
                  <th className={styles.thCat}>Catégorie</th>
                  <th className={styles.thType}>Type</th>
                  <th className={styles.thStar}>⭐</th>
                </tr>
              </thead>
              <tbody>
                {visibleContacts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.empty}>
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  visibleContacts.map((c) => (
                    <tr
                      key={c.id}
                      className={selectedContactIds.has(c.id) ? styles.rowSelected : undefined}
                      onClick={() => startEdit(c)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className={styles.tdSelect}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={selectedContactIds.has(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelect(c.id)}
                          aria-label={`Sélectionner ${buildDisplayName(c)}`}
                        />
                      </td>
                      <td className={`${styles.tdName} ${c.important ? styles.nameImportant : ""}`.trim()}>
                        {buildDisplayName(c)}
                      </td>
                      <td className={`${styles.mono} ${styles.tdMail}`}>{c.email}</td>
                      <td className={`${styles.mono} ${styles.tdTel}`}>{c.phone}</td>
                      <td className={`${styles.mono} ${styles.tdCp}`}>{c.postal_code ?? ""}</td>
                      <td className={styles.tdCat}>
                        {c.category ? (
                          <span className={categoryBadgeClass(c.category)}>
                            <span className={styles.badgeLabelFull}>
                              {CATEGORY_LABEL[c.category as Exclude<Category, "">]}
                            </span>
                            <span className={styles.badgeLabelShort}>
                              {CATEGORY_LABEL_SHORT[c.category as Exclude<Category, "">]}
                            </span>
                          </span>
                        ) : (
                          <span className={styles.dash}>—</span>
                        )}
                      </td>
                      <td>
                        {c.contact_type ? (
                          <span className={typeBadgeClass(c.contact_type)}>
                            <span className={styles.badgeLabelFull}>
                              {TYPE_LABEL[c.contact_type as Exclude<ContactType, "">]}
                            </span>
                            <span className={styles.badgeLabelShort}>
                              {TYPE_LABEL_SHORT[c.contact_type as Exclude<ContactType, "">]}
                            </span>
                          </span>
                        ) : (
                          <span className={styles.dash}>—</span>
                        )}
                      </td>
                      <td className={styles.tdStar}>
                        {c.important ? (
                          <span className={styles.starStatic} title="Important" aria-label="Important">
                            ★
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.paginationBar}>
          <div className={styles.paginationMeta}>
            {total > 0
              ? `Affichage ${Math.min((page - 1) * pageSize + 1, total)}–${Math.min(page * pageSize, total)} sur ${total}`
              : "0 contact"}
          </div>
          <div className={styles.paginationControls}>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || loading}
            >
              ← Précédent
            </button>
            <span className={styles.paginationStatus}>Page {Math.min(page, pageCount)} / {Math.max(pageCount, 1)}</span>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
              disabled={page >= pageCount || loading || total === 0}
            >
              Suivant →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
