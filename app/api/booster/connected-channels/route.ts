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
      channelDetails: {
        inrcy_site: {
          type: "url",
          label: states.site_inrcy.url,
          href: states.site_inrcy.url,
        },
        site_web: {
          type: "url",
          label: states.site_web.url,
          href: states.site_web.url,
        },
        gmb: {
          type: "location",
          label: states.gmb.resource_label || states.gmb.email,
          href: null,
        },
        facebook: {
          type: "page",
          label: states.facebook.resource_label || states.facebook.page_url,
          href: states.facebook.page_url,
        },
        instagram: {
          type: "account",
          label: states.instagram.username,
          href: states.instagram.profile_url,
        },
        linkedin: {
          type: "profile",
          label: states.linkedin.display_name || states.linkedin.profile_url,
          href: states.linkedin.profile_url,
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}
