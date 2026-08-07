import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanExecutionIdempotencyKey } from "@/lib/executionIdempotency";
import { readAsyncPublicationStatus } from "@/lib/boosterAsyncPublication";
import { withApi } from "@/lib/observability/withApi";

export const runtime = "nodejs";

const PUBLISH_IDEMPOTENCY_SCOPE = "booster_publish";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function noStoreJson(
  body: Record<string, unknown>,
  init?: { status?: number },
) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

const handler = async (request: Request) => {
  const { authUserId, activeUserId, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const limited = await enforceRateLimit({
    name: "booster_publication_recovery",
    identifier: authUserId,
    limit: 90,
    fallbackLimit: 90,
    window: "2 m",
    failClosed: false,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const idempotencyKey = cleanExecutionIdempotencyKey(
    url.searchParams.get("idempotencyKey"),
  );
  if (!idempotencyKey || !idempotencyKey.startsWith("booster_manual:")) {
    return noStoreJson(
      {
        ok: false,
        code: "invalid_publication_recovery_key",
        error: "Reçu de publication invalide.",
      },
      { status: 400 },
    );
  }

  const lockResult = await supabaseAdmin
    .from("execution_idempotency_locks")
    .select("status,result,metadata")
    .eq("user_id", activeUserId)
    .eq("scope", PUBLISH_IDEMPOTENCY_SCOPE)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (lockResult.error) throw lockResult.error;
  if (!lockResult.data) {
    return noStoreJson(
      {
        ok: true,
        status: "pending",
        idempotencyKey,
      },
      { status: 202 },
    );
  }

  const lock = asRecord(lockResult.data);
  const result = asRecord(lock.result);
  const metadata = asRecord(lock.metadata);
  const publicationId = String(
    result.publication_id ||
      result.publicationId ||
      metadata.publicationId ||
      "",
  ).trim();

  if (/^[0-9a-f-]{36}$/i.test(publicationId)) {
    const publicationStatus = await readAsyncPublicationStatus({
      userId: activeUserId,
      publicationId,
    });
    if (publicationStatus) {
      console.warn("[booster-publication-recovery] durable status recovered", {
        publicationId,
        idempotencyKey,
        done: publicationStatus.done === true,
      });
      return noStoreJson({
        ...publicationStatus,
        recoveredAfterTransportLoss: true,
        idempotencyKey,
      });
    }
  }

  if (String(lock.status || "") === "completed" && Object.keys(result).length) {
    console.warn("[booster-publication-recovery] completed result recovered", {
      publicationId: publicationId || null,
      idempotencyKey,
    });
    return noStoreJson({
      ...result,
      ok: result.ok !== false,
      recoveredAfterTransportLoss: true,
      idempotencyKey,
    });
  }

  if (String(lock.status || "") === "failed") {
    return noStoreJson(
      {
        ...result,
        ok: false,
        code: String(result.code || "publication_failed"),
        error: String(
          result.error || "La publication n’a pas pu être finalisée.",
        ),
        idempotencyKey,
      },
      { status: 409 },
    );
  }

  return noStoreJson(
    {
      ok: true,
      status: "pending",
      publication_id: publicationId || null,
      idempotencyKey,
    },
    { status: 202 },
  );
};

export const GET = withApi(handler, {
  route: "/api/booster/publications/recover",
});
