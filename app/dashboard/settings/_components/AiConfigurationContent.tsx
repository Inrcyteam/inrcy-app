"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import {
  BOOSTER_PREFERRED_CTA_OPTIONS,
  normalizeBoosterPreferredCta,
  type BoosterPreferredCta,
} from "../../booster/publier/publishModal.shared";

type Props = { mode?: "page" | "drawer" };

type AiConfigForm = {
  tone: "serious" | "warm" | "fun" | "premium";
  textStyle: "simple" | "dynamic" | "expert" | "coulisses";
  originality: "classic" | "balanced" | "creative";
  length: "short" | "medium" | "detailed";
  emojiLevel: "none" | "light" | "dynamic";
  pronoun: "je" | "nous" | "vous" | "neutral";
  addressMode: "vous" | "tu";
  commercialLevel: "discreet" | "balanced" | "direct";
  mainGoal: "visibility" | "contacts" | "reassure" | "offer";
  preferredAngle: "local" | "quality" | "price" | "speed" | "trust";
  preferredCta: BoosterPreferredCta;
  language: "fr" | "en" | "es" | "it" | "de" | "nl" | "pt";
  likedExample: string;
  forbiddenStyle: string;
};

const TABLE = "business_profiles";
const STORAGE_KEY = "inrcy_ai_configuration";

const initialForm: AiConfigForm = {
  tone: "serious",
  textStyle: "simple",
  originality: "balanced",
  length: "medium",
  emojiLevel: "light",
  pronoun: "nous",
  addressMode: "vous",
  commercialLevel: "balanced",
  mainGoal: "contacts",
  preferredAngle: "trust",
  preferredCta: "devis",
  language: "fr",
  likedExample: "",
  forbiddenStyle: "",
};

const selectOption: React.CSSProperties = { color: "#0b1020", background: "#ffffff" };

const normalizeTone = (value: unknown): AiConfigForm["tone"] => {
  const raw = String(value || "").trim();
  if (raw === "fun") return "fun";
  if (raw === "premium") return "premium";
  if (["friendly", "warm", "chaleureux"].includes(raw)) return "warm";
  return "serious";
};

const normalizeTextStyle = (value: unknown): AiConfigForm["textStyle"] => {
  const raw = String(value || "").trim();
  if (["dynamic", "dynamique", "moderne"].includes(raw)) return "dynamic";
  if (["expert", "professionnel"].includes(raw)) return "expert";
  if (["coulisses", "histoire"].includes(raw)) return "coulisses";
  return "simple";
};

const normalizeOriginality = (value: unknown): AiConfigForm["originality"] => {
  const raw = String(value || "").trim();
  if (["classic", "classique", "stable"].includes(raw)) return "classic";
  if (["creative", "creatif"].includes(raw)) return "creative";
  return "balanced";
};

const normalizeLength = (value: unknown): AiConfigForm["length"] => {
  const raw = String(value || "").trim();
  if (raw === "short") return "short";
  if (raw === "detailed") return "detailed";
  return "medium";
};

const normalizeEmojiLevel = (value: unknown): AiConfigForm["emojiLevel"] => {
  const raw = String(value || "").trim();
  if (raw === "none") return "none";
  if (["dynamic", "many"].includes(raw)) return "dynamic";
  return "light";
};

const normalizePronoun = (value: unknown): AiConfigForm["pronoun"] => {
  const raw = String(value || "").trim();
  if (raw === "je") return "je";
  if (raw === "vous") return "vous";
  if (raw === "neutral") return "neutral";
  return "nous";
};

const normalizeAddressMode = (value: unknown): AiConfigForm["addressMode"] => {
  const raw = String(value || "").trim();
  if (raw === "tu") return "tu";
  return "vous";
};

const normalizeCommercialLevel = (value: unknown): AiConfigForm["commercialLevel"] => {
  const raw = String(value || "").trim();
  if (["discreet", "discret"].includes(raw)) return "discreet";
  if (raw === "direct") return "direct";
  return "balanced";
};

const normalizeMainGoal = (value: unknown): AiConfigForm["mainGoal"] => {
  const raw = String(value || "").trim();
  if (["visibility", "visible"].includes(raw)) return "visibility";
  if (["reassure", "rassurer"].includes(raw)) return "reassure";
  if (["offer", "offre"].includes(raw)) return "offer";
  return "contacts";
};

const normalizePreferredAngle = (value: unknown): AiConfigForm["preferredAngle"] => {
  const raw = String(value || "").trim();
  if (raw === "local") return "local";
  if (["quality", "qualite"].includes(raw)) return "quality";
  if (["price", "prix"].includes(raw)) return "price";
  if (["speed", "rapidite"].includes(raw)) return "speed";
  return "trust";
};

