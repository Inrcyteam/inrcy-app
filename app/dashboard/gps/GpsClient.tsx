"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./gps.module.css";
import { GPS_SECTIONS, type GpsArticle } from "./noticeContent";

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type SearchHit = {
  article: GpsArticle;
  sectionId: string;
  sectionTitle: string;
  score: number;
};

export default function GpsClient() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState(GPS_SECTIONS[0]?.id ?? "generateur");
  const [activeArticleId, setActiveArticleId] = useState<string>(GPS_SECTIONS[0]?.articles?.[0]?.id ?? "");
  const contentRef = useRef<HTMLDivElement | null>(null);

  const hits = useMemo((): SearchHit[] => {
    const q = normalizeText(query);
    if (!q) return [];

    const results: SearchHit[] = [];
    for (const section of GPS_SECTIONS) {
      for (const article of section.articles) {
        const title = normalizeText(article.title);
        const keywords = normalizeText(article.keywords.join(" "));
        const body = normalizeText(
          [
            article.intro,
            ...(article.steps ?? []),
            ...(article.checks ?? []),
            ...(article.pitfalls ?? []),
            ...((article.faq ?? []).flatMap((f) => [f.q, f.a])),
          ].join(" ")
        );

        let score = 0;
        if (title.includes(q)) score += 60;
        if (keywords.includes(q)) score += 30;
        if (body.includes(q)) score += 10;

        // petit bonus si match exact sur mot
        if (new RegExp(`\\b${q}\\b`, "i").test(title)) score += 10;
        if (score > 0) {
          results.push({ article, sectionId: section.id, sectionTitle: section.title, score });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
  }, [query]);

  const scrollToArticle = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveArticleId(id);
    // highlight flash
    el.classList.remove(styles.flash);
    // force reflow
    void el.offsetWidth;
    el.classList.add(styles.flash);
  };

  useEffect(() => {
    // When section changes, jump to first article
    const section = GPS_SECTIONS.find((s) => s.id === activeSection);
    const first = section?.articles?.[0]?.id;
    if (first) {
      setActiveArticleId(first);
      // do not auto-scroll on first mount if already at top
      setTimeout(() => scrollToArticle(first), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>Votre cockpit iNrCy</div>
          <h1 className={styles.title}>GPS d’utilisation</h1>
          <p className={styles.subtitle}>
            Un guide rapide, clair et pratique — pour éviter les questions bidons et vous débloquer en 2 minutes.
          </p>
        </div>

        <div className={styles.searchWrap}>
          <label className={styles.searchLabel} htmlFor="gps-search">
            Rechercher
          </label>
          <input
            id="gps-search"
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex : suivi, devis, publier, Google…"
            autoComplete="off"
          />

          {hits.length > 0 && (
            <div className={styles.searchResults} role="listbox" aria-label="Résultats de recherche">
              {hits.map((hit) => (
                <button
                  key={`${hit.sectionId}:${hit.article.id}`}
                  type="button"
                  className={styles.searchResult}
                  onClick={() => {
                    setQuery("");
                    setActiveSection(hit.sectionId);
                    setTimeout(() => scrollToArticle(hit.article.id), 0);
                  }}
                >
                  <span className={styles.searchResultTitle}>{hit.article.title}</span>
                  <span className={styles.searchResultMeta}>{hit.sectionTitle}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Rubriques</div>

          <nav className={styles.nav} aria-label="Navigation GPS">
            {GPS_SECTIONS.map((section) => (
              <div key={section.id} className={styles.navGroup}>
                <button
                  type="button"
                  className={`${styles.navSection} ${activeSection === section.id ? styles.navSectionActive : ""}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.title}
                </button>

                {activeSection === section.id && (
                  <div className={styles.navArticles}>
                    {section.articles.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`${styles.navArticle} ${activeArticleId === a.id ? styles.navArticleActive : ""}`}
                        onClick={() => scrollToArticle(a.id)}
                      >
                        {a.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <section className={styles.content} ref={contentRef}>
          {GPS_SECTIONS.map((section) => (
            <div key={section.id} className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{section.title}</h2>
                {section.description && <p className={styles.sectionDesc}>{section.description}</p>}
              </div>

              <div className={styles.cards}>
                {section.articles.map((article) => (
                  <article key={article.id} id={article.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <h3 className={styles.cardTitle}>{article.title}</h3>
                      {article.links && article.links.length > 0 && (
                        <div className={styles.cardLinks}>
                          {article.links.map((l) => (
                            <Link key={l.href} href={l.href} className={styles.cardLink}>
                              {l.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className={styles.cardIntro}>{article.intro}</p>

                    <div className={styles.block}>
                      <div className={styles.blockTitle}>Guide pas à pas</div>
                      <ol className={styles.steps}>
                        {article.steps.map((s, idx) => (
                          <li key={idx} className={styles.step}>
                            <span dangerouslySetInnerHTML={{ __html: s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                          </li>
                        ))}
                      </ol>
                    </div>

                    {article.checks && article.checks.length > 0 && (
                      <div className={styles.block}>
                        <div className={styles.blockTitle}>À vérifier</div>
                        <ul className={styles.list}>
                          {article.checks.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {article.pitfalls && article.pitfalls.length > 0 && (
                      <div className={styles.block}>
                        <div className={styles.blockTitle}>Problèmes fréquents</div>
                        <ul className={styles.list}>
                          {article.pitfalls.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {article.faq && article.faq.length > 0 && (
                      <div className={styles.block}>
                        <div className={styles.blockTitle}>FAQ</div>
                        <div className={styles.faq}>
                          {article.faq.map((f, idx) => (
                            <details key={idx} className={styles.faqItem}>
                              <summary className={styles.faqQ}>{f.q}</summary>
                              <div className={styles.faqA}>{f.a}</div>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}

          <footer className={styles.footer}>
            <div className={styles.footerCard}>
              <div className={styles.footerTitle}>Encore bloqué ?</div>
              <p className={styles.footerText}>
                Regardez d’abord <strong>Le générateur → Vérifier que tout tourne</strong>. Si tout est OK et que le souci
                persiste, contactez-nous depuis le menu (Nous contacter).
              </p>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
