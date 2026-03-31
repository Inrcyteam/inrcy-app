import "server-only";

import type { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";

export async function requireUser() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return {
      supabase: null as any,
      user: null as any,
      errorResponse: jsonUserFacingError("Votre session a expiré. Merci de vous reconnecter.", { status: 401, code: "auth_required" }),
    };
  }

  return { supabase, user: data.user, errorResponse: null as NextResponse | null };
}
