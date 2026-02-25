import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { renderWithContext, buildDefaultContext } from "@/lib/templateEngine";

// POST /api/templates/render
// Body: { template_key?: string, subject_override?: string, body_override?: string }
// Returns: rendered { subject, body_text, ctx, links }
export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;

    const body = (await req.json().catch(() => ({}))) as unknown;
    const subjectOverride = String(body?.subject_override ?? "");
    const bodyOverride = String(body?.body_override ?? "");

    // --- Fetch profile + activity
    const [profileRes, businessRes, inrcyCfgRes, proCfgRes, statsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
      supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
      supabase
        .from("integrations")
        .select("provider,source,product,status,resource_id,resource_label,meta")
        .eq("user_id", userId)
        .in("provider", ["google", "facebook"]),
    ]);

    const profile: unknown = profileRes.data ?? {};
    const business: unknown = businessRes.data ?? {};

    // --- Links logic (priority: iNrCy site > site web ; plus Facebook if connected)
    const ownership = String(profile?.inrcy_site_ownership ?? "none");
    const inrcyUrl = String(profile?.inrcy_site_url ?? (inrcyCfgRes.data as unknown)?.site_url ?? "").trim();

    const proSettings = ((proCfgRes.data as unknown)?.settings ?? {}) as unknown;
    const siteWebUrl = String(proSettings?.site_web?.url ?? "").trim();

    const hasInrcySite = ownership !== "none" && !!inrcyUrl;
    const siteUrl = hasInrcySite ? inrcyUrl : siteWebUrl;

    let facebookUrl = "";
    let gmbUrl = "";

    for (const r of (statsRes.data ?? []) as unknown[]) {
      if (r.provider === "facebook" && (r.status === "connected") && r.resource_id) {
        facebookUrl = `https://www.facebook.com/${r.resource_id}`;
      }
      if (r.provider === "google" && (r.status === "connected") && r.resource_id) {
        const label = String(r.resource_label || r.resource_id || "").trim();
        gmbUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
      }
    }

    const links = {
      site_url: siteUrl,
      facebook_url: facebookUrl,
      gmb_url: gmbUrl,
      review_url: gmbUrl || siteUrl, // rule: gmb first, else site (reviews can be collected on site)
    };

    const ctx = buildDefaultContext({ profile, business, links });

    // Render overrides (subject/body already selected/edited in UI)
    const subject = renderWithContext(subjectOverride, ctx);
    const bodyText = renderWithContext(bodyOverride, ctx);

    return NextResponse.json({ subject, body_text: bodyText, ctx, links });
  } catch (e) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
