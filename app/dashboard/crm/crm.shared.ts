import styles from "./crm.module.css";
import type { Category, ContactType, CrmContact, CrmDraft } from "./crm.types";

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [20] as const;

export const CATEGORY_LABEL: Record<Exclude<Category, "">, string> = {
  particulier: "Particulier",
  professionnel: "Professionnel",
  collectivite_publique: "Institution",
};

export const TYPE_LABEL: Record<Exclude<ContactType, "">, string> = {
  client: "Client",
  prospect: "Prospect",
  fournisseur: "Fournisseur",
  partenaire: "Partenaire",
  autre: "Autre",
};

export const CATEGORY_LABEL_SHORT: Record<Exclude<Category, "">, string> = {
  particulier: "Part",
  professionnel: "Pro",
  collectivite_publique: "Inst",
};

export const TYPE_LABEL_SHORT: Record<Exclude<ContactType, "">, string> = {
  client: "Client",
  prospect: "Prosp",
  fournisseur: "Fourn",
  partenaire: "Parten",
  autre: "Autre",
};

export function emptyDraft(): CrmDraft {
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
    category: "",
    contact_type: "",
    notes: "",
    important: false,
  };
}

export function sanitizeDepartmentFilter(value: string) {
  const cleaned = String(value ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();

  if (/^(97|98)\d/.test(cleaned)) return cleaned.slice(0, 3);
  return cleaned.slice(0, 2);
}

export function getDepartmentCode(postalCode?: string) {
  const raw = String(postalCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!raw) return "";
  if (/^(97|98)\d/.test(raw)) return raw.slice(0, 3);
  return raw.slice(0, 2);
}

export function buildDisplayName(c: Pick<CrmContact, "last_name" | "first_name" | "company_name">) {
  const left = [c.last_name ?? "", c.first_name ?? ""].join(" ").replace(/\s+/g, " ").trim();
  const right = (c.company_name ?? "").trim();
  if (left && right) return `${left} / ${right}`;
  return left || right;
}

export function parseDisplayName(v: string) {
  const raw = (v || "").trim();
  if (!raw) return { last_name: "", first_name: "", company_name: "" };

  const parts = raw.split("/");
  const left = (parts[0] || "").trim();
  const right = (parts.slice(1).join("/") || "").trim();

  return { last_name: left, first_name: "", company_name: right };
}

export function typeBadgeClass(t: ContactType) {
  if (!t) return `${styles.typeBadge}`;
  if (t === "client") return `${styles.typeBadge} ${styles.typeClient}`;
  if (t === "prospect") return `${styles.typeBadge} ${styles.typeProspect}`;
  if (t === "fournisseur") return `${styles.typeBadge} ${styles.typeFournisseur}`;
  return `${styles.typeBadge} ${styles.typePartenaire}`;
}

export function categoryBadgeClass(c: Category) {
  if (!c) return `${styles.catBadge}`;
  if (c === "professionnel") return `${styles.catBadge} ${styles.catPro}`;
  if (c === "collectivite_publique") return `${styles.catBadge} ${styles.catPublic}`;
  return `${styles.catBadge} ${styles.catPart}`;
}
