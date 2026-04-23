const SIGNOFF_LINE_RE = /^(?:merci(?: d['’]avance)?|merci !|cordialement|bien à vous|bien cordialement|à bientôt|a bient[oô]t|à votre disposition|au plaisir|bonne journée|bonne journee|bon week-end|bonne soirée|bonne soiree)[\s,;:!.-]*$/i;
const CONTACT_LINE_RE = /^(?:t[ée]l(?:[ée]phone)?\s*:|tel\s*:|email\s*:|e-mail\s*:|site\s*:|adresse\s*:|portable\s*:|mobile\s*:|\+?\d|📞|✉️|📍)/i;
const PLACEHOLDER_CONTACT_RE = /\{\{\s*(?:prenom|nom|nom_complet|nom_entreprise|telephone|email|adresse|code_postal|ville|site_url|facebook_url|gmb_url)\s*\}\}/i;

function normalizeLines(input: string): string[] {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
}

function isCompanyIdentityLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (CONTACT_LINE_RE.test(trimmed)) return true;
  if (PLACEHOLDER_CONTACT_RE.test(trimmed)) return true;
  if (/^\{\{\s*prenom\s*\}\}(?:\s+[—–-]\s+|\s+)\{\{\s*nom_entreprise\s*\}\}$/i.test(trimmed)) return true;
  if (/^\{\{\s*prenom\s*\}\}(?:\s+\{\{\s*nom\s*\}\})?(?:\s+[—–-]\s+\{\{\s*nom_entreprise\s*\}\})?$/i.test(trimmed)) return true;
  if (/^\{\{\s*nom_entreprise\s*\}\}(?:\s+[—–-]\s+\{\{\s*telephone\s*\}\})?$/i.test(trimmed)) return true;
  if (/^[\p{L}][\p{L}\p{M}'’ .-]{1,40}(?:\s+[—–-]\s+[\p{L}\p{M}0-9 '&.-]{2,80})?$/u.test(trimmed) && /[—–-]/.test(trimmed)) return true;
  return false;
}

export function stripTemplateSignatureBlock(body: string): string {
  const lines = normalizeLines(body);
  let end = lines.length - 1;

  while (end >= 0 && !lines[end].trim()) end -= 1;
  if (end < 0) return "";

  let start = end;
  let hasIdentity = false;
  let hasSignoff = false;

  while (start >= 0) {
    const trimmed = lines[start].trim();
    if (!trimmed) {
      if (hasIdentity || hasSignoff) {
        start -= 1;
        break;
      }
      start -= 1;
      continue;
    }

    const identity = isCompanyIdentityLine(trimmed);
    const signoff = SIGNOFF_LINE_RE.test(trimmed);

    if (!identity && !signoff) break;

    hasIdentity = hasIdentity || identity;
    hasSignoff = hasSignoff || signoff;
    start -= 1;
  }

  if (!hasIdentity) {
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const kept = lines.slice(0, start + 1).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return kept;
}
