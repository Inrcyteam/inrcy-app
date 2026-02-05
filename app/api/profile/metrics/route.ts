import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * /api/profile/metrics
 *
 * Returns the two business levers used by iNr'Stats:
 * - avg_basket (panier moyen)
 * - lead_conversion_rate (taux de conversion)
 */

function num(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = authData.user.id;
    const { data, error } = await supabase
      .from("profiles")
      .select("avg_basket, lead_conversion_rate")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Defaults match your Profil reset hint.
    const avg_basket = num(data?.avg_basket, 250);
    const lead_conversion_rate = num(data?.lead_conversion_rate, 20);

    return NextResponse.json({ avg_basket, lead_conversion_rate });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
