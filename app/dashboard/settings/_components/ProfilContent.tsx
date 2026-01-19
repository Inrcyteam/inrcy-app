"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Props = {
  mode?: "page" | "drawer";
};

// Petit helper pour éviter les crashs sur JSON invalide
function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

type ProfilForm = {
  // Compte
  contactEmail: string;
  firstName: string;
  lastName: string;
  phone: string;

  // Légal
  companyLegalName: string; // raison sociale
  legalForm: "EI" | "EURL" | "SARL" | "SAS" | "SASU" | "AUTRE";
  legalFormOther: string;

  hqAddress: string;
  hqZip: string;
  hqCity: string;
  hqCountry: string;

  siren: string;
  rcsCity: string;

  capitalSocial: string; // string pour laisser vide
  capitalDispenseEI: boolean;

  vatNumber: string;
  vatDispense: boolean;

  // Business
  avgBasket: number;
  leadConversionRate: number;
};

const STORAGE_KEY = "inrcy_profile_preview_v1";

export default function ProfilContent({ mode = "page" }: Props) {
  const defaultEmail = "pro@exemple.com"; // placeholder tant que Supabase n'est pas branché

  const initial: ProfilForm = useMemo(
    () => ({
      contactEmail: defaultEmail,
      firstName: "",
      lastName: "",
      phone: "",

      companyLegalName: "",
      legalForm: "EI",
      legalFormOther: "",

      hqAddress: "",
      hqZip: "",
      hqCity: "",
      hqCountry: "France",

      siren: "",
      rcsCity: "",

      capitalSocial: "",
      capitalDispenseEI: true, // EI par défaut

      vatNumber: "",
      vatDispense: true, // EI/franchise par défaut

      avgBasket: 250, // ✅ défaut demandé
      leadConversionRate: 20, // ✅ défaut demandé
    }),
    []
  );

  const [form, setForm] = useState<ProfilForm>(initial);
  const [saved, setSaved] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string>("");

  // Charger depuis localStorage (preview dev)
  useEffect(() => {
    const stored = safeJsonParse<Partial<ProfilForm>>(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      setForm((prev) => ({ ...prev, ...stored }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto règles EI / TVA
  useEffect(() => {
    const isEI = form.legalForm === "EI";
    if (isEI) {
      // EI => capital dispensé + TVA dispensée par défaut
      if (!form.capitalDispenseEI) setForm((p) => ({ ...p, capitalDispenseEI: true }));
      if (!form.vatDispense) setForm((p) => ({ ...p, vatDispense: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.legalForm]);

  const isEI = form.legalForm === "EI";
  const showOtherLegalForm = form.legalForm === "AUTRE";

const validate = () => {
  const e: Record<string, string> = {};

  const requiredStr = (key: keyof ProfilForm, label: string) => {
    const v = form[key];
    if (typeof v === "string" && v.trim() === "") {
      e[String(key)] = `${label} est obligatoire.`;
    }
  };

  // =====================
  // Carte 1 — Compte
  // =====================
  requiredStr("firstName", "Prénom");
  requiredStr("lastName", "Nom");
  requiredStr("phone", "Téléphone");
  requiredStr("contactEmail", "Email");

  // Format email
  if (
    !e.contactEmail &&
    !/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())
  ) {
    e.contactEmail = "Email invalide.";
  }

  // =====================
  // Carte 2 — Légal
  // =====================
  requiredStr("companyLegalName", "Raison sociale");
  requiredStr("hqAddress", "Adresse du siège social");
  requiredStr("hqZip", "Code postal");
  requiredStr("hqCity", "Ville");
  requiredStr("hqCountry", "Pays");
  requiredStr("siren", "SIREN");
  requiredStr("rcsCity", "RCS (ville)");

  if (form.legalForm === "AUTRE" && form.legalFormOther.trim() === "") {
    e.legalFormOther = "Merci de préciser la forme juridique.";
  }

  // Capital social
  if (!form.capitalDispenseEI && form.capitalSocial.trim() === "") {
    e.capitalSocial = "Capital social requis (ou coche Dispensé).";
  }

  // TVA
  if (!form.vatDispense && form.vatNumber.trim() === "") {
    e.vatNumber = "TVA intracommunautaire requise (ou coche Dispensé TVA).";
  }

  // =====================
  // Carte 3 — Business
  // =====================
  if (!form.avgBasket || form.avgBasket <= 0) {
    e.avgBasket = "Panier moyen > 0 requis.";
  }

  if (!form.leadConversionRate || form.leadConversionRate <= 0) {
    e.leadConversionRate = "Taux de conversion > 0 requis.";
  }

  if (form.leadConversionRate > 100) {
    e.leadConversionRate = "Taux de conversion ≤ 100 requis.";
  }

  // =====================
  // Final
  // =====================
  setErrors(e);
  return Object.keys(e).length === 0;
};


  const onChange = <K extends keyof ProfilForm>(key: K, value: ProfilForm[K]) => {
    setSaved(false);
    setGlobalError("");

    // efface l'erreur du champ en cours si elle existait
    setErrors((prev) => {
      if (!prev[String(key)]) return prev;
      const next = { ...prev };
      delete next[String(key)];
      return next;
    });

    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setGlobalError("");
    const ok = validate();
    if (!ok) {
      setSaved(false);
      setGlobalError("Merci de compléter tous les champs obligatoires avant d’enregistrer.");
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    const ok = window.confirm(
      "Réinitialiser le profil ?\n\nCela efface les champs et remet Panier moyen = 250€ et Conversion = 20%."
    );
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY);
    setErrors({});
    setGlobalError("");
    setForm(initial);
    setSaved(false);
  };

  const fieldStyle = (key: keyof ProfilForm): React.CSSProperties => ({
    ...inputStyle,
    border: errors[String(key)] ? "1px solid rgba(255,120,120,0.85)" : inputStyle.border,
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* CARTE 1 — Compte */}
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Compte</h2>
        

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label style={labelStyle}>
  <span style={labelTextStyle}>Email professionnel *</span>
  <input
    type="email"
    value={form.contactEmail}
    onChange={(e) => onChange("contactEmail", e.target.value)}
    placeholder="Ex : contact@entreprise.fr"
    style={fieldStyle("contactEmail")}
  />
  {errors.contactEmail ? <div style={errorTextStyle}>{errors.contactEmail}</div> : null}
</label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Prénom *</span>
              <input
                value={form.firstName}
                onChange={(e) => onChange("firstName", e.target.value)}
                placeholder="Ex : Paul"
                style={fieldStyle("firstName")}
              />
              {errors.firstName ? <div style={errorTextStyle}>{errors.firstName}</div> : null}
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>Nom *</span>
              <input
                value={form.lastName}
                onChange={(e) => onChange("lastName", e.target.value)}
                placeholder="Ex : Martin"
                style={fieldStyle("lastName")}
              />
              {errors.lastName ? <div style={errorTextStyle}>{errors.lastName}</div> : null}
            </label>
          </div>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Téléphone *</span>
            <input
              value={form.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              placeholder="Ex : 06 12 34 56 78"
              style={fieldStyle("phone")}
            />
            {errors.phone ? <div style={errorTextStyle}>{errors.phone}</div> : null}
          </label>
        </div>
      </div>

      {/* CARTE 2 — Informations légales */}
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Informations légales de l'entreprise</h2>
        
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Raison sociale *</span>
            <input
              value={form.companyLegalName}
              onChange={(e) => onChange("companyLegalName", e.target.value)}
              placeholder="Ex : DUPONT RÉNOVATION"
              style={fieldStyle("companyLegalName")}
            />
            {errors.companyLegalName ? <div style={errorTextStyle}>{errors.companyLegalName}</div> : null}
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Forme juridique *</span>
              <select
  value={form.legalForm}
  onChange={(e) => onChange("legalForm", e.target.value as ProfilForm["legalForm"])}
  style={{
    ...fieldStyle("legalForm"),
    whiteSpace: "normal",
    color: "white",
    background: "rgba(255,255,255,0.04)",
  }}
>
  <option value="EI" style={{ background: "#111", color: "white" }}>EI</option>
  <option value="EURL" style={{ background: "#111", color: "white" }}>EURL</option>
  <option value="SARL" style={{ background: "#111", color: "white" }}>SARL</option>
  <option value="SAS" style={{ background: "#111", color: "white" }}>SAS</option>
  <option value="SASU" style={{ background: "#111", color: "white" }}>SASU</option>
  <option value="AUTRE" style={{ background: "#111", color: "white" }}>Autre</option>
</select>

            </label>

            {showOtherLegalForm ? (
              <label style={labelStyle}>
                <span style={labelTextStyle}>Préciser *</span>
                <input
                  value={form.legalFormOther}
                  onChange={(e) => onChange("legalFormOther", e.target.value)}
                  placeholder="Ex : Association"
                  style={fieldStyle("legalFormOther")}
                />
                {errors.legalFormOther ? <div style={errorTextStyle}>{errors.legalFormOther}</div> : null}
              </label>
            ) : (
              <div />
            )}
          </div>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Adresse du siège social *</span>
            <input
              value={form.hqAddress}
              onChange={(e) => onChange("hqAddress", e.target.value)}
              placeholder="Ex : 10 rue de la Paix"
              style={fieldStyle("hqAddress")}
            />
            {errors.hqAddress ? <div style={errorTextStyle}>{errors.hqAddress}</div> : null}
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(120px, 160px) minmax(0, 1fr) minmax(0, 1fr)",
              gap: 10,
            }}
          >
            <label style={labelStyle}>
              <span style={labelTextStyle}>Code postal *</span>
              <input
                value={form.hqZip}
                onChange={(e) => onChange("hqZip", e.target.value)}
                placeholder="75000"
                style={fieldStyle("hqZip")}
              />
              {errors.hqZip ? <div style={errorTextStyle}>{errors.hqZip}</div> : null}
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>Ville *</span>
              <input
                value={form.hqCity}
                onChange={(e) => onChange("hqCity", e.target.value)}
                placeholder="Paris"
                style={fieldStyle("hqCity")}
              />
              {errors.hqCity ? <div style={errorTextStyle}>{errors.hqCity}</div> : null}
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>Pays *</span>
              <input
                value={form.hqCountry}
                onChange={(e) => onChange("hqCountry", e.target.value)}
                style={fieldStyle("hqCountry")}
              />
              {errors.hqCountry ? <div style={errorTextStyle}>{errors.hqCountry}</div> : null}
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>SIREN (9 chiffres) *</span>
              <input
                value={form.siren}
                onChange={(e) => onChange("siren", e.target.value)}
                placeholder="123456789"
                style={fieldStyle("siren")}
              />
              {errors.siren ? <div style={errorTextStyle}>{errors.siren}</div> : null}
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>RCS (ville) *</span>
              <input
                value={form.rcsCity}
                onChange={(e) => onChange("rcsCity", e.target.value)}
                placeholder="Ex : Paris"
                style={fieldStyle("rcsCity")}
              />
              {errors.rcsCity ? <div style={errorTextStyle}>{errors.rcsCity}</div> : null}
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Capital social (€) {form.capitalDispenseEI ? "" : "*"}</span>
              <input
                value={form.capitalSocial}
                onChange={(e) => onChange("capitalSocial", e.target.value)}
                placeholder={isEI ? "Dispensé" : "Ex : 1000"}
                disabled={form.capitalDispenseEI}
                style={{
                  ...fieldStyle("capitalSocial"),
                  opacity: form.capitalDispenseEI ? 0.55 : 1,
                }}
              />
              {!form.capitalDispenseEI && errors.capitalSocial ? (
                <div style={errorTextStyle}>{errors.capitalSocial}</div>
              ) : null}
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 6, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={form.capitalDispenseEI}
                onChange={(e) => onChange("capitalDispenseEI", e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Dispensé (EI)</span>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>TVA intracommunautaire {form.vatDispense ? "" : "*"}</span>
              <input
                value={form.vatNumber}
                onChange={(e) => onChange("vatNumber", e.target.value)}
                placeholder={form.vatDispense ? "Dispensé" : "Ex : FR12345678901"}
                disabled={form.vatDispense}
                style={{
                  ...fieldStyle("vatNumber"),
                  opacity: form.vatDispense ? 0.55 : 1,
                }}
              />
              {!form.vatDispense && errors.vatNumber ? <div style={errorTextStyle}>{errors.vatNumber}</div> : null}
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 6, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={form.vatDispense}
                onChange={(e) => onChange("vatDispense", e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Dispensé TVA</span>
            </label>
          </div>
        </div>
      </div>

      {/* CARTE 3 — Business */}
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Indicateurs de performance</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Panier moyen (€) *</span>
            <input
              type="number"
              min={1}
              value={form.avgBasket}
              onChange={(e) => onChange("avgBasket", Number(e.target.value))}
              style={fieldStyle("avgBasket")}
            />
            {errors.avgBasket ? <div style={errorTextStyle}>{errors.avgBasket}</div> : null}
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Taux de conversion (%) *</span>
            <input
              type="number"
              min={1}
              max={100}
              value={form.leadConversionRate}
              onChange={(e) => onChange("leadConversionRate", Number(e.target.value))}
              style={fieldStyle("leadConversionRate")}
            />
            {errors.leadConversionRate ? <div style={errorTextStyle}>{errors.leadConversionRate}</div> : null}
          </label>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          {globalError ? (
            <div style={{ fontSize: 13, color: "rgba(255,120,120,0.95)" }}>{globalError}</div>
          ) : saved ? (
            <span style={{ fontSize: 13, opacity: 0.85 }}>✅ Profil enregistré</span>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "white",
              borderRadius: 12,
              padding: "10px 12px",
              cursor: "pointer",
              opacity: 0.95,
            }}
          >
            Réinitialiser
          </button>

          <button
            type="button"
            onClick={handleSave}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              borderRadius: 12,
              padding: "10px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
      </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  outline: "none",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
};

const labelStyle: React.CSSProperties = { display: "grid", gap: 6 };

const labelTextStyle: React.CSSProperties = { fontSize: 13, opacity: 0.85 };

const errorTextStyle: React.CSSProperties = { fontSize: 12, color: "rgba(255,120,120,0.95)" };
