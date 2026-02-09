import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;

    // Internal channels always available.
    const base: Record<ChannelKey, boolean> = {
      inrcy_site: true,
      site_web: true,
      gmb: false,
      facebook: false,
    };

    // External channels depend on integrations + configuration (resource_id set)
    const { data: rows } = await supabase
      .from("stats_integrations")
      .select("provider,status,resource_id")
      .eq("user_id", userId)
      .in("provider", ["google", "facebook"]);

    for (const r of rows ?? []) {
      if (r.provider === "google" && r.status === "connected" && r.resource_id) base.gmb = true;
      if (r.provider === "facebook" && r.status === "connected" && r.resource_id) base.facebook = true;
    }

    return NextResponse.json({ channels: base });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
