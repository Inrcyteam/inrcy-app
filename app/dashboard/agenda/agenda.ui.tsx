import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./agenda.module.css";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import SettingsDrawer from "../SettingsDrawer";
import HelpButton from "../_components/HelpButton";
import AgendaSettingsContent from "../settings/_components/AgendaSettingsContent";
import HelpModal from "../_components/HelpModal";
import {
  accentFor,
  formatDayLabel,
  formatMonthLabel,
  formatTime,
  getContactOptionLabel,
  getEventAccentClass,
  getEventWhenLabel,
  keyOf,
  type ContactCategory,
  type ContactType,
  type CrmContact,
  type DayEvent,
  type GuestContactForm,
  type RdvKind,
  type RdvMode,
} from "./agenda.shared";

type TimeDropdownProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

export function TimeDropdown({ value, options, onChange }: TimeDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const active = rootRef.current?.querySelector<HTMLElement>(`[data-time-option="${CSS.escape(value)}"]`);
    active?.scrollIntoView({ block: "center" });

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (rootRef.current && target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, value]);

  return (
    <div className={styles.timeDropdown} ref={rootRef}>
      <button
        type="button"
        className={`${styles.input} ${styles.timeDropdownTrigger}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value}</span>
        <span className={styles.timeDropdownChevron} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={styles.timeDropdownMenu} role="listbox" aria-label="Choisir un horaire">
          {options.map((option) => {
            const isActive = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`${styles.timeDropdownOption} ${isActive ? styles.timeDropdownOptionActive : ""}`}
                data-time-option={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type AgendaHeaderProps = {
  helpOpen: boolean;
  setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  showMobileSearch: boolean;
  setShowMobileSearch: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
};

export function AgendaHeader({ helpOpen, setHelpOpen, settingsOpen, onOpenSettings, onCloseSettings, query, setQuery, showMobileSearch, setShowMobileSearch, onClose }: AgendaHeaderProps) {
  return (
    <>
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
          <div className={`${styles.headerSearch} ${styles.desktopOnly}`}>
            <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’Calendar" />

            <input
              className={styles.headerSearchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un évènement..."
            />

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ResponsiveActionButton
                desktopLabel="Réglages"
                mobileIcon="⚙️"
                onClick={onOpenSettings}
                title="Réglages iNr’Calendar"
              />
              <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" onClick={onClose} />
            </div>
          </div>

          <div className={styles.mobileOnly}>
            <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’Calendar" />

            <button
              className={`${styles.btnGhost} ${styles.iconOnlyBtn}`}
              onClick={() => setShowMobileSearch((v) => !v)}
              aria-label="Rechercher"
              title="Rechercher"
              type="button"
            >
              <span aria-hidden>🔎</span>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ResponsiveActionButton
                desktopLabel="Réglages"
                mobileIcon="⚙️"
                onClick={onOpenSettings}
                title="Réglages iNr’Calendar"
              />
              <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" onClick={onClose} />
            </div>
          </div>
        </div>
      </div>

      <HelpModal open={helpOpen} title="iNr’Calendar" onClose={() => setHelpOpen(false)}>
        <p style={{ marginTop: 0 }}>
          iNr’Calendar vous permet d’enregistrer et organiser vos rendez-vous et interventions.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Planifiez vos évènements (interventions, RDV, suivi client).</li>
          <li>Retrouvez rapidement un évènement via la recherche.</li>
          <li>Gardez une vision claire de votre planning terrain.</li>
        </ul>
      </HelpModal>

      <SettingsDrawer
        title="Réglages iNr’Calendar"
        isOpen={settingsOpen}
        onClose={onCloseSettings}
      >
        <AgendaSettingsContent />
      </SettingsDrawer>

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
    </>
  );
}

type AgendaCalendarCardProps = {
  cursorMonth: Date;
  loading: boolean;
  error: string | null;
  success: string | null;
  days: Date[];
  isSixWeeks: boolean;
  selectedKey: string;
  todayKey: string;
  eventsByDay: Map<string, DayEvent[]>;
  onDaySelect: (date: Date) => void;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  onRefresh: () => void;
};

export function AgendaCalendarCard({
  cursorMonth,
  loading,
  error,
  success,
  days,
  isSixWeeks,
  selectedKey,
  todayKey,
  eventsByDay,
  onDaySelect,
  onPrev,
  onToday,
  onNext,
  onRefresh,
}: AgendaCalendarCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.monthLabel} style={{ textTransform: "capitalize" }}>
          {formatMonthLabel(cursorMonth)}
        </div>

        <div className={styles.rangeHint}>
          Vue mensuelle — clique un jour pour voir les détails.
        </div>

        <div className={styles.headerControls}>
          <button className={styles.btnIcon} onClick={onPrev} aria-label="Mois précédent" title="Mois précédent">
            ‹
          </button>
          <button className={styles.btnIcon} onClick={onToday} aria-label="Aujourd’hui" title="Aujourd’hui">
            ●
          </button>
          <button className={styles.btnIcon} onClick={onNext} aria-label="Mois suivant" title="Mois suivant">
            ›
          </button>
          <button
            className={styles.btnIcon}
            onClick={onRefresh}
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
        {success && <div style={{ color: "#22c55e", fontWeight: 800, marginBottom: 10 }}>{success}</div>}

        <div className={styles.dowRow}>
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className={styles.dow}>
              {d}
            </div>
          ))}
        </div>

        <div className={`${styles.grid} ${isSixWeeks ? styles.gridCompact : ""}`}>
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
                className={`${styles.day} ${isSixWeeks ? styles.dayCompact : ""} ${isOutside ? styles.dayOutside : ""} ${isSelected ? styles.daySelected : ""}`}
                onClick={() => onDaySelect(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0))}
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
                    const accentClass = getEventAccentClass(accentFor(ev.id), styles);
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
  );
}

type AgendaSidebarProps = {
  selectedDate: Date;
  selectedEvents: DayEvent[];
  query: string;
  globalMatches: DayEvent[];
  onCreateEvent: () => void;
  onOpenEvent: (event: DayEvent) => void;
  onDeleteEvent: (id: string) => void;
  onJumpToEvent: (event: DayEvent) => void;
};

function AgendaEventRow({
  event,
  meta,
  onClick,
  onDelete,
}: {
  event: DayEvent;
  meta: string;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const accentClass = getEventAccentClass(accentFor(event.id), styles);

  return (
    <div
      key={event.id}
      className={`${styles.eventRow} ${accentClass}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div className={styles.eventMain}>
        <div className={styles.eventTitle}>{event.summary || "Sans titre"}</div>
        <div className={styles.eventMeta}>{meta}</div>
      </div>

      {onDelete ? (
        <button
          type="button"
          aria-label="Supprimer l’évènement"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
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
      ) : null}
    </div>
  );
}

