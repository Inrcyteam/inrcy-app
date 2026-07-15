import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { withApi } from "@/lib/observability/withApi";
import {
  getBoosterGenerationContext,
  invalidateBoosterGenerationContext,
  type BoosterGenerationContextScope,
} from "@/lib/boosterGenerationContext";

export const maxDuration = 30;

function normalizeScope(value: unknown): BoosterGenerationContextScope {
  if (value === "professional" || value === "publications") return value;
  return "all";
}

const getHandler = async () => {
  const startedAt = Date.now();
  const { supabase, activeUserId, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const context = await getBoosterGenerationContext({
    supabase,
    userId: activeUserId,
  });

  console.info("[booster-generation-context] prewarm", {
    userId: activeUserId,
    professionalSource: context.cacheSource.professional,
    publicationsSource: context.cacheSource.publications,
    totalMs: Date.now() - startedAt,
  });

  return NextResponse.json(
    {
      ok: true,
      ready: true,
      cacheSource: context.cacheSource,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};

const deleteHandler = async (req: Request) => {
  const { activeUserId, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = (await req.json().catch(() => ({}))) as { scope?: unknown };
  const scope = normalizeScope(body.scope);
  await invalidateBoosterGenerationContext(activeUserId, scope);

  return NextResponse.json(
    { ok: true, scope },
    { headers: { "Cache-Control": "no-store" } },
  );
};

export const GET = withApi(getHandler, {
  route: "/api/booster/generation-context",
});
export const DELETE = withApi(deleteHandler, {
  route: "/api/booster/generation-context",
});
