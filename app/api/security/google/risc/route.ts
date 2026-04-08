import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { getRequestId } from "@/lib/observability/request";
import { log } from "@/lib/observability/logger";
import {
  extractSecurityEventToken,
  verifyGoogleSecurityEventToken,
  persistGoogleRiscEvent,
  decodeGoogleSecurityEventTokenUnsafe,
} from "@/lib/security/googleRisc";
import { asRecord, safeErrorMessage } from "@/lib/tsSafe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async (req: Request) => {
  const requestId = getRequestId(req);

  if (process.env.GOOGLE_RISC_RECEIVER_ENABLED !== "1") {
    log.warn("google_risc_receiver_disabled", { request_id: requestId });
    return NextResponse.json({ ok: false, error: "receiver_disabled" }, { status: 503 });
  }

  const rawBody = await req.text();
  const token = extractSecurityEventToken(rawBody);
  if (!token) {
    log.warn("google_risc_missing_token", { request_id: requestId });
    return NextResponse.json({ ok: false, error: "missing_security_event_token" }, { status: 400 });
  }

  try {
    const verified = await verifyGoogleSecurityEventToken(token);
    const outcome = await persistGoogleRiscEvent({ verified, rawToken: token, requestId });

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        action: outcome.action,
        duplicate: outcome.duplicate,
        event_types: outcome.eventTypes,
        matched_integrations: outcome.integrationIds.length,
      },
      { status: outcome.duplicate ? 200 : 202 }
    );
  } catch (e) {
    const message = safeErrorMessage(e);
    let unsafe: ReturnType<typeof decodeGoogleSecurityEventTokenUnsafe> | null = null;
    try {
      unsafe = decodeGoogleSecurityEventTokenUnsafe(token);
    } catch {
      unsafe = null;
    }

    const unsafePayload = asRecord(unsafe?.payload);
    const unsafeHeader = asRecord(unsafe?.header);

    log.warn("google_risc_invalid_token", {
      request_id: requestId,
      error_message: message,
      event_types: Object.keys(asRecord(unsafePayload.events)),
      iss: unsafePayload.iss,
      aud: unsafePayload.aud,
      kid: unsafeHeader.kid,
    });

    return NextResponse.json({ ok: false, error: "invalid_security_event_token" }, { status: 400 });
  }
}, { route: "/api/security/google/risc" });