const normalizeLanguage = (value: unknown): AiConfigForm["language"] => {
  const raw = String(value || "").trim().toLowerCase();
  if (["en", "english", "anglais"].includes(raw)) return "en";
  if (["es", "spanish", "espagnol"].includes(raw)) return "es";
  if (["it", "italian", "italien"].includes(raw)) return "it";
  if (["de", "german", "allemand"].includes(raw)) return "de";
  if (["nl", "dutch", "neerlandais", "néerlandais"].includes(raw)) return "nl";
  if (["pt", "portuguese", "portugais"].includes(raw)) return "pt";
  return "fr";
};

export default function AiConfigurationContent({ mode = "drawer" }: Props) {
  const [form, setForm] = useState<AiConfigForm>(initialForm);
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

  const signatureCard: React.CSSProperties = useMemo(() => ({
    ...card,
    position: "relative",
    overflow: "hidden",
    border: "1px solid rgba(251,191,36,0.22)",
    background:
      "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(56,189,248,0.16), rgba(167,139,250,0.18), rgba(244,114,182,0.14))",
    boxShadow: "0 20px 60px rgba(0,0,0,0.22), 0 0 34px rgba(251,191,36,0.12), inset 0 1px 0 rgba(255,255,255,0.10)",
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

  const label: React.CSSProperties = { display: "grid", gap: 8, minWidth: 0, maxWidth: "100%" };
  const labelTitle: React.CSSProperties = { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 800, lineHeight: 1.25 };
  const hint: React.CSSProperties = { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 1.35 };
  const grid2: React.CSSProperties = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", minWidth: 0, maxWidth: "100%" };
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
        let local: Partial<Record<keyof AiConfigForm | "communicationStyle" | "creativity" | "aiVoice" | "customInstructions", unknown>> = {};
        try {
          local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
        } catch {}

        const supabase = createClient();
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw new Error(authErr.message);
        const user = authData?.user;

        let dbTone: Partial<AiConfigForm> = {};
        if (user) {
          const { data, error: dbErr } = await supabase
            .from(TABLE)
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          if (dbErr) throw new Error(dbErr.message);
          dbTone = {
            tone: normalizeTone(data?.tone),
            textStyle: normalizeTextStyle(data?.communication_style),
            originality: normalizeOriginality(data?.ai_creativity),
            length: normalizeLength(data?.ai_length),
            emojiLevel: normalizeEmojiLevel(data?.emoji_level),
            pronoun: normalizePronoun(data?.ai_voice),
            addressMode: normalizeAddressMode(data?.address_mode),
            commercialLevel: normalizeCommercialLevel(data?.ai_commercial_level),
            mainGoal: normalizeMainGoal(data?.ai_main_goal),
            preferredAngle: normalizePreferredAngle(data?.ai_preferred_angle),
            preferredCta: normalizeBoosterPreferredCta(data?.preferred_cta || initialForm.preferredCta),
            language: normalizeLanguage(data?.ai_language),
            likedExample: String(data?.ai_liked_example || initialForm.likedExample).slice(0, 1200),
            forbiddenStyle: String(data?.ai_custom_instructions || initialForm.forbiddenStyle).slice(0, 700),
          };
        }

        const migratedLocal: Partial<AiConfigForm> = {
          tone: normalizeTone(local.tone),
          textStyle: normalizeTextStyle(local.textStyle ?? local.communicationStyle),
          originality: normalizeOriginality(local.originality ?? local.creativity),
          length: normalizeLength(local.length),
          emojiLevel: normalizeEmojiLevel(local.emojiLevel),
          pronoun: normalizePronoun(local.pronoun ?? local.aiVoice),
          addressMode: normalizeAddressMode(local.addressMode),
          commercialLevel: normalizeCommercialLevel(local.commercialLevel),
          mainGoal: normalizeMainGoal(local.mainGoal),
          preferredAngle: normalizePreferredAngle(local.preferredAngle),
          preferredCta: normalizeBoosterPreferredCta(local.preferredCta || initialForm.preferredCta),
          language: normalizeLanguage(local.language),
          likedExample: String(local.likedExample || "").slice(0, 1200),
          forbiddenStyle: String(local.forbiddenStyle ?? local.customInstructions ?? "").slice(0, 700),
        };

        const merged = { ...initialForm, ...migratedLocal, ...dbTone } as AiConfigForm;
        setForm({
          ...merged,
          preferredCta: normalizeBoosterPreferredCta(merged.preferredCta),
        });
      } catch (e) {
        setError(getSimpleFrenchErrorMessage(e, "Impossible de charger la configuration IA."));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const set = <K extends keyof AiConfigForm>(key: K, value: AiConfigForm[K]) => {
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
            tone: form.tone,
            preferred_cta: form.preferredCta,
            communication_style: form.textStyle,
            emoji_level: form.emojiLevel,
            ai_length: form.length,
            address_mode: form.addressMode,
            ai_voice: form.pronoun,
            ai_creativity: form.originality,
            ai_commercial_level: form.commercialLevel,
            ai_main_goal: form.mainGoal,
            ai_preferred_angle: form.preferredAngle,
            ai_language: form.language,
            ai_liked_example: form.likedExample.trim(),
            ai_custom_instructions: form.forbiddenStyle.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (upErr) throw new Error(upErr.message);
      }

      setSaved(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/ai_commercial_level|ai_main_goal|ai_preferred_angle|ai_liked_example|ai_language/i.test(message)) {
        setError("Il faut d’abord exécuter le SQL de mise à jour Configuration IA dans Supabase.");
      } else {
        setError(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer la configuration IA."));
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
      <div style={signatureCard}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: -36,
            top: -44,
            width: 130,
            height: 130,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(251,191,36,0.30), transparent 66%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ fontSize: "clamp(16px, 4.6vw, 18px)", fontWeight: 950, color: "rgba(255,255,255,0.98)", marginBottom: 8, lineHeight: 1.25, overflowWrap: "break-word" }}>
          ✨ Votre signature IA
        </div>
        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.55, maxWidth: 560, overflowWrap: "break-word" }}>
          Réglez une fois votre façon de communiquer. Ensuite, iNrCy génère des contenus plus proches de votre style, sans changer la logique SEO automatique des outils.
        </div>
      </div>

      <div style={card}>
        {loading ? (
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={sectionTitle}>Style des contenus</div>
              <div style={grid2}>
                <label style={label}>
                  <span style={labelTitle}>Ton du contenu</span>
                  <select style={input} value={form.tone} onChange={(e) => set("tone", e.target.value as AiConfigForm["tone"])}>
                    <option value="serious" style={selectOption}>Sérieux</option>
                    <option value="warm" style={selectOption}>Chaleureux</option>
                    <option value="fun" style={selectOption}>Fun</option>
                    <option value="premium" style={selectOption}>Premium</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Style du texte</span>
                  <select style={input} value={form.textStyle} onChange={(e) => set("textStyle", e.target.value as AiConfigForm["textStyle"])}>
                    <option value="simple" style={selectOption}>Simple et clair</option>
                    <option value="dynamic" style={selectOption}>Dynamique</option>
                    <option value="expert" style={selectOption}>Conseil d’expert</option>
                    <option value="coulisses" style={selectOption}>Coulisses / histoire</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Originalité</span>
                  <select style={input} value={form.originality} onChange={(e) => set("originality", e.target.value as AiConfigForm["originality"])}>
                    <option value="classic" style={selectOption}>Classique</option>
                    <option value="balanced" style={selectOption}>Équilibrée</option>
                    <option value="creative" style={selectOption}>Créative</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Longueur</span>
                  <select style={input} value={form.length} onChange={(e) => set("length", e.target.value as AiConfigForm["length"])}>
                    <option value="short" style={selectOption}>Court</option>
                    <option value="medium" style={selectOption}>Moyen</option>
                    <option value="detailed" style={selectOption}>Détaillé</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Emojis</span>
                  <select style={input} value={form.emojiLevel} onChange={(e) => set("emojiLevel", e.target.value as AiConfigForm["emojiLevel"])}>
                    <option value="none" style={selectOption}>Aucun</option>
                    <option value="light" style={selectOption}>Léger</option>
                    <option value="dynamic" style={selectOption}>Beaucoup</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Langue du contenu généré</span>
                  <select style={input} value={form.language} onChange={(e) => set("language", e.target.value as AiConfigForm["language"])}>
                    <option value="fr" style={selectOption}>Français</option>
                    <option value="en" style={selectOption}>English</option>
                    <option value="es" style={selectOption}>Español</option>
                    <option value="it" style={selectOption}>Italiano</option>
                    <option value="de" style={selectOption}>Deutsch</option>
                    <option value="nl" style={selectOption}>Nederlands</option>
                    <option value="pt" style={selectOption}>Português</option>
                  </select>
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={sectionTitle}>Façon de parler</div>
              <div style={grid2}>
                <label style={label}>
                  <span style={labelTitle}>Pronom utilisé</span>
                  <select style={input} value={form.pronoun} onChange={(e) => set("pronoun", e.target.value as AiConfigForm["pronoun"])}>
                    <option value="je" style={selectOption}>Je</option>
                    <option value="nous" style={selectOption}>Nous</option>
                    <option value="vous" style={selectOption}>Vous</option>
                    <option value="neutral" style={selectOption}>Neutre</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Relation avec le lecteur</span>
                  <select style={input} value={form.addressMode} onChange={(e) => set("addressMode", e.target.value as AiConfigForm["addressMode"])}>
                    <option value="vous" style={selectOption}>Vouvoiement</option>
                    <option value="tu" style={selectOption}>Tutoiement</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Niveau commercial</span>
                  <select style={input} value={form.commercialLevel} onChange={(e) => set("commercialLevel", e.target.value as AiConfigForm["commercialLevel"])}>
                    <option value="discreet" style={selectOption}>Discret</option>
                    <option value="balanced" style={selectOption}>Équilibré</option>
                    <option value="direct" style={selectOption}>Direct</option>
                  </select>
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={sectionTitle}>Objectif des contenus</div>
              <div style={grid2}>
                <label style={label}>
                  <span style={labelTitle}>Objectif principal</span>
                  <select style={input} value={form.mainGoal} onChange={(e) => set("mainGoal", e.target.value as AiConfigForm["mainGoal"])}>
                    <option value="visibility" style={selectOption}>Faire connaître l’entreprise</option>
                    <option value="contacts" style={selectOption}>Obtenir des contacts</option>
                    <option value="reassure" style={selectOption}>Rassurer les clients</option>
                    <option value="offer" style={selectOption}>Mettre en avant une offre</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Angle préféré</span>
                  <select style={input} value={form.preferredAngle} onChange={(e) => set("preferredAngle", e.target.value as AiConfigForm["preferredAngle"])}>
                    <option value="local" style={selectOption}>Local / proximité</option>
                    <option value="quality" style={selectOption}>Qualité du travail</option>
                    <option value="price" style={selectOption}>Prix / avantage</option>
                    <option value="speed" style={selectOption}>Rapidité / réactivité</option>
                    <option value="trust" style={selectOption}>Confiance</option>
                  </select>
                </label>

                <label style={label}>
                  <span style={labelTitle}>Bouton préféré</span>
                  <select style={input} value={form.preferredCta} onChange={(e) => set("preferredCta", e.target.value as AiConfigForm["preferredCta"])}>
                    {BOOSTER_PREFERRED_CTA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} style={selectOption}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={sectionTitle}>Inspiration / limites</div>
              <label style={label}>
                <span style={labelTitle}>Exemple de contenu que vous aimez</span>
                <textarea
                  style={{ ...input, minHeight: 112, resize: "vertical", lineHeight: 1.45 }}
                  value={form.likedExample}
                  maxLength={1200}
                  onChange={(e) => set("likedExample", e.target.value.slice(0, 1200))}
                  placeholder="Collez ici une publication que vous aimez. iNrCy s’en inspirera pour le ton, le rythme et la structure, sans copier."
                />
                <span style={hint}>Optionnel, mais très puissant pour obtenir un style vraiment proche de ce que vous aimez.</span>
              </label>

              <label style={label}>
                <span style={labelTitle}>À éviter absolument</span>
                <textarea
                  style={{ ...input, minHeight: 96, resize: "vertical", lineHeight: 1.45 }}
                  value={form.forbiddenStyle}
                  maxLength={700}
                  onChange={(e) => set("forbiddenStyle", e.target.value.slice(0, 700))}
                  placeholder={'Ex : éviter un ton trop commercial, ne pas utiliser trop d’emojis, ne pas dire “pas cher”, rester sobre et rassurant.'}
                />
                <span style={hint}>Mots, promesses ou tournures qui ne correspondent pas à l’image de l’entreprise.</span>
              </label>
            </div>

            {error ? <div style={{ color: "rgba(248,113,113,0.95)", fontWeight: 800 }}>{error}</div> : null}
            {saved ? <div style={{ color: "rgba(34,197,94,0.95)", fontWeight: 900 }}>Configuration IA enregistrée ✅</div> : null}

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", minWidth: 0, maxWidth: "100%" }}>
              <button type="button" style={primaryBtn} disabled={saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
              <button type="button" disabled={saving} onClick={reset} style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", borderRadius: 14, padding: "10px 12px", cursor: saving ? "default" : "pointer", fontWeight: 900, fontSize: 16 }}>
                Réinitialiser
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...card, color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.45 }}>
        Astuce : plus “Mon activité” et votre “signature IA” sont précis, plus iNrCy peut générer des contenus naturels, locaux et à l’image du professionnel.
      </div>
    </div>
  );
}
