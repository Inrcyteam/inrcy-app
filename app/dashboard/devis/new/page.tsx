"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
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

function normalizeClientType(value: unknown): ClientType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "particulier" || normalized === "professionnel" || normalized === "institution") return normalized;
  return "";
}

type QuoteFieldErrors = {
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

function normalizeAddressPart(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
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

function buildFullCrmAddress(address?: string | null, postalCode?: string | null, city?: string | null) {
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


const VAT_OPTIONS = [0, 5.5, 10, 20];

const PAYMENT_METHODS = [
  { key: "", label: "—" },
  { key: "virement", label: "Virement bancaire" },
  { key: "cb", label: "Carte bancaire" },
  { key: "cheque", label: "Chèque" },
  { key: "especes", label: "Espèces" },
  { key: "abonnement", label: "Abonnement" },
] as const;

const OPERATION_CATEGORY_OPTIONS = [
  { key: "", label: "—" },
  { key: "vente", label: "Vente" },
  { key: "prestation", label: "Prestation de services" },
  { key: "mixte", label: "Vente + prestation" },
] as const;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeLabel(s: string) {
  // tri FR, sans casse/accents (stable)
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function contactDisplayName(c: CrmContact) {
  const label =
    (c.company_name && c.company_name.trim()) ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    (c.last_name || "").trim() ||
    "(Sans nom)";
  return label;
}

function contactSearchText(c: CrmContact) {
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

export default function NewDevisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [documentsSettings, setDocumentsSettings] = useState<InrDocumentsSettings>(DEFAULT_INRDOCUMENTS_SETTINGS);

  // Toujours arriver en haut du module (évite de récupérer le scroll du dashboard)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  }, []);


  // PDF → Supabase Storage (PJ iNrbox)
  const ATTACH_BUCKET = "inrbox_attachments";
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const vatDispense = !!profile?.vat_dispense;

  // IMPORTANT: stable SSR/CSR
  const [number, setNumber] = useState<string>("");
  const [docDateISO, setDocDateISO] = useState<string>(""); // pour affichage stable

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
  const [operationCategory, setOperationCategory] = useState<(typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]>("");
  const [serviceDate, setServiceDate] = useState("");
  const [servicePeriodStart, setServicePeriodStart] = useState("");
  const [servicePeriodEnd, setServicePeriodEnd] = useState("");
  const [purchaseOrderReference, setPurchaseOrderReference] = useState("");
  const [depositKind, setDepositKind] = useState<"" | "percent" | "amount">("");
  const [depositValue, setDepositValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]["key"]>("");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [quoteMention, setQuoteMention] = useState("");

  const billingFullAddress = buildFullCrmAddress(billingAddress, billingPostalCode, billingCity);
  const deliveryFullAddress = buildFullCrmAddress(deliveryAddress, deliveryPostalCode, deliveryCity);

  const setPrimaryClientAddress = (value: string) => {
    const parsed = splitFrenchAddress(value);
    setBillingAddress(parsed.address);
    setBillingPostalCode(parsed.postal_code);
    setBillingCity(parsed.city);
    setClientAddress(buildFullCrmAddress(parsed.address, parsed.postal_code, parsed.city));
    if (sameAddresses) {
      setDeliveryAddress(parsed.address);
      setDeliveryPostalCode(parsed.postal_code);
      setDeliveryCity(parsed.city);
    }
  };

  useEffect(() => {
    const full = buildFullCrmAddress(billingAddress, billingPostalCode, billingCity);
    setClientAddress(full);
    if (!sameAddresses) return;
    setDeliveryAddress(billingAddress);
    setDeliveryPostalCode(billingPostalCode);
    setDeliveryCity(billingCity);
  }, [sameAddresses, billingAddress, billingPostalCode, billingCity]);

  // --- Remise commerciale (appliquée sur le total TTC)
  const [discountKind, setDiscountKind] = useState<DiscountKind | "">("");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountDetails, setDiscountDetails] = useState<string>("" );

  // --- CRM: import d'un contact pour pré-remplir automatiquement
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [selectedCrmContactId, setSelectedCrmContactId] = useState<string>("");
  const [formMessage, setFormMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [crmActionMessage, setCrmActionMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<QuoteFieldErrors>({});
  const [addingToCrm, setAddingToCrm] = useState(false);
  const [currentSaveId, setCurrentSaveId] = useState<string>("");

  // UI dropdown custom (style "select blanc", 10 items visibles + scroll)
  const [crmOpen, setCrmOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [crmQuery, setCrmQuery] = useState("");
  const crmBoxRef = useRef<HTMLDivElement | null>(null);

  // ✅ Pré-remplissage depuis CRM / iNrBox
  useEffect(() => {
    const name = searchParams.get("clientName") || searchParams.get("name") || "";
    const email = searchParams.get("clientEmail") || searchParams.get("email") || "";
    const address = searchParams.get("clientAddress") || searchParams.get("address") || "";
    const siren = searchParams.get("clientSiren") || "";
    const vatNumber = searchParams.get("clientVatNumber") || "";
    const billing = searchParams.get("billingAddress") || "";
    const billingPostal = searchParams.get("billingPostalCode") || searchParams.get("postal_code") || "";
    const billingCityParam = searchParams.get("billingCity") || searchParams.get("city") || "";
    const delivery = searchParams.get("deliveryAddress") || "";
    if (name) setClientName((prev) => prev || name);
    if (email) setClientEmail((prev) => prev || email);
    if (siren) setClientSiren((prev) => prev || siren);
    if (vatNumber) setClientVatNumber((prev) => prev || vatNumber);
    if (address) {
      setClientAddress((prev) => prev || address);
      const parsed = splitFrenchAddress(billing || address);
      setBillingAddress((prev) => prev || parsed.address);
      setBillingPostalCode((prev) => prev || billingPostal || parsed.postal_code);
      setBillingCity((prev) => prev || billingCityParam || parsed.city);
      const parsedDelivery = splitFrenchAddress(delivery || billing || address);
      setDeliveryAddress((prev) => prev || parsedDelivery.address);
      setDeliveryPostalCode((prev) => prev || billingPostal || parsedDelivery.postal_code);
      setDeliveryCity((prev) => prev || billingCityParam || parsedDelivery.city);
    } else {
      if (billing) {
        const parsed = splitFrenchAddress(billing);
        setBillingAddress((prev) => prev || parsed.address);
        setBillingPostalCode((prev) => prev || billingPostal || parsed.postal_code);
        setBillingCity((prev) => prev || billingCityParam || parsed.city);
      }
      if (delivery) {
        const parsedDelivery = splitFrenchAddress(delivery);
        setDeliveryAddress((prev) => prev || parsedDelivery.address);
        setDeliveryPostalCode((prev) => prev || billingPostal || parsedDelivery.postal_code);
        setDeliveryCity((prev) => prev || billingCityParam || parsedDelivery.city);
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
          throw new Error(getSimpleFrenchErrorMessage(json?.error, "Impossible de charger les contacts CRM."));
        }

        const contacts: CrmContact[] = Array.isArray(json?.contacts) ? json.contacts : [];
        if (!cancelled) setCrmContacts(contacts);
      } catch (e: any) {
        if (!cancelled) setCrmError(getSimpleFrenchErrorMessage(e, "Impossible de charger les contacts CRM."));
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
    const displayName = contactDisplayName(c);

    const billingParsed = splitFrenchAddress(c.billing_address || c.address || "");
    const deliveryParsed = splitFrenchAddress(c.delivery_address || c.address || "");
    const nextBillingPostal = normalizeAddressPart(c.postal_code) || billingParsed.postal_code;
    const nextBillingCity = normalizeAddressPart(c.city) || billingParsed.city;
    const fullAddress = buildFullCrmAddress(billingParsed.address, nextBillingPostal, nextBillingCity);
    const fullDeliveryAddress = buildFullCrmAddress(deliveryParsed.address, nextBillingPostal, nextBillingCity);

    setClientName(displayName);
    setClientEmail((c.email || "").trim());
    setClientSiren((c.siret || "").trim());
    setClientVatNumber((c.vat_number || "").trim());
    setClientType(normalizeClientType(c.category) || ((c.siret || c.company_name) ? "professionnel" : "particulier"));
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

  const sortedCrmContacts = useMemo(() => {
    const arr = [...crmContacts];
    arr.sort((a, b) => {
      const aKey = normalizeLabel(contactDisplayName(a));
      const bKey = normalizeLabel(contactDisplayName(b));
      return aKey.localeCompare(bKey, "fr", { sensitivity: "base" });
    });
    return arr;
  }, [crmContacts]);

  const filteredCrmContacts = useMemo(() => {
    const query = normalizeLabel(crmQuery);
    if (!query) return sortedCrmContacts;
    return sortedCrmContacts.filter((contact) => normalizeLabel(contactSearchText(contact)).includes(query));
  }, [crmQuery, sortedCrmContacts]);

  const selectedCrmContact = useMemo(() => {
    if (!selectedCrmContactId) return null;
    return sortedCrmContacts.find((x) => String(x.id) === String(selectedCrmContactId)) || null;
  }, [selectedCrmContactId, sortedCrmContacts]);

  // fermer le dropdown au clic extérieur
  useEffect(() => {
    if (!crmOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = crmBoxRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setCrmOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [crmOpen]);

  const clearCrmSelection = () => {
    setSelectedCrmContactId("");
    setCrmQuery("");
    setCrmOpen(false);
  };

  const selectCrmContact = (c: CrmContact) => {
    setSelectedCrmContactId(String(c.id));
    applyCrmContact(c);
    setFieldErrors((prev) => ({ ...prev, clientType: undefined, clientName: undefined, billingAddress: undefined, billingPostalCode: undefined, billingCity: undefined, clientEmail: undefined, clientSiren: undefined }));
    setCrmQuery("");
    setCrmOpen(false);
  };

  const [validityDays, setValidityDays] = useState<number>(30);

  // Orientation: gérée globalement via <OrientationGuard />

  // IMPORTANT: id stable au 1er render
  const [lines, setLines] = useState<LineItem[]>([
    { id: "l_1", label: "Prestation", qty: 1, unitPrice: 100, vatRate: 20 },
  ]);

  const applyDocumentDefaults = (settings: InrDocumentsSettings) => {
    setOperationCategory(settings.common.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]);
    setDepositKind(settings.common.depositKind);
    setDepositValue(settings.common.depositKind ? settings.common.depositValue : "");
    setPaymentMethod(settings.common.paymentMethod as (typeof PAYMENT_METHODS)[number]["key"]);
    setPaymentDetails(settings.common.paymentDetails);
    setNotes(settings.common.notes);
    setQuoteMention(settings.quote.mention);
    setValidityDays(settings.quote.validityDays);
    setLines([makeDefaultLine(settings, vatDispense)]);
  };

  useEffect(() => {
    let cancelled = false;
    const shouldApplyDefaults = !(searchParams.get("saveId") || searchParams.get("docSaveId"));

    const loadSettings = async (applyDefaults: boolean) => {
      const response = await fetch("/api/documents/settings", { cache: "no-store" });
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
      window.removeEventListener(INRDOCUMENTS_SETTINGS_UPDATED_EVENT, onUpdated);
    };
  }, [searchParams]);

  useEffect(() => {
    setNumber(generateNumber("DEV"));
    setDocDateISO(new Date().toISOString().slice(0, 10));
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
          "user_id,company_legal_name,hq_address,hq_zip,hq_city,contact_email,phone,siren,rcs_city,vat_number,vat_dispense,logo_url,logo_path"
        )
        .eq("user_id", user.id)
        .single();

      const resolvedLogo = await resolveProfileLogoUrl(supabase, {
        logo_path: data?.logo_path ?? null,
        logo_url: data?.logo_url ?? null,
      });

      setProfile(data ? ({ ...(data as Profile), logo_url: resolvedLogo.logoUrl, logo_path: resolvedLogo.logoPath } as Profile) : null);
    };
    load();
  }, [supabase]);

  const totals = useMemo(
    () =>
      calcTotalsWithDiscount(
        lines,
        vatDispense,
        discountKind ? (discountKind as DiscountKind) : null,
        discountValue
      ),
    [lines, vatDispense, discountKind, discountValue]
  );

  // --- Sauvegardes (brouillons locaux)
  type DevisDraft = {
    id: string;
    updatedAtISO: string;
    name?: string | null;
    snapshot: {
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
  clientType?: ClientType;
  vatDispense?: boolean;
  operationCategory?: (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"];
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
  status?: DocRecord["status"];
  isFinalized?: boolean;
  finalizedAt?: string | null;
  lockedAt?: string | null;
  isTemplate?: boolean;
  templateName?: string | null;
};
  };

  const SAVES_TYPE = "devis" as const;
  type DocumentsTab = "saves" | "templates";

  const [draftsOpen, setDraftsOpen] = useState(false);
  const [documentsTab, setDocumentsTab] = useState<DocumentsTab>("saves");
  const [drafts, setDrafts] = useState<DevisDraft[]>([]);
  const [templates, setTemplates] = useState<DevisDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState<string>("");
  const [finalizing, setFinalizing] = useState(false);

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

      const mapped: DevisDraft[] = (data ?? []).map((row: any) => ({
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


  useEffect(() => {
    const saveId = searchParams.get("saveId") || searchParams.get("docSaveId") || "";
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
        if (!cancelled) setFormMessage({ type: "error", text: "Impossible de réouvrir ce devis." });
        return;
      }

      if (!data?.payload) {
        if (!cancelled) setFormMessage({ type: "error", text: "Devis introuvable." });
        return;
      }

      if (!cancelled) {
        applyDraftSnapshot(data.payload as DevisDraft["snapshot"]);
        setCurrentSaveId(data.id);
        setFormMessage({ type: "success", text: "Devis réouvert depuis iNrSend." });
      }
    };

    void loadRequestedSave();

    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase]);

  const addLine = () => {
    clearFieldError("lines");
    setLines((prev) => [
      ...prev,
      {
        id: uid("l"), // OK: action utilisateur
        label: "",
        qty: 1,
        unitPrice: 0,
        vatRate: vatDispense ? 0 : 20,
      },
    ]);
  };

  const removeLine = (id: string) => {
    clearFieldError("lines");
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    clearFieldError("lines");
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const clearFieldError = (field: keyof QuoteFieldErrors) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const validateQuoteAction = (options?: { requireEmail?: boolean }) => {
    const nextErrors: QuoteFieldErrors = {};
    const requireEmail = !!options?.requireEmail;
    const hasValidLine = lines.some((line) => (line.label || "").trim() && Number(line.qty) > 0 && Number(line.unitPrice) >= 0);

    if (!clientType) nextErrors.clientType = "Type de client obligatoire.";
    if (!(clientName || "").trim()) nextErrors.clientName = "Nom client obligatoire.";
    if (!billingAddress.trim()) nextErrors.billingAddress = "Adresse obligatoire.";
    if (!billingPostalCode.trim()) nextErrors.billingPostalCode = "Code postal obligatoire.";
    if (!billingCity.trim()) nextErrors.billingCity = "Ville obligatoire.";
    if (clientType && clientType !== "particulier" && !(clientSiren || "").trim()) nextErrors.clientSiren = "SIREN client obligatoire pour ce type de client.";
    if (!(number || "").trim()) nextErrors.number = "Numéro de devis obligatoire.";
    if (!(docDateISO || "").trim()) nextErrors.docDateISO = "Date du devis obligatoire.";
    if (!Number(validityDays) || Number(validityDays) < 1) {
      nextErrors.validityDays = "Durée de validité obligatoire.";
      setAdvancedOpen(true);
    }
    if (!hasValidLine) nextErrors.lines = "Ajoutez au moins une prestation valide (libellé, quantité et prix HT).";

    const normalizedEmail = (clientEmail || "").trim();
    if (requireEmail) {
      if (!normalizedEmail) nextErrors.clientEmail = "Email client obligatoire pour envoyer par mail.";
      else if (!isValidEmail(normalizedEmail)) nextErrors.clientEmail = "Email client invalide.";
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

  const saveDraft = async (options?: { silent?: boolean; asFinalized?: boolean; targetStatus?: DocRecord["status"] }) => {
    const nowISO = new Date().toISOString();
    const nextFinalizedAt = options?.asFinalized ? (finalizedAt || nowISO) : finalizedAt;
    const finalNumber = number || generateNumber("DEV");
    if (!number) setNumber(finalNumber);

    const normalizedEmail = (clientEmail || "").trim();
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      setFieldErrors((prev) => ({ ...prev, clientEmail: "Email client invalide." }));
      setFormMessage(null);
      return null;
    }

   const normalizedBillingAddress = buildFullCrmAddress(billingAddress, billingPostalCode, billingCity);
   const normalizedDeliveryAddress = sameAddresses ? normalizedBillingAddress : buildFullCrmAddress(deliveryAddress, deliveryPostalCode, deliveryCity);

   const snapshot: DevisDraft["snapshot"] = {
  number: finalNumber,
  docDateISO: docDateISO || new Date().toISOString().slice(0, 10),
  clientName,
  clientAddress: normalizedBillingAddress,
  billingAddress: billingAddress.trim(),
  billingPostalCode: billingPostalCode.trim(),
  billingCity: billingCity.trim(),
  deliveryAddress: sameAddresses ? billingAddress.trim() : deliveryAddress.trim(),
  deliveryPostalCode: sameAddresses ? billingPostalCode.trim() : deliveryPostalCode.trim(),
  deliveryCity: sameAddresses ? billingCity.trim() : deliveryCity.trim(),
  sameAddresses,
  clientEmail,
  clientSiren,
  clientVatNumber,
  clientType,
  vatDispense,
  operationCategory,
  serviceDate,
  servicePeriodStart,
  servicePeriodEnd,
  purchaseOrderReference,
  depositKind,
  depositValue,
  paymentMethod,
  paymentDetails,
  notes,
  quoteMention,
  validityDays,
  lines,
  discountKind,
  discountValue: Number(discountValue) || 0,
  discountDetails,
  status: options?.targetStatus || (isFinalized ? "envoye" : "brouillon"),
  isFinalized: options?.asFinalized ? true : isFinalized,
  finalizedAt: options?.asFinalized ? nextFinalizedAt : (finalizedAt || null),
  lockedAt: options?.asFinalized ? nextFinalizedAt : (finalizedAt || null),
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
      setFormMessage({ type: "error", text: "Impossible d’enregistrer ce devis pour le moment." });
      return;
    }

    const savedId = (savedRows?.[0] as { id?: string } | undefined)?.id || currentSaveId;
    if (savedId) setCurrentSaveId(savedId);
    if (options?.asFinalized) {
      setIsFinalized(true);
      setFinalizedAt(nextFinalizedAt);
    }

    await refreshSaves();
    if (!options?.silent) {
      setDocumentsTab("saves");
      setDraftsOpen(true);
      setFormMessage({ type: "success", text: currentSaveId ? "Devis mis à jour." : "Devis enregistré." });
    }

    return savedId as string | undefined;
  };

  const applyDraftSnapshot = (s: DevisDraft["snapshot"]) => {
    const legacyBilling = splitFrenchAddress(s.billingAddress || s.clientAddress || "");
    const nextBillingAddress = legacyBilling.address;
    const nextBillingPostalCode = (s as any).billingPostalCode || legacyBilling.postal_code;
    const nextBillingCity = (s as any).billingCity || legacyBilling.city;
    const nextBillingFullAddress = buildFullCrmAddress(nextBillingAddress, nextBillingPostalCode, nextBillingCity);
    const legacyDelivery = splitFrenchAddress(s.deliveryAddress || nextBillingFullAddress);
    const nextSameAddresses = typeof s.sameAddresses === "boolean"
      ? s.sameAddresses
      : !s.deliveryAddress || buildFullCrmAddress(legacyDelivery.address, (s as any).deliveryPostalCode || legacyDelivery.postal_code, (s as any).deliveryCity || legacyDelivery.city) === nextBillingFullAddress;
    const nextDeliveryAddress = nextSameAddresses ? nextBillingAddress : legacyDelivery.address;
    const nextDeliveryPostalCode = nextSameAddresses ? nextBillingPostalCode : ((s as any).deliveryPostalCode || legacyDelivery.postal_code);
    const nextDeliveryCity = nextSameAddresses ? nextBillingCity : ((s as any).deliveryCity || legacyDelivery.city);

    setNumber(s.number);
    setDocDateISO(s.docDateISO);
    setClientName(s.clientName);
    setClientAddress(nextBillingFullAddress);
    setBillingAddress(nextBillingAddress);
    setBillingPostalCode(nextBillingPostalCode);
    setBillingCity(nextBillingCity);
    setDeliveryAddress(nextDeliveryAddress);
    setDeliveryPostalCode(nextDeliveryPostalCode);
    setDeliveryCity(nextDeliveryCity);
    setSameAddresses(nextSameAddresses);
    setClientEmail(s.clientEmail);
    setClientSiren(s.clientSiren || "");
    setClientVatNumber(s.clientVatNumber || "");
    setClientType(normalizeClientType((s as any).clientType));
    setOperationCategory((s.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]) || "");
    setServiceDate(s.serviceDate || "");
    setServicePeriodStart(s.servicePeriodStart || "");
    setServicePeriodEnd(s.servicePeriodEnd || "");
    setPurchaseOrderReference(s.purchaseOrderReference || "");
    setDepositKind((s.depositKind as "" | "percent" | "amount") || "");
    setDepositValue(s.depositValue || "");
    setPaymentMethod((s.paymentMethod as (typeof PAYMENT_METHODS)[number]["key"]) || "");
    setPaymentDetails(s.paymentDetails || "");
    setNotes(s.notes || "");
    setQuoteMention(s.quoteMention || documentsSettings.quote.mention || "");
    setValidityDays(s.validityDays);
    setLines(s.lines);
    setDiscountKind(s.discountKind);
    setDiscountValue(s.discountValue);
    setDiscountDetails(s.discountDetails || "");
    setIsFinalized(!!s.isFinalized);
    setFinalizedAt(typeof s.finalizedAt === "string" ? s.finalizedAt : "");
  };

  const convertCurrentDevisToInvoice = async () => {
    const devisSaveId = await saveDraft({ silent: true });
    if (!devisSaveId) {
      setFormMessage({ type: "error", text: "Impossible de préparer ce devis pour la conversion." });
      return;
    }

    router.push(`/dashboard/factures/new?fromDevisSaveId=${encodeURIComponent(devisSaveId)}`);
  };

  const openDraft = (d: DevisDraft) => {
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

  const saveAsTemplate = async () => {
    const hasValidLine = lines.some((line) => (line.label || "").trim() && Number(line.qty) > 0 && Number(line.unitPrice) >= 0);
    if (!hasValidLine) {
      setFieldErrors((prev) => ({ ...prev, lines: "Ajoutez au moins une prestation valide avant d’enregistrer un modèle." }));
      setFormMessage(null);
      return;
    }

    const templateName = window.prompt("Nom du modèle", "Modèle devis");
    if (templateName === null) return;

    const cleanName = templateName.trim() || "Modèle devis";
    const nowISO = new Date().toISOString();
    const snapshot: DevisDraft["snapshot"] = {
      number: "",
      docDateISO: "",
      clientName: "",
      clientAddress: "",
      billingAddress: "",
      billingPostalCode: "",
      billingCity: "",
      deliveryAddress: "",
      deliveryPostalCode: "",
      deliveryCity: "",
      sameAddresses: true,
      clientEmail: "",
      clientSiren: "",
      clientVatNumber: "",
      clientType: "",
      vatDispense,
      operationCategory,
      serviceDate,
      servicePeriodStart,
      servicePeriodEnd,
      purchaseOrderReference,
      depositKind,
      depositValue,
      paymentMethod,
      paymentDetails,
      notes,
      quoteMention,
      validityDays,
      lines: lines.map((line) => ({ ...line, id: uid("l") })),
      discountKind,
      discountValue: Number(discountValue) || 0,
      discountDetails,
      status: "brouillon",
      isFinalized: false,
      finalizedAt: null,
      lockedAt: null,
      isTemplate: true,
      templateName: cleanName,
    };

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
      setFormMessage({ type: "error", text: "Impossible d’enregistrer ce modèle pour le moment." });
      return;
    }

    await refreshSaves();
    setDocumentsTab("templates");
    setDraftsOpen(true);
    setFormMessage({ type: "success", text: "Modèle de devis enregistré." });
  };

  const applyTemplateSnapshot = (s: DevisDraft["snapshot"]) => {
    setCurrentSaveId("");
    setIsFinalized(false);
    setFinalizedAt("");
    setNumber(generateNumber("DEV"));
    setDocDateISO(new Date().toISOString().slice(0, 10));

    setOperationCategory((s.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]) || (documentsSettings.common.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]));
    setServiceDate(s.serviceDate || "");
    setServicePeriodStart(s.servicePeriodStart || "");
    setServicePeriodEnd(s.servicePeriodEnd || "");
    setPurchaseOrderReference(s.purchaseOrderReference || "");
    setDepositKind((s.depositKind as "" | "percent" | "amount") || documentsSettings.common.depositKind);
    setDepositValue(s.depositValue || (documentsSettings.common.depositKind ? documentsSettings.common.depositValue : ""));
    setPaymentMethod(((s.paymentMethod as (typeof PAYMENT_METHODS)[number]["key"]) || documentsSettings.common.paymentMethod) as (typeof PAYMENT_METHODS)[number]["key"]);
    setPaymentDetails(s.paymentDetails || documentsSettings.common.paymentDetails);
    setNotes(s.notes || documentsSettings.common.notes);
    setQuoteMention(s.quoteMention || documentsSettings.quote.mention);
    setValidityDays(Number(s.validityDays) || documentsSettings.quote.validityDays);
    setLines(Array.isArray(s.lines) && s.lines.length ? s.lines.map((line) => ({ ...line, id: uid("l") })) : [makeDefaultLine(documentsSettings, vatDispense)]);
    setDiscountKind(s.discountKind || "");
    setDiscountValue(Number(s.discountValue) || 0);
    setDiscountDetails(s.discountDetails || "");
    setFieldErrors({});
    setDraftsOpen(false);
    setFormMessage({ type: "success", text: "Modèle appliqué. Ajoutez ou vérifiez le client avant l’envoi." });
  };

  const print = () => window.print();

  const buildPdfBlob = async (): Promise<Blob | null> => {
    if (typeof window === "undefined") return null;
    const el = previewRef.current;
    if (!el) return null;

    const hiddenSelector = [styles.noPrint, styles.printHidden, styles.printHiddenCell]
      .filter(Boolean)
      .map((className) => `.${className}`)
      .join(", ");
    const hiddenEls = hiddenSelector ? (Array.from(el.querySelectorAll(hiddenSelector)) as HTMLElement[]) : [];
    const printOnlyEls = Array.from(el.querySelectorAll(`.${styles.printOnly}`)) as HTMLElement[];
    const previousHiddenDisplay = hiddenEls.map((node) => node.style.display);
    const previousPrintOnlyDisplay = printOnlyEls.map((node) => node.style.display);

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

  const uploadPdfAndOpenCompose = async (to: string, filename: string) => {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      setFormMessage({ type: "error", text: "Vous devez être connecté pour envoyer par mail." });
      return;
    }

    setFinalizing(true);
    const docSaveId = await saveDraft({ silent: true, asFinalized: true, targetStatus: "envoye" });
    if (!docSaveId) {
      setFinalizing(false);
      setFormMessage({ type: "error", text: "Veuillez d’abord sauvegarder ce devis avant l’envoi." });
      return;
    }

    const pdfBlob = await buildPdfBlob();
    if (!pdfBlob) {
      setFinalizing(false);
      setFormMessage({ type: "error", text: "Impossible de générer le PDF de ce devis pour le moment." });
      return;
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${user.id}/devis/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(ATTACH_BUCKET)
      .upload(key, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      console.error(upErr);
      setFinalizing(false);
      setFormMessage({ type: "error", text: "Impossible de préparer ce devis pour l’envoi." });
      return;
    }

    const params = new URLSearchParams();
    params.set("compose", "1");
    params.set("to", to);
    params.set("attachKey", key);
    params.set("attachName", safeName);
    if (clientName?.trim()) params.set("clientName", clientName.trim());
    params.set("type", "devis");
    params.set("docSaveId", docSaveId);
    params.set("docType", "devis");
    params.set("docNumber", number || safeName.replace(/\.pdf$/i, ""));
    router.push(`/dashboard/mails?${params.toString()}`);
    setFinalizing(false);
  };

  const addCurrentClientToCrm = async () => {
    const displayName = (clientName || "").trim();
    const email = (clientEmail || "").trim();
    const primaryAddress = buildFullCrmAddress(billingAddress, billingPostalCode, billingCity).trim();

    setFormMessage(null);
    setCrmActionMessage(null);

    if (!displayName && !email && !primaryAddress) {
      setCrmActionMessage({ type: "error", text: "Renseignez au moins un nom, un email ou une adresse client." });
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
          notes: [`Ajouté depuis Devis`, purchaseOrderReference ? `PO: ${purchaseOrderReference}` : ""].filter(Boolean).join(" — "),
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getSimpleFrenchErrorMessage(json?.error, "Impossible d’ajouter ce client au CRM."));
      }

      setCrmActionMessage({ type: "success", text: "Client ajouté au CRM." });
    } catch (error) {
      setCrmActionMessage({ type: "error", text: getSimpleFrenchErrorMessage(error, "Impossible d’ajouter ce client au CRM.") });
    } finally {
      setAddingToCrm(false);
    }
  };

  const crmButtonText = useMemo(() => {
    if (crmLoading) return "Chargement...";
    if (selectedCrmContact) {
      const name = contactDisplayName(selectedCrmContact);
      return selectedCrmContact.email ? `${name} — ${selectedCrmContact.email}` : name;
    }
    return "Importer / Rechercher un contact CRM";
  }, [crmLoading, selectedCrmContact]);

  const paymentLabel = useMemo(() => {
    return PAYMENT_METHODS.find((method) => method.key === paymentMethod)?.label || "—";
  }, [paymentMethod]);

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
  ].filter(Boolean).join(" ");

  return (
    <div className={`${dash.page} ${styles.editorPage}`}>
      <div className={styles.container}>
        {/* Formulaire */}
        <div className={styles.panel}>
          <div className={styles.panelToolbar}>
            <h1 className={styles.titleBadge}>Créer un devis</h1>
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
              onClick={() => {
                // CRM
                setSelectedCrmContactId("");
                setCrmOpen(false);
                setFieldErrors({});
                setFormMessage(null);

                // Client
                setClientName("");
                setClientEmail("");
                setClientSiren("");
                setClientVatNumber("");
                setClientType("");
                setClientAddress("");
                setBillingAddress("");
                setDeliveryAddress("");
                setSameAddresses(true);
                setOperationCategory(documentsSettings.common.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]);
                setServiceDate("");
                setServicePeriodStart("");
                setServicePeriodEnd("");
                setPurchaseOrderReference("");
                setDepositKind(documentsSettings.common.depositKind);
                setDepositValue(documentsSettings.common.depositKind ? documentsSettings.common.depositValue : "");

                // Devis
                setCurrentSaveId("");
                setIsFinalized(false);
                setFinalizedAt("");
                setNumber(generateNumber("DEV"));
                setDocDateISO(new Date().toISOString().slice(0, 10));
                setValidityDays(documentsSettings.quote.validityDays);

                setDiscountKind("");
                setDiscountValue(0);
                setDiscountDetails("");

                // Lignes
                setLines([makeDefaultLine(documentsSettings, vatDispense)]);
              }}
            >
              Réinitialiser
            </button>
            <button
              type="button"
              className={`${styles.closeBtn} ${styles.toolbarBtn} ${styles.switchBtnFactures}`}
              onClick={() => router.push("/dashboard/factures/new")}
            >
              Factures
            </button>
            <button
              type="button"
              className={`${styles.closeBtn} ${styles.toolbarBtn}`}
              onClick={() => setSettingsOpen(true)}
            >
              Réglages
            </button>
            <button type="button" className={`${styles.closeBtn} ${styles.toolbarBtn}`} onClick={() => router.push("/dashboard")}>
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
              Devis figé <strong>{number || "—"}</strong>
              {finalizedAt ? <> · figé le {new Date(finalizedAt).toLocaleString("fr-FR")}</> : null}
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
                padding: "clamp(12px, 4vh, 32px) 18px",
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
                  background: "#0b1220",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 16,
                  padding: 0,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", position: "sticky", top: 0, zIndex: 2, padding: "14px 14px 10px", background: "#0b1220", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontWeight: 750, fontSize: 16 }}>Documents</div>
                  <button type="button" className={styles.closeBtn} onClick={() => setDraftsOpen(false)}>
                    Fermer
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: "#0b1220", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 52, zIndex: 2 }}>
                  <button type="button" className={documentsTab === "saves" ? styles.primaryBtn : styles.ghostBtn} onClick={() => setDocumentsTab("saves")}>
                    Sauvegardes
                  </button>
                  <button type="button" className={documentsTab === "templates" ? styles.primaryBtn : styles.ghostBtn} onClick={() => setDocumentsTab("templates")}>
                    Modèles
                  </button>
                </div>

                {documentsTab === "saves" ? (
                  drafts.length === 0 ? (
                    <div style={{ padding: 14, opacity: 0.85 }}>Aucune sauvegarde pour l’instant.</div>
                  ) : (
                    <div
                      style={{
                        padding: 14,
                        display: "grid",
                        gap: 8,
                        maxHeight: drafts.length > 10 ? "62vh" : undefined,
                        overflowY: drafts.length > 10 ? "auto" : undefined,
                        paddingRight: drafts.length > 10 ? 8 : 14,
                      }}
                    >
                      {drafts.map((d) => {
                        const s = d.snapshot;
                        const label = `${s.number || "(sans numéro)"} — ${s.clientName || "Client"}`;
                        return (
                          <div
                            key={d.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "10px 12px",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 12,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {label}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.8 }}>
                                Sauvegardé le {new Date(d.updatedAtISO).toLocaleString("fr-FR")}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <button type="button" onClick={() => openDraft(d)}>
                                Ouvrir
                              </button>
                              <button type="button" onClick={() => router.push(`/dashboard/factures/new?fromDevisSaveId=${encodeURIComponent(d.id)}`)}>
                                → Facture
                              </button>
                              <button type="button" onClick={() => deleteDraft(d.id)}>
                                Supprimer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : templates.length === 0 ? (
                  <div style={{ padding: 14, opacity: 0.85 }}>Aucun modèle de devis pour l’instant.</div>
                ) : (
                  <div
                    style={{
                      padding: 14,
                      display: "grid",
                      gap: 8,
                      maxHeight: templates.length > 10 ? "62vh" : undefined,
                      overflowY: templates.length > 10 ? "auto" : undefined,
                      paddingRight: templates.length > 10 ? 8 : 14,
                    }}
                  >
                    {templates.map((d) => {
                      const label = d.snapshot.templateName || d.name || "Modèle devis";
                      return (
                        <div
                          key={d.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 12,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Modèle enregistré le {new Date(d.updatedAtISO).toLocaleString("fr-FR")}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => applyTemplateSnapshot(d.snapshot)}>
                              Utiliser
                            </button>
                            <button type="button" onClick={() => deleteDraft(d.id)}>
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
                <div className={styles.formBlockTitleRow}><span className={styles.formBlockIcon} aria-hidden="true">👤</span><div className={styles.formBlockTitle}>Infos contact</div></div>
                <div className={styles.formBlockSubtitle}>Import CRM, coordonnées et adresse du client.</div>
              </div>
            </div>

          <div className={styles.crmActionBar} ref={crmBoxRef}>
            <div className={styles.crmActionMain}>
              <span className={styles.crmActionLabel}>Importer un contact</span>
              <button
                type="button"
                className={styles.crmImportButton}
                onClick={() => setCrmOpen((v) => !v)}
                disabled={crmLoading}
                aria-haspopup="listbox"
                aria-expanded={crmOpen}
              >
                <span className={styles.crmImportButtonText} title={crmButtonText}>{crmButtonText}</span>
                <span aria-hidden="true">▾</span>
              </button>

              {crmOpen ? (
                <div className={styles.crmSearchPanel} role="dialog" aria-label="Importer ou rechercher un contact CRM">
                  <input
                    className={styles.crmSearchInput}
                    type="search"
                    value={crmQuery}
                    onChange={(e) => setCrmQuery(e.target.value)}
                    placeholder="Rechercher un contact, email, téléphone..."
                    autoFocus
                  />
                  <div className={styles.crmSearchResults} role="listbox">
                    {filteredCrmContacts.length ? filteredCrmContacts.map((c) => {
                      const name = contactDisplayName(c);
                      const line = c.email ? `${name} — ${c.email}` : name;
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
                    }) : (
                      <div className={styles.crmSearchEmpty}>Aucun contact trouvé. Remplissez le client puis utilisez “+ Ajouter au CRM”.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={`${styles.field} ${styles.crmClientTypeField}`}>
              <label>Type de client<span className={styles.requiredMark}>*</span></label>
              <select
                value={clientType}
                onChange={(e) => { setClientType(e.target.value as ClientType); clearFieldError("clientType"); clearFieldError("clientSiren"); }}
              >
                <option value="">—</option>
                <option value="particulier">Particulier</option>
                <option value="professionnel">Professionnel</option>
                <option value="institution">Institution</option>
              </select>
              {fieldErrors.clientType ? <div className={styles.fieldError}>{fieldErrors.clientType}</div> : null}
            </div>

            <div className={styles.crmAddColumn}>
              <button
                type="button"
                className={styles.crmAddButton}
                onClick={() => void addCurrentClientToCrm()}
                disabled={addingToCrm}
              >
                {addingToCrm ? "Ajout CRM…" : "+ Ajouter au CRM"}
              </button>
              {crmActionMessage ? (
                <div className={`${styles.crmActionMessage} ${crmActionMessage.type === "success" ? styles.crmActionMessageSuccess : styles.crmActionMessageError}`}>
                  {crmActionMessage.text}
                </div>
              ) : null}
            </div>

            {crmError ? (
              <div style={{ gridColumn: "1 / -1", marginTop: -4, fontSize: 12, opacity: 0.8 }}>⚠️ {crmError}</div>
            ) : null}
          </div>

          <div className={styles.fourCol}>
            <div className={styles.field}>
              <label>Client<span className={styles.requiredMark}>*</span></label>
              <input value={clientName} onChange={(e) => { setClientName(e.target.value); clearFieldError("clientName"); }} placeholder="Nom du client" />
              {fieldErrors.clientName ? <div className={styles.fieldError}>{fieldErrors.clientName}</div> : null}
            </div>

            <div className={styles.field}>
              <label>Email client<span className={styles.requiredMark}>*</span></label>
              <input
                value={clientEmail}
                onChange={(e) => {
                  setClientEmail(e.target.value);
                  clearFieldError("clientEmail");
                }}
                placeholder="email@client.fr"
              />
              {fieldErrors.clientEmail ? <div className={styles.fieldError}>{fieldErrors.clientEmail}</div> : null}
            </div>

            <div className={styles.field}>
              <label>SIREN client{clientType && clientType !== "particulier" ? <span className={styles.requiredMark}>*</span> : <span> (optionnel)</span>}</label>
              <input
                value={clientSiren}
                onChange={(e) => { setClientSiren(e.target.value); clearFieldError("clientSiren"); }}
                placeholder="Ex : 123456789"
              />
              {fieldErrors.clientSiren ? <div className={styles.fieldError}>{fieldErrors.clientSiren}</div> : null}
            </div>

            <div className={styles.field}>
              <label>N° TVA client (optionnel)</label>
              <input
                value={clientVatNumber}
                onChange={(e) => setClientVatNumber(e.target.value)}
                placeholder="Ex : FR12345678901"
              />
            </div>
          </div>

          <div className={styles.compactThreeCol}>
            <div className={styles.field}>
            <label>Adresse<span className={styles.requiredMark}>*</span></label>
            <input
              value={billingAddress}
              onChange={(e) => { setBillingAddress(e.target.value); clearFieldError("billingAddress"); }}
              placeholder="Adresse"
              />
            {fieldErrors.billingAddress ? <div className={styles.fieldError}>{fieldErrors.billingAddress}</div> : null}
          </div>
            <div className={styles.field}>
            <label>Code postal<span className={styles.requiredMark}>*</span></label>
            <input
              value={billingPostalCode}
              onChange={(e) => { setBillingPostalCode(e.target.value); clearFieldError("billingPostalCode"); }}
              placeholder="Ex : 62440"
              />
            {fieldErrors.billingPostalCode ? <div className={styles.fieldError}>{fieldErrors.billingPostalCode}</div> : null}
          </div>
            <div className={styles.field}>
            <label>Ville<span className={styles.requiredMark}>*</span></label>
            <input
              value={billingCity}
              onChange={(e) => { setBillingCity(e.target.value); clearFieldError("billingCity"); }}
              placeholder="Ex : Harnes"
              />
            {fieldErrors.billingCity ? <div className={styles.fieldError}>{fieldErrors.billingCity}</div> : null}
          </div>
        </div>

          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                className={styles.checkboxInput}
                type="checkbox"
                checked={sameAddresses}
                onChange={(e) => setSameAddresses(e.target.checked)}
              />
              <span>Adresse de livraison identique à l’adresse de facturation</span>
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
                  <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Adresse" />
                </div>
                <div className={styles.field} style={{ marginBottom: 0 }}>
                  <label>Code postal livraison</label>
                  <input value={deliveryPostalCode} onChange={(e) => setDeliveryPostalCode(e.target.value)} placeholder="Ex : 62440" />
                </div>
                <div className={styles.field} style={{ marginBottom: 0 }}>
                  <label>Ville livraison</label>
                  <input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} placeholder="Ex : Harnes" />
                </div>
              </div>
            </div>
          ) : null}

          </div>

          <div className={styles.formBlock}>
            <div className={styles.formBlockHeader}>
              <div>
                <div className={styles.formBlockTitleRow}><span className={styles.formBlockIcon} aria-hidden="true">📄</span><div className={styles.formBlockTitle}>Infos devis</div></div>
                <div className={styles.formBlockSubtitle}>Numéro, date, options avancées et actions.</div>
              </div>
            </div>

          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label>Numéro de devis<span className={styles.requiredMark}>*</span></label>
              <input
                value={number}
                onChange={(e) => { setNumber(e.target.value); clearFieldError("number"); }}
                placeholder="DEV-YYYYMMDD-XXXX"
              />
              {fieldErrors.number ? <div className={styles.fieldError}>{fieldErrors.number}</div> : null}
            </div>

            <div className={styles.field}>
              <label>Date du devis<span className={styles.requiredMark}>*</span></label>
              <input
                type="date"
                value={docDateISO}
                onChange={(e) => { setDocDateISO(e.target.value); clearFieldError("docDateISO"); }}
              />
              {fieldErrors.docDateISO ? <div className={styles.fieldError}>{fieldErrors.docDateISO}</div> : null}
            </div>
          </div>

          <details className={styles.advancedDetails} open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
            <summary className={styles.advancedSummary}>Options avancées du devis</summary>
            <div className={styles.advancedBody}>
              <div className={styles.advancedSection}>
                <div className={styles.advancedSectionTitle}>Document</div>
                <div className={styles.compactThreeCol}>
                  <div className={styles.field}>
                    <label>Durée de validité (jours)<span className={styles.requiredMark}>*</span></label>
                    <input type="number" min="1" value={validityDays} onChange={(e) => { setValidityDays(Number(e.target.value) || 1); clearFieldError("validityDays"); }} />
                    {fieldErrors.validityDays ? <div className={styles.fieldError}>{fieldErrors.validityDays}</div> : null}
                  </div>
                  <div className={styles.field}>
                    <label>Catégorie d’opération</label>
                    <select value={operationCategory} onChange={(e) => setOperationCategory(e.target.value as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"])}>
                      {OPERATION_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Référence commande / PO</label>
                    <input value={purchaseOrderReference} onChange={(e) => setPurchaseOrderReference(e.target.value)} placeholder="Ex : BC-2026-014 / PO-7781" />
                  </div>
                </div>
              </div>

              <div className={styles.advancedSection}>
                <div className={styles.advancedSectionTitle}>Acompte & paiement</div>
                <div className={styles.compactThreeCol}>
                  <div className={styles.field}>
                    <label>Acompte</label>
                    <select
                      value={depositKind}
                      onChange={(e) => {
                        const value = e.target.value as "" | "percent" | "amount";
                        setDepositKind(value);
                        if (!value) setDepositValue("");
                      }}
                    >
                      <option value="">—</option>
                      <option value="percent">Pourcentage</option>
                      <option value="amount">Montant</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Valeur acompte</label>
                    <input type="number" min="0" step="0.01" value={depositValue} onChange={(e) => setDepositValue(e.target.value)} placeholder={depositKind === "amount" ? "Ex : 300" : "Ex : 30"} disabled={!depositKind} />
                  </div>
                  <div className={styles.field}>
                    <label>Mode de paiement</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number]["key"])}>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.key} value={method.key}>{method.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={styles.field} style={{ marginBottom: 0 }}>
                  <label>IBAN</label>
                  <input value={paymentDetails} onChange={(e) => setPaymentDetails(e.target.value)} placeholder="Ex : IBAN FR76..." />
                </div>
              </div>

              <div className={styles.advancedSection}>
                <div className={styles.advancedSectionTitle}>Prestation</div>
                <div className={styles.compactThreeCol}>
                  <div className={styles.field}>
                    <label>Date de prestation / livraison</label>
                    <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label>Début de prestation</label>
                    <input type="date" value={servicePeriodStart} onChange={(e) => setServicePeriodStart(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label>Fin de prestation</label>
                    <input type="date" value={servicePeriodEnd} onChange={(e) => setServicePeriodEnd(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className={styles.advancedSection}>
                <div className={styles.advancedSectionTitle}>Notes & mentions</div>
                <div className={styles.twoCol}>
                  <div className={styles.field}>
                    <label>Notes</label>
                    <textarea className={styles.advancedTextArea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex : Merci pour votre confiance." />
                  </div>
                  <div className={styles.field}>
                    <label>Mention spécifique devis</label>
                    <textarea className={styles.advancedTextArea} value={quoteMention} onChange={(e) => setQuoteMention(e.target.value)} placeholder="Ex : Devis valable selon disponibilité." />
                  </div>
                </div>
              </div>
            </div>
          </details>

          <div className={styles.actionGrid}>
            <button type="button" onClick={() => { void saveDraft(); }} disabled={addingToCrm || finalizing}>Sauvegarder</button>
            <button type="button" onClick={() => { void saveAsTemplate(); }} disabled={addingToCrm || finalizing}>Créer modèle</button>
            <button type="button" onClick={() => void convertCurrentDevisToInvoice()} disabled={finalizing}>
              → Convertir en facture
            </button>
            <button
              type="button"
              disabled={finalizing}
              onClick={async () => {
                if (!validateQuoteAction({ requireEmail: true })) return;
                if (!isFinalized && !window.confirm("Cette action va figer le document, continuez ?")) return;
                const to = (clientEmail || "").trim();
                const finalNumber = number || generateNumber("DEV");
                if (!number) setNumber(finalNumber);

                await uploadPdfAndOpenCompose(to, `${finalNumber}.pdf`);
              }}
            >
              {finalizing ? "Préparation…" : <>Envoyer par mail<span className={styles.helpBubble} title="Fige le document si besoin, prépare le PDF puis ouvre l’envoi par email au client.">?</span></>}
            </button>
            <button type="button" onClick={print} disabled={finalizing}>
              Imprimer / PDF
            </button>
          </div>

          <div className={styles.requiredHint}>* champs obligatoires selon le type de client. L’email client est requis uniquement pour l’envoi par mail.</div>

          {formMessage ? (
            <div className={`${styles.actionMessage} ${formMessage.type === "success" ? styles.actionMessageSuccess : styles.actionMessageError}`}>
              {formMessage.text}
            </div>
          ) : null}

          {vatDispense ? (
            <p style={{ marginTop: 12, opacity: 0.9 }}>
              TVA désactivée : <strong>TVA non applicable (article 293 B du CGI)</strong>
            </p>
          ) : null}
          </div>
        </div>

        {/* Aperçu document */}
        <div className={previewClassName} ref={previewRef}>
          <div className={styles.previewHeader}>
            <div>
              <div className={styles.title}>DEVIS</div>
              <div>{number || "—"}</div>
              <div style={{ marginTop: 6, color: "#444" }}>
                Date : {docDateISO ? new Date(docDateISO).toLocaleDateString("fr-FR") : "—"}
              </div>
              {serviceDate ? (
                <div style={{ marginTop: 4, color: "#444" }}>
                  Prestation / livraison : {new Date(serviceDate).toLocaleDateString("fr-FR")}
                </div>
              ) : null}
              {servicePeriodStart || servicePeriodEnd ? (
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
              <div style={{ fontWeight: 600 }}>{profile?.company_legal_name ?? "—"}</div>
              <div>{profile?.hq_address ?? ""}</div>
              <div>
                {(profile?.hq_zip ?? "")} {(profile?.hq_city ?? "")}
              </div>

              <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
                {profile?.phone ? (
                  <>
                    Tél : {profile.phone}
                    <br />
                  </>
                ) : null}
                {profile?.contact_email ? (
                  <>
                    Email : {profile.contact_email}
                    <br />
                  </>
                ) : null}
                {profile?.siren ? (
                  <>
                    SIREN : {profile.siren}
                    <br />
                  </>
                ) : null}
                {profile?.vat_number ? (
                  <>
                    TVA : {profile.vat_number}
                    <br />
                  </>
                ) : null}
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
              <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>{clientEmail || ""}</div>
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
                <th className={styles.printHiddenCell} style={{ width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      className={styles.printHidden}
                      value={l.label}
                      onChange={(e) => updateLine(l.id, { label: e.target.value })}
                      placeholder="Ex: Entretien boîte de vitesse"
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                    />
                    <span className={styles.printOnly}>{l.label || "—"}</span>
                  </td>
                  <td>
                    <input
                      className={styles.printHidden}
                      type="number"
                      value={l.qty}
                      onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })}
                      style={{ width: 64, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                    />
                    <span className={styles.printOnly}>{l.qty}</span>
                  </td>
                  <td>
                    <input
                      className={styles.printHidden}
                      type="number"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(l.id, { unitPrice: Number(e.target.value) })}
                      style={{ width: 110, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                    />
                    <span className={styles.printOnly}>{formatEuro(l.unitPrice)}</span>
                  </td>
                  <td>
                    <select
                      className={styles.printHidden}
                      value={vatDispense ? 0 : l.vatRate}
                      disabled={vatDispense}
                      onChange={(e) => updateLine(l.id, { vatRate: Number(e.target.value) })}
                      style={{ width: 80, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                    >
                      {VAT_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}%
                        </option>
                      ))}
                    </select>
                    <span className={styles.printOnly}>{vatDispense ? 0 : l.vatRate}%</span>
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatEuro(calcLineHT(l))}</td>
                  <td className={styles.printHiddenCell} style={{ textAlign: "right" }}>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className={styles.removeLineBtn}
                        onClick={() => removeLine(l.id)}
                        title="Supprimer la ligne"
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
            <button type="button" className={styles.previewAddLineBtn} onClick={addLine}>
              + Ajouter une prestation
            </button>
          </div>
          {fieldErrors.lines ? <div className={styles.fieldError} style={{ marginTop: 6 }}>{fieldErrors.lines}</div> : null}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", marginTop: 18, gap: 24 }}>
            <div style={{ fontSize: 12, color: "#444", lineHeight: 1.4 }}>
              <div>Les prix sont exprimés en euros. Le devis est valable {validityDays} jours.</div>
              {paymentMethod || paymentDetails ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Paiement :</strong> {paymentLabel}
                  {paymentDetails ? <> — {paymentDetails}</> : null}
                </div>
              ) : null}
              {notes ? <div style={{ marginTop: 6 }}>{notes}</div> : null}
              {quoteMention ? (
                <div style={{ marginTop: 6 }}>{quoteMention}</div>
              ) : null}
              {operationCategory ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Catégorie :</strong> {OPERATION_CATEGORY_OPTIONS.find((option) => option.key === operationCategory)?.label}
                </div>
              ) : null}
              {serviceDate ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Date de prestation / livraison :</strong> {new Date(serviceDate).toLocaleDateString("fr-FR")}
                </div>
              ) : null}
              {servicePeriodStart || servicePeriodEnd ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Période de prestation :</strong> {servicePeriodStart ? new Date(servicePeriodStart).toLocaleDateString("fr-FR") : "—"}
                  {servicePeriodEnd ? ` → ${new Date(servicePeriodEnd).toLocaleDateString("fr-FR")}` : ""}
                </div>
              ) : null}
              {purchaseOrderReference ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Référence commande / PO :</strong> {purchaseOrderReference}
                </div>
              ) : null}
              {depositKind && depositValue ? (
                <div style={{ marginTop: 6 }}>
                  <strong>Acompte demandé :</strong> {depositKind === "amount" ? `${depositValue} €` : `${depositValue} %`}
                </div>
              ) : null}
              {vatDispense ? (
                <div style={{ marginTop: 6 }}>
                  <strong>TVA non applicable</strong> — Article 293 B du CGI.
                </div>
              ) : null}
            </div>

            <div className={styles.previewTotalsBox}>
              <div className={styles.noPrint} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 650, marginBottom: 6 }}>Remise commerciale</div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8 }}>
                  <select
                    value={discountKind}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      setDiscountKind(v);
                      if (!v) { setDiscountValue(0); setDiscountDetails(""); }
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
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                    placeholder={discountKind === "percent" ? "Ex: 10" : "Ex: 50"}
                    disabled={!discountKind}
                    style={{ width: "100%", background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", color: "#111" }}
                  />
                  <textarea
                    value={discountDetails}
                    onChange={(e) => setDiscountDetails(e.target.value)}
                    placeholder="Détail de la remise (optionnel)"
                    disabled={!discountKind}
                    rows={2}
                    style={{ gridColumn: "1 / -1", width: "100%", background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", color: "#111", resize: "vertical" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Total HT</span>
                <strong>{formatEuro(totals.totalHT)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>TVA</span>
                <strong>{formatEuro(totals.totalTVA)}</strong>
              </div>
              <div className={styles.previewTotalsMain} style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 18 }}>
                <span>Total TTC</span>
                <strong>{formatEuro(totals.totalTTC)}</strong>
              </div>
              {totals.discountTTC > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
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
                <div className={styles.previewTotalsMain} style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 18 }}>
                  <span>Total à payer</span>
                  <strong>{formatEuro(totals.totalDue)}</strong>
                </div>
              ) : null}
            </div>
          </div>

          {/* ✅ Bon pour accord / Signature */}
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1fr 260px",
              gap: 24,
              alignItems: "end",
            }}
          >
            <div />
            <div
              style={{
                border: "2px solid #111",
                borderRadius: 12,
                padding: 12,
                minHeight: 90,
              }}
            >
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Bon pour accord</div>
              <div style={{ fontSize: 12, color: "#444" }}>Signature :</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
