"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

type Props = { mode?: "page" | "drawer" };

type ClientLanguage = "fr" | "en" | "es" | "it" | "de" | "nl" | "pt";
type DateFormat = "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "d MMMM yyyy";
type Currency = "EUR" | "USD" | "GBP" | "CHF" | "CAD";
type PreferencesForm = {
  clientLanguage: ClientLanguage;
  timezone: string;
  dateFormat: DateFormat;
  currency: Currency;
};

const TABLE = "business_profiles";
const STORAGE_KEY = "inrcy_general_preferences";

const initialForm: PreferencesForm = {
  clientLanguage: "fr",
  timezone: "Europe/Paris",
  dateFormat: "dd/MM/yyyy",
  currency: "EUR",
};

const selectOption: React.CSSProperties = { color: "#0b1020", background: "#ffffff" };

const normalizeClientLanguage = (value: unknown): ClientLanguage => {
  const raw = String(value || "").trim().toLowerCase();
  if (["en", "english", "anglais"].includes(raw)) return "en";
  if (["es", "spanish", "espagnol"].includes(raw)) return "es";
  if (["it", "italian", "italien"].includes(raw)) return "it";
  if (["de", "german", "allemand"].includes(raw)) return "de";
  if (["nl", "dutch", "neerlandais", "néerlandais"].includes(raw)) return "nl";
  if (["pt", "portuguese", "portugais"].includes(raw)) return "pt";
  return "fr";
};

const normalizeTimezone = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "Europe/Paris";
  return raw.slice(0, 80);
};

const normalizeDateFormat = (value: unknown): DateFormat => {
  const raw = String(value || "").trim();
  if (raw === "MM/dd/yyyy") return "MM/dd/yyyy";
  if (raw === "yyyy-MM-dd") return "yyyy-MM-dd";
  if (raw === "d MMMM yyyy") return "d MMMM yyyy";
  return "dd/MM/yyyy";
};

const normalizeCurrency = (value: unknown): Currency => {
  const raw = String(value || "").trim().toUpperCase();
  if (["USD", "GBP", "CHF", "CAD"].includes(raw)) return raw as Currency;
  return "EUR";
};

const hasPreferenceValue = (value: unknown): boolean => String(value ?? "").trim().length > 0;

const normalizePartialPreferences = (source: Record<string, unknown> | null | undefined): Partial<PreferencesForm> => {
  if (!source) return {};

  const preferences: Partial<PreferencesForm> = {};

  if (hasPreferenceValue(source.clientLanguage)) {
    preferences.clientLanguage = normalizeClientLanguage(source.clientLanguage);
  }
  if (hasPreferenceValue(source.client_language)) {
    preferences.clientLanguage = normalizeClientLanguage(source.client_language);
  }
  if (hasPreferenceValue(source.timezone)) {
    preferences.timezone = normalizeTimezone(source.timezone);
  }
  if (hasPreferenceValue(source.dateFormat)) {
    preferences.dateFormat = normalizeDateFormat(source.dateFormat);
  }
  if (hasPreferenceValue(source.date_format)) {
    preferences.dateFormat = normalizeDateFormat(source.date_format);
  }
  if (hasPreferenceValue(source.currency)) {
    preferences.currency = normalizeCurrency(source.currency);
  }

  return preferences;
};

