import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const source = body?.source;
  const product = body?.product;

  if (!source || !product) return NextResponse.json({ error: "Missing source/product" }, { status: 400 });

  const { error } = await supabase
    .from("stats_integrations")
    .update({ status: "disconnected", access_token_enc: null, expires_at: null })
    .eq("user_id", authData.user.id)
    .eq("provider", "google")
    .eq("source", source)
    .eq("product", product);

  if (error) return NextResponse.json({ error: "DB error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
