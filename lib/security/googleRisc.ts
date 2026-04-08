import "server-only";

import { createPublicKey, createVerify, type JsonWebKey } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { asRecord, asString, safeErrorMessage } from "@/lib/tsSafe";
import { log } from "@/lib/observability/logger";

const GOOGLE_RISC_CONFIG_URL = "https://accounts.google.com/.well-known/risc-configuration";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

type JwtPayloadLike = {
  iss?: unknown;
  aud?: unknown;
  iat?: unknown;
  jti?: unknown;
  events?: unknown;
  [key: string]: unknown;
};

type JwtHeaderLike = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
  [key: string]: unknown;
};

type GoogleJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
  kty?: string;
};

export type GoogleRiscVerificationResult = {
  payload: JwtPayloadLike;
  header: JwtHeaderLike;
  events: GoogleRiscEvent[];
  jti: string | null;
  iat: number | null;
  iss: string | null;
  aud: string | string[] | null;
};

export type GoogleRiscEvent = {
  type: string;
  subjectType: string | null;
  providerAccountId: string | null;
  issuer: string | null;
  tokenType: string | null;
  tokenIdentifierAlg: string | null;
  tokenIdentifier: string | null;
  raw: Record<string, unknown>;
};

export type GoogleRiscAction = {
  integrationIds: string[];
  providerAccountIds: string[];
  matchedBy: "provider_account_id" | "email_address" | "none";
  action: "logged_only" | "reauth_required";
  eventTypes: string[];
};

function getAllowedAudiences(): string[] {
  const raw = [process.env.GOOGLE_CLIENT_ID || "", process.env.GOOGLE_RISC_AUDIENCES || ""]
    .filter(Boolean)
    .join(",");

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );
}

function isSevereEventType(eventType: string): boolean {
  return [
    "https://schemas.openid.net/secevent/risc/event-type/sessions-revoked",
    "https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked",
    "https://schemas.openid.net/secevent/risc/event-type/account-disabled",
    "https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required",
  ].includes(eventType);
}

async function getGoogleRiscConfig(): Promise<{ issuer: string; jwks_uri: string }> {
  const res = await fetch(GOOGLE_RISC_CONFIG_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`google_risc_config_http_${res.status}`);
  const data = (await res.json()) as unknown;
  const rec = asRecord(data);
  const issuer = asString(rec["issuer"]);
  const jwks_uri = asString(rec["jwks_uri"]);
  if (!issuer || !jwks_uri) throw new Error("google_risc_config_invalid");
  return { issuer, jwks_uri };
}

function base64UrlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function parseJwtPart<T extends Record<string, unknown>>(part: string, label: string): T {
  try {
    return JSON.parse(base64UrlToBuffer(part).toString("utf8")) as T;
  } catch {
    throw new Error(`google_risc_invalid_${label}`);
  }
}

function parseJwt(token: string): { header: JwtHeaderLike; payload: JwtPayloadLike; signingInput: string; signature: Buffer } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("google_risc_invalid_jwt");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  return {
    header: parseJwtPart<JwtHeaderLike>(encodedHeader, "header"),
    payload: parseJwtPart<JwtPayloadLike>(encodedPayload, "payload"),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: base64UrlToBuffer(encodedSignature),
  };
}

async function getGoogleJwks(jwksUri: string): Promise<GoogleJwk[]> {
  const res = await fetch(jwksUri, { cache: "no-store" });
  if (!res.ok) throw new Error(`google_risc_jwks_http_${res.status}`);
  const data = (await res.json()) as unknown;
  const rec = asRecord(data);
  const keys = Array.isArray(rec["keys"]) ? (rec["keys"] as unknown[]) : [];
  return keys.map((key) => asRecord(key) as GoogleJwk);
}

function getAudienceList(aud: unknown): string[] {
  if (typeof aud === "string") return [aud];
  if (Array.isArray(aud)) return aud.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return [];
}

