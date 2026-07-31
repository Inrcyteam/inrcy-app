import type { LineItem } from "./docUtils";
import type { CrmContact } from "./documentEditorShared";

export function getQuotePrintFooterSpacerMm(lineCount: number): number {
  const count = Math.max(1, Number(lineCount) || 1);

  // Le devis a un footer plus haut que la facture grâce à la signature.
  // La logique garde le footer en bas de la dernière page utilisée,
  // sans le répéter sur toutes les pages.
  if (count <= 24) {
    return Math.max(0, 90 - (count - 1) * 12);
  }

  const firstPageRows = 24;
  const rowsPerNextPage = 39;
  const rowsAfterFirstPage = count - firstPageRows;
  const rowsOnLastPage = ((rowsAfterFirstPage - 1) % rowsPerNextPage) + 1;

  return Math.max(0, 150 - (rowsOnLastPage - 1) * 4.2);
}

export type QuotePrintPage = {
  includeHeader: boolean;
  includeFooter: boolean;
  lines: LineItem[];
};

export function buildQuotePrintPages(lines: LineItem[]): QuotePrintPage[] {
  const safeLines = lines.length ? lines : [];

  /*
   * Pagination print maîtrisée V112.
   * Le devis a un footer plus haut (signature), donc les seuils sont plus
   * prudents. On réserve toujours quelques lignes pour la dernière page afin
   * que le footer ne parte pas seul si des prestations peuvent l'accompagner.
   */
  const firstPageWithFooterRows = 13;
  const firstPageRowsWithoutFooter = 32;
  const middlePageRows = 32;
  const lastPageRowsWithFooter = 12;

  if (safeLines.length <= firstPageWithFooterRows) {
    return [{ includeHeader: true, includeFooter: true, lines: safeLines }];
  }

  const pages: QuotePrintPage[] = [];
  let cursor = 0;

  const firstPageLines = safeLines.slice(cursor, cursor + firstPageRowsWithoutFooter);
  pages.push({
    includeHeader: true,
    includeFooter: false,
    lines: firstPageLines,
  });
  cursor += firstPageLines.length;

  let remaining = safeLines.length - cursor;

  while (remaining > middlePageRows + lastPageRowsWithFooter) {
    const pageLines = safeLines.slice(cursor, cursor + middlePageRows);
    pages.push({
      includeHeader: false,
      includeFooter: false,
      lines: pageLines,
    });
    cursor += pageLines.length;
    remaining = safeLines.length - cursor;
  }

  if (remaining > lastPageRowsWithFooter) {
    const linesBeforeFooter = remaining - lastPageRowsWithFooter;
    const pageLines = safeLines.slice(cursor, cursor + linesBeforeFooter);
    pages.push({
      includeHeader: false,
      includeFooter: false,
      lines: pageLines,
    });
    cursor += pageLines.length;
  }

  pages.push({
    includeHeader: false,
    includeFooter: true,
    lines: safeLines.slice(cursor),
  });

  return pages;
}

export type QuoteFieldErrors = {
  clientType?: string;
  clientName?: string;
  billingAddress?: string;
  billingPostalCode?: string;
  billingCity?: string;
  clientEmail?: string;
  clientSiren?: string;
  number?: string;
  docDateISO?: string;
  validityDays?: string;
  lines?: string;
};

export const VAT_OPTIONS = [0, 5.5, 10, 20];

export function normalizeLabel(s: string) {
  // tri FR, sans casse/accents (stable)
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function contactDisplayName(c: CrmContact) {
  const label =
    (c.company_name && c.company_name.trim()) ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    (c.last_name || "").trim() ||
    "(Sans nom)";
  return label;
}

export function contactSearchText(c: CrmContact) {
  return [
    contactDisplayName(c),
    c.email,
    c.phone,
    c.address,
    c.billing_address,
    c.delivery_address,
    c.city,
    c.postal_code,
    c.siret,
    c.vat_number,
  ]
    .filter(Boolean)
    .join(" ");
}
