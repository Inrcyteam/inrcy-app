export function getSimpleFrenchErrorMessage(input: unknown, fallback = "Cette action n'a pas pu aboutir. Merci de réessayer."): string {
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

  if (matches(message, ["self-signed certificate", "self signed certificate", "certificate chain", "unable to verify the first certificate", "unable to get local issuer certificate", "hostname/ip does not match certificate", "certificate has expired", "certificate not yet valid"])) {
    return "Le serveur mail présente un certificat SSL non reconnu. Vérifiez les réglages du serveur ou réessayez avec la tolérance SSL activée.";
  }

  if (matches(message, ["authentication failed", "invalid login", "invalid credentials for smtp", "username and password not accepted", "535 5.7.1", "login failed"])) {
    return "Identifiant ou mot de passe incorrect pour ce serveur mail.";
  }

  if (matches(message, ["timeout", "timed out", "deadline exceeded", "aborterror"])) {
    return "Le serveur met trop de temps à répondre. Merci de réessayer.";
  }

  if (matches(message, ["insufficient permissions to access this data", "(#10)", "access this data"])) {
    return "Désolé, cette publication Instagram ne peut pas être supprimée depuis l'application : vérifiez la connexion Meta Business et réessayez ou supprimez-la depuis Instagram.";
  }

  if (matches(message, ["401", "unauthorized", "not authenticated", "non authentifi", "session", "jwt expired", "refresh token", "auth session missing", "invalid refresh token"])) {
    return "Votre session a expiré. Merci de vous reconnecter.";
  }

  if (matches(message, ["403", "forbidden", "access denied", "origin not allowed", "non autoris"])) {
    return "Vous n'avez pas l'autorisation pour effectuer cette action.";
  }

  if (matches(message, ["404", "not found", "introuvable", "missing id", "identifiant manquant", "aucun abonnement stripe trouvé"])) {
    return "L'information demandée est introuvable.";
  }

  if (matches(message, ["jeton expiré", "token expired", "expired token", "expired link"])) {
    return "Le lien ou l'accès a expiré. Merci de recommencer.";
  }

  if (matches(message, ["409", "already", "already exists", "duplicate", "conflit"])) {
    return "Cette action est déjà en cours ou a déjà été effectuée.";
  }

  if (matches(message, ["400", "422", "unprocessable", "invalid", "body json invalide", "bad request", "type d'action invalide", "produit inconnu", "solde ui insuffisant", "identifiant de compte manquant", "configuration serveur incomplète", "missing channels", "missing idea", "email manquant", "plan invalide", "aucune ligne importable", "renseigne ", "json invalide", "missing accountid", "missing to", "missing email", "missing domain", "missing token", "missing access token", "missing imageurl", "missing iguserid", "smtp config missing", "site url invalid or missing", "invalid token", "invalid source", "filereader error", "impossible de lire ce fichier", "format du jeton invalide", "signature du jeton invalide", "contenu du jeton invalide", "lien d'accès est invalide", "port invalide", "numéro de port", "configuration smtp incomplète", "configuration d'envoi de la messagerie est incomplète", "paramètres invalides", "parametres invalides", "organisation manquante", "source ou produit manquant", "source invalide", "produit invalide", "lien du site manquant ou invalide", "merci de renseigner l'identifiant et le mot de passe", "identifiant et mot de passe requis", "compte instagram non connecté", "compte linkedin non connecté", "compte instagram non connecte", "compte linkedin non connecte", "domaine manquant", "identifiant manquant"])) {
    return "Certaines informations sont manquantes ou incorrectes.";
  }

  if (matches(message, ["500", "502", "503", "504", "server error", "internal server error", "unknown error", "unknown", "unhandled", "db read failed", "db insert failed", "db upsert failed", "userinfo fetch failed", "oauth callback failed", "oauth_config_missing", "oauth_callback_failed", "invalid_state", "missing_state", "token_exchange_failed", "overview_failed", "openai", "stripe error", "webhook error", "stripe customer manquant", "getpublicurl returned empty", "invalid dataurl", "optimized image url unavailable", "missing openai_api_key", "bad payload", "rate limiting unavailable", "ga4 admin request failed", "gsc sites.list failed", "inrstats_opportunities_failed", "actus", "issue-token"])) {
    return "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes.";
  }


  if (matches(message, ["access_denied", "user_denied", "access denied by user", "consent denied"])) {
    return "La connexion a été annulée.";
  }

  if (matches(message, ["invalid login credentials", "email not confirmed", "invalid credentials"])) {
    return "Identifiants incorrects. Vérifiez vos informations puis réessayez.";
  }

  if (matches(message, ["email rate limit exceeded", "over_email_send_rate_limit", "email link is invalid or has expired", "otp expired"])) {
    return "Le lien n'est plus valide ou l'envoi est temporairement limité. Merci de réessayer dans quelques minutes.";
  }

  if (matches(message, ["photo upload failed", "facebook feed post failed", "linkedin publish failed", "gmb create post error", "instagram", "publish error", "performance api error", "runreport failed", "gsc query failed", "microsoft send failed", "imap send failed", "token refresh failed", "db update failed", "google business", "facebook", "linkedin", "mail account not found", "missing_access_token", "google_calendar_integration_removed", "instagram optimized image url unavailable", "storage upload", "upload failed", "signature-image", "image upload", "invalid mime type"])) {
    return "L'action demandée n'a pas pu être finalisée pour le moment. Merci de réessayer.";
  }


  if (matches(message, ["google a expiré", "connexion google expirée", "connexion google expiree"])) {
    return "La connexion Google a expiré. Merci de reconnecter votre compte.";
  }

  if (matches(message, ["compte google business invalide", "compte linkedin invalide", "connexion linkedin invalide", "boîte outlook introuvable", "boite outlook introuvable", "compte imap introuvable", "source invalide"])) {
    return "La connexion concernée n'est pas valide ou n'est plus disponible.";
  }

  if (matches(message, ["facebook n’est pas encore correctement relié", "facebook n'est pas encore correctement relie", "instagram n’est pas encore correctement relié", "instagram n'est pas encore correctement relie", "linkedin n’est pas encore correctement relié", "linkedin n'est pas encore correctement relie", "google business n’est pas encore correctement reliée", "google business n'est pas encore correctement reliee"])) {
    return "Le compte concerné n'est pas encore correctement connecté.";
  }

  if (matches(message, ["maximum 5 images", "instagram nécessite au moins 1 image", "instagram necessite au moins 1 image", "le contenu est vide"])) {
    return sanitizeSentence(raw);
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
  return "Cette action n'a pas pu aboutir. Merci de réessayer.";
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
  if (!trimmed) return "Cette action n'a pas pu aboutir. Merci de réessayer.";
  if (looksTechnical(trimmed)) return "Cette action n'a pas pu aboutir. Merci de réessayer.";
  const cleaned = trimmed
    .replace(/(^erreur\s*:?\s*)/i, "")
    .replace(/(^error\s*:?\s*)/i, "")
    .trim();
  const sentence = cleaned || "Cette action n'a pas pu aboutir. Merci de réessayer.";
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function matches(message: string, needles: string[]) {
  return needles.some((needle) => message.includes(needle));
}

function looksTechnical(raw: string) {
  return /(^http\s?\d+$)|(<!doctype|<html|stack|trace|sql|postgres|supabase|oauth|jwt|token|unexpected token|syntaxerror|typeerror|referenceerror|filereader|openai_api_key|access token|client_secret|client_id|\{.*\}|\[object object\])/i.test(raw);
}
