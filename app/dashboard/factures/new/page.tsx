"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { confirmInrcy, promptInrcy } from "@/lib/inrcyDialog";
import styles from "../../_documents/documents.module.css";
import dash from "../../dashboard.module.css";
import SettingsDrawer from "../../SettingsDrawer";
import DocumentsSettingsContent from "../../settings/_components/DocumentsSettingsContent";
import {
  DEFAULT_INRDOCUMENTS_SETTINGS,
  INRDOCUMENTS_SETTINGS_UPDATED_EVENT,
  InrDocumentsSettings,
  dateWithAddedDays,
  makeDefaultLine,
  normalizeInrDocumentsSettings,
} from "@/lib/inrdocumentsSettings";
import {
  DocRecord,
  LineItem,
  calcLineHT,
  calcTotalsWithDiscount,
  DiscountKind,
  formatEuro,
  generateNumber,
  uid,
} from "../../_documents/docUtils";
import {
  cloneDocumentLines,
  hasReusableDocumentLine,
  prepareTemplateSnapshot,
} from "../../_documents/documentTemplateUtils";

type Profile = {
  user_id: string;
  company_legal_name?: string | null;
  hq_address?: string | null;
  hq_zip?: string | null;
  hq_city?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  siren?: string | null;
  rcs_city?: string | null;
  vat_number?: string | null;
  vat_dispense?: boolean | null;
  logo_url?: string | null;
  logo_path?: string | null;
};

type CrmContact = {
  id: string;
  last_name?: string | null;
  first_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  billing_address?: string | null;
  delivery_address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  category?: string | null;
  contact_type?: string | null;
};

type ClientType = "" | "particulier" | "professionnel" | "institution";

type ServiceDateMode = "single" | "period";

function getInvoicePrintFooterSpacerMm(lineCount: number): number {
  const count = Math.max(1, Number(lineCount) || 1);

  // Page 1 contient le header + les blocs prestataire/client.
  // Au-delà, le tableau continue seul : on recalcule donc l’espace
  // à remplir sur la dernière page pour garder le bloc final en footer.
  if (count <= 28) {
    return Math.max(0, 112 - (count - 1) * 14);
  }

  const firstPageRows = 28;
  const rowsPerNextPage = 42;
  const rowsAfterFirstPage = count - firstPageRows;
  const rowsOnLastPage = ((rowsAfterFirstPage - 1) % rowsPerNextPage) + 1;

  return Math.max(0, 168 - (rowsOnLastPage - 1) * 4.1);
}

type InvoicePrintPage = {
  includeHeader: boolean;
  includeFooter: boolean;
  lines: LineItem[];
};

function buildInvoicePrintPages(lines: LineItem[]): InvoicePrintPage[] {
  const safeLines = lines.length ? lines : [];

  /*
   * Pagination print maîtrisée V112.
   * On réserve toujours quelques prestations pour la dernière page avec footer.
   * Objectif : éviter une page "footer seul" quand on peut encore afficher
   * des lignes au-dessus, et éviter que Chrome coupe/duplique une page vide.
   */
  const firstPageWithFooterRows = 16;
  const firstPageRowsWithoutFooter = 34;
  const middlePageRows = 34;
  const lastPageRowsWithFooter = 14;

  if (safeLines.length <= firstPageWithFooterRows) {
    return [{ includeHeader: true, includeFooter: true, lines: safeLines }];
  }

  const pages: InvoicePrintPage[] = [];
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

function normalizeClientType(value: unknown): ClientType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "particulier" ||
    normalized === "professionnel" ||
    normalized === "institution"
  )
    return normalized;
  return "";
}

function inferServiceDateMode(value: {
  serviceDateMode?: unknown;
  serviceDate?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
}): ServiceDateMode {
  if (
    value.serviceDateMode === "period" ||
    value.serviceDateMode === "single"
  ) {
    return value.serviceDateMode;
  }
  if (value.servicePeriodStart || value.servicePeriodEnd) return "period";
  return "single";
}

type InvoiceFieldErrors = {
  clientType?: string;
  clientName?: string;
  billingAddress?: string;
  billingPostalCode?: string;
  billingCity?: string;
  clientEmail?: string;
  clientSiren?: string;
  number?: string;
  invoiceDate?: string;
  dueDate?: string;
  operationCategory?: string;
  lines?: string;
};

function DocumentDateInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.dateInputWrap}>
      <input
        className={styles.dateInput}
        type="date"
        lang="fr-FR"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      <span className={styles.dateInputIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M7 3v3M17 3v3M4.5 9h15M6.5 5.5h13v15h-15v-15h2Z" />
        </svg>
      </span>
    </div>
  );
}

