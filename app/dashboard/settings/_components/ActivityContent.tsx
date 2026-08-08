"use client";

import { resolveActiveBrowserUserId } from "@/lib/browserAccountCache";
import { invalidateBoosterGenerationContextClient } from "@/lib/boosterGenerationContextClient";
import { refreshPublicProfileDependents } from "@/lib/publicProfileRefreshClient";

import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  ACTIVITY_SECTOR_OPTIONS,
  decodeBusinessSector,
  encodeBusinessSector,
} from "@/lib/activitySectors";
import {
  getJobsForSector,
  getServicesForSectorAndJob,
  getJobLabel,
  isValidJobForSector,
  findJobValueByLabel,
} from "@/lib/activityCatalog";
import {
  searchActivityJobs,
  type ActivityJobSearchResult,
} from "@/lib/activityJobSearch";
import {
  combineOpeningSchedule,
  normalizeOpeningScheduleText,
} from "@/lib/openingSchedule";
import EditableTags from "./EditableTags";

type Props = {
  mode?: "page" | "drawer";
  onboarding?: boolean;
  onActivitySaved?: () => void;
  onActivityReset?: () => void;
  onCloseDrawer?: () => void;
  onUnsavedChange?: (hasUnsavedChanges: boolean) => void;
};

type BusinessActivityForm = {
  sectorCategory: string;
  sector: string; // métier (code)
  activityDescription: string;
  services: string[];
  interventionZones: string[];
  openingSchedule: string;
  strengths: string[];
  customerTypes: string[];
};

const TABLE = "business_profiles";

