"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { InrSearchPublication } from "@/lib/inrSearchPublic";
import styles from "./inrSearchPublic.module.css";

type Props = {
  companyName: string;
  publications: InrSearchPublication[];
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatShortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function wrapIndex(index: number, length: number) {
  if (!length) return 0;
  return (index + length) % length;
}

function excerpt(value: string, max = 220) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > max * 0.7 ? lastSpace : max).trim()}…`;
}

export default function InrSearchNewsShowcase({ companyName, publications }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const total = publications.length;
  const activePublication = publications[activeIndex] || publications[0];

  const move = useCallback((offset: number) => {
    if (!total) return;
    setActiveIndex((current) => wrapIndex(current + offset, total));
  }, [total]);

  const openModal = useCallback(() => {
    if (!activePublication) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setModalOpen(true);
  }, [activePublication]);

  const onStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if ((event.key === "Enter" || event.key === " ") && activePublication) {
      event.preventDefault();
      openModal();
    }
  };

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
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
  }, [modalOpen, move]);

  const secondaryIndices = total > 1
    ? Array.from({ length: Math.min(2, total - 1) }, (_, offset) => wrapIndex(activeIndex + offset + 1, total))
    : [];

  return (
    <div className={styles.newsOrbitExperience}>
      <div className={styles.newsOrbitHeader}>
        <div>
          <span className={styles.newsOrbitEyebrow}>Générateur d’impulsions</span>
          <h2 id="actualites-title">Les actualités de {companyName}</h2>
          <p>Suivez les signaux récents de {companyName} : une actualité à jour rassure, prouve l’activité et donne envie d’engager l’échange.</p>
        </div>
        {total ? (
          <div className={styles.newsOrbitNavigator} aria-label="Naviguer entre les actualités">
            <button type="button" onClick={() => move(-1)} aria-label="Actualité précédente">←</button>
            <span><strong>{String(activeIndex + 1).padStart(2, "0")}</strong><i>/</i>{String(total).padStart(2, "0")}</span>
            <button type="button" onClick={() => move(1)} aria-label="Actualité suivante">→</button>
          </div>
        ) : null}
      </div>

      {activePublication ? (
        <div
          className={styles.newsOrbitStage}
          tabIndex={0}
          onKeyDown={onStageKeyDown}
          aria-label="Actualités de l’entreprise. Utilisez les flèches pour naviguer."
        >
          <div className={styles.newsPulseGenerator} aria-hidden="true"><span /><span /><i /></div>

          <button
            type="button"
            className={styles.newsOrbitFocus}
            onClick={openModal}
            aria-label={`Lire l’actualité ${activePublication.title}`}
            aria-haspopup="dialog"
            aria-controls="news-orbit-modal"
          >
            <span className={styles.newsOrbitFocusMedia}>
              {activePublication.imageUrl ? (
                <img src={activePublication.imageUrl} alt={`${activePublication.title} – ${companyName}`} loading="eager" decoding="async" />
              ) : (
                <span className={styles.newsOrbitFallback} aria-hidden="true"><b>✦</b><i /></span>
              )}
              <span className={styles.newsOrbitFocusShade} />
            </span>
            <span className={styles.newsOrbitFocusContent}>
              <span className={styles.newsOrbitFocusMeta}>
                <small>Dernier signal</small>
                {activePublication.createdAt ? <time dateTime={activePublication.createdAt}>{formatDate(activePublication.createdAt)}</time> : null}
              </span>
              <strong>{activePublication.title}</strong>
              {activePublication.content ? <span className={styles.newsOrbitFocusExcerpt}>{excerpt(activePublication.content, 250)}</span> : null}
              <span className={styles.newsOrbitRead}>Lire l’actualité <b aria-hidden="true">↗</b></span>
            </span>
          </button>

          <div className={styles.newsOrbitSecondary} aria-label="Signaux suivants">
            {secondaryIndices.map((index) => {
              const publication = publications[index];
              return (
                <button
                  type="button"
                  className={styles.newsOrbitSecondaryCard}
                  key={publication.id}
                  onClick={() => setActiveIndex(index)}
                  id={`actualite-${index + 1}`}
                  aria-label={`Afficher l’actualité ${publication.title}`}
                >
                  <span>
                    {publication.imageUrl ? <img src={publication.imageUrl} alt={`${publication.title} — ${companyName}`} loading="lazy" decoding="async" /> : <i aria-hidden="true">✦</i>}
                  </span>
                  <small>{publication.createdAt ? formatShortDate(publication.createdAt) : "Signal"}</small>
                  <strong>{publication.title}</strong>
                  <p>{excerpt(publication.content, 95)}</p>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={styles.newsOrbitEmpty} role="status">
          <div className={styles.newsOrbitEmptyGenerator} aria-hidden="true"><span /><span /><i /></div>
          <small>Signal en préparation</small>
          <h3>La prochaine actualité arrive bientôt.</h3>
          <p>Les publications envoyées vers iNr’Search depuis Booster Publier apparaîtront automatiquement ici.</p>
        </div>
      )}

      {total ? (
        <div className={styles.newsOrbitRail} data-local-carousel role="list" aria-label="Chronologie des actualités">
          {publications.map((publication, index) => (
            <button
              type="button"
              className={styles.newsOrbitRailItem}
              data-active={index === activeIndex ? "true" : "false"}
              key={`${publication.id}-rail`}
              onClick={() => setActiveIndex(index)}
              role="listitem"
              aria-label={`Afficher ${publication.title}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{publication.title}</strong>
              {publication.createdAt ? <time dateTime={publication.createdAt}>{formatShortDate(publication.createdAt)}</time> : null}
              <span className={styles.newsOrbitAccessibleContent}>{publication.content}</span>
            </button>
          ))}
        </div>
      ) : null}

      {typeof document !== "undefined" && modalOpen && activePublication
        ? createPortal(
            <div
              className={styles.newsOrbitModalBackdrop}
              id="news-orbit-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="news-orbit-modal-title"
              aria-describedby="news-orbit-modal-content"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setModalOpen(false);
              }}
            >
              <button ref={closeButtonRef} type="button" className={styles.newsOrbitModalClose} onClick={() => setModalOpen(false)} aria-label="Fermer l’actualité">×</button>
              <button type="button" className={`${styles.newsOrbitModalArrow} ${styles.newsOrbitModalArrowPrevious}`} onClick={() => move(-1)} aria-label="Actualité précédente">←</button>
              <article className={styles.newsOrbitModal}>
                {activePublication.imageUrl ? (
                  <div className={styles.newsOrbitModalMedia}><img src={activePublication.imageUrl} alt={`${activePublication.title} – ${companyName}`} /><span /></div>
                ) : null}
                <div className={styles.newsOrbitModalContent}>
                  <span className={styles.newsOrbitModalKicker}>Actualité de {companyName}</span>
                  {activePublication.createdAt ? <time dateTime={activePublication.createdAt}>{formatDate(activePublication.createdAt)}</time> : null}
                  <h2 id="news-orbit-modal-title">{activePublication.title}</h2>
                  <p id="news-orbit-modal-content">{activePublication.content}</p>
                  <span className={styles.newsOrbitModalCount}>{String(activeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
                </div>
              </article>
              <button type="button" className={`${styles.newsOrbitModalArrow} ${styles.newsOrbitModalArrowNext}`} onClick={() => move(1)} aria-label="Actualité suivante">→</button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
