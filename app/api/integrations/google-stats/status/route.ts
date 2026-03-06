import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";

export async function GET(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const product = searchParams.get("product");
  if (!source || !product) return NextResponse.json({ error: "Missing source/product" }, { status: 400 });

  const states = await getChannelConnectionStates(supabase, authData.user.id);

  let connected = false;
  if (source === "site_inrcy" && product === "ga4") connected = states.site_inrcy.ga4;
  if (source === "site_inrcy" && product === "gsc") connected = states.site_inrcy.gsc;
  if (source === "site_web" && product === "ga4") connected = states.site_web.ga4;
  if (source === "site_web" && product === "gsc") connected = states.site_web.gsc;

  return NextResponse.json({ connected });
}
