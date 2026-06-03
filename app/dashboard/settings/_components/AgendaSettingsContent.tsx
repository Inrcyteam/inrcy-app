"use client";

import React from "react";
import {
  DEFAULT_INRBADGE_APPOINTMENT_SETTINGS,
  normalizeInrBadgeAppointmentSettings,
  type InrBadgeAppointmentDaySettings,
  type InrBadgeAppointmentSettings,
} from "@/lib/inrBadgeSettings";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { providerLabel, type MailAccountOption } from "../../agenda/agenda.shared";

const INRCALENDAR_SETTINGS_UPDATED_EVENT = "inrcalendar:settings-updated";

const REMINDER_OPTIONS = [
  { value: "confirmation", label: "À l’enregistrement" },
  { value: 2880, label: "48h avant" },
  { value: 1440, label: "24h avant" },
  { value: 120, label: "2h avant" },
] as const;

const WEEKDAY_ITEMS = [
  { key: "1", label: "Lundi" },
  { key: "2", label: "Mardi" },
  { key: "3", label: "Mercredi" },
  { key: "4", label: "Jeudi" },
  { key: "5", label: "Vendredi" },
  { key: "6", label: "Samedi" },
  { key: "0", label: "Dimanche" },
] as const;

const TIME_OPTIONS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00",
];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const DAYS_AHEAD_OPTIONS = [7, 14, 21, 30, 45, 60];
const MIN_NOTICE_OPTIONS = [0, 2, 4, 12, 24, 48, 72];

function dispatchCalendarSettingsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INRCALENDAR_SETTINGS_UPDATED_EVENT));
}

function GlassCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="agendaSettings_glassCard"
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
        padding: 14,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.2px", color: "rgba(255,255,255,0.92)" }}>
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.68)",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              lineHeight: 1.45,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {children ? <div style={{ display: "grid", gap: 10, marginTop: 12, minWidth: 0 }}>{children}</div> : null}
    </div>
  );
}

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" | "success" }) {
  const color = tone === "error" ? "#fca5a5" : tone === "success" ? "#86efac" : "rgba(255,255,255,0.66)";
  return <div style={{ fontSize: 12.5, lineHeight: 1.45, color }}>{children}</div>;
}

function normalizeOffsets(value: unknown) {
  const list = Array.isArray(value) ? value : [1440, 120];
  return Array.from(new Set(list.map(Number).filter((item) => [2880, 1440, 120].includes(item))));
}

function getDaySettings(settings: InrBadgeAppointmentSettings, key: string): InrBadgeAppointmentDaySettings {
  return settings.dailySlots[key] || DEFAULT_INRBADGE_APPOINTMENT_SETTINGS.dailySlots[key] || DEFAULT_INRBADGE_APPOINTMENT_SETTINGS.dailySlots["1"];
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6, minWidth: 0, opacity: disabled ? 0.48 : 1 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <select className="agendaSettings_select" style={fieldStyle} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.82)",
  fontSize: 12.5,
  fontWeight: 850,
};

const fieldStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.92)",
  padding: "11px 12px",
  outline: "none",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const globalGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const dayTableHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(138px, 1.4fr) minmax(84px, 0.9fr) minmax(84px, 0.9fr) minmax(118px, 1.1fr)",
  gap: 8,
  alignItems: "center",
  padding: "0 12px",
  color: "rgba(255,255,255,0.60)",
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const dayCardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  padding: 12,
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const dayRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(138px, 1.4fr) minmax(84px, 0.9fr) minmax(84px, 0.9fr) minmax(118px, 1.1fr)",
  gap: 8,
  alignItems: "center",
  minWidth: 0,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  padding: 10,
};

const compactSelectStyle: React.CSSProperties = {
  ...fieldStyle,
  padding: "9px 10px",
  borderRadius: 10,
  fontSize: 13,
};

const dayNameStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.94)",
  fontSize: 13.5,
  fontWeight: 900,
};

const dayMetaStackStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const dayToggleInlineStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 800,
};

const remindersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const reminderLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  padding: "11px 12px",
  cursor: "pointer",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