function normalizeAddressPart(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function addressContainsPart(address: string, part: string) {
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildFullCrmAddress(
  address?: string | null,
  postalCode?: string | null,
  city?: string | null,
) {
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

function splitFrenchAddress(value?: string | null) {
  const clean = normalizeAddressPart(value);
  const match = clean.match(/^(.*?)\s+(\d{5})\s+(.+)$/);
  if (!match) return { address: clean, postal_code: "", city: "" };
  return {
    address: normalizeAddressPart(match[1]),
    postal_code: normalizeAddressPart(match[2]),
    city: normalizeAddressPart(match[3]),
  };
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const VAT_OPTIONS = [0, 5.5, 10, 20] as const;

const PAYMENT_METHODS = [
  { key: "", label: "—" },
  { key: "virement", label: "Virement bancaire" },
  { key: "cb", label: "Carte bancaire" },
  { key: "cheque", label: "Chèque" },
  { key: "especes", label: "Espèces" },
  { key: "abonnement", label: "Abonnement" },
] as const;

const DOCUMENT_KIND_OPTIONS = [
  { key: "invoice", label: "Facture" },
  { key: "deposit", label: "Facture d’acompte" },
  { key: "credit_note", label: "Avoir" },
] as const;

const OPERATION_CATEGORY_OPTIONS = [
  { key: "", label: "—" },
  { key: "vente", label: "Vente" },
  { key: "prestation", label: "Prestation de services" },
  { key: "mixte", label: "Vente + prestation" },
] as const;

export default function NewFacturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [documentsSettings, setDocumentsSettings] =
    useState<InrDocumentsSettings>(DEFAULT_INRDOCUMENTS_SETTINGS);

  // Toujours arriver en haut du module (évite de récupérer le scroll du dashboard)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  }, []);

  // PDF → Supabase Storage (PJ iNrbox)
  const ATTACH_BUCKET = "inrbox_attachments";
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isEditingProvider, setIsEditingProvider] = useState(false);
  const [providerOverride, setProviderOverride] = useState<Partial<Profile>>({});
  const vatDispense = !!profile?.vat_dispense;
  const providerData = { ...(profile || {}), ...(providerOverride || {}) } as Profile;

  // Orientation: gérée globalement via <OrientationGuard />

  // IMPORTANT: valeur stable SSR/CSR -> on initialise à vide, puis on remplit après mount
  const [number, setNumber] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientSiren, setClientSiren] = useState("");
  const [clientVatNumber, setClientVatNumber] = useState("");
  const [clientType, setClientType] = useState<ClientType>("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPostalCode, setDeliveryPostalCode] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [sameAddresses, setSameAddresses] = useState(true);
  const [operationCategory, setOperationCategory] =
    useState<(typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]>("");
  const [serviceDateMode, setServiceDateMode] =
    useState<ServiceDateMode>("single");
  const [serviceDate, setServiceDate] = useState("");
  const [servicePeriodStart, setServicePeriodStart] = useState("");
  const [servicePeriodEnd, setServicePeriodEnd] = useState("");

  const updateServiceDateMode = (mode: ServiceDateMode) => {
    setServiceDateMode(mode);
    if (mode === "single") {
      setServicePeriodStart("");
      setServicePeriodEnd("");
    } else {
      setServiceDate("");
    }
  };
  const [purchaseOrderReference, setPurchaseOrderReference] = useState("");
  const [depositKind, setDepositKind] = useState<"" | "percent" | "amount">("");
  const [depositValue, setDepositValue] = useState("");
  const [vatOnDebits, setVatOnDebits] = useState(false);
  const [lateFeeRate, setLateFeeRate] = useState("");
  const [fixedRecoveryFee40, setFixedRecoveryFee40] = useState(true);
  const [documentKind, setDocumentKind] =
    useState<(typeof DOCUMENT_KIND_OPTIONS)[number]["key"]>("invoice");

  const billingFullAddress = buildFullCrmAddress(
    billingAddress,
    billingPostalCode,
    billingCity,
  );
  const deliveryFullAddress = buildFullCrmAddress(
    deliveryAddress,
    deliveryPostalCode,
    deliveryCity,
  );

  const setPrimaryClientAddress = (value: string) => {
    const parsed = splitFrenchAddress(value);
    setBillingAddress(parsed.address);
    setBillingPostalCode(parsed.postal_code);
    setBillingCity(parsed.city);
    setClientAddress(
      buildFullCrmAddress(parsed.address, parsed.postal_code, parsed.city),
    );
    if (sameAddresses) {
      setDeliveryAddress(parsed.address);
      setDeliveryPostalCode(parsed.postal_code);
      setDeliveryCity(parsed.city);
    }
  };

  useEffect(() => {
    const full = buildFullCrmAddress(
      billingAddress,
      billingPostalCode,
      billingCity,
    );
    setClientAddress(full);
    if (!sameAddresses) return;
    setDeliveryAddress(billingAddress);
    setDeliveryPostalCode(billingPostalCode);
    setDeliveryCity(billingCity);
  }, [sameAddresses, billingAddress, billingPostalCode, billingCity]);

  // --- Remise commerciale (appliquée sur le total TTC)
  const [discountKind, setDiscountKind] = useState<DiscountKind | "">("");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountDetails, setDiscountDetails] = useState<string>("");

  // --- CRM: import d'un contact pour pré-remplir automatiquement
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [selectedCrmContactId, setSelectedCrmContactId] = useState<string>("");
  const [formMessage, setFormMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [crmActionMessage, setCrmActionMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<InvoiceFieldErrors>({});
  const [addingToCrm, setAddingToCrm] = useState(false);
  const [currentSaveId, setCurrentSaveId] = useState<string>("");

  const [crmOpen, setCrmOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [crmQuery, setCrmQuery] = useState("");
  const crmSelectRef = useRef<HTMLDivElement | null>(null);

  const crmLabel = (c: CrmContact) => {
    const name =
      (c.company_name && c.company_name.trim()) ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      (c.last_name || "").trim() ||
      "(Sans nom)";
    return name;
  };

  const crmSearchText = (c: CrmContact) =>
    [
      crmLabel(c),
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

  const sortedCrmContacts = useMemo(() => {
    const copy = [...crmContacts];
    copy.sort((a, b) =>
      crmLabel(a).localeCompare(crmLabel(b), "fr", { sensitivity: "base" }),
    );
    return copy;
  }, [crmContacts]);

  const filteredCrmContacts = useMemo(() => {
    const query = normalizeLabel(crmQuery);
    if (!query) return sortedCrmContacts;
    return sortedCrmContacts.filter((contact) =>
      normalizeLabel(crmSearchText(contact)).includes(query),
    );
  }, [crmQuery, sortedCrmContacts]);

  const selectedCrmLabel = useMemo(() => {
    if (!selectedCrmContactId) return "";
    const c = crmContacts.find(
      (x) => String(x.id) === String(selectedCrmContactId),
    );
    if (!c) return "";
    return crmLabel(c) + (c.email ? ` — ${c.email}` : "");
  }, [crmContacts, selectedCrmContactId]);

  // ✅ Pré-remplissage depuis CRM / iNrBox
  useEffect(() => {
    const name =
      searchParams.get("clientName") || searchParams.get("name") || "";
    const email =
      searchParams.get("clientEmail") || searchParams.get("email") || "";
    const address =
      searchParams.get("clientAddress") || searchParams.get("address") || "";
    const siren = searchParams.get("clientSiren") || "";
    const vatNumber = searchParams.get("clientVatNumber") || "";
    const billing = searchParams.get("billingAddress") || "";
    const billingPostal =
      searchParams.get("billingPostalCode") ||
      searchParams.get("postal_code") ||
      "";
    const billingCityParam =
      searchParams.get("billingCity") || searchParams.get("city") || "";
    const delivery = searchParams.get("deliveryAddress") || "";
    if (name) setClientName((prev) => prev || name);
    if (email) setClientEmail((prev) => prev || email);
    if (siren) setClientSiren((prev) => prev || siren);
    if (vatNumber) setClientVatNumber((prev) => prev || vatNumber);
    if (address) {
      setClientAddress((prev) => prev || address);
      const parsed = splitFrenchAddress(billing || address);
      setBillingAddress((prev) => prev || parsed.address);
      setBillingPostalCode(
        (prev) => prev || billingPostal || parsed.postal_code,
      );
      setBillingCity((prev) => prev || billingCityParam || parsed.city);
      const parsedDelivery = splitFrenchAddress(delivery || billing || address);
      setDeliveryAddress((prev) => prev || parsedDelivery.address);
      setDeliveryPostalCode(
        (prev) => prev || billingPostal || parsedDelivery.postal_code,
      );
      setDeliveryCity(
        (prev) => prev || billingCityParam || parsedDelivery.city,
      );
    } else {
      if (billing) {
        const parsed = splitFrenchAddress(billing);
        setBillingAddress((prev) => prev || parsed.address);
        setBillingPostalCode(
          (prev) => prev || billingPostal || parsed.postal_code,
        );
        setBillingCity((prev) => prev || billingCityParam || parsed.city);
      }
      if (delivery) {
        const parsedDelivery = splitFrenchAddress(delivery);
        setDeliveryAddress((prev) => prev || parsedDelivery.address);
        setDeliveryPostalCode(
          (prev) => prev || billingPostal || parsedDelivery.postal_code,
        );
        setDeliveryCity(
          (prev) => prev || billingCityParam || parsedDelivery.city,
        );
      }
    }
  }, []);

  // ✅ Liste des contacts CRM pour import dans ce formulaire
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setCrmLoading(true);
      setCrmError(null);

      try {
        const res = await fetch("/api/crm/contacts?all=1", { method: "GET" });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            getSimpleFrenchErrorMessage(
              json?.error,
              "Impossible de charger les contacts CRM.",
            ),
          );
        }

        const contacts: CrmContact[] = Array.isArray(json?.contacts)
          ? json.contacts
          : [];
        if (!cancelled) setCrmContacts(contacts);
      } catch (e: any) {
        if (!cancelled)
          setCrmError(
            getSimpleFrenchErrorMessage(
              e,
              "Impossible de charger les contacts CRM.",
            ),
          );
      } finally {
        if (!cancelled) setCrmLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCrmContact = (c: CrmContact) => {
    const displayName =
      (c.company_name && c.company_name.trim()) ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      (c.last_name || "").trim();

    const billingParsed = splitFrenchAddress(
      c.billing_address || c.address || "",
    );
    const deliveryParsed = splitFrenchAddress(
      c.delivery_address || c.address || "",
    );
    const nextBillingPostal =
      normalizeAddressPart(c.postal_code) || billingParsed.postal_code;
    const nextBillingCity = normalizeAddressPart(c.city) || billingParsed.city;
    const fullAddress = buildFullCrmAddress(
      billingParsed.address,
      nextBillingPostal,
      nextBillingCity,
    );
    const fullDeliveryAddress = buildFullCrmAddress(
      deliveryParsed.address,
      nextBillingPostal,
      nextBillingCity,
    );

    setClientName(displayName);
    setClientEmail((c.email || "").trim());
    setClientSiren((c.siret || "").trim());
    setClientVatNumber((c.vat_number || "").trim());
    setClientType(
      normalizeClientType(c.category) ||
        (c.siret || c.company_name ? "professionnel" : "particulier"),
    );
    setBillingAddress(billingParsed.address);
    setBillingPostalCode(nextBillingPostal);
    setBillingCity(nextBillingCity);
    setClientAddress(fullAddress);
    if (fullDeliveryAddress && fullDeliveryAddress !== fullAddress) {
      setSameAddresses(false);
      setDeliveryAddress(deliveryParsed.address);
      setDeliveryPostalCode(nextBillingPostal);
      setDeliveryCity(nextBillingCity);
    } else {
      setSameAddresses(true);
      setDeliveryAddress(billingParsed.address);
      setDeliveryPostalCode(nextBillingPostal);
      setDeliveryCity(nextBillingCity);
    }
  };

  // Ferme le menu quand on clique en dehors
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!crmOpen) return;
      const el = crmSelectRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setCrmOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [crmOpen]);

  const selectCrmContact = (c: CrmContact) => {
    setSelectedCrmContactId(String(c.id));
    applyCrmContact(c);
    setFieldErrors((prev) => ({
      ...prev,
      clientType: undefined,
      clientName: undefined,
      billingAddress: undefined,
      billingPostalCode: undefined,
      billingCity: undefined,
      clientEmail: undefined,
      clientSiren: undefined,
    }));
    setCrmQuery("");
    setCrmOpen(false);
  };

  const [status, setStatus] = useState<
    DocRecord["status"] | "en_attente_paiement" | ""
  >("");

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["key"]>("");

  const [paymentDetails, setPaymentDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceMention, setInvoiceMention] = useState("");

  // IMPORTANT: id stable au 1er render (pas de uid() ici)
  const [lines, setLines] = useState<LineItem[]>([
    { id: "l_1", label: "Prestation", qty: 1, unitPrice: 120, vatRate: 20 },
  ]);

  const applyDocumentDefaults = (settings: InrDocumentsSettings) => {
    setOperationCategory(
      settings.common
        .operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"],
    );
    setDepositKind(settings.common.depositKind);
    setDepositValue(
      settings.common.depositKind ? settings.common.depositValue : "",
    );
    setVatOnDebits(settings.invoice.vatOnDebits);
    setLateFeeRate(settings.invoice.lateFeeRate);
    setFixedRecoveryFee40(settings.invoice.fixedRecoveryFee40);
    setDocumentKind(
      settings.invoice
        .documentKind as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"],
    );
    setStatus(
      settings.invoice.status as
        | DocRecord["status"]
        | "en_attente_paiement"
        | "",
    );
    setPaymentMethod(
      settings.common.paymentMethod as (typeof PAYMENT_METHODS)[number]["key"],
    );
    setPaymentDetails(settings.common.paymentDetails);
    setNotes(settings.common.notes);
    setInvoiceMention(settings.invoice.mention);
    setDueDate(
      dateWithAddedDays(
        invoiceDate || new Date().toISOString().slice(0, 10),
        settings.invoice.dueDays,
      ),
    );
    setLines([makeDefaultLine(settings, vatDispense, 120)]);
  };

  useEffect(() => {
    let cancelled = false;
    const shouldApplyDefaults = !(
      searchParams.get("saveId") ||
      searchParams.get("docSaveId") ||
      searchParams.get("fromDevisSaveId") ||
      searchParams.get("devisSaveId")
    );

    const loadSettings = async (applyDefaults: boolean) => {
      const response = await fetch("/api/documents/settings", {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const nextSettings = normalizeInrDocumentsSettings(json?.settings);
      if (cancelled) return;
      setDocumentsSettings(nextSettings);
      if (applyDefaults) applyDocumentDefaults(nextSettings);
    };

    void loadSettings(shouldApplyDefaults);

    const onUpdated = () => {
      void loadSettings(true);
    };

    window.addEventListener(INRDOCUMENTS_SETTINGS_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(
        INRDOCUMENTS_SETTINGS_UPDATED_EVENT,
        onUpdated,
      );
    };
  }, [searchParams]);

  // Init client-only (évite mismatch SSR/CSR)
  useEffect(() => {
    // Numéro + dates
    setNumber(generateNumber("FAC"));

    const d = new Date();
    setInvoiceDate(d.toISOString().slice(0, 10));

    const dd = new Date();
    dd.setDate(dd.getDate() + 30);
    setDueDate(dd.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) return;

      const { data } = await supabase
        .from("profiles")
        .select(
          "user_id,company_legal_name,hq_address,hq_zip,hq_city,contact_email,phone,siren,rcs_city,vat_number,vat_dispense,logo_url,logo_path",
        )
        .eq("user_id", user.id)
        .single();

      const resolvedLogo = await resolveProfileLogoUrl(supabase, {
        logo_path: data?.logo_path ?? null,
        logo_url: data?.logo_url ?? null,
      });

      setProfile(
        data
          ? ({
              ...(data as Profile),
              logo_url: resolvedLogo.logoUrl,
              logo_path: resolvedLogo.logoPath,
            } as Profile)
          : null,
      );
    };
    load();
  }, [supabase]);

  const totals = useMemo(
    () =>
      calcTotalsWithDiscount(
        lines,
        vatDispense,
        discountKind ? (discountKind as DiscountKind) : null,
        discountValue,
      ),
    [lines, vatDispense, discountKind, discountValue],
  );

  // --- Sauvegardes (brouillons locaux)
  type FactureDraft = {
    id: string;
    updatedAtISO: string;
    name?: string | null;
    snapshot: {
      number: string;
      invoiceDate: string;
      dueDate: string;
      clientName: string;
      clientAddress: string;
      billingAddress?: string;
      billingPostalCode?: string;
      billingCity?: string;
      deliveryAddress?: string;
      deliveryPostalCode?: string;
      deliveryCity?: string;
      sameAddresses?: boolean;
      providerOverride?: Partial<Profile>;
      clientEmail: string;
      clientSiren?: string;
      clientVatNumber?: string;
      clientType?: ClientType;
      vatDispense?: boolean;
      operationCategory?: (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"];
      serviceDateMode?: ServiceDateMode;
      serviceDate?: string;
      servicePeriodStart?: string;
      servicePeriodEnd?: string;
      purchaseOrderReference?: string;
      depositKind?: "" | "percent" | "amount";
      depositValue?: string;
      vatOnDebits?: boolean;
      lateFeeRate?: string;
      fixedRecoveryFee40?: boolean;
      documentKind?: (typeof DOCUMENT_KIND_OPTIONS)[number]["key"];
      status: DocRecord["status"];
      paymentMethod: (typeof PAYMENT_METHODS)[number]["key"];
      paymentDetails: string;
      notes: string;
      invoiceMention?: string;
      lines: LineItem[];
      discountKind: DiscountKind | "";
      discountValue: number;
      discountDetails: string;
      isFinalized?: boolean;
      finalizedAt?: string | null;
      lockedAt?: string | null;
      officialNumberAssignedAt?: string | null;
      officialSequenceYear?: number | null;
      officialSequenceValue?: number | null;
      isTemplate?: boolean;
      templateName?: string | null;
    };
  };

  type DevisSnapshot = {
    number: string;
    docDateISO: string;
    clientName: string;
    clientAddress: string;
    billingAddress?: string;
    billingPostalCode?: string;
    billingCity?: string;
    deliveryAddress?: string;
    deliveryPostalCode?: string;
    deliveryCity?: string;
    sameAddresses?: boolean;
    clientEmail: string;
    clientSiren?: string;
    clientVatNumber?: string;
    vatDispense?: boolean;
    operationCategory?: (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"];
    serviceDateMode?: ServiceDateMode;
    serviceDate?: string;
    servicePeriodStart?: string;
    servicePeriodEnd?: string;
    purchaseOrderReference?: string;
    depositKind?: "" | "percent" | "amount";
    depositValue?: string;
    paymentMethod?: (typeof PAYMENT_METHODS)[number]["key"];
    paymentDetails?: string;
    notes?: string;
    quoteMention?: string;
    validityDays: number;
    lines: LineItem[];
    discountKind: DiscountKind | "";
    discountValue: number;
    discountDetails: string;
  };

  const SAVES_TYPE = "facture" as const;
  type DocumentsTab = "saves" | "templates";

  const [draftsOpen, setDraftsOpen] = useState(false);
  const [documentsTab, setDocumentsTab] = useState<DocumentsTab>("saves");
  const [drafts, setDrafts] = useState<FactureDraft[]>([]);
  const [templates, setTemplates] = useState<FactureDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState<string>("");
  const [finalizing, setFinalizing] = useState(false);
  const coreEditingLocked = isFinalized;

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!draftsOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [draftsOpen]);

  const refreshSaves = async () => {
    setDraftsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("doc_saves")
        .select("id,updated_at,name,payload")
        .eq("user_id", user.id)
        .eq("type", SAVES_TYPE)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const mapped: FactureDraft[] = (data ?? []).map((row: any) => ({
        id: row.id,
        updatedAtISO: row.updated_at,
        name: row.name,
        snapshot: row.payload ?? {},
      }));

      setDrafts(mapped.filter((item) => !item.snapshot?.isTemplate));
      setTemplates(mapped.filter((item) => !!item.snapshot?.isTemplate));
    } catch (e) {
      console.error(e);
    } finally {
      setDraftsLoading(false);
    }
  };

  useEffect(() => {
    void refreshSaves();
  }, []);

  const applyDraftSnapshot = (s: FactureDraft["snapshot"]) => {
    const legacyBilling = splitFrenchAddress(
      s.billingAddress || s.clientAddress || "",
    );
    const nextBillingAddress = legacyBilling.address;
    const nextBillingPostalCode =
      (s as any).billingPostalCode || legacyBilling.postal_code;
    const nextBillingCity = (s as any).billingCity || legacyBilling.city;
    const nextBillingFullAddress = buildFullCrmAddress(
      nextBillingAddress,
      nextBillingPostalCode,
      nextBillingCity,
    );
    const legacyDelivery = splitFrenchAddress(
      s.deliveryAddress || nextBillingFullAddress,
    );
    const nextSameAddresses =
      typeof s.sameAddresses === "boolean"
        ? s.sameAddresses
        : !s.deliveryAddress ||
          buildFullCrmAddress(
            legacyDelivery.address,
            (s as any).deliveryPostalCode || legacyDelivery.postal_code,
            (s as any).deliveryCity || legacyDelivery.city,
          ) === nextBillingFullAddress;
    const nextDeliveryAddress = nextSameAddresses
      ? nextBillingAddress
      : legacyDelivery.address;
    const nextDeliveryPostalCode = nextSameAddresses
      ? nextBillingPostalCode
      : (s as any).deliveryPostalCode || legacyDelivery.postal_code;
    const nextDeliveryCity = nextSameAddresses
      ? nextBillingCity
      : (s as any).deliveryCity || legacyDelivery.city;

    setNumber(s.number);
    setInvoiceDate(s.invoiceDate);
    setDueDate(s.dueDate);
    setClientName(s.clientName);
    setClientAddress(nextBillingFullAddress);
    setBillingAddress(nextBillingAddress);
    setBillingPostalCode(nextBillingPostalCode);
    setBillingCity(nextBillingCity);
    setDeliveryAddress(nextDeliveryAddress);
    setDeliveryPostalCode(nextDeliveryPostalCode);
    setDeliveryCity(nextDeliveryCity);
    setSameAddresses(nextSameAddresses);
    setProviderOverride((s.providerOverride || {}) as Partial<Profile>);
    setIsEditingProvider(false);
    setClientEmail(s.clientEmail);
    setClientSiren(s.clientSiren || "");
    setClientVatNumber(s.clientVatNumber || "");
    setClientType(normalizeClientType((s as any).clientType));
    setOperationCategory(
      (s.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]) ||
        "",
    );
    const nextServiceDateMode = inferServiceDateMode(s);
    setServiceDateMode(nextServiceDateMode);
    setServiceDate(nextServiceDateMode === "single" ? s.serviceDate || "" : "");
    setServicePeriodStart(
      nextServiceDateMode === "period" ? s.servicePeriodStart || "" : "",
    );
    setServicePeriodEnd(
      nextServiceDateMode === "period" ? s.servicePeriodEnd || "" : "",
    );
    setPurchaseOrderReference(s.purchaseOrderReference || "");
    setDepositKind((s.depositKind as "" | "percent" | "amount") || "");
    setDepositValue(s.depositValue || "");
    setVatOnDebits(!!s.vatOnDebits);
    setLateFeeRate(s.lateFeeRate || "");
    setFixedRecoveryFee40(
      typeof s.fixedRecoveryFee40 === "boolean" ? s.fixedRecoveryFee40 : true,
    );
    setDocumentKind(
      (s.documentKind as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"]) ||
        "invoice",
    );
    setStatus(s.status);
    setPaymentMethod(s.paymentMethod);
    setPaymentDetails(s.paymentDetails);
    setNotes(s.notes);
    setInvoiceMention(
      s.invoiceMention || documentsSettings.invoice.mention || "",
    );
    setLines(s.lines);
    setDiscountKind(s.discountKind);
    setDiscountValue(s.discountValue);
    setDiscountDetails(s.discountDetails || "");
    setIsFinalized(!!s.isFinalized);
    setFinalizedAt(typeof s.finalizedAt === "string" ? s.finalizedAt : "");
  };

  useEffect(() => {
    const saveId =
      searchParams.get("saveId") || searchParams.get("docSaveId") || "";
    if (!saveId) return;

    let cancelled = false;

    const loadRequestedSave = async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) return;

      const { data, error } = await supabase
        .from("doc_saves")
        .select("id,payload")
        .eq("id", saveId)
        .eq("user_id", user.id)
        .eq("type", SAVES_TYPE)
        .maybeSingle();

      if (error) {
        console.error(error);
        if (!cancelled)
          setFormMessage({
            type: "error",
            text: "Impossible de réouvrir cette facture.",
          });
        return;
      }

      if (!data?.payload) {
        if (!cancelled)
          setFormMessage({ type: "error", text: "Facture introuvable." });
        return;
      }

      if (!cancelled) {
        applyDraftSnapshot(data.payload as FactureDraft["snapshot"]);
        setCurrentSaveId(data.id);
        setFormMessage({
          type: "success",
          text: "Facture réouverte depuis iNrSend.",
        });
      }
    };

    void loadRequestedSave();

    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase]);

  useEffect(() => {
    const existingSaveId =
      searchParams.get("saveId") || searchParams.get("docSaveId") || "";
    if (existingSaveId) return;

    const devisSaveId =
      searchParams.get("fromDevisSaveId") ||
      searchParams.get("devisSaveId") ||
      "";
    if (!devisSaveId) return;

    let cancelled = false;

    const loadDevisForConversion = async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) return;

      const { data, error } = await supabase
        .from("doc_saves")
        .select("id,payload")
        .eq("id", devisSaveId)
        .eq("user_id", user.id)
        .eq("type", "devis")
        .maybeSingle();

      if (error) {
        console.error(error);
        if (!cancelled)
          setFormMessage({
            type: "error",
            text: "Impossible de charger ce devis pour la conversion.",
          });
        return;
      }

      const devis = data?.payload as DevisSnapshot | undefined;
      if (!devis) {
        if (!cancelled)
          setFormMessage({
            type: "error",
            text: "Devis introuvable pour la conversion.",
          });
        return;
      }

      const now = new Date();
      const invoiceDateISO = now.toISOString().slice(0, 10);
      const dueDateISO = dateWithAddedDays(
        invoiceDateISO,
        documentsSettings.invoice.dueDays,
      );

      if (!cancelled) {
        setCurrentSaveId("");
        setIsFinalized(false);
        setFinalizedAt("");
        setNumber(generateNumber("FAC"));
        setInvoiceDate(invoiceDateISO);
        setDueDate(dueDateISO);
        const legacyBilling = splitFrenchAddress(
          devis.billingAddress || devis.clientAddress || "",
        );
        const nextBillingAddress = legacyBilling.address;
        const nextBillingPostalCode =
          (devis as any).billingPostalCode || legacyBilling.postal_code;
        const nextBillingCity =
          (devis as any).billingCity || legacyBilling.city;
        const nextBillingFullAddress = buildFullCrmAddress(
          nextBillingAddress,
          nextBillingPostalCode,
          nextBillingCity,
        );
        const legacyDelivery = splitFrenchAddress(
          devis.deliveryAddress || nextBillingFullAddress,
        );
        const nextSameAddresses =
          typeof devis.sameAddresses === "boolean"
            ? devis.sameAddresses
            : !devis.deliveryAddress ||
              buildFullCrmAddress(
                legacyDelivery.address,
                (devis as any).deliveryPostalCode || legacyDelivery.postal_code,
                (devis as any).deliveryCity || legacyDelivery.city,
              ) === nextBillingFullAddress;
        const nextDeliveryAddress = nextSameAddresses
          ? nextBillingAddress
          : legacyDelivery.address;
        const nextDeliveryPostalCode = nextSameAddresses
          ? nextBillingPostalCode
          : (devis as any).deliveryPostalCode || legacyDelivery.postal_code;
        const nextDeliveryCity = nextSameAddresses
          ? nextBillingCity
          : (devis as any).deliveryCity || legacyDelivery.city;

        setClientName(devis.clientName || "");
        setClientAddress(nextBillingFullAddress);
        setBillingAddress(nextBillingAddress);
        setBillingPostalCode(nextBillingPostalCode);
        setBillingCity(nextBillingCity);
        setDeliveryAddress(nextDeliveryAddress);
        setDeliveryPostalCode(nextDeliveryPostalCode);
        setDeliveryCity(nextDeliveryCity);
        setSameAddresses(nextSameAddresses);
        setClientEmail(devis.clientEmail || "");
        setClientSiren(devis.clientSiren || "");
        setClientVatNumber(devis.clientVatNumber || "");
        setOperationCategory(
          (devis.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]) ||
            "",
        );
        const nextServiceDateMode = inferServiceDateMode(devis);
        setServiceDateMode(nextServiceDateMode);
        setServiceDate(
          nextServiceDateMode === "single" ? devis.serviceDate || "" : "",
        );
        setServicePeriodStart(
          nextServiceDateMode === "period"
            ? devis.servicePeriodStart || ""
            : "",
        );
        setServicePeriodEnd(
          nextServiceDateMode === "period" ? devis.servicePeriodEnd || "" : "",
        );
        setPurchaseOrderReference(devis.purchaseOrderReference || "");
        setDepositKind((devis.depositKind as "" | "percent" | "amount") || "");
        setDepositValue(devis.depositValue || "");
        setVatOnDebits(documentsSettings.invoice.vatOnDebits);
        setLateFeeRate(documentsSettings.invoice.lateFeeRate);
        setFixedRecoveryFee40(documentsSettings.invoice.fixedRecoveryFee40);
        setDocumentKind(
          documentsSettings.invoice
            .documentKind as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"],
        );
        setStatus(
          documentsSettings.invoice.status as
            | DocRecord["status"]
            | "en_attente_paiement"
            | "",
        );
        setPaymentMethod(
          ((devis.paymentMethod as (typeof PAYMENT_METHODS)[number]["key"]) ||
            documentsSettings.common
              .paymentMethod) as (typeof PAYMENT_METHODS)[number]["key"],
        );
        setPaymentDetails(
          devis.paymentDetails || documentsSettings.common.paymentDetails,
        );
        setNotes(
          devis.notes ||
            documentsSettings.common.notes ||
            `Facture créée depuis le devis ${devis.number || devisSaveId}.`,
        );
        setInvoiceMention(documentsSettings.invoice.mention);
        setLines(
          Array.isArray(devis.lines) && devis.lines.length
            ? devis.lines.map((line: LineItem, index: number) => ({
                ...line,
                id: line?.id || `l_${index + 1}`,
              }))
            : [
                {
                  id: "l_1",
                  label: "Prestation",
                  qty: 1,
                  unitPrice: 120,
                  vatRate: vatDispense ? 0 : 20,
                },
              ],
        );
        setDiscountKind(devis.discountKind || "");
        setDiscountValue(Number(devis.discountValue) || 0);
        setDiscountDetails(devis.discountDetails || "");
        setFormMessage({
          type: "success",
          text: `Facture préremplie depuis le devis ${devis.number || "sélectionné"}.`,
        });
      }
    };

    void loadDevisForConversion();

    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase, vatDispense, documentsSettings]);

  const addLine = () => {
    clearFieldError("lines");
    setLines((prev) => [
      ...prev,
      {
        id: uid("l"), // OK: appelé suite à action utilisateur (après hydration)
        label: "",
        qty: 1,
        unitPrice: 0,
        vatRate: vatDispense ? 0 : 20,
      },
    ]);
  };

  const removeLine = (id: string) => {
    clearFieldError("lines");
    setLines((prev) =>
      prev.length > 1 ? prev.filter((l) => l.id !== id) : prev,
    );
  };

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    clearFieldError("lines");
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const clearFieldError = (field: keyof InvoiceFieldErrors) => {
    setFieldErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  };

  const validateInvoiceAction = (options?: { requireEmail?: boolean }) => {
    const nextErrors: InvoiceFieldErrors = {};
    const requireEmail = !!options?.requireEmail;
    const normalizedBillingAddress = buildFullCrmAddress(
      billingAddress,
      billingPostalCode,
      billingCity,
    ).trim();
    const hasValidLine = lines.some(
      (line) =>
        (line.label || "").trim() &&
        Number(line.qty) > 0 &&
        Number(line.unitPrice) >= 0,
    );

    if (!clientType) nextErrors.clientType = "Type de client obligatoire.";
    if (!(clientName || "").trim())
      nextErrors.clientName = "Nom client obligatoire.";
    if (!billingAddress.trim())
      nextErrors.billingAddress = "Adresse obligatoire.";
    if (!billingPostalCode.trim())
      nextErrors.billingPostalCode = "Code postal obligatoire.";
    if (!billingCity.trim()) nextErrors.billingCity = "Ville obligatoire.";
    if (
      clientType &&
      clientType !== "particulier" &&
      !(clientSiren || "").trim()
    )
      nextErrors.clientSiren =
        "SIREN client obligatoire pour ce type de client.";
    if (!(number || "").trim())
      nextErrors.number = "Numéro de facture obligatoire.";
    if (!(invoiceDate || "").trim())
      nextErrors.invoiceDate = "Date de facture obligatoire.";
    if (!(dueDate || "").trim()) nextErrors.dueDate = "Échéance obligatoire.";
    if (clientType && clientType !== "particulier" && !operationCategory) {
      nextErrors.operationCategory =
        "Catégorie d’opération obligatoire pour ce type de client.";
      setAdvancedOpen(true);
    }
    if (!hasValidLine)
      nextErrors.lines =
        "Ajoutez au moins une prestation valide (libellé, quantité et prix HT).";

    const normalizedEmail = (clientEmail || "").trim();
    if (requireEmail) {
      if (!normalizedEmail)
        nextErrors.clientEmail =
          "Email client obligatoire pour envoyer par mail.";
      else if (!isValidEmail(normalizedEmail))
        nextErrors.clientEmail = "Email client invalide.";
    } else if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      nextErrors.clientEmail = "Email client invalide.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormMessage(null);
      return false;
    }
    return true;
  };

  const saveDraft = async (options?: { silent?: boolean }) => {
    const nowISO = new Date().toISOString();
    const finalNumber = number || generateNumber("FAC");
    if (!number) setNumber(finalNumber);

    const normalizedEmail = (clientEmail || "").trim();
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      setFieldErrors((prev) => ({
        ...prev,
        clientEmail: "Email client invalide.",
      }));
      setFormMessage(null);
      return null;
    }

    const normalizedBillingAddress = buildFullCrmAddress(
      billingAddress,
      billingPostalCode,
      billingCity,
    );
    const normalizedDeliveryAddress = sameAddresses
      ? normalizedBillingAddress
      : buildFullCrmAddress(deliveryAddress, deliveryPostalCode, deliveryCity);
    const savedServiceDate = serviceDateMode === "single" ? serviceDate : "";
    const savedServicePeriodStart =
      serviceDateMode === "period" ? servicePeriodStart : "";
    const savedServicePeriodEnd =
      serviceDateMode === "period" ? servicePeriodEnd : "";

    const snapshot: FactureDraft["snapshot"] = {
      number: finalNumber,
      invoiceDate: invoiceDate || new Date().toISOString().slice(0, 10),
      dueDate,
      clientName,
      clientAddress: normalizedBillingAddress,
      billingAddress: billingAddress.trim(),
      billingPostalCode: billingPostalCode.trim(),
      billingCity: billingCity.trim(),
      deliveryAddress: sameAddresses
        ? billingAddress.trim()
        : deliveryAddress.trim(),
      deliveryPostalCode: sameAddresses
        ? billingPostalCode.trim()
        : deliveryPostalCode.trim(),
      deliveryCity: sameAddresses ? billingCity.trim() : deliveryCity.trim(),
      sameAddresses,
      providerOverride,
      clientEmail,
      clientSiren,
      clientVatNumber,
      clientType,
      vatDispense,
      operationCategory,
      serviceDateMode,
      serviceDate: savedServiceDate,
      servicePeriodStart: savedServicePeriodStart,
      servicePeriodEnd: savedServicePeriodEnd,
      purchaseOrderReference,
      depositKind,
      depositValue,
      vatOnDebits,
      lateFeeRate,
      fixedRecoveryFee40,
      documentKind,
      status: (status as any) || "brouillon",
      paymentMethod,
      paymentDetails,
      notes,
      invoiceMention,
      lines,
      discountKind,
      discountValue: Number(discountValue) || 0,
      discountDetails,
      isFinalized,
      finalizedAt: finalizedAt || null,
      lockedAt: finalizedAt || null,
    };

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return;

    const autoName =
      (clientName || "").trim() ||
      (clientEmail || "").trim() ||
      snapshot.number ||
      "Sauvegarde";

    const saveMutation = currentSaveId
      ? supabase
          .from("doc_saves")
          .update({
            name: autoName,
            payload: snapshot,
            updated_at: nowISO,
          })
          .eq("user_id", user.id)
          .eq("type", SAVES_TYPE)
          .eq("id", currentSaveId)
      : supabase.from("doc_saves").insert({
          user_id: user.id,
          type: SAVES_TYPE,
          name: autoName,
          payload: snapshot,
          updated_at: nowISO,
        });

    const { data: savedRows, error } = await saveMutation.select("id");

    if (error) {
      console.error(error);
      setFormMessage({
        type: "error",
        text: "Impossible d’enregistrer cette facture pour le moment.",
      });
      return;
    }

    const savedId =
      (savedRows?.[0] as { id?: string } | undefined)?.id || currentSaveId;
    if (savedId) setCurrentSaveId(savedId);

    await refreshSaves();
    if (!options?.silent) {
      setDocumentsTab("saves");
      setDraftsOpen(true);
      setFormMessage({
        type: "success",
        text: currentSaveId ? "Facture mise à jour." : "Facture enregistrée.",
      });
    }

    return savedId as string | undefined;
  };

  const saveAsTemplate = async () => {
    const hasValidLine = hasReusableDocumentLine(lines);
    if (!hasValidLine) {
      setFieldErrors((prev) => ({
        ...prev,
        lines:
          "Ajoutez au moins une prestation valide avant d’enregistrer un modèle.",
      }));
      setFormMessage(null);
      return;
    }

    const templateName = await promptInrcy({
      title: "Créer un modèle",
      message:
        "Donnez un nom à ce modèle de facture pour le réutiliser plus tard.",
      defaultValue: "Modèle facture",
      placeholder: "Nom du modèle",
      confirmLabel: "Créer modèle",
      required: false,
    });
    if (templateName === null) return;

    const cleanName = templateName.trim() || "Modèle facture";
    const nowISO = new Date().toISOString();
    const savedServiceDate = serviceDateMode === "single" ? serviceDate : "";
    const savedServicePeriodStart =
      serviceDateMode === "period" ? servicePeriodStart : "";
    const savedServicePeriodEnd =
      serviceDateMode === "period" ? servicePeriodEnd : "";
    const snapshot = prepareTemplateSnapshot<FactureDraft["snapshot"]>(
      {
        providerOverride,
        vatDispense,
        operationCategory,
        serviceDateMode,
        serviceDate: savedServiceDate,
        servicePeriodStart: savedServicePeriodStart,
        servicePeriodEnd: savedServicePeriodEnd,
        purchaseOrderReference,
        depositKind,
        depositValue,
        vatOnDebits,
        lateFeeRate,
        fixedRecoveryFee40,
        documentKind,
        paymentMethod,
        paymentDetails,
        notes,
        invoiceMention,
        lines: cloneDocumentLines(lines),
        discountKind,
        discountValue: Number(discountValue) || 0,
        discountDetails,
      },
      cleanName,
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return;

    const { error } = await supabase.from("doc_saves").insert({
      user_id: user.id,
      type: SAVES_TYPE,
      name: cleanName,
      payload: snapshot,
      updated_at: nowISO,
    });

    if (error) {
      console.error(error);
      setFormMessage({
        type: "error",
        text: "Impossible d’enregistrer ce modèle pour le moment.",
      });
      return;
    }

    await refreshSaves();
    setDocumentsTab("templates");
    setDraftsOpen(true);
    setFormMessage({ type: "success", text: "Modèle de facture enregistré." });
  };

  const applyTemplateSnapshot = (s: FactureDraft["snapshot"]) => {
    const now = new Date();
    const invoiceDateISO = now.toISOString().slice(0, 10);

    setCurrentSaveId("");
    setIsFinalized(false);
    setFinalizedAt("");
    setNumber(generateNumber("FAC"));
    setInvoiceDate(invoiceDateISO);
    setDueDate(
      dateWithAddedDays(invoiceDateISO, documentsSettings.invoice.dueDays),
    );

    setOperationCategory(
      (s.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]) ||
        (documentsSettings.common
          .operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]),
    );
    const nextServiceDateMode = inferServiceDateMode(s);
    setServiceDateMode(nextServiceDateMode);
    setServiceDate(nextServiceDateMode === "single" ? s.serviceDate || "" : "");
    setServicePeriodStart(
      nextServiceDateMode === "period" ? s.servicePeriodStart || "" : "",
    );
    setServicePeriodEnd(
      nextServiceDateMode === "period" ? s.servicePeriodEnd || "" : "",
    );
    setPurchaseOrderReference(s.purchaseOrderReference || "");
    setDepositKind(
      (s.depositKind as "" | "percent" | "amount") ||
        documentsSettings.common.depositKind,
    );
    setDepositValue(
      s.depositValue ||
        (documentsSettings.common.depositKind
          ? documentsSettings.common.depositValue
          : ""),
    );
    setVatOnDebits(
      typeof s.vatOnDebits === "boolean"
        ? s.vatOnDebits
        : documentsSettings.invoice.vatOnDebits,
    );
    setLateFeeRate(s.lateFeeRate || documentsSettings.invoice.lateFeeRate);
    setFixedRecoveryFee40(
      typeof s.fixedRecoveryFee40 === "boolean"
        ? s.fixedRecoveryFee40
        : documentsSettings.invoice.fixedRecoveryFee40,
    );
    setDocumentKind(
      (s.documentKind as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"]) ||
        (documentsSettings.invoice
          .documentKind as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"]),
    );
    setStatus(
      documentsSettings.invoice.status as
        | DocRecord["status"]
        | "en_attente_paiement"
        | "",
    );
    setPaymentMethod(
      ((s.paymentMethod as (typeof PAYMENT_METHODS)[number]["key"]) ||
        documentsSettings.common
          .paymentMethod) as (typeof PAYMENT_METHODS)[number]["key"],
    );
    setPaymentDetails(
      s.paymentDetails || documentsSettings.common.paymentDetails,
    );
    setNotes(s.notes || documentsSettings.common.notes);
    setInvoiceMention(s.invoiceMention || documentsSettings.invoice.mention);
    setLines(
      Array.isArray(s.lines) && s.lines.length
        ? s.lines.map((line) => ({ ...line, id: uid("l") }))
        : [makeDefaultLine(documentsSettings, vatDispense, 120)],
    );
    setDiscountKind(s.discountKind || "");
    setDiscountValue(Number(s.discountValue) || 0);
    setDiscountDetails(s.discountDetails || "");
    setFieldErrors({});
    setDraftsOpen(false);
    setFormMessage({
      type: "success",
      text: "Modèle appliqué. Ajoutez ou vérifiez le client avant l’envoi.",
    });
  };

  const addCurrentClientToCrm = async () => {
    const displayName = (clientName || "").trim();
    const email = (clientEmail || "").trim();
    const primaryAddress = buildFullCrmAddress(
      billingAddress,
      billingPostalCode,
      billingCity,
    ).trim();

    setFormMessage(null);
    setCrmActionMessage(null);

    if (!displayName && !email && !primaryAddress) {
      setCrmActionMessage({
        type: "error",
        text: "Renseignez au moins un nom, un email ou une adresse client.",
      });
      return;
    }

    setAddingToCrm(true);
    try {
      const response = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          siret: (clientSiren || "").trim(),
          vat_number: (clientVatNumber || "").trim(),
          email,
          address: (billingAddress || "").trim(),
          postal_code: (billingPostalCode || "").trim(),
          city: (billingCity || "").trim(),
          billing_address: (billingAddress || "").trim(),
          delivery_address: sameAddresses ? "" : (deliveryAddress || "").trim(),
          contact_type: "client",
          category: clientType || "particulier",
          notes: [
            `Ajouté depuis Factures`,
            purchaseOrderReference ? `PO: ${purchaseOrderReference}` : "",
          ]
            .filter(Boolean)
            .join(" — "),
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          getSimpleFrenchErrorMessage(
            json?.error,
            "Impossible d’ajouter ce client au CRM.",
          ),
        );
      }

      setCrmActionMessage({ type: "success", text: "Client ajouté au CRM." });
    } catch (error) {
      setCrmActionMessage({
        type: "error",
        text: getSimpleFrenchErrorMessage(
          error,
          "Impossible d’ajouter ce client au CRM.",
        ),
      });
    } finally {
      setAddingToCrm(false);
    }
  };

  const finalizeInvoice = async (
    docSaveId: string,
    targetStatus:
      | "en_attente_paiement"
      | "envoye"
      | "paye" = "en_attente_paiement",
  ) => {
    setFinalizing(true);
    try {
      const res = await fetch("/api/factures/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docSaveId, targetStatus }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          getSimpleFrenchErrorMessage(
            json?.error,
            "Impossible de figer cette facture pour le moment.",
          ),
        );
      }

      const officialNumber =
        typeof json?.number === "string" && json.number ? json.number : number;
      const nextStatus =
        typeof json?.status === "string" && json.status
          ? (json.status as DocRecord["status"])
          : (targetStatus as DocRecord["status"]) || "en_attente_paiement";
      const nextFinalizedAt =
        typeof json?.finalizedAt === "string"
          ? json.finalizedAt
          : new Date().toISOString();

      setCurrentSaveId(docSaveId);
      setNumber(officialNumber);
      setStatus(nextStatus);
      setIsFinalized(true);
      setFinalizedAt(nextFinalizedAt);
      await refreshSaves();

      return {
        docSaveId,
        number: officialNumber,
        status: nextStatus,
        finalizedAt: nextFinalizedAt,
      };
    } catch (error) {
      const text = getSimpleFrenchErrorMessage(
        error,
        "Impossible de figer cette facture pour le moment.",
      );
      setFormMessage({ type: "error", text });
      return null;
    } finally {
      setFinalizing(false);
    }
  };

  const openDraft = (d: FactureDraft) => {
    applyDraftSnapshot(d.snapshot);
    setCurrentSaveId(d.id);
    setDraftsOpen(false);
  };

  const deleteDraft = async (id: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("doc_saves")
      .delete()
      .eq("user_id", user.id)
      .eq("type", SAVES_TYPE)
      .eq("id", id);

    if (currentSaveId === id) setCurrentSaveId("");
    await refreshSaves();
  };

  const print = async () => {
    setIsEditingProvider(false);
    await waitForDomUpdate();
    window.print();
  };

  const waitForDomUpdate = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

  const buildPdfBlob = async (): Promise<Blob | null> => {
    if (typeof window === "undefined") return null;
    setIsEditingProvider(false);
    await waitForDomUpdate();
    const el = previewRef.current;
    if (!el) return null;

    const hiddenSelector = [
      styles.noPrint,
      styles.printHidden,
      styles.printHiddenCell,
    ]
      .filter(Boolean)
      .map((className) => `.${className}`)
      .join(", ");
    const hiddenEls = hiddenSelector
      ? (Array.from(el.querySelectorAll(hiddenSelector)) as HTMLElement[])
      : [];
    const printOnlyEls = Array.from(
      el.querySelectorAll(`.${styles.printOnly}`),
    ) as HTMLElement[];
    const previousHiddenDisplay = hiddenEls.map((node) => node.style.display);
    const previousPrintOnlyDisplay = printOnlyEls.map(
      (node) => node.style.display,
    );

    hiddenEls.forEach((node) => {
      node.style.display = "none";
    });
    printOnlyEls.forEach((node) => {
      node.style.display = "block";
    });

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
    } finally {
      hiddenEls.forEach((node, index) => {
        node.style.display = previousHiddenDisplay[index] || "";
      });
      printOnlyEls.forEach((node, index) => {
        node.style.display = previousPrintOnlyDisplay[index] || "";
      });
    }

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgProps = (pdf as any).getImageProperties(imgData);
    const imgWidth = pageWidth;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    let position = 0;
    let heightLeft = imgHeight;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output("blob") as Blob;
  };

  const uploadPdfAndOpenCompose = async (to: string, filename?: string) => {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      setFormMessage({
        type: "error",
        text: "Vous devez être connecté pour envoyer par mail.",
      });
      return;
    }

    const docSaveId = await saveDraft({ silent: true });
    if (!docSaveId) {
      setFormMessage({
        type: "error",
        text: "Veuillez d’abord sauvegarder cette facture avant l’envoi.",
      });
      return;
    }

    const mailFinalizeStatus = status === "paye" ? "paye" : "envoye";
    const finalized = await finalizeInvoice(docSaveId, mailFinalizeStatus);
    if (!finalized) return;

    const officialNumber = finalized.number || number || generateNumber("FAC");
    if (!number || number !== officialNumber) setNumber(officialNumber);
    await waitForDomUpdate();

    const pdfBlob = await buildPdfBlob();
    if (!pdfBlob) {
      setFormMessage({
        type: "error",
        text: "Impossible de générer le PDF de cette facture pour le moment.",
      });
      return;
    }

    const rawFilename =
      filename && filename.trim() ? filename : `${officialNumber}.pdf`;
    const safeName = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${user.id}/factures/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(ATTACH_BUCKET)
      .upload(key, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      console.error(upErr);
      setFormMessage({
        type: "error",
        text: "Impossible de préparer cette facture pour l’envoi.",
      });
      return;
    }

    const params = new URLSearchParams();
    params.set("compose", "1");
    params.set("to", to);
    params.set("attachKey", key);
    params.set("attachName", safeName);
    if (clientName?.trim()) params.set("clientName", clientName.trim());
    params.set("type", "facture");
    params.set("docSaveId", docSaveId);
    params.set("docType", "facture");
    params.set("docNumber", officialNumber || safeName.replace(/\.pdf$/i, ""));
    router.push(`/dashboard/mails?${params.toString()}`);
  };

  const paymentLabel =
    PAYMENT_METHODS.find((m) => m.key === paymentMethod)?.label ?? "—";
  const operationCategoryLabel =
    OPERATION_CATEGORY_OPTIONS.find(
      (option) => option.key === operationCategory,
    )?.label ?? "—";
  const documentTitle =
    documentKind === "deposit"
      ? "FACTURE D’ACOMPTE"
      : documentKind === "credit_note"
        ? "AVOIR"
        : "FACTURE";

  const documentDesign = documentsSettings.common.design;
  const previewClassName = [
    styles.preview,
    documentDesign.preset === "business" ? styles.previewDesignBusiness : "",
    documentDesign.preset === "encadre" ? styles.previewDesignEncadre : "",
    documentDesign.preset === "signature" ? styles.previewDesignSignature : "",
    documentDesign.frame ? styles.previewFrame : "",
    documentDesign.coloredTotals ? styles.previewColoredTotals : "",
    documentDesign.coloredParties ? styles.previewColoredParties : "",
    documentDesign.accentColor === "violet" ? styles.previewAccentViolet : "",
    documentDesign.accentColor === "orange" ? styles.previewAccentOrange : "",
    documentDesign.accentColor === "green" ? styles.previewAccentGreen : "",
    documentDesign.accentColor === "gray" ? styles.previewAccentGray : "",
    documentDesign.accentColor === "rose" ? styles.previewAccentRose : "",
    documentDesign.accentColor === "teal" ? styles.previewAccentTeal : "",
    documentDesign.accentColor === "gold" ? styles.previewAccentGold : "",
    documentDesign.accentColor === "blue" ? styles.previewAccentBlue : "",
  ]
    .filter(Boolean)
    .join(" ");
  const invoicePrintPages = buildInvoicePrintPages(lines);

  return (
    <div className={`${dash.page} ${styles.editorPage}`}>
      <div className={styles.container}>
        {/* Formulaire */}
        <div className={styles.panel}>
          <div className={styles.panelToolbar}>
            <h1 className={styles.titleBadge}>Créer une facture</h1>
            <button
              type="button"
              className={`${styles.closeBtn} ${styles.toolbarBtn}`}
              onClick={() => {
                void refreshSaves();
                setDocumentsTab("saves");
                setDraftsOpen(true);
              }}
            >
              Documents
            </button>
            <button
              type="button"
              className={`${styles.closeBtn} ${styles.toolbarBtn}`}
              onClick={async () => {
                const ok = await confirmInrcy({
                  eyebrow: "Document en cours",
                  title: "Réinitialiser la facture ?",
                  message:
                    "Cette action supprimera la saisie actuelle et remettra le document à zéro.",
                  cancelLabel: "Annuler",
                  confirmLabel: "Réinitialiser",
                  variant: "danger",
                });
                if (!ok) return;

                setSelectedCrmContactId("");
                setCrmOpen(false);
                setFieldErrors({});
                setFormMessage(null);

                setClientName("");
                setClientEmail("");
                setClientSiren("");
                setClientVatNumber("");
                setClientType("");
                setClientAddress("");
                setBillingAddress("");
                setDeliveryAddress("");
                setSameAddresses(true);
                setOperationCategory(
                  documentsSettings.common
                    .operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"],
                );
                setServiceDateMode("single");
                setServiceDate("");
                setServicePeriodStart("");
                setServicePeriodEnd("");
                setPurchaseOrderReference("");
                setDepositKind(documentsSettings.common.depositKind);
                setDepositValue(
                  documentsSettings.common.depositKind
                    ? documentsSettings.common.depositValue
                    : "",
                );
                setVatOnDebits(documentsSettings.invoice.vatOnDebits);
                setLateFeeRate(documentsSettings.invoice.lateFeeRate);
                setFixedRecoveryFee40(
                  documentsSettings.invoice.fixedRecoveryFee40,
                );
                setDocumentKind(
                  documentsSettings.invoice
                    .documentKind as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"],
                );

                setCurrentSaveId("");
                setIsFinalized(false);
                setFinalizedAt("");
                setNumber(generateNumber("FAC"));
                const d = new Date();
                const invoiceDateISO = d.toISOString().slice(0, 10);
                setInvoiceDate(invoiceDateISO);
                setDueDate(
                  dateWithAddedDays(
                    invoiceDateISO,
                    documentsSettings.invoice.dueDays,
                  ),
                );

                setStatus(
                  documentsSettings.invoice.status as
                    | DocRecord["status"]
                    | "en_attente_paiement"
                    | "",
                );
                setPaymentMethod(
                  documentsSettings.common
                    .paymentMethod as (typeof PAYMENT_METHODS)[number]["key"],
                );
                setPaymentDetails(documentsSettings.common.paymentDetails);
                setNotes(documentsSettings.common.notes);
                setInvoiceMention(documentsSettings.invoice.mention);

                setDiscountKind("");
                setDiscountValue(0);
                setDiscountDetails("");

                setLines([
                  makeDefaultLine(documentsSettings, vatDispense, 120),
                ]);
              }}
            >
              Réinitialiser
            </button>
            <button
              type="button"
              className={`${styles.closeBtn} ${styles.toolbarBtn} ${styles.switchBtnDevis}`}
              onClick={() => router.push("/dashboard/devis/new")}
            >
              Devis
            </button>
            <button
              type="button"
              className={`${styles.closeBtn} ${styles.toolbarBtn}`}
              onClick={() => setSettingsOpen(true)}
            >
              Réglages
            </button>
            <button
              type="button"
              className={`${styles.closeBtn} ${styles.toolbarBtn}`}
              onClick={() => router.push("/dashboard")}
            >
              Fermer
            </button>
          </div>

          <SettingsDrawer
            title="Réglages par défaut"
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          >
            <DocumentsSettingsContent />
          </SettingsDrawer>

          {isFinalized ? (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.35)",
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              Facture figée avec le numéro officiel{" "}
              <strong>{number || "—"}</strong>
              {finalizedAt ? (
                <> · figée le {new Date(finalizedAt).toLocaleString("fr-FR")}</>
              ) : null}
            </div>
          ) : null}

          {draftsOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                zIndex: 9999,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: "clamp(12px, 4vh, 32px) 16px",
                overflowY: "auto",
              }}
              onClick={() => setDraftsOpen(false)}
            >
              <div
                style={{
                  width: "min(720px, 100%)",
                  maxHeight: "min(86vh, 860px)",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 16,
                  padding: 0,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    padding: "14px 14px 10px",
                    background: "#111",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ fontWeight: 750, fontSize: 16 }}>Documents</div>
                  <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={() => setDraftsOpen(false)}
                  >
                    Fermer
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "10px 14px",
                    background: "#111",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    position: "sticky",
                    top: 52,
                    zIndex: 2,
                  }}
                >
                  <button
                    type="button"
                    className={
                      documentsTab === "saves"
                        ? styles.primaryBtn
                        : styles.ghostBtn
                    }
                    onClick={() => setDocumentsTab("saves")}
                  >
                    Sauvegardes
                  </button>
                  <button
                    type="button"
                    className={
                      documentsTab === "templates"
                        ? styles.primaryBtn
                        : styles.ghostBtn
                    }
                    onClick={() => setDocumentsTab("templates")}
                  >
                    Modèles
                  </button>
                </div>

                {documentsTab === "saves" ? (
                  drafts.length === 0 ? (
                    <div style={{ padding: 14, opacity: 0.85 }}>
                      Aucune facture sauvegardée.
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 14,
                        display: "grid",
                        gap: 10,
                        maxHeight: drafts.length > 10 ? "62vh" : undefined,
                        overflowY: drafts.length > 10 ? "auto" : undefined,
                        paddingRight: drafts.length > 10 ? 8 : 14,
                      }}
                    >
                      {drafts.map((d) => {
                        const label = d.snapshot.number || "(Sans numéro)";
                        const who = d.snapshot.clientName?.trim()
                          ? ` — ${d.snapshot.clientName.trim()}`
                          : "";
                        return (
                          <div
                            key={d.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: 10,
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 14,
                              background: "rgba(255,255,255,0.04)",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 650,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {label}
                                {who}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.8 }}>
                                Sauvegardé le{" "}
                                {new Date(d.updatedAtISO).toLocaleString(
                                  "fr-FR",
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                                justifyContent: "flex-end",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => openDraft(d)}
                              >
                                Ouvrir
                              </button>
                              <button
                                type="button"
                                className={styles.ghostBtn}
                                onClick={() => deleteDraft(d.id)}
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : templates.length === 0 ? (
                  <div style={{ padding: 14, opacity: 0.85 }}>
                    Aucun modèle de facture pour l’instant.
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 14,
                      display: "grid",
                      gap: 10,
                      maxHeight: templates.length > 10 ? "62vh" : undefined,
                      overflowY: templates.length > 10 ? "auto" : undefined,
                      paddingRight: templates.length > 10 ? 8 : 14,
                    }}
                  >
                    {templates.map((d) => {
                      const label =
                        d.snapshot.templateName || d.name || "Modèle facture";
                      return (
                        <div
                          key={d.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: 10,
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 14,
                            background: "rgba(255,255,255,0.04)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 650,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {label}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Modèle enregistré le{" "}
                              {new Date(d.updatedAtISO).toLocaleString("fr-FR")}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => applyTemplateSnapshot(d.snapshot)}
                            >
                              Utiliser
                            </button>
                            <button
                              type="button"
                              className={styles.ghostBtn}
                              onClick={() => deleteDraft(d.id)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className={styles.formBlock}>
            <div className={styles.formBlockHeader}>
              <div>
                <div className={styles.formBlockTitleRow}>
                  <span className={styles.formBlockIcon} aria-hidden="true">
                    👤
                  </span>
                  <div className={styles.formBlockTitle}>Infos contact</div>
                </div>
                <div className={styles.formBlockSubtitle}>
                  Import CRM, coordonnées et adresse du client.
                </div>
              </div>
            </div>

            <div className={styles.crmActionBar} ref={crmSelectRef}>
              <div className={styles.crmActionMain}>
                <span className={styles.crmActionLabel}>
                  Importer un contact
                </span>
                <button
                  type="button"
                  className={styles.crmImportButton}
                  onClick={() => setCrmOpen((v) => !v)}
                  disabled={crmLoading || coreEditingLocked}
                  aria-haspopup="listbox"
                  aria-expanded={crmOpen}
                >
                  <span
                    className={styles.crmImportButtonText}
                    title={
                      selectedCrmLabel || "Importer / Rechercher un contact CRM"
                    }
                  >
                    {selectedCrmLabel ||
                      (crmLoading
                        ? "Chargement..."
                        : "Importer / Rechercher un contact CRM")}
                  </span>
                  <span aria-hidden="true">▾</span>
                </button>

                {crmOpen ? (
                  <div
                    className={styles.crmSearchPanel}
                    role="dialog"
                    aria-label="Importer ou rechercher un contact CRM"
                  >
                    <input
                      className={styles.crmSearchInput}
                      type="search"
                      value={crmQuery}
                      onChange={(e) => setCrmQuery(e.target.value)}
                      placeholder="Rechercher un contact, email, téléphone..."
                      autoFocus
                    />
                    <div className={styles.crmSearchResults} role="listbox">
                      {filteredCrmContacts.length ? (
                        filteredCrmContacts.map((c) => {
                          const label = crmLabel(c);
                          const line = c.email
                            ? `${label} — ${c.email}`
                            : label;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={styles.crmSearchItem}
                              onClick={() => selectCrmContact(c)}
                              title={line}
                            >
                              {line}
                            </button>
                          );
                        })
                      ) : (
                        <div className={styles.crmSearchEmpty}>
                          Aucun contact trouvé. Remplissez le client puis
                          utilisez “+ Ajouter au CRM”.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={`${styles.field} ${styles.crmClientTypeField}`}>
                <label>
                  Type de client<span className={styles.requiredMark}>*</span>
                </label>
                <select
                  value={clientType}
                  onChange={(e) => {
                    setClientType(e.target.value as ClientType);
                    clearFieldError("clientType");
                    clearFieldError("clientSiren");
                    clearFieldError("operationCategory" as any);
                  }}
                  disabled={coreEditingLocked}
                >
                  <option value="">—</option>
                  <option value="particulier">Particulier</option>
                  <option value="professionnel">Professionnel</option>
                  <option value="institution">Institution</option>
                </select>
                {fieldErrors.clientType ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.clientType}
                  </div>
                ) : null}
              </div>

              <div className={styles.crmAddColumn}>
                <button
                  type="button"
                  className={styles.crmAddButton}
                  onClick={() => void addCurrentClientToCrm()}
                  disabled={finalizing || addingToCrm || coreEditingLocked}
                >
                  {addingToCrm ? "Ajout CRM…" : "+ Ajouter au CRM"}
                </button>
                {crmActionMessage ? (
                  <div
                    className={`${styles.crmActionMessage} ${crmActionMessage.type === "success" ? styles.crmActionMessageSuccess : styles.crmActionMessageError}`}
                  >
                    {crmActionMessage.text}
                  </div>
                ) : null}
              </div>

              {crmError ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    marginTop: -4,
                    fontSize: 12,
                    opacity: 0.8,
                  }}
                >
                  ⚠️ {crmError}
                </div>
              ) : null}
            </div>

            <div className={styles.fourCol}>
              <div className={styles.field}>
                <label>
                  Client<span className={styles.requiredMark}>*</span>
                </label>
                <input
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    clearFieldError("clientName");
                  }}
                  placeholder="Nom du client"
                  disabled={coreEditingLocked}
                />
                {fieldErrors.clientName ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.clientName}
                  </div>
                ) : null}
              </div>

              <div className={styles.field}>
                <label>
                  Email client<span className={styles.requiredMark}>*</span>
                </label>
                <input
                  value={clientEmail}
                  onChange={(e) => {
                    setClientEmail(e.target.value);
                    if (fieldErrors.clientEmail)
                      setFieldErrors((prev) => ({
                        ...prev,
                        clientEmail: undefined,
                      }));
                  }}
                  placeholder="email@client.fr"
                  disabled={coreEditingLocked}
                />
                {fieldErrors.clientEmail ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.clientEmail}
                  </div>
                ) : null}
              </div>

              <div className={styles.field}>
                <label>
                  SIREN client
                  {clientType && clientType !== "particulier" ? (
                    <span className={styles.requiredMark}>*</span>
                  ) : null}
                </label>
                <input
                  value={clientSiren}
                  onChange={(e) => {
                    setClientSiren(e.target.value);
                    clearFieldError("clientSiren");
                  }}
                  placeholder="Ex : 123456789"
                  disabled={coreEditingLocked}
                />
                {fieldErrors.clientSiren ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.clientSiren}
                  </div>
                ) : null}
              </div>

              <div className={styles.field}>
                <label>N° TVA client (optionnel)</label>
                <input
                  value={clientVatNumber}
                  onChange={(e) => setClientVatNumber(e.target.value)}
                  placeholder="Ex : FR12345678901"
                  disabled={coreEditingLocked}
                />
              </div>
            </div>

            <div className={styles.compactThreeCol}>
              <div className={styles.field}>
                <label>
                  Adresse<span className={styles.requiredMark}>*</span>
                </label>
                <input
                  value={billingAddress}
                  onChange={(e) => {
                    setBillingAddress(e.target.value);
                    clearFieldError("billingAddress");
                  }}
                  placeholder="Adresse"
                  disabled={coreEditingLocked}
                />
                {fieldErrors.billingAddress ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.billingAddress}
                  </div>
                ) : null}
              </div>
              <div className={styles.field}>
                <label>
                  Code postal<span className={styles.requiredMark}>*</span>
                </label>
                <input
                  value={billingPostalCode}
                  onChange={(e) => {
                    setBillingPostalCode(e.target.value);
                    clearFieldError("billingPostalCode");
                  }}
                  placeholder="Ex : 62440"
                  disabled={coreEditingLocked}
                />
                {fieldErrors.billingPostalCode ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.billingPostalCode}
                  </div>
                ) : null}
              </div>
              <div className={styles.field}>
                <label>
                  Ville<span className={styles.requiredMark}>*</span>
                </label>
                <input
                  value={billingCity}
                  onChange={(e) => {
                    setBillingCity(e.target.value);
                    clearFieldError("billingCity");
                  }}
                  placeholder="Ex : Harnes"
                  disabled={coreEditingLocked}
                />
                {fieldErrors.billingCity ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.billingCity}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.field}>
              <label
                className={styles.checkboxLabel}
                style={{
                  cursor: coreEditingLocked ? "not-allowed" : "pointer",
                }}
              >
                <input
                  className={styles.checkboxInput}
                  type="checkbox"
                  checked={sameAddresses}
                  onChange={(e) => setSameAddresses(e.target.checked)}
                  disabled={coreEditingLocked}
                />
                <span>
                  Adresse de livraison identique à l’adresse de facturation
                </span>
              </label>
            </div>

            {!sameAddresses ? (
              <div
                style={{
                  marginTop: -2,
                  marginBottom: 4,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div className={styles.compactThreeCol}>
                  <div className={styles.field} style={{ marginBottom: 0 }}>
                    <label>Adresse de livraison</label>
                    <input
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Adresse"
                      disabled={coreEditingLocked}
                    />
                  </div>
                  <div className={styles.field} style={{ marginBottom: 0 }}>
                    <label>Code postal livraison</label>
                    <input
                      value={deliveryPostalCode}
                      onChange={(e) => setDeliveryPostalCode(e.target.value)}
                      placeholder="Ex : 62440"
                      disabled={coreEditingLocked}
                    />
                  </div>
                  <div className={styles.field} style={{ marginBottom: 0 }}>
                    <label>Ville livraison</label>
                    <input
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder="Ex : Harnes"
                      disabled={coreEditingLocked}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className={styles.formBlock}>
            <div className={styles.formBlockHeader}>
              <div>
                <div className={styles.formBlockTitleRow}>
                  <span className={styles.formBlockIcon} aria-hidden="true">
                    🧾
                  </span>
                  <div className={styles.formBlockTitle}>Infos facture</div>
                </div>
                <div className={styles.formBlockSubtitle}>
                  Numéro, dates, options avancées et actions.
                </div>
              </div>
            </div>

            <div
              className={`${styles.compactThreeCol} ${styles.mobileStackGrid}`}
            >
              <div className={styles.field}>
                <label>
                  Numéro de facture
                  <span className={styles.requiredMark}>*</span>
                </label>
                <input
                  value={number}
                  onChange={(e) => {
                    setNumber(e.target.value);
                    clearFieldError("number");
                  }}
                  placeholder="FAC-YYYYMMDD-XXXX"
                  disabled={coreEditingLocked}
                />
                {fieldErrors.number ? (
                  <div className={styles.fieldError}>{fieldErrors.number}</div>
                ) : null}
              </div>

              <div className={styles.field}>
                <label>
                  Date de facture<span className={styles.requiredMark}>*</span>
                </label>
                <DocumentDateInput
                  value={invoiceDate}
                  onChange={(value) => {
                    setInvoiceDate(value);
                    clearFieldError("invoiceDate");
                    setDueDate(
                      dateWithAddedDays(
                        value,
                        documentsSettings.invoice.dueDays,
                      ),
                    );
                  }}
                  disabled={coreEditingLocked}
                />
                {fieldErrors.invoiceDate ? (
                  <div className={styles.fieldError}>
                    {fieldErrors.invoiceDate}
                  </div>
                ) : null}
              </div>

              <div className={styles.field}>
                <label>
                  Échéance<span className={styles.requiredMark}>*</span>
                </label>
                <DocumentDateInput
                  value={dueDate}
                  onChange={(value) => {
                    setDueDate(value);
                    clearFieldError("dueDate");
                  }}
                  disabled={coreEditingLocked}
                />
                {fieldErrors.dueDate ? (
                  <div className={styles.fieldError}>{fieldErrors.dueDate}</div>
                ) : null}
              </div>
            </div>

            <details
              className={styles.advancedDetails}
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
            >
              <summary className={styles.advancedSummary}>
                Options avancées de la facture
              </summary>
              <div className={styles.advancedBody}>
                <div className={styles.advancedSection}>
                  <div className={styles.advancedSectionTitle}>Document</div>
                  <div className={styles.compactThreeCol}>
                    <div className={styles.field}>
                      <label>Type de document</label>
                      <select
                        value={documentKind}
                        onChange={(e) =>
                          setDocumentKind(
                            e.target
                              .value as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"],
                          )
                        }
                        disabled={coreEditingLocked}
                      >
                        {DOCUMENT_KIND_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>
                        Catégorie d’opération
                        {clientType && clientType !== "particulier" ? (
                          <span className={styles.requiredMark}>*</span>
                        ) : null}
                      </label>
                      <select
                        value={operationCategory}
                        onChange={(e) => {
                          setOperationCategory(
                            e.target
                              .value as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"],
                          );
                          clearFieldError("operationCategory");
                        }}
                        disabled={coreEditingLocked}
                      >
                        {OPERATION_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.operationCategory ? (
                        <div className={styles.fieldError}>
                          {fieldErrors.operationCategory}
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.field}>
                      <label>Statut</label>
                      <select
                        value={status}
                        onChange={(e) =>
                          setStatus(
                            e.target.value as
                              | DocRecord["status"]
                              | "en_attente_paiement"
                              | "",
                          )
                        }
                        disabled={coreEditingLocked}
                      >
                        <option value="">—</option>
                        <option value="brouillon">Brouillon</option>
                        <option value="en_attente_paiement">
                          En attente de paiement
                        </option>
                        <option value="envoye">Envoyé</option>
                        <option value="paye">Payé</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className={styles.advancedSection}>
                  <div className={styles.advancedSectionTitle}>
                    Acompte & paiement
                  </div>
                  <div className={styles.compactThreeCol}>
                    <div className={styles.field}>
                      <label>Acompte</label>
                      <select
                        value={depositKind}
                        onChange={(e) => {
                          const value = e.target.value as
                            | ""
                            | "percent"
                            | "amount";
                          setDepositKind(value);
                          if (!value) setDepositValue("");
                        }}
                        disabled={coreEditingLocked}
                      >
                        <option value="">—</option>
                        <option value="percent">Pourcentage</option>
                        <option value="amount">Montant</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>Valeur acompte</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositValue}
                        onChange={(e) => setDepositValue(e.target.value)}
                        placeholder={
                          depositKind === "amount" ? "Ex : 300" : "Ex : 30"
                        }
                        disabled={coreEditingLocked || !depositKind}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Mode de paiement</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) =>
                          setPaymentMethod(
                            e.target
                              .value as (typeof PAYMENT_METHODS)[number]["key"],
                          )
                        }
                        disabled={coreEditingLocked}
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method.key} value={method.key}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className={styles.field} style={{ marginBottom: 0 }}>
                    <label>IBAN</label>
                    <input
                      value={paymentDetails}
                      onChange={(e) => setPaymentDetails(e.target.value)}
                      placeholder="Ex : IBAN FR76..."
                      disabled={coreEditingLocked}
                    />
                  </div>
                </div>

                <div className={styles.advancedSection}>
                  <div className={styles.advancedSectionTitle}>
                    Échéance & mentions légales
                  </div>
                  <div className={styles.compactThreeCol}>
                    <div className={styles.field}>
                      <label>Pénalités de retard (%)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={lateFeeRate}
                        onChange={(e) => setLateFeeRate(e.target.value)}
                        placeholder="Ex : 12.00"
                        disabled={coreEditingLocked}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>TVA sur les débits</label>
                      <label className={styles.toggleInputLike}>
                        <input
                          type="checkbox"
                          checked={vatOnDebits}
                          onChange={(e) => setVatOnDebits(e.target.checked)}
                          disabled={coreEditingLocked}
                        />
                        <span>{vatOnDebits ? "Oui" : "Non"}</span>
                      </label>
                    </div>
                    <div className={styles.field}>
                      <label>Indemnité forfaitaire de 40 €</label>
                      <label className={styles.toggleInputLike}>
                        <input
                          type="checkbox"
                          checked={fixedRecoveryFee40}
                          onChange={(e) =>
                            setFixedRecoveryFee40(e.target.checked)
                          }
                          disabled={coreEditingLocked}
                        />
                        <span>{fixedRecoveryFee40 ? "Oui" : "Non"}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className={styles.advancedSection}>
                  <div className={styles.advancedSectionTitle}>Prestation</div>
                  <div
                    className={styles.serviceDateModeSelector}
                    role="radiogroup"
                    aria-label="Type de date de prestation"
                  >
                    <label
                      className={`${styles.serviceDateModeOption} ${serviceDateMode === "single" ? styles.serviceDateModeOptionActive : ""}`}
                    >
                      <input
                        type="radio"
                        name="factureServiceDateMode"
                        value="single"
                        checked={serviceDateMode === "single"}
                        onChange={() => updateServiceDateMode("single")}
                        disabled={coreEditingLocked}
                      />
                      <span>Date unique</span>
                    </label>
                    <label
                      className={`${styles.serviceDateModeOption} ${serviceDateMode === "period" ? styles.serviceDateModeOptionActive : ""}`}
                    >
                      <input
                        type="radio"
                        name="factureServiceDateMode"
                        value="period"
                        checked={serviceDateMode === "period"}
                        onChange={() => updateServiceDateMode("period")}
                        disabled={coreEditingLocked}
                      />
                      <span>Période</span>
                    </label>
                  </div>

                  {serviceDateMode === "single" ? (
                    <div className={styles.serviceDateSingleGrid}>
                      <div className={styles.field}>
                        <label>Date de prestation / livraison</label>
                        <DocumentDateInput
                          value={serviceDate}
                          onChange={setServiceDate}
                          disabled={coreEditingLocked}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.serviceDateFieldsGrid}>
                      <div className={styles.field}>
                        <label>Début de prestation</label>
                        <DocumentDateInput
                          value={servicePeriodStart}
                          onChange={setServicePeriodStart}
                          disabled={coreEditingLocked}
                        />
                      </div>
                      <div className={styles.field}>
                        <label>Fin de prestation</label>
                        <DocumentDateInput
                          value={servicePeriodEnd}
                          onChange={setServicePeriodEnd}
                          disabled={coreEditingLocked}
                        />
                      </div>
                    </div>
                  )}

                  <div className={styles.field} style={{ marginBottom: 0 }}>
                    <label>Référence commande / PO</label>
                    <input
                      value={purchaseOrderReference}
                      onChange={(e) =>
                        setPurchaseOrderReference(e.target.value)
                      }
                      placeholder="Ex : BC-2026-014 / PO-7781"
                      disabled={coreEditingLocked}
                    />
                  </div>
                </div>

                <div className={styles.advancedSection}>
                  <div className={styles.advancedSectionTitle}>
                    Notes & mentions
                  </div>
                  <div className={styles.twoCol}>
                    <div className={styles.field}>
                      <label>Notes</label>
                      <textarea
                        className={styles.advancedTextArea}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ex : Merci pour votre confiance."
                        disabled={coreEditingLocked}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Mention spécifique facture</label>
                      <textarea
                        className={styles.advancedTextArea}
                        value={invoiceMention}
                        onChange={(e) => setInvoiceMention(e.target.value)}
                        placeholder="Ex : Aucun escompte pour paiement anticipé."
                        disabled={coreEditingLocked}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <div className={styles.actionGrid}>
              <button
                type="button"
                onClick={() => {
                  void saveDraft();
                }}
                disabled={finalizing || addingToCrm}
              >
                <>
                  Sauvegarder
                  <span
                    className={styles.helpBubble}
                    title="Retrouvez vos sauvegardes dans Factures > Documents > Sauvegardes"
                  >
                    ?
                  </span>
                </>
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveAsTemplate();
                }}
                disabled={finalizing || addingToCrm}
              >
                <>
                  Créer modèle
                  <span
                    className={styles.helpBubble}
                    title="Retrouvez vos modèles dans Factures > Documents > Modèles"
                  >
                    ?
                  </span>
                </>
              </button>
              <button
                type="button"
                disabled={finalizing || addingToCrm || isFinalized}
                title={
                  isFinalized ? "Cette facture est déjà figée." : undefined
                }
                onClick={async () => {
                  if (!validateInvoiceAction()) return;
                  const docSaveId = await saveDraft({ silent: true });
                  if (!docSaveId) return;
                  const finalized = await finalizeInvoice(
                    docSaveId,
                    "en_attente_paiement",
                  );
                  if (finalized) {
                    setFormMessage({
                      type: "success",
                      text: `Facture figée sous le numéro ${finalized.number}.`,
                    });
                  }
                }}
              >
                {finalizing ? (
                  "Figement…"
                ) : (
                  <>
                    Figer
                    <span
                      className={styles.helpBubble}
                      title="Fige la facture avec un numéro officiel. Les informations principales sont verrouillées pour sécuriser le document avant envoi au client."
                    >
                      ?
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={finalizing || addingToCrm}
                onClick={async () => {
                  if (!validateInvoiceAction({ requireEmail: true })) return;
                  if (!isFinalized) {
                    const ok = await confirmInrcy({
                      title: "Figer la facture ?",
                      message:
                        "L’envoi par mail va figer ce document avant son ouverture dans iNrSend. Continuer ?",
                      confirmLabel: "Figer et envoyer",
                      variant: "warning",
                    });
                    if (!ok) return;
                  }
                  const to = (clientEmail || "").trim();
                  await uploadPdfAndOpenCompose(to);
                }}
              >
                {finalizing ? (
                  "Préparation…"
                ) : (
                  <>
                    Envoyer par mail
                    <span
                      className={styles.helpBubble}
                      title="Fige le document si besoin, prépare le PDF puis ouvre l’envoi par email au client."
                    >
                      ?
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={print}
                disabled={finalizing || addingToCrm}
              >
                Imprimer / PDF
              </button>
            </div>

            <div className={styles.requiredHint}>
              * champs obligatoires selon le type de client. L’email client est
              requis uniquement pour l’envoi par mail.
            </div>

            {formMessage ? (
              <div
                className={`${styles.actionMessage} ${formMessage.type === "success" ? styles.actionMessageSuccess : styles.actionMessageError}`}
              >
                {formMessage.text}
              </div>
            ) : null}

            {vatDispense ? (
              <p style={{ marginTop: 12, opacity: 0.9 }}>
                TVA désactivée :{" "}
                <strong>TVA non applicable (article 293 B du CGI)</strong>
              </p>
            ) : null}
          </div>
        </div>

        {/* Aperçu document */}
        <div className={previewClassName} ref={previewRef}>
          <div className={styles.previewHeader}>
            <div>
              <div className={styles.title}>{documentTitle}</div>
              <div>{number || "—"}</div>
              <div style={{ marginTop: 6, color: "#444" }}>
                Date :{" "}
                {invoiceDate
                  ? new Date(invoiceDate).toLocaleDateString("fr-FR")
                  : "—"}
                {dueDate ? (
                  <>
                    {" "}
                    · Échéance : {new Date(dueDate).toLocaleDateString("fr-FR")}
                  </>
                ) : null}
              </div>
              {serviceDateMode === "single" && serviceDate ? (
                <div style={{ marginTop: 4, color: "#444" }}>
                  Prestation / livraison :{" "}
                  {new Date(serviceDate).toLocaleDateString("fr-FR")}
                </div>
              ) : null}
              {serviceDateMode === "period" &&
              (servicePeriodStart || servicePeriodEnd) ? (
                <div style={{ marginTop: 4, color: "#444" }}>
                  Période :{" "}
                  {servicePeriodStart
                    ? new Date(servicePeriodStart).toLocaleDateString("fr-FR")
                    : "—"}
                  {servicePeriodEnd
                    ? ` → ${new Date(servicePeriodEnd).toLocaleDateString("fr-FR")}`
                    : ""}
                </div>
              ) : null}
            </div>
            {profile?.logo_url ? (
              <div className={styles.logoBox} aria-label="Logo">
                <img
                  src={profile.logo_url}
                  alt="Logo"
                  className={styles.logoImg}
                />
              </div>
            ) : null}
          </div>

          <div className={styles.previewParties}>
            <div className={styles.previewPartyCard}>
              <div className={styles.previewPartyTitle}>Prestataire</div>
              <div className={styles.noPrint} style={{ display: "flex", gap: 8, marginBottom: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setIsEditingProvider((prev) => !prev)} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, border: "1px solid #cbb4ff" }}>✏️ Modifier</button>
                <button type="button" onClick={() => setProviderOverride({})} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, border: "1px solid #cbb4ff" }}>↩ Réinitialiser</button>
              </div>
              <div style={{ fontWeight: 600 }}>
                {isEditingProvider ? (<input value={providerData.company_legal_name ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, company_legal_name: e.target.value }))} style={{ width: "100%" }} />) : (providerData.company_legal_name ?? "—")}
              </div>
              <div>{isEditingProvider ? (<input value={providerData.hq_address ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, hq_address: e.target.value }))} placeholder="Adresse" style={{ width: "100%", marginTop: 4 }} />) : (providerData.hq_address ?? "")}</div>
              <div>
                {isEditingProvider ? (<input value={providerData.hq_zip ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, hq_zip: e.target.value }))} placeholder="CP" style={{ width: "100%", marginTop: 4 }} />) : (providerData.hq_zip ?? "")} {isEditingProvider ? (<input value={providerData.hq_city ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, hq_city: e.target.value }))} placeholder="Ville" style={{ width: "100%", marginTop: 4 }} />) : (providerData.hq_city ?? "")}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
                {isEditingProvider ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <input value={providerData.phone ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Téléphone" />
                    <input value={providerData.contact_email ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, contact_email: e.target.value }))} placeholder="Email" />
                    <input value={providerData.siren ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, siren: e.target.value }))} placeholder="SIREN" />
                    <input value={providerData.vat_number ?? ""} onChange={(e) => setProviderOverride((prev) => ({ ...prev, vat_number: e.target.value }))} placeholder="TVA" />
                  </div>
                ) : (
                  <>
                    {providerData?.phone ? (<><div>Tél : {providerData.phone}</div></>) : null}
                    {providerData?.contact_email ? (<><div>Email : {providerData.contact_email}</div></>) : null}
                    {providerData?.siren ? (<><div>SIREN : {providerData.siren}</div></>) : null}
                    {providerData?.vat_number ? (<><div>TVA : {providerData.vat_number}</div></>) : null}
                  </>
                )}
              </div>
            </div>

            <div className={styles.previewPartyCard}>
              <div className={styles.previewPartyTitle}>Client</div>
              <div style={{ fontWeight: 600 }}>{clientName || "—"}</div>
              {clientSiren ? <div>SIREN : {clientSiren}</div> : null}
              {clientVatNumber ? <div>TVA : {clientVatNumber}</div> : null}
              <div>{billingFullAddress}</div>
              {!sameAddresses && deliveryAddress ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Adresse de livraison :</strong> {deliveryFullAddress}
                </div>
              ) : null}
              <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>
                {clientEmail || ""}
              </div>
            </div>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Désignation</th>
                <th style={{ width: 70 }}>Qté</th>
                <th style={{ width: 120 }}>PU HT</th>
                <th style={{ width: 90 }}>TVA</th>
                <th style={{ width: 120, textAlign: "right" }}>Total HT</th>
                <th
                  className={styles.printHiddenCell}
                  style={{ width: 0 }}
                ></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.id}>
                  <td>
                    <input
                      className={styles.printHidden}
                      value={l.label}
                      onChange={(e) =>
                        updateLine(l.id, { label: e.target.value })
                      }
                      placeholder="Ex: Réparation / entretien"
                      disabled={coreEditingLocked}
                      style={{
                        width: "100%",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }}
                    />
                    <span className={styles.printOnly}>{l.label || "—"}</span>
                  </td>
                  <td>
                    <input
                      className={styles.printHidden}
                      type="number"
                      value={l.qty}
                      onChange={(e) =>
                        updateLine(l.id, { qty: Number(e.target.value) })
                      }
                      disabled={coreEditingLocked}
                      style={{
                        width: 64,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }}
                    />
                    <span className={styles.printOnly}>{l.qty}</span>
                  </td>
                  <td>
                    <input
                      className={styles.printHidden}
                      type="number"
                      value={l.unitPrice}
                      onChange={(e) =>
                        updateLine(l.id, {
                          unitPrice: Number(e.target.value),
                        })
                      }
                      disabled={coreEditingLocked}
                      style={{
                        width: 110,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }}
                    />
                    <span className={styles.printOnly}>
                      {formatEuro(l.unitPrice)}
                    </span>
                  </td>
                  <td>
                    <select
                      className={styles.printHidden}
                      value={vatDispense ? 0 : l.vatRate}
                      disabled={vatDispense || coreEditingLocked}
                      onChange={(e) =>
                        updateLine(l.id, { vatRate: Number(e.target.value) })
                      }
                      style={{
                        width: 80,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }}
                    >
                      {VAT_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}%
                        </option>
                      ))}
                    </select>
                    <span className={styles.printOnly}>
                      {vatDispense ? 0 : l.vatRate}%
                    </span>
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatEuro(calcLineHT(l))}
                  </td>
                  <td
                    className={styles.printHiddenCell}
                    style={{ textAlign: "right" }}
                  >
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className={styles.removeLineBtn}
                        onClick={() => removeLine(l.id)}
                        title="Supprimer la ligne"
                        disabled={coreEditingLocked}
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={`${styles.previewAddLineWrap} ${styles.noPrint}`}>
            <button
              type="button"
              className={styles.previewAddLineBtn}
              onClick={addLine}
              disabled={coreEditingLocked}
            >
              + Ajouter une prestation
            </button>
          </div>
          {fieldErrors.lines ? (
            <div className={styles.fieldError} style={{ marginTop: 6 }}>
              {fieldErrors.lines}
            </div>
          ) : null}

          <div
            className={styles.previewPrintSpacer}
            aria-hidden="true"
            style={{
              height: `${getInvoicePrintFooterSpacerMm(lines.length)}mm`,
            }}
          />

          <div className={styles.previewFinalFooter}>
            <div
              className={styles.previewBottomGrid}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 280px",
                marginTop: 18,
                gap: 24,
              }}
            >
            <div style={{ fontSize: 12, color: "#444", lineHeight: 1.4 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Paiement :</strong> {paymentLabel}
                {paymentDetails ? <> — {paymentDetails}</> : null}
              </div>
              {operationCategory ? (
                <div style={{ marginBottom: 6 }}>
                  <strong>Catégorie :</strong> {operationCategoryLabel}
                </div>
              ) : null}
              {serviceDateMode === "single" && serviceDate ? (
                <div style={{ marginBottom: 6 }}>
                  <strong>Date de prestation / livraison :</strong>{" "}
                  {new Date(serviceDate).toLocaleDateString("fr-FR")}
                </div>
              ) : null}
              {serviceDateMode === "period" &&
              (servicePeriodStart || servicePeriodEnd) ? (
                <div style={{ marginBottom: 6 }}>
                  <strong>Période de prestation :</strong>{" "}
                  {servicePeriodStart
                    ? new Date(servicePeriodStart).toLocaleDateString("fr-FR")
                    : "—"}
                  {servicePeriodEnd
                    ? ` → ${new Date(servicePeriodEnd).toLocaleDateString("fr-FR")}`
                    : ""}
                </div>
              ) : null}
              {purchaseOrderReference ? (
                <div style={{ marginBottom: 6 }}>
                  <strong>Référence commande / PO :</strong>{" "}
                  {purchaseOrderReference}
                </div>
              ) : null}
              {depositKind && depositValue ? (
                <div style={{ marginBottom: 6 }}>
                  <strong>Acompte :</strong>{" "}
                  {depositKind === "amount"
                    ? `${depositValue} €`
                    : `${depositValue} %`}
                </div>
              ) : null}
              {vatOnDebits ? (
                <div style={{ marginBottom: 6 }}>
                  <strong>TVA sur les débits</strong>
                </div>
              ) : null}
              {lateFeeRate ? (
                <div style={{ marginBottom: 6 }}>
                  <strong>Pénalités de retard :</strong> {lateFeeRate} %
                </div>
              ) : null}
              {fixedRecoveryFee40 ? (
                <div style={{ marginBottom: 6 }}>
                  Indemnité forfaitaire de 40 € pour frais de recouvrement en
                  cas de retard de paiement.
                </div>
              ) : null}
              {vatDispense ? (
                <div>
                  <strong>TVA non applicable</strong> — Article 293 B du CGI.
                </div>
              ) : null}
              {notes ? <div style={{ marginTop: 8 }}>{notes}</div> : null}
              {invoiceMention ? (
                <div style={{ marginTop: 8 }}>{invoiceMention}</div>
              ) : null}
            </div>
            <div className={styles.previewTotalsBox}>
              <div style={{ marginBottom: 8 }} className={styles.noPrint}>
                <div style={{ fontWeight: 650, marginBottom: 6 }}>
                  Remise commerciale
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: 8,
                  }}
                >
                  <select
                    value={discountKind}
                    disabled={coreEditingLocked}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      setDiscountKind(v);
                      if (!v) {
                        setDiscountValue(0);
                        setDiscountDetails("");
                      }
                    }}
                    style={{
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#111",
                    }}
                  >
                    <option value="">Aucune</option>
                    <option value="percent">%</option>
                    <option value="amount">€</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountValue}
                    onChange={(e) =>
                      setDiscountValue(Number(e.target.value) || 0)
                    }
                    placeholder={
                      discountKind === "percent" ? "Ex: 10" : "Ex: 50"
                    }
                    disabled={!discountKind || coreEditingLocked}
                    style={{
                      width: "100%",
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#111",
                    }}
                  />
                  <textarea
                    value={discountDetails}
                    onChange={(e) => setDiscountDetails(e.target.value)}
                    placeholder="Détail de la remise (optionnel)"
                    disabled={!discountKind || coreEditingLocked}
                    rows={2}
                    style={{
                      gridColumn: "1 / -1",
                      width: "100%",
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#111",
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span>Total HT</span>
                <strong>{formatEuro(totals.totalHT)}</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span>TVA</span>
                <strong>{formatEuro(totals.totalTVA)}</strong>
              </div>
              <div
                className={styles.previewTotalsMain}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 10,
                  fontSize: 18,
                }}
              >
                <span>Total TTC</span>
                <strong>{formatEuro(totals.totalTTC)}</strong>
              </div>
              {totals.discountTTC > 0 ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  <span>Remise</span>
                  <strong>- {formatEuro(totals.discountTTC)}</strong>
                </div>
              ) : null}
              {discountDetails && totals.discountTTC > 0 ? (
                <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>
                  {discountDetails}
                </div>
              ) : null}
              {totals.discountTTC > 0 ? (
                <div
                  className={styles.previewTotalsMain}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                    fontSize: 18,
                  }}
                >
                  <span>Total à payer</span>
                  <strong>{formatEuro(totals.totalDue)}</strong>
                </div>
              ) : null}
              <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}>
                <strong>Statut :</strong> {status}
              </div>
            </div>
            </div>
          </div>

          <div className={styles.documentPrintPages} aria-hidden="true">
            {invoicePrintPages.map((page, pageIndex) => (
              <section
                key={`invoice-print-page-${pageIndex}`}
                className={styles.documentPrintPage}
              >
                {page.includeHeader ? (
                  <>
                    <div className={styles.previewHeader}>
                      <div>
                        <div className={styles.title}>{documentTitle}</div>
                        <div>{number || "—"}</div>
                        <div style={{ marginTop: 6, color: "#444" }}>
                          Date : {invoiceDate ? new Date(invoiceDate).toLocaleDateString("fr-FR") : "—"}
                          {dueDate ? <> · Échéance : {new Date(dueDate).toLocaleDateString("fr-FR")}</> : null}
                        </div>
                        {serviceDateMode === "single" && serviceDate ? (
                          <div style={{ marginTop: 4, color: "#444" }}>
                            Prestation / livraison : {new Date(serviceDate).toLocaleDateString("fr-FR")}
                          </div>
                        ) : null}
                        {serviceDateMode === "period" && (servicePeriodStart || servicePeriodEnd) ? (
                          <div style={{ marginTop: 4, color: "#444" }}>
                            Période : {servicePeriodStart ? new Date(servicePeriodStart).toLocaleDateString("fr-FR") : "—"}
                            {servicePeriodEnd ? ` → ${new Date(servicePeriodEnd).toLocaleDateString("fr-FR")}` : ""}
                          </div>
                        ) : null}
                      </div>
                      {profile?.logo_url ? (
                        <div className={styles.logoBox} aria-label="Logo">
                          <img src={profile.logo_url} alt="Logo" className={styles.logoImg} />
                        </div>
                      ) : null}
                    </div>

                    <div className={styles.previewParties}>
                      <div className={styles.previewPartyCard}>
                        <div className={styles.previewPartyTitle}>Prestataire</div>
                        <div style={{ fontWeight: 600 }}>{providerData.company_legal_name ?? "—"}</div>
                        <div>{providerData.hq_address ?? ""}</div>
                        <div>{providerData.hq_zip ?? ""} {providerData.hq_city ?? ""}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
                          {providerData?.phone ? <div>Tél : {providerData.phone}</div> : null}
                          {providerData?.contact_email ? <div>Email : {providerData.contact_email}</div> : null}
                          {providerData?.siren ? <div>SIREN : {providerData.siren}</div> : null}
                          {providerData?.vat_number ? <div>TVA : {providerData.vat_number}</div> : null}
                        </div>
                      </div>

                      <div className={styles.previewPartyCard}>
                        <div className={styles.previewPartyTitle}>Client</div>
                        <div style={{ fontWeight: 600 }}>{clientName || "—"}</div>
                        {clientSiren ? <div>SIREN : {clientSiren}</div> : null}
                        {clientVatNumber ? <div>TVA : {clientVatNumber}</div> : null}
                        <div>{billingFullAddress}</div>
                        {!sameAddresses && deliveryAddress ? (
                          <div style={{ marginTop: 6 }}><strong>Adresse de livraison :</strong> {deliveryFullAddress}</div>
                        ) : null}
                        <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>{clientEmail || ""}</div>
                      </div>
                    </div>
                  </>
                ) : page.lines.length ? (
                  <div className={styles.documentPrintContinuation}>Suite des prestations</div>
                ) : null}

                {page.lines.length ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Désignation</th>
                        <th style={{ width: 70 }}>Qté</th>
                        <th style={{ width: 120 }}>PU HT</th>
                        <th style={{ width: 90 }}>TVA</th>
                        <th style={{ width: 120, textAlign: "right" }}>Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.lines.map((l) => (
                        <tr key={`${pageIndex}-${l.id}`}>
                          <td>{l.label || "—"}</td>
                          <td>{l.qty}</td>
                          <td>{formatEuro(l.unitPrice)}</td>
                          <td>{vatDispense ? 0 : l.vatRate}%</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatEuro(calcLineHT(l))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {page.includeFooter ? (
                  <div className={styles.documentPrintFooter}>
                    <div className={styles.previewBottomGrid}>
                      <div style={{ fontSize: 12, color: "#444", lineHeight: 1.4 }}>
                        <div style={{ marginBottom: 8 }}><strong>Paiement :</strong> {paymentLabel}{paymentDetails ? <> — {paymentDetails}</> : null}</div>
                        {operationCategory ? <div style={{ marginBottom: 6 }}><strong>Catégorie :</strong> {operationCategoryLabel}</div> : null}
                        {serviceDateMode === "single" && serviceDate ? <div style={{ marginBottom: 6 }}><strong>Date de prestation / livraison :</strong> {new Date(serviceDate).toLocaleDateString("fr-FR")}</div> : null}
                        {serviceDateMode === "period" && (servicePeriodStart || servicePeriodEnd) ? <div style={{ marginBottom: 6 }}><strong>Période de prestation :</strong> {servicePeriodStart ? new Date(servicePeriodStart).toLocaleDateString("fr-FR") : "—"}{servicePeriodEnd ? ` → ${new Date(servicePeriodEnd).toLocaleDateString("fr-FR")}` : ""}</div> : null}
                        {purchaseOrderReference ? <div style={{ marginBottom: 6 }}><strong>Référence commande / PO :</strong> {purchaseOrderReference}</div> : null}
                        {depositKind && depositValue ? <div style={{ marginBottom: 6 }}><strong>Acompte :</strong> {depositKind === "amount" ? `${depositValue} €` : `${depositValue} %`}</div> : null}
                        {vatOnDebits ? <div style={{ marginBottom: 6 }}><strong>TVA sur les débits</strong></div> : null}
                        {lateFeeRate ? <div style={{ marginBottom: 6 }}><strong>Pénalités de retard :</strong> {lateFeeRate} %</div> : null}
                        {fixedRecoveryFee40 ? <div style={{ marginBottom: 6 }}>Indemnité forfaitaire de 40 € pour frais de recouvrement en cas de retard de paiement.</div> : null}
                        {vatDispense ? <div><strong>TVA non applicable</strong> — Article 293 B du CGI.</div> : null}
                        {notes ? <div style={{ marginTop: 8 }}>{notes}</div> : null}
                        {invoiceMention ? <div style={{ marginTop: 8 }}>{invoiceMention}</div> : null}
                      </div>
                      <div className={styles.previewTotalsBox}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span>Total HT</span><strong>{formatEuro(totals.totalHT)}</strong></div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span>TVA</span><strong>{formatEuro(totals.totalTVA)}</strong></div>
                        <div className={styles.previewTotalsMain} style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 18 }}><span>Total TTC</span><strong>{formatEuro(totals.totalTTC)}</strong></div>
                        {totals.discountTTC > 0 ? <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}><span>Remise</span><strong>- {formatEuro(totals.discountTTC)}</strong></div> : null}
                        {discountDetails && totals.discountTTC > 0 ? <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>{discountDetails}</div> : null}
                        {totals.discountTTC > 0 ? <div className={styles.previewTotalsMain} style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 18 }}><span>Total à payer</span><strong>{formatEuro(totals.totalDue)}</strong></div> : null}
                        <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}><strong>Statut :</strong> {status}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
