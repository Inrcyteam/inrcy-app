const BLOCKED_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "svg",
  "math",
  "canvas",
] as const;

const DANGEROUS_URL_PROTOCOL = /^(?:\s*)(?:javascript|vbscript|data\s*:\s*text\/html)/i;

function stripDangerousCss(value: string) {
  return value
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\s*\(\s*(['\"]?)\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^)]*\)/gi, "")
    .replace(/@import[^;]+;?/gi, "")
    .replace(/behavior\s*:[^;]+;?/gi, "");
}

function sanitizeAttributeValue(name: string, value: string) {
  const normalizedName = name.toLowerCase();
  const normalizedValue = String(value ?? "").trim();

  if (["href", "src", "xlink:href", "formaction", "poster"].includes(normalizedName)) {
    if (DANGEROUS_URL_PROTOCOL.test(normalizedValue)) return "#";
  }

  if (normalizedName === "style") return stripDangerousCss(value);
  return value;
}

export function sanitizeHtml(input: unknown) {
  let html = String(input ?? "");
  if (!html) return "";

  html = html.replace(/<!--[\s\S]*?-->/g, "");

  for (const tag of BLOCKED_TAGS) {
    html = html.replace(new RegExp(`<\\s*${tag}\\b[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<\\s*${tag}\\b[^>]*\\/?\\s*>`, "gi"), "");
  }

  html = html.replace(/\s+on[a-z0-9_-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  html = html.replace(/\s+(href|src|xlink:href|formaction|poster|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_match, name, rawValue) => {
    const quote = rawValue.startsWith("'") ? "'" : rawValue.startsWith('"') ? '"' : "";
    const unquoted = quote ? rawValue.slice(1, -1) : rawValue;
    const safeValue = sanitizeAttributeValue(name, unquoted);
    return quote ? ` ${name}=${quote}${safeValue}${quote}` : ` ${name}=${safeValue}`;
  });

  return html;
}

export function readSanitizedElementHtml(node: HTMLElement | null | undefined) {
  return sanitizeHtml(node?.innerHTML ?? "");
}

export function syncSanitizedElementHtml(node: HTMLElement | null | undefined, nextHtml: unknown) {
  if (!node) return "";
  const safeHtml = sanitizeHtml(nextHtml);
  if (sanitizeHtml(node.innerHTML) !== safeHtml) node.innerHTML = safeHtml;
  return safeHtml;
}
