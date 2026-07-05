import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return NextResponse.json({ connected: false, accountConnected: false, requiresUpdate: false, connection_status: "disconnected" }, { status: 200 });
  const activeUserId = await resolveActiveInrcyAccountId(supabase, authData.user.id);

  const states = await getChannelConnectionStates(supabase, activeUserId);
  return NextResponse.json(states.linkedin);
}
