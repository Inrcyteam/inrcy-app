import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { asRecord, asString } from "@/lib/tsSafe";

export async function GET() {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const [profileRes, inrcyCfgRes, proCfgRes, businessRes] = await Promise.all([
      supabase.from("profiles").select("phone").eq("user_id", user.id).maybeSingle(),
      supabase.from("inrcy_site_configs").select("site_url").eq("user_id", user.id).maybeSingle(),
      supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle(),
      supabase.from("business_profiles").select("preferred_cta").eq("user_id", user.id).maybeSingle(),
    ]);

    const profile = asRecord(profileRes.data);
    const inrcyCfg = asRecord(inrcyCfgRes.data);
    const proSettings = asRecord(asRecord(proCfgRes.data).settings);
    const businessProfile = asRecord(businessRes.data);
    const siteWeb = asRecord(proSettings.site_web);

    const siteWebUrl = (asString(siteWeb.url) || "").trim();
    const inrcySiteUrl = (asString(inrcyCfg.site_url) || "").trim();
    const preferredWebsiteUrl = siteWebUrl || inrcySiteUrl;
    const preferredWebsiteLabel = siteWebUrl ? "Site web connecté" : inrcySiteUrl ? "Site iNrCy" : "";
    const phone = (asString(profile.phone) || "").trim();
    const rawPreferredCta = (asString(businessProfile.preferred_cta) || "devis").trim();
    const preferredCta = ["devis", "appeler", "message"].includes(rawPreferredCta)
      ? rawPreferredCta
      : "devis";

    return NextResponse.json({
      preferredWebsiteUrl,
      preferredWebsiteLabel,
      siteWebUrl,
      inrcySiteUrl,
      phone,
      preferredCta,
    });
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
}
