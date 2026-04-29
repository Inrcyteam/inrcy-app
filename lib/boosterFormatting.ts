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

  // Restore only the exact inline tags we allow after escaping everything else.
  out = out.replace(new RegExp(`&lt;(${ALLOWED_INLINE_TAGS})&gt;([\\s\\S]*?)&lt;\\/\\1&gt;`, "gi"), (_match, tag, inner) => {
    const safeTag = normalizeAllowedTag(String(tag || ""));
    return `<${safeTag}>${inner}</${safeTag}>`;
  });

  // Markdown shortcuts used by the Booster editor and the AI for site articles.
  // Keep these deliberately simple to avoid converting accidental complex markup.
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<em>$2</em>");

  return out;
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
    .replace(new RegExp(`</?(${ALLOWED_INLINE_TAGS})>`, "gi"), "")
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1$2")
    .replace(/\s+\n/g, "\n")
    .trim();
}
