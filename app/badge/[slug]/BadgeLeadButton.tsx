"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./badge.module.css";

type Props = {
  slug: string;
  company: string;
};

type FormState = {
  displayName: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  website: string;
};

const initialForm: FormState = {
  displayName: "",
  email: "",
  phone: "",
  message: "",
  consent: false,
  website: "",
};

function trim(value: string) {
  return value.trim();
}

export default function BadgeLeadButton({ slug, company }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function closeSheet() {
    setOpen(false);
    setError("");
    setSubmitting(false);
    if (sent) {
      setForm(initialForm);
      setSent(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const hasIdentity = [form.displayName, form.email, form.phone].some((value) => trim(value));
    if (!hasIdentity) {
      setError("Renseignez au moins un nom, un mail ou un téléphone.");
      return;
    }

    if (!form.consent) {
      setError("La validation est nécessaire pour transmettre vos coordonnées.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/inrbadge/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Impossible de transmettre vos coordonnées.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de transmettre vos coordonnées.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className={styles.leadWrap}>
        <button type="button" className={styles.leadButton} onClick={() => setOpen(true)} data-inrbadge-action="lead_form" data-inrbadge-target="lead_form">
          <span className={styles.leadButtonIcon} aria-hidden="true">✦</span>
          <span>Transmettre mes coordonnées</span>
          <span className={styles.leadButtonArrow} aria-hidden="true">›</span>
        </button>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.sheetLayer} aria-hidden={false}>
              <button type="button" className={styles.sheetBackdrop} aria-label="Fermer" onClick={closeSheet} />
              <div className={`${styles.sheet} ${styles.leadSheet}`} role="dialog" aria-modal="true" aria-label="Transmettre mes coordonnées">
                <div className={styles.sheetHeader}>
                  <div>
                    <strong>Transmettre mes coordonnées</strong>
                  </div>
                  <button type="button" className={styles.sheetClose} onClick={closeSheet} aria-label="Fermer">×</button>
                </div>

                {sent ? (
                  <div className={styles.leadSuccess}>
                    <div className={styles.leadSuccessIcon}>✓</div>
                    <strong>C’est envoyé.</strong>
                    <p>Le professionnel a bien reçu vos coordonnées.</p>
                    <button type="button" className={styles.leadSubmitButton} onClick={closeSheet}>Fermer</button>
                  </div>
                ) : (
                  <form className={styles.leadForm} onSubmit={submit}>
                    <input className={styles.leadHoneypot} tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website", e.target.value)} aria-hidden="true" />
                    <label>
                      Nom Prénom / Raison sociale
                      <input
                        value={form.displayName}
                        onChange={(e) => update("displayName", e.target.value)}
                        autoComplete="name"
                        placeholder="Dupont Marie / SAS Exemple"
                      />
                    </label>
                    <div className={styles.leadFormGrid}>
                      <label>
                        Téléphone
                        <input value={form.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" inputMode="tel" />
                      </label>
                      <label>
                        Email
                        <input value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" inputMode="email" />
                      </label>
                    </div>
                    <label>
                      Message / demande
                      <textarea value={form.message} onChange={(e) => update("message", e.target.value)} rows={3} placeholder="Votre demande, besoin ou créneau préféré…" />
                    </label>
                    <label className={styles.leadConsent}>
                      <input type="checkbox" checked={form.consent} onChange={(e) => update("consent", e.target.checked)} />
                      <span>J’accepte que mes coordonnées soient transmises à ce professionnel.</span>
                    </label>
                    {error ? <div className={styles.leadError}>{error}</div> : null}
                    <button type="submit" className={styles.leadSubmitButton} disabled={submitting}>
                      {submitting ? "Transmission…" : "Envoyer mes coordonnées"}
                    </button>
                  </form>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
