import type { LineItem } from "@/app/dashboard/_documents/docUtils";

export const INRDOCUMENTS_SETTINGS_UPDATED_EVENT = "inrdocuments:settings-updated";

export const DOCUMENT_OPERATION_CATEGORIES = ["", "vente", "prestation", "mixte"] as const;
export const DOCUMENT_DEPOSIT_KINDS = ["", "percent", "amount"] as const;
export const DOCUMENT_PAYMENT_METHODS = ["", "virement", "cb", "cheque", "especes", "abonnement"] as const;
export const DOCUMENT_KINDS = ["invoice", "deposit", "credit_note"] as const;
export const DOCUMENT_STATUSES = ["", "brouillon", "en_attente_paiement", "envoye", "paye"] as const;
export const DOCUMENT_VAT_RATES = [0, 5.5, 10, 20] as const;
export const DOCUMENT_DESIGN_PRESETS = ["standard", "business", "encadre", "signature"] as const;
export const DOCUMENT_ACCENT_COLORS = ["blue", "violet", "orange", "green", "gray", "rose", "teal", "gold"] as const;

export type DocumentOperationCategory = (typeof DOCUMENT_OPERATION_CATEGORIES)[number];
export type DocumentDepositKind = (typeof DOCUMENT_DEPOSIT_KINDS)[number];
export type DocumentPaymentMethod = (typeof DOCUMENT_PAYMENT_METHODS)[number];
export type DocumentKindSetting = (typeof DOCUMENT_KINDS)[number];
export type DocumentStatusSetting = (typeof DOCUMENT_STATUSES)[number];
export type DocumentDesignPreset = (typeof DOCUMENT_DESIGN_PRESETS)[number];
export type DocumentAccentColor = (typeof DOCUMENT_ACCENT_COLORS)[number];

export type InrDocumentsSettings = {
  common: {
    operationCategory: DocumentOperationCategory;
    depositKind: DocumentDepositKind;
    depositValue: string;
    paymentMethod: DocumentPaymentMethod;
    paymentDetails: string;
    notes: string;
    defaultLine: LineItem;
    design: {
      preset: DocumentDesignPreset;
      accentColor: DocumentAccentColor;
      frame: boolean;
      coloredTotals: boolean;
      coloredParties: boolean;
    };
  };
  quote: {
    validityDays: number;
    mention: string;
  };
  invoice: {
    dueDays: number;
    lateFeeRate: string;
    fixedRecoveryFee40: boolean;
    vatOnDebits: boolean;
    documentKind: DocumentKindSetting;
    status: DocumentStatusSetting;
    mention: string;
  };
};

export const DEFAULT_INRDOCUMENTS_SETTINGS: InrDocumentsSettings = {
  common: {
    operationCategory: "",
    depositKind: "",
    depositValue: "",
    paymentMethod: "",
    paymentDetails: "",
    notes: "",
    defaultLine: { id: "l_1", label: "Prestation", qty: 1, unitPrice: 100, vatRate: 20 },
    design: {
      preset: "standard",
      accentColor: "blue",
      frame: false,
      coloredTotals: false,
      coloredParties: false,
    },
  },
  quote: {
    validityDays: 30,
    mention: "",
  },
  invoice: {
    dueDays: 30,
    lateFeeRate: "",
    fixedRecoveryFee40: true,
    vatOnDebits: false,
    documentKind: "invoice",
    status: "",
    mention: "",
  },
};

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeAllowed<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function normalizePositiveInt(value: unknown, fallback: number, max = 3650) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.round(parsed)));
}

function normalizeAmountString(value: unknown) {
  const raw = normalizeString(value).trim().replace(",", ".");
  if (!raw) return "";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  return raw;
}

function normalizeDocumentDesign(value: unknown): InrDocumentsSettings["common"]["design"] {
  const obj = safeObj(value);
  const fallback = DEFAULT_INRDOCUMENTS_SETTINGS.common.design;
  return {
    preset: normalizeAllowed(obj.preset, DOCUMENT_DESIGN_PRESETS, fallback.preset),
    accentColor: normalizeAllowed(obj.accentColor, DOCUMENT_ACCENT_COLORS, fallback.accentColor),
    frame: typeof obj.frame === "boolean" ? obj.frame : fallback.frame,
    coloredTotals: typeof obj.coloredTotals === "boolean" ? obj.coloredTotals : fallback.coloredTotals,
    coloredParties: typeof obj.coloredParties === "boolean" ? obj.coloredParties : fallback.coloredParties,
  };
}

