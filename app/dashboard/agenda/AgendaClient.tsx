"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./agenda.module.css";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import {
  addDays,
  buildCrmDisplayName,
  buildIso,
  buildQuarterHourOptions,
  composeAddressLine,
  endOfMonth,
  endOfWeekSunday,
  isDateOnly,
  keyOf,
  parseCrmDisplayName,
  parseDateOnly,
  startOfMonth,
  startOfWeekMonday,
  toDateOnly,
  type ContactCategory,
  type ContactPayload,
  type ContactType,
  type CrmContact,
  type DayEvent,
  type EventItem,
  type MailAccountOption,
  type RdvKind,
  type RdvMode,
} from "./agenda.shared";
import { AgendaCalendarCard, AgendaEventModal, AgendaHeader, AgendaSidebar } from "./agenda.ui";

export default function AgendaClient() {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [cursorMonth, setCursorMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  });
  const [query, setQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const [rdvOpen, setRdvOpen] = useState(false);
  const [rdvMode, setRdvMode] = useState<RdvMode>("create");
  const [rdvEventId, setRdvEventId] = useState("");
  const [rdvSummary, setRdvSummary] = useState("");
  const [rdvDate, setRdvDate] = useState("");
  const [rdvStart, setRdvStart] = useState("09:00");
  const [rdvEnd, setRdvEnd] = useState("10:00");
  const [rdvLocation, setRdvLocation] = useState("");
  const [rdvNotes, setRdvNotes] = useState("");
  const [rdvKind, setRdvKind] = useState<RdvKind>("intervention");
  const [intType, setIntType] = useState("");
  const [intStatus, setIntStatus] = useState("confirmé");
  const [intReference, setIntReference] = useState("");
  const [rdvContactId, setRdvContactId] = useState("");
  const [rdvNewContactName, setRdvNewContactName] = useState("");
  const [rdvNewContactEmail, setRdvNewContactEmail] = useState("");
  const [rdvNewContactPhone, setRdvNewContactPhone] = useState("");
  const [rdvNewContactAddress, setRdvNewContactAddress] = useState("");
  const [rdvNewContactCity, setRdvNewContactCity] = useState("");
  const [rdvNewContactPostal, setRdvNewContactPostal] = useState("");
  const [rdvNewContactSiren, setRdvNewContactSiren] = useState("");
  const [rdvNewContactCategory, setRdvNewContactCategory] = useState<ContactCategory>("particulier");
  const [rdvNewContactType, setRdvNewContactType] = useState<ContactType>("prospect");
  const [rdvNewContactImportant, setRdvNewContactImportant] = useState(false);
  const [rdvNewContactNotes, setRdvNewContactNotes] = useState("");
  const [crmAddFeedback, setCrmAddFeedback] = useState("");
  const [rdvSaving, setRdvSaving] = useState(false);
  const [rdvError, setRdvError] = useState<string | null>(null);
  const [rdvExistingContact, setRdvExistingContact] = useState<any | null>(null);

  const [mailAccounts, setMailAccounts] = useState<MailAccountOption[]>([]);
  const [agendaMailAccountId, setAgendaMailAccountId] = useState("");
  const [agendaMailLoading, setAgendaMailLoading] = useState(false);
  const [agendaMailSaving, setAgendaMailSaving] = useState(false);
  const [agendaMailError, setAgendaMailError] = useState<string | null>(null);

  const quarterHourOptions = useMemo(() => buildQuarterHourOptions(), []);
  const startTimeOptions = useMemo(
    () => (quarterHourOptions.includes(rdvStart) ? quarterHourOptions : [rdvStart, ...quarterHourOptions.filter((value) => value !== rdvStart)]),
    [quarterHourOptions, rdvStart]
  );
  const endTimeOptions = useMemo(
    () => (quarterHourOptions.includes(rdvEnd) ? quarterHourOptions : [rdvEnd, ...quarterHourOptions.filter((value) => value !== rdvEnd)]),
    [quarterHourOptions, rdvEnd]
  );

  useEffect(() => {
    if (!rdvContactId) return;
    const contact = contacts.find((item) => item.id === rdvContactId);
    if (!contact) return;

    setRdvLocation(composeAddressLine(contact.address ?? "", contact.postal_code ?? "", contact.city ?? ""));
    setRdvNewContactName(buildCrmDisplayName((contact.first_name ?? "").trim(), (contact.last_name ?? "").trim(), (contact.company_name ?? "").trim()));
    setRdvNewContactEmail((contact.email ?? "").trim());
    setRdvNewContactPhone((contact.phone ?? "").trim());
    setRdvNewContactAddress((contact.address ?? "").trim());
    setRdvNewContactCity((contact.city ?? "").trim());
    setRdvNewContactPostal((contact.postal_code ?? "").trim());
    setRdvNewContactSiren((contact.siren ?? "").trim());
    setRdvNewContactCategory((contact.category as ContactCategory) || "particulier");
    setRdvNewContactType((contact.contact_type as ContactType) || "prospect");
    setRdvNewContactImportant(Boolean(contact.important));
    setRdvNewContactNotes((contact.notes ?? "").trim());
    setCrmAddFeedback("");
    setRdvExistingContact(null);
  }, [rdvContactId, contacts]);

  async function loadAgendaMailSettings() {
    setAgendaMailLoading(true);
    setAgendaMailError(null);
    try {
      const response = await fetch("/api/calendar/settings");
      if (!response.ok) throw new Error(await getSimpleFrenchApiError(response, "Impossible de charger la boîte d’envoi agenda."));
      const json = await response.json().catch(() => ({}));
      setMailAccounts(Array.isArray((json as any)?.accounts) ? (json as any).accounts : []);
      setAgendaMailAccountId(String((json as any)?.selectedMailAccountId || ""));
    } catch (e: any) {
      setAgendaMailError(getSimpleFrenchErrorMessage(e, "Impossible de charger la boîte d’envoi agenda."));
    } finally {
      setAgendaMailLoading(false);
    }
  }

  async function saveAgendaMailAccount(nextId: string) {
    const previousId = agendaMailAccountId;
    setAgendaMailAccountId(nextId);
    setAgendaMailSaving(true);
    setAgendaMailError(null);
    try {
      const response = await fetch("/api/calendar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedMailAccountId: nextId }),
      });
      if (!response.ok) throw new Error(await getSimpleFrenchApiError(response, "Impossible d’enregistrer la boîte d’envoi agenda."));
    } catch (e: any) {
      setAgendaMailAccountId(previousId);
      setAgendaMailError(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer la boîte d’envoi agenda."));
    } finally {
      setAgendaMailSaving(false);
    }
  }

  function hydrateContactFields(contact: any | null) {
    const raw = contact && typeof contact === "object" ? contact : null;
    const displayName = String(raw?.display_name ?? "").trim();
    const firstName = String(raw?.first_name ?? "").trim();
    const lastName = String(raw?.last_name ?? "").trim();
    const companyName = String(raw?.company_name ?? "").trim();
    const address = String(raw?.address ?? "").trim();
    const city = String(raw?.city ?? "").trim();
    const postalCode = String(raw?.postal_code ?? "").trim();

    setRdvNewContactName(displayName || buildCrmDisplayName(firstName, lastName, companyName));
    setRdvNewContactEmail(String(raw?.email ?? "").trim());
    setRdvNewContactPhone(String(raw?.phone ?? "").trim());
    setRdvNewContactAddress(address);
    setRdvNewContactCity(city);
    setRdvNewContactPostal(postalCode);
    setRdvNewContactSiren(String(raw?.siren ?? "").trim());
    setRdvNewContactCategory((String(raw?.category ?? "").trim() as ContactCategory) || "particulier");
    setRdvNewContactType((String(raw?.contact_type ?? "").trim() as ContactType) || "prospect");
    setRdvNewContactImportant(Boolean(raw?.important));
    setRdvNewContactNotes(String(raw?.notes ?? "").trim());

    const structuredLocation = composeAddressLine(address, postalCode, city);
    if (structuredLocation) setRdvLocation(structuredLocation);
  }

  async function loadContacts() {
    setContactsLoading(true);
    try {
      const response = await fetch("/api/crm/contacts?all=1&pageSize=200");
      if (!response.ok) throw new Error(await getSimpleFrenchApiError(response, "Impossible de charger les contacts du CRM."));
      const json = await response.json().catch(() => ({}));
      setContacts(Array.isArray((json as any)?.contacts) ? (json as any).contacts : []);
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible de charger les contacts du CRM."));
    } finally {
      setContactsLoading(false);
    }
  }

  useEffect(() => {
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

    loadContacts();
    openCreateRdv(selectedDate);

    if (contactId) setRdvContactId(contactId);
    if (contactName || contactFirstName || contactCompany) {
      setRdvNewContactName(contactName || buildCrmDisplayName(contactFirstName, "", contactCompany));
    }
    if (contactEmail) setRdvNewContactEmail(contactEmail);
    if (contactPhone) setRdvNewContactPhone(contactPhone);
    if (contactAddress) setRdvNewContactAddress(contactAddress);
    if (contactCity) setRdvNewContactCity(contactCity);
    if (contactPostalCode) setRdvNewContactPostal(contactPostalCode);

    try {
      const nextQuery = new URLSearchParams(searchParams?.toString() || "");
      nextQuery.delete("action");
      router.replace(`/dashboard/agenda?${nextQuery.toString()}`);
    } catch {}
  }, [router, searchParams, selectedDate]);

  function openCreateRdv(date: Date) {
    setRdvMode("create");
    setRdvEventId("");
    setRdvKind("intervention");
    setRdvSummary("Évènement");
    setRdvDate(toDateOnly(date));
    setRdvStart("09:00");
    setRdvEnd("10:00");
    setRdvLocation("");
    setRdvNotes("");
    setIntType("");
    setIntStatus("confirmé");
    setIntReference("");
    setRdvExistingContact(null);
    setRdvContactId("");
    setRdvNewContactName("");
    setRdvNewContactEmail("");
    setRdvNewContactPhone("");
    setRdvNewContactAddress("");
    setRdvNewContactCity("");
    setRdvNewContactPostal("");
    setRdvNewContactSiren("");
    setRdvNewContactCategory("particulier");
    setRdvNewContactType("prospect");
    setRdvNewContactImportant(false);
    setRdvNewContactNotes("");
    setCrmAddFeedback("");
    setRdvError(null);
    setRdvOpen(true);
  }

  function openEditRdv(event: DayEvent) {
    setRdvMode("edit");
    setRdvEventId(event.id);

    const rawMeta = (event?.inrcy && typeof event.inrcy === "object") ? event.inrcy : {};
    const kind = rawMeta?.kind === "agenda" ? "agenda" : "intervention";
    const meta = rawMeta?.intervention ?? null;
    const address = (meta as any)?.address;
    const existingContact = rawMeta?.contact && typeof rawMeta.contact === "object" ? rawMeta.contact : null;

    setRdvKind(kind);
    setRdvSummary(event.summary || (kind === "intervention" ? "Intervention" : "Rendez-vous"));

    const start = event.startDate ?? (event.start ? new Date(event.start) : null);
    const end = event.endDate ?? (event.end ? new Date(event.end) : null);
    const baseDate = start ?? selectedDate;

    setRdvDate(toDateOnly(baseDate));
    setRdvStart(start ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}` : "09:00");
    setRdvEnd(end ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}` : "10:00");
    setRdvLocation(event.location ?? "");
    setRdvNotes(typeof event.description === "string" ? event.description : "");

    if (address && typeof address === "object") {
      const fallbackLocation = composeAddressLine(String(address.street ?? ""), String(address.postal_code ?? ""), String(address.city ?? ""));
      if (!event.location && fallbackLocation) setRdvLocation(fallbackLocation);
    } else if (typeof address === "string" && !event.location) {
      setRdvLocation(String(address));
    }

    setIntType(String(meta?.type ?? ""));
    setIntStatus(String(meta?.status ?? "confirmé"));
    setIntReference(String(meta?.reference ?? ""));
    setRdvExistingContact(existingContact);
    setRdvContactId("");
    hydrateContactFields(existingContact);
    setCrmAddFeedback("");
    setRdvError(null);
    setRdvOpen(true);
  }

  async function ensureContact(): Promise<ContactPayload | null> {
    if (rdvContactId) {
      const contact = contacts.find((item) => item.id === rdvContactId);
      if (!contact) return null;

      const display_name =
        `${(contact.first_name ?? "").trim()} ${(contact.last_name ?? "").trim()}`.trim() ||
        (contact.company_name ?? "").trim() ||
        "Contact";

      const address = (contact.address ?? "").trim();
      const city = (contact.city ?? "").trim();
      const postal_code = (contact.postal_code ?? "").trim();

      return {
        display_name,
        first_name: (contact.first_name ?? "").trim() || undefined,
        last_name: (contact.last_name ?? "").trim() || undefined,
        company_name: (contact.company_name ?? "").trim() || undefined,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        address,
        city: city || undefined,
        postal_code: postal_code || undefined,
        siren: (contact.siren ?? "").trim() || undefined,
        category: (contact.category as ContactCategory) || "particulier",
        contact_type: (contact.contact_type as ContactType) || "prospect",
        notes: (contact.notes ?? "").trim() || undefined,
        important: Boolean(contact.important),
      };
    }

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

    if (!rawDisplayName && !email && !phone && !address) {
      return rdvExistingContact && typeof rdvExistingContact === "object" ? rdvExistingContact : null;
    }

    return {
      display_name: rawDisplayName || "Nouveau contact",
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
      const existing = contacts.find((contact) => {
        const contactEmail = (contact.email ?? "").toLowerCase();
        const contactPhone = (contact.phone ?? "").replace(/\D/g, "");
        const displayName = (contact.display_name ?? "").toLowerCase().trim();
        if (normEmail && contactEmail && contactEmail === normEmail) return true;
        if (normPhone && contactPhone && contactPhone === normPhone) return true;
        if (display_name && displayName && displayName === display_name.toLowerCase()) return true;
        return false;
      });

      if (existing) {
        setRdvContactId(existing.id);
        setCrmAddFeedback("Déjà ajouté au CRM");
        return;
      }

      const response = await fetch("/api/crm/contacts", {
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

      const json = response ? await response.json().catch(() => ({})) : {};
      if (!response || !response.ok) {
        throw new Error(
          response
            ? await getSimpleFrenchApiError(response, "Impossible d’ajouter le contact au CRM")
            : "Connexion au serveur impossible pour le moment. Merci de réessayer."
        );
      }

      await loadContacts();
      const createdId = (json as any)?.id as string | undefined;

      if (createdId) {
        setRdvContactId(createdId);
      } else {
        const updated = await fetch("/api/crm/contacts?all=1&pageSize=200").then((item) => item.json()).catch(() => null);
        const updatedContacts = Array.isArray(updated) ? updated : Array.isArray((updated as any)?.contacts) ? (updated as any).contacts : [];
        if (Array.isArray(updatedContacts)) {
          const found = updatedContacts.find(
            (contact: any) =>
              (email && (contact.email ?? "").toLowerCase() === normEmail) ||
              (normPhone && (contact.phone ?? "").replace(/\D/g, "") === normPhone) ||
              ((contact.display_name ?? "").toLowerCase().trim() === display_name.toLowerCase())
          );
          if (found?.id) setRdvContactId(found.id);
        }
      }

      setCrmAddFeedback("Ajouté au CRM ✅");
    } catch (e: any) {
      setCrmAddFeedback(getSimpleFrenchErrorMessage(e, "Impossible d'ajouter ce contact au CRM."));
    }
  }

  async function submitRdv() {
    setRdvSaving(true);
    setRdvError(null);
    setSuccess(null);
    try {
      const safeSummary = rdvSummary.trim() || "Évènement";
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rdvDate) ? rdvDate : keyOf(selectedDate);
      const safeStart = /^\d{2}:\d{2}$/.test(rdvStart) ? rdvStart : "09:00";
      const safeEnd = /^\d{2}:\d{2}$/.test(rdvEnd) ? rdvEnd : "10:00";

      const startIso = buildIso(safeDate, safeStart);
      let endIso = buildIso(safeDate, safeEnd);
      if (Date.parse(endIso) <= Date.parse(startIso)) {
        const date = new Date(Date.parse(startIso));
        date.setMinutes(date.getMinutes() + 60);
        endIso = date.toISOString();
      }

      const contact = (await ensureContact()) ?? (rdvMode === "edit" ? rdvExistingContact : null);
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
          reminders: {
            mailAccountId: agendaMailAccountId || undefined,
          },
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
        const response = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) {
          throw new Error(
            !response.ok
              ? await getSimpleFrenchApiError(response, "Impossible de créer le rendez-vous.")
              : getSimpleFrenchErrorMessage(json?.error, "Impossible de créer le rendez-vous.")
          );
        }
      } else {
        const response = await fetch(`/api/calendar/events?id=${encodeURIComponent(rdvEventId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) {
          throw new Error(
            !response.ok
              ? await getSimpleFrenchApiError(response, "Impossible de modifier le rendez-vous.")
              : getSimpleFrenchErrorMessage(json?.error, "Impossible de modifier le rendez-vous.")
          );
        }
      }

      setRdvOpen(false);
      await loadEventsForMonth(cursorMonth);
      setSuccess(rdvMode === "create" ? "Rendez-vous ajouté." : "Rendez-vous modifié.");
    } catch (e: any) {
      setRdvError(getSimpleFrenchErrorMessage(e, rdvMode === "create" ? "Impossible de créer le rendez-vous." : "Impossible de modifier le rendez-vous."));
    } finally {
      setRdvSaving(false);
    }
  }

  async function deleteRdv() {
    if (!rdvEventId) return;
    setRdvSaving(true);
    setRdvError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/calendar/events?id=${encodeURIComponent(rdvEventId)}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(
          !response.ok
            ? await getSimpleFrenchApiError(response, "Impossible de supprimer ce rendez-vous.")
            : getSimpleFrenchErrorMessage(json?.error, "Impossible de supprimer ce rendez-vous.")
        );
      }
      setRdvOpen(false);
      await loadEventsForMonth(cursorMonth);
      setSuccess("Rendez-vous supprimé.");
    } catch (e: any) {
      setRdvError(getSimpleFrenchErrorMessage(e, "Impossible de supprimer ce rendez-vous."));
    } finally {
      setRdvSaving(false);
    }
  }

  async function deleteEventById(id: string) {
    if (!id) return;
    try {
      const response = await fetch(`/api/calendar/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(
          !response.ok
            ? await getSimpleFrenchApiError(response, "Impossible de supprimer ce rendez-vous.")
            : getSimpleFrenchErrorMessage(json?.error, "Impossible de supprimer ce rendez-vous.")
        );
      }
      await loadEventsForMonth(cursorMonth);
    } catch (e: any) {
      const message = getSimpleFrenchErrorMessage(e, "Impossible de supprimer ce rendez-vous.");
      if (rdvOpen) setRdvError(message);
      else setError(message);
    }
  }

  async function loadEventsForMonth(monthDate: Date) {
    setLoading(true);
    setError(null);
    try {
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const gridStart = startOfWeekMonday(monthStart);
      const gridEnd = endOfWeekSunday(monthEnd);
      const timeMin = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate(), 0, 0, 0, 0);
      const timeMax = addDays(new Date(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate(), 0, 0, 0, 0), 1);

      const response = await fetch(
        `/api/calendar/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}`
      );

      if (!response.ok) {
        setError(await getSimpleFrenchApiError(response, "Impossible de charger l’agenda."));
        return;
      }

      const json = await response.json().catch(() => ({}));
      if (!json.ok) {
        setError(getSimpleFrenchErrorMessage(json?.error, "Impossible de charger l’agenda."));
        return;
      }

      setEvents(Array.isArray(json.events) ? json.events : []);
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible de charger l’agenda."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEventsForMonth(cursorMonth);
    loadContacts();
    loadAgendaMailSettings();
  }, []);

  useEffect(() => {
    loadEventsForMonth(cursorMonth);
  }, [cursorMonth]);

  const monthStart = useMemo(() => startOfMonth(cursorMonth), [cursorMonth]);
  const monthEnd = useMemo(() => endOfMonth(cursorMonth), [cursorMonth]);
  const gridStart = useMemo(() => startOfWeekMonday(monthStart), [monthStart]);
  const gridEnd = useMemo(() => endOfWeekSunday(monthEnd), [monthEnd]);

  const days = useMemo(() => {
    const list: Date[] = [];
    let day = new Date(gridStart);
    while (day <= gridEnd) {
      list.push(new Date(day));
      day = addDays(day, 1);
    }
    return list;
  }, [gridEnd, gridStart]);

  const isSixWeeks = days.length > 35;

  const normalized = useMemo<DayEvent[]>(() => {
    return events.map((event) => {
      const allDay = isDateOnly(event.start);
      const startDate = event.start ? (allDay ? parseDateOnly(event.start) : new Date(event.start)) : null;
      const endDate = event.end ? (isDateOnly(event.end) ? parseDateOnly(event.end) : new Date(event.end)) : null;
      return { ...event, allDay, startDate, endDate };
    });
  }, [events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    const push = (key: string, event: DayEvent) => {
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    };

    for (const event of normalized) {
      if (!event.startDate) continue;
      if (event.allDay) {
        const start = new Date(event.startDate);
        const endExclusive = event.endDate ? new Date(event.endDate) : addDays(start, 1);
        let day = new Date(start);
        while (day < endExclusive) {
          push(keyOf(day), event);
          day = addDays(day, 1);
        }
      } else {
        const start = new Date(event.startDate);
        const end = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
        const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
        const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0);
        let day = new Date(startDay);
        while (day <= endDay) {
          push(keyOf(day), event);
          day = addDays(day, 1);
        }
      }
    }

    for (const [key, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        const ta = a.startDate ? a.startDate.getTime() : 0;
        const tb = b.startDate ? b.startDate.getTime() : 0;
        return ta - tb;
      });
      map.set(key, list);
    }

    return map;
  }, [normalized]);

  const selectedKey = useMemo(() => keyOf(selectedDate), [selectedDate]);
  const selectedEvents = useMemo(() => eventsByDay.get(selectedKey) ?? [], [eventsByDay, selectedKey]);
  const globalMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return normalized
      .filter((event) => (event.summary ?? "").toLowerCase().includes(normalizedQuery) || (event.location ?? "").toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const ta = a.startDate ? a.startDate.getTime() : 0;
        const tb = b.startDate ? b.startDate.getTime() : 0;
        return ta - tb;
      });
  }, [normalized, query]);

  const todayKey = useMemo(() => keyOf(new Date()), []);

  const goToday = () => {
    const now = new Date();
    setCursorMonth(startOfMonth(now));
    setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
  };

  const goPrev = () => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1));
  const goNext = () => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1));

  const jumpToEvent = (event: DayEvent) => {
    if (!event.startDate) return;
    const day = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate(), 0, 0, 0, 0);
    setSelectedDate(day);
    setCursorMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    setShowMobileSearch(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <AgendaHeader
          helpOpen={helpOpen}
          setHelpOpen={setHelpOpen}
          query={query}
          setQuery={setQuery}
          showMobileSearch={showMobileSearch}
          setShowMobileSearch={setShowMobileSearch}
          onClose={() => router.push("/dashboard")}
        />

        <div className={styles.layout}>
          <AgendaCalendarCard
            cursorMonth={cursorMonth}
            loading={loading}
            error={error}
            success={success}
            days={days}
            isSixWeeks={isSixWeeks}
            selectedKey={selectedKey}
            todayKey={todayKey}
            eventsByDay={eventsByDay}
            onDaySelect={setSelectedDate}
            onPrev={goPrev}
            onToday={goToday}
            onNext={goNext}
            onRefresh={() => loadEventsForMonth(cursorMonth)}
          />

          <AgendaSidebar
            selectedDate={selectedDate}
            selectedEvents={selectedEvents}
            query={query}
            globalMatches={globalMatches}
            agendaMailAccountId={agendaMailAccountId}
            mailAccounts={mailAccounts}
            agendaMailLoading={agendaMailLoading}
            agendaMailSaving={agendaMailSaving}
            agendaMailError={agendaMailError}
            onCreateEvent={() => openCreateRdv(selectedDate)}
            onAgendaMailAccountChange={saveAgendaMailAccount}
            onOpenEvent={openEditRdv}
            onDeleteEvent={deleteEventById}
            onJumpToEvent={jumpToEvent}
          />
        </div>
      </div>

      <AgendaEventModal
        open={rdvOpen}
        rdvMode={rdvMode}
        rdvError={rdvError}
        rdvSaving={rdvSaving}
        rdvSummary={rdvSummary}
        rdvDate={rdvDate}
        rdvStart={rdvStart}
        rdvEnd={rdvEnd}
        rdvLocation={rdvLocation}
        rdvNotes={rdvNotes}
        rdvKind={rdvKind}
        intType={intType}
        intStatus={intStatus}
        intReference={intReference}
        rdvContactId={rdvContactId}
        rdvNewContactName={rdvNewContactName}
        rdvNewContactEmail={rdvNewContactEmail}
        rdvNewContactPhone={rdvNewContactPhone}
        rdvNewContactAddress={rdvNewContactAddress}
        rdvNewContactCity={rdvNewContactCity}
        rdvNewContactPostal={rdvNewContactPostal}
        rdvNewContactSiren={rdvNewContactSiren}
        rdvNewContactCategory={rdvNewContactCategory}
        rdvNewContactType={rdvNewContactType}
        rdvNewContactImportant={rdvNewContactImportant}
        rdvNewContactNotes={rdvNewContactNotes}
        crmAddFeedback={crmAddFeedback}
        contacts={contacts}
        contactsLoading={contactsLoading}
        startTimeOptions={startTimeOptions}
        endTimeOptions={endTimeOptions}
        onClose={() => setRdvOpen(false)}
        onDelete={deleteRdv}
        onSubmit={submitRdv}
        onAddContactToCrm={addContactToCrmFromCoords}
        clearCrmAddFeedback={() => setCrmAddFeedback("")}
        setRdvKind={setRdvKind}
        setRdvSummary={setRdvSummary}
        setRdvDate={setRdvDate}
        setRdvStart={setRdvStart}
        setRdvEnd={setRdvEnd}
        setRdvLocation={setRdvLocation}
        setRdvNotes={setRdvNotes}
        setIntType={setIntType}
        setIntStatus={setIntStatus}
        setIntReference={setIntReference}
        setRdvContactId={setRdvContactId}
        setRdvNewContactName={setRdvNewContactName}
        setRdvNewContactEmail={setRdvNewContactEmail}
        setRdvNewContactPhone={setRdvNewContactPhone}
        setRdvNewContactAddress={setRdvNewContactAddress}
        setRdvNewContactCity={setRdvNewContactCity}
        setRdvNewContactPostal={setRdvNewContactPostal}
        setRdvNewContactSiren={setRdvNewContactSiren}
        setRdvNewContactCategory={setRdvNewContactCategory}
        setRdvNewContactType={setRdvNewContactType}
        setRdvNewContactImportant={setRdvNewContactImportant}
        setRdvNewContactNotes={setRdvNewContactNotes}
      />
    </div>
  );
}
