import crypto from "crypto";

/**
 * Only allow same-site relative paths for redirects.
 * Rejects absolute URLs and protocol-relative URLs.
 */
export function safeInternalPath(input: unknown, fallback = "/dashboard"): string {
  if (typeof input !== "string") return fallback;
  const v = input.trim();
  if (!v) return fallback;

  // Disallow protocol-relative and absolute URLs
  if (v.startsWith("//")) return fallback;
  if (/^https?:\/\//i.test(v)) return fallback;
  if (/^javascript:/i.test(v)) return fallback;

  // Must be an absolute path on this origin
  if (!v.startsWith("/")) return fallback;

  return v;
}

export function b64urlJsonEncode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

export function b64urlJsonDecode<T = any>(b64: string): T | null {
  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") || "";
  if (!raw) return null;
  const parts = raw.split(";");
  for (const p of parts) {
    const [k, ...rest] = p.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function newOAuthNonce(): string {
  return crypto.randomUUID();
}

export function oauthStateCookieName(provider: string): string {
  return `inrcy_oauth_state_${provider}`;
}

export type OAuthStateV1 = {
  v: 1;
  nonce: string;
  returnTo: string;
};

export function makeOAuthState(provider: string, returnTo: string) {
  const nonce = newOAuthNonce();
  const state: OAuthStateV1 = { v: 1, nonce, returnTo };
  return {
    stateB64: b64urlJsonEncode(state),
    nonce,
    cookieName: oauthStateCookieName(provider),
  };
}

export function verifyOAuthState(req: Request, provider: string, stateB64: string | null) {
  const cookieName = oauthStateCookieName(provider);
  const cookieNonce = getCookie(req, cookieName);
  const decoded = stateB64 ? b64urlJsonDecode<OAuthStateV1>(stateB64) : null;

  if (!decoded || decoded.v !== 1 || !decoded.nonce) {
    return { ok: false as const, cookieName, returnTo: "/dashboard", reason: "invalid_state" };
  }

  if (!cookieNonce || cookieNonce !== decoded.nonce) {
    return { ok: false as const, cookieName, returnTo: "/dashboard", reason: "state_mismatch" };
  }

  return { ok: true as const, cookieName, returnTo: decoded.returnTo };
}
