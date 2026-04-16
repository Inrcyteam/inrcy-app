"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import styles from "../../_documents/documents.module.css";
import dash from "../../dashboard.module.css";
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
  city?: string | null;
  postal_code?: string | null;
};


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
  const [billingAddress, setBillingAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [sameAddresses, setSameAddresses] = useState(true);
  const [operationCategory, setOperationCategory] = useState<(typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]>("");
  const [serviceDate, setServiceDate] = useState("");
  const [servicePeriodStart, setServicePeriodStart] = useState("");
  const [servicePeriodEnd, setServicePeriodEnd] = useState("");
  const [purchaseOrderReference, setPurchaseOrderReference] = useState("");
  const [depositKind, setDepositKind] = useState<"" | "percent" | "amount">("");
  const [depositValue, setDepositValue] = useState("");
  const [vatOnDebits, setVatOnDebits] = useState(false);
  const [lateFeeRate, setLateFeeRate] = useState("");
  const [fixedRecoveryFee40, setFixedRecoveryFee40] = useState(true);
  const [documentKind, setDocumentKind] = useState<(typeof DOCUMENT_KIND_OPTIONS)[number]["key"]>("invoice");

  const setPrimaryClientAddress = (value: string) => {
    setClientAddress(value);
    setBillingAddress(value);
    if (sameAddresses) setDeliveryAddress(value);
  };

  useEffect(() => {
    if (!sameAddresses) return;
    setDeliveryAddress(billingAddress || clientAddress);
  }, [sameAddresses, billingAddress, clientAddress]);

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
  const [currentSaveId, setCurrentSaveId] = useState<string>("");

  const [crmOpen, setCrmOpen] = useState(false);
  const crmSelectRef = useRef<HTMLDivElement | null>(null);

  const crmLabel = (c: CrmContact) => {
    const name =
      (c.company_name && c.company_name.trim()) ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      (c.last_name || "").trim() ||
      "(Sans nom)";
    return name;
  };

  const sortedCrmContacts = useMemo(() => {
    const copy = [...crmContacts];
    copy.sort((a, b) => crmLabel(a).localeCompare(crmLabel(b), "fr", { sensitivity: "base" }));
    return copy;
  }, [crmContacts]);

  const selectedCrmLabel = useMemo(() => {
    if (!selectedCrmContactId) return "";
    const c = crmContacts.find((x) => String(x.id) === String(selectedCrmContactId));
    if (!c) return "";
    return crmLabel(c) + (c.email ? ` — ${c.email}` : "");
  }, [crmContacts, selectedCrmContactId]);



  // ✅ Pré-remplissage depuis CRM / iNrBox
  useEffect(() => {
    const name = searchParams.get("clientName") || searchParams.get("name") || "";
    const email = searchParams.get("clientEmail") || searchParams.get("email") || "";
    const address = searchParams.get("clientAddress") || searchParams.get("address") || "";
    if (name) setClientName((prev) => prev || name);
    if (email) setClientEmail((prev) => prev || email);
    if (address) {
      setClientAddress((prev) => prev || address);
      setBillingAddress((prev) => prev || address);
      setDeliveryAddress((prev) => prev || address);
    }
  }, []);

  // ✅ Liste des contacts CRM pour import dans ce formulaire
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setCrmLoading(true);
      setCrmError(null);

      try {
        const res = await fetch("/api/crm/contacts", { method: "GET" });
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
    const displayName =
      (c.company_name && c.company_name.trim()) ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      (c.last_name || "").trim();

    const addrParts = [c.address, c.postal_code, c.city].filter(Boolean).map((s) => String(s).trim());
    const fullAddress = addrParts.join(" ").trim();

    setClientName(displayName);
    setClientEmail((c.email || "").trim());
    setPrimaryClientAddress(fullAddress);
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


  const [status, setStatus] = useState<DocRecord["status"] | "en_attente_paiement" | "">("");

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["key"]>("");

  const [paymentDetails, setPaymentDetails] = useState("");
  const [notes, setNotes] = useState("");

  // IMPORTANT: id stable au 1er render (pas de uid() ici)
  const [lines, setLines] = useState<LineItem[]>([
    { id: "l_1", label: "Prestation", qty: 1, unitPrice: 120, vatRate: 20 },
  ]);

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
      deliveryAddress?: string;
      sameAddresses?: boolean;
      clientEmail: string;
      clientSiren?: string;
      clientVatNumber?: string;
      operationCategory?: (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"];
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
    };
  };

  type DevisSnapshot = {
    number: string;
    docDateISO: string;
    clientName: string;
    clientAddress: string;
    billingAddress?: string;
    deliveryAddress?: string;
    sameAddresses?: boolean;
    clientEmail: string;
    clientSiren?: string;
    clientVatNumber?: string;
    operationCategory?: (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"];
    serviceDate?: string;
    servicePeriodStart?: string;
    servicePeriodEnd?: string;
    purchaseOrderReference?: string;
    depositKind?: "" | "percent" | "amount";
    depositValue?: string;
    validityDays: number;
    lines: LineItem[];
    discountKind: DiscountKind | "";
    discountValue: number;
    discountDetails: string;
  };

  const SAVES_LIMIT = 20;
  const SAVES_TYPE = "facture" as const;

  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState<FactureDraft[]>([]);
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

  const cleanupOldSaves = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("doc_saves")
      .delete()
      .eq("user_id", user.id)
      .eq("type", SAVES_TYPE)
      .lt("updated_at", cutoff);
  };

  const refreshSaves = async () => {
    setDraftsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fallback cleanup (the real cleanup is done server-side via cron)
      await cleanupOldSaves();

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
        snapshot: row.payload,
      }));

      setDrafts(mapped);
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
    const nextBillingAddress = s.billingAddress || s.clientAddress || "";
    const nextSameAddresses = typeof s.sameAddresses === "boolean"
      ? s.sameAddresses
      : !s.deliveryAddress || s.deliveryAddress === nextBillingAddress;
    const nextDeliveryAddress = nextSameAddresses
      ? nextBillingAddress
      : (s.deliveryAddress || "");

    setNumber(s.number);
    setInvoiceDate(s.invoiceDate);
    setDueDate(s.dueDate);
    setClientName(s.clientName);
    setClientAddress(nextBillingAddress);
    setBillingAddress(nextBillingAddress);
    setDeliveryAddress(nextDeliveryAddress);
    setSameAddresses(nextSameAddresses);
    setClientEmail(s.clientEmail);
    setClientSiren(s.clientSiren || "");
    setClientVatNumber(s.clientVatNumber || "");
    setOperationCategory((s.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]) || "");
    setServiceDate(s.serviceDate || "");
    setServicePeriodStart(s.servicePeriodStart || "");
    setServicePeriodEnd(s.servicePeriodEnd || "");
    setPurchaseOrderReference(s.purchaseOrderReference || "");
    setDepositKind((s.depositKind as "" | "percent" | "amount") || "");
    setDepositValue(s.depositValue || "");
    setVatOnDebits(!!s.vatOnDebits);
    setLateFeeRate(s.lateFeeRate || "");
    setFixedRecoveryFee40(typeof s.fixedRecoveryFee40 === "boolean" ? s.fixedRecoveryFee40 : true);
    setDocumentKind((s.documentKind as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"]) || "invoice");
    setStatus(s.status);
    setPaymentMethod(s.paymentMethod);
    setPaymentDetails(s.paymentDetails);
    setNotes(s.notes);
    setLines(s.lines);
    setDiscountKind(s.discountKind);
    setDiscountValue(s.discountValue);
    setDiscountDetails(s.discountDetails || "");
    setIsFinalized(!!s.isFinalized);
    setFinalizedAt(typeof s.finalizedAt === "string" ? s.finalizedAt : "");
  };

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
        if (!cancelled) setFormMessage({ type: "error", text: "Impossible de réouvrir cette facture." });
        return;
      }

      if (!data?.payload) {
        if (!cancelled) setFormMessage({ type: "error", text: "Facture introuvable." });
        return;
      }

      if (!cancelled) {
        applyDraftSnapshot(data.payload as FactureDraft["snapshot"]);
        setCurrentSaveId(data.id);
        setFormMessage({ type: "success", text: "Facture réouverte depuis iNrSend." });
      }
    };

    void loadRequestedSave();

    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase]);


  useEffect(() => {
    const existingSaveId = searchParams.get("saveId") || searchParams.get("docSaveId") || "";
    if (existingSaveId) return;

    const devisSaveId = searchParams.get("fromDevisSaveId") || searchParams.get("devisSaveId") || "";
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
        if (!cancelled) setFormMessage({ type: "error", text: "Impossible de charger ce devis pour la conversion." });
        return;
      }

      const devis = data?.payload as DevisSnapshot | undefined;
      if (!devis) {
        if (!cancelled) setFormMessage({ type: "error", text: "Devis introuvable pour la conversion." });
        return;
      }

      const now = new Date();
      const due = new Date(now);
      due.setDate(due.getDate() + 30);

      if (!cancelled) {
        setCurrentSaveId("");
        setIsFinalized(false);
        setFinalizedAt("");
        setNumber(generateNumber("FAC"));
        setInvoiceDate(now.toISOString().slice(0, 10));
        setDueDate(due.toISOString().slice(0, 10));
        const nextBillingAddress = devis.billingAddress || devis.clientAddress || "";
        const nextSameAddresses = typeof devis.sameAddresses === "boolean"
          ? devis.sameAddresses
          : !devis.deliveryAddress || devis.deliveryAddress === nextBillingAddress;
        const nextDeliveryAddress = nextSameAddresses
          ? nextBillingAddress
          : (devis.deliveryAddress || "");

        setClientName(devis.clientName || "");
        setClientAddress(nextBillingAddress);
        setBillingAddress(nextBillingAddress);
        setDeliveryAddress(nextDeliveryAddress);
        setSameAddresses(nextSameAddresses);
        setClientEmail(devis.clientEmail || "");
        setClientSiren(devis.clientSiren || "");
        setClientVatNumber(devis.clientVatNumber || "");
        setOperationCategory((devis.operationCategory as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"]) || "");
        setServiceDate(devis.serviceDate || "");
        setServicePeriodStart(devis.servicePeriodStart || "");
        setServicePeriodEnd(devis.servicePeriodEnd || "");
        setPurchaseOrderReference(devis.purchaseOrderReference || "");
        setDepositKind((devis.depositKind as "" | "percent" | "amount") || "");
        setDepositValue(devis.depositValue || "");
        setVatOnDebits(false);
        setLateFeeRate("");
        setFixedRecoveryFee40(true);
        setDocumentKind("invoice");
        setStatus("");
        setPaymentMethod("");
        setPaymentDetails("");
        setNotes(`Facture créée depuis le devis ${devis.number || devisSaveId}.`);
        setLines(Array.isArray(devis.lines) && devis.lines.length
          ? devis.lines.map((line: LineItem, index: number) => ({
              ...line,
              id: line?.id || `l_${index + 1}`,
            }))
          : [{ id: "l_1", label: "Prestation", qty: 1, unitPrice: 120, vatRate: vatDispense ? 0 : 20 }]);
        setDiscountKind(devis.discountKind || "");
        setDiscountValue(Number(devis.discountValue) || 0);
        setDiscountDetails(devis.discountDetails || "");
        setFormMessage({ type: "success", text: `Facture préremplie depuis le devis ${devis.number || "sélectionné"}.` });
      }
    };

    void loadDevisForConversion();

    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase, vatDispense]);

  const addLine = () =>
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

  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );


  const saveDraft = async (options?: { silent?: boolean }) => {
    const nowISO = new Date().toISOString();
    const finalNumber = number || generateNumber("FAC");
    if (!number) setNumber(finalNumber);

    const normalizedBillingAddress = billingAddress || clientAddress;
    const normalizedDeliveryAddress = sameAddresses ? normalizedBillingAddress : deliveryAddress;

    const snapshot: FactureDraft["snapshot"] = {
      number: finalNumber,
      invoiceDate: invoiceDate || new Date().toISOString().slice(0, 10),
      dueDate,
      clientName,
      clientAddress: normalizedBillingAddress,
      billingAddress: normalizedBillingAddress,
      deliveryAddress: normalizedDeliveryAddress,
      sameAddresses,
      clientEmail,
      clientSiren,
      clientVatNumber,
      operationCategory,
      serviceDate,
      servicePeriodStart,
      servicePeriodEnd,
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
      setFormMessage({ type: "error", text: "Impossible d’enregistrer cette facture pour le moment." });
      return;
    }

    const savedId = (savedRows?.[0] as { id?: string } | undefined)?.id || currentSaveId;
    if (savedId) setCurrentSaveId(savedId);

    // Enforce limit (keep most recent)
    const { data: ids } = await supabase
      .from("doc_saves")
      .select("id,updated_at")
      .eq("user_id", user.id)
      .eq("type", SAVES_TYPE)
      .order("updated_at", { ascending: false });

    const extra = (ids ?? []).slice(SAVES_LIMIT);
    if (extra.length) {
      await supabase
        .from("doc_saves")
        .delete()
        .in(
          "id",
          extra.map((x: any) => x.id)
        );
    }

    await refreshSaves();
    if (!options?.silent) {
      setDraftsOpen(true);
      setFormMessage({ type: "success", text: currentSaveId ? "Facture mise à jour." : "Facture enregistrée." });
    }

    return savedId as string | undefined;
  };

  const finalizeInvoice = async (
    docSaveId: string,
    targetStatus: "en_attente_paiement" | "envoye" | "paye" = "en_attente_paiement"
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
        throw new Error(getSimpleFrenchErrorMessage(json?.error, "Impossible de figer cette facture pour le moment."));
      }

      const officialNumber = typeof json?.number === "string" && json.number ? json.number : number;
      const nextStatus =
        typeof json?.status === "string" && json.status
          ? (json.status as DocRecord["status"])
          : ((targetStatus as DocRecord["status"]) || "en_attente_paiement");
      const nextFinalizedAt = typeof json?.finalizedAt === "string" ? json.finalizedAt : new Date().toISOString();

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
      const text = getSimpleFrenchErrorMessage(error, "Impossible de figer cette facture pour le moment.");
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

  const print = () => window.print();

  const buildPdfBlob = async (): Promise<Blob | null> => {
    if (typeof window === "undefined") return null;
    const el = previewRef.current;
    if (!el) return null;

    const noPrintEls = Array.from(el.querySelectorAll(`.${styles.noPrint}`)) as HTMLElement[];
    const prev = noPrintEls.map((n) => n.style.display);
    noPrintEls.forEach((n) => (n.style.display = "none"));

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    } finally {
      noPrintEls.forEach((n, i) => (n.style.display = prev[i] || ""));
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
      setFormMessage({ type: "error", text: "Vous devez être connecté pour envoyer par mail." });
      return;
    }

    const docSaveId = await saveDraft({ silent: true });
    if (!docSaveId) {
      setFormMessage({ type: "error", text: "Veuillez d’abord sauvegarder cette facture avant l’envoi." });
      return;
    }

    const finalized = await finalizeInvoice(docSaveId, "envoye");
    if (!finalized) return;

    const officialNumber = finalized.number || number || generateNumber("FAC");
    if (!number || number !== officialNumber) setNumber(officialNumber);

    const pdfBlob = await buildPdfBlob();
    if (!pdfBlob) {
      setFormMessage({ type: "error", text: "Impossible de générer le PDF de cette facture pour le moment." });
      return;
    }

    const rawFilename = filename && filename.trim() ? filename : `${officialNumber}.pdf`;
    const safeName = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${user.id}/factures/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(ATTACH_BUCKET)
      .upload(key, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      console.error(upErr);
      setFormMessage({ type: "error", text: "Impossible de préparer cette facture pour l’envoi." });
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
    OPERATION_CATEGORY_OPTIONS.find((option) => option.key === operationCategory)?.label ?? "—";
  const documentTitle =
    documentKind === "deposit"
      ? "FACTURE D’ACOMPTE"
      : documentKind === "credit_note"
        ? "AVOIR"
        : "FACTURE";

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
                setDraftsOpen(true);
              }}
            >
              Sauvegardes
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
              onClick={() => {
                setSelectedCrmContactId("");
                setCrmOpen(false);

                setClientName("");
                setClientEmail("");
                setClientSiren("");
                setClientVatNumber("");
                setClientAddress("");
                setBillingAddress("");
                setDeliveryAddress("");
                setSameAddresses(true);
                setOperationCategory("");
                setServiceDate("");
                setServicePeriodStart("");
                setServicePeriodEnd("");
                setPurchaseOrderReference("");
                setDepositKind("");
                setDepositValue("");
                setVatOnDebits(false);
                setLateFeeRate("");
                setFixedRecoveryFee40(true);
                setDocumentKind("invoice");

                setCurrentSaveId("");
                setIsFinalized(false);
                setFinalizedAt("");
                setNumber(generateNumber("FAC"));
                const d = new Date();
                setInvoiceDate(d.toISOString().slice(0, 10));
                const dd = new Date();
                dd.setDate(dd.getDate() + 30);
                setDueDate(dd.toISOString().slice(0, 10));

                setStatus("");
                setPaymentMethod("");
                setPaymentDetails("");
                setNotes("");

                setDiscountKind("");
                setDiscountValue(0);
                setDiscountDetails("");

                setLines([{ id: "l_1", label: "Prestation", qty: 1, unitPrice: 120, vatRate: 20 }]);
              }}
            >
              Réinitialiser
            </button>
            <button type="button" className={`${styles.closeBtn} ${styles.toolbarBtn}`} onClick={() => router.push("/dashboard")}>
              Fermer
            </button>
          </div>

          {formMessage ? (
            <div style={{ marginTop: 10, color: formMessage.type === "success" ? "#22c55e" : "#ef4444", fontWeight: 800, fontSize: 13 }}>
              {formMessage.text}
            </div>
          ) : null}

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
              Facture figée avec le numéro officiel <strong>{number || "—"}</strong>
              {finalizedAt ? <> · figée le {new Date(finalizedAt).toLocaleString("fr-FR")}</> : null}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 2, padding: "14px 14px 10px", background: "#111", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontWeight: 750, fontSize: 16 }}>Sauvegardes (max 20)</div>
                <button type="button" className={styles.closeBtn} onClick={() => setDraftsOpen(false)}>
                  Fermer
                </button>
              </div>

              {drafts.length === 0 ? (
                <div style={{ padding: 14, opacity: 0.85 }}>Aucune facture sauvegardée.</div>
              ) : (
                <div style={{ padding: 14, display: "grid", gap: 10 }}>
                  {drafts.map((d) => {
                    const label = d.snapshot.number || "(Sans numéro)";
                    const who = d.snapshot.clientName?.trim() ? ` — ${d.snapshot.clientName.trim()}` : "";
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
                          <div style={{ fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {label}
                            {who}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            Sauvegardé le {new Date(d.updatedAtISO).toLocaleString("fr-FR")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button type="button" onClick={() => openDraft(d)}>
                            Ouvrir
                          </button>
                          <button type="button" className={styles.ghostBtn} onClick={() => deleteDraft(d.id)}>
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

        
        <div className={styles.field}>
          <label>Importer un contact (CRM)</label>

          <div className={styles.crmSelect} ref={crmSelectRef}>
            <button
              type="button"
              className={styles.crmSelectButton}
              onClick={() => setCrmOpen((v) => !v)}
              disabled={crmLoading || coreEditingLocked}
            >
              <span>
                {selectedCrmLabel ||
                  (crmLoading ? "Chargement..." : "Sélectionner un contact")}
              </span>
              <span className={styles.crmSelectChevron}>▾</span>
            </button>

            {crmOpen ? (
              <div className={styles.crmSelectDropdown} role="listbox">
                {sortedCrmContacts.map((c) => {
                  const label = crmLabel(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={styles.crmSelectItem}
                      onClick={() => {
                        setSelectedCrmContactId(String(c.id));
                        applyCrmContact(c);
                        setCrmOpen(false);
                      }}
                    >
                      {label}
                      {c.email ? ` — ${c.email}` : ""}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {crmError ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              ⚠️ {crmError}
            </div>
          ) : null}
        </div>

<div className={styles.fourCol}>
          <div className={styles.field}>
            <label>Client</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nom du client"
              disabled={coreEditingLocked}
            />
          </div>

          <div className={styles.field}>
            <label>Email client</label>
            <input
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="email@client.fr"
              disabled={coreEditingLocked}
            />
          </div>

          <div className={styles.field}>
            <label>SIREN client (optionnel)</label>
            <input
              value={clientSiren}
              onChange={(e) => setClientSiren(e.target.value)}
              placeholder="Ex : 123456789"
              disabled={coreEditingLocked}
            />
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

        <div className={styles.field}>
          <label>Adresse de facturation</label>
          <input
            value={billingAddress}
            onChange={(e) => setPrimaryClientAddress(e.target.value)}
            placeholder="Adresse, ville"
            disabled={coreEditingLocked}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.checkboxLabel} style={{ cursor: coreEditingLocked ? "not-allowed" : "pointer" }}>
            <input
              className={styles.checkboxInput}
              type="checkbox"
              checked={sameAddresses}
              onChange={(e) => setSameAddresses(e.target.checked)}
              disabled={coreEditingLocked}
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
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label>Adresse de livraison</label>
              <input
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Adresse de livraison, ville"
                disabled={coreEditingLocked}
              />
            </div>
          </div>
        ) : null}

        <div className={styles.threeCol}>
          <div className={styles.field}>
            <label>Numéro de facture</label>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="FAC-YYYYMMDD-XXXX"
              disabled={coreEditingLocked}
            />
          </div>

          <div className={styles.field}>
            <label>Date de facture</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              disabled={coreEditingLocked}
            />
          </div>

          <div className={styles.field}>
            <label>Échéance</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={coreEditingLocked}
            />
          </div>
        </div>

        <div className={styles.threeCol}>
          <div className={styles.field}>
            <label>Type de document</label>
            <select
              value={documentKind}
              onChange={(e) => setDocumentKind(e.target.value as (typeof DOCUMENT_KIND_OPTIONS)[number]["key"])}
              disabled={coreEditingLocked}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "white",
              }}
            >
              {DOCUMENT_KIND_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Catégorie d’opération</label>
            <select
              value={operationCategory}
              onChange={(e) => setOperationCategory(e.target.value as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"])}
              disabled={coreEditingLocked}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "white",
              }}
            >
              {OPERATION_CATEGORY_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Taux pénalités de retard (%)</label>
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
        </div>

        <div className={styles.threeCol}>
          <div className={styles.field}>
            <label>Date de prestation / livraison</label>
            <input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              disabled={coreEditingLocked}
            />
          </div>

          <div className={styles.field}>
            <label>Début de prestation</label>
            <input
              type="date"
              value={servicePeriodStart}
              onChange={(e) => setServicePeriodStart(e.target.value)}
              disabled={coreEditingLocked}
            />
          </div>

          <div className={styles.field}>
            <label>Fin de prestation</label>
            <input
              type="date"
              value={servicePeriodEnd}
              onChange={(e) => setServicePeriodEnd(e.target.value)}
              disabled={coreEditingLocked}
            />
          </div>
        </div>

        <div className={styles.threeCol}>
          <div className={styles.field}>
            <label>Référence commande / PO</label>
            <input
              value={purchaseOrderReference}
              onChange={(e) => setPurchaseOrderReference(e.target.value)}
              placeholder="Ex : BC-2026-014 / PO-7781"
              disabled={coreEditingLocked}
            />
          </div>

          <div className={styles.field}>
            <label>Acompte</label>
            <select
              value={depositKind}
              onChange={(e) => setDepositKind(e.target.value as "" | "percent" | "amount")}
              disabled={coreEditingLocked}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "white",
                width: "100%",
                minWidth: 0,
              }}
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
              placeholder={depositKind === "amount" ? "Ex : 300" : "Ex : 30"}
              disabled={coreEditingLocked || !depositKind}
              style={{ width: "100%", minWidth: 0 }}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.checkboxLabel} style={{ cursor: coreEditingLocked ? "not-allowed" : "pointer" }}>
            <input
              className={styles.checkboxInput}
              type="checkbox"
              checked={vatOnDebits}
              onChange={(e) => setVatOnDebits(e.target.checked)}
              disabled={coreEditingLocked}
            />
            <span>TVA sur les débits (si applicable)</span>
          </label>
        </div>

        <div className={styles.field}>
          <label className={styles.checkboxLabel} style={{ cursor: coreEditingLocked ? "not-allowed" : "pointer" }}>
            <input
              className={styles.checkboxInput}
              type="checkbox"
              checked={fixedRecoveryFee40}
              onChange={(e) => setFixedRecoveryFee40(e.target.checked)}
              disabled={coreEditingLocked}
            />
            <span>Mentionner l’indemnité forfaitaire de 40 € pour frais de recouvrement</span>
          </label>
        </div>

        <div
          className={styles.twoCol}
        >
          <div className={styles.field}>
            <label>Statut</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as DocRecord["status"])
              }
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "white",
              }}
            >
              {!isFinalized ? <option value="">—</option> : null}
              {!isFinalized ? <option value="brouillon">brouillon</option> : null}
              <option value="en_attente_paiement">en attente de paiement</option>
              <option value="envoye">envoyé</option>
              <option value="paye">payé</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Mode de paiement</label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value as (typeof PAYMENT_METHODS)[number]["key"]
                )
              }
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "white",
              }}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label>Détails paiement (IBAN, lien, etc.)</label>
          <input
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            placeholder="Ex: IBAN FR76 .... / Paiement sous 30 jours"
          />
        </div>

        <div className={styles.field}>
          <label>Notes (optionnel)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Merci pour votre confiance."
          />
        </div>

        <div className={styles.actionGrid}>
          <button type="button" onClick={() => { void saveDraft(); }} disabled={finalizing}>
            Sauvegarder
          </button>
          {!isFinalized ? (
            <button
              type="button"
              disabled={finalizing}
              onClick={async () => {
                const docSaveId = await saveDraft({ silent: true });
                if (!docSaveId) return;
                const finalized = await finalizeInvoice(docSaveId, "en_attente_paiement");
                if (finalized) {
                  setFormMessage({ type: "success", text: `Facture figée sous le numéro ${finalized.number}.` });
                }
              }}
            >
              {finalizing ? "Émission…" : "Émettre / figer"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={finalizing}
            onClick={async () => {
              const to = (clientEmail || "").trim();
              if (!to) {
                setFormMessage({ type: "error", text: "Veuillez d’abord ajouter un email client pour envoyer un message." });
                return;
              }

              await uploadPdfAndOpenCompose(to);
            }}
          >
            {finalizing ? "Préparation…" : "Envoyer par mail"}
          </button>
          <button type="button" onClick={print} disabled={finalizing}>
            Imprimer / PDF
          </button>
        </div>

          {vatDispense ? (
            <p style={{ marginTop: 12, opacity: 0.9 }}>
              TVA désactivée :{" "}
              <strong>TVA non applicable (article 293 B du CGI)</strong>
            </p>
          ) : null}
        </div>

        {/* Aperçu document */}
        <div className={styles.preview} ref={previewRef}>
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Prestataire</div>
            <div style={{ fontWeight: 600 }}>
              {profile?.company_legal_name ?? "—"}
            </div>
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

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Client</div>
            <div style={{ fontWeight: 600 }}>{clientName || "—"}</div>
            {clientSiren ? <div>SIREN : {clientSiren}</div> : null}
            {clientVatNumber ? <div>TVA : {clientVatNumber}</div> : null}
            <div>{billingAddress || clientAddress || ""}</div>
            {!sameAddresses && deliveryAddress ? (
              <div style={{ marginTop: 6 }}>
                <strong>Adresse de livraison :</strong> {deliveryAddress}
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
              <th style={{ width: 0 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.id}>
                <td>
                  <input
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
                </td>
                <td>
                  <input
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
                </td>
                <td>
                  <input
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
                </td>
                <td>
                  <select
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
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatEuro(calcLineHT(l))}
                </td>
                <td style={{ textAlign: "right" }}>
                  {idx > 0 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(l.id)}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "transparent",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                      title="Supprimer la ligne"
                      disabled={coreEditingLocked}
                    >
                      −
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={`${styles.previewAddLineWrap} ${styles.noPrint}`}>
          <button type="button" className={styles.previewAddLineBtn} onClick={addLine} disabled={coreEditingLocked}>
            + Ajouter une prestation
          </button>
        </div>

        <div
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
            {serviceDate ? (
              <div style={{ marginBottom: 6 }}>
                <strong>Date de prestation / livraison :</strong> {new Date(serviceDate).toLocaleDateString("fr-FR")}
              </div>
            ) : null}
            {servicePeriodStart || servicePeriodEnd ? (
              <div style={{ marginBottom: 6 }}>
                <strong>Période de prestation :</strong> {servicePeriodStart ? new Date(servicePeriodStart).toLocaleDateString("fr-FR") : "—"}
                {servicePeriodEnd ? ` → ${new Date(servicePeriodEnd).toLocaleDateString("fr-FR")}` : ""}
              </div>
            ) : null}
            {purchaseOrderReference ? (
              <div style={{ marginBottom: 6 }}>
                <strong>Référence commande / PO :</strong> {purchaseOrderReference}
              </div>
            ) : null}
            {depositKind && depositValue ? (
              <div style={{ marginBottom: 6 }}>
                <strong>Acompte :</strong> {depositKind === "amount" ? `${depositValue} €` : `${depositValue} %`}
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
                Indemnité forfaitaire de 40 € pour frais de recouvrement en cas de retard de paiement.
              </div>
            ) : null}
            {vatDispense ? (
              <div>
                <strong>TVA non applicable</strong> — Article 293 B du CGI.
              </div>
            ) : null}
            {notes ? <div style={{ marginTop: 8 }}>{notes}</div> : null}
          </div>
          <div>
            <div style={{ marginBottom: 8 }} className={styles.noPrint}>
              <div style={{ fontWeight: 650, marginBottom: 6 }}>Remise commerciale</div>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
                <select
                  value={discountKind}
                  disabled={coreEditingLocked}
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
                  disabled={!discountKind || coreEditingLocked}
                style={{ width: "100%", background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", color: "#111" }}
                />
                <textarea
                  value={discountDetails}
                  onChange={(e) => setDiscountDetails(e.target.value)}
                  placeholder="Détail de la remise (optionnel)"
                  disabled={!discountKind || coreEditingLocked}
                  rows={2}
                  style={{ gridColumn: "1 / -1", width: "100%", background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", color: "#111", resize: "vertical" }}
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
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 18 }}>
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
      </div>
    </div>
  );
}
