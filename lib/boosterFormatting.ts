const ALLOWED_INLINE_TAGS = "strong|b|em|i|u";

export function escapeHtml(input: unknown) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeAllowedTag(tag: string) {
  const t = tag.toLowerCase();
  if (t === "b") return "strong";
  if (t === "i") return "em";
  return t;
}

function applyInlineSiteFormattingToEscaped(input: string) {
  let out = String(input || "");
  const allowedTagRegex = new RegExp(`&lt;(${ALLOWED_INLINE_TAGS})&gt;([\\s\\S]*?)&lt;\\/\\1&gt;`, "gi");

  // Restore only the exact inline tags we allow after escaping everything else.
  // The loop keeps nested formats working, e.g. <strong><u>texte</u></strong>.
  for (let i = 0; i < 8; i += 1) {
    const before = out;
    out = out.replace(allowedTagRegex, (_match, tag, inner) => {
      const safeTag = normalizeAllowedTag(String(tag || ""));
      return `<${safeTag}>${inner}</${safeTag}>`;
    });
    if (out === before) break;
  }

  // Keep backward compatibility with previously generated Markdown content.
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<em>$2</em>");

  return out;
}

function decodeBasicHtmlEntities(input: string) {
  return String(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'");
}

export function siteTextToEditableHtml(input: unknown) {
  const raw = String(input ?? "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return "";

  return applyInlineSiteFormattingToEscaped(escapeHtml(raw))
    .replace(/\n/g, "<br />");
}

export function editableHtmlToSiteText(input: unknown) {
  let html = String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<\s*(strong|b)[^>]*>/gi, "%%INRCY_STRONG_OPEN%%")
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, "%%INRCY_STRONG_CLOSE%%")
    .replace(/<\s*(em|i)[^>]*>/gi, "%%INRCY_EM_OPEN%%")
    .replace(/<\s*\/\s*(em|i)\s*>/gi, "%%INRCY_EM_CLOSE%%")
    .replace(/<\s*u[^>]*>/gi, "%%INRCY_U_OPEN%%")
    .replace(/<\s*\/\s*u\s*>/gi, "%%INRCY_U_CLOSE%%")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(div|p|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*(div|p|li|h[1-6])[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "");

  html = decodeBasicHtmlEntities(html)
    .replace(/%%INRCY_STRONG_OPEN%%/g, "<strong>")
    .replace(/%%INRCY_STRONG_CLOSE%%/g, "</strong>")
    .replace(/%%INRCY_EM_OPEN%%/g, "<em>")
    .replace(/%%INRCY_EM_CLOSE%%/g, "</em>")
    .replace(/%%INRCY_U_OPEN%%/g, "<u>")
    .replace(/%%INRCY_U_CLOSE%%/g, "</u>")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return html;
}

export function renderBoosterSiteContentHtml(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  const escaped = escapeHtml(raw).replace(/\r\n/g, "\n");
  return escaped
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${applyInlineSiteFormattingToEscaped(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function stripSiteTextFormatting(input: unknown) {
  return String(input ?? "")
    .replace(new RegExp(`<\\/?\\s*(${ALLOWED_INLINE_TAGS})[^>]*>`, "gi"), "")
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1$2")
    .replace(/\s+\n/g, "\n")
    .trim();
}
