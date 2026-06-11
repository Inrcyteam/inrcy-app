import "server-only";

import type { NextResponse } from "next/server";
import { isAuthorizedCronRequest, getCronUserIdFromRequest } from "@/lib/cronAuth";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";

export type InrAgentResolvedRequest = {
  supabase: any;
  user: { id: string; email?: string | null };
  userId: string;
  body: Record<string, unknown> | null;
  isCron: boolean;
  errorResponse: NextResponse | null;
};

function asBodyRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function resolveInrAgentActionRequest(request: Request): Promise<InrAgentResolvedRequest> {
  const body = asBodyRecord(await request.json().catch(() => null));
  const cronUserId = isAuthorizedCronRequest(request) ? getCronUserIdFromRequest(request, body) : "";

  if (cronUserId) {
    return {
      supabase: supabaseAdmin,
      user: { id: cronUserId },
      userId: cronUserId,
      body,
      isCron: true,
      errorResponse: null,
    };
  }

  if (isAuthorizedCronRequest(request)) {
    return {
      supabase: null,
      user: { id: "" },
      userId: "",
      body,
      isCron: true,
      errorResponse: jsonUserFacingError("Utilisateur iNr’Agent invalide pour le cron.", { status: 400, code: "invalid_cron_user" }),
    };
  }

  const { supabase, user, errorResponse } = await requireUser();
  return {
    supabase,
    user,
    userId: user?.id || "",
    body,
    isCron: false,
    errorResponse,
  };
}
