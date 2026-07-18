"use client";

import React from "react";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import {
  DEFAULT_INRDOCUMENTS_SETTINGS,
  DOCUMENT_ACCENT_COLORS,
  DOCUMENT_DESIGN_PRESETS,
  DOCUMENT_KINDS,
  DOCUMENT_OPERATION_CATEGORIES,
  DOCUMENT_PAYMENT_METHODS,
  DOCUMENT_STATUSES,
  DOCUMENT_VAT_RATES,
  INRDOCUMENTS_SETTINGS_UPDATED_EVENT,
  InrDocumentsSettings,
  normalizeInrDocumentsSettings,
} from "@/lib/inrdocumentsSettings";

const operationLabels: Record<string, string> = {
  "": "—",
  vente: "Vente",
  prestation: "Prestation de services",
  mixte: "Vente + prestation",
};

const paymentLabels: Record<string, string> = {
  "": "—",
  virement: "Virement bancaire",
  cb: "Carte bancaire",
  cheque: "Chèque",
  especes: "Espèces",
  abonnement: "Abonnement",
};

const documentKindLabels: Record<string, string> = {
  invoice: "Facture",
  deposit: "Facture d’acompte",
  credit_note: "Avoir",
};

const statusLabels: Record<string, string> = {
  "": "—",
  brouillon: "Brouillon",
  en_attente_paiement: "En attente de paiement",
  envoye: "Envoyé",
  paye: "Payé",
};

const designPresetLabels: Record<string, string> = {
  standard: "Standard",
  business: "Business",
  encadre: "Encadré",
  signature: "Signature",
};

const accentColorLabels: Record<string, string> = {
  blue: "Bleu",
  violet: "Violet",
  orange: "Orange",
  green: "Vert",
  gray: "Gris pro",
  rose: "Rose",
  teal: "Turquoise",
  gold: "Or",
};

const fieldStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.92)",
  padding: "11px 12px",
  outline: "none",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12.5,
  color: "rgba(255,255,255,0.76)",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.08)",
  padding: "11px 12px",
  cursor: "pointer",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

function dispatchUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INRDOCUMENTS_SETTINGS_UPDATED_EVENT));
}

function GlassCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.045))",
        boxShadow: "0 18px 50px rgba(0,0,0,0.26)",
        padding: 14,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, rgba(56,189,248,0.22), rgba(244,114,182,0.18))",
            border: "1px solid rgba(255,255,255,0.10)",
            flex: "0 0 auto",
          }}
        >
          {icon}
        </span>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: "-0.2px", color: "rgba(255,255,255,0.94)" }}>{title}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", lineHeight: 1.45 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, marginTop: 12, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" | "success" }) {
  const color = tone === "error" ? "#fca5a5" : tone === "success" ? "#86efac" : "rgba(255,255,255,0.66)";
  return <div style={{ fontSize: 12.5, lineHeight: 1.45, color }}>{children}</div>;
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div data-doc-settings-grid="2" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={labelStyle}>
      <span>{label}</span>
      {children}
    </label>
  );
}

type Props = {
  onUnsavedChange?: (hasUnsavedChanges: boolean) => void;
};

