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

const VAT_OPTIONS = [0, 5.5, 10, 20];

const OPERATION_CATEGORY_OPTIONS = [
  { key: "", label: "—" },
  { key: "vente", label: "Vente" },
  { key: "prestation", label: "Prestation de services" },
  { key: "mixte", label: "Vente + prestation" },
] as const;

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

export default function NewDevisPage() {
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

  // IMPORTANT: stable SSR/CSR
  const [number, setNumber] = useState<string>("");
  const [docDateISO, setDocDateISO] = useState<string>(""); // pour affichage stable

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
  const [addingToCrm, setAddingToCrm] = useState(false);
  const [currentSaveId, setCurrentSaveId] = useState<string>("");

  // UI dropdown custom (style "select blanc", 10 items visibles + scroll)
  const [crmOpen, setCrmOpen] = useState(false);
  const crmBoxRef = useRef<HTMLDivElement | null>(null);

  // ✅ Pré-remplissage depuis CRM / iNrBox
  useEffect(() => {
    const name = searchParams.get("clientName") || searchParams.get("name") || "";
    const email = searchParams.get("clientEmail") || searchParams.get("email") || "";
    const address = searchParams.get("clientAddress") || searchParams.get("address") || "";
    const siren = searchParams.get("clientSiren") || "";
    const vatNumber = searchParams.get("clientVatNumber") || "";
    const billing = searchParams.get("billingAddress") || "";
    const delivery = searchParams.get("deliveryAddress") || "";
    if (name) setClientName((prev) => prev || name);
    if (email) setClientEmail((prev) => prev || email);
    if (siren) setClientSiren((prev) => prev || siren);
    if (vatNumber) setClientVatNumber((prev) => prev || vatNumber);
    if (address) {
      setClientAddress((prev) => prev || address);
      setBillingAddress((prev) => prev || billing || address);
      setDeliveryAddress((prev) => prev || delivery || billing || address);
    } else {
      if (billing) setBillingAddress((prev) => prev || billing);
      if (delivery) setDeliveryAddress((prev) => prev || delivery);
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
    const displayName = contactDisplayName(c);

    const addrParts = [c.address, c.postal_code, c.city]
      .filter(Boolean)
      .map((s) => String(s).trim());
    const fullAddress = addrParts.join(" ").trim();

    setClientName(displayName);
    setClientEmail((c.email || "").trim());
    setPrimaryClientAddress(fullAddress);
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
    setCrmOpen(false);
  };

  const selectCrmContact = (c: CrmContact) => {
    setSelectedCrmContactId(String(c.id));
    applyCrmContact(c);
    setCrmOpen(false);
  };

  const [validityDays, setValidityDays] = useState<number>(30);

  // Orientation: gérée globalement via <OrientationGuard />

  // IMPORTANT: id stable au 1er render
  const [lines, setLines] = useState<LineItem[]>([
    { id: "l_1", label: "Prestation", qty: 1, unitPrice: 100, vatRate: 20 },
  ]);

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
  };

  const SAVES_LIMIT = 20;
  const SAVES_TYPE = "devis" as const;

  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState<DevisDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);

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

      await cleanupOldSaves();

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

  const addLine = () =>
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

  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const saveDraft = async (options?: { silent?: boolean }) => {
    const nowISO = new Date().toISOString();
    const finalNumber = number || generateNumber("DEV");
    if (!number) setNumber(finalNumber);

   const normalizedBillingAddress = billingAddress || clientAddress;
   const normalizedDeliveryAddress = sameAddresses ? normalizedBillingAddress : deliveryAddress;

   const snapshot: DevisDraft["snapshot"] = {
  number: finalNumber,
  docDateISO: docDateISO || new Date().toISOString().slice(0, 10),
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
  validityDays,
  lines,
  discountKind,
  discountValue: Number(discountValue) || 0,
  discountDetails,
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
      setFormMessage({ type: "success", text: currentSaveId ? "Devis mis à jour." : "Devis enregistré." });
    }

    return savedId as string | undefined;
  };

  const applyDraftSnapshot = (s: DevisDraft["snapshot"]) => {
    const nextBillingAddress = s.billingAddress || s.clientAddress || "";
    const nextSameAddresses = typeof s.sameAddresses === "boolean"
      ? s.sameAddresses
      : !s.deliveryAddress || s.deliveryAddress === nextBillingAddress;
    const nextDeliveryAddress = nextSameAddresses
      ? nextBillingAddress
      : (s.deliveryAddress || "");

    setNumber(s.number);
    setDocDateISO(s.docDateISO);
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
    setValidityDays(s.validityDays);
    setLines(s.lines);
    setDiscountKind(s.discountKind);
    setDiscountValue(s.discountValue);
    setDiscountDetails(s.discountDetails || "");
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

  const print = () => window.print();

  const buildPdfBlob = async (): Promise<Blob | null> => {
    if (typeof window === "undefined") return null;
    const el = previewRef.current;
    if (!el) return null;

    // Masque temporairement les éléments non imprimables (ex: champs de remise)
    const noPrintEls = Array.from(el.querySelectorAll(`.${styles.noPrint}`)) as HTMLElement[];
    const prev = noPrintEls.map((n) => n.style.display);
    noPrintEls.forEach((n) => (n.style.display = "none"));

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

  const uploadPdfAndOpenCompose = async (to: string, filename: string) => {
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
      setFormMessage({ type: "error", text: "Veuillez d’abord sauvegarder ce devis avant l’envoi." });
      return;
    }

    const pdfBlob = await buildPdfBlob();
    if (!pdfBlob) {
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
  };

  const addCurrentClientToCrm = async () => {
    const displayName = (clientName || "").trim();
    const email = (clientEmail || "").trim();
    const primaryAddress = (clientAddress || billingAddress || "").trim();

    if (!displayName && !email && !primaryAddress) {
      setFormMessage({ type: "error", text: "Renseignez au moins un nom, un email ou une adresse client avant d’ajouter au CRM." });
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
          address: primaryAddress,
          billing_address: (billingAddress || "").trim(),
          delivery_address: sameAddresses ? "" : (deliveryAddress || "").trim(),
          contact_type: "client",
          category: "professionnel",
          notes: [`Ajouté depuis Devis`, purchaseOrderReference ? `PO: ${purchaseOrderReference}` : ""].filter(Boolean).join(" — "),
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getSimpleFrenchErrorMessage(json?.error, "Impossible d’ajouter ce client au CRM."));
      }

      setFormMessage({ type: "success", text: "Client ajouté au CRM." });
    } catch (error) {
      setFormMessage({ type: "error", text: getSimpleFrenchErrorMessage(error, "Impossible d’ajouter ce client au CRM.") });
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
    return "Sélectionner un contact";
  }, [crmLoading, selectedCrmContact]);

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
                setDraftsOpen(true);
              }}
            >
              Sauvegardes
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
              onClick={() => {
                // CRM
                setSelectedCrmContactId("");
                setCrmOpen(false);

                // Client
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

                // Devis
                setCurrentSaveId("");
                setNumber(generateNumber("DEV"));
                setDocDateISO(new Date().toISOString().slice(0, 10));
                setValidityDays(30);

                setDiscountKind("");
                setDiscountValue(0);
                setDiscountDetails("");

                // Lignes
                setLines([{ id: "l_1", label: "Prestation", qty: 1, unitPrice: 100, vatRate: 20 }]);
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
                  <div style={{ fontWeight: 750, fontSize: 16 }}>Sauvegardes (max 20)</div>
                  <button type="button" className={styles.closeBtn} onClick={() => setDraftsOpen(false)}>
                    Fermer
                  </button>
                </div>

                {drafts.length === 0 ? (
                  <div style={{ padding: 14, opacity: 0.85 }}>Aucune sauvegarde pour l’instant.</div>
                ) : (
                  <div style={{ padding: 14, display: "grid", gap: 8 }}>
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
                )}
              </div>
            </div>
          ) : null}

          {/* ✅ Champ CRM style "select blanc" + liste sur 1 ligne + scrollbar au-delà de 10 */}
          <div className={styles.field} ref={crmBoxRef}>
            <label>Importer un contact (CRM)</label>

            <div className={styles.crmSelectWrap}>
              <button
                type="button"
                className={styles.crmSelectBtn}
                onClick={() => setCrmOpen((v) => !v)}
                disabled={crmLoading}
                aria-haspopup="listbox"
                aria-expanded={crmOpen}
              >
                <span className={styles.crmSelectBtnText} title={crmButtonText}>
                  {crmButtonText}
                </span>
                <span className={styles.crmSelectChevron} aria-hidden="true">
                  ▾
                </span>
              </button>

              {crmOpen ? (
                <div className={styles.crmDropdown} role="listbox">
{sortedCrmContacts.map((c) => {
                    const name = contactDisplayName(c);
                    const line = c.email ? `${name} — ${c.email}` : name;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={styles.crmOption}
                        onClick={() => selectCrmContact(c)}
                        title={line}
                      >
                        {line}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {crmError ? (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>⚠️ {crmError}</div>
            ) : null}
          </div>

          <div className={styles.fourCol}>
            <div className={styles.field}>
              <label>Client</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nom du client" />
            </div>

            <div className={styles.field}>
              <label>Email client</label>
              <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="email@client.fr" />
            </div>

            <div className={styles.field}>
              <label>SIREN client (optionnel)</label>
              <input
                value={clientSiren}
                onChange={(e) => setClientSiren(e.target.value)}
                placeholder="Ex : 123456789"
              />
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

          <div className={styles.field}>
            <label>Adresse de facturation</label>
            <input
              value={billingAddress}
              onChange={(e) => setPrimaryClientAddress(e.target.value)}
              placeholder="Adresse, ville"
            />
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
              <div className={styles.field} style={{ marginBottom: 0 }}>
                <label>Adresse de livraison</label>
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Adresse de livraison, ville"
                />
              </div>
            </div>
          ) : null}

          <div className={styles.compactThreeCol}>
            <div className={styles.field}>
              <label>Numéro de devis</label>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="DEV-YYYYMMDD-XXXX"
              />
            </div>

            <div className={styles.field}>
              <label>Date du devis</label>
              <input
                type="date"
                value={docDateISO}
                onChange={(e) => setDocDateISO(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label>Durée de validité (jours)</label>
              <input
                type="number"
                min={1}
                value={validityDays}
                onChange={(e) => setValidityDays(Math.max(1, Number(e.target.value) || 1))}
                placeholder="30"
              />
            </div>
          </div>

          <div className={styles.fourCol}>
            <div className={styles.field}>
              <label>Catégorie d’opération</label>
              <select
                value={operationCategory}
                onChange={(e) => setOperationCategory(e.target.value as (typeof OPERATION_CATEGORY_OPTIONS)[number]["key"])}
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
              <label>Date de prestation / livraison</label>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label>Début de prestation</label>
              <input
                type="date"
                value={servicePeriodStart}
                onChange={(e) => setServicePeriodStart(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label>Fin de prestation</label>
              <input
                type="date"
                value={servicePeriodEnd}
                onChange={(e) => setServicePeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.compactThreeCol}>
            <div className={styles.field}>
              <label>Référence commande / PO</label>
              <input
                value={purchaseOrderReference}
                onChange={(e) => setPurchaseOrderReference(e.target.value)}
                placeholder="Ex : BC-2026-014 / PO-7781"
              />
            </div>

            <div className={styles.field}>
              <label>Acompte demandé</label>
              <select
                value={depositKind}
                onChange={(e) => setDepositKind(e.target.value as "" | "percent" | "amount")}
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
                disabled={!depositKind}
                style={{ width: "100%", minWidth: 0 }}
              />
            </div>
          </div>

          <div className={styles.actionGrid}>
            <button type="button" onClick={() => { void saveDraft(); }} disabled={addingToCrm}>Sauvegarder</button>
            <button type="button" onClick={() => void addCurrentClientToCrm()} disabled={addingToCrm}>
              {addingToCrm ? "Ajout CRM…" : "Ajouter au CRM"}
            </button>
            <button type="button" onClick={() => void convertCurrentDevisToInvoice()}>
              → Convertir en facture
            </button>
            <button
              type="button"
              onClick={async () => {
                const to = (clientEmail || "").trim();
                if (!to) {
                  setFormMessage({ type: "error", text: "Veuillez d’abord ajouter un email client pour envoyer un message." });
                  return;
                }

                const finalNumber = number || generateNumber("DEV");
                if (!number) setNumber(finalNumber);

                await uploadPdfAndOpenCompose(to, `${finalNumber}.pdf`);
              }}
            >
              Envoyer par mail
            </button>
            <button type="button" onClick={print}>
              Imprimer / PDF
            </button>
          </div>

          {vatDispense ? (
            <p style={{ marginTop: 12, opacity: 0.9 }}>
              TVA désactivée : <strong>TVA non applicable (article 293 B du CGI)</strong>
            </p>
          ) : null}
        </div>

        {/* Aperçu document */}
        <div className={styles.preview} ref={previewRef}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 18 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Prestataire</div>
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
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      value={l.label}
                      onChange={(e) => updateLine(l.id, { label: e.target.value })}
                      placeholder="Ex: Entretien boîte de vitesse"
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={l.qty}
                      onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })}
                      style={{ width: 64, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(l.id, { unitPrice: Number(e.target.value) })}
                      style={{ width: 110, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
                    />
                  </td>
                  <td>
                    <select
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
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatEuro(calcLineHT(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={`${styles.previewAddLineWrap} ${styles.noPrint}`}>
            <button type="button" className={styles.previewAddLineBtn} onClick={addLine}>
              + Ajouter une prestation
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", marginTop: 18, gap: 24 }}>
            <div style={{ fontSize: 12, color: "#444", lineHeight: 1.4 }}>
              <div>Les prix sont exprimés en euros. Le devis est valable {validityDays} jours.</div>
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

            <div>
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
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 18 }}>
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
