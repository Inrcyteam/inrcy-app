
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "./agenda.module.css";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";

// Reuse the exact same drawer + content as the Dashboard
// Agenda iNrCy : calendrier natif (plus de connexion Google Agenda)

type CrmContact = {
  id: string;
  display_name?: string;
  last_name: string;
  first_name: string;
  company_name?: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  postal_code?: string;
  siren?: string;
  category?: string;
  contact_type?: string;
  notes?: string;
  important?: boolean;
};

type EventItem = {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  htmlLink: string | null;
  description?: string | null;
  inrcy?: any | null;
};

type DayEvent = EventItem & {
  allDay: boolean;
  startDate: Date | null;
  endDate: Date | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function keyOf(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateOnly(s: string) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  return new Date(y, mo, da, 0, 0, 0, 0);
}

function isDateOnly(s: string | null) {
  return Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Lundi = 1, ... Dimanche = 7
function startOfWeekMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const jsDay = x.getDay(); // 0=Dim, 1=Lun, ...
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeekSunday(d: Date) {
  const s = startOfWeekMonday(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999);
}

function formatMonthLabel(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(d);
}

function formatDayLabel(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    d
  );
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function accentFor(id: string) {
  // petit hash déterministe → look iNrCy sans dépendre de Google colors
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const pick = h % 4;
  return pick === 0 ? "cyan" : pick === 1 ? "purple" : pick === 2 ? "pink" : "orange";
}

function buildCrmDisplayName(firstName: string, lastName: string, companyName?: string) {
  const left = [firstName ?? "", lastName ?? ""].join(" ").replace(/\s+/g, " ").trim();
  const right = (companyName ?? "").trim();
  if (left && right) return `${left} / ${right}`;
  return left || right;
}

function parseCrmDisplayName(v: string) {
  const raw = (v || "").trim();
  if (!raw) return { last_name: "", first_name: "", company_name: "" };
  const parts = raw.split("/");
  const left = (parts[0] || "").trim();
  const right = (parts.slice(1).join("/") || "").trim();
  // Même convention que le CRM : tout le bloc "Nom Prénom" part dans last_name.
  return { last_name: left, first_name: "", company_name: right };
}

export default function AgendaClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cursorMonth, setCursorMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, 0);
  });
  const [query, setQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  // Module Agenda = planning d'interventions iNrCy (mode unique)
  const viewKind = "intervention" as const;

// --- CRM contacts (pour relier un RDV à un contact)
const [contacts, setContacts] = useState<CrmContact[]>([]);
const [contactsLoading, setContactsLoading] = useState(false);

// --- Modale (Intervention / Agenda)
const [rdvOpen, setRdvOpen] = useState(false);
const [rdvMode, setRdvMode] = useState<"create" | "edit">("create");
const [rdvEventId, setRdvEventId] = useState<string>("");
const [rdvSummary, setRdvSummary] = useState("");
const [rdvDate, setRdvDate] = useState<string>(""); // YYYY-MM-DD
const [rdvStart, setRdvStart] = useState<string>("09:00");
const [rdvEnd, setRdvEnd] = useState<string>("10:00");
const [rdvLocation, setRdvLocation] = useState<string>("");
// Adresse structurée (principalement pour les interventions)
const [rdvAddrStreet, setRdvAddrStreet] = useState<string>("");
const [rdvAddrCity, setRdvAddrCity] = useState<string>("");
const [rdvAddrPostal, setRdvAddrPostal] = useState<string>("");
const [rdvNotes, setRdvNotes] = useState<string>("");
const [rdvKind, setRdvKind] = useState<"intervention" | "agenda">("intervention");
const [intType, setIntType] = useState<string>("");
const [intStatus, setIntStatus] = useState<string>("confirmé");
const [intReference, setIntReference] = useState<string>("");
const [rdvContactId, setRdvContactId] = useState<string>("");
const [rdvNewContactName, setRdvNewContactName] = useState<string>("");
const [rdvNewContactFirstName, setRdvNewContactFirstName] = useState<string>("");
const [rdvNewContactCompany, setRdvNewContactCompany] = useState<string>("");
const [rdvNewContactEmail, setRdvNewContactEmail] = useState<string>("");
const [rdvNewContactPhone, setRdvNewContactPhone] = useState<string>("");
const [rdvNewContactAddress, setRdvNewContactAddress] = useState<string>("");
const [rdvNewContactCity, setRdvNewContactCity] = useState<string>("");
const [rdvNewContactPostal, setRdvNewContactPostal] = useState<string>("");


const [rdvNewContactSiren, setRdvNewContactSiren] = useState<string>("");
const [rdvNewContactCategory, setRdvNewContactCategory] = useState<"particulier" | "professionnel" | "collectivite_publique">("particulier");
const [rdvNewContactType, setRdvNewContactType] = useState<"prospect" | "client" | "fournisseur" | "partenaire" | "autre">("prospect");
const [rdvNewContactImportant, setRdvNewContactImportant] = useState<boolean>(false);
const [rdvNewContactNotes, setRdvNewContactNotes] = useState<string>("");
const [crmAddFeedback, setCrmAddFeedback] = useState<string>("");
const [rdvSaving, setRdvSaving] = useState(false);
const [rdvError, setRdvError] = useState<string | null>(null);

// Auto-remplissage des champs suivants quand un contact CRM est sélectionné
useEffect(() => {
  if (!rdvContactId) return;
  const c = contacts.find((x) => x.id === rdvContactId);
  if (!c) return;

  // Remplit l'adresse structurée (intervention)
  setRdvAddrStreet((c.address ?? "").trim());
  setRdvAddrCity((c.city ?? "").trim());
  setRdvAddrPostal((c.postal_code ?? "").trim());

  // Remplit aussi le champ "Lieu" (rdv agenda)
  const line = composeAddressLine(c.address ?? "", c.postal_code ?? "", c.city ?? "");
  setRdvLocation(line);

  // Remplit le bloc "Coordonnées" (copie locale, ne modifie pas le CRM)
  const dn = buildCrmDisplayName((c.first_name ?? "").trim(), (c.last_name ?? "").trim(), (c.company_name ?? "").trim());
  setRdvNewContactName(dn);
  // Champs historiques (on ne les affiche plus, mais on les garde pour compat)
  setRdvNewContactFirstName((c.first_name ?? "").trim());
  setRdvNewContactCompany((c.company_name ?? "").trim());
  setRdvNewContactEmail((c.email ?? "").trim());
  setRdvNewContactPhone((c.phone ?? "").trim());
  setRdvNewContactAddress((c.address ?? "").trim());
  setRdvNewContactCity((c.city ?? "").trim());
  setRdvNewContactPostal((c.postal_code ?? "").trim());
  setRdvNewContactSiren((c.siren ?? "").trim());
  setRdvNewContactCategory((c.category as any) || "particulier");
  setRdvNewContactType((c.contact_type as any) || "prospect");
  setRdvNewContactImportant(Boolean(c.important));
  setRdvNewContactNotes((c.notes ?? "").trim());
  setCrmAddFeedback("");
}, [rdvContactId, contacts]);


const CATEGORY_LABEL: Record<"particulier" | "professionnel" | "collectivite_publique", string> = {
  particulier: "Particulier",
  professionnel: "Professionnel",
  collectivite_publique: "Institution",
};

const TYPE_LABEL: Record<"prospect" | "client" | "fournisseur" | "partenaire" | "autre", string> = {
  prospect: "Prospect",
  client: "Client",
  fournisseur: "Fournisseur",
  partenaire: "Partenaire",
  autre: "Autre",
};
function composeAddressLine(street: string, postal: string, city: string) {
  const s = (street ?? "").trim();
  const p = (postal ?? "").trim();
  const c = (city ?? "").trim();
  const tail = [p, c].filter(Boolean).join(" ").trim();
  return [s, tail].filter(Boolean).join(", ").trim();
}



async function loadContacts() {
  setContactsLoading(true);
  const r = await fetch("/api/crm/contacts").catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  setContacts(Array.isArray((j as any)?.contacts) ? (j as any).contacts : []);
  setContactsLoading(false);
}

function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

  useEffect(() => {
  // Deep-link from CRM: /dashboard/agenda?action=new&contactId=...&contactName=...
  const action = (searchParams?.get("action") || "").toLowerCase();
  if (action !== "new") return;

  const contactId = searchParams?.get("contactId") || "";
  const contactName = searchParams?.get("contactName") || "";
  const contactFirstName = searchParams?.get("contactFirstName") || "";
  const contactCompany = searchParams?.get("contactCompany") || "";
  const contactEmail = searchParams?.get("contactEmail") || "";
  const contactPhone = searchParams?.get("contactPhone") || "";
  const contactAddress = searchParams?.get("contactAddress") || "";
  const contactPostalCode = searchParams?.get("contactPostalCode") || "";
  const contactCity = searchParams?.get("contactCity") || "";

  // Ensure we are in Intervention mode for the CRM workflow
  
  // Load contacts (lazy) so the dropdown can resolve contactId if it exists
  loadContacts();

  // Open create modal on selected date and prefill
  openCreateRdv(selectedDate);
  if (contactId) setRdvContactId(contactId);
  if (contactName) setRdvNewContactName(contactName);
  if (contactFirstName) setRdvNewContactFirstName(contactFirstName);
  if (contactCompany) setRdvNewContactCompany(contactCompany);
  if (contactEmail) setRdvNewContactEmail(contactEmail);
  if (contactPhone) setRdvNewContactPhone(contactPhone);
  if (contactAddress) setRdvNewContactAddress(contactAddress);
  if (contactCity) setRdvNewContactCity(contactCity);
  if (contactPostalCode) setRdvNewContactPostal(contactPostalCode);

  // Clean URL to avoid reopening on refresh/navigation
  try {
    const q = new URLSearchParams(searchParams?.toString() || "");
    q.delete("action");
    router.replace(`/dashboard/agenda?${q.toString()}`);
  } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [searchParams]);

function openCreateRdv(date: Date) {
  setRdvMode("create");
  setRdvEventId("");
  setRdvKind(viewKind);
  setRdvSummary("Évènement");
  setRdvDate(toDateOnly(date));
  setRdvStart("09:00");
  setRdvEnd("10:00");
  setRdvLocation("");
  setRdvAddrStreet("");
  setRdvAddrCity("");
  setRdvAddrPostal("");
  setRdvNotes("");
  setIntType(viewKind === "intervention" ? "" : "");
  setIntStatus("confirmé");
  setIntReference("");
  setRdvContactId("");
  setRdvNewContactName("");
  setRdvNewContactFirstName("");
  setRdvNewContactCompany("");
  setRdvNewContactEmail("");
  setRdvNewContactPhone("");
  setRdvNewContactAddress("");
  setRdvNewContactCity("");
  setRdvNewContactPostal("");
setRdvError(null);
  setRdvOpen(true);
}

function openEditRdv(ev: DayEvent) {
  setRdvMode("edit");
  setRdvEventId(ev.id);
  const k = (ev as any)?.inrcy?.kind === "agenda" ? "agenda" : "intervention";
  setRdvKind(k);
  setRdvSummary(ev.summary || (k === "intervention" ? "Intervention" : "Rendez-vous"));

  // date + heures
  const start = ev.startDate ?? (ev.start ? new Date(ev.start) : null);
  const end = ev.endDate ?? (ev.end ? new Date(ev.end) : null);
  const baseDate = start ?? selectedDate;
  setRdvDate(toDateOnly(baseDate));

  const startH = start ? `${pad2(start.getHours())}:${pad2(start.getMinutes())}` : "09:00";
  const endH = end ? `${pad2(end.getHours())}:${pad2(end.getMinutes())}` : "10:00";
  setRdvStart(startH);
  setRdvEnd(endH);

  setRdvLocation(ev.location ?? "");
  // Tentative de reconstitution d'une adresse structurée si disponible
  const meta = (ev as any)?.inrcy?.intervention ?? null;
  const addr = (meta as any)?.address;
  if (addr && typeof addr === "object") {
    setRdvAddrStreet(String(addr.street ?? ""));
    setRdvAddrPostal(String(addr.postal_code ?? ""));
    setRdvAddrCity(String(addr.city ?? ""));
  } else if (typeof addr === "string") {
    // rétro-compat: ancien champ string
    setRdvAddrStreet(String(addr));
    setRdvAddrPostal("");
    setRdvAddrCity("");
  } else {
    setRdvAddrStreet("");
    setRdvAddrPostal("");
    setRdvAddrCity("");
  }
  setRdvNotes("");

  setIntType(String(meta?.type ?? ""));
  setIntStatus(String(meta?.status ?? "confirmé"));
  setIntReference(String(meta?.reference ?? ""));

  setRdvContactId("");
  setRdvError(null);
  setRdvOpen(true);
}

async function ensureContact(): Promise<null | {
  display_name: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  postal_code?: string;
  siren?: string;
  category?: any;
  contact_type?: any;
  notes?: string;
  important?: boolean;
}> {
  // 1) Contact sélectionné (déjà dans le CRM)
  if (rdvContactId) {
    const c = contacts.find((x) => x.id === rdvContactId);
    if (!c) return null;

    const display_name =
      `${(c.first_name ?? "").trim()} ${(c.last_name ?? "").trim()}`.trim() ||
      (c.company_name ?? "").trim() ||
      "Contact";

    const address = (c.address ?? "").trim();
    const city = (c.city ?? "").trim();
    const postal_code = (c.postal_code ?? "").trim();

    return {
      display_name,
      first_name: (c.first_name ?? "").trim() || undefined,
      last_name: (c.last_name ?? "").trim() || undefined,
      company_name: (c.company_name ?? "").trim() || undefined,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address,
      city: city || undefined,
      postal_code: postal_code || undefined,
      siren: (c.siren ?? "").trim() || undefined,
      category: (c.category as any) || "particulier",
      contact_type: (c.contact_type as any) || "prospect",
      notes: (c.notes ?? "").trim() || undefined,
      important: Boolean(c.important),
    };
  }

  // 2) Contact saisi dans le bloc Coordonnées (non enregistré automatiquement)
  const rawDisplayName = rdvNewContactName.trim();
  const parsed = parseCrmDisplayName(rawDisplayName);
  const lastName = parsed.last_name.trim();
  const firstName = parsed.first_name.trim();
  const companyName = parsed.company_name.trim();
  const email = rdvNewContactEmail.trim();
  const phone = rdvNewContactPhone.trim();
  const address = rdvNewContactAddress.trim();
  const city = rdvNewContactCity.trim();
  const postal_code = rdvNewContactPostal.trim();

  if (!rawDisplayName && !email && !phone && !address) return null;

  const display_name = rawDisplayName || "Nouveau contact";

  return {
    display_name,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    company_name: companyName || undefined,
    email,
    phone,
    address,
    city: city || undefined,
    postal_code: postal_code || undefined,
    siren: rdvNewContactSiren.trim() || undefined,
    category: rdvNewContactCategory,
    contact_type: rdvNewContactType,
    notes: rdvNewContactNotes.trim() || undefined,
    important: rdvNewContactImportant,
  };
}

async function addContactToCrmFromCoords() {
  setCrmAddFeedback("");
  try {
    // Si un contact CRM est déjà sélectionné, il est forcément déjà enregistré
    if (rdvContactId) {
      setCrmAddFeedback("Déjà ajouté au CRM");
      return;
    }

    const rawDisplayName = rdvNewContactName.trim();
    const parsed = parseCrmDisplayName(rawDisplayName);
    const firstName = parsed.first_name.trim();
    const lastName = parsed.last_name.trim();
    const companyName = parsed.company_name.trim();
    const email = rdvNewContactEmail.trim();
    const phone = rdvNewContactPhone.trim();
    const address = rdvNewContactAddress.trim();
    const city = rdvNewContactCity.trim();
    const postal_code = rdvNewContactPostal.trim();
    const siren = rdvNewContactSiren.trim();
    const notes = rdvNewContactNotes.trim();

    const display_name = (rawDisplayName || "Nouveau contact").trim();

    if (!display_name && !email && !phone) {
      setCrmAddFeedback("Renseigne au minimum un nom / email / téléphone");
      return;
    }

    const normEmail = email.toLowerCase();
    const normPhone = phone.replace(/\D/g, "");

    const existing = contacts.find((c) => {
      const ce = (c.email ?? "").toLowerCase();
      const cp = (c.phone ?? "").replace(/\D/g, "");
      const dn = (c.display_name ?? "").toLowerCase().trim();
      if (normEmail && ce && ce === normEmail) return true;
      if (normPhone && cp && cp === normPhone) return true;
      if (display_name && dn && dn === display_name.toLowerCase()) return true;
      return false;
    });

    if (existing) {
      setRdvContactId(existing.id);
      setCrmAddFeedback("Déjà ajouté au CRM");
      return;
    }

    const r = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
body: JSON.stringify({
  display_name,
  first_name: firstName || undefined,
  last_name: lastName || undefined,
  company_name: companyName || undefined,
  email,
  phone,
  address,
  city: city || undefined,
  postal_code: postal_code || undefined,
  siren: siren || undefined,
  category: rdvNewContactCategory,
  contact_type: rdvNewContactType,
  notes: notes || undefined,
  important: rdvNewContactImportant,
}),

    }).catch(() => null);

    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) throw new Error((j as any)?.error ?? "Impossible d’ajouter le contact au CRM");

    await loadContacts();
    const createdId = (j as any)?.id as string | undefined;

    // Si l’API renvoie l’id, on sélectionne directement le contact; sinon on tente de le retrouver
    if (createdId) {
      setRdvContactId(createdId);
    } else {
      // fallback: recherche par email / téléphone / nom
      const updated = await fetch("/api/crm/contacts").then((x) => x.json()).catch(() => null);
      if (Array.isArray(updated)) {
        const found = updated.find((c: any) => (email && (c.email ?? "").toLowerCase() === normEmail) || (normPhone && (c.phone ?? "").replace(/\D/g, "") === normPhone) || ((c.display_name ?? "").toLowerCase().trim() === display_name.toLowerCase()));
        if (found?.id) setRdvContactId(found.id);
      }
    }

    setCrmAddFeedback("Ajouté au CRM ✅");
  } catch (e: any) {
    setCrmAddFeedback(e?.message ?? "Erreur");
  }
}

