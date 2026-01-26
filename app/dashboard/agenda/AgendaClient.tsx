
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./agenda.module.css";

type EventItem = {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  htmlLink: string | null;
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

export default function AgendaClient() {
  const router = useRouter();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cursorMonth, setCursorMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, 0);
  });
  const [query, setQuery] = useState("");

  async function loadStatus() {
    const r = await fetch("/api/calendar/status");
    if (!r.ok) {
      setConnected(false);
      return;
    }
    const j = await r.json().catch(() => ({}));
    setConnected(Boolean(j.connected));
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
    loadStatus();
  }, []);

  useEffect(() => {
    if (connected) loadEventsForMonth(cursorMonth);
  }, [connected, cursorMonth]);

  const openAgendaSettings = () => {
    router.push("/dashboard?panel=agenda");
  };

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
    const list = eventsByDay.get(selectedKey) ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => (e.summary ?? "").toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q));
  }, [eventsByDay, selectedKey, query]);

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
        <div className={styles.topbar}>
          <div className={styles.titleRow}>
            <div className={styles.h1}>Agenda iNrCy</div>
            <div className={styles.sub}>
              Synchronisé avec ton Google Agenda — même événements, mêmes dates, même timing.
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnGhost} onClick={openAgendaSettings}>
              ⚙️ Réglages
            </button>
            <button className={styles.btnGhost} onClick={() => router.push("/dashboard")}>⟵ Dashboard</button>
          </div>
        </div>

        {connected === false && (
          <div className={styles.center}>
            <div className={styles.notice}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>Google Agenda n’est pas connecté</div>
              <div style={{ marginTop: 6, color: "rgba(255,255,255,0.72)" }}>
                Pour afficher ton calendrier iNrCy (et qu’il corresponde à 100% à Google), connecte ton compte depuis les réglages.
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className={styles.btnPrimary} onClick={openAgendaSettings}>
                  Connecter Google Agenda
                </button>
                <button className={styles.btnGhost} onClick={() => router.push("/dashboard")}>Retour dashboard</button>
              </div>
            </div>
          </div>
        )}

        {connected && (
          <div className={styles.layout}>
            {/* CALENDRIER */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.monthLabel} style={{ textTransform: "capitalize" }}>
                    {formatMonthLabel(cursorMonth)}
                  </div>
                  <div className={styles.rangeHint}>
                    Vue mensuelle — clique un jour pour voir les détails.
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button className={styles.btnIcon} onClick={goPrev} aria-label="Mois précédent">
                    ‹
                  </button>
                  <button className={styles.btnIcon} onClick={goToday} aria-label="Aujourd’hui">
                    ●
                  </button>
                  <button className={styles.btnIcon} onClick={goNext} aria-label="Mois suivant">
                    ›
                  </button>
                  <button
                    className={styles.btnGhost}
                    onClick={() => loadEventsForMonth(cursorMonth)}
                    disabled={loading}
                    title="Rafraîchir depuis Google"
                  >
                    {loading ? "Chargement…" : "↻ Rafraîchir"}
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
                        <div className={styles.dayNum}>{d.getDate()}</div>
                        {isToday && <div className={styles.pillToday}>Aujourd’hui</div>}

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
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.monthLabel} style={{ textTransform: "capitalize" }}>
                    {formatDayLabel(selectedDate)}
                  </div>
                  <div className={styles.rangeHint}>
                    {selectedEvents.length} événement{selectedEvents.length > 1 ? "s" : ""}
                  </div>
                </div>
                <button className={styles.btnGhost} onClick={openAgendaSettings}>
                  ⚙️
                </button>
              </div>

              <div className={styles.sidebarBody}>
                <div className={styles.sideTitle}>Détails du jour</div>
                <div className={styles.meta}>
                  Astuce : le contenu affiché vient directement de Google Calendar (calendrier principal).
                </div>

                <input
                  className={styles.search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher un événement (titre / lieu)…"
                />

                <div className={styles.list}>
                  {selectedEvents.length === 0 && <div className={styles.empty}>Aucun événement ce jour-là.</div>}

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
                      <div key={ev.id} className={`${styles.eventRow} ${accentClass}`}>
                        <div className={styles.eventTitle}>{ev.summary}</div>
                        <div className={styles.eventSub}>
                          {when}
                          {ev.location ? ` — ${ev.location}` : ""}
                        </div>
                        {ev.htmlLink ? (
                          <a className={styles.eventLink} href={ev.htmlLink} target="_blank" rel="noreferrer">
                            Ouvrir dans Google
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
