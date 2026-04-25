import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";

export async function GET() {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const states = await getChannelConnectionStates(supabase, user.id);
    return NextResponse.json({
      channels: {
        inrcy_site: states.site_inrcy.connected && states.site_inrcy.statsConnected,
        site_web: states.site_web.connected && states.site_web.statsConnected,
        gmb: states.gmb.connected && !states.gmb.requiresUpdate,
        facebook: states.facebook.connected && !states.facebook.requiresUpdate,
        instagram: states.instagram.connected && !states.instagram.requiresUpdate,
        linkedin: states.linkedin.connected && !states.linkedin.requiresUpdate,
      },
    });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}