export default function GeneralPreferencesContent({ mode = "drawer" }: Props) {
  const [form, setForm] = useState<PreferencesForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const card: React.CSSProperties = useMemo(() => ({
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "clamp(12px, 3.6vw, 16px)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.045)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  }), []);

  const heroCard: React.CSSProperties = useMemo(() => ({
    ...card,
    position: "relative",
    overflow: "hidden",
    border: "1px solid rgba(56,189,248,0.22)",
    background: "linear-gradient(135deg, rgba(56,189,248,0.16), rgba(97,87,255,0.14), rgba(251,191,36,0.12))",
    boxShadow: "0 20px 60px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)",
  }), [card]);

  const sectionTitle: React.CSSProperties = {
    color: "rgba(255,255,255,0.94)",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: ".08em",
    textTransform: "uppercase",
  };

  const input: React.CSSProperties = useMemo(() => ({
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 44,
    boxSizing: "border-box",
    fontSize: 15,
    lineHeight: 1.35,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    padding: "10px 12px",
    color: "white",
    outline: "none",
  }), []);

  const label: React.CSSProperties = {
    display: "grid",
    gap: 9,
    minWidth: 0,
    maxWidth: "100%",
    padding: "12px",
    borderRadius: 15,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.060), rgba(255,255,255,0.025))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  };
  const labelTitle: React.CSSProperties = { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 800, lineHeight: 1.25 };
  const grid2: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", minWidth: 0, maxWidth: "100%" };
  const primaryBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(135deg, rgba(251,191,36,.35), rgba(97,87,255,.28), rgba(0,200,255,.22))",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: saving ? "default" : "pointer",
    fontWeight: 900,
    fontSize: 16,
    width: "100%",
    opacity: saving ? 0.7 : 1,
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        let local: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
          local = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {}

        const supabase = createClient();
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw new Error(authErr.message);
        const user = authData?.user;

        let dbPreferences: Partial<PreferencesForm> = {};
        if (user) {
          const { data, error: dbErr } = await supabase
            .from(TABLE)
            .select("client_language, timezone, date_format, currency, updated_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (dbErr) throw new Error(dbErr.message);
          dbPreferences = normalizePartialPreferences(data);
        }

        const migratedLocal = normalizePartialPreferences(local);

        setForm({ ...initialForm, ...migratedLocal, ...dbPreferences });
      } catch (e) {
        setError(getSimpleFrenchErrorMessage(e, "Impossible de charger les préférences générales."));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const set = <K extends keyof PreferencesForm>(key: K, value: PreferencesForm[K]) => {
    setSaved(false);
    setError("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));

      const supabase = createClient();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message);
      const user = authData?.user;
      if (user) {
        const { error: upErr } = await supabase.from(TABLE).upsert(
          {
            user_id: user.id,
            client_language: form.clientLanguage,
            timezone: form.timezone,
            date_format: form.dateFormat,
            currency: form.currency,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (upErr) throw new Error(upErr.message);
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("inrcy:general-preferences-updated", {
          detail: {
            clientLanguage: form.clientLanguage,
            timezone: form.timezone,
            dateFormat: form.dateFormat,
            currency: form.currency,
          },
        }));
      }

      setSaved(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/client_language|timezone|date_format|currency/i.test(message)) {
        setError("Il faut d’abord exécuter le SQL des préférences générales dans Supabase.");
      } else {
        setError(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer les préférences générales."));
      }
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(initialForm);
    setSaved(false);
    setError("");
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>
      <div style={heroCard}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: -36,
            top: -44,
            width: 130,
            height: 130,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 66%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ fontSize: "clamp(16px, 4.6vw, 18px)", fontWeight: 950, color: "rgba(255,255,255,0.98)", marginBottom: 8, lineHeight: 1.25, overflowWrap: "break-word" }}>
          ⚙️ Préférences générales
        </div>
        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.55, maxWidth: 620, overflowWrap: "break-word" }}>
          Réglez les paramètres globaux de vos échanges clients.
        </div>
      </div>

      <div style={card}>
        {loading ? (
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={sectionTitle}>Localisation & échanges clients</div>
              <div style={grid2}>
                <label style={label}>
                  <span style={labelTitle}>Langue clients</span>
                  <select style={input} value={form.clientLanguage} onChange={(e) => set("clientLanguage", e.target.value as ClientLanguage)}>
                    <option value="fr" style={selectOption}>Français</option>
                    <option value="en" style={selectOption}>English</option>
                    <option value="es" style={selectOption}>Español</option>
                    <option value="it" style={selectOption}>Italiano</option>
                    <option value="de" style={selectOption}>Deutsch</option>
                    <option value="nl" style={selectOption}>Nederlands</option>
                    <option value="pt" style={selectOption}>Português</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Fuseau horaire</span>
                  <select style={input} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    <option value="Europe/Paris" style={selectOption}>Europe/Paris</option>
                    <option value="Europe/London" style={selectOption}>Europe/London</option>
                    <option value="Europe/Madrid" style={selectOption}>Europe/Madrid</option>
                    <option value="Europe/Rome" style={selectOption}>Europe/Rome</option>
                    <option value="Europe/Berlin" style={selectOption}>Europe/Berlin</option>
                    <option value="Europe/Brussels" style={selectOption}>Europe/Brussels</option>
                    <option value="Europe/Amsterdam" style={selectOption}>Europe/Amsterdam</option>
                    <option value="Europe/Lisbon" style={selectOption}>Europe/Lisbon</option>
                    <option value="America/New_York" style={selectOption}>America/New_York</option>
                    <option value="America/Toronto" style={selectOption}>America/Toronto</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Format de date</span>
                  <select style={input} value={form.dateFormat} onChange={(e) => set("dateFormat", e.target.value as DateFormat)}>
                    <option value="dd/MM/yyyy" style={selectOption}>19/06/2026</option>
                    <option value="MM/dd/yyyy" style={selectOption}>06/19/2026</option>
                    <option value="yyyy-MM-dd" style={selectOption}>2026-06-19</option>
                    <option value="d MMMM yyyy" style={selectOption}>19 juin 2026</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Devise</span>
                  <select style={input} value={form.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
                    <option value="EUR" style={selectOption}>EUR €</option>
                    <option value="USD" style={selectOption}>USD $</option>
                    <option value="GBP" style={selectOption}>GBP £</option>
                    <option value="CHF" style={selectOption}>CHF</option>
                    <option value="CAD" style={selectOption}>CAD $</option>
                  </select>
                </label>
              </div>
            </div>

            {error ? <div style={{ color: "rgba(248,113,113,0.95)", fontWeight: 800 }}>{error}</div> : null}
            {saved ? <div style={{ color: "rgba(34,197,94,0.95)", fontWeight: 900 }}>Préférences enregistrées ✅</div> : null}

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", minWidth: 0, maxWidth: "100%" }}>
              <button type="button" style={primaryBtn} disabled={saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
              <button type="button" disabled={saving} onClick={reset} style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", borderRadius: 14, padding: "10px 12px", cursor: saving ? "default" : "pointer", fontWeight: 900, fontSize: 16 }}>
                Réinitialiser
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