export default function DocumentsSettingsContent({ onUnsavedChange }: Props) {
  const [settings, setSettings] = React.useState<InrDocumentsSettings>(DEFAULT_INRDOCUMENTS_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const savedSettingsSignatureRef = React.useRef("");

  React.useEffect(() => {
    if (loading) {
      onUnsavedChange?.(false);
      return;
    }
    onUnsavedChange?.(
      savedSettingsSignatureRef.current !== "" && savedSettingsSignatureRef.current !== JSON.stringify(settings),
    );
  }, [loading, onUnsavedChange, settings]);

  const loadSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/documents/settings", { cache: "no-store" });
      if (!response.ok) throw new Error(await getSimpleFrenchApiError(response, "Impossible de charger les réglages Devis & Factures."));
      const json = await response.json().catch(() => ({}));
      const nextSettings = normalizeInrDocumentsSettings(json?.settings);
      setSettings(nextSettings);
      savedSettingsSignatureRef.current = JSON.stringify(nextSettings);
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible de charger les réglages Devis & Factures."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateLocal(patch: Partial<InrDocumentsSettings>) {
    setSettings((current) => normalizeInrDocumentsSettings({
      common: { ...current.common, ...(patch.common || {}) },
      quote: { ...current.quote, ...(patch.quote || {}) },
      invoice: { ...current.invoice, ...(patch.invoice || {}) },
    }));
  }

  async function saveSettings() {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/documents/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) throw new Error(await getSimpleFrenchApiError(response, "Impossible d’enregistrer les réglages Devis & Factures."));
      const json = await response.json().catch(() => ({}));
      const nextSettings = normalizeInrDocumentsSettings(json?.settings);
      setSettings(nextSettings);
      savedSettingsSignatureRef.current = JSON.stringify(nextSettings);
      onUnsavedChange?.(false);
      setNotice("Réglages enregistrés.");
      dispatchUpdated();
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer les réglages Devis & Factures."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <style jsx>{`
        select option { color: #111827; }
        @media (max-width: 620px) {
          div[data-doc-settings-grid="2"] { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "linear-gradient(135deg, rgba(56,189,248,0.16), rgba(244,114,182,0.12), rgba(251,146,60,0.10))",
          padding: 14,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 950, color: "rgba(255,255,255,0.94)" }}>Devis & Factures</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.70)", lineHeight: 1.45 }}>
          Ces valeurs remplissent automatiquement les nouveaux documents. Elles restent modifiables dans les options avancées.
        </div>
      </div>

      {loading ? <Notice>Chargement des réglages…</Notice> : null}

      <GlassCard icon="⚙️" title="Commun" subtitle="Ce qui sert aux devis et aux factures.">
        <Grid2>
          <Field label="Catégorie d’opération">
            <select style={fieldStyle} value={settings.common.operationCategory} onChange={(e) => updateLocal({ common: { ...settings.common, operationCategory: e.target.value as any } })}>
              {DOCUMENT_OPERATION_CATEGORIES.map((key) => <option key={key} value={key}>{operationLabels[key]}</option>)}
            </select>
          </Field>
          <Field label="Acompte">
            <select
              style={fieldStyle}
              value={settings.common.depositKind}
              onChange={(e) => updateLocal({ common: { ...settings.common, depositKind: e.target.value as any, depositValue: e.target.value ? settings.common.depositValue : "" } })}
            >
              <option value="">—</option>
              <option value="percent">Pourcentage</option>
              <option value="amount">Montant</option>
            </select>
          </Field>
        </Grid2>

        <Grid2>
          <Field label="Valeur acompte">
            <input
              style={fieldStyle}
              type="number"
              min="0"
              step="0.01"
              value={settings.common.depositValue}
              disabled={!settings.common.depositKind}
              onChange={(e) => updateLocal({ common: { ...settings.common, depositValue: e.target.value } })}
              placeholder={settings.common.depositKind === "amount" ? "Ex : 300" : "Ex : 30"}
            />
          </Field>
          <Field label="Notes">
            <input style={fieldStyle} value={settings.common.notes} onChange={(e) => updateLocal({ common: { ...settings.common, notes: e.target.value } })} placeholder="Ex : Merci pour votre confiance." />
          </Field>
        </Grid2>
      </GlassCard>

      <GlassCard icon="🧾" title="Prestation" subtitle="La première ligne proposée dans le document.">
        <Grid2>
          <Field label="Libellé">
            <input style={fieldStyle} value={settings.common.defaultLine.label} onChange={(e) => updateLocal({ common: { ...settings.common, defaultLine: { ...settings.common.defaultLine, label: e.target.value } } })} placeholder="Prestation" />
          </Field>
          <Field label="Prix HT">
            <input style={fieldStyle} type="number" min="0" step="0.01" value={settings.common.defaultLine.unitPrice} onChange={(e) => updateLocal({ common: { ...settings.common, defaultLine: { ...settings.common.defaultLine, unitPrice: Number(e.target.value) || 0 } } })} />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Quantité">
            <input style={fieldStyle} type="number" min="1" step="0.01" value={settings.common.defaultLine.qty} onChange={(e) => updateLocal({ common: { ...settings.common, defaultLine: { ...settings.common.defaultLine, qty: Number(e.target.value) || 1 } } })} />
          </Field>
          <Field label="TVA">
            <select style={fieldStyle} value={settings.common.defaultLine.vatRate} onChange={(e) => updateLocal({ common: { ...settings.common, defaultLine: { ...settings.common.defaultLine, vatRate: Number(e.target.value) } } })}>
              {DOCUMENT_VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
            </select>
          </Field>
        </Grid2>
      </GlassCard>

      <GlassCard icon="💳" title="Paiement" subtitle="Conditions de règlement reprises sur les documents.">
        <Grid2>
          <Field label="Mode de paiement">
            <select style={fieldStyle} value={settings.common.paymentMethod} onChange={(e) => updateLocal({ common: { ...settings.common, paymentMethod: e.target.value as any } })}>
              {DOCUMENT_PAYMENT_METHODS.map((key) => <option key={key} value={key}>{paymentLabels[key]}</option>)}
            </select>
          </Field>
          <Field label="IBAN">
            <input style={fieldStyle} value={settings.common.paymentDetails} onChange={(e) => updateLocal({ common: { ...settings.common, paymentDetails: e.target.value } })} placeholder="Ex : IBAN FR76..." />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Échéance facture (+ jours)">
            <input style={fieldStyle} type="number" min="1" value={settings.invoice.dueDays} onChange={(e) => updateLocal({ invoice: { ...settings.invoice, dueDays: Number(e.target.value) || 1 } })} />
          </Field>
          <Field label="Pénalités de retard (%)">
            <input style={fieldStyle} type="number" min="0" step="0.01" value={settings.invoice.lateFeeRate} onChange={(e) => updateLocal({ invoice: { ...settings.invoice, lateFeeRate: e.target.value } })} placeholder="Ex : 12.00" />
          </Field>
        </Grid2>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={settings.invoice.fixedRecoveryFee40} onChange={(e) => updateLocal({ invoice: { ...settings.invoice, fixedRecoveryFee40: e.target.checked } })} />
          <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
            <strong style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5 }}>Indemnité forfaitaire de 40 €</strong>
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12.5 }}>Mentionnée en cas de retard de paiement.</span>
          </span>
        </label>
      </GlassCard>

      <GlassCard icon="✍️" title="Devis" subtitle="Réglages appliqués uniquement aux nouveaux devis.">
        <Field label="Durée de validité (jours)">
          <input style={fieldStyle} type="number" min="1" value={settings.quote.validityDays} onChange={(e) => updateLocal({ quote: { ...settings.quote, validityDays: Number(e.target.value) || 1 } })} />
        </Field>
        <Field label="Mention spécifique">
          <textarea style={{ ...fieldStyle, resize: "vertical" }} rows={2} value={settings.quote.mention} onChange={(e) => updateLocal({ quote: { ...settings.quote, mention: e.target.value } })} placeholder="Ex : Devis valable selon disponibilité." />
        </Field>
      </GlassCard>

      <GlassCard icon="€" title="Factures" subtitle="Réglages appliqués uniquement aux nouvelles factures.">
        <Grid2>
          <Field label="Type de document">
            <select style={fieldStyle} value={settings.invoice.documentKind} onChange={(e) => updateLocal({ invoice: { ...settings.invoice, documentKind: e.target.value as any } })}>
              {DOCUMENT_KINDS.map((key) => <option key={key} value={key}>{documentKindLabels[key]}</option>)}
            </select>
          </Field>
          <Field label="Statut">
            <select style={fieldStyle} value={settings.invoice.status} onChange={(e) => updateLocal({ invoice: { ...settings.invoice, status: e.target.value as any } })}>
              {DOCUMENT_STATUSES.map((key) => <option key={key} value={key}>{statusLabels[key]}</option>)}
            </select>
          </Field>
        </Grid2>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={settings.invoice.vatOnDebits} onChange={(e) => updateLocal({ invoice: { ...settings.invoice, vatOnDebits: e.target.checked } })} />
          <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
            <strong style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5 }}>TVA sur les débits</strong>
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12.5 }}>Cochée automatiquement sur les nouvelles factures.</span>
          </span>
        </label>
        <Field label="Mention spécifique">
          <textarea style={{ ...fieldStyle, resize: "vertical" }} rows={2} value={settings.invoice.mention} onChange={(e) => updateLocal({ invoice: { ...settings.invoice, mention: e.target.value } })} placeholder="Ex : Aucun escompte pour paiement anticipé." />
        </Field>
      </GlassCard>

      <GlassCard icon="🎨" title="Design du document" subtitle="Donnez un peu de vie aux devis et factures sans perdre le côté professionnel.">
        <Grid2>
          <Field label="Style">
            <select
              style={fieldStyle}
              value={settings.common.design.preset}
              onChange={(e) => updateLocal({ common: { ...settings.common, design: { ...settings.common.design, preset: e.target.value as any } } })}
            >
              {DOCUMENT_DESIGN_PRESETS.map((key) => <option key={key} value={key}>{designPresetLabels[key]}</option>)}
            </select>
          </Field>
          <Field label="Couleur">
            <select
              style={fieldStyle}
              value={settings.common.design.accentColor}
              onChange={(e) => updateLocal({ common: { ...settings.common, design: { ...settings.common.design, accentColor: e.target.value as any } } })}
            >
              {DOCUMENT_ACCENT_COLORS.map((key) => <option key={key} value={key}>{accentColorLabels[key]}</option>)}
            </select>
          </Field>
        </Grid2>
        <Grid2>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={settings.common.design.frame} onChange={(e) => updateLocal({ common: { ...settings.common, design: { ...settings.common.design, frame: e.target.checked } } })} />
            <span style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5, fontWeight: 800 }}>Cadre extérieur</span>
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={settings.common.design.coloredTotals} onChange={(e) => updateLocal({ common: { ...settings.common, design: { ...settings.common.design, coloredTotals: e.target.checked } } })} />
            <span style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5, fontWeight: 800 }}>Bloc total coloré</span>
          </label>
        </Grid2>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={settings.common.design.coloredParties} onChange={(e) => updateLocal({ common: { ...settings.common, design: { ...settings.common.design, coloredParties: e.target.checked } } })} />
          <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
            <strong style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5 }}>Coordonnées encadrées</strong>
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12.5 }}>Prestataire et client dans deux cadres légers.</span>
          </span>
        </label>
      </GlassCard>

      {saving ? <Notice>Enregistrement…</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <button
        type="button"
        onClick={() => void saveSettings()}
        disabled={loading || saving}
        style={{
          borderRadius: 12,
          border: "1px solid rgba(56,189,248,0.5)",
          background: "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(244,114,182,0.18))",
          color: "white",
          padding: "12px 14px",
          fontWeight: 950,
          cursor: loading || saving ? "not-allowed" : "pointer",
          opacity: loading || saving ? 0.65 : 1,
        }}
      >
        {saving ? "Enregistrement…" : "Enregistrer les réglages"}
      </button>
    </div>
  );
}
