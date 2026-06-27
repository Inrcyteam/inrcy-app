export type MailDeliveryProvider = "gmail" | "microsoft" | "imap" | string | null | undefined;

export type MailDeliveryErrorKind =
  | "account_blocked"
  | "auth_required"
  | "permission_denied"
  | "quota_exceeded"
  | "rate_limited"
  | "invalid_recipient"
  | "blocked_recipient"
  | "attachment_too_large"
  | "provider_unavailable"
  | "configuration"
  | "unknown";

export type NormalizedMailDeliveryError = {
  kind: MailDeliveryErrorKind;
  title: string;
  message: string;
  action: string;
  provider: string;
  providerStatus?: number | null;
  accountLevel: boolean;
  retryable: boolean;
  rawMessage: string;
};

function providerLabel(provider: MailDeliveryProvider) {
  const p = String(provider || "").toLowerCase();
  if (p === "microsoft" || p === "outlook") return "Outlook";
  if (p === "gmail" || p === "google") return "Gmail";
  if (p === "imap" || p === "smtp") return "SMTP";
  return "Messagerie";
}

function rawToString(value: unknown): string {
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value || "");
  }
}

function extractProviderStatus(raw: string, explicit?: number | null) {
  if (Number.isFinite(Number(explicit))) return Number(explicit);
  const match = /\b(?:HTTP|status|impossible)\s*\(?\s*(4\d\d|5\d\d)\)?/i.exec(raw) || /\((4\d\d|5\d\d)\)/.exec(raw);
  return match?.[1] ? Number(match[1]) : null;
}

function hasAny(rawLower: string, patterns: string[]) {
  return patterns.some((pattern) => rawLower.includes(pattern));
}

