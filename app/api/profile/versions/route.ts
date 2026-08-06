import { NextResponse } from "next/server";

import {
  PROFILE_VERSION_FIELDS,
  toProfileVersionsSnapshot,
} from "@/lib/profileVersioning";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const profileVersionsQuery = () =>
    supabaseAdmin
      .from("profiles")
      .select(PROFILE_VERSION_FIELDS.join(","))
      .eq("user_id", activeUserId)
      .maybeSingle();

  let { data, error } = await profileVersionsQuery();

  // Safe rollout: the application can be deployed just before the SQL migration.
  // Older databases do not have inrsend_version yet, so retry with the legacy
  // counters instead of breaking every realtime refresh endpoint.
  if (error && String(error.message || "").includes("inrsend_version")) {
    const legacyFields = PROFILE_VERSION_FIELDS.filter(
      (field) => field !== "inrsend_version",
    );
    const fallback = await supabaseAdmin
      .from("profiles")
      .select(legacyFields.join(","))
      .eq("user_id", activeUserId)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Impossible de vérifier les mises à jour du profil." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      user_id: activeUserId,
      versions: toProfileVersionsSnapshot(data || {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
