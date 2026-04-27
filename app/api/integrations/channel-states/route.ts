import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({
      site_inrcy: { connected: false, ga4: false, gsc: false, url: null },
      site_web: { connected: false, ga4: false, gsc: false, url: null },
      gmb: { accountConnected: false, configured: false, connected: false },
      facebook: { accountConnected: false, pageConnected: false, connected: false },
      instagram: { accountConnected: false, connected: false },
      linkedin: { accountConnected: false, connected: false },
    }, { status: 200 });
  }

  const states = await getChannelConnectionStates(supabase, authData.user.id);
  return NextResponse.json(states);
}
