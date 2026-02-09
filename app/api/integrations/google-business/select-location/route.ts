import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

    const accountName = String(body.accountName || "").trim(); // "accounts/123"
    const locationName = String(body.locationName || "").trim(); // "locations/456"
    const locationTitle = String(body.locationTitle || "").trim() || null;

    if (!accountName || !locationName) {
      return NextResponse.json({ error: "Missing accountName/locationName" }, { status: 400 });
    }

    const { error: upErr } = await supabase
      .from("stats_integrations")
      .update({
        resource_id: locationName,
        resource_label: locationTitle,
        meta: { account: accountName },
        status: "connected",
      })
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb");

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // Mirror to pro_tools_configs for UI
    try {
      const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = (scRow as any)?.settings ?? {};
      const merged = {
        ...current,
        gmb: { ...(current?.gmb ?? {}), connected: true, accountName, locationName, locationTitle },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
