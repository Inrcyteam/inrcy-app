import { classifyMailFailure, normalizeSuppressionEmail } from "@/lib/mailSuppression";

export type ParsedDeliveryFeedback = {
  kind: "bounce" | "complaint";
  bounceType: "hard" | "soft" | null;
  email: string;
  reason: string;
};

const FEEDBACK_HINTS = [
  /delivery status notification/i,
  /undeliverable/i,
  /mail delivery failed/i,
  /returned mail/i,
  /failure notice/i,
  /non remis/i,
  /non distribué/i,
  /adresse introuvable/i,
  /mailer-daemon/i,
  /postmaster/i,
  /spam complaint/i,
  /abuse report/i,
];

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return normalizeSuppressionEmail(match[1]);
  }
  return "";
}

export function extractFeedbackRecipient(text: string, ownEmail?: string | null) {
  const direct = firstMatch(text, [
    /Final-Recipient:\s*(?:rfc822\s*;\s*)?([^\s;<>]+@[^\s;<>]+)/i,
    /Original-Recipient:\s*(?:rfc822\s*;\s*)?([^\s;<>]+@[^\s;<>]+)/i,
    /X-Failed-Recipients:\s*([^\s,;<>]+@[^\s,;<>]+)/i,
    /(?:message|mail|email)\s+(?:to|à)\s+<?([^\s<>]+@[^\s<>]+)>?\s+(?:couldn'?t|n’a pas|n'a pas|cannot|failed)/i,
    /(?:recipient|destinataire|address|adresse)\s*[:=]\s*<?([^\s<>]+@[^\s<>]+)>?/i,
  ]);
  if (direct) return direct.replace(/[),.;:]+$/, "");

  const own = normalizeSuppressionEmail(ownEmail);
  const candidates = Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))
    .map((match) => normalizeSuppressionEmail(match[0]))
    .filter((email) => email && email !== own)
    .filter((email) => !/mailer-daemon|postmaster|no-reply|noreply/.test(email));
  return candidates[0] || "";
}

export function parseDeliveryFeedback(args: {
  subject?: string | null;
  from?: string | null;
  body?: string | null;
  ownEmail?: string | null;
}): ParsedDeliveryFeedback | null {
  const combined = [args.subject, args.from, args.body].filter(Boolean).join("\n").slice(0, 100_000);
  if (!FEEDBACK_HINTS.some((pattern) => pattern.test(combined))) return null;

  const email = extractFeedbackRecipient(combined, args.ownEmail);
  if (!email) return null;

  const classification = classifyMailFailure(combined);
  if (classification.kind === "complaint") {
    return { kind: "complaint", bounceType: null, email, reason: combined.slice(0, 500) };
  }
  if (classification.kind === "hard_bounce" || classification.kind === "soft_bounce") {
    return {
      kind: "bounce",
      bounceType: classification.bounceType,
      email,
      reason: combined.slice(0, 500),
    };
  }

  // Les notifications de non-distribution non classées restent des rebonds
  // souples : elles ne blacklistent jamais automatiquement une adresse.
  return { kind: "bounce", bounceType: "soft", email, reason: combined.slice(0, 500) };
}
