export type BoosterChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";
export type BoosterCtaMode = "none" | "website" | "call" | "message" | "custom";

export type BoosterPostLike = {
  title?: string | null;
  content?: string | null;
  cta?: string | null;
  hashtags?: string[] | null;
  ctaMode?: string | null;
  ctaUrl?: string | null;
  ctaPhone?: string | null;
};

export type BoosterCtaContext = {
  websiteUrl?: string | null;
  phone?: string | null;
};

export type BoosterGmbCallToAction = {
  actionType: "LEARN_MORE" | "CALL";
  url: string;
} | null;

const VALID_MODES: BoosterCtaMode[] = ["none", "website", "call", "message", "custom"];

function collapseWhitespace(input: string) {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureUrl(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  if (/^[^\s]+\.[^\s]+/.test(raw)) return `https://${raw}`;
  return "";
}

function normalizePhone(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^\d+]/g, "")
    .slice(0, 24);
}

function phoneToTelUrl(input: string) {
  const phone = normalizePhone(input);
  if (!phone) return "";
  const normalized = phone.startsWith("+") ? `+${phone.slice(1).replace(/\+/g, "")}` : phone;
  return `tel:${normalized}`;
}

export function inferLegacyCtaMode(text: string): BoosterCtaMode {
  const value = collapseWhitespace(text).toLowerCase();
  if (!value) return "none";
  if (/(^|\b)(message|mp|dm|priv[ée])/.test(value)) return "message";
  if (/(^|\b)(appel|appelez|t[ée]l|t[ée]l[ée]phone|joindre)/.test(value)) return "call";
  if (/(https?:\/\/|www\.|site|en savoir plus|d[ée]couvrir|voir|devis)/.test(value)) return "website";
  return "custom";
}

export function getCtaMode(post: Partial<BoosterPostLike> | null | undefined): BoosterCtaMode {
  const raw = String(post?.ctaMode || "").trim() as BoosterCtaMode;
  if (VALID_MODES.includes(raw)) return raw;
  return inferLegacyCtaMode(String(post?.cta || ""));
}

export function getCtaLabel(post: Partial<BoosterPostLike> | null | undefined, mode = getCtaMode(post)) {
  const value = collapseWhitespace(String(post?.cta || ""));
  if (value) return value.slice(0, 180);
  switch (mode) {
    case "website":
      return "En savoir plus";
    case "call":
      return "Appeler";
    case "message":
      return "Message privé";
    default:
      return "";
  }
}

export function getCtaWebsiteUrl(post: Partial<BoosterPostLike> | null | undefined, context?: BoosterCtaContext) {
  return ensureUrl(String(post?.ctaUrl || "")) || ensureUrl(String(context?.websiteUrl || ""));
}

export function getCtaPhone(post: Partial<BoosterPostLike> | null | undefined, context?: BoosterCtaContext) {
  return normalizePhone(String(post?.ctaPhone || "")) || normalizePhone(String(context?.phone || ""));
}

export function buildCtaTextForChannel(channel: BoosterChannelKey, post: Partial<BoosterPostLike> | null | undefined, context?: BoosterCtaContext) {
  const mode = getCtaMode(post);
  const label = getCtaLabel(post, mode);
  const websiteUrl = getCtaWebsiteUrl(post, context);
  const phone = getCtaPhone(post, context);

  if (channel === "gmb") {
    return mode === "custom" ? label : "";
  }

  switch (mode) {
    case "none":
      return "";
    case "website":
      if (!websiteUrl) return label && label !== "En savoir plus" ? label : "";
      return `${label || "En savoir plus"} : ${websiteUrl}`;
    case "call":
      return phone ? `Appelez-nous : ${phone}` : "";
    case "message":
      return channel === "instagram" ? "Écrivez-nous en message privé." : "Envoyez-nous un message privé.";
    case "custom":
    default:
      return label;
  }
}

function buildPrimaryBoosterText(channel: BoosterChannelKey, post: Partial<BoosterPostLike> | null | undefined) {
  const title = collapseWhitespace(String(post?.title || ""));
  const content = collapseWhitespace(String(post?.content || ""));

  if ((channel === "facebook" || channel === "linkedin") && title && content) {
    return collapseWhitespace(`${title} — ${content}`);
  }

  return [title, content].filter(Boolean).join("\n\n").trim();
}

export function buildBoosterMessage(channel: BoosterChannelKey, post: Partial<BoosterPostLike> | null | undefined, context?: BoosterCtaContext) {
  const parts = [
    buildPrimaryBoosterText(channel, post),
    buildCtaTextForChannel(channel, post, context),
  ].filter(Boolean);
  return parts.join("\n\n").trim();
}

function normalizeHashtag(input: string) {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

export function buildBoosterInstagramCaption(post: Partial<BoosterPostLike> | null | undefined, context?: BoosterCtaContext) {
  const base = buildBoosterMessage("instagram", post, context);
  const tags = Array.isArray(post?.hashtags)
    ? post!.hashtags!.map(normalizeHashtag).filter(Boolean).slice(0, 8).map((tag) => `#${tag}`)
    : [];
  return (tags.length ? `${base}\n\n${tags.join(" ")}` : base).trim().slice(0, 2200);
}

export function buildBoosterGmbSummary(post: Partial<BoosterPostLike> | null | undefined) {
  const parts = [
    collapseWhitespace(String(post?.title || "")),
    collapseWhitespace(String(post?.content || "")),
    getCtaMode(post) === "custom" ? getCtaLabel(post, "custom") : "",
  ].filter(Boolean);
  return collapseWhitespace(parts.join("\n\n")).slice(0, 1498);
}

export function getBoosterGmbCallToAction(post: Partial<BoosterPostLike> | null | undefined, context?: BoosterCtaContext): BoosterGmbCallToAction {
  const mode = getCtaMode(post);
  if (mode === "website") {
    const url = getCtaWebsiteUrl(post, context);
    if (!url) return null;
    return { actionType: "LEARN_MORE", url };
  }
  if (mode === "call") {
    const telUrl = phoneToTelUrl(getCtaPhone(post, context));
    if (!telUrl) return null;
    return { actionType: "CALL", url: telUrl };
  }
  return null;
}