function buildIso(dateOnly: string, hhmm: string) {
  // construit un ISO local -> Date -> ISO
  const [y, m, d] = dateOnly.split("-").map((x) => Number(x));
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return dt.toISOString();
}

async function submitRdv() {
  setRdvSaving(true);
  setRdvError(null);
  try {
    // Doit pouvoir s'enregistrer même si aucun champ n'est rempli → on applique des valeurs par défaut.
    const safeSummary = rdvSummary.trim() || "Évènement";

    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rdvDate) ? rdvDate : keyOf(selectedDate);
    const safeStart = /^\d{2}:\d{2}$/.test(rdvStart) ? rdvStart : "09:00";
    const safeEnd = /^\d{2}:\d{2}$/.test(rdvEnd) ? rdvEnd : "10:00";

    const startIso = buildIso(safeDate, safeStart);
    let endIso = buildIso(safeDate, safeEnd);

    // Si fin <= début, on force +60 min
    if (Date.parse(endIso) <= Date.parse(startIso)) {
      const dt = new Date(Date.parse(startIso));
      dt.setMinutes(dt.getMinutes() + 60);
      endIso = dt.toISOString();
    }
    const contact = await ensureContact();

    const coordsLocation = composeAddressLine(rdvNewContactAddress.trim(), rdvNewContactPostal.trim(), rdvNewContactCity.trim());
    const structuredLocation = (rdvLocation.trim() || coordsLocation).trim();

    const payload: any = {
      summary: safeSummary,
      location: structuredLocation || null,
      description: rdvNotes.trim(),
      start: startIso,
      end: endIso,
      contact,
      inrcy: {
        kind: rdvKind,
        contact: contact ?? undefined,
        intervention:
          rdvKind === "intervention"
            ? {
                type: intType.trim() || undefined,
                status: intStatus.trim() || undefined,
                address: rdvLocation.trim()
                  ? { street: rdvLocation.trim() || undefined }
                  : {
                      street: rdvNewContactAddress.trim() || undefined,
                      city: rdvNewContactCity.trim() || undefined,
                      postal_code: rdvNewContactPostal.trim() || undefined,
                    },
                reference: intReference.trim() || undefined,
              }
            : undefined,
      },
    };

    if (rdvMode === "create") {
      const r = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "Impossible de créer le rendez-vous");
    } else {
      const r = await fetch(`/api/calendar/events?id=${encodeURIComponent(rdvEventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j?.error ?? "Impossible de modifier le rendez-vous");
    }

    setRdvOpen(false);
    await loadEventsForMonth(cursorMonth);
  } catch (e: any) {
    setRdvError(e?.message ?? "Erreur");
  } finally {
    setRdvSaving(false);
  }
}

async function deleteRdv() {
  if (!rdvEventId) return;
  setRdvSaving(true);
  setRdvError(null);
  try {
    const r = await fetch(`/api/calendar/events?id=${encodeURIComponent(rdvEventId)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j?.error ?? "Impossible de supprimer");
    setRdvOpen(false);
    await loadEventsForMonth(cursorMonth);
  } catch (e: any) {
    setRdvError(e?.message ?? "Erreur");
  } finally {
    setRdvSaving(false);
  }
}

