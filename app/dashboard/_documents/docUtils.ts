export type LineItem = {
  id: string;
  label: string;
  qty: number;
  unitPrice: number; // HT
  vatRate: number; // 0, 5.5, 10, 20
};

export function uid(prefix = "l") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function formatEuro(value: number) {
  return value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcLineHT(l: LineItem) {
  return round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0));
}

export function calcLineTVA(l: LineItem, vatDispense = false) {
  if (vatDispense) return 0;
  return round2(calcLineHT(l) * ((Number(l.vatRate) || 0) / 100));
}

export function calcTotals(lines: LineItem[], vatDispense = false) {
  const totalHT = round2(lines.reduce((a, l) => a + calcLineHT(l), 0));
  const totalTVA = round2(lines.reduce((a, l) => a + calcLineTVA(l, vatDispense), 0));
  const totalTTC = round2(totalHT + totalTVA);
  return { totalHT, totalTVA, totalTTC };
}

export function generateNumber(prefix: "FAC" | "DEV") {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export type DocKind = "facture" | "devis";

export type DocRecord = {
  id: string;
  kind: DocKind;
  number: string;
  createdAtISO: string;
  dueAtISO?: string | null;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  status: "brouillon" | "envoye" | "paye";
  lines: LineItem[];
  vatDispense?: boolean;
  validityDays?: number; // pour devis (ex: 30)
};

const LS_KEY = "inrcy_docs_v1";

export function loadDocs(): DocRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DocRecord[];
  } catch {
    return [];
  }
}

export function saveDocs(docs: DocRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(docs));
}

export function upsertDoc(doc: DocRecord) {
  const docs = loadDocs();
  const idx = docs.findIndex((d) => d.id === doc.id);
  const next = idx >= 0 ? docs.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...docs];
  saveDocs(next);
  return next;
}

export function deleteDoc(id: string) {
  const docs = loadDocs().filter((d) => d.id !== id);
  saveDocs(docs);
  return docs;
}

/* -------- Actions helpers (LISTES) -------- */

export function getDoc(id: string) {
  return loadDocs().find((d) => d.id === id) ?? null;
}

export function setStatus(id: string, status: DocRecord["status"]) {
  const doc = getDoc(id);
  if (!doc) return loadDocs();
  return upsertDoc({ ...doc, status });
}

export function duplicateDoc(id: string) {
  const doc = getDoc(id);
  if (!doc) return null;

  const cloned: DocRecord = {
    ...doc,
    id: uid("doc"),
    number: generateNumber(doc.kind === "devis" ? "DEV" : "FAC"),
    createdAtISO: new Date().toISOString(),
    dueAtISO:
      doc.kind === "facture"
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() + 30);
            return d.toISOString();
          })()
        : null,
    status: "brouillon",
    lines: doc.lines.map((l) => ({ ...l, id: uid("l") })),
  };

  upsertDoc(cloned);
  return cloned;
}

export function transformDevisToFacture(id: string) {
  const doc = getDoc(id);
  if (!doc || doc.kind !== "devis") return null;

  const due = new Date();
  due.setDate(due.getDate() + 30);

  const facture: DocRecord = {
    id: uid("doc"),
    kind: "facture",
    number: generateNumber("FAC"),
    createdAtISO: new Date().toISOString(),
    dueAtISO: due.toISOString(),
    clientName: doc.clientName,
    clientAddress: doc.clientAddress,
    clientEmail: doc.clientEmail,
    status: "brouillon",
    lines: doc.lines.map((l) => ({ ...l, id: uid("l") })),
    vatDispense: !!doc.vatDispense,
  };

  upsertDoc(facture);
  return facture;
}
