const ENTITY_REPLACEMENTS: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const ALLOWED_TAGS = new Set(["strong", "b", "em", "i", "u", "br", "div", "p", "span", "a"]);
const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

export function escapeRichMailHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeEntities(value: string): string {
  return String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_REPLACEMENTS[String(name).toLowerCase()] ?? match);
}

function linkifyEscapedUrls(escapedText: string): string {
  return String(escapedText || "").replace(URL_RE, (rawMatch) => {
    let hrefPart = rawMatch;
    let trailingPart = "";
    while (/[.,;:!?)]$/.test(hrefPart)) {
      trailingPart = hrefPart.slice(-1) + trailingPart;
      hrefPart = hrefPart.slice(0, -1);
    }
    if (!hrefPart) return rawMatch;
    const safeHref = escapeRichMailHtml(decodeEntities(hrefPart));
    const safeLabel = escapeRichMailHtml(decodeEntities(hrefPart));
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>${escapeRichMailHtml(decodeEntities(trailingPart))}`;
  });
}

export function textToRichMailHtml(text: string): string {
  const escaped = escapeRichMailHtml(String(text || "")).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return linkifyEscapedUrls(escaped).replace(/\n/g, "<br/>");
}

export function richMailHtmlToText(html: string): string {
  return decodeEntities(
    String(html || "")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(div|p)\s*>/gi, "\n")
      .replace(/<\s*(div|p)(\s[^>]*)?>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd();
}

function getSafeHref(attrs: string): string {
  const raw = String(attrs || "").match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = decodeEntities(raw?.[2] || raw?.[3] || raw?.[4] || "").trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  return "";
}

export function sanitizeRichMailHtml(html: string): string {
  const source = String(html || "");
  if (!source.trim()) return "";

  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math|link|meta)[^>]*\/?\s*>/gi, "")
    .replace(/<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/gi, (_match, closing, rawTag, attrs) => {
      const tag = String(rawTag || "").toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (tag === "br") return "<br/>";
      const normalizedTag = tag === "b" ? "strong" : tag === "i" ? "em" : tag;
      if (closing) return `</${normalizedTag}>`;
      if (normalizedTag === "a") {
        const href = getSafeHref(String(attrs || ""));
        if (!href) return "";
        return `<a href="${escapeRichMailHtml(href)}" target="_blank" rel="noopener noreferrer">`;
      }
      return `<${normalizedTag}>`;
    })
    .replace(/<span>\s*<\/span>/gi, "")
    .trim();
}

export function normalizeRichMailHtmlForSend(text: string, html?: string | null): string {
  const cleanedHtml = sanitizeRichMailHtml(String(html || ""));
  if (cleanedHtml.trim()) return cleanedHtml;
  return textToRichMailHtml(String(text || ""));
}
