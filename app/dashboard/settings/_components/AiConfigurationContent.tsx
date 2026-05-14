"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

type Props = { mode?: "page" | "drawer" };

type AiConfigForm = {
  tone: "pro" | "friendly" | "premium" | "direct";
  preferredCta: "devis" | "appeler" | "message";
  communicationStyle: "local_humain" | "professionnel" | "premium" | "simple" | "moderne";
  emojiLevel: "none" | "light" | "moderate" | "dynamic";
  length: "short" | "medium" | "detailed";
  addressMode: "vous" | "tu" | "auto";
  creativity: "stable" | "balanced" | "creative";
  customInstructions: string;
};

const TABLE = "business_profiles";
const STORAGE_KEY = "inrcy_ai_configuration";

const initialForm: AiConfigForm = {
  tone: "pro",
  preferredCta: "devis",
  communicationStyle: "local_humain",
  emojiLevel: "light",
  length: "medium",
  addressMode: "vous",
  creativity: "balanced",
  customInstructions: "",
};

const selectOption: React.CSSProperties = { color: "#0b1020", background: "#ffffff" };

export default function AiConfigurationContent({ mode = "drawer" }: Props) {
  const [form, setForm] = useState<AiConfigForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const card: React.CSSProperties = useMemo(() => ({
    padding: 16,
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
    border: "1px solid rgba(255,255,255,0.18)",
    background:
      "linear-gradient(135deg, rgba(56,189,248,0.22), rgba(167,139,250,0.22), rgba(244,114,182,0.18), rgba(251,146,60,0.12))",
    boxShadow: "0 20px 60px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
  }), [card]);

  const input: React.CSSProperties = useMemo(() => ({
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    padding: "10px 12px",
    color: "white",
    outline: "none",
  }), []);

  const label: React.CSSProperties = { display: "grid", gap: 8 };
  const labelTitle: React.CSSProperties = { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 800 };
  const hint: React.CSSProperties = { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 1.35 };
  const primaryBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(135deg, rgba(255,77,166,.35), rgba(97,87,255,.28), rgba(0,200,255,.22))",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: saving ? "default" : "pointer",
    fontWeight: 900,
    width: "100%",
    opacity: saving ? 0.7 : 1,
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        let local: Partial<AiConfigForm> = {};
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
            tone: (data?.tone || initialForm.tone) as AiConfigForm["tone"],
            preferredCta: (data?.preferred_cta || initialForm.preferredCta) as AiConfigForm["preferredCta"],
            communicationStyle: (data?.communication_style || initialForm.communicationStyle) as AiConfigForm["communicationStyle"],
            emojiLevel: (data?.emoji_level || initialForm.emojiLevel) as AiConfigForm["emojiLevel"],
            length: (data?.ai_length || initialForm.length) as AiConfigForm["length"],
            addressMode: (data?.address_mode || initialForm.addressMode) as AiConfigForm["addressMode"],
            creativity: (data?.ai_creativity || initialForm.creativity) as AiConfigForm["creativity"],
            customInstructions: String(data?.ai_custom_instructions || initialForm.customInstructions),
          };
        }

        setForm({ ...initialForm, ...local, ...dbTone });
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
            communication_style: form.communicationStyle,
            emoji_level: form.emojiLevel,
            ai_length: form.length,
            address_mode: form.addressMode,
            ai_creativity: form.creativity,
            ai_custom_instructions: form.customInstructions.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (upErr) throw new Error(upErr.message);
      }

      setSaved(true);
    } catch (e) {
      setError(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer la configuration IA."));
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
    <div style={{ display: "grid", gap: 16 }}>
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
            background: "radial-gradient(circle, rgba(255,255,255,0.26), transparent 66%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ fontSize: 18, fontWeight: 950, color: "rgba(255,255,255,0.98)", marginBottom: 8 }}>
          ✨ Votre signature IA
        </div>
        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.55, maxWidth: 520 }}>
          Réglez une fois le style de communication de votre entreprise. Ensuite, Booster reste simple : vous écrivez une phrase, iNrCy génère des contenus adaptés à votre image.
        </div>
      </div>

      <div style={card}>
        {loading ? (
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={label}>
                <span style={labelTitle}>Ton principal</span>
                <select style={input} value={form.tone} onChange={(e) => set("tone", e.target.value as AiConfigForm["tone"])}>
                  <option value="pro" style={selectOption}>Professionnel</option>
                  <option value="friendly" style={selectOption}>Chaleureux</option>
                  <option value="premium" style={selectOption}>Premium</option>
                  <option value="direct" style={selectOption}>Direct</option>
                </select>
              </label>

              <label style={label}>
                <span style={labelTitle}>Style de communication</span>
                <select style={input} value={form.communicationStyle} onChange={(e) => set("communicationStyle", e.target.value as AiConfigForm["communicationStyle"])}>
                  <option value="local_humain" style={selectOption}>Local et humain</option>
                  <option value="professionnel" style={selectOption}>Professionnel</option>
                  <option value="premium" style={selectOption}>Haut de gamme</option>
                  <option value="simple" style={selectOption}>Simple et accessible</option>
                  <option value="moderne" style={selectOption}>Moderne et dynamique</option>
                </select>
              </label>

              <label style={label}>
                <span style={labelTitle}>Niveau d’emojis</span>
                <select style={input} value={form.emojiLevel} onChange={(e) => set("emojiLevel", e.target.value as AiConfigForm["emojiLevel"])}>
                  <option value="none" style={selectOption}>Aucun</option>
                  <option value="light" style={selectOption}>Léger</option>
                  <option value="moderate" style={selectOption}>Modéré</option>
                  <option value="dynamic" style={selectOption}>Dynamique</option>
                </select>
              </label>

              <label style={label}>
                <span style={labelTitle}>Longueur favorite</span>
                <select style={input} value={form.length} onChange={(e) => set("length", e.target.value as AiConfigForm["length"])}>
                  <option value="short" style={selectOption}>Court</option>
                  <option value="medium" style={selectOption}>Moyen</option>
                  <option value="detailed" style={selectOption}>Détaillé</option>
                </select>
              </label>

              <label style={label}>
                <span style={labelTitle}>Tutoiement / vouvoiement</span>
                <select style={input} value={form.addressMode} onChange={(e) => set("addressMode", e.target.value as AiConfigForm["addressMode"])}>
                  <option value="vous" style={selectOption}>Vouvoiement</option>
                  <option value="tu" style={selectOption}>Tutoiement</option>
                  <option value="auto" style={selectOption}>Automatique</option>
                </select>
              </label>

              <label style={label}>
                <span style={labelTitle}>Créativité IA</span>
                <select style={input} value={form.creativity} onChange={(e) => set("creativity", e.target.value as AiConfigForm["creativity"])}>
                  <option value="stable" style={selectOption}>Stable</option>
                  <option value="balanced" style={selectOption}>Équilibrée</option>
                  <option value="creative" style={selectOption}>Créative</option>
                </select>
              </label>

              <label style={label}>
                <span style={labelTitle}>Bouton préféré</span>
                <select style={input} value={form.preferredCta} onChange={(e) => set("preferredCta", e.target.value as AiConfigForm["preferredCta"])}>
                  <option value="devis" style={selectOption}>Demander un devis</option>
                  <option value="appeler" style={selectOption}>Appeler</option>
                  <option value="message" style={selectOption}>Envoyer un message</option>
                </select>
                <span style={hint}>Utilisé comme CTA par défaut lorsque le canal le permet.</span>
              </label>
            </div>

            <label style={label}>
              <span style={labelTitle}>Consignes à respecter / à éviter</span>
              <textarea
                style={{ ...input, minHeight: 96, resize: "vertical", lineHeight: 1.45 }}
                value={form.customInstructions}
                maxLength={500}
                onChange={(e) => set("customInstructions", e.target.value.slice(0, 500))}
                placeholder={'Ex : éviter un ton trop commercial, ne pas utiliser trop d’emojis, ne pas dire “pas cher”, rester sobre et rassurant.'}
              />
              <span style={hint}>
                Optionnel. Très utile pour éviter les mots, promesses ou tournures qui ne correspondent pas à l’image de l’entreprise.
              </span>
            </label>

            {error ? <div style={{ color: "rgba(248,113,113,0.95)", fontWeight: 800 }}>{error}</div> : null}
            {saved ? <div style={{ color: "rgba(34,197,94,0.95)", fontWeight: 900 }}>Configuration IA enregistrée ✅</div> : null}

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <button type="button" style={primaryBtn} disabled={saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
              <button type="button" disabled={saving} onClick={reset} style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", borderRadius: 14, padding: "10px 12px", cursor: saving ? "default" : "pointer", fontWeight: 900 }}>
                Réinitialiser
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...card, color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.45 }}>
        Astuce : plus “Mon activité” est précis, plus iNrCy peut générer des contenus naturels, locaux et à l’image du professionnel.
      </div>
    </div>
  );
}
