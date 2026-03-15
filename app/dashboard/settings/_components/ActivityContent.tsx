"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ACTIVITY_SECTOR_OPTIONS, decodeBusinessSector, encodeBusinessSector } from "@/lib/activitySectors";

type Props = {
  mode?: "page" | "drawer";
};

type BusinessActivityForm = {
  sectorCategory: string;
  sector: string; // métier
  services: string; // 1 ligne = 1 service
  interventionZones: string; // villes / zones / rayon
  openingDays: string; // ex: Lun–Ven
  openingHours: string; // ex: 8h–18h
  strengths: string; // 1 ligne = 1 force
  tone: "pro" | "friendly" | "premium" | "direct";
  preferredCta: "appeler" | "devis" | "message";
};

const TABLE = "business_profiles";

export default function ActivityContent({ mode = "page" }: Props) {
  const initial: BusinessActivityForm = useMemo(
    () => ({
      sectorCategory: "",
      sector: "",
      services: "",
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

        setForm({
          sectorCategory: decodedSector.sectorCategory,
          sector: decodedSector.profession,
          services: Array.isArray(data.services) ? data.services.join("\n") : (data.services_text ?? ""),
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
        // Si la table n'existe pas encore, on laisse le formulaire vide.
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

  const normalizeLines = (v: string) =>
    v
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

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
        sector: encodeBusinessSector(form.sectorCategory, form.sector.trim()),
        services: normalizeLines(form.services),
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

      // ✅ Récompense : activité complète (100 UI) — seulement si le formulaire est bien rempli
      const isComplete =
        form.sectorCategory.trim().length > 0 &&
        form.sector.trim().length > 0 &&
        normalizeLines(form.services).length > 0 &&
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
          // (debug soft) ignore errors but keep dev visibility
          if (!resAward.ok) {
            console.warn("UI award failed (activity_complete)");
          }
        } catch {
          // ignore
        }
      }

      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
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
                onChange={(e) => set("sectorCategory", e.target.value)}
              >
                <option value="" style={selectOption}>Choisir un secteur</option>
                {ACTIVITY_SECTOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} style={selectOption}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span style={hint}>Cette catégorie pilote les modèles proposés dans Booster et Fidéliser.</span>
            </label>

            <label style={label}>
              <span style={labelTitle}>Métier</span>
              <input
                style={input}
                value={form.sector}
                onChange={(e) => set("sector", e.target.value)}
                placeholder="Ex: Plombier, Couvreur, Menuisier…"
              />
              <span style={hint}>Le métier reste utilisé comme base n°2 pour personnaliser les textes et les mots-clés.</span>
            </label>

            <label style={label}>
              <span style={labelTitle}>Prestations principales</span>
              <textarea
                style={{ ...input, minHeight: 110, resize: "vertical" }}
                value={form.services}
                onChange={(e) => set("services", e.target.value)}
                placeholder={`1 ligne = 1 prestation\nEx: Débouchage canalisation\nEx: Remplacement chauffe-eau`}
              />
              <span style={hint}>1 ligne = 1 service. L’IA les réutilise dans les posts.</span>
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

            <button type="button" style={primaryBtn} disabled={saving} onClick={save}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>

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
