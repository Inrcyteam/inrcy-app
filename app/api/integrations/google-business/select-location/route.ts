import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { invalidateUserIntegrationCaches, mergeProToolSettings } from "@/lib/integrationSync";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

    const accountName = String(body.accountName || "").trim();
    const locationName = String(body.locationName || "").trim();
    const locationTitle = String(body.locationTitle || "").trim() || null;
    const gmbUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationTitle || locationName)}`;

    if (!accountName || !locationName) {
      return NextResponse.json({ error: "Missing accountName/locationName" }, { status: 400 });
    }

    const { error: upErr } = await supabase
      .from("integrations")
      .update({
        resource_id: locationName,
        resource_label: locationTitle,
        meta: { account: accountName },
        status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb");

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    try {
      await mergeProToolSettings(supabase, userId, "gmb", {
        connected: true,
        accountName,
        locationName,
        locationTitle,
        url: gmbUrl,
      });
    } catch {}

    await invalidateUserIntegrationCaches(supabase, userId);
    return NextResponse.json({ ok: true, url: gmbUrl });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Erreur" }, { status: 500 });
  }
}
