"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./crm.module.css";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { readAccountCacheValue, writeAccountCacheValue } from "@/lib/browserAccountCache";
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
  billing_address?: string;
  delivery_address?: string;
  vat_number?: string;
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

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20] as const;

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
    billing_address: "",
    delivery_address: "",
    vat_number: "",
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
    "billing_address",
    "delivery_address",
    "vat_number",
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

function normalizeImportKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_/\-]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildImportRowMap(row: Record<string, unknown>) {
  const map = new Map<string, unknown>();
  Object.entries(row || {}).forEach(([key, value]) => {
    map.set(key, value);
    const normalizedKey = normalizeImportKey(key);
    if (normalizedKey && !map.has(normalizedKey)) {
      map.set(normalizedKey, value);
    }
  });
  return map;
}

function pickImportedValue(map: Map<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const direct = map.get(key);
    if (direct != null && String(direct).trim() !== "") return direct;
    const normalizedKey = normalizeImportKey(key);
    const normalized = map.get(normalizedKey);
    if (normalized != null && String(normalized).trim() !== "") return normalized;
  }
  return "";
}

function normalizeImportedCategory(value: unknown): Category {
  const normalized = normalizeImportKey(value);
  if (!normalized) return "";
  if (["particulier", "personne", "personne physique", "individual"].includes(normalized)) {
    return "particulier";
  }
  if (["professionnel", "professionnelle", "pro", "entreprise", "societe", "societe privee"].includes(normalized)) {
    return "professionnel";
  }
  if (
    [
      "institution",
      "collectivite publique",
      "collectivite",
      "collectivite territoriale",
      "organisme public",
      "publique",
      "public",
      "mairie",
      "commune",
    ].includes(normalized)
  ) {
    return "collectivite_publique";
  }
  return "";
}

function normalizeImportedContactType(value: unknown): ContactType {
  const normalized = normalizeImportKey(value);
  if (!normalized) return "";
  if (["client", "clients"].includes(normalized)) return "client";
  if (["prospect", "propsect", "prospects"].includes(normalized)) return "prospect";
  if (["fournisseur", "fournisseurs", "supplier"].includes(normalized)) return "fournisseur";
  if (["partenaire", "partenaires", "partner"].includes(normalized)) return "partenaire";
  if (["autre", "other", "others"].includes(normalized)) return "autre";
  return "";
}

function inferImportedDefaults(rows: any[]) {
  const categoryValues = new Set<Category>();
  const typeValues = new Set<ContactType>();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const map = buildImportRowMap(row as Record<string, unknown>);
    const category = normalizeImportedCategory(
      pickImportedValue(map, "category", "Categorie", "Catégorie", "Category"),
    );
    const contactType = normalizeImportedContactType(
      pickImportedValue(map, "contact_type", "Type", "Type de contact", "Contact type"),
    );
    if (category) categoryValues.add(category);
    if (contactType) typeValues.add(contactType);
  }

  return {
    category: categoryValues.size === 1 ? Array.from(categoryValues)[0] : ("" as Category),
    contact_type: typeValues.size === 1 ? Array.from(typeValues)[0] : ("" as ContactType),
  };
}

async function loadXlsxModule() {
  return (await import("@/lib/vendor/xlsx.mjs")) as any;
}

function normalizeImportedRow(
  row: any,
  defaults?: { category?: Category; contact_type?: ContactType },
) {
  const map = buildImportRowMap((row && typeof row === "object" ? row : {}) as Record<string, unknown>);

  return {
    display_name: String(
      pickImportedValue(map, "display_name", "Nom / RS", "Nom", "Raison sociale", "Entreprise"),
    ).trim(),
    last_name: String(pickImportedValue(map, "last_name", "Nom")).trim(),
    first_name: String(pickImportedValue(map, "first_name", "Prénom", "Prenom")).trim(),
    company_name: String(
      pickImportedValue(map, "company_name", "Entreprise", "Raison sociale", "Societe", "Société"),
    ).trim(),
    siret: String(pickImportedValue(map, "siret", "SIRET")).trim(),
    email: String(pickImportedValue(map, "email", "Email", "Mail", "E-mail")).trim(),
    phone: String(pickImportedValue(map, "phone", "Téléphone", "Telephone", "Tel")).trim(),
    address: String(pickImportedValue(map, "address", "Adresse", "Adresse principale")).trim(),
    billing_address: String(
      pickImportedValue(map, "billing_address", "Adresse de facturation", "Billing address"),
    ).trim(),
    delivery_address: String(
      pickImportedValue(map, "delivery_address", "Adresse de livraison", "Delivery address"),
    ).trim(),
    vat_number: String(pickImportedValue(map, "vat_number", "TVA", "TVA intracom", "VAT", "VAT number")).trim(),
    city: String(pickImportedValue(map, "city", "Ville")).trim(),
    postal_code: String(pickImportedValue(map, "postal_code", "Code postal", "CP")).trim(),
    category:
      normalizeImportedCategory(pickImportedValue(map, "category", "Categorie", "Catégorie", "Category")) ||
      defaults?.category ||
      "",
    contact_type:
      normalizeImportedContactType(
        pickImportedValue(map, "contact_type", "Type", "Type de contact", "Contact type"),
      ) ||
      defaults?.contact_type ||
      "",
    notes: String(pickImportedValue(map, "notes", "Notes", "Commentaires", "Commentaire")).trim(),
    important: parseBooleanLike(pickImportedValue(map, "important", "Important", "Favori", "Favorite", "Star")),
  };
}


