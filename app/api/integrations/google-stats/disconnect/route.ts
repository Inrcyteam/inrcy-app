import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

async function purgeStatsCache(supabase: any, userId: string) {
  try {
    await supabase.from("stats_cache").delete().eq("user_id", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("id_utilisateur", userId);
  } catch {}
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = authData.user.id;
  const body = await request.json().catch(() => ({}));
  const source = body?.source;
  const product = body?.product;

  if (!source || !product) return NextResponse.json({ error: "Missing source/product" }, { status: 400 });

  // Nouveau système
  try {
    await supabase
      .from("stats_integrations")
      .update({ status: "disconnected", access_token_enc: null, expires_at: null })
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", source)
      .eq("product", product);
  } catch {}

  // Legacy
  try {
    await supabase
      .from("integrations_statistiques")
      .update({ statut: "déconnecté" })
      .eq("id_utilisateur", userId)
      .eq("fournisseur", "Google")
      .eq("source", source)
      .eq("produit", product);
  } catch {}

  await purgeStatsCache(supabase, userId);

  return NextResponse.json({ ok: true });
}
