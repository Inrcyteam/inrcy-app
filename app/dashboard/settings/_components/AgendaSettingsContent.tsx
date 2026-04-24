"use client";

import React from "react";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { providerLabel, type MailAccountOption } from "../../agenda/agenda.shared";

const INRCALENDAR_SETTINGS_UPDATED_EVENT = "inrcalendar:settings-updated";

const REMINDER_OPTIONS = [
  { value: 2880, label: "48h avant", helper: "Rappel long, utile pour préparer le passage." },
  { value: 1440, label: "24h avant", helper: "Activé par défaut." },
  { value: 120, label: "2h avant", helper: "Activé par défaut." },
] as const;

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
  subtitle: string;
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
      </div>
      {children ? <div style={{ display: "grid", gap: 10, marginTop: 12, minWidth: 0 }}>{children}</div> : null}
    </div>
  );
}

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" | "success" }) {
  const color = tone === "error" ? "#fca5a5" : tone === "success" ? "#86efac" : "rgba(255,255,255,0.66)";
  return <div style={{ fontSize: 12.5, lineHeight: 1.45, color }}>{children}</div>;
}

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

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
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

function normalizeOffsets(value: unknown) {
  const list = Array.isArray(value) ? value : [1440, 120];
  return Array.from(new Set(list.map(Number).filter((item) => [2880, 1440, 120].includes(item))));
}

export default function AgendaSettingsContent() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [accounts, setAccounts] = React.useState<MailAccountOption[]>([]);
  const [selectedMailAccountId, setSelectedMailAccountId] = React.useState("");
  const [sendConfirmationOnSave, setSendConfirmationOnSave] = React.useState(false);
  const [reminderOffsetsMinutes, setReminderOffsetsMinutes] = React.useState<number[]>([1440, 120]);
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
  }) {
    const payload = {
      selectedMailAccountId,
      sendConfirmationOnSave,
      reminderOffsetsMinutes,
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

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <style jsx>{`
        .agendaSettings_select option {
          color: #111827;
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
          Gérez la boîte d’envoi des rappels et les moments où vos clients reçoivent les mails.
        </div>
      </div>

      {loading ? <Notice>Chargement des réglages…</Notice> : null}
      {saving ? <Notice>Enregistrement…</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <GlassCard
        title="Boîte d’envoi des rappels"
        subtitle="Les mails de rappel client partiront de cette boîte iNr’Send."
      >
        <select
          className="agendaSettings_select"
          style={fieldStyle}
          value={selectedMailAccountId}
          disabled={loading || saving}
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

      <GlassCard
        title="Créneaux des rappels"
        subtitle="Par défaut : 24h et 2h avant le rendez-vous. Vous pouvez ajouter la confirmation et le rappel 48h."
      >
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={sendConfirmationOnSave}
            disabled={loading || saving}
            onChange={(e) => {
              const checked = e.target.checked;
              setSendConfirmationOnSave(checked);
              void saveSettings({ sendConfirmationOnSave: checked });
            }}
          />
          <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
            <strong style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5 }}>Au moment de l’enregistrement du RDV</strong>
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12.5 }}>Mail de confirmation envoyé dès la création du rendez-vous.</span>
          </span>
        </label>

        {REMINDER_OPTIONS.map((option) => (
          <label key={option.value} style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={reminderOffsetsMinutes.includes(option.value)}
              disabled={loading || saving}
              onChange={(e) => toggleOffset(option.value, e.target.checked)}
            />
            <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <strong style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5 }}>{option.label}</strong>
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12.5 }}>{option.helper}</span>
            </span>
          </label>
        ))}
      </GlassCard>
    </div>
  );
}
