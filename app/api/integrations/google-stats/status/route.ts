import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function normStatus(s: any) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = authData.user.id;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const product = searchParams.get("product");

  if (!source || !product) return NextResponse.json({ error: "Missing source/product" }, { status: 400 });

  // 1) nouveau système
  const { data, error } = await supabase
    .from("stats_integrations")
    .select("status,email_address,expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("source", source)
    .eq("product", product)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "DB error" }, { status: 500 });

  let connected = !!data && data.status === "connected";

  // 2) legacy override
  try {
    const { data: l } = await supabase
      .from("integrations_statistiques")
      .select("statut")
      .eq("id_utilisateur", userId)
      .eq("fournisseur", "Google")
      .eq("source", source)
      .eq("produit", product)
      .order("identifiant", { ascending: false })
      .limit(1)
      .maybeSingle();
    const st = normStatus((l as any)?.statut);
    if (st.includes("deconnect") || st.includes("disconnected")) connected = false;
  } catch {}

  return NextResponse.json({ connected, data: data ?? null });
}
