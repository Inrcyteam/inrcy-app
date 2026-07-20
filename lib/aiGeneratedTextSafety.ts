/**
 * Nettoyage local des artefacts de recherche/citation parfois ajoutés par des
 * moteurs comme Sonar. Cette fonction ne corrige pas le style du texte et ne
 * touche pas aux faits : elle retire uniquement des marqueurs techniques qui
 * ne doivent jamais apparaître dans une publication finale.
 */

const NUMERIC_BRACKET_CITATION = /\[(?:\^\s*)?\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*\]/g;
const SEARCH_CITATION = /【\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*(?:†[^】]*)?】/g;
const MARKDOWN_FOOTNOTE_DEFINITION = /^\s*\[(?:\^\s*)?\d+\]\s*:\s*.*$/gim;
const TRAILING_SOURCE_SECTION = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:sources?|références?|references|bibliographie|fuentes|quellen)\s*:?\s*\n[\s\S]*$/i;

function resetCitationRegexes() {
  NUMERIC_BRACKET_CITATION.lastIndex = 0;
  SEARCH_CITATION.lastIndex = 0;
  MARKDOWN_FOOTNOTE_DEFINITION.lastIndex = 0;
}

export function hasAiGeneratedCitationArtifacts(value: unknown) {
  const text = String(value || "");
  if (!text) return false;
  resetCitationRegexes();
  const detected =
    NUMERIC_BRACKET_CITATION.test(text) ||
    SEARCH_CITATION.test(text) ||
    MARKDOWN_FOOTNOTE_DEFINITION.test(text) ||
    TRAILING_SOURCE_SECTION.test(text);
  resetCitationRegexes();
  return detected;
}

export function sanitizeAiGeneratedEditorialText(value: unknown) {
  let text = String(value || "").trim();
  if (!text) return "";

  resetCitationRegexes();
  text = text.replace(MARKDOWN_FOOTNOTE_DEFINITION, "");
  text = text.replace(SEARCH_CITATION, "");
  text = text.replace(NUMERIC_BRACKET_CITATION, "");
  text = text.replace(TRAILING_SOURCE_SECTION, "");

  // Répare seulement les espaces laissés par le retrait des marqueurs, tout en
  // conservant les paragraphes et le Markdown autorisé pour les canaux site.
  text = text
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  resetCitationRegexes();
  return text;
}
