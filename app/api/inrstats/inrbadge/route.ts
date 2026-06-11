import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { isAuthorizedCronRequest, getCronUserIdFromRequest } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readInrBadgeStats } from "@/lib/inrBadgeAnalytics";

export async function GET(req: Request) {
  try {
    const cronUserId = isAuthorizedCronRequest(req) ? getCronUserIdFromRequest(req) : "";
    const supabase = cronUserId ? supabaseAdmin : await createSupabaseServer();
    let userId = cronUserId;

    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
      }
      userId = user.id;
    }

    const stats = await readInrBadgeStats(supabase, userId);
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonUserFacingError(error, { status: 500 });
  }
}
