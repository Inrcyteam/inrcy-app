"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ACTIVITY_SECTOR_OPTIONS, decodeBusinessSector, encodeBusinessSector } from "@/lib/activitySectors";
import {
  getJobsForSector,
  getServicesForSectorAndJob,
  getJobLabel,
  isValidJobForSector,
  findJobValueByLabel,
} from "@/lib/activityCatalog";

type Props = {
  mode?: "page" | "drawer";
  onActivitySaved?: () => void;
  onActivityReset?: () => void;
};

type BusinessActivityForm = {
  sectorCategory: string;
  sector: string; // métier (code)
  selectedServices: string[];
  customServices: string;
  interventionZones: string;
  openingDays: string;
  openingHours: string;
  strengths: string;
  tone: "pro" | "friendly" | "premium" | "direct";
  preferredCta: "appeler" | "devis" | "message";
};

const TABLE = "business_profiles";

export default function ActivityContent({ mode = "page", onActivitySaved, onActivityReset }: Props) {
  const initial: BusinessActivityForm = useMemo(
    () => ({
      sectorCategory: "",
      sector: "",
      selectedServices: [],
      customServices: "",
      interventionZones: "",
      openingDays: "",
      openingHours: "",
      strengths: "",
      tone: "pro",
      preferredCta: "devis",
    }),
    []
  );

  const [form, setForm] = useState<BusinessActivityForm>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>("");

  const currentJobOptions = useMemo(() => {
    const base = getJobsForSector(form.sectorCategory);
    if (!form.sector) return base;
    const currentExists = base.some((opt) => opt.value === form.sector);
    if (currentExists) return base;
    const fallbackLabel = getJobLabel(form.sectorCategory, form.sector) || form.sector;
    return [...base, { value: form.sector, label: fallbackLabel }];
  }, [form.sectorCategory, form.sector]);

  const currentServiceOptions = useMemo(
    () => getServicesForSectorAndJob(form.sectorCategory, form.sector),
    [form.sectorCategory, form.sector]
  );
  const isCustomJobSector = form.sectorCategory === "autre";


  const allSelectedServices = useMemo(() => {
    const extras = normalizeLines(form.customServices);
    return Array.from(new Set([...form.selectedServices, ...extras]));
  }, [form.selectedServices, form.customServices]);

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.045)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    padding: "10px 12px",
    color: "white",
    outline: "none",
  };

  const label: React.CSSProperties = {
    display: "grid",
    gap: 8,
  };

  const labelTitle: React.CSSProperties = {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: 800,
  };

  const hint: React.CSSProperties = {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    lineHeight: 1.35,
  };

  const selectOption: React.CSSProperties = {
    color: "#0b1020",
    background: "#ffffff",
  };

  const primaryBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background:
      "linear-gradient(135deg, rgba(255, 77, 166, 0.35), rgba(97, 87, 255, 0.28), rgba(0, 200, 255, 0.22))",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    opacity: saving ? 0.7 : 1,
  };

  const checkboxGrid: React.CSSProperties = {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    marginTop: 4,
  };

  const chipLabel: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.92)",
    minWidth: 0,
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const supabase = createClient();
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw new Error(authErr.message);
        const user = authData?.user;
        if (!user) return;

        const { data, error: dbErr } = await supabase
          .from(TABLE)
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (dbErr) throw new Error(dbErr.message);
        if (!data) return;

        const decodedSector = decodeBusinessSector(data.sector ?? "");
        const rawServices = Array.isArray(data.services)
          ? data.services.map((s: unknown) => String(s || "").trim()).filter(Boolean)
          : normalizeLines(data.services_text ?? "");
        const normalizedProfession = isValidJobForSector(decodedSector.sectorCategory, decodedSector.profession)
          ? decodedSector.profession
          : (findJobValueByLabel(decodedSector.sectorCategory, decodedSector.profession) || "");
        const knownServices = normalizedProfession
          ? getServicesForSectorAndJob(decodedSector.sectorCategory, normalizedProfession)
          : [];
        const selectedServices = rawServices.filter((item: string) => knownServices.includes(item));
        const customServices = rawServices.filter((item: string) => !knownServices.includes(item)).join("\n");

        setForm({
          sectorCategory: decodedSector.sectorCategory,
          sector: normalizedProfession,
          selectedServices,
          customServices,
          interventionZones: Array.isArray(data.intervention_zones)
            ? data.intervention_zones.join(", ")
            : (data.intervention_zones_text ?? ""),
          openingDays: data.opening_days ?? "",
          openingHours: data.opening_hours ?? "",
          strengths: Array.isArray(data.strengths) ? data.strengths.join("\n") : (data.strengths_text ?? ""),
          tone: (data.tone ?? "pro") as BusinessActivityForm["tone"],
          preferredCta: (data.preferred_cta ?? "devis") as BusinessActivityForm["preferredCta"],
        });
      } catch (e: unknown) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const set = <K extends keyof BusinessActivityForm>(key: K, value: BusinessActivityForm[K]) => {
    setSaved(false);
    setError("");
    setForm((p) => ({ ...p, [key]: value }));
  };

  const handleSectorChange = (sectorCategory: string) => {
    setSaved(false);
    setError("");
    setForm((p) => ({
      ...p,
      sectorCategory,
      sector: "",
      selectedServices: [],
      customServices: "",
    }));
  };

  const handleProfessionChange = (sector: string) => {
    setSaved(false);
    setError("");
    setForm((p) => ({
      ...p,
      sector,
      selectedServices: [],
      customServices: "",
    }));
  };

  const toggleService = (service: string) => {
    setSaved(false);
    setError("");
    setForm((p) => ({
      ...p,
      selectedServices: p.selectedServices.includes(service)
        ? p.selectedServices.filter((item) => item !== service)
        : [...p.selectedServices, service],
    }));
  };

  function normalizeLines(v: string) {
    return String(v || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const normalizeCommaList = (v: string) =>
    v
      .split(/,|;|\n/)
      .map((s) => s.trim())
      .filter(Boolean);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const supabase = createClient();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message);
      const user = authData?.user;
      if (!user) throw new Error("Utilisateur non connecté.");

      const payload = {
        user_id: user.id,
        sector: encodeBusinessSector(form.sectorCategory, getJobLabel(form.sectorCategory, form.sector) || form.sector.trim()),
        services: allSelectedServices,
        intervention_zones: normalizeCommaList(form.interventionZones),
        opening_days: form.openingDays.trim(),
        opening_hours: form.openingHours.trim(),
        strengths: normalizeLines(form.strengths),
        tone: form.tone,
        preferred_cta: form.preferredCta,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from(TABLE).upsert(payload, { onConflict: "user_id" });
      if (upErr) throw new Error(upErr.message);

      const isComplete =
        form.sectorCategory.trim().length > 0 &&
        form.sector.trim().length > 0 &&
        allSelectedServices.length > 0 &&
        normalizeCommaList(form.interventionZones).length > 0 &&
        form.openingDays.trim().length > 0 &&
        form.openingHours.trim().length > 0 &&
        normalizeLines(form.strengths).length > 0;

      if (isComplete) {
        try {
          const resAward = await fetch("/api/loyalty/award", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actionKey: "activity_complete",
              amount: 100,
              sourceId: "once",
              label: "Activité complétée",
              meta: { origin: "activity" },
            }),
          });
          if (!resAward.ok) {
            console.warn("UI award failed (activity_complete)");
          }
        } catch {
          // ignore
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onActivitySaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const ok = window.confirm(`Réinitialiser l’activité ?

Cela efface les informations d’activité en cours dans le formulaire.`);
    if (!ok) return;
    setForm(initial);
    setSaved(false);
    setError("");
    onActivityReset?.();
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}>
        <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
          Ces informations servent à générer des contenus cohérents avec votre entreprise.
        </p>
      </div>

      <div style={card}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Chargement…</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <label style={label}>
              <span style={labelTitle}>Secteur d’activité</span>
              <select
                style={input}
                value={form.sectorCategory}
                onChange={(e) => handleSectorChange(e.target.value)}
              >
                <option value="" style={selectOption}>Choisir un secteur</option>
                {ACTIVITY_SECTOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} style={selectOption}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span style={hint}>Cette catégorie pilote les modèles proposés dans Booster, Fidéliser et les publications IA.</span>
            </label>

            <label style={label}>
              <span style={labelTitle}>Métier</span>
              {isCustomJobSector ? (
                <input
                  style={input}
                  value={form.sector}
                  onChange={(e) => handleProfessionChange(e.target.value)}
                  disabled={!form.sectorCategory}
                  placeholder="Ex : Cordiste, Coach vocal, Fabricant sur mesure…"
                />
              ) : (
                <select
                  style={input}
                  value={form.sector}
                  onChange={(e) => handleProfessionChange(e.target.value)}
                  disabled={!form.sectorCategory}
                >
                  <option value="" style={selectOption}>Choisir un métier</option>
                  {currentJobOptions.map((option) => (
                    <option key={option.value} value={option.value} style={selectOption}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <span style={hint}>Le métier reste utilisé comme base n°2 pour personnaliser les textes, mots-clés et publications. En choisissant “Autre”, vous pouvez saisir un métier libre qui sera aussi utilisé par les templates et l’IA.</span>
            </label>

            <div style={label}>
              <span style={labelTitle}>Prestations principales</span>
              {form.sector && currentServiceOptions.length > 0 ? (
                <div style={checkboxGrid}>
                  {currentServiceOptions.map((service) => {
                    const checked = form.selectedServices.includes(service);
                    return (
                      <label key={service} style={{ ...chipLabel, boxShadow: checked ? "0 0 0 1px rgba(56,189,248,0.35) inset" : undefined }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleService(service)}
                          style={{ accentColor: "#38bdf8", flex: "0 0 auto" }}
                        />
                        <span style={{ minWidth: 0 }}>{service}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div style={{ ...hint, marginTop: 2 }}>
                  {isCustomJobSector
                    ? "Avec un métier libre, ajoutez vos prestations ci-dessous pour alimenter les templates et l’IA."
                    : "Choisissez d’abord un métier pour afficher la liste de prestations cohérentes."}
                </div>
              )}
              <span style={hint}>Ces prestations alimentent les templates et l’IA pour des contenus plus cohérents.</span>
            </div>

            <label style={label}>
              <span style={labelTitle}>Autres prestations (optionnel)</span>
              <textarea
                style={{ ...input, minHeight: 86, resize: "vertical" }}
                value={form.customServices}
                onChange={(e) => set("customServices", e.target.value)}
                placeholder={`1 ligne = 1 prestation supplémentaire\nEx: Contrat entretien premium\nEx: Intervention week-end`}
              />
              <span style={hint}>Ajoutez ici des prestations spécifiques non présentes dans la liste.</span>
            </label>

            <label style={label}>
              <span style={labelTitle}>Zones d’intervention</span>
              <textarea
                style={{ ...input, minHeight: 90, resize: "vertical" }}
                value={form.interventionZones}
                onChange={(e) => set("interventionZones", e.target.value)}
                placeholder={`Ex: Berck, Rang-du-Fliers, Montreuil\nOu: Côte d’Opale (rayon 30km)`}
              />
              <span style={hint}>Séparées par des virgules ou retours à la ligne.</span>
            </label>

            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={label}>
                <span style={labelTitle}>Jours</span>
                <input
                  style={input}
                  value={form.openingDays}
                  onChange={(e) => set("openingDays", e.target.value)}
                  placeholder="Ex: Lun–Ven"
                />
              </label>

              <label style={label}>
                <span style={labelTitle}>Horaires</span>
                <input
                  style={input}
                  value={form.openingHours}
                  onChange={(e) => set("openingHours", e.target.value)}
                  placeholder="Ex: 8h–18h"
                />
              </label>
            </div>

            <label style={label}>
              <span style={labelTitle}>Vos forces</span>
              <textarea
                style={{ ...input, minHeight: 110, resize: "vertical" }}
                value={form.strengths}
                onChange={(e) => set("strengths", e.target.value)}
                placeholder={`1 ligne = 1 force\nEx: Intervention rapide\nEx: Devis gratuit\nEx: Garantie 10 ans`}
              />
              <span style={hint}>3 à 6 forces suffisent. Court.</span>
            </label>

            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={label}>
                <span style={labelTitle}>Ton</span>
                <select style={input} value={form.tone} onChange={(e) => set("tone", e.target.value as BusinessActivityForm["tone"])}>
                  <option value="pro" style={selectOption}>Professionnel</option>
                  <option value="direct" style={selectOption}>Direct</option>
                  <option value="friendly" style={selectOption}>Amical</option>
                  <option value="premium" style={selectOption}>Premium</option>
                </select>
              </label>

              <label style={label}>
                <span style={labelTitle}>Bouton préféré</span>
                <select
                  style={input}
                  value={form.preferredCta}
                  onChange={(e) => set("preferredCta", e.target.value as BusinessActivityForm["preferredCta"])}
                >
                  <option value="devis" style={selectOption}>Demander un devis</option>
                  <option value="appeler" style={selectOption}>Appeler</option>
                  <option value="message" style={selectOption}>Envoyer un message</option>
                </select>
              </label>
            </div>

            {error ? (
              <div style={{ color: "rgba(248,113,113,0.95)", fontWeight: 800 }}>{error}</div>
            ) : null}
            {saved ? (
              <div style={{ color: "rgba(34,197,94,0.95)", fontWeight: 900 }}>Enregistré ✅</div>
            ) : null}

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <button type="button" style={primaryBtn} disabled={saving} onClick={save}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleReset}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                  borderRadius: 14,
                  padding: "10px 12px",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
              >
                Réinitialiser
              </button>
            </div>

            {mode === "drawer" ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Astuce : plus vos informations sont précises, plus les contenus IA sont bons.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
