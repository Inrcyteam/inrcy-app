export function getSimpleFrenchErrorMessage(input: unknown, fallback = "Une erreur est survenue. Merci de réessayer."): string {
  const raw = normalizeRawMessage(input);
  if (!raw) return fallback;

  const message = raw.toLowerCase();

  if (matches(message, ["fetch_failed:429", "summary_failed:429", "rate limit", "rate-limit", "too many requests", "quota exceeded", "quotas atteints", "quota backend unavailable", "rate limiter unavailable", "too_many_requests", "resource_exhausted"])) {
    return "Quotas atteints, merci de réessayer dans quelques minutes.";
  }

  if (matches(message, ["fetch_failed:501", "summary_failed:501", "501", "not implemented"])) {
    return "Cette action n'est pas encore disponible.";
  }

  if (matches(message, ["failed to fetch", "networkerror", "network request failed", "load failed", "fetch failed", "impossible de joindre le serveur", "network error", "econnreset", "econnrefused", "enotfound", "socket hang up"])) {
    return "Connexion au serveur impossible pour le moment. Merci de réessayer.";
  }

  if (matches(message, ["timeout", "timed out", "deadline exceeded", "aborterror"])) {
    return "Le serveur met trop de temps à répondre. Merci de réessayer.";
  }

  if (matches(message, ["401", "unauthorized", "not authenticated", "non authentifi", "session", "jwt expired", "refresh token", "auth session missing", "invalid refresh token"])) {
    return "Votre session a expiré. Merci de vous reconnecter.";
  }

  if (matches(message, ["403", "forbidden", "access denied", "origin not allowed", "non autoris"])) {
    return "Vous n'avez pas l'autorisation pour effectuer cette action.";
  }

  if (matches(message, ["404", "not found", "introuvable", "missing id", "aucun abonnement stripe trouvé"])) {
    return "L'information demandée est introuvable.";
  }

  if (matches(message, ["409", "already", "already exists", "duplicate", "conflit"])) {
    return "Cette action est déjà en cours ou a déjà été effectuée.";
  }

  if (matches(message, ["422", "unprocessable", "invalid", "body json invalide", "bad request", "missing channels", "missing idea", "email manquant", "plan invalide", "aucune ligne importable", "renseigne ", "json invalide", "missing accountid", "missing to", "missing email", "missing domain", "missing token", "missing access token", "missing imageurl", "missing iguserid", "smtp config missing", "site url invalid or missing", "invalid token", "invalid source", "filereader error", "impossible de lire ce fichier", "format du jeton invalide", "signature du jeton invalide", "contenu du jeton invalide", "lien d'accès est invalide", "port invalide", "numéro de port", "configuration smtp incomplète", "configuration d'envoi de la messagerie est incomplète"])) {
    return "Certaines informations sont manquantes ou incorrectes.";
  }

  if (matches(message, ["500", "502", "503", "504", "server error", "internal server error", "unknown error", "unknown", "unhandled", "db read failed", "db insert failed", "db upsert failed", "userinfo fetch failed", "oauth callback failed", "oauth_config_missing", "oauth_callback_failed", "invalid_state", "missing_state", "token_exchange_failed", "openai", "stripe error", "webhook error"])) {
    return "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes.";
  }

  if (matches(message, ["invalid login credentials", "email not confirmed", "invalid credentials"])) {
    return "Identifiants incorrects. Vérifiez vos informations puis réessayez.";
  }

  if (matches(message, ["email rate limit exceeded", "over_email_send_rate_limit", "email link is invalid or has expired", "otp expired"])) {
    return "Le lien n'est plus valide ou l'envoi est temporairement limité. Merci de réessayer dans quelques minutes.";
  }

  if (matches(message, ["photo upload failed", "facebook feed post failed", "linkedin publish failed", "gmb create post error", "instagram", "publish error", "performance api error", "runreport failed", "gsc query failed", "microsoft send failed", "imap send failed", "token refresh failed", "db update failed", "google business", "facebook", "linkedin", "mail account not found", "missing_access_token"])) {
    return "L'action demandée n'a pas pu être finalisée pour le moment. Merci de réessayer.";
  }

  if (looksTechnical(raw)) {
    return fallback;
  }

  return sanitizeSentence(raw);
}

export async function getSimpleFrenchApiError(res: Response, fallback?: string): Promise<string> {
  try {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await res.clone().json().catch(() => null) as any;
      return getSimpleFrenchErrorMessage(json?.user_message || json?.error || json?.message || `${res.status}`, fallbackForStatus(res.status, fallback));
    }
    const text = await res.clone().text().catch(() => "");
    return getSimpleFrenchErrorMessage(text || `${res.status}`, fallbackForStatus(res.status, fallback));
  } catch {
    return fallbackForStatus(res.status, fallback);
  }
}

export function fallbackForStatus(status?: number, fallback?: string): string {
  if (fallback) return fallback;
  if (status === 429) return "Quotas atteints, merci de réessayer dans quelques minutes.";
  if (status === 501) return "Cette action n'est pas encore disponible.";
  if (status === 401) return "Votre session a expiré. Merci de vous reconnecter.";
  if (status === 403) return "Vous n'avez pas l'autorisation pour effectuer cette action.";
  if (status === 404) return "L'information demandée est introuvable.";
  if (status && status >= 500) return "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes.";
  return "Une erreur est survenue. Merci de réessayer.";
}

function normalizeRawMessage(input: unknown): string {
  if (typeof input === "string") return input.trim();
  if (input instanceof Error) return String(input.message || "").trim();
  if (input && typeof input === "object") {
    const msg = (input as any).message || (input as any).error || (input as any).statusText;
    if (typeof msg === "string") return msg.trim();
  }
  return "";
}

function sanitizeSentence(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Une erreur est survenue. Merci de réessayer.";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function matches(message: string, needles: string[]) {
  return needles.some((needle) => message.includes(needle));
}

function looksTechnical(raw: string) {
  return /(^http\s?\d+$)|(<!doctype|<html|stack|trace|sql|postgres|supabase|oauth|jwt|token|unexpected token|syntaxerror|typeerror|referenceerror|filereader|openai_api_key|access token|client_secret|client_id|\{.*\}|\[object object\])/i.test(raw);
}