function sanitizeDepartmentFilter(value: string) {
  const cleaned = String(value ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();

  if (/^(97|98)\d/.test(cleaned)) return cleaned.slice(0, 3);
  return cleaned.slice(0, 2);
}

function getDepartmentCode(postalCode?: string) {
  const raw = String(postalCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!raw) return "";
  if (/^(97|98)\d/.test(raw)) return raw.slice(0, 3);
  return raw.slice(0, 2);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateCompactUi = () => setIsCompactUi(window.innerWidth <= 980 || window.innerHeight <= 560);
    updateCompactUi();
    window.addEventListener("resize", updateCompactUi);
    return () => window.removeEventListener("resize", updateCompactUi);
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
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  // Mobile UI
  const [addOpen, setAddOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const headerSearchRef = useRef<HTMLDivElement | null>(null);
  const headerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const desktopFiltersRef = useRef<HTMLDivElement | null>(null);
  const [desktopFiltersOpen, setDesktopFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Category>("");
  const [typeFilter, setTypeFilter] = useState<ContactType>("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [importantOnly, setImportantOnly] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileAppendNextRef = useRef(false);
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isCompactUi, setIsCompactUi] = useState(false);
  const [desktopRowHeight, setDesktopRowHeight] = useState(30);
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
  const [expandedMobileContactId, setExpandedMobileContactId] = useState<string | null>(null);

  const mergeContactWithLocalState = useCallback(
    (contact: CrmContact): CrmContact => ({
      ...contact,
      notes: (contact?.notes ?? notesById?.[contact.id] ?? "") as string,
      important: Boolean(contact?.important || importantIds.has(contact.id)),
    }),
    [importantIds, notesById],
  );

  const loadContacts = useCallback(
    async (options?: {
      page?: number;
      pageSize?: number;
      query?: string;
      preserveSuccess?: boolean;
      append?: boolean;
    }) => {
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
        if (categoryFilter) params.set("category", categoryFilter);
        if (typeFilter) params.set("contactType", typeFilter);
        if (departmentFilter.trim()) params.set("department", departmentFilter.trim());
        if (importantOnly) params.set("important", "1");

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
        const merged: CrmContact[] = base.map((c: CrmContact) => mergeContactWithLocalState(c));

        setContacts((prev: CrmContact[]) => {
          if (!options?.append) return merged;
          const known = new Set(prev.map((contact: CrmContact) => contact.id));
          return [...prev, ...merged.filter((contact: CrmContact) => !known.has(contact.id))];
        });
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
    [
      mergeContactWithLocalState,
      page,
      pageSize,
      serverQuery,
      categoryFilter,
      typeFilter,
      departmentFilter,
      importantOnly,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setServerQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    mobileAppendNextRef.current = false;
    setExpandedMobileContactId(null);
    setPage(1);
  }, [pageSize, serverQuery, categoryFilter, typeFilter, departmentFilter, importantOnly]);

  useEffect(() => {
    const append = isResponsive && mobileAppendNextRef.current && page > 1;
    void loadContacts({
      page,
      pageSize,
      query: serverQuery,
      append,
      preserveSuccess: append || page > 1,
    });
    mobileAppendNextRef.current = false;
  }, [
    isResponsive,
    loadContacts,
    page,
    pageSize,
    serverQuery,
    categoryFilter,
    typeFilter,
    departmentFilter,
    importantOnly,
  ]);

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

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = exportRef.current;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      setExportOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  useEffect(() => {
    if (!headerSearchOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = headerSearchRef.current;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      setHeaderSearchOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [headerSearchOpen]);

  useEffect(() => {
    if (!desktopFiltersOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = desktopFiltersRef.current;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      setDesktopFiltersOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [desktopFiltersOpen]);

  useEffect(() => {
    if (!headerSearchOpen) return;
    const timer = window.setTimeout(() => {
      headerSearchInputRef.current?.focus();
      headerSearchInputRef.current?.select();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [headerSearchOpen]);

  useEffect(() => {
    if (isResponsive) return;
    setHeaderSearchOpen(false);
    setMobileFiltersOpen(false);
    setExpandedMobileContactId(null);
  }, [isResponsive]);

  useEffect(() => {
    if (isResponsive) {
      setDesktopFiltersOpen(false);
    } else {
      setHeaderSearchOpen(false);
    }
  }, [isResponsive]);

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
  const activeFiltersCount = [categoryFilter, typeFilter, departmentFilter.trim(), importantOnly ? "important" : ""]
    .filter(Boolean)
    .length;
  const hasActiveSearchOrFilters = Boolean(query.trim()) || activeFiltersCount > 0;
  const emptyMessage = hasActiveSearchOrFilters
    ? "Aucun contact trouvé avec ces critères."
    : "Aucun contact pour le moment.";
  const showDesktopEmptyMessage = visibleContacts.length === 0;
  const desktopPlaceholderRowCount = Math.max(0, pageSize - visibleContacts.length - (showDesktopEmptyMessage ? 1 : 0));
  const desktopPlaceholderRows = Array.from({ length: desktopPlaceholderRowCount });
  const mobileHasMore = isResponsive && contacts.length < total;
  const activeFilterChips = [
    categoryFilter ? `Catégorie : ${CATEGORY_LABEL[categoryFilter as Exclude<Category, "">]}` : "",
    typeFilter ? `Type : ${TYPE_LABEL[typeFilter as Exclude<ContactType, "">]}` : "",
    departmentFilter.trim() ? `Département : ${departmentFilter.trim()}` : "",
    importantOnly ? "Important" : "",
  ].filter(Boolean);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isResponsive) return;

    const el = tableWrapRef.current;
    if (!el) return;

    const HEADER_HEIGHT = 34;

    const recompute = () => {
      const wrapHeight = el.clientHeight || 0;
      if (wrapHeight <= HEADER_HEIGHT) return;
      const next = Math.max(18, Math.floor((wrapHeight - HEADER_HEIGHT - 2) / DEFAULT_PAGE_SIZE));
      setDesktopRowHeight((prev) => (prev === next ? prev : next));
    };

    const raf = window.requestAnimationFrame(recompute);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", recompute);

    return () => {
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [isResponsive, loading, page, pageSize, visibleContacts.length, showDesktopEmptyMessage]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isResponsive) return;

    const sentinel = mobileLoadMoreRef.current;
    if (!sentinel) return;

    const root = tableWrapRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (loading) return;
        if (contacts.length >= total) return;
        if (mobileAppendNextRef.current) return;

        mobileAppendNextRef.current = true;
        setPage((prev) => (prev >= pageCount ? prev : prev + 1));
      },
      {
        root,
        rootMargin: "220px 0px 220px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isResponsive, loading, contacts.length, total, pageCount]);


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

  const actionRecipients = useMemo(() => {
    const source = selectedContacts.length > 0 ? selectedContacts : primaryContact ? [primaryContact] : [];
    const seen = new Set<string>();
    return source
      .map((contact) => {
        const email = (contact.email || "").trim();
        if (!email) return null;
        const lower = email.toLowerCase();
        if (seen.has(lower)) return null;
        seen.add(lower);
        return {
          email,
          contact_id: contact.id,
          display_name: buildDisplayName(contact) || null,
        };
      })
      .filter(Boolean) as Array<{ email: string; contact_id: string; display_name: string | null }>;
  }, [selectedContacts, primaryContact]);


  const toggleSelect = (id: string) => {
    const contact = visibleContacts.find((item) => item.id === id) ?? selectedContactsById[id];
    const isSelected = selectedContactIds.has(id);

    setSelectedContactIds((prev) => {
      const next = new Set<string>(prev);
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

  const clearSelection = useCallback(() => {
    setSelectedContactIds(new Set());
    setSelectedContactsById({});
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedContactIds((prev) => {
      const next = new Set<string>(prev);
      visibleContacts.forEach((contact) => next.add(contact.id));
      return next;
    });

    setSelectedContactsById((prev) => {
      const next = { ...prev };
      visibleContacts.forEach((contact) => {
        next[contact.id] = contact;
      });
      return next;
    });
  }, [visibleContacts]);

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedContactIds((prev) => {
        const next = new Set<string>(prev);
        visibleContacts.forEach((contact) => next.delete(contact.id));
        return next;
      });

      setSelectedContactsById((prev) => {
        const next = { ...prev };
        visibleContacts.forEach((contact) => {
          delete next[contact.id];
        });
        return next;
      });
      return;
    }

    selectAllVisible();
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
      const next = new Set<string>(prev);
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
        const next = new Set<string>(prev);
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
  const inferredDefaults = inferImportedDefaults(rows);
  const cleaned = rows
    .map((row) => normalizeImportedRow(row, inferredDefaults))
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

    const inserted = Math.max(0, Number(j?.inserted ?? cleaned.length));
    const skippedDuplicates = Math.max(0, Number(j?.skipped_duplicates ?? 0));
    const skippedExisting = Math.max(0, Number(j?.skipped_existing ?? 0));
    const ignoredInvalid = Math.max(0, Number(j?.ignored_invalid ?? 0));
    const parts = [`Import terminé : ${inserted} contact(s) ajouté(s).`];
    if (skippedDuplicates > 0) parts.push(`${skippedDuplicates} doublon${skippedDuplicates > 1 ? "s" : ""} ignoré${skippedDuplicates > 1 ? "s" : ""} dans le fichier.`);
    if (skippedExisting > 0) parts.push(`${skippedExisting} email${skippedExisting > 1 ? "s" : ""} déjà présent${skippedExisting > 1 ? "s" : ""} ignoré${skippedExisting > 1 ? "s" : ""}.`);
    if (ignoredInvalid > 0) parts.push(`${ignoredInvalid} ligne${ignoredInvalid > 1 ? "s" : ""} invalide${ignoredInvalid > 1 ? "s" : ""} ignorée${ignoredInvalid > 1 ? "s" : ""}.`);
    setSuccess(parts.join(" "));
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
  if (categoryFilter) params.set("category", categoryFilter);
  if (typeFilter) params.set("contactType", typeFilter);
  if (departmentFilter.trim()) params.set("department", departmentFilter.trim());
  if (importantOnly) params.set("important", "1");

  const r = await fetch(`/api/crm/contacts?${params.toString()}`, { method: "GET" });
  if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Export impossible."));
  const j = await r.json().catch(() => ({}));
  const base = Array.isArray(j?.contacts) ? j.contacts : [];
  return base.map((contact: CrmContact) => mergeContactWithLocalState(contact));
}, [mergeContactWithLocalState, serverQuery, categoryFilter, typeFilter, departmentFilter, importantOnly]);

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
      billing_address: c.billing_address ?? "",
      delivery_address: c.delivery_address ?? "",
      vat_number: c.vat_number ?? "",
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
      { wch: 32 },
      { wch: 32 },
      { wch: 18 },
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
    if (actionRecipients.length === 0) return;

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          "inrcy_pending_mail_compose",
          JSON.stringify({
            to: actionEmails,
            from: "crm",
            contactId: primaryContact?.id || "",
            contactName: primaryContact ? buildDisplayName(primaryContact) : "",
            recipients: actionRecipients,
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
    if ((c.siret || "").trim()) params.set("clientSiren", (c.siret || "").trim());
    if ((c.vat_number || "").trim()) params.set("clientVatNumber", (c.vat_number || "").trim());
    if ((c.billing_address || "").trim()) params.set("billingAddress", (c.billing_address || "").trim());
    if ((c.delivery_address || "").trim()) params.set("deliveryAddress", (c.delivery_address || "").trim());
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
    setExpandedMobileContactId(null);
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
      billing_address: (c.billing_address ?? "") as string,
      delivery_address: (c.delivery_address ?? "") as string,
      vat_number: (c.vat_number ?? "") as string,
      city: (c.city ?? "") as string,
      postal_code: (c.postal_code ?? "") as string,
      // ✅ évite le warning React (uncontrolled -> controlled)
      category: ((c.category as any) ?? "") as Category,
      contact_type: ((c.contact_type as any) ?? "") as ContactType,
      notes: ((c.notes as any) ?? "") as string,
      important: Boolean((c as any).important ?? importantIds.has(c.id)),
    });
    setAddOpen(true);
    try {
      if (window.matchMedia("(max-width: 900px)").matches) {
        return;
      }
    } catch {}

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const deliverySameAsPrimary = !String(draft.delivery_address || "").trim() || String(draft.delivery_address || "").trim() === String(draft.address || "").trim();

  function updatePrimaryAddress(value: string) {
    setDraft((current) => {
      const previousAddress = String(current.address || "").trim();
      const previousDelivery = String(current.delivery_address || "").trim();
      const linked = !previousDelivery || previousDelivery === previousAddress;
      return {
        ...current,
        address: value,
        delivery_address: linked ? value : current.delivery_address,
      };
    });
  }

  function setDeliverySameAsPrimary(checked: boolean) {
    setDraft((current) => ({
      ...current,
      delivery_address: checked ? String(current.address || "") : "",
    }));
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
      billing_address: (draft.billing_address || draft.address || "").trim(),
      delivery_address: (draft.delivery_address || "").trim(),
      vat_number: (draft.vat_number || "").trim(),
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
      const nextPage = isResponsive ? 1 : editingId ? page : 1;
      if (nextPage === 1) setPage(1);
      await loadContacts({ page: nextPage, preserveSuccess: true });
      // If editing, persist ⭐ + notes locally (works even if backend doesn't store it yet)
      if (editingId) {
        setNoteForId(editingId, (draft.notes || "").trim());
        if (draft.important) {
          setImportantIds((prev) => {
            const next = new Set<string>(prev);
            next.add(editingId);
            persistImportant(next);
            return next;
          });
        } else {
          setImportantIds((prev) => {
            const next = new Set<string>(prev);
            next.delete(editingId);
            persistImportant(next);
            return next;
          });
        }
      }
      startNew();
      setAddOpen(false);
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
      const ids = Array.from(selectedContactIds) as string[];
      // Suppression en parallèle (API actuelle : 1 id par requête)
      await Promise.all(
        ids.map(async (id) => {
          const r = await fetch(`/api/crm/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Impossible de supprimer."));
        })
      );

      // reload + reset states
      const targetReloadPage = isResponsive ? 1 : page;
      if (targetReloadPage === 1) setPage(1);
      await loadContacts({ page: targetReloadPage, preserveSuccess: true });
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
      const targetReloadPage = isResponsive ? 1 : page;
      if (targetReloadPage === 1) setPage(1);
      await loadContacts({ page: targetReloadPage, preserveSuccess: true });
      setSelectedContactIds((prev) => {
        const next = new Set<string>(prev);
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

  const statsItems = [
    { label: "Contacts", value: kpis.total },
    { label: "Prospects", value: kpis.prospects },
    { label: "Clients", value: kpis.clients },
    { label: "Partenaires", value: kpis.partenaires },
    { label: "Fournisseurs", value: kpis.fournisseurs },
    { label: "Autres", value: kpis.autres },
  ];

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
        <div className={styles.titleBlock}>
          <div className={styles.titleWrap}>
            <img src="/inrcrm-logo.png" alt="iNr’CRM" style={{ width: 154, height: 64, display: "block" }} />
            {!isResponsive ? <p className={styles.subInline}>La centrale de tous vos contacts</p> : null}
          </div>
          {isResponsive ? <p className={styles.mobileTagline}>La centrale de tous vos contacts</p> : null}
        </div>

        <div className={styles.headerRight}>
          {!isResponsive ? <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’CRM" /> : null}

          {isResponsive ? (
            <>
              <div className={styles.headerSearchWrap} ref={headerSearchRef}>
                <button
                  type="button"
                  className={`${styles.headerIconBtn} ${styles.searchBtn}`.trim()}
                  onClick={() => {
                    setStatsOpen(false);
                    setHeaderSearchOpen((prev) => !prev);
                  }}
                  aria-expanded={headerSearchOpen ? "true" : "false"}
                  aria-label="Rechercher un contact"
                  title="Rechercher"
                >
                  🔍
                </button>

                {headerSearchOpen ? (
                  <div className={styles.headerSearchDropdown}>
                    <div className={styles.searchWrap}>
                      <input
                        ref={headerSearchInputRef}
                        className={`${styles.search} ${styles.headerSearchActive}`.trim()}
                        placeholder="Rechercher un contact..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.statsWrap} ref={statsRef}>
                <button
                  type="button"
                  className={styles.headerIconBtn}
                  onClick={() => {
                    setHeaderSearchOpen(false);
                    setStatsOpen((v) => !v);
                  }}
                  aria-expanded={statsOpen ? "true" : "false"}
                  aria-label="Ouvrir le menu CRM"
                  title="Menu CRM"
                >
                  ☰
                </button>

                {statsOpen ? (
                  <div className={`${styles.statsDropdown} ${styles.mobileMenuDropdown}`.trim()} role="menu">
                    <div className={styles.statsTitle}>Menu CRM</div>

                    <div className={styles.mobileMenuActions}>
                      <button
                        className={styles.mobileMenuItem}
                        type="button"
                        onClick={() => {
                          setStatsOpen(false);
                          startNew();
                          setAddOpen(true);
                        }}
                        disabled={saving}
                      >
                        Ajouter un contact
                      </button>
                      <button
                        className={styles.mobileMenuItem}
                        type="button"
                        onClick={() => {
                          setStatsOpen(false);
                          triggerImport();
                        }}
                        disabled={saving || importing}
                      >
                        {importing ? "Import…" : "Importer"}
                      </button>
                      <button
                        className={styles.mobileMenuItem}
                        type="button"
                        onClick={() => {
                          setStatsOpen(false);
                          void exportExcel();
                        }}
                        disabled={saving || Boolean(exportingFormat) || total === 0}
                      >
                        Export Excel
                      </button>
                      <button
                        className={styles.mobileMenuItem}
                        type="button"
                        onClick={() => {
                          setStatsOpen(false);
                          void exportCsv();
                        }}
                        disabled={saving || Boolean(exportingFormat) || total === 0}
                      >
                        Export CSV
                      </button>
                      <button
                        className={styles.mobileMenuItem}
                        type="button"
                        onClick={() => {
                          setStatsOpen(false);
                          setHelpOpen(true);
                        }}
                      >
                        Aide
                      </button>
                    </div>

                    <div className={styles.mobileMenuStats}>
                      {statsItems.map((item) => (
                        <div key={item.label} className={styles.statsItem}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.closeWrap}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => router.push("/dashboard")}
                  aria-label="Fermer"
                  title="Fermer"
                >
                  <span className={styles.closeIcon}>✕</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`${styles.primaryBtn} ${styles.headerActionBtn}`}
                onClick={() => {
                  startNew();
                  setAddOpen(true);
                }}
                disabled={saving}
              >
                + Ajouter
              </button>

              <button
                type="button"
                className={`${styles.ghostBtn} ${styles.headerActionBtn}`}
                onClick={triggerImport}
                disabled={saving || importing}
                title="Importer un fichier CSV, JSON ou Excel (.xlsx, .xls)"
              >
                {importing ? "Import…" : "Importer"}
              </button>

              <div className={styles.exportWrap} ref={exportRef}>
                <button
                  className={`${styles.ghostBtn} ${styles.headerActionBtn}`}
                  type="button"
                  onClick={() => setExportOpen((prev) => !prev)}
                  disabled={saving || Boolean(exportingFormat) || total === 0}
                  aria-expanded={exportOpen ? "true" : "false"}
                  title={total === 0 ? "Aucun contact à exporter" : "Choisir le format d’export"}
                >
                  {exportingFormat ? "Export…" : "Exporter"} <span className={styles.caret}>▾</span>
                </button>

                {exportOpen ? (
                  <div className={styles.exportMenu} role="menu">
                    <button
                      className={styles.exportItem}
                      type="button"
                      onClick={() => {
                        setExportOpen(false);
                        void exportExcel();
                      }}
                      disabled={Boolean(exportingFormat)}
                    >
                      Excel (.xlsx)
                    </button>
                    <button
                      className={styles.exportItem}
                      type="button"
                      onClick={() => {
                        setExportOpen(false);
                        void exportCsv();
                      }}
                      disabled={Boolean(exportingFormat)}
                    >
                      CSV (.csv)
                    </button>
                  </div>
                ) : null}
              </div>

              <div className={styles.statsWrap} ref={statsRef}>
                <button
                  type="button"
                  className={`${styles.ghostBtn} ${styles.headerActionBtn} ${styles.headerStatsBtn}`}
                  onClick={() => {
                    setHeaderSearchOpen(false);
                    setExportOpen(false);
                    setStatsOpen((v) => !v);
                  }}
                  aria-expanded={statsOpen ? "true" : "false"}
                  title="Statistiques"
                >
                  Stats
                </button>

                {statsOpen ? (
                  <div className={styles.statsDropdown} role="menu">
                    <div className={styles.statsTitle}>Statistiques</div>
                    <div className={styles.statsGrid}>
                      {statsItems.map((item) => (
                        <div key={item.label} className={styles.statsItem}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.closeWrap}>
                <button type="button" className={styles.backBtn} onClick={() => router.push("/dashboard")} aria-label="Fermer" title="Fermer">
                  {isCompactUi ? <span className={styles.closeIcon}>✕</span> : <span className={styles.closeText}>Fermer</span>}
                </button>
              </div>
            </>
          )}
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

                <label className={`${styles.label} ${styles.mfVat} ${styles.fVat}`}>
                  <span>TVA intracom</span>
                  <input
                    className={styles.input}
                    value={draft.vat_number}
                    onChange={(e) => setDraft((s) => ({ ...s, vat_number: e.target.value }))}
                    placeholder="FR12345678901"
                  />
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

                <label className={`${styles.label} ${styles.mfAddress} ${styles.fAddress}`}>
                  <span>Adresse principale</span>
                  <input
                    className={styles.input}
                    value={draft.address}
                    onChange={(e) => updatePrimaryAddress(e.target.value)}
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

                <label className={`${styles.label} ${styles.mfDeliverySame}`}>
                  <span className={styles.sameAddressLabel}>Adresse de livraison identique</span>
                  <label className={styles.sameAddressCheck}>
                    <input
                      type="checkbox"
                      checked={deliverySameAsPrimary}
                      onChange={(e) => setDeliverySameAsPrimary(e.target.checked)}
                    />
                    <span>Utiliser l'adresse principale</span>
                  </label>
                </label>

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
              <div className={`${styles.formGrid} ${styles.modalFormGrid} ${styles.desktopModalGrid}`}>
                <label className={`${styles.label} ${styles.col6} ${styles.fName}`}>
                  <span>Nom Prénom / Raison sociale</span>
                  <input
                    className={styles.input}
                    value={draft.display_name}
                    onChange={(e) => setDraft((s) => ({ ...s, display_name: e.target.value }))}
                    placeholder="Dupont Marie / SAS Exemple"
                    autoComplete="name"
                  />
                </label>

                <label className={`${styles.label} ${styles.col3} ${styles.fPhone}`}>
                  <span>Téléphone</span>
                  <input
                    className={styles.input}
                    value={draft.phone}
                    onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
                    placeholder="06 00 00 00 00"
                    autoComplete="tel"
                  />
                </label>

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

                <label className={`${styles.label} ${styles.col2} ${styles.fVat}`}>
                  <span>TVA</span>
                  <input
                    className={styles.input}
                    value={draft.vat_number}
                    onChange={(e) => setDraft((s) => ({ ...s, vat_number: e.target.value }))}
                    placeholder="FR12345678901"
                  />
                </label>

                <label className={`${styles.label} ${styles.col2} ${styles.modalImportantField} ${styles.fImportant}`}>
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

                <label className={`${styles.label} ${styles.col5} ${styles.fAddress}`}>
                  <span>Adresse principale</span>
                  <input
                    className={styles.input}
                    value={draft.address}
                    onChange={(e) => updatePrimaryAddress(e.target.value)}
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

                <label className={`${styles.label} ${styles.col3} ${styles.sameAddressField}`}>
                  <span>Adresse de livraison</span>
                  <label className={styles.sameAddressCheck}>
                    <input
                      type="checkbox"
                      checked={deliverySameAsPrimary}
                      onChange={(e) => setDeliverySameAsPrimary(e.target.checked)}
                    />
                    <span>Identique</span>
                  </label>
                </label>

                <label className={`${styles.label} ${styles.col12} ${styles.fNotes}`}>
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
                onClick={save}
                disabled={saving}
              >
                {editingId ? "Mettre à jour" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className={`${styles.card} ${styles.tableCard} ${styles.crmBoardCard}`} onClick={(e) => e.stopPropagation()}>
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

        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        <div className={styles.secondaryToolbar}>
          {!isResponsive ? (
            <div className={styles.selectionMeta}>
              {selectedContactIds.size > 0 ? `${selectedContactIds.size} contact${selectedContactIds.size > 1 ? "s" : ""} sélectionné${selectedContactIds.size > 1 ? "s" : ""}` : "Aucune sélection"}
            </div>
          ) : null}

          <div className={`${styles.bulkActions} ${isResponsive ? styles.mobileBulkActions : ""}`.trim()}>
            {isResponsive ? (
              <>
                <button
                  aria-label="Tout sélectionner"
                  className={`${styles.ghostBtn} ${styles.iconOnlyBtn}`.trim()}
                  type="button"
                  onClick={selectAllVisible}
                  disabled={visibleContacts.length === 0 || saving}
                  title="Tout sélectionner"
                >
                  ☑
                </button>

                <button
                  aria-label="Désélectionner"
                  className={`${styles.ghostBtn} ${styles.iconOnlyBtn}`.trim()}
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedContactIds.size === 0 || saving}
                  title={selectedContactIds.size === 0 ? "Aucun contact sélectionné" : "Désélectionner"}
                >
                  ⊟
                </button>
              </>
            ) : (
              <button
                aria-label="Désélectionner"
                className={styles.ghostBtn}
                type="button"
                onClick={clearSelection}
                disabled={selectedContactIds.size === 0 || saving}
                title={selectedContactIds.size === 0 ? "Aucun contact sélectionné" : "Vider la sélection"}
              >
                Désélectionner
              </button>
            )}

            <div className={styles.actionsWrap} ref={actionsRef}>
              <button
                className={`${styles.actionsBtn} ${isResponsive ? styles.mobileActionsBtn : ""}`.trim()}
                type="button"
                onClick={() => {
                  if (isResponsive) setMobileFiltersOpen(false);
                  setDesktopFiltersOpen(false);
                  setActionsOpen((v) => !v);
                }}
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

            {isResponsive ? (
              <button
                type="button"
                className={`${styles.ghostBtn} ${styles.mobileFilterActionBtn}`.trim()}
                onClick={() => {
                  setActionsOpen(false);
                  setMobileFiltersOpen((prev) => !prev);
                }}
                aria-expanded={mobileFiltersOpen ? "true" : "false"}
              >
                Filtres{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
              </button>
            ) : null}

            <button
              aria-label="Supprimer"
              className={`${styles.smallBtn} ${styles.dangerBtn} ${isResponsive ? styles.mobileDeleteBtn : ""}`.trim()}
              type="button"
              onClick={removeSelected}
              disabled={selectedContactIds.size === 0 || saving}
              title={selectedContactIds.size === 0 ? "Sélectionne 1 ou plusieurs contacts" : `Supprimer ${selectedContactIds.size} contact(s)`}
            >
              🗑️
            </button>
          </div>

          {!isResponsive ? (
            <div className={styles.filtersWrap} ref={desktopFiltersRef}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => {
                  setActionsOpen(false);
                  setDesktopFiltersOpen((prev) => !prev);
                }}
                aria-expanded={desktopFiltersOpen ? "true" : "false"}
              >
                Filtres{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
              </button>

              {desktopFiltersOpen ? (
                <div className={styles.desktopFiltersPanel}>
                  <label className={styles.label}>
                    <span>Catégorie</span>
                    <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category)}>
                      <option value="">Toutes</option>
                      <option value="particulier">Particulier</option>
                      <option value="professionnel">Professionnel</option>
                      <option value="collectivite_publique">Institution</option>
                    </select>
                  </label>

                  <label className={styles.label}>
                    <span>Type</span>
                    <select className={styles.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ContactType)}>
                      <option value="">Tous</option>
                      <option value="client">Client</option>
                      <option value="prospect">Prospect</option>
                      <option value="fournisseur">Fournisseur</option>
                      <option value="partenaire">Partenaire</option>
                      <option value="autre">Autre</option>
                    </select>
                  </label>

                  <label className={styles.label}>
                    <span>Département</span>
                    <input
                      className={styles.input}
                      inputMode="numeric"
                      placeholder="62"
                      maxLength={3}
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(sanitizeDepartmentFilter(e.target.value))}
                    />
                  </label>

                  <label className={`${styles.label} ${styles.desktopImportantToggle}`.trim()}>
                    <span>Important</span>
                    <button
                      type="button"
                      className={`${styles.ghostBtn} ${importantOnly ? styles.mobileImportantActive : ""}`.trim()}
                      onClick={() => setImportantOnly((prev) => !prev)}
                    >
                      {importantOnly ? "Uniquement les importants" : "Tous les contacts"}
                    </button>
                  </label>

                  <button
                    type="button"
                    className={styles.mobileFiltersReset}
                    onClick={() => {
                      setCategoryFilter("");
                      setTypeFilter("");
                      setDepartmentFilter("");
                      setImportantOnly(false);
                    }}
                  >
                    Réinitialiser
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!isResponsive ? (
            <div className={styles.tableSearchWrap}>
              <div className={styles.searchWrap}>
                <input
                  className={styles.search}
                  placeholder="Rechercher..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {!isResponsive ? (
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
          ) : null}
        </div>

        {isResponsive ? (
          <div className={styles.mobileControls}>
            {activeFilterChips.length > 0 ? (
              <div className={styles.mobileFilterChips}>
                {activeFilterChips.map((chip) => (
                  <span key={chip} className={styles.mobileFilterChip}>{chip}</span>
                ))}
                <button
                  type="button"
                  className={styles.mobileFiltersReset}
                  onClick={() => {
                    setCategoryFilter("");
                    setTypeFilter("");
                    setDepartmentFilter("");
                    setImportantOnly(false);
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            ) : null}

            {mobileFiltersOpen ? (
              <div className={styles.mobileFiltersPanel}>
                <label className={styles.label}>
                  <span>Catégorie</span>
                  <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category)}>
                    <option value="">Toutes</option>
                    <option value="particulier">Particulier</option>
                    <option value="professionnel">Professionnel</option>
                    <option value="collectivite_publique">Institution</option>
                  </select>
                </label>

                <label className={styles.label}>
                  <span>Type</span>
                  <select className={styles.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ContactType)}>
                    <option value="">Tous</option>
                    <option value="client">Client</option>
                    <option value="prospect">Prospect</option>
                    <option value="fournisseur">Fournisseur</option>
                    <option value="partenaire">Partenaire</option>
                    <option value="autre">Autre</option>
                  </select>
                </label>

                <label className={styles.label}>
                  <span>Département</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    placeholder="62"
                    maxLength={3}
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(sanitizeDepartmentFilter(e.target.value))}
                  />
                </label>

                <label className={`${styles.label} ${styles.mobileImportantToggle}`.trim()}>
                  <span>Important</span>
                  <button
                    type="button"
                    className={`${styles.ghostBtn} ${importantOnly ? styles.mobileImportantActive : ""}`.trim()}
                    onClick={() => setImportantOnly((prev) => !prev)}
                  >
                    {importantOnly ? "Uniquement les importants" : "Tous les contacts"}
                  </button>
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {loading && !(isResponsive && page > 1) ? <div className={styles.muted}>Chargement...</div> : null}

        <div className={styles.tableWrap} ref={tableWrapRef}>
          {/*
            Responsive (mobile): tableau "détaché" du desktop.
            On garde les mêmes infos mais une construction différente (grid) pour coller au design.
          */}
          {isResponsive ? (
            <div className={styles.mobileTable}>
              {visibleContacts.length === 0 ? (
                <div className={styles.mobileEmpty}>{emptyMessage}</div>
              ) : (
                visibleContacts.map((c) => {
                  const isExpanded = expandedMobileContactId === c.id;
                  return (
                    <div key={c.id} className={styles.mobileContactBlock}>
                      <div className={`${styles.mobileListRow} ${isExpanded ? styles.mobileListRowOpen : ""}`.trim()}>
                        <label
                          className={styles.mobileCheckboxWrap}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={selectedContactIds.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                            aria-label={`Sélectionner ${buildDisplayName(c) || "ce contact"}`}
                          />
                        </label>

                        <button
                          type="button"
                          className={styles.mobileListMain}
                          onClick={() => setExpandedMobileContactId((prev) => (prev === c.id ? null : c.id))}
                          aria-expanded={isExpanded ? "true" : "false"}
                        >
                          <span className={`${styles.mobileListName} ${c.important ? styles.nameImportant : ""}`.trim()}>
                            {buildDisplayName(c) || "Contact sans nom"}
                          </span>
                        </button>

                        <button
                          type="button"
                          className={styles.mobileExpandBtn}
                          onClick={() => setExpandedMobileContactId((prev) => (prev === c.id ? null : c.id))}
                          aria-label={isExpanded ? "Réduire le détail" : "Afficher le détail"}
                          aria-expanded={isExpanded ? "true" : "false"}
                        >
                          {isExpanded ? "−" : "+"}
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className={styles.mobileRowDetails}>
                          <div className={styles.mobileDetailGrid}>
                            <div>
                              <span className={styles.mobileDetailLabel}>Mail</span>
                              <strong>{c.email || "—"}</strong>
                            </div>
                            <div>
                              <span className={styles.mobileDetailLabel}>Téléphone</span>
                              <strong>{c.phone || "—"}</strong>
                            </div>
                            <div>
                              <span className={styles.mobileDetailLabel}>Catégorie</span>
                              <strong>{c.category ? CATEGORY_LABEL[c.category as Exclude<Category, "">] : "—"}</strong>
                            </div>
                            <div>
                              <span className={styles.mobileDetailLabel}>Type</span>
                              <strong>{c.contact_type ? TYPE_LABEL[c.contact_type as Exclude<ContactType, "">] : "—"}</strong>
                            </div>
                            <div>
                              <span className={styles.mobileDetailLabel}>Département</span>
                              <strong>{getDepartmentCode(c.postal_code) || "—"}</strong>
                            </div>
                            <div>
                              <span className={styles.mobileDetailLabel}>Adresse</span>
                              <strong>{[c.address, c.postal_code, c.city].filter(Boolean).join(" ") || "—"}</strong>
                            </div>
                            {(c.notes || "").trim() ? (
                              <div className={styles.mobileDetailNotes}>
                                <span className={styles.mobileDetailLabel}>Notes</span>
                                <strong>{c.notes}</strong>
                              </div>
                            ) : null}
                          </div>

                          <div className={styles.mobileDetailActions}>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              disabled={!c.email}
                              onClick={(e) => {
                                e.stopPropagation();
                                sendMailToContact(c);
                              }}
                            >
                              Mail
                            </button>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                goPlanifierIntervention(c);
                              }}
                            >
                              Agenda
                            </button>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                goNewDevis(c);
                              }}
                            >
                              Devis
                            </button>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                goNewFacture(c);
                              }}
                            >
                              Facture
                            </button>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(c);
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleImportant(c.id);
                              }}
                            >
                              {c.important ? "Retirer ★" : "Mettre ★"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.smallBtn} ${styles.dangerBtn}`.trim()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void remove(c.id);
                              }}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}

              <div ref={mobileLoadMoreRef} className={styles.mobileLoadSentinel} aria-hidden="true" />

              {loading && page > 1 ? <div className={styles.mobileLoadMore}>Chargement de plus de contacts...</div> : null}
              {!mobileHasMore && visibleContacts.length > 0 ? <div className={styles.mobileListEnd}>Tous les contacts sont affichés.</div> : null}
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
                {showDesktopEmptyMessage ? (
                  <tr className={styles.placeholderMessageRow} style={{ height: `${desktopRowHeight}px` }}>
                    <td colSpan={8} className={styles.empty}>
                      {emptyMessage}
                    </td>
                  </tr>
                ) : null}

                {visibleContacts.map((c) => (
                  <tr
                    key={c.id}
                    className={selectedContactIds.has(c.id) ? styles.rowSelected : undefined}
                    onClick={() => startEdit(c)}
                    style={{ cursor: "pointer", height: `${desktopRowHeight}px` }}
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
                ))}

                {desktopPlaceholderRows.map((_, index) => (
                  <tr key={`placeholder-row-${page}-${index}`} className={styles.placeholderRow} aria-hidden="true" style={{ height: `${desktopRowHeight}px` }}>
                    <td className={styles.tdSelect}>&nbsp;</td>
                    <td className={styles.tdName}>&nbsp;</td>
                    <td className={`${styles.mono} ${styles.tdMail}`}>&nbsp;</td>
                    <td className={`${styles.mono} ${styles.tdTel}`}>&nbsp;</td>
                    <td className={`${styles.mono} ${styles.tdCp}`}>&nbsp;</td>
                    <td className={styles.tdCat}>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td className={styles.tdStar}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!isResponsive ? (
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
        ) : (
          <div className={styles.mobileListSummary}>
            {total > 0 ? `${visibleContacts.length} / ${total} contact${total > 1 ? "s" : ""}` : "0 contact"}
          </div>
        )}
      </section>
    </div>
  );
}
