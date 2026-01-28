import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const product = searchParams.get("product");

  if (!source || !product) return NextResponse.json({ error: "Missing source/product" }, { status: 400 });

  const { data, error } = await supabase
    .from("stats_integrations")
    .select("status,email_address,expires_at")
    .eq("user_id", authData.user.id)
    .eq("provider", "google")
    .eq("source", source)
    .eq("product", product)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "DB error" }, { status: 500 });
  return NextResponse.json({ connected: !!data && data.status === "connected", data: data ?? null });
}
