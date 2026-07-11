"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import styles from "./InrSearchLeadForm.module.css";

const VISITOR_STORAGE_KEY = "inrcy.inrsearch.visitor";

type Props = {
  slug: string;
  companyName: string;
};

type FormState = {
  displayName: string;
  companyName: string;
  phone: string;
  email: string;
  message: string;
  consent: boolean;
  website: string;
};

const EMPTY_FORM: FormState = {
  displayName: "",
  companyName: "",
  phone: "",
  email: "",
  message: "",
  consent: false,
  website: "",
};

function getVisitorId() {
  try {
    const existing = window.sessionStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) return existing;
    const next = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    window.sessionStorage.setItem(VISITOR_STORAGE_KEY, next);
    return next;
  } catch {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function detectSource() {
  const params = new URLSearchParams(window.location.search);
  const explicit = String(params.get("utm_source") || params.get("source") || "").toLowerCase();
  const referrer = document.referrer.toLowerCase();
  const haystack = `${explicit} ${referrer}`;
  if (/chatgpt|openai/.test(haystack)) return "chatgpt";
  if (/perplexity/.test(haystack)) return "perplexity";
  if (/gemini|bard\.google/.test(haystack)) return "gemini";
  if (/copilot|bing\.com\/chat/.test(haystack)) return "copilot";
  if (/google\./.test(haystack)) return "google";
  if (/bing\./.test(haystack)) return "bing";
  if (/facebook|instagram|linkedin|tiktok|youtube|pinterest/.test(haystack)) return "social";
  if (!document.referrer && !explicit) return "direct";
  return "other";
}

export default function InrSearchLeadForm({ slug, companyName }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.displayName.trim() && !form.companyName.trim()) {
      setError("Indiquez votre nom ou le nom de votre entreprise.");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Indiquez un email ou un téléphone pour être recontacté.");
      return;
    }
    if (!form.consent) {
      setError("Votre accord est nécessaire pour transmettre la demande.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/inr-search/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          slug,
          ...form,
          source: detectSource(),
          visitorId: getVisitorId(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Impossible d’envoyer votre demande pour le moment.");
      }
      setSent(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’envoyer votre demande pour le moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section} id="demande" aria-labelledby="demande-title">
      <div className={styles.intro}>
        <span className={styles.kicker}>Contact direct</span>
        <h2 id="demande-title">Présentez votre besoin à {companyName}</h2>
        <p>Décrivez votre projet en quelques lignes. Vos coordonnées seront transmises directement à l’entreprise et enregistrées dans son espace professionnel iNrCy.</p>
        <div className={styles.signals}>
          <span><i>✓</i> Demande transmise immédiatement</span>
          <span><i>✓</i> Aucun compte à créer</span>
          <span><i>✓</i> Coordonnées envoyées uniquement à cette entreprise</span>
        </div>
      </div>

      <div className={styles.formCard}>
        {sent ? (
          <div className={styles.success} role="status" aria-live="polite">
            <span aria-hidden="true">✓</span>
            <h3>Votre demande est bien partie.</h3>
            <p>{companyName} a reçu vos coordonnées et pourra vous recontacter.</p>
            <button type="button" onClick={() => setSent(false)}>Envoyer une autre demande</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <input
              className={styles.honeypot}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={form.website}
              onChange={(event) => update("website", event.target.value)}
            />

            <div className={styles.formGrid}>
              <label>
                <span>Nom et prénom <b>*</b></span>
                <input
                  value={form.displayName}
                  onChange={(event) => update("displayName", event.target.value)}
                  autoComplete="name"
                  placeholder="Marie Dupont"
                  maxLength={180}
                />
              </label>
              <label>
                <span>Entreprise</span>
                <input
                  value={form.companyName}
                  onChange={(event) => update("companyName", event.target.value)}
                  autoComplete="organization"
                  placeholder="Nom de votre entreprise"
                  maxLength={140}
                />
              </label>
              <label>
                <span>Téléphone</span>
                <input
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="06 00 00 00 00"
                  maxLength={40}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  placeholder="vous@exemple.fr"
                  maxLength={254}
                />
              </label>
            </div>

            <label className={styles.messageField}>
              <span>Votre demande</span>
              <textarea
                value={form.message}
                onChange={(event) => update("message", event.target.value)}
                rows={5}
                maxLength={1400}
                placeholder="Décrivez votre projet, votre besoin ou le meilleur moment pour vous rappeler…"
              />
            </label>

            <label className={styles.consent}>
              <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} />
              <span>J’accepte que mes coordonnées soient transmises à {companyName} afin d’être recontacté. Consultez la <Link href="/legal/confidentialite" target="_blank">politique de confidentialité</Link>.</span>
            </label>

            {error ? <div className={styles.error} role="alert">{error}</div> : null}

            <button className={styles.submit} type="submit" disabled={submitting}>
              <span>{submitting ? "Transmission en cours…" : "Envoyer ma demande"}</span>
              <i aria-hidden="true">→</i>
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
