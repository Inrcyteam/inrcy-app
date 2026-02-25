import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

type ChannelKey = "inrcy_site" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

type JsonRecord = Record<string, unknown>;
const asRecord = (v: unknown): JsonRecord =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {};

export async function GET() {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;
// Internal channels availability depends on whether the user actually configured them.
    // - iNrCy site: only if the user has an iNrCy site (ownership != none) AND a URL exists
    // - Site web: only if the user saved a URL in pro_tools_configs.settings.site_web.url
    const base: Record<ChannelKey, boolean> = {
      inrcy_site: false,
      site_web: false,
      gmb: false,
      facebook: false,
      instagram: false,
      linkedin: false,
    };

    // Read minimal configs to determine whether internal channels are "connected".
    const [profileRes, inrcyCfgRes, proCfgRes] = await Promise.all([
      supabase.from("profiles").select("inrcy_site_ownership,inrcy_site_url").eq("user_id", userId).maybeSingle(),
      supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
      supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
    ]);

    const profile = asRecord(profileRes.data);
    const inrcyCfg = asRecord(inrcyCfgRes.data);
    const ownership = String(profile["inrcy_site_ownership"] ?? "none");
    const inrcyUrl = String(profile["inrcy_site_url"] ?? inrcyCfg["site_url"] ?? "").trim();
    base.inrcy_site = ownership !== "none" && !!inrcyUrl;

    const proCfg = asRecord(proCfgRes.data);
    const proSettings = asRecord(proCfg["settings"]);
    const siteWeb = asRecord(proSettings["site_web"]);
    const siteWebUrl = String(siteWeb["url"] ?? "").trim();
    base.site_web = !!siteWebUrl;

    // External channels depend on integrations + configuration (resource_id set)
    const { data: rows } = await supabase
      .from("integrations")
      .select("provider,status,resource_id")
      .eq("user_id", userId)
      .in("provider", ["google", "facebook", "instagram", "linkedin"]);

    for (const r of rows ?? []) {
      if (r.provider === "google" && r.status === "connected" && r.resource_id) base.gmb = true;
      if (r.provider === "facebook" && r.status === "connected" && r.resource_id) base.facebook = true;
      if (r.provider === "instagram" && r.status === "connected" && r.resource_id) base.instagram = true;
      if (r.provider === "linkedin" && r.status === "connected") base.linkedin = true;
    }

    return NextResponse.json({ channels: base });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}