async function deleteEventById(id: string) {
  if (!id) return;
  try {
    const r = await fetch(`/api/calendar/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j?.error ?? "Impossible de supprimer");
    await loadEventsForMonth(cursorMonth);
  } catch (e: any) {
    // Affiche l'erreur dans la modale si elle est ouverte, sinon en haut
    const msg = e?.message ?? "Erreur";
    if (rdvOpen) setRdvError(msg);
    else setError(msg);
  }
}


  async function loadEventsForMonth(monthDate: Date) {
    setLoading(true);
    setError(null);

    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const gridStart = startOfWeekMonday(monthStart);
    const gridEnd = endOfWeekSunday(monthEnd);

    // timeMax exclusif côté Google : on ajoute 1 jour au dernier jour inclus
    const timeMin = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate(), 0, 0, 0, 0);
    const timeMax = addDays(new Date(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate(), 0, 0, 0, 0), 1);

    const r = await fetch(
      `/api/calendar/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(
        timeMax.toISOString()
      )}`
    );
    const j = await r.json().catch(() => ({}));
    setLoading(false);

    if (!r.ok || !j.ok) {
      setError(j?.error ?? "Impossible de charger l’agenda");
      return;
    }
    setEvents(Array.isArray(j.events) ? j.events : []);
  }

  useEffect(() => {
    // Initial load
    loadEventsForMonth(cursorMonth);
    loadContacts();
  }, []);

  useEffect(() => {
    loadEventsForMonth(cursorMonth);
  }, [cursorMonth]);


  const monthStart = useMemo(() => startOfMonth(cursorMonth), [cursorMonth]);
  const monthEnd = useMemo(() => endOfMonth(cursorMonth), [cursorMonth]);
  const gridStart = useMemo(() => startOfWeekMonday(monthStart), [monthStart]);
  const gridEnd = useMemo(() => endOfWeekSunday(monthEnd), [monthEnd]);

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = new Date(gridStart);
    while (d <= gridEnd) {
      out.push(new Date(d));
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  const normalized = useMemo<DayEvent[]>(() => {
    return events.map((e) => {
      const allDay = isDateOnly(e.start);
      const startDate = e.start ? (allDay ? parseDateOnly(e.start) : new Date(e.start)) : null;
      const endDate = e.end
        ? isDateOnly(e.end)
          ? parseDateOnly(e.end)
          : new Date(e.end)
        : null;
      return { ...e, allDay, startDate, endDate };
    });
  }, [events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();

    const push = (k: string, ev: DayEvent) => {
      const arr = map.get(k) ?? [];
      arr.push(ev);
      map.set(k, arr);
    };

    for (const ev of normalized) {
      if (!ev.startDate) continue;

      if (ev.allDay) {
        // all-day : end.date est exclusif
        const s = new Date(ev.startDate);
        const endExcl = ev.endDate ? new Date(ev.endDate) : addDays(s, 1);
        let d = new Date(s);
        while (d < endExcl) {
          push(keyOf(d), ev);
          d = addDays(d, 1);
        }
      } else {
        // timed : si ça chevauche plusieurs jours, on l'affiche sur chaque jour touché (comme Google)
        const s = new Date(ev.startDate);
        const e = ev.endDate ? new Date(ev.endDate) : new Date(ev.startDate);
        const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
        const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0, 0, 0);
        let d = new Date(startDay);
        while (d <= endDay) {
          push(keyOf(d), ev);
          d = addDays(d, 1);
        }
      }
    }

    // tri : all-day d'abord, puis heure
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        const ta = a.startDate ? a.startDate.getTime() : 0;
        const tb = b.startDate ? b.startDate.getTime() : 0;
        return ta - tb;
      });
      map.set(k, arr);
    }
    return map;
  }, [normalized]);

  const selectedKey = useMemo(() => keyOf(selectedDate), [selectedDate]);
  const selectedEvents = useMemo(() => {
    return eventsByDay.get(selectedKey) ?? [];
  }, [eventsByDay, selectedKey]);

  const globalMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return normalized
      .filter((e) => (e.summary ?? "").toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const ta = a.startDate ? a.startDate.getTime() : 0;
        const tb = b.startDate ? b.startDate.getTime() : 0;
        return ta - tb;
      });
  }, [normalized, query]);


  const todayKey = useMemo(() => keyOf(new Date()), []);

  const goToday = () => {
    const t = startOfMonth(new Date());
    setCursorMonth(t);
    const now = new Date();
    setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
  };

  const goPrev = () => {
    const d = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1);
    setCursorMonth(d);
  };

  const goNext = () => {
    const d = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1);
    setCursorMonth(d);
  };

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.brand}>
            <Image
              src="/inrcalendar-logo.png"
              alt="Interventions iNrCy"
              width={154}
              height={64}
              priority
            />

            <div className={styles.brandText}>
              <div className={styles.brandRow}>
                <span className={styles.tagline}>Plus qu'un agenda ! Pensé pour le terrain.</span>
              </div>
            </div>
          </div>

          
          <div className={styles.headerActions}>
            {/* Desktop: recherche globale + boutons texte */}
            <div className={`${styles.headerSearch} ${styles.desktopOnly}`}>
              <input
                className={styles.headerSearchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un évènement..."
              />

              <ResponsiveActionButton
                desktopLabel="Fermer"
                mobileIcon="✕"
                onClick={() => router.push("/dashboard")}
              />
            </div>

            {/* Mobile: icônes Loupe / Fermer */}
            <div className={styles.mobileOnly}>
              <button
                className={`${styles.btnGhost} ${styles.iconOnlyBtn}`}
                onClick={() => setShowMobileSearch((v) => !v)}
                aria-label="Rechercher"
                title="Rechercher"
                type="button"
              >
                <span aria-hidden>🔎</span>
              </button>

              <ResponsiveActionButton
                desktopLabel="Fermer"
                mobileIcon="✕"
                onClick={() => router.push("/dashboard")}
              />
            </div>
          </div>

		</div>

		{/* Mobile: barre de recherche globale */}
        {showMobileSearch && (
          <div className={`${styles.mobileSearchBar} ${styles.mobileOnly}`}>
            <input
              className={styles.headerSearchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un évènement..."
            />
          </div>
        )}

		<div className={styles.layout}>
            {/* CALENDRIER */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.monthLabel} style={{ textTransform: "capitalize" }}>
                  {formatMonthLabel(cursorMonth)}
                </div>

                <div className={styles.rangeHint}>
                  Vue mensuelle — clique un jour pour voir les détails.
                </div>

                <div className={styles.headerControls}>
                  <button className={styles.btnIcon} onClick={goPrev} aria-label="Mois précédent" title="Mois précédent">
                    ‹
                  </button>
                  <button className={styles.btnIcon} onClick={goToday} aria-label="Aujourd’hui" title="Aujourd’hui">
                    ●
                  </button>
                  <button className={styles.btnIcon} onClick={goNext} aria-label="Mois suivant" title="Mois suivant">
                    ›
                  </button>
                  <button
                    className={styles.btnIcon}
                    onClick={() => loadEventsForMonth(cursorMonth)}
                    disabled={loading}
                    aria-label="Actualiser"
                    title="Actualiser"
                  >
                    {loading ? "…" : "↻"}
                  </button>
                </div>
              </div>

              <div className={styles.calendar}>
                {error && <div className={styles.empty}>{error}</div>}

                <div className={styles.dowRow}>
                  {[
                    "Lun",
                    "Mar",
                    "Mer",
                    "Jeu",
                    "Ven",
                    "Sam",
                    "Dim",
                  ].map((d) => (
                    <div key={d} className={styles.dow}>
                      {d}
                    </div>
                  ))}
                </div>

                <div className={styles.grid}>
                  {days.map((d) => {
                    const k = keyOf(d);
                    const isOutside = d.getMonth() !== cursorMonth.getMonth();
                    const isSelected = k === selectedKey;
                    const isToday = k === todayKey;
                    const list = eventsByDay.get(k) ?? [];
                    const show = list.slice(0, 3);
                    const more = list.length - show.length;

                    return (
                      <div
                        key={k}
                        className={`${styles.day} ${isOutside ? styles.dayOutside : ""} ${isSelected ? styles.daySelected : ""}`}
                        onClick={() => setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0))}
                        role="button"
                        tabIndex={0}
                      >
                        <div className={styles.dayNumWrap}>
                          <div className={styles.dayNumRow}>
                            <span className={styles.dayNumBubble}>{d.getDate()}</span>
                            {list.length > 0 ? <span className={styles.hasEventsDot} aria-hidden /> : null}
                          </div>
                          {isToday && <div className={styles.pillToday}>Aujourd’hui</div>}
                        </div>

                        <div className={styles.chips}>
                          {show.map((ev) => {
                            const accent = accentFor(ev.id);
                            const accentClass =
                              accent === "cyan"
                                ? styles.accentCyan
                                : accent === "purple"
                                ? styles.accentPurple
                                : accent === "pink"
                                ? styles.accentPink
                                : styles.accentOrange;

                            const time = !ev.allDay && ev.startDate ? formatTime(ev.startDate) : "";
                            const label = ev.allDay ? ev.summary : `${time} — ${ev.summary}`;

                            return (
                              <div
                                key={`${k}-${ev.id}`}
                                className={`${styles.chip} ${ev.allDay ? styles.chipAllDay : ""} ${accentClass}`}
                                title={label}
                              >
                                {label}
                              </div>
                            );
                          })}
                          {more > 0 && <div className={styles.chipMore}>+{more} autre{more > 1 ? "s" : ""}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SIDEBAR DETAILS */}
            <div className={styles.card}>
              <div className={styles.sideHeaderCentered}>
                <div className={styles.sideDate}>
                  {formatDayLabel(selectedDate)}
                </div>
                <div className={styles.sideEventsCount}>
                  {selectedEvents.length} événement{selectedEvents.length > 1 ? "s" : ""}
                </div>
                <button className={`${styles.btnPrimaryWide} ${styles.btnBubble}`} onClick={() => openCreateRdv(selectedDate)}>
                  ＋ Évènement
                </button>
                <div className={styles.sideDivider} />
              </div>

              <div className={styles.sidebarBody}>
                <div className={styles.sideTitle}>Détails du jour</div>
{query.trim() ? (
                  <>
                    <div className={styles.list}>
                      {globalMatches.length === 0 && <div className={styles.empty}>Aucun résultat.</div>}

                      {globalMatches.map((ev) => {
                        const accent = accentFor(ev.id);
                        const accentClass =
                          accent === "cyan"
                            ? styles.accentCyan
                            : accent === "purple"
                            ? styles.accentPurple
                            : accent === "pink"
                            ? styles.accentPink
                            : styles.accentOrange;

                        const when = ev.allDay
                          ? "Toute la journée"
                          : ev.startDate
                          ? `${formatTime(ev.startDate)}${ev.endDate ? ` → ${formatTime(ev.endDate)}` : ""}`
                          : "";

                        const dayLabel = ev.startDate ? formatDayLabel(ev.startDate) : "";

                        return (
                          <div
                            key={ev.id}
                            className={`${styles.eventRow} ${accentClass}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (!ev.startDate) return;
                              const d = new Date(ev.startDate.getFullYear(), ev.startDate.getMonth(), ev.startDate.getDate(), 0, 0, 0, 0);
                              setSelectedDate(d);
                              setCursorMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                              setShowMobileSearch(false);
                            }}
                          >
                            <div className={styles.eventMain}>
                              <div className={styles.eventTitle}>{ev.summary || "Sans titre"}</div>
                              <div className={styles.eventMeta}>
                                {dayLabel}
                                {when ? ` • ${when}` : ""}
                                {ev.location ? ` • ${ev.location}` : ""}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
					<div className={styles.list}>
					  {selectedEvents.length === 0 && <div className={styles.empty}>Aucun évènement ce jour-là.</div>}
					  {selectedEvents.map((ev) => {
						const accent = accentFor(ev.id);
						const accentClass =
						  accent === "cyan"
							? styles.accentCyan
							: accent === "purple"
							? styles.accentPurple
							: accent === "pink"
							? styles.accentPink
							: styles.accentOrange;

						const when = ev.allDay
						  ? "Toute la journée"
						  : ev.startDate
						  ? `${formatTime(ev.startDate)}${ev.endDate ? ` → ${formatTime(ev.endDate)}` : ""}`
						  : "";

						return (
						  <div
							key={ev.id}
							className={`${styles.eventRow} ${accentClass}`}
							role="button"
							tabIndex={0}
							onClick={() => openEditRdv(ev)}
							onKeyDown={(e) => {
							  if (e.key === "Enter" || e.key === " ") openEditRdv(ev);
							}}
						  >
							<div className={styles.eventMain}>
							  <div className={styles.eventTitle}>{ev.summary || "Sans titre"}</div>
							  <div className={styles.eventMeta}>
								{when}
								{ev.location ? ` • ${ev.location}` : ""}
							  </div>
							</div>
							<button
							  type="button"
							  aria-label="Supprimer l’évènement"
							  onClick={(e) => {
							    e.stopPropagation();
							    if (confirm("Supprimer cet évènement ?")) deleteEventById(ev.id);
							  }}
							  style={{
							    marginLeft: "auto",
							    background: "transparent",
							    border: "none",
							    color: "inherit",
							    opacity: 0.8,
							    cursor: "pointer",
							    padding: 6,
							    borderRadius: 8,
							  }}
							  title="Supprimer"
							>
							  🗑️
							</button>
						  </div>
						);
					  })}
					</div>
                  </>
                )}

              </div>
            </div>
          </div>

      </div>

      {/* MODALE création/édition */}
      {rdvOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div style={{ fontWeight: 950 }}>
                {rdvMode === "create" ? "Nouvel évènement" : "Modifier l’évènement"}
              </div>
              <button className={styles.btnGhost} onClick={() => setRdvOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {rdvError && <div className={styles.modalError}>{rdvError}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className={styles.field}>
                  <div className={styles.label}>Catégorie</div>
                  <select className={styles.input} value={rdvKind} onChange={(e) => setRdvKind(e.target.value as any)}>
                    <option value="intervention">Intervention</option>
                    <option value="agenda">Rendez-vous</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <div className={styles.label}>Référence (optionnel)</div>
                  <input className={styles.input} value={intReference} onChange={(e) => setIntReference(e.target.value)} placeholder="Ex: CH-2026-021" />
                </div>
              </div>

              <div className={styles.field} style={{ marginTop: 10 }}>
                <div className={styles.label}>Titre</div>
                <input className={styles.input} value={rdvSummary} onChange={(e) => setRdvSummary(e.target.value)} placeholder="Ex: Intervention / Rendez-vous" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div className={styles.field}>
                    <div className={styles.label}>Type</div>
                    <input className={styles.input} value={intType} onChange={(e) => setIntType(e.target.value)} placeholder="Ex: Dépannage / Chantier / Entretien" />
                  </div>
                  <div className={styles.field}>
                    <div className={styles.label}>Statut</div>
                    <select className={styles.input} value={intStatus} onChange={(e) => setIntStatus(e.target.value)}>
                      <option value="devis">Devis</option>
                      <option value="confirmé">Confirmé</option>
                      <option value="en cours">En cours</option>
                      <option value="terminé">Terminé</option>
                      <option value="annulé">Annulé</option>
                    </select>
                  </div>
                </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                <div className={styles.field}>
                  <div className={styles.label}>Date</div>
                  <input className={styles.input} value={rdvDate} onChange={(e) => setRdvDate(e.target.value)} placeholder="YYYY-MM-DD" />
                </div>
                <div className={styles.field}>
                  <div className={styles.label}>Début</div>
                  <input className={styles.input} value={rdvStart} onChange={(e) => setRdvStart(e.target.value)} placeholder="09:00" />
                </div>
                <div className={styles.field}>
                  <div className={styles.label}>Fin</div>
                  <input className={styles.input} value={rdvEnd} onChange={(e) => setRdvEnd(e.target.value)} placeholder="10:00" />
                </div>
              </div>

              {/* Contact CRM + coordonnées */}
              <div className={styles.contactRow} style={{ marginTop: 10 }}>
                <div className={styles.field} style={{ flex: 1, minWidth: 260 }}>
                  <div className={styles.label}>Contact CRM</div>
                  <select
                    className={styles.input}
                    value={rdvContactId}
                    onChange={(e) => setRdvContactId(e.target.value)}
                  >
                    <option value="">— Aucun —</option>
                    {contacts.map((c) => {
                      const label =
                        (c.company_name && c.company_name.trim()) ||
                        [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
                        c.email ||
                        "Contact";
                      return (
                        <option key={c.id} value={c.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  {contactsLoading && (
                    <div className={styles.eventSub} style={{ marginTop: 6 }}>
                      Chargement contacts…
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={addContactToCrmFromCoords}
                  style={{ alignSelf: "end", height: 42, borderRadius: 12 }}
                  title="Ajoute le contact au CRM (une seule fois)"
                >
                  Ajouter au CRM
                </button>
</div>

              {crmAddFeedback ? (
                <div className={styles.eventSub} style={{ marginTop: 6 }}>
                  {crmAddFeedback}
                </div>
              ) : null}

              <div className={styles.coordsBlock}>
                <div className={styles.coordsTitle}>Coordonnées</div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <input
                    className={styles.input}
                    value={rdvNewContactName}
                    onChange={(e) => {
                      setRdvNewContactName(e.target.value);
                      setCrmAddFeedback("");
                    }}
                    placeholder="Nom Prénom / Raison sociale"
                  />
                  <input
                    className={styles.input}
                    value={rdvNewContactSiren}
                    onChange={(e) => {
                      setRdvNewContactSiren(e.target.value);
                      setCrmAddFeedback("");
                    }}
                    placeholder="SIREN (optionnel)"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <input className={styles.input} value={rdvNewContactPhone} onChange={(e) => { setRdvNewContactPhone(e.target.value); setCrmAddFeedback(""); }} placeholder="Téléphone" />
                  <input className={styles.input} value={rdvNewContactEmail} onChange={(e) => { setRdvNewContactEmail(e.target.value); setCrmAddFeedback(""); }} placeholder="Email" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                  <input className={styles.input} value={rdvNewContactAddress} onChange={(e) => { setRdvNewContactAddress(e.target.value); setCrmAddFeedback(""); }} placeholder="Adresse" />
                  <input className={styles.input} value={rdvNewContactCity} onChange={(e) => { setRdvNewContactCity(e.target.value); setCrmAddFeedback(""); }} placeholder="Ville" />
                  <input className={styles.input} value={rdvNewContactPostal} onChange={(e) => { setRdvNewContactPostal(e.target.value); setCrmAddFeedback(""); }} placeholder="Code postal" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10, alignItems: "end" }}>
                  <div className={styles.field} style={{ marginTop: 0 }}>
                    <div className={styles.label}>Catégorie</div>
                    <select
                      className={styles.input}
                      value={rdvNewContactCategory}
                      onChange={(e) => {
                        setRdvNewContactCategory(e.target.value as any);
                        setCrmAddFeedback("");
                      }}
                    >
                      <option value="particulier">{CATEGORY_LABEL.particulier}</option>
                      <option value="professionnel">{CATEGORY_LABEL.professionnel}</option>
                      <option value="collectivite_publique">{CATEGORY_LABEL.collectivite_publique}</option>
                    </select>
                  </div>

                  <div className={styles.field} style={{ marginTop: 0 }}>
                    <div className={styles.label}>Type</div>
                    <select
                      className={styles.input}
                      value={rdvNewContactType}
                      onChange={(e) => {
                        setRdvNewContactType(e.target.value as any);
                        setCrmAddFeedback("");
                      }}
                    >
                      <option value="prospect">{TYPE_LABEL.prospect}</option>
                      <option value="client">{TYPE_LABEL.client}</option>
                      <option value="fournisseur">{TYPE_LABEL.fournisseur}</option>
                      <option value="partenaire">{TYPE_LABEL.partenaire}</option>
                      <option value="autre">{TYPE_LABEL.autre}</option>
                    </select>
                  </div>

                  <label className={styles.importantToggle} style={{ height: 42 }}>
                    <input
                      type="checkbox"
                      checked={rdvNewContactImportant}
                      onChange={(e) => {
                        setRdvNewContactImportant(e.target.checked);
                        setCrmAddFeedback("");
                      }}
                    />
                    <span>Important</span>
                  </label>
                </div>

                <textarea
                  className={styles.textarea}
                  style={{ marginTop: 10, minHeight: 84 }}
                  value={rdvNewContactNotes}
                  onChange={(e) => { setRdvNewContactNotes(e.target.value); setCrmAddFeedback(""); }}
                  placeholder="Notes (optionnel)"
                />
              </div>

              


              
                <div className={styles.field} style={{ marginTop: 10 }}>
                  <div className={styles.label}>Lieu du RDV (optionnel)</div>
                  <input
                    className={styles.input}
                    value={rdvLocation}
                    onChange={(e) => setRdvLocation(e.target.value)}
                    placeholder="Ex: 12 rue ... / Zone industrielle ... (si vide, on prend l’adresse des coordonnées)"
                  />
                  <div className={styles.eventSub} style={{ marginTop: 6 }}>
                    Si ce champ est vide, l’adresse sera prise depuis les <b>Coordonnées</b>.
                  </div>
                </div>


              <div className={styles.field} style={{ marginTop: 10 }}>
                <div className={styles.label}>Notes</div>
                <textarea className={styles.textarea} value={rdvNotes} onChange={(e) => setRdvNotes(e.target.value)} placeholder="Détails, consignes, matériel, infos importantes…" />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {rdvMode === "edit" && (
                  <button className={styles.btnDanger} onClick={deleteRdv} disabled={rdvSaving}>
                    Supprimer
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className={styles.btnGhost} onClick={() => setRdvOpen(false)} disabled={rdvSaving}>
                  Annuler
                </button>
                <button className={styles.btnPrimary} onClick={submitRdv} disabled={rdvSaving}>
                  {rdvSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
