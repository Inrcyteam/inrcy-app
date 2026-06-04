"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import type { InrBadgeAppointmentSettings } from "@/lib/inrBadgeSettings";
import styles from "../badge.module.css";

type BusyEvent = { id: string; start: string; end: string };

type Props = {
  slug: string;
  company: string;
  displayName: string;
  logoUrl: string;
  settings: InrBadgeAppointmentSettings;
  events: BusyEvent[];
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function minutesFromTime(value: string) {
  const [h, m] = value.split(":").map((item) => Number(item));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function timeFromMinutes(value: number) {
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "short" }).format(date);
}

function buildLocalDateTime(dateKeyValue: string, time: string) {
  return new Date(`${dateKeyValue}T${time}:00`);
}


function getSettingsForDate(settings: InrBadgeAppointmentSettings, dateKeyValue: string) {
  const weekday = new Date(`${dateKeyValue}T12:00:00`).getDay();
  return settings.dailySlots[String(weekday)] || {
    enabled: settings.weekdays.includes(weekday),
    startTime: settings.startTime,
    endTime: settings.endTime,
    durationMinutes: settings.durationMinutes,
  };
}

function overlaps(start: Date, end: Date, event: BusyEvent) {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  if (!Number.isFinite(eventStart.getTime()) || !Number.isFinite(eventEnd.getTime())) return false;
  return start < eventEnd && end > eventStart;
}

export default function RdvBookingClient({ slug, company: _company, displayName: _displayName, logoUrl: _logoUrl, settings, events }: Props) {
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string; label: string } | null>(null);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    const now = new Date();
    const items: Array<{ key: string; label: string }> = [];
    for (let offset = 0; offset < settings.daysAhead; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      const weekday = date.getDay();
      const daySettings = settings.dailySlots[String(weekday)];
      if (daySettings ? !daySettings.enabled : !settings.weekdays.includes(weekday)) continue;
      items.push({ key: dateKey(date), label: formatDayLabel(date) });
    }
    return items;
  }, [settings]);

  const activeDay = selectedDay || days[0]?.key || "";

  const slots = useMemo(() => {
    if (!activeDay) return [];
    const daySettings = getSettingsForDate(settings, activeDay);
    if (!daySettings.enabled) return [];
    const startMinutes = minutesFromTime(daySettings.startTime);
    const endMinutes = minutesFromTime(daySettings.endTime);
    const duration = daySettings.durationMinutes;
    const minDate = new Date(Date.now() + settings.minNoticeHours * 60 * 60 * 1000);
    const output: Array<{ start: string; end: string; label: string }> = [];

    for (let cursor = startMinutes; cursor + duration <= endMinutes; cursor += duration) {
      const startTime = timeFromMinutes(cursor);
      const endTime = timeFromMinutes(cursor + duration);
      const start = buildLocalDateTime(activeDay, startTime);
      const end = buildLocalDateTime(activeDay, endTime);
      if (start < minDate) continue;
      if (events.some((event) => overlaps(start, end, event))) continue;
      output.push({ start: start.toISOString(), end: end.toISOString(), label: startTime });
    }

    return output;
  }, [activeDay, settings, events]);

  const slotValue = selectedSlot?.start || "";

  function handleClosePage() {
    window.close();
    window.setTimeout(() => {
      if (!window.closed && document.visibilityState === "visible") {
        window.history.back();
      }
    }, 120);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);

    if (!selectedSlot) {
      setError("Choisissez un créneau.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Nom et email sont obligatoires.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/inrbadge/appointment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          start: selectedSlot.start,
          end: selectedSlot.end,
          name,
          company: companyName,
          email,
          phone,
          message: message.trim(),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(String(json.error || "Impossible d'envoyer la demande."));
      setFeedback("Demande envoyée. Le professionnel va confirmer ou proposer un autre créneau.");
      setSelectedSlot(null);
      setName("");
      setCompanyName("");
      setEmail("");
      setPhone("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer la demande.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.calendarHeader}>
            <div className={styles.calendarTopBar}>
              <div className={styles.rdvTopActions}>
                <a className={`${styles.previousPageButton} ${styles.iconActionButton}`} href={`/badge/${slug}`} aria-label="Retour à la fiche" title="Retour">←</a>
                <button type="button" className={`${styles.closePageButton} ${styles.iconActionButton}`} onClick={handleClosePage} aria-label="Fermer" title="Fermer">×</button>
              </div>
              <Image className={styles.calendarHeroLogo} src="/inrcalendar-logo.png" alt="iNr'Calendar" width={168} height={64} priority />
            </div>
            <p className={styles.calendarInlineInfo}>Réserver un rendez-vous</p>
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionMark} />
              <h2>Choisir un créneau</h2>
            </div>

            <div className={styles.rdvSelectGrid}>
              <label>
                Date
                <select
                  value={activeDay}
                  onChange={(event) => {
                    setSelectedDay(event.target.value);
                    setSelectedSlot(null);
                  }}
                >
                  {days.map((day) => (
                    <option key={day.key} value={day.key}>{day.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Horaire
                <select
                  value={slotValue}
                  onChange={(event) => {
                    const nextSlot = slots.find((slot) => slot.start === event.target.value) || null;
                    setSelectedSlot(nextSlot);
                  }}
                  disabled={!slots.length}
                >
                  <option value="">{slots.length ? "Choisir un horaire" : "Aucun créneau"}</option>
                  {slots.map((slot) => (
                    <option key={slot.start} value={slot.start}>{slot.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {!slots.length ? <p className={styles.emptySlots}>Aucun créneau disponible sur cette journée.</p> : null}
          </section>

          <form className={styles.rdvForm} onSubmit={submitRequest}>
            <div className={styles.rdvFieldGrid}>
              <label>
                Nom / prénom *
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom" />
              </label>
              <label>
                Société
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Votre société" />
              </label>
            </div>

            <div className={styles.rdvFieldGrid}>
              <label>
                Mail *
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="votre@email.fr" />
              </label>
              <label>
                Téléphone
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="06..." />
              </label>
            </div>

            <label>
              Message / motif
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Expliquez rapidement votre besoin" rows={3} />
            </label>

            {error ? <div className={styles.rdvError}>{error}</div> : null}
            {feedback ? <div className={styles.rdvSuccess}>{feedback}</div> : null}

            <button type="submit" className={styles.rdvSubmit} disabled={submitting || !selectedSlot}>
              {submitting ? "Envoi..." : "Envoyer la demande"}
            </button>
            <p className={styles.rdvNote}>Le rendez-vous sera enregistré dans iNr&apos;Calendar uniquement après validation du professionnel.</p>
          </form>
        </div>

        <div className={styles.footer}>Propulsé par <strong>iNrCy</strong></div>
      </section>
    </main>
  );
}
