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
        inrcy_site: states.site_inrcy.connected,
        site_web: states.site_web.connected,
        gmb: states.gmb.connected,
        facebook: states.facebook.connected,
        instagram: states.instagram.connected,
        linkedin: states.linkedin.connected,
      },
    });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
