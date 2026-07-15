"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./inrSearchPublic.module.css";

type GalleryMedia = {
  id: string;
  title: string;
  url: string;
};

type Props = {
  companyName: string;
  profession: string;
  city: string;
  media: GalleryMedia[];
};

function wrapIndex(index: number, length: number) {
  if (!length) return 0;
  return (index + length) % length;
}

function mediaTitle(index: number) {
  return `Média ${String(index + 1).padStart(2, "0")}`;
}

export default function InrSearchGalleryOrbit({ companyName, profession, city, media }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const total = media.length;
  const activeMedia = media[activeIndex] || media[0];
  const activeTitle = mediaTitle(activeIndex);
  const context = [profession, city].filter(Boolean).join(" · ");

  const move = useCallback((offset: number) => {
    setActiveIndex((current) => wrapIndex(current + offset, total));
  }, [total]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
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
  }, [lightboxOpen, move]);

  const openLightbox = () => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setLightboxOpen(true);
  };

  const onStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox();
    }
  };

  return (
    <div className={styles.galleryOrbitExperience}>
      <div className={styles.galleryOrbitHeader}>
        <div>
          <span className={styles.galleryOrbitEyebrow}>Observatoire créatif</span>
          <h2 id="realisations-title">Les réalisations de {companyName}</h2>
          <p>Regardez le résultat avant de contacter {companyName} : les visuels donnent confiance et aident à imaginer votre propre demande.</p>
        </div>
        <div className={styles.galleryOrbitCounter} aria-label="Navigation dans la galerie">
          <button type="button" onClick={() => move(-1)} aria-label="Réalisation précédente">←</button>
          <span><strong>{String(activeIndex + 1).padStart(2, "0")}</strong><i>/</i>{String(total).padStart(2, "0")}</span>
          <button type="button" onClick={() => move(1)} aria-label="Réalisation suivante">→</button>
        </div>
      </div>

      <div
        className={styles.galleryOrbitStage}
        tabIndex={0}
        onKeyDown={onStageKeyDown}
        aria-label="Observatoire des réalisations. Utilisez les flèches pour naviguer."
      >
        <div className={styles.galleryOrbitAperture} aria-hidden="true"><span /><span /><span /></div>

        <button
          type="button"
          className={styles.galleryOrbitFocus}
          onClick={openLightbox}
          aria-label={`Agrandir ${activeTitle}`}
          aria-haspopup="dialog"
          aria-controls="gallery-lightbox"
        >
          <span className={styles.galleryOrbitFocusGlow} aria-hidden="true" />
          {activeMedia ? <Image src={activeMedia.url} alt={activeTitle} width={1600} height={1000} sizes="(max-width: 900px) 92vw, 650px" loading="eager" unoptimized /> : null}
          <span className={styles.galleryOrbitFocusShade} />
        </button>

        <article className={styles.galleryOrbitMeta} aria-live="polite">
          <span className={styles.galleryOrbitMetaSignal}><i /> Signal {String(activeIndex + 1).padStart(2, "0")}</span>
          <small>{context || "Réalisation"}</small>
          <h3>{activeTitle}</h3>
          <p>Ce média sert de preuve visuelle : il montre le style, le soin et le type de résultat que vous pouvez demander à {companyName}.</p>
          <button type="button" onClick={openLightbox}>Voir en plein écran <span aria-hidden="true">↗</span></button>
        </article>

        <div className={styles.galleryOrbitTrajectory} aria-hidden="true"><span /></div>
      </div>

      <div className={styles.galleryOrbitRail} data-local-carousel role="list" aria-label="Toutes les réalisations">
        {media.map((item, index) => (
          <button
            type="button"
            className={styles.galleryOrbitRailItem}
            data-active={activeIndex === index ? "true" : "false"}
            key={`${item.id}-rail`}
            onClick={() => setActiveIndex(index)}
            role="listitem"
            aria-label={`Afficher ${mediaTitle(index)}`}
          >
            <Image src={item.url} alt={`${mediaTitle(index)} — ${companyName}`} width={320} height={220} sizes="128px" loading="lazy" unoptimized />
            <span>{mediaTitle(index)}</span>
          </button>
        ))}
      </div>

      {typeof document !== "undefined" && lightboxOpen && activeMedia
        ? createPortal(
            <div
              className={styles.galleryLightbox}
              id="gallery-lightbox"
              role="dialog"
              aria-modal="true"
              aria-labelledby="gallery-lightbox-title"
              aria-describedby="gallery-lightbox-context"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setLightboxOpen(false);
              }}
            >
              <button ref={closeButtonRef} type="button" className={styles.galleryLightboxClose} onClick={() => setLightboxOpen(false)} aria-label="Fermer la galerie">×</button>
              <button type="button" className={`${styles.galleryLightboxArrow} ${styles.galleryLightboxArrowPrevious}`} onClick={() => move(-1)} aria-label="Réalisation précédente">←</button>
              <figure className={styles.galleryLightboxFigure}>
                <Image src={activeMedia.url} alt={activeTitle} width={1800} height={1200} sizes="86vw" unoptimized />
                <figcaption>
                  <small id="gallery-lightbox-context">{context || companyName}</small>
                  <strong id="gallery-lightbox-title">{activeTitle}</strong>
                  <span>{String(activeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
                </figcaption>
              </figure>
              <button type="button" className={`${styles.galleryLightboxArrow} ${styles.galleryLightboxArrowNext}`} onClick={() => move(1)} aria-label="Réalisation suivante">→</button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