export function normalizeMailDeliveryError(input: unknown, provider?: MailDeliveryProvider, status?: number | null): NormalizedMailDeliveryError {
  if (input instanceof MailProviderSendError) {
    return input.normalized;
  }

  const rawMessage = rawToString(input).trim();
  const rawLower = rawMessage.toLowerCase();
  const statusCode = extractProviderStatus(rawMessage, status);
  const label = providerLabel(provider);

  const build = (patch: Omit<NormalizedMailDeliveryError, "provider" | "providerStatus" | "rawMessage">): NormalizedMailDeliveryError => ({
    provider: label,
    providerStatus: statusCode,
    rawMessage,
    ...patch,
  });

  if (hasAny(rawLower, ["erroraccountsuspend", "account suspended", "verdict is suspend", "wascl useraction", "account is suspended"])) {
    return build({
      kind: "account_blocked",
      title: `Compte ${label} temporairement bloqué`,
      message: `Compte ${label} temporairement bloqué. Connectez-vous à la boîte d’envoi, suivez la vérification demandée, puis relancez la campagne.`,
      action: "Vérifiez la boîte d’envoi côté fournisseur, puis relancez les échecs.",
      accountLevel: true,
      retryable: false,
    });
  }

  if (
    statusCode === 401 ||
    hasAny(rawLower, [
      "invalid_grant",
      "interaction_required",
      "invalidauthenticationtoken",
      "invalid authentication token",
      "token expired",
      "expired token",
      "invalid token",
      "jeton",
      "oauth",
      "authentification",
      "authentication unsuccessful",
      "535 5.7",
      "invalid login",
      "username and password not accepted",
    ])
  ) {
    return build({
      kind: "auth_required",
      title: `Connexion ${label} à actualiser`,
      message: `La connexion ${label} doit être actualisée avant de pouvoir envoyer. Reconnectez la boîte d’envoi dans les réglages Mails, puis relancez l’envoi.`,
      action: "Reconnectez la boîte d’envoi.",
      accountLevel: true,
      retryable: false,
    });
  }

  if (
    statusCode === 403 &&
    hasAny(rawLower, ["mail.send", "accessdenied", "access denied", "insufficient", "forbidden", "not authorized", "permission"])
  ) {
    return build({
      kind: "permission_denied",
      title: `Autorisation ${label} insuffisante`,
      message: `La boîte ${label} n’autorise pas l’envoi depuis iNrCy. Reconnectez la boîte en acceptant les autorisations demandées, puis relancez l’envoi.`,
      action: "Reconnectez la boîte avec les autorisations d’envoi.",
      accountLevel: true,
      retryable: false,
    });
  }

  if (hasAny(rawLower, ["daily user sending limit exceeded", "user-rate limit exceeded", "quota exceeded", "send quota", "sending limit", "too many messages", "rate limit", "throttl"])) {
    return build({
      kind: rawLower.includes("rate") || rawLower.includes("throttl") ? "rate_limited" : "quota_exceeded",
      title: `Limite d’envoi ${label} atteinte`,
      message: `La limite d’envoi de cette boîte ${label} est atteinte pour le moment. Attendez le délai imposé par le fournisseur, puis relancez les échecs.`,
      action: "Attendez le délai fournisseur avant de relancer.",
      accountLevel: true,
      retryable: true,
    });
  }

  if (hasAny(rawLower, ["message too large", "size limit", "request entity too large", "maximum message size", "attachment size", "payload too large", "552 5.3.4"])) {
    return build({
      kind: "attachment_too_large",
      title: "Message trop lourd",
      message: "Le mail ou ses pièces jointes sont trop lourds pour cette boîte d’envoi. Réduisez les fichiers joints, puis réessayez.",
      action: "Réduisez les pièces jointes.",
      accountLevel: false,
      retryable: false,
    });
  }

  if (hasAny(rawLower, ["invalid recipient", "invalidrecipients", "recipient address rejected", "user unknown", "mailbox unavailable", "recipient not found", "address not found", "550 5.1.1", "550 5.4.1"])) {
    return build({
      kind: "invalid_recipient",
      title: "Adresse destinataire invalide",
      message: "Adresse destinataire invalide ou introuvable. Vérifiez l’adresse email avant de relancer ce contact.",
      action: "Corrigez l’adresse email.",
      accountLevel: false,
      retryable: false,
    });
  }

  if (hasAny(rawLower, ["blocked", "blacklist", "spam", "complaint", "policy violation", "rejected as spam", "550 5.7.1"])) {
    return build({
      kind: "blocked_recipient",
      title: "Envoi refusé par le serveur destinataire",
      message: "Le serveur du destinataire a refusé ce mail. Vérifiez l’adresse, le contenu du message ou contactez le destinataire si nécessaire.",
      action: "Vérifiez le destinataire et le contenu.",
      accountLevel: false,
      retryable: false,
    });
  }

  if (hasAny(rawLower, ["configuration smtp", "configuration", "smtp settings", "boîte d’envoi manquante", "introuvable", "non connectée", "needs_update", "doit être actualisée"])) {
    return build({
      kind: "configuration",
      title: "Boîte d’envoi à vérifier",
      message: "La boîte d’envoi n’est pas correctement configurée. Vérifiez les réglages Mails, puis réessayez.",
      action: "Vérifiez les réglages Mails.",
      accountLevel: true,
      retryable: false,
    });
  }

  if (statusCode === 429 || statusCode === 503 || statusCode === 504 || hasAny(rawLower, ["timeout", "etimedout", "econnreset", "econnrefused", "enotfound", "temporarily unavailable", "service unavailable"])) {
    return build({
      kind: "provider_unavailable",
      title: `${label} temporairement indisponible`,
      message: `${label} ne répond pas correctement pour le moment. Réessayez dans quelques minutes.`,
      action: "Réessayez dans quelques minutes.",
      accountLevel: false,
      retryable: true,
    });
  }

  return build({
    kind: "unknown",
    title: "Envoi impossible",
    message: "Le mail n’a pas pu être envoyé pour le moment. Vérifiez la boîte d’envoi et réessayez.",
    action: "Vérifiez la boîte d’envoi.",
    accountLevel: statusCode === 401 || statusCode === 403,
    retryable: !statusCode || statusCode >= 500,
  });
}

export class MailProviderSendError extends Error {
  normalized: NormalizedMailDeliveryError;

  constructor(normalized: NormalizedMailDeliveryError) {
    super(normalized.message);
    this.name = "MailProviderSendError";
    this.normalized = normalized;
  }

  get kind() {
    return this.normalized.kind;
  }

  get accountLevel() {
    return this.normalized.accountLevel;
  }

  get retryable() {
    return this.normalized.retryable;
  }
}

export function createMailProviderSendError(input: unknown, provider?: MailDeliveryProvider, status?: number | null) {
  return new MailProviderSendError(normalizeMailDeliveryError(input, provider, status));
}

export function getUserFacingMailError(input: unknown, provider?: MailDeliveryProvider, status?: number | null) {
  return normalizeMailDeliveryError(input, provider, status).message;
}

export function isAccountLevelMailError(input: unknown, provider?: MailDeliveryProvider, status?: number | null) {
  return normalizeMailDeliveryError(input, provider, status).accountLevel;
}
