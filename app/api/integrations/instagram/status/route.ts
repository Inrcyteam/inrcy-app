import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ connected: false, accountConnected: false, requiresUpdate: false, connection_status: "disconnected" }, { status: 200 });

  const states = await getChannelConnectionStates(supabase, authData.user.id);
  return NextResponse.json(states.instagram);
}
