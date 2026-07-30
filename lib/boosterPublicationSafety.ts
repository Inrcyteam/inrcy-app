export type BoosterStructuredCtaMode =
  | "none"
  | "website"
  | "call"
  | "message"
  | "custom";

export type BoosterPublicationSafetyPost = {
  title?: string | null;
  content?: string | null;
  cta?: string | null;
  ctaUrl?: string | null;
  ctaPhone?: string | null;
  hashtags?: string[] | null;
};

export type BoosterPublicationSafetyContext = {
  websiteUrl?: string | null;
  phone?: string | null;
};

const PHONE_CANDIDATE_RE = /(?:\+|00)?\d(?:[\s()./-]*\d){7,15}/g;
const URL_CANDIDATE_RE =
  /(?:https?:\/\/|www\.)[^\s<>{}\[\]"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>{}\[\]"']*)?/giu;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;

const CONTACT_CUE_RE =
  /\b(?:appel(?:ez|er)?|contact(?:ez|er)?|joign(?:ez|re)|t[ée]l(?:[ée]phone)?|phone|call|llam(?:a|ar|e)|chiama|anrufen|bellen|ligar|visitez?|visit|website|site\s+web|cliquez?|click|d[ée]couvrez?|learn\s+more|en\s+savoir\s+plus|email|e-mail|courriel)\b/giu;
const CONTACT_REMOVAL_MARKER = "\uFFF0";

function normalizeSpaces(input: string) {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/ +([,.;!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function canonicalizeBoosterPhone(input: unknown) {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("33")) {
    return `fr:${digits.slice(2)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `fr:${digits.slice(1)}`;
  }
  return digits;
}

function hasUsablePhone(input: unknown) {
  const canonical = canonicalizeBoosterPhone(input);
  const digits = canonical.replace(/^fr:/, "");
  return digits.length >= 8 && digits.length <= 15;
}

function cleanPhoneDisplayValue(input: unknown) {
  const raw = String(input || "")
    .replace(/^tel:/i, "")
    .replace(/[^\d+\s()./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (!hasUsablePhone(raw)) return "";

  const digits = raw.replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits) && /^\d+$/.test(raw)) {
    return digits.match(/.{1,2}/g)?.join(" ") || raw;
  }
  if (/^33\d{9}$/.test(digits) && /^\+?\d+$/.test(raw)) {
    const local = digits.slice(2);
    return `+33 ${local[0]} ${local.slice(1).match(/.{1,2}/g)?.join(" ") || local.slice(1)}`;
  }
  return raw;
}

export function getBoosterPhoneDisplayValue(
  post: BoosterPublicationSafetyPost | null | undefined,
  context?: BoosterPublicationSafetyContext,
) {
  return (
    cleanPhoneDisplayValue(post?.ctaPhone) ||
    cleanPhoneDisplayValue(context?.phone)
  );
}

function trimUrlCandidate(candidate: string) {
  const trailing = candidate.match(/[),.;!?]+$/)?.[0] || "";
  return {
    core: trailing ? candidate.slice(0, -trailing.length) : candidate,
    trailing,
  };
}

export function canonicalizeBoosterUrl(input: unknown) {
  let value = String(input || "").trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");
  value = value.replace(/[),.;!?]+$/, "").replace(/\/+$/, "");
  return value;
}

function cleanupAfterContactRemoval(
  input: string,
  contactWasRemoved: boolean,
  preserveContactCue = false,
) {
  const rawSegments = contactWasRemoved
    ? String(input || "").split(CONTACT_REMOVAL_MARKER)
    : [String(input || "")];

  const cleanedSegments = rawSegments
    .map((segment, index) => {
      let value = normalizeSpaces(segment)
        .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, "")
        .replace(/^[\s,;:|•·—–-]+|[\s:|•·—–-]+$/g, "")
        .trim();

      const isBeforeRemovedContact =
        contactWasRemoved &&
        !preserveContactCue &&
        index < rawSegments.length - 1;
      if (isBeforeRemovedContact) {
        const matches = Array.from(value.matchAll(CONTACT_CUE_RE));
        const lastCue = matches[matches.length - 1];
        if (lastCue?.index !== undefined) {
          value = value
            .slice(0, lastCue.index)
            .replace(/[\s,;:|•·—–-]+$/g, "")
            .trim();
        }
        value = value.replace(/\b(?:au|sur|via|at|on)\s*$/iu, "").trim();
      }

      if (!value || !/[\p{L}\p{N}]/u.test(value)) return "";
      return value;
    })
    .filter(Boolean);

  return normalizeSpaces(cleanedSegments.join(" "));
}

function sanitizeTextLines(
  input: unknown,
  transformLine: (line: string) => { value: string; removed: boolean },
  preserveContactCue = false,
) {
  const lines = String(input || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const transformed = transformLine(line);
      return cleanupAfterContactRemoval(
        transformed.value,
        transformed.removed,
        preserveContactCue,
      );
    });

  return normalizeSpaces(lines.join("\n"));
}

export function removeMatchingBoosterPhone(
  input: unknown,
  targetPhone: unknown,
  options?: { preserveContactCue?: boolean },
) {
  const target = canonicalizeBoosterPhone(targetPhone);
  if (!hasUsablePhone(targetPhone)) return normalizeSpaces(String(input || ""));

  return sanitizeTextLines(input, (line) => {
    let removed = false;
    const value = line.replace(PHONE_CANDIDATE_RE, (candidate) => {
      if (canonicalizeBoosterPhone(candidate) !== target) return candidate;
      removed = true;
      return CONTACT_REMOVAL_MARKER;
    });
    return { value, removed };
  }, Boolean(options?.preserveContactCue));
}

export function removeMatchingBoosterUrl(
  input: unknown,
  targetUrl: unknown,
  options?: { preserveContactCue?: boolean },
) {
  const target = canonicalizeBoosterUrl(targetUrl);
  if (!target || !target.includes(".")) return normalizeSpaces(String(input || ""));

  return sanitizeTextLines(input, (line) => {
    let removed = false;
    const value = line.replace(URL_CANDIDATE_RE, (candidate) => {
      const { core, trailing } = trimUrlCandidate(candidate);
      if (canonicalizeBoosterUrl(core) !== target) return candidate;
      removed = true;
      return `${CONTACT_REMOVAL_MARKER}${trailing}`;
    });
    return { value, removed };
  }, Boolean(options?.preserveContactCue));
}

export function sanitizeBoosterPostForStructuredCta(
  post: BoosterPublicationSafetyPost | null | undefined,
  mode: BoosterStructuredCtaMode,
  context?: BoosterPublicationSafetyContext,
): BoosterPublicationSafetyPost {
  const next: BoosterPublicationSafetyPost = { ...(post || {}) };

  if (mode === "call") {
    const phone = post?.ctaPhone || context?.phone || "";
    if (hasUsablePhone(phone)) {
      next.title = removeMatchingBoosterPhone(post?.title, phone);
      next.content = removeMatchingBoosterPhone(post?.content, phone);
      next.cta = removeMatchingBoosterPhone(post?.cta, phone, {
        preserveContactCue: true,
      });
    }
  }

  if (mode === "website" || mode === "custom") {
    const websiteUrl =
      post?.ctaUrl || (mode === "website" ? context?.websiteUrl : "") || "";
    if (canonicalizeBoosterUrl(websiteUrl)) {
      next.title = removeMatchingBoosterUrl(post?.title, websiteUrl);
      next.content = removeMatchingBoosterUrl(post?.content, websiteUrl);
      next.cta = removeMatchingBoosterUrl(post?.cta, websiteUrl, {
        preserveContactCue: true,
      });
    }
  }

  return next;
}

function normalizeHashtagToken(input: unknown) {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 40);
}

function canonicalizeHashtag(input: unknown) {
  return normalizeHashtagToken(input)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr");
}

export function dedupeBoosterHashtagsInText(input: unknown) {
  const seen = new Set<string>();
  const value = String(input || "").replace(HASHTAG_RE, (full, tag: string) => {
    const canonical = canonicalizeHashtag(tag);
    if (!canonical || seen.has(canonical)) return "";
    seen.add(canonical);
    return full;
  });
  return normalizeSpaces(value);
}

export function buildUniqueBoosterHashtagLine(
  baseText: unknown,
  hashtags: unknown,
  maxTags = 8,
) {
  const existing = new Set<string>();
  for (const match of String(baseText || "").matchAll(HASHTAG_RE)) {
    const canonical = canonicalizeHashtag(match[1]);
    if (canonical) existing.add(canonical);
  }

  const selected: string[] = [];
  const selectedCanonical = new Set<string>();
  const values = Array.isArray(hashtags) ? hashtags : [];
  for (const raw of values) {
    const token = normalizeHashtagToken(raw);
    const canonical = canonicalizeHashtag(token);
    if (
      !token ||
      !canonical ||
      existing.has(canonical) ||
      selectedCanonical.has(canonical)
    ) {
      continue;
    }
    selected.push(`#${token}`);
    selectedCanonical.add(canonical);
    if (selected.length >= Math.max(0, maxTags)) break;
  }

  return selected.join(" ");
}

function isLikelyPhoneCandidate(candidate: string) {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  return (
    /^\s*(?:\+|00|0)/.test(candidate) ||
    /[\s()./-]/.test(candidate)
  );
}

export function sanitizeGoogleBusinessPublicationText(input: unknown) {
  return sanitizeTextLines(input, (line) => {
    let removed = false;
    let value = line.replace(EMAIL_RE, () => {
      removed = true;
      return CONTACT_REMOVAL_MARKER;
    });
    value = value.replace(URL_CANDIDATE_RE, (candidate) => {
      const { trailing } = trimUrlCandidate(candidate);
      removed = true;
      return `${CONTACT_REMOVAL_MARKER}${trailing}`;
    });
    value = value.replace(PHONE_CANDIDATE_RE, (candidate) => {
      if (!isLikelyPhoneCandidate(candidate)) return candidate;
      removed = true;
      return CONTACT_REMOVAL_MARKER;
    });
    value = value.replace(HASHTAG_RE, () => {
      removed = true;
      return CONTACT_REMOVAL_MARKER;
    });
    return { value, removed };
  });
}
