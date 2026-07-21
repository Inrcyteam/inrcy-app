import { NextResponse } from "next/server";

import { PROFILE_VERSION_FIELDS } from "@/lib/profileVersioning";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_VERSION_FIELDS.join(","))
    .eq("user_id", activeUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Impossible de vérifier les mises à jour du profil." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, user_id: activeUserId, versions: data || {} },
    { headers: { "Cache-Control": "no-store" } },
  );
}