function normalizeDefaultLine(value: unknown, fallback: LineItem): LineItem {
  const obj = safeObj(value);
  const qty = Number(obj.qty);
  const unitPrice = Number(obj.unitPrice);
  const vatRate = Number(obj.vatRate);
  const allowedVat = DOCUMENT_VAT_RATES.includes(vatRate as any) ? vatRate : fallback.vatRate;

  return {
    id: "l_1",
    label: normalizeString(obj.label) === "" ? fallback.label : normalizeString(obj.label),
    qty: Number.isFinite(qty) && qty > 0 ? qty : fallback.qty,
    unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : fallback.unitPrice,
    vatRate: allowedVat,
  };
}

export function normalizeInrDocumentsSettings(value: unknown): InrDocumentsSettings {
  const root = safeObj(value);
  const common = safeObj(root.common);
  const quote = safeObj(root.quote);
  const invoice = safeObj(root.invoice);

  const depositKind = normalizeAllowed(common.depositKind, DOCUMENT_DEPOSIT_KINDS, DEFAULT_INRDOCUMENTS_SETTINGS.common.depositKind);

  return {
    common: {
      operationCategory: normalizeAllowed(common.operationCategory, DOCUMENT_OPERATION_CATEGORIES, DEFAULT_INRDOCUMENTS_SETTINGS.common.operationCategory),
      depositKind,
      depositValue: depositKind ? normalizeAmountString(common.depositValue) : "",
      paymentMethod: normalizeAllowed(common.paymentMethod, DOCUMENT_PAYMENT_METHODS, DEFAULT_INRDOCUMENTS_SETTINGS.common.paymentMethod),
      paymentDetails: normalizeString(common.paymentDetails),
      notes: normalizeString(common.notes),
      defaultLine: normalizeDefaultLine(common.defaultLine, DEFAULT_INRDOCUMENTS_SETTINGS.common.defaultLine),
      design: normalizeDocumentDesign(common.design),
    },
    quote: {
      validityDays: normalizePositiveInt(quote.validityDays, DEFAULT_INRDOCUMENTS_SETTINGS.quote.validityDays),
      mention: normalizeString(quote.mention),
    },
    invoice: {
      dueDays: normalizePositiveInt(invoice.dueDays, DEFAULT_INRDOCUMENTS_SETTINGS.invoice.dueDays),
      lateFeeRate: normalizeAmountString(invoice.lateFeeRate),
      fixedRecoveryFee40: typeof invoice.fixedRecoveryFee40 === "boolean" ? invoice.fixedRecoveryFee40 : DEFAULT_INRDOCUMENTS_SETTINGS.invoice.fixedRecoveryFee40,
      vatOnDebits: typeof invoice.vatOnDebits === "boolean" ? invoice.vatOnDebits : DEFAULT_INRDOCUMENTS_SETTINGS.invoice.vatOnDebits,
      documentKind: normalizeAllowed(invoice.documentKind, DOCUMENT_KINDS, DEFAULT_INRDOCUMENTS_SETTINGS.invoice.documentKind),
      status: normalizeAllowed(invoice.status, DOCUMENT_STATUSES, DEFAULT_INRDOCUMENTS_SETTINGS.invoice.status),
      mention: normalizeString(invoice.mention),
    },
  };
}

export function mergeInrDocumentsSettings(current: unknown, patch: unknown): InrDocumentsSettings {
  const currentNormalized = normalizeInrDocumentsSettings(current);
  const patchRoot = safeObj(patch);
  const patchCommon = safeObj(patchRoot.common);
  const patchQuote = safeObj(patchRoot.quote);
  const patchInvoice = safeObj(patchRoot.invoice);

  return normalizeInrDocumentsSettings({
    common: { ...currentNormalized.common, ...patchCommon },
    quote: { ...currentNormalized.quote, ...patchQuote },
    invoice: { ...currentNormalized.invoice, ...patchInvoice },
  });
}

export function dateWithAddedDays(baseISO: string | undefined | null, days: number) {
  const base = baseISO ? new Date(`${baseISO}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Math.max(1, Math.round(days || 1)));
  return base.toISOString().slice(0, 10);
}

export function makeDefaultLine(settings: InrDocumentsSettings, vatDispense = false, _invoiceFallbackPrice?: number): LineItem {
  const base = settings.common.defaultLine;
  return {
    id: "l_1",
    label: base.label || "Prestation",
    qty: Number(base.qty) || 1,
    unitPrice: Number(base.unitPrice) || 0,
    vatRate: vatDispense ? 0 : Number(base.vatRate) || 20,
  };
}