export default function AgendaSettingsContent() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [accounts, setAccounts] = React.useState<MailAccountOption[]>([]);
  const [selectedMailAccountId, setSelectedMailAccountId] = React.useState("");
  const [sendConfirmationOnSave, setSendConfirmationOnSave] = React.useState(false);
  const [reminderOffsetsMinutes, setReminderOffsetsMinutes] = React.useState<number[]>([1440, 120]);
  const [appointmentSettings, setAppointmentSettings] = React.useState<InrBadgeAppointmentSettings>(DEFAULT_INRBADGE_APPOINTMENT_SETTINGS);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const loadSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/calendar/settings", { cache: "no-store" });
      if (!response.ok) throw new Error(await getSimpleFrenchApiError(response, "Impossible de charger les réglages Agenda."));
      const json = await response.json().catch(() => ({}));
      setAccounts(Array.isArray(json?.accounts) ? json.accounts : []);
      setSelectedMailAccountId(String(json?.selectedMailAccountId || ""));
      setSendConfirmationOnSave(Boolean(json?.sendConfirmationOnSave));
      setReminderOffsetsMinutes(normalizeOffsets(json?.reminderOffsetsMinutes));
      setAppointmentSettings(normalizeInrBadgeAppointmentSettings(json?.appointmentSettings));
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible de charger les réglages Agenda."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings(next: {
    selectedMailAccountId?: string;
    sendConfirmationOnSave?: boolean;
    reminderOffsetsMinutes?: number[];
    appointmentSettings?: InrBadgeAppointmentSettings;
  }) {
    const payload = {
      selectedMailAccountId,
      sendConfirmationOnSave,
      reminderOffsetsMinutes,
      appointmentSettings,
      ...next,
    };

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/calendar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await getSimpleFrenchApiError(response, "Impossible d’enregistrer les réglages Agenda."));
      const json = await response.json().catch(() => ({}));
      setSelectedMailAccountId(String(json?.selectedMailAccountId || payload.selectedMailAccountId || ""));
      setSendConfirmationOnSave(Boolean(json?.sendConfirmationOnSave ?? payload.sendConfirmationOnSave));
      setReminderOffsetsMinutes(normalizeOffsets(json?.reminderOffsetsMinutes ?? payload.reminderOffsetsMinutes));
      setAppointmentSettings(normalizeInrBadgeAppointmentSettings(json?.appointmentSettings ?? payload.appointmentSettings));
      setNotice("Réglages enregistrés.");
      dispatchCalendarSettingsUpdated();
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer les réglages Agenda."));
      void loadSettings();
    } finally {
      setSaving(false);
    }
  }

  function toggleOffset(offset: number, checked: boolean) {
    const nextOffsets = checked
      ? Array.from(new Set([...reminderOffsetsMinutes, offset]))
      : reminderOffsetsMinutes.filter((item) => item !== offset);
    setReminderOffsetsMinutes(nextOffsets);
    void saveSettings({ reminderOffsetsMinutes: nextOffsets });
  }

  function updateAppointmentSettings(patch: Partial<InrBadgeAppointmentSettings>) {
    const nextSettings = normalizeInrBadgeAppointmentSettings({ ...appointmentSettings, ...patch });
    setAppointmentSettings(nextSettings);
    void saveSettings({ appointmentSettings: nextSettings });
  }

  function updateDaySettings(dayKey: string, patch: Partial<InrBadgeAppointmentDaySettings>) {
    const currentDaySettings = getDaySettings(appointmentSettings, dayKey);
    const nextSettings = normalizeInrBadgeAppointmentSettings({
      ...appointmentSettings,
      dailySlots: {
        ...appointmentSettings.dailySlots,
        [dayKey]: {
          ...currentDaySettings,
          ...patch,
        },
      },
    });
    setAppointmentSettings(nextSettings);
    void saveSettings({ appointmentSettings: nextSettings });
  }

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <style>{`
        .agendaSettings_select option {
          color: #111827;
        }
        @media (max-width: 720px) {
          .agendaSettings_responsiveTwo {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(135deg, rgba(56,189,248,0.16), rgba(244,114,182,0.12), rgba(251,146,60,0.10))",
          padding: 14,
          boxSizing: "border-box",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 950, color: "rgba(255,255,255,0.94)" }}>
          Réglages iNr’Calendar
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.70)", lineHeight: 1.45 }}>
          Gérez la boîte d’envoi, les rappels et les créneaux proposés sur iNr’Badge.
        </div>
      </div>

      {loading ? <Notice>Chargement des réglages…</Notice> : null}
      {saving ? <Notice>Enregistrement…</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <GlassCard title="Boîte d’envoi des rappels" subtitle="Les mails de rappel partiront de cette boîte mail iNr’Send.">
        <select
          className="agendaSettings_select"
          style={fieldStyle}
          value={selectedMailAccountId}
          disabled={loading}
          onChange={(e) => {
            const nextId = e.target.value;
            setSelectedMailAccountId(nextId);
            void saveSettings({ selectedMailAccountId: nextId });
          }}
        >
          <option value="">— Envoi client depuis iNrCy —</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {providerLabel(account.provider)} — {account.display_name || account.email_address}
            </option>
          ))}
        </select>
        <Notice>
          {selectedMailAccountId
            ? "Boîte sélectionnée pour les futurs rendez-vous."
            : "Aucune boîte sélectionnée : les rappels restent envoyés depuis iNrCy."}
        </Notice>
      </GlassCard>

      <GlassCard title="Créneaux des rappels">
        <div className="agendaSettings_responsiveTwo" style={remindersGridStyle}>
          {REMINDER_OPTIONS.map((option) => {
            const isConfirmation = option.value === "confirmation";
            const offset = typeof option.value === "number" ? option.value : null;
            const checked = isConfirmation ? sendConfirmationOnSave : offset !== null && reminderOffsetsMinutes.includes(offset);
            return (
              <label key={String(option.value)} style={reminderLabelStyle}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={loading}
                  onChange={(e) => {
                    if (isConfirmation) {
                      const checkedValue = e.target.checked;
                      setSendConfirmationOnSave(checkedValue);
                      void saveSettings({ sendConfirmationOnSave: checkedValue });
                      return;
                    }
                    if (offset !== null) toggleOffset(offset, e.target.checked);
                  }}
                  style={{ width: 16, height: 16, accentColor: "#ec4899" }}
                />
                <strong style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5 }}>{option.label}</strong>
              </label>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard
        title="Prise de RDV"
        subtitle="Ces réglages concernent les créneaux proposés aux clients depuis votre fiche publique. L’ajout manuel d’un RDV dans iNr’Calendar reste libre."
      >
        <div className="agendaSettings_responsiveTwo" style={globalGridStyle}>
          <SelectField
            label="Proposer sur"
            value={appointmentSettings.daysAhead}
            options={DAYS_AHEAD_OPTIONS.map((value) => ({ value, label: `${value} jours` }))}
            disabled={loading}
            onChange={(value) => updateAppointmentSettings({ daysAhead: Number(value) })}
          />
          <SelectField
            label="Délai minimum"
            value={appointmentSettings.minNoticeHours}
            options={MIN_NOTICE_OPTIONS.map((value) => ({ value, label: value === 0 ? "Immédiat" : `${value}h avant` }))}
            disabled={loading}
            onChange={(value) => updateAppointmentSettings({ minNoticeHours: Number(value) })}
          />
        </div>

        <div style={dayCardStyle}>
          <div style={dayTableHeaderStyle}>
            <span>Jour</span>
            <span>Début</span>
            <span>Fin</span>
            <span>Durée</span>
          </div>

          {WEEKDAY_ITEMS.map((day) => {
            const daySettings = getDaySettings(appointmentSettings, day.key);
            return (
              <div key={day.key} style={{ ...dayRowStyle, opacity: daySettings.enabled ? 1 : 0.62 }}>
                <div style={dayMetaStackStyle}>
                  <span style={dayNameStyle}>{day.label}</span>
                  <label style={dayToggleInlineStyle}>
                    <input
                      type="checkbox"
                      checked={daySettings.enabled}
                      disabled={loading}
                      onChange={(e) => updateDaySettings(day.key, { enabled: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: "#8b5cf6" }}
                    />
                    <span>{daySettings.enabled ? "Ouvert" : "Fermé"}</span>
                  </label>
                </div>

                <select
                  className="agendaSettings_select"
                  style={compactSelectStyle}
                  value={daySettings.startTime}
                  disabled={!daySettings.enabled || loading}
                  onChange={(e) => updateDaySettings(day.key, { startTime: e.target.value })}
                >
                  {TIME_OPTIONS.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>

                <select
                  className="agendaSettings_select"
                  style={compactSelectStyle}
                  value={daySettings.endTime}
                  disabled={!daySettings.enabled || loading}
                  onChange={(e) => updateDaySettings(day.key, { endTime: e.target.value })}
                >
                  {TIME_OPTIONS.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>

                <select
                  className="agendaSettings_select"
                  style={compactSelectStyle}
                  value={String(daySettings.durationMinutes)}
                  disabled={!daySettings.enabled || loading}
                  onChange={(e) => updateDaySettings(day.key, { durationMinutes: Number(e.target.value) })}
                >
                  {DURATION_OPTIONS.map((value) => (
                    <option key={value} value={String(value)}>{value} min</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
