"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import styles from "./inrSearchPublic.module.css";

type FaqItem = {
  question: string;
  answer: string;
};

type Props = {
  companyName: string;
  items: FaqItem[];
  contactHref: string;
};

function wrapIndex(index: number, length: number) {
  if (!length) return 0;
  return (index + length) % length;
}

function preview(value: string, max = 135) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findBestFaq(items: FaqItem[], query: string) {
  const tokens = normalizeSearchValue(query)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (!tokens.length) return -1;

  let bestIndex = -1;
  let bestScore = 0;
  items.forEach((item, index) => {
    const question = normalizeSearchValue(item.question);
    const answer = normalizeSearchValue(item.answer);
    const haystack = `${question} ${answer}`;
    const score = tokens.reduce((total, token) => {
      if (question.includes(token)) return total + 3;
      if (answer.includes(token)) return total + 1;
      return total;
    }, 0) + (haystack.includes(normalizeSearchValue(query)) ? 4 : 0);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

export default function InrSearchFaqOrbit({ companyName, items, contactHref }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [guideQuery, setGuideQuery] = useState("");
  const [guideMessage, setGuideMessage] = useState("");
  const total = items.length;

  const cards = useMemo(() => {
    if (!total) return [];
    if (total === 1) return [{ index: 0, position: "active" as const }];
    if (total === 2) {
      return [
        { index: activeIndex, position: "active" as const },
        { index: wrapIndex(activeIndex + 1, total), position: "next" as const },
      ];
    }
    return [
      { index: wrapIndex(activeIndex - 1, total), position: "previous" as const },
      { index: activeIndex, position: "active" as const },
      { index: wrapIndex(activeIndex + 1, total), position: "next" as const },
    ];
  }, [activeIndex, total]);

  const move = (offset: number) => {
    setActiveIndex((current) => wrapIndex(current + offset, total));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, total - 1));
    }
  };

  const onGuideSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matchIndex = findBestFaq(items, guideQuery);
    if (matchIndex >= 0) {
      setActiveIndex(matchIndex);
      setGuideMessage(`Réponse vérifiée sélectionnée pour « ${items[matchIndex].question} ».`);
      return;
    }
    setGuideMessage("Je n’ai pas encore de réponse vérifiée pour cette formulation.");
  };

  return (
    <div className={styles.faqOrbitExperience} onKeyDown={onKeyDown}>
      <div className={styles.faqOrbitHeader}>
        <div>
          <span className={styles.faqOrbitEyebrow}>Capsules de réponses</span>
          <h2 id="faq-title">Questions fréquentes sur {companyName}</h2>
          <p>Levez les derniers doutes avant le contact : chaque réponse aide à savoir quoi demander, comment avancer et pourquoi faire appel à {companyName}.</p>
          <form className={styles.faqGuide} onSubmit={onGuideSubmit} role="search" aria-label={`iNr'Guide pour ${companyName}`}>
            <label htmlFor="faq-guide-query">iNr’Guide — trouver une réponse vérifiée</label>
            <div className={styles.faqGuideRow}>
              <input
                id="faq-guide-query"
                value={guideQuery}
                onChange={(event) => setGuideQuery(event.target.value)}
                placeholder="Ex. tarifs, délai, zone, rendez-vous…"
                autoComplete="off"
              />
              <button type="submit">Explorer</button>
            </div>
            {guideMessage ? <output aria-live="polite">{guideMessage}</output> : null}
          </form>
        </div>
        <div className={styles.faqOrbitNavigator} aria-label="Naviguer entre les questions fréquentes">
          <button type="button" onClick={() => move(-1)} aria-label="Question précédente">←</button>
          <span><strong>{String(activeIndex + 1).padStart(2, "0")}</strong> / {String(total).padStart(2, "0")}</span>
          <button type="button" onClick={() => move(1)} aria-label="Question suivante">→</button>
        </div>
      </div>

      <div className={styles.faqOrbitStage} tabIndex={0} aria-label="Carrousel des questions fréquentes">
        <div className={styles.faqMagneticRail} aria-hidden="true"><span /><i /><i /></div>
        <div className={styles.faqCarousel} role="list" aria-live="polite">
          {cards.map(({ index, position }) => {
            const item = items[index];
            const active = position === "active";
            return (
              <article
                className={styles.faqCarouselCard}
                data-position={position}
                key={`${item.question}-${position}`}
                role="listitem"
                aria-current={active ? "true" : undefined}
              >
                <div className={styles.faqCarouselCardTopline}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <small>{active ? "Réponse active" : position === "previous" ? "Précédente" : "Suivante"}</small>
                </div>
                <h3>{item.question}</h3>
                <p>{active ? item.answer : preview(item.answer)}</p>
                {active ? (
                  <a
                    href="#contact"
                    data-inrsearch-contact-trigger
                    data-inrsearch-action="faq_contact"
                    data-inrsearch-target="#contact-modal"
                    data-inrsearch-fallback={contactHref || undefined}
                  >
                    Poser une autre question <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <button type="button" onClick={() => setActiveIndex(index)} aria-label={`Afficher la réponse à ${item.question}`}>
                    Placer au centre <span aria-hidden="true">→</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className={styles.faqOrbitIndex} aria-label="Accès direct aux questions">
        {items.map((item, index) => (
          <button
            type="button"
            data-active={index === activeIndex ? "true" : "false"}
            key={`${item.question}-index`}
            onClick={() => setActiveIndex(index)}
            aria-label={`Question ${index + 1} : ${item.question}`}
          >
            {String(index + 1).padStart(2, "0")}
          </button>
        ))}
      </div>
    </div>
  );
}
