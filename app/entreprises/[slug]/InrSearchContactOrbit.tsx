"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InrSearchLeadForm from "./InrSearchLeadForm";
import {
  INR_SEARCH_OPEN_CONTACT_EVENT,
  type InrSearchOpenContactDetail,
} from "./inrSearchContactEvents";
import styles from "./inrSearchPublic.module.css";

type Props = {
  slug: string;
  companyName: string;
  logoUrl: string;
  profession: string;
  city: string;
  phone: string;
  phoneHref: string;
  email: string;
  emailHref: string;
  addressLine: string;
  websiteUrl: string;
  directionsUrl: string;
};

type Signal = {
  key: string;
  label: string;
  value: string;
  href: string;
  action: string;
  glyph: string;
};

export default function InrSearchContactOrbit({
  slug,
  companyName,
  logoUrl,
  profession,
  city,
  phone,
  phoneHref,
  email,
  emailHref,
  addressLine,
  websiteUrl,
  directionsUrl,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [activeSignal, setActiveSignal] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const openForm = (trigger?: HTMLElement | null) => {
    returnFocusRef.current = trigger || document.activeElement as HTMLElement | null;
    setFormOpen(true);
  };

  useEffect(() => {
    const onOpenContact = (event: Event) => {
      const trigger = (event as CustomEvent<InrSearchOpenContactDetail>).detail?.trigger;
      openForm(trigger);
    };

    window.addEventListener(INR_SEARCH_OPEN_CONTACT_EVENT, onOpenContact);
    return () => window.removeEventListener(INR_SEARCH_OPEN_CONTACT_EVENT, onOpenContact);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFormOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [formOpen]);

  const signals: Signal[] = [
    phone && phoneHref ? { key: "phone", label: "Appeler", value: phone, href: phoneHref, action: "phone", glyph: "☎" } : null,
    email && emailHref ? { key: "email", label: "Écrire", value: email, href: emailHref, action: "email", glyph: "✉" } : null,
    addressLine ? { key: "location", label: "Localiser", value: addressLine, href: directionsUrl || "#contact", action: directionsUrl ? "directions" : "", glyph: "⌖" } : null,
    websiteUrl ? { key: "website", label: "Site internet", value: "Visiter le site", href: websiteUrl, action: "website", glyph: "◎" } : null,
  ].filter(Boolean) as Signal[];

  return (
    <div className={styles.contactUniverse}>
      <div className={styles.contactOrbitHeader}>
        <div>
          <span className={styles.contactOrbitEyebrow}>Générateur de convergence</span>
          <h2>Choisissez votre voie. L’énergie fait le lien.</h2>
          <p>Passez de l’intérêt à l’action : choisissez le canal le plus simple et envoyez à {companyName} une demande claire, utile et exploitable.</p>
        </div>
        <span className={styles.contactOrbitStatus}><i /> {signals.length} voie{signals.length > 1 ? "s" : ""} de contact</span>
      </div>

      <div
        className={styles.contactConvergence}
        data-active-signal={activeSignal === null ? "none" : String(activeSignal)}
        onMouseLeave={() => setActiveSignal(null)}
      >
        <svg className={styles.contactEnergyLines} viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
          <path data-line-index="0" d="M500 260 C390 260 350 120 230 120" pathLength="1" />
          <path data-line-index="1" d="M500 260 C610 260 650 120 770 120" pathLength="1" />
          <path data-line-index="2" d="M500 260 C390 260 350 400 230 400" pathLength="1" />
          <path data-line-index="3" d="M500 260 C610 260 650 400 770 400" pathLength="1" />
          <circle cx="500" cy="260" r="8" />
        </svg>

        <div className={styles.contactCore}>
          <span className={styles.contactCoreHalo} aria-hidden="true" />
          <span className={styles.contactCoreRotor} aria-hidden="true"><i /><i /><i /></span>
          {logoUrl ? <img src={logoUrl} alt="" width={126} height={126} loading="eager" decoding="async" /> : <span className={styles.contactCoreFallback}>{companyName.slice(0, 1).toUpperCase()}</span>}
          <small>{profession || "Entreprise"}</small>
          <strong>{companyName}</strong>
          <em>{city || "À votre écoute"}</em>
          <button type="button" onClick={(event) => openForm(event.currentTarget)}>Présenter mon besoin <span aria-hidden="true">↗</span></button>
        </div>

        <div className={styles.contactSignals} role="list" aria-label="Moyens de contacter l’entreprise">
          {signals.map((signal, index) => (
            <a
              className={styles.contactSignal}
              data-signal-index={index}
              key={signal.key}
              href={signal.href}
              target={signal.href.startsWith("http") ? "_blank" : undefined}
              rel={signal.href.startsWith("http") ? "noopener noreferrer" : undefined}
              data-inrsearch-action={signal.action || undefined}
              data-inrsearch-target={signal.href}
              role="listitem"
              onMouseEnter={() => setActiveSignal(index)}
              onFocus={() => setActiveSignal(index)}
              onBlur={() => setActiveSignal(null)}
            >
              <span aria-hidden="true">{signal.glyph}</span>
              <small>{signal.label}</small>
              <strong>{signal.value}</strong>
              <i aria-hidden="true">↗</i>
            </a>
          ))}
        </div>

        <div className={styles.contactLegalLinks}>
          <a href="/legal/mentions-legales" target="_blank" rel="noopener noreferrer" data-inrsearch-gesture-ignore>Mentions légales</a>
          <span aria-hidden="true">·</span>
          <a href="/legal/confidentialite" target="_blank" rel="noopener noreferrer" data-inrsearch-gesture-ignore>Confidentialité</a>
        </div>
      </div>

      {typeof document !== "undefined" && formOpen
        ? createPortal(
            <div
              className={styles.contactModalBackdrop}
              role="dialog"
              aria-modal="true"
              aria-label={`Présenter un besoin à ${companyName}`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setFormOpen(false);
              }}
            >
              <div className={styles.contactModalShell}>
                <button ref={closeButtonRef} className={styles.contactModalClose} type="button" onClick={() => setFormOpen(false)} aria-label="Fermer le formulaire">×</button>
                <InrSearchLeadForm slug={slug} companyName={companyName} modal />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
