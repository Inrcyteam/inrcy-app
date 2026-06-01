import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { readTiktokSettings } from "@/lib/tiktokRouteStorage";

export async function GET() {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const states = await getChannelConnectionStates(supabase, user.id);
    const { tiktok } = await readTiktokSettings(supabase, user.id);
    const tiktokConnected = Boolean(tiktok.connected && tiktok.accountConnected);
    return NextResponse.json({
      channels: {
        inrcy_site: states.site_inrcy.connected,
        site_web: states.site_web.connected,
        gmb: states.gmb.connected && !states.gmb.requiresUpdate,
        facebook: states.facebook.connected && !states.facebook.requiresUpdate,
        instagram: states.instagram.connected && !states.instagram.requiresUpdate,
        linkedin: states.linkedin.connected && !states.linkedin.requiresUpdate,
        tiktok: tiktokConnected,
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
          label: states.gmb.resource_label || states.gmb.email || states.gmb.url,
          href: states.gmb.url,
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
          type: states.linkedin.organization_id ? "page" : "profile",
          label: states.linkedin.organization_id
            ? (states.linkedin.organization_name || states.linkedin.organization_url)
            : (states.linkedin.display_name || states.linkedin.profile_url),
          href: states.linkedin.organization_id
            ? states.linkedin.organization_url
            : states.linkedin.profile_url,
        },
        tiktok: {
          type: "account",
          label: tiktok.username || tiktok.profileUrl,
          href: tiktok.profileUrl,
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}
