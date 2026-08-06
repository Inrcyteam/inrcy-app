export type MetaGraphErrorDescriptor = {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  subcode?: unknown;
  httpStatus?: unknown;
};

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizedText(error: MetaGraphErrorDescriptor): string {
  return [error.message, error.type]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Meta uses OAuthException for several non-authentication failures too.
 * In particular, code 4 / subcode 2207051 is an application/activity limit:
 * reconnecting the account cannot fix it and must never be suggested.
 */
export function isMetaRateLimitError(
  error: MetaGraphErrorDescriptor,
): boolean {
  const code = finiteNumber(error.code);
  const subcode = finiteNumber(error.subcode);
  const httpStatus = finiteNumber(error.httpStatus);
  const text = normalizedText(error);

  return (
    httpStatus === 429 ||
    [4, 17, 32, 613].includes(code || 0) ||
    subcode === 2207051 ||
    /application request limit|user request limit|rate[ -]?limit|too many requests|quota/.test(
      text,
    )
  );
}

export function isMetaAuthorizationError(
  error: MetaGraphErrorDescriptor,
): boolean {
  if (isMetaRateLimitError(error)) return false;

  const code = finiteNumber(error.code);
  const httpStatus = finiteNumber(error.httpStatus);
  const text = normalizedText(error);

  return (
    httpStatus === 401 ||
    [10, 190, 200].includes(code || 0) ||
    /access token|not authori[sz]ed|authori[sz]ation|permission|session.*expired|token.*expired|invalid.*token/.test(
      text,
    )
  );
}