export default function ActivityContent({
  mode = "page",
  onboarding = false,
  onActivitySaved,
  onActivityReset,
  onCloseDrawer,
  onUnsavedChange,
}: Props) {
  const initial: BusinessActivityForm = useMemo(
    () => ({
      sectorCategory: "",
      sector: "",
      activityDescription: "",
      services: [],
      interventionZones: [],
      openingSchedule: "",
      strengths: [],
      customerTypes: [],
    }),
    [],
  );

  const [form, setForm] = useState<BusinessActivityForm>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobSearchOpen, setJobSearchOpen] = useState(false);
  const [manualSelectionOpen, setManualSelectionOpen] = useState(false);
  const activityBaselineRef = useRef("");

  const activitySnapshot = (value: BusinessActivityForm) => JSON.stringify(value);

  const currentJobOptions = useMemo(() => {
    const base = getJobsForSector(form.sectorCategory);
    if (!form.sector) return base;
    const currentExists = base.some((opt) => opt.value === form.sector);
    if (currentExists) return base;
    const fallbackLabel =
      getJobLabel(form.sectorCategory, form.sector) || form.sector;
    return [...base, { value: form.sector, label: fallbackLabel }];
  }, [form.sectorCategory, form.sector]);

  const currentServiceOptions = useMemo(
    () => getServicesForSectorAndJob(form.sectorCategory, form.sector),
    [form.sectorCategory, form.sector],
  );
  const isCustomJobSector = form.sectorCategory === "autre";
  const selectedJobLabel = useMemo(
    () => getJobLabel(form.sectorCategory, form.sector) || form.sector,
    [form.sectorCategory, form.sector],
  );
  const selectedSectorLabel = useMemo(
    () =>
      ACTIVITY_SECTOR_OPTIONS.find(
        (option) => option.value === form.sectorCategory,
      )?.label || "",
    [form.sectorCategory],
  );
  const jobSearchResults = useMemo(
    () => searchActivityJobs(jobSearch, 8),
    [jobSearch],
  );

  const allSelectedServices = form.services;

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
        const { data: authData, error: authErr } =
          await supabase.auth.getUser();
        if (authErr) throw new Error(authErr.message);
        const user = authData?.user;
        if (!user) return;

        const { data, error: dbErr } = await supabase
          .from(TABLE)
          .select("*")
          .eq("user_id", resolveActiveBrowserUserId(user.id))
          .maybeSingle();

        if (dbErr) throw new Error(dbErr.message);
        if (!data) return;

        const decodedSector = decodeBusinessSector(data.sector ?? "");
        const rawServices = Array.isArray(data.services)
          ? data.services
              .map((s: unknown) => String(s || "").trim())
              .filter(Boolean)
          : normalizeLines(data.services_text ?? "");
        const normalizedProfession =
          decodedSector.sectorCategory === "autre"
            ? decodedSector.profession
            : isValidJobForSector(
                  decodedSector.sectorCategory,
                  decodedSector.profession,
                )
              ? decodedSector.profession
              : findJobValueByLabel(
                  decodedSector.sectorCategory,
                  decodedSector.profession,
                ) || "";
        const knownServices = normalizedProfession
          ? getServicesForSectorAndJob(
              decodedSector.sectorCategory,
              normalizedProfession,
            )
          : [];
        // Les anciens choix et les anciennes prestations libres deviennent
        // tous des tags. Pour un nouveau métier sans choix existant, les huit
        // recommandations sont proposées immédiatement.
        const services = rawServices.length > 0 ? rawServices : knownServices;

        setForm({
          sectorCategory: decodedSector.sectorCategory,
          sector: normalizedProfession,
          activityDescription:
            data.business_description ?? data.activity_description ?? "",
          services,
          interventionZones: Array.isArray(data.intervention_zones)
            ? data.intervention_zones
                .map((item: unknown) => String(item || "").trim())
                .filter(Boolean)
            : normalizeCommaList(data.intervention_zones_text ?? ""),
          openingSchedule: combineOpeningSchedule(
            data.opening_days,
            data.opening_hours,
          ),
          strengths: Array.isArray(data.strengths)
            ? data.strengths
                .map((item: unknown) => String(item || "").trim())
                .filter(Boolean)
            : normalizeLines(data.strengths_text ?? ""),
          customerTypes: Array.isArray(data.customer_typologies)
            ? data.customer_typologies
                .map((item: unknown) => String(item || ""))
                .filter(Boolean)
            : [],
        });
        setJobSearch(
          getJobLabel(decodedSector.sectorCategory, normalizedProfession) ||
            normalizedProfession,
        );
      } catch (e: unknown) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (loading) return;
    const snapshot = activitySnapshot(form);
    if (!activityBaselineRef.current) activityBaselineRef.current = snapshot;
    onUnsavedChange?.(snapshot !== activityBaselineRef.current);
  }, [form, loading, onUnsavedChange]);

  const set = <K extends keyof BusinessActivityForm>(
    key: K,
    value: BusinessActivityForm[K],
  ) => {
    setSaved(false);
    setError("");
    setForm((p) => ({ ...p, [key]: value }));
  };

  const confirmServiceReplacement = async () => {
    if (!form.services.length) return true;
    const normalizeForComparison = (values: string[]) =>
      values.map((value) => value.trim().toLocaleLowerCase("fr")).sort();
    const currentValues = normalizeForComparison(form.services);
    const recommendations = normalizeForComparison(currentServiceOptions);
    const usesOnlyRecommendations =
      currentValues.length === recommendations.length &&
      currentValues.every((value, index) => value === recommendations[index]);
    if (usesOnlyRecommendations) return true;
    return confirmInrcy({
      eyebrow: "Mon activité",
      title: "Adapter les prestations au nouveau métier ?",
      message:
        "Vos prestations actuelles seront remplacées par les recommandations du nouveau métier. Cette action évite de mélanger deux activités différentes.",
      confirmLabel: "Adapter les prestations",
      cancelLabel: "Conserver mon métier",
      variant: "warning",
    });
  };

  const handleSectorChange = async (sectorCategory: string) => {
    if (sectorCategory === form.sectorCategory) return;
    if (!(await confirmServiceReplacement())) return;
    setSaved(false);
    setError("");
    setJobSearch("");
    setForm((p) => ({
      ...p,
      sectorCategory,
      sector: "",
      services: [],
    }));
  };

  const handleProfessionChange = async (
    sector: string,
    options?: { preserveServices?: boolean },
  ) => {
    if (sector === form.sector) return;
    if (!options?.preserveServices && !(await confirmServiceReplacement())) return;
    setSaved(false);
    setError("");
    setJobSearch(getJobLabel(form.sectorCategory, sector) || sector);
    setForm((p) => ({
      ...p,
      sector,
      services: options?.preserveServices
        ? p.services
        : getServicesForSectorAndJob(p.sectorCategory, sector),
    }));
  };

  const handleSearchSelection = async (result: ActivityJobSearchResult) => {
    const keepsCurrentSelection =
      form.sectorCategory === result.sectorCategory && form.sector === result.job;
    if (!keepsCurrentSelection && !(await confirmServiceReplacement())) return;
    setSaved(false);
    setError("");
    setJobSearch(result.jobLabel);
    setJobSearchOpen(false);
    setManualSelectionOpen(false);
    setForm((p) => ({
      ...p,
      sectorCategory: result.sectorCategory,
      sector: result.job,
      services: keepsCurrentSelection
        ? p.services
        : getServicesForSectorAndJob(result.sectorCategory, result.job),
    }));
  };

  const toggleCustomerType = (customerType: string) => {
    setSaved(false);
    setError("");
    setForm((p) => ({
      ...p,
      customerTypes: p.customerTypes.includes(customerType)
        ? p.customerTypes.filter((item) => item !== customerType)
        : [...p.customerTypes, customerType],
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
    if (onboarding) {
      const missing: string[] = [];
      if (!form.sectorCategory.trim() || !form.sector.trim()) missing.push("le métier");
      if (!allSelectedServices.length) missing.push("les prestations");
      if (!form.interventionZones.length) missing.push("les zones d’intervention");
      if (!normalizeOpeningScheduleText(form.openingSchedule).trim()) {
        missing.push("les horaires d’ouverture");
      }
      if (!form.strengths.length) missing.push("les forces");
      if (!form.customerTypes.length) missing.push("la clientèle");
      if (missing.length) {
        setError(`Pour continuer, complétez ${missing.join(", ")}.`);
        return;
      }
    }
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
        user_id: resolveActiveBrowserUserId(user.id),
        sector: encodeBusinessSector(
          form.sectorCategory,
          getJobLabel(form.sectorCategory, form.sector) || form.sector.trim(),
        ),
        services: allSelectedServices,
        business_description: form.activityDescription.trim(),
        intervention_zones: form.interventionZones,
        // Compatibilité sans migration SQL : le nouveau champ unifié est stocké
        // dans opening_hours et l’ancien opening_days est vidé à la sauvegarde.
        opening_days: "",
        opening_hours: normalizeOpeningScheduleText(form.openingSchedule),
        strengths: form.strengths,
        customer_typologies: form.customerTypes,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from(TABLE)
        .upsert(payload, { onConflict: "user_id" });
      if (upErr) throw new Error(upErr.message);
      const [publicProfileRefreshed] = await Promise.all([
        refreshPublicProfileDependents("activity"),
        invalidateBoosterGenerationContextClient("professional"),
      ]);
      if (!publicProfileRefreshed) {
        console.warn("[activity] iNrBadge/iNrSearch refresh deferred");
      }

      const isComplete =
        form.sectorCategory.trim().length > 0 &&
        form.sector.trim().length > 0 &&
        allSelectedServices.length > 0 &&
        form.interventionZones.length > 0 &&
        normalizeOpeningScheduleText(form.openingSchedule).length > 0 &&
        form.strengths.length > 0 &&
        form.customerTypes.length > 0;

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

      activityBaselineRef.current = activitySnapshot(form);
      onUnsavedChange?.(false);
      setSaved(true);
      onActivitySaved?.();
      if (mode === "drawer") {
        window.setTimeout(() => onCloseDrawer?.(), 700);
      } else {
        window.setTimeout(() => setSaved(false), 2500);
      }
    } catch (e: unknown) {
      setError(
        getSimpleFrenchErrorMessage(
          e,
          "Impossible d'enregistrer cette activité.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await confirmInrcy({
      title: "Réinitialiser l’activité ?",
      message:
        "Cela efface les informations d’activité en cours dans le formulaire.",
      confirmLabel: "Réinitialiser",
      variant: "danger",
    });
    if (!ok) return;
    setForm(initial);
    setJobSearch("");
    setJobSearchOpen(false);
    setManualSelectionOpen(false);
    setSaved(false);
    setError("");
    activityBaselineRef.current = activitySnapshot(initial);
    onUnsavedChange?.(false);
    onActivityReset?.();
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        color: "rgba(255,255,255,0.92)",
        paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        style={{
          ...card,
          display: "flex",
          alignItems: "center",
          gap: 13,
          border: onboarding
            ? "1px solid rgba(167,139,250,0.26)"
            : card.border,
          background: onboarding
            ? "linear-gradient(135deg, rgba(56,189,248,0.14), rgba(139,92,246,0.17), rgba(244,114,182,0.11))"
            : card.background,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 46,
            height: 46,
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center",
            borderRadius: 15,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(4,10,24,0.34)",
            fontSize: 24,
          }}
        >
          🎯
        </span>
        <div style={{ display: "grid", gap: 3 }}>
          <strong style={{ fontSize: onboarding ? 18 : 15 }}>
            {onboarding ? "Présentez votre activité" : "Votre activité professionnelle"}
          </strong>
          <span style={{ opacity: 0.72, lineHeight: 1.4, fontSize: 13 }}>
            iNrCy s’appuie sur ces informations pour créer des contenus précis et cohérents.
          </span>
        </div>
      </div>

      <div style={card}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Chargement…</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={label}>
              <span style={{ ...labelTitle, fontSize: 15 }}>
                Trouvez votre métier
              </span>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      position: "absolute",
                      left: 12,
                      color: "rgba(255,255,255,0.55)",
                      pointerEvents: "none",
                    }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    autoComplete="off"
                    style={{ ...input, paddingLeft: 40, paddingRight: 38 }}
                    value={jobSearch}
                    onFocus={() => setJobSearchOpen(true)}
                    onBlur={() =>
                      window.setTimeout(() => setJobSearchOpen(false), 120)
                    }
                    onChange={(e) => {
                      setJobSearch(e.target.value);
                      setJobSearchOpen(true);
                    }}
                    placeholder="Ex : Paysagiste, coiffeur, agence de communication…"
                    role="combobox"
                    aria-label="Rechercher votre métier"
                    aria-autocomplete="list"
                    aria-controls="activity-job-search-results"
                    aria-expanded={jobSearchOpen && jobSearch.trim().length > 0}
                  />
                  {jobSearch ? (
                    <button
                      type="button"
                      aria-label="Effacer la recherche"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setJobSearch("");
                        setJobSearchOpen(true);
                      }}
                      style={{
                        position: "absolute",
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        border: 0,
                        background: "transparent",
                        color: "rgba(255,255,255,0.65)",
                        cursor: "pointer",
                        fontSize: 18,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                {jobSearchOpen && jobSearch.trim() ? (
                  <div
                    id="activity-job-search-results"
                    role="listbox"
                    aria-label="Résultats des métiers"
                    style={{
                      position: "absolute",
                      zIndex: 30,
                      left: 0,
                      right: 0,
                      top: "calc(100% + 6px)",
                      maxHeight: 310,
                      overflowY: "auto",
                      padding: 6,
                      borderRadius: 14,
                      border: "1px solid rgba(125,211,252,0.28)",
                      background: "rgba(11,16,32,0.98)",
                      boxShadow: "0 18px 45px rgba(0,0,0,0.45)",
                      backdropFilter: "blur(18px)",
                      WebkitBackdropFilter: "blur(18px)",
                    }}
                  >
                    {jobSearchResults.length > 0 ? (
                      jobSearchResults.map((result) => (
                        <button
                          key={`${result.sectorCategory}:${result.job}`}
                          type="button"
                          role="option"
                          aria-selected={
                            form.sectorCategory === result.sectorCategory &&
                            form.sector === result.job
                          }
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void handleSearchSelection(result)}
                          style={{
                            width: "100%",
                            display: "grid",
                            gap: 3,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: 0,
                            background:
                              form.sectorCategory === result.sectorCategory &&
                              form.sector === result.job
                                ? "rgba(56,189,248,0.14)"
                                : "transparent",
                            color: "white",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontWeight: 850, fontSize: 14 }}>
                            {result.jobLabel}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "rgba(186,230,253,0.76)",
                            }}
                          >
                            Secteur : {result.sectorLabel}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gap: 8,
                          padding: "10px 12px",
                          color: "rgba(255,255,255,0.72)",
                          fontSize: 13,
                        }}
                      >
                        <span>Aucun métier correspondant.</span>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setManualSelectionOpen(true);
                            setJobSearchOpen(false);
                          }}
                          style={{
                            justifySelf: "start",
                            border: 0,
                            background: "transparent",
                            color: "#7dd3fc",
                            padding: 0,
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Parcourir manuellement
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <span style={hint}>
                Tapez quelques lettres : la recherche reconnaît aussi les
                accents, variantes courantes et petites fautes de frappe.
              </span>

              {form.sectorCategory && form.sector ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 8,
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(56,189,248,0.22)",
                    background: "rgba(56,189,248,0.07)",
                  }}
                >
                  <div style={{ display: "grid", gap: 2 }}>
                    <span style={{ ...hint, fontSize: 11 }}>
                      Secteur d’activité
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 850 }}>
                      {selectedSectorLabel}
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 2 }}>
                    <span style={{ ...hint, fontSize: 11 }}>Métier</span>
                    <span style={{ fontSize: 13, fontWeight: 850 }}>
                      {selectedJobLabel}
                    </span>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setManualSelectionOpen((current) => !current)}
                style={{
                  justifySelf: "start",
                  border: 0,
                  background: "transparent",
                  color: "#7dd3fc",
                  padding: "2px 0",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {manualSelectionOpen
                  ? "Masquer la sélection manuelle"
                  : "Parcourir les secteurs et métiers manuellement"}
              </button>
            </div>

            {manualSelectionOpen ? (
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                <label style={label}>
                  <span style={labelTitle}>Secteur d’activité</span>
                  <select
                    style={input}
                    value={form.sectorCategory}
                    onChange={(e) => void handleSectorChange(e.target.value)}
                  >
                    <option value="" style={selectOption}>
                      Choisir un secteur
                    </option>
                    {ACTIVITY_SECTOR_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        style={selectOption}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span style={hint}>
                    Cette catégorie pilote les modèles proposés dans Booster,
                    Fidéliser et les publications IA.
                  </span>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Métier</span>
                  {isCustomJobSector ? (
                    <input
                      style={input}
                      value={form.sector}
                      onChange={(e) =>
                        void handleProfessionChange(e.target.value, {
                          preserveServices: true,
                        })
                      }
                      disabled={!form.sectorCategory}
                      placeholder="Ex : Cordiste, Coach vocal, Fabricant sur mesure…"
                    />
                  ) : (
                    <select
                      style={input}
                      value={form.sector}
                      onChange={(e) => void handleProfessionChange(e.target.value)}
                      disabled={!form.sectorCategory}
                    >
                      <option value="" style={selectOption}>
                        Choisir un métier
                      </option>
                      {currentJobOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          style={selectOption}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <span style={hint}>
                    Le secteur et le métier restent enregistrés exactement comme
                    avant et continuent d’alimenter les templates et l’IA. En
                    choisissant “Autre”, vous pouvez saisir un métier libre.
                  </span>
                </label>
              </div>
            ) : null}

            <label style={label}>
              <span style={labelTitle}>Présentation courte de l’activité</span>
              <textarea
                style={{ ...input, minHeight: 96, resize: "vertical" }}
                value={form.activityDescription}
                onChange={(e) => set("activityDescription", e.target.value)}
                placeholder={`Ex: Entreprise familiale spécialisée dans les interventions rapides et soignées. Nous accompagnons les clients avec des conseils simples et un suivi sérieux.`}
              />
              <span style={hint}>
                Optionnel, mais très utile pour que l’IA écrive avec la vraie
                personnalité de l’entreprise.
              </span>
            </label>

            <div style={label}>
              <span style={labelTitle}>Prestations principales</span>
              <EditableTags
                values={form.services}
                onChange={(values) => set("services", values)}
                addLabel="Ajouter une prestation"
                placeholder="Ex : Intervention week-end"
                emptyText={
                  form.sector
                    ? "Ajoutez au moins une prestation représentative de votre activité."
                    : "Choisissez d’abord un métier : iNrCy proposera automatiquement jusqu’à 8 prestations."
                }
                maxItems={20}
              />
              <span style={hint}>
                iNrCy propose automatiquement les prestations liées au métier.
                Supprimez celles qui ne conviennent pas et ajoutez les vôtres.
              </span>
            </div>

            <div style={label}>
              <span style={labelTitle}>Zones d’intervention</span>
              <EditableTags
                values={form.interventionZones}
                onChange={(values) => set("interventionZones", values)}
                addLabel="Ajouter une zone"
                placeholder="Ex : Arras"
                emptyText="Ajoutez les villes, secteurs ou rayons réellement couverts."
                maxItems={30}
              />
              <span style={hint}>
                Une zone par tag aide l’IA à localiser précisément les contenus.
              </span>
            </div>

            <label style={label}>
              <span style={labelTitle}>Jours et horaires d’ouverture</span>
              <textarea
                style={{ ...input, minHeight: 128, resize: "vertical" }}
                value={form.openingSchedule}
                onChange={(e) => set("openingSchedule", e.target.value)}
                placeholder={`Lundi : 9h - 13h
Mardi : 15h - 19h
Mercredi : fermé
Jeudi : 9h - 12h / 14h - 18h`}
                maxLength={1200}
              />
              <span style={hint}>Une ligne par jour est recommandée.</span>
            </label>

            <div style={label}>
              <span style={labelTitle}>Vos forces</span>
              <EditableTags
                values={form.strengths}
                onChange={(values) => set("strengths", values)}
                addLabel="Ajouter une force"
                placeholder="Ex : Intervention rapide"
                emptyText="Ajoutez 3 à 6 forces qui différencient votre entreprise."
                maxItems={12}
              />
              <span style={hint}>3 à 6 forces suffisent. Court.</span>
            </div>

            <div style={label}>
              <span style={labelTitle}>Typologie de clientèle</span>
              <div style={checkboxGrid}>
                {[
                  { value: "particuliers", label: "Particuliers" },
                  { value: "professionnels", label: "Professionnels" },
                  { value: "collectivites", label: "Collectivités" },
                ].map((option) => {
                  const checked = form.customerTypes.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      style={{
                        ...chipLabel,
                        boxShadow: checked
                          ? "0 0 0 1px rgba(56,189,248,0.35) inset"
                          : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCustomerType(option.value)}
                        style={{ accentColor: "#38bdf8", flex: "0 0 auto" }}
                      />
                      <span style={{ minWidth: 0 }}>{option.label}</span>
                    </label>
                  );
                })}
              </div>
              <span style={hint}>
                Aide l’IA à adapter les arguments, le vocabulaire et le niveau
                de sérieux selon vos clients.
              </span>
            </div>

            {error ? (
              <div style={{ color: "rgba(248,113,113,0.95)", fontWeight: 800 }}>
                {error}
              </div>
            ) : null}
            {saved ? (
              <div style={{ color: "rgba(34,197,94,0.95)", fontWeight: 900 }}>
                Enregistré ✅
              </div>
            ) : null}

            <div
              data-activity-actions
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 8,
                display: "grid",
                gap: 10,
                gridTemplateColumns: "minmax(180px, 1.35fr) minmax(130px, 0.72fr)",
                padding: "11px 0 max(2px, env(safe-area-inset-bottom, 0px))",
                background:
                  "linear-gradient(180deg, rgba(6,16,31,0), rgba(6,16,31,0.96) 28%)",
              }}
            >
              <button
                type="button"
                style={primaryBtn}
                disabled={saving}
                onClick={save}
              >
                {saving
                  ? "Enregistrement…"
                  : onboarding
                    ? "Enregistrer et continuer →"
                    : "Enregistrer"}
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
                Astuce : plus vos informations sont précises, plus les contenus
                IA sont bons.
              </div>
            ) : null}
          </div>
        )}
      </div>
      <style jsx>{`
        @media (max-width: 620px) {
          div[data-activity-actions] {
            grid-template-columns: minmax(0, 1.28fr) minmax(0, 0.72fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