export function AgendaSidebar({
  selectedDate,
  selectedEvents,
  query,
  globalMatches,
  onCreateEvent,
  onOpenEvent,
  onDeleteEvent,
  onJumpToEvent,
}: AgendaSidebarProps) {
  return (
    <div className={styles.card}>
      <div className={styles.sideHeaderCentered}>
        <div className={styles.sideDate}>{formatDayLabel(selectedDate)}</div>
        <div className={styles.sideEventsCount}>
          {selectedEvents.length} événement{selectedEvents.length > 1 ? "s" : ""}
        </div>
        <button className={`${styles.btnPrimaryWide} ${styles.btnBubble}`} onClick={onCreateEvent}>
          ＋ Évènement
        </button>
        <div className={styles.sideDivider} />
      </div>

      <div className={styles.sidebarBody}>
        <div className={styles.sideTitle}>Détails du jour</div>
        {query.trim() ? (
          <div className={styles.list}>
            {globalMatches.length === 0 && <div className={styles.empty}>Aucun résultat.</div>}
            {globalMatches.map((ev) => {
              const when = getEventWhenLabel(ev);
              const dayLabel = ev.startDate ? formatDayLabel(ev.startDate) : "";
              const meta = `${dayLabel}${when ? ` • ${when}` : ""}${ev.location ? ` • ${ev.location}` : ""}`;
              return (
                <React.Fragment key={ev.id}>
                  <AgendaEventRow
                    event={ev}
                    meta={meta}
                    onClick={() => onJumpToEvent(ev)}
                  />
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className={styles.list}>
            {selectedEvents.length === 0 && <div className={styles.empty}>Aucun évènement ce jour-là.</div>}
            {selectedEvents.map((ev) => {
              const when = getEventWhenLabel(ev);
              const meta = `${when}${ev.location ? ` • ${ev.location}` : ""}`;
              return (
                <React.Fragment key={ev.id}>
                  <AgendaEventRow
                    event={ev}
                    meta={meta}
                    onClick={() => onOpenEvent(ev)}
                    onDelete={() => {
                      if (confirm("Supprimer cet évènement ?")) onDeleteEvent(ev.id);
                    }}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type AgendaEventModalProps = {
  open: boolean;
  rdvMode: RdvMode;
  rdvError: string | null;
  rdvSaving: boolean;
  rdvSummary: string;
  rdvDate: string;
  rdvStart: string;
  rdvEnd: string;
  rdvLocation: string;
  rdvNotes: string;
  rdvKind: RdvKind;
  intType: string;
  intStatus: string;
  intReference: string;
  rdvContactId: string;
  rdvNewContactName: string;
  rdvNewContactEmail: string;
  rdvNewContactPhone: string;
  rdvNewContactAddress: string;
  rdvNewContactCity: string;
  rdvNewContactPostal: string;
  rdvNewContactSiren: string;
  rdvNewContactCategory: ContactCategory;
  rdvNewContactType: ContactType;
  rdvNewContactImportant: boolean;
  rdvNewContactNotes: string;
  rdvGuests: GuestContactForm[];
  crmAddFeedback: string;
  contacts: CrmContact[];
  contactsLoading: boolean;
  startTimeOptions: string[];
  endTimeOptions: string[];
  onClose: () => void;
  onDelete: () => void;
  onSubmit: () => void;
  onAddContactToCrm: () => void;
  onAddGuest: () => void;
  onRemoveGuest: (id: string) => void;
  onUpdateGuestContactId: (id: string, contactId: string) => void;
  onUpdateGuestField: (id: string, field: "name" | "email", value: string) => void;
  clearCrmAddFeedback: () => void;
  setRdvKind: (value: RdvKind) => void;
  setRdvSummary: (value: string) => void;
  setRdvDate: (value: string) => void;
  setRdvStart: (value: string) => void;
  setRdvEnd: (value: string) => void;
  setRdvLocation: (value: string) => void;
  setRdvNotes: (value: string) => void;
  setIntType: (value: string) => void;
  setIntStatus: (value: string) => void;
  setIntReference: (value: string) => void;
  setRdvContactId: (value: string) => void;
  setRdvNewContactName: (value: string) => void;
  setRdvNewContactEmail: (value: string) => void;
  setRdvNewContactPhone: (value: string) => void;
  setRdvNewContactAddress: (value: string) => void;
  setRdvNewContactCity: (value: string) => void;
  setRdvNewContactPostal: (value: string) => void;
  setRdvNewContactSiren: (value: string) => void;
  setRdvNewContactCategory: (value: ContactCategory) => void;
  setRdvNewContactType: (value: ContactType) => void;
  setRdvNewContactImportant: (value: boolean) => void;
  setRdvNewContactNotes: (value: string) => void;
};

export function AgendaEventModal(props: AgendaEventModalProps) {
  if (!props.open) return null;

  const updateAndClear = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    props.clearCrmAddFeedback();
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div style={{ fontWeight: 950 }}>
            {props.rdvMode === "create" ? "Nouvel évènement" : "Modifier l’évènement"}
            <p className="text-xs text-white/60 mt-1">Les rappels suivent les réglages iNr’Calendar et partent aussi aux invités renseignés.</p>
          </div>
          <button className={styles.btnGhost} onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {props.rdvError && <div className={styles.modalError}>{props.rdvError}</div>}

          <section className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <div className={styles.formSectionKicker}>
                <span className={styles.formSectionIcon} aria-hidden>📅</span>
                <div>
                  <div className={styles.formSectionTitle}>Rendez-vous</div>
                  <div className={styles.formSectionHint}>Les infos essentielles du créneau.</div>
                </div>
              </div>
            </div>

            <div className={styles.eventMainGrid}>
              <div className={styles.field}>
                <div className={styles.label}>Catégorie</div>
                <select className={styles.input} value={props.rdvKind} onChange={(e) => props.setRdvKind(e.target.value as RdvKind)}>
                  <option value="agenda">Rendez-vous</option>
                  <option value="intervention">Intervention</option>
                </select>
              </div>

              <div className={styles.field}>
                <div className={styles.label}>Titre</div>
                <input className={styles.input} value={props.rdvSummary} onChange={(e) => props.setRdvSummary(e.target.value)} placeholder="Ex: Rendez-vous client" />
              </div>
            </div>

            <div className={styles.eventTimeGrid}>
              <div className={styles.field}>
                <div className={styles.label}>Statut</div>
                <select className={styles.input} value={props.intStatus} onChange={(e) => props.setIntStatus(e.target.value)}>
                  <option value="devis">Devis</option>
                  <option value="confirmé">Confirmé</option>
                  <option value="en cours">En cours</option>
                  <option value="terminé">Terminé</option>
                  <option value="annulé">Annulé</option>
                </select>
              </div>

              <div className={`${styles.field} ${styles.dateField}`}>
                <div className={styles.label}>Date</div>
                <input
                  className={styles.input}
                  type="date"
                  lang="fr-FR"
                  value={props.rdvDate}
                  onChange={(e) => props.setRdvDate(e.target.value)}
                  placeholder="JJ/MM/AAAA"
                />
              </div>

              <div className={styles.field}>
                <div className={styles.label}>Début</div>
                <TimeDropdown value={props.rdvStart} options={props.startTimeOptions} onChange={props.setRdvStart} />
              </div>

              <div className={styles.field}>
                <div className={styles.label}>Fin</div>
                <TimeDropdown value={props.rdvEnd} options={props.endTimeOptions} onChange={props.setRdvEnd} />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <div className={styles.formSectionKicker}>
                <span className={styles.formSectionIcon} aria-hidden>👤</span>
                <div>
                  <div className={styles.formSectionTitle}>Contact principal</div>
                  <div className={styles.formSectionHint}>Base CRM simple : identité, contact et adresse.</div>
                </div>
              </div>
            </div>

            <div className={styles.contactPickerRow}>
              <div className={styles.field}>
                <div className={styles.label}>Contact CRM</div>
                <select className={styles.input} value={props.rdvContactId} onChange={(e) => props.setRdvContactId(e.target.value)}>
                  <option value="">— Aucun —</option>
                  {props.contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {getContactOptionLabel(contact)}
                    </option>
                  ))}
                </select>
                {props.contactsLoading && (
                  <div className={styles.eventSub} style={{ marginTop: 6 }}>
                    Chargement contacts…
                  </div>
                )}
              </div>

              <button
                type="button"
                className={`${styles.btnPrimary} ${styles.sectionAction}`}
                onClick={props.onAddContactToCrm}
                title="Ajoute le contact au CRM (une seule fois)"
              >
                Ajouter au CRM
              </button>
            </div>

            {props.crmAddFeedback ? (
              <div className={styles.eventSub} style={{ marginTop: 8 }}>
                {props.crmAddFeedback}
              </div>
            ) : null}

            <div className={styles.formGrid2}>
              <input
                className={styles.input}
                value={props.rdvNewContactName}
                onChange={(e) => updateAndClear(props.setRdvNewContactName, e.target.value)}
                placeholder="Nom Prénom / Raison sociale"
              />
              <input className={styles.input} value={props.rdvNewContactPhone} onChange={(e) => updateAndClear(props.setRdvNewContactPhone, e.target.value)} placeholder="Téléphone" />
              <input className={styles.input} value={props.rdvNewContactEmail} onChange={(e) => updateAndClear(props.setRdvNewContactEmail, e.target.value)} placeholder="Email" />
              <input className={styles.input} value={props.rdvNewContactAddress} onChange={(e) => updateAndClear(props.setRdvNewContactAddress, e.target.value)} placeholder="Adresse" />
              <input className={styles.input} value={props.rdvNewContactCity} onChange={(e) => updateAndClear(props.setRdvNewContactCity, e.target.value)} placeholder="Ville" />
              <input className={styles.input} value={props.rdvNewContactPostal} onChange={(e) => updateAndClear(props.setRdvNewContactPostal, e.target.value)} placeholder="Code postal" />
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <div className={styles.formSectionKicker}>
                <span className={styles.formSectionIcon} aria-hidden>👥</span>
                <div>
                  <div className={styles.formSectionTitle}>Invités</div>
                  <div className={styles.formSectionHint}>Ils recevront aussi les confirmations et rappels mail.</div>
                </div>
              </div>

              <button type="button" className={styles.btnGhost} onClick={props.onAddGuest}>
                + Ajouter un invité
              </button>
            </div>

            {props.rdvGuests.length === 0 ? (
              <div className={styles.emptyHint}>Aucun invité ajouté.</div>
            ) : (
              <div className={styles.guestList}>
                {props.rdvGuests.map((guest, index) => (
                  <div key={guest.id} className={styles.guestCard}>
                    <div className={styles.guestHeader}>
                      <div className={styles.coordsTitle}>Invité {index + 1}</div>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => props.onRemoveGuest(guest.id)}
                        style={{ borderRadius: 10, padding: "8px 10px" }}
                      >
                        Retirer
                      </button>
                    </div>

                    <div className={styles.field}>
                      <div className={styles.label}>Contact CRM</div>
                      <select
                        className={styles.input}
                        value={guest.contactId}
                        onChange={(e) => props.onUpdateGuestContactId(guest.id, e.target.value)}
                      >
                        <option value="">— Aucun —</option>
                        {props.contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {getContactOptionLabel(contact)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.formGrid2}>
                      <input
                        className={styles.input}
                        value={guest.name}
                        onChange={(e) => props.onUpdateGuestField(guest.id, "name", e.target.value)}
                        placeholder="Nom Prénom / Raison sociale"
                      />
                      <input
                        className={styles.input}
                        value={guest.email}
                        onChange={(e) => props.onUpdateGuestField(guest.id, "email", e.target.value)}
                        placeholder="Email"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.formSection}>
            <div className={styles.formSectionHeader}>
              <div className={styles.formSectionKicker}>
                <span className={styles.formSectionIcon} aria-hidden>📍</span>
                <div>
                  <div className={styles.formSectionTitle}>Lieu & notes</div>
                  <div className={styles.formSectionHint}>Le lieu peut rester vide si l’adresse du contact suffit.</div>
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.label}>Lieu du RDV (optionnel)</div>
              <input
                className={styles.input}
                value={props.rdvLocation}
                onChange={(e) => props.setRdvLocation(e.target.value)}
                placeholder="Ex: zone d’intervention, entrée, bâtiment…"
              />
              <div className={styles.eventSub} style={{ marginTop: 6 }}>
                Si ce champ est vide, l’adresse sera prise depuis le <b>contact principal</b>.
              </div>
            </div>

            <div className={styles.field} style={{ marginTop: 12 }}>
              <div className={styles.label}>Notes</div>
              <textarea className={styles.textarea} value={props.rdvNotes} onChange={(e) => props.setRdvNotes(e.target.value)} placeholder="Détails, consignes, matériel, infos importantes…" />
            </div>
          </section>
        </div>

        <div className={styles.modalFooter}>
          <div className={styles.modalFooterActions}>
            {props.rdvMode === "edit" && (
              <button className={`${styles.btnDanger} ${styles.modalFooterBtn}`} onClick={props.onDelete} disabled={props.rdvSaving}>
                Supprimer
              </button>
            )}
            <button className={`${styles.btnGhost} ${styles.modalFooterBtn}`} onClick={props.onClose} disabled={props.rdvSaving}>
              Annuler
            </button>
            <button className={`${styles.btnPrimary} ${styles.modalFooterBtn}`} onClick={props.onSubmit} disabled={props.rdvSaving}>
              {props.rdvSaving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