function verifyJwtSignature(signingInput: string, signature: Buffer, header: JwtHeaderLike, jwk: GoogleJwk): void {
  const alg = asString(header.alg);
  if (alg !== "RS256") throw new Error("google_risc_unsupported_alg");

  const keyObject = createPublicKey({ key: jwk, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingInput);
  verifier.end();
  const ok = verifier.verify(keyObject, signature);
  if (!ok) throw new Error("google_risc_invalid_signature");
}

function parseEvents(payload: JwtPayloadLike): GoogleRiscEvent[] {
  const eventsRec = asRecord(payload.events);
  return Object.entries(eventsRec).map(([type, raw]) => {
    const rawRec = asRecord(raw);
    const subject = asRecord(rawRec["subject"]);
    return {
      type,
      subjectType: asString(subject["subject_type"]),
      providerAccountId: asString(subject["sub"]),
      issuer: asString(subject["iss"]),
      tokenType: asString(subject["token_type"]),
      tokenIdentifierAlg: asString(subject["token_identifier_alg"]),
      tokenIdentifier: asString(subject["token"]),
      raw: rawRec,
    } satisfies GoogleRiscEvent;
  });
}

export function extractSecurityEventToken(rawBody: string): string | null {
  const body = String(rawBody || "").trim();
  if (!body) return null;

  if (body.startsWith("eyJ") && body.split(".").length >= 3) return body;

  try {
    const parsed = JSON.parse(body) as unknown;
    const rec = asRecord(parsed);
    return asString(rec["jwt"]) || asString(rec["token"]) || asString(rec["security_event_token"]) || null;
  } catch {
    return null;
  }
}

export async function verifyGoogleSecurityEventToken(token: string): Promise<GoogleRiscVerificationResult> {
  const audiences = getAllowedAudiences();
  if (audiences.length === 0) throw new Error("google_risc_audience_missing");

  const cfg = await getGoogleRiscConfig();
  const { header, payload, signingInput, signature } = parseJwt(token);

  const iss = asString(payload.iss);
  if (!iss || !GOOGLE_ISSUERS.has(iss) || !GOOGLE_ISSUERS.has(cfg.issuer)) {
    throw new Error("google_risc_invalid_issuer");
  }

  const audList = getAudienceList(payload.aud);
  if (!audList.some((aud) => audiences.includes(aud))) {
    throw new Error("google_risc_invalid_audience");
  }

  const kid = asString(header.kid);
  if (!kid) throw new Error("google_risc_missing_kid");

  const jwks = await getGoogleJwks(cfg.jwks_uri);
  const jwk = jwks.find((key) => key.kid === kid);
  if (!jwk) throw new Error("google_risc_signing_key_not_found");

  verifyJwtSignature(signingInput, signature, header, jwk);

  return {
    payload,
    header,
    events: parseEvents(payload),
    jti: asString(payload.jti),
    iat: typeof payload.iat === "number" ? payload.iat : null,
    iss,
    aud: typeof payload.aud === "string" || Array.isArray(payload.aud) ? (payload.aud as string | string[]) : null,
  };
}

async function insertSecurityEventLog(payload: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("security_events_google").insert(payload);
  } catch (e) {
    log.warn("google_risc_log_insert_skipped", { error_message: safeErrorMessage(e) });
  }
}

export async function persistGoogleRiscEvent(opts: {
  verified: GoogleRiscVerificationResult;
  rawToken: string;
  requestId?: string;
}) {
  const { verified, requestId } = opts;
  const eventTypes = verified.events.map((e) => e.type);
  const providerAccountIds = Array.from(
    new Set(verified.events.map((e) => e.providerAccountId).filter((v): v is string => Boolean(v)))
  );

  let integrationIds: string[] = [];
  let matchedBy: GoogleRiscAction["matchedBy"] = "none";

  if (providerAccountIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("integrations")
      .select("id,provider_account_id")
      .eq("provider", "google")
      .in("provider_account_id", providerAccountIds);

    integrationIds = Array.from(new Set((data || []).map((row: any) => String(row.id || "")).filter(Boolean)));
    matchedBy = integrationIds.length > 0 ? "provider_account_id" : "none";
  }

  const severe = verified.events.some((e) => isSevereEventType(e.type));
  const action: GoogleRiscAction["action"] = severe && integrationIds.length > 0 ? "reauth_required" : "logged_only";

  await insertSecurityEventLog({
    provider: "google",
    request_id: requestId ?? null,
    jti: verified.jti,
    iat: verified.iat,
    iss: verified.iss,
    aud: verified.aud,
    event_types: eventTypes,
    provider_account_ids: providerAccountIds,
    integration_ids: integrationIds,
    matched_by: matchedBy,
    action,
    payload: verified.payload,
    received_at: new Date().toISOString(),
  });

  if (action === "reauth_required") {
    const { data: currentRows } = await supabaseAdmin.from("integrations").select("id,meta").in("id", integrationIds);

    for (const row of currentRows || []) {
      const rec = asRecord(row);
      const meta = asRecord(rec["meta"]);
      const nextMeta = {
        ...meta,
        risc: {
          ...asRecord(meta["risc"]),
          reauth_required: true,
          last_event_types: eventTypes,
          last_jti: verified.jti,
          last_iat: verified.iat,
          last_received_at: new Date().toISOString(),
        },
      };

      await supabaseAdmin
        .from("integrations")
        .update({
          status: "expired",
          access_token_enc: null,
          refresh_token_enc: null,
          expires_at: new Date(0).toISOString(),
          meta: nextMeta,
        })
        .eq("id", String(rec["id"] || ""));
    }
  }

  log.info("google_risc_event_processed", {
    request_id: requestId,
    provider: "google",
    event_types: eventTypes,
    provider_account_ids: providerAccountIds,
    integration_ids: integrationIds,
    matched_by: matchedBy,
    action,
  });

  return {
    eventTypes,
    providerAccountIds,
    integrationIds,
    matchedBy,
    action,
  } satisfies GoogleRiscAction;
}

export function decodeGoogleSecurityEventTokenUnsafe(token: string) {
  const { header, payload } = parseJwt(token);
  return { header, payload };
}
