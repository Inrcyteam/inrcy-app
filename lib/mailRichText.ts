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
const TEMPLATE_PLACEHOLDER_RE = /\[[^\]\n]{1,80}\]/g;
const TEMPLATE_PLACEHOLDER_SPAN_STYLE =
  "color:#fb7185;font-weight:900;background:rgba(248,113,113,0.14);border:1px solid rgba(248,113,113,0.28);border-radius:6px;padding:0 3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;";


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


function normalizeRichInlineTagName(tag: string): "strong" | "em" | "u" {
  const normalized = String(tag || "").toLowerCase();
  if (normalized === "b" || normalized === "strong") return "strong";
  if (normalized === "i" || normalized === "em") return "em";
  return "u";
}

function restoreAllowedInlineTagsFromEscapedText(escaped: string): string {
  let out = String(escaped || "");
  const allowedPair = /&lt;\s*(strong|b|em|i|u)\s*&gt;([\s\S]*?)&lt;\s*\/\s*\1\s*&gt;/gi;

  for (let i = 0; i < 10; i += 1) {
    const before = out;
    out = out.replace(allowedPair, (_match, rawTag, inner) => {
      const tag = normalizeRichInlineTagName(rawTag);
      return `<${tag}>${inner}</${tag}>`;
    });
    if (out === before) break;
  }

  return out
    .replace(/&lt;\s*\/?\s*(strong|b|em|i|u)(?:\s+[^&]*?)?\s*\/?\s*&gt;/gi, "")
    .replace(/&amp;lt;\s*\/?\s*(strong|b|em|i|u)(?:\s+[^&]*?)?\s*\/?\s*&amp;gt;/gi, "");
}

function applyMarkdownInlineFormattingToEscapedText(escaped: string): string {
  return String(escaped || "")
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___([^_\n]+?)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+?)_/g, "$1<em>$2</em>");
}

export function stripTemplatePlaceholderHighlights(html: string): string {
  return String(html || "").replace(
    /<span\b(?=[^>]*\bdata-inrcy-placeholder\s*=)[^>]*>([\s\S]*?)<\/span>/gi,
    "$1"
  );
}

export function extractTemplatePlaceholders(value: string): string[] {
  TEMPLATE_PLACEHOLDER_RE.lastIndex = 0;
  const matches = String(value || "").match(TEMPLATE_PLACEHOLDER_RE) || [];
  TEMPLATE_PLACEHOLDER_RE.lastIndex = 0;
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean)));
}

export function highlightTemplatePlaceholdersInHtml(html: string): string {
  const source = stripTemplatePlaceholderHighlights(String(html || ""));
  TEMPLATE_PLACEHOLDER_RE.lastIndex = 0;
  if (!source || !TEMPLATE_PLACEHOLDER_RE.test(source)) {
    TEMPLATE_PLACEHOLDER_RE.lastIndex = 0;
    return source;
  }
  TEMPLATE_PLACEHOLDER_RE.lastIndex = 0;

  return source
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part || part.startsWith("<")) return part;
      return part.replace(TEMPLATE_PLACEHOLDER_RE, (match) => {
        return `<span data-inrcy-placeholder="1" style="${TEMPLATE_PLACEHOLDER_SPAN_STYLE}">${match}</span>`;
      });
    })
    .join("");
}

export function textToRichMailHtml(text: string): string {
  const escaped = escapeRichMailHtml(String(text || "")).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const withAllowedTags = restoreAllowedInlineTagsFromEscapedText(escaped);
  const withFormatting = applyMarkdownInlineFormattingToEscapedText(withAllowedTags);
  return linkifyEscapedUrls(withFormatting).replace(/\n/g, "<br/>");
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
      if (normalizedTag === "span" && /\bdata-inrcy-placeholder\s*=/.test(String(attrs || ""))) {
        return `<span data-inrcy-placeholder="1" style="${TEMPLATE_PLACEHOLDER_SPAN_STYLE}">`;
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
