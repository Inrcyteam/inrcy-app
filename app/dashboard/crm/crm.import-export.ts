import type { Category, ContactType } from "./crm.types";

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
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

export function toCsvValue(v: any) {
  const s = String(v ?? "");
  const needsWrap = /[",;\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsWrap ? `"${escaped}"` : escaped;
}

export function contactsToCsv(rows: any[]) {
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

export function detectDelimiter(line: string) {
  const c = (line.match(/,/g) || []).length;
  const s = (line.match(/;/g) || []).length;
  const t = (line.match(/\t/g) || []).length;
  if (s >= c && s >= t) return ";";
  if (t >= c && t >= s) return "\t";
  return ",";
}

export function parseCsv(text: string) {
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

export function parseBooleanLike(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "vrai", "oui", "yes", "y", "x", "important", "★"].includes(normalized);
}

export function normalizeImportKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_/\-]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildImportRowMap(row: Record<string, unknown>) {
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

export function pickImportedValue(map: Map<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const direct = map.get(key);
    if (direct != null && String(direct).trim() !== "") return direct;
    const normalizedKey = normalizeImportKey(key);
    const normalized = map.get(normalizedKey);
    if (normalized != null && String(normalized).trim() !== "") return normalized;
  }
  return "";
}

export function normalizeImportedCategory(value: unknown): Category {
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

export function normalizeImportedContactType(value: unknown): ContactType {
  const normalized = normalizeImportKey(value);
  if (!normalized) return "";
  if (["client", "clients"].includes(normalized)) return "client";
  if (["prospect", "propsect", "prospects"].includes(normalized)) return "prospect";
  if (["fournisseur", "fournisseurs", "supplier"].includes(normalized)) return "fournisseur";
  if (["partenaire", "partenaires", "partner"].includes(normalized)) return "partenaire";
  if (["autre", "other", "others"].includes(normalized)) return "autre";
  return "";
}

export function inferImportedDefaults(rows: any[]) {
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

export async function loadXlsxModule() {
  return (await import("@/lib/vendor/xlsx.mjs")) as any;
}

export function normalizeImportedRow(
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



export function normalizeAddressPart(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function addressContainsPart(address: string, part: string) {
  if (!address || !part) return false;
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return normalize(address).includes(normalize(part));
}

export function buildFullCrmAddress(address?: string | null, postalCode?: string | null, city?: string | null) {
  const parts: string[] = [];
  const base = normalizeAddressPart(address);
  if (base) parts.push(base);

  [postalCode, city]
    .map(normalizeAddressPart)
    .filter(Boolean)
    .forEach((part) => {
      const current = parts.join(" ");
      if (!addressContainsPart(current, part)) parts.push(part);
    });

  return parts.join(" ").trim();
}
