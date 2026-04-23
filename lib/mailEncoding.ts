const MOJIBAKE_RE = /(?:Ã.|Â.|â€|â€™|â€œ|â€�|â€“|â€”|Ãƒ|Ã¢|ðŸ)/;

function latin1BytesFromString(value: string) {
  const chars = Array.from(String(value || ""));
  return Uint8Array.from(chars.map((char) => char.charCodeAt(0) & 0xff));
}

function mojibakeScore(value: string) {
  if (!value) return 0;
  const matches = value.match(/(?:Ã.|Â.|â€|â€™|â€œ|â€�|â€“|â€”|Ãƒ|Ã¢|ðŸ)/g);
  return matches ? matches.length : 0;
}

export function looksLikeMojibake(value: string) {
  return MOJIBAKE_RE.test(String(value || ""));
}

export function repairCommonMojibake(value: string, maxPasses = 2) {
  let current = String(value || "");
  if (!current) return current;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (!looksLikeMojibake(current)) break;

    let decoded = current;
    try {
      decoded = new TextDecoder("utf-8", { fatal: false }).decode(latin1BytesFromString(current));
    } catch {
      break;
    }

    if (!decoded || decoded === current) break;

    const currentScore = mojibakeScore(current);
    const decodedScore = mojibakeScore(decoded);
    const currentReplacementCount = (current.match(/�/g) || []).length;
    const decodedReplacementCount = (decoded.match(/�/g) || []).length;

    if (decodedScore > currentScore && decodedReplacementCount >= currentReplacementCount) {
      break;
    }

    current = decoded;
  }

  return current;
}

function normalizeSubjectTypography(value: string) {
  return value
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, " - ")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ");
}

export function normalizeMailSubject(value: string) {
  return normalizeSubjectTypography(repairCommonMojibake(String(value || ""))).trim();
}
