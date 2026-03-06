import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

type ChannelKey =
  | "inrcy_site"
  | "site_web"
  | "gmb"
  | "facebook"
  | "instagram"
  | "linkedin";

type JsonRecord = Record<string, unknown>;

type IntegrationRow = {
  provider: string | null;
  status: string | null;
  resource_id?: string | null;
  source?: string | null;
  product?: string | null;
};

const asRecord = (v: unknown): JsonRecord =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {};

export async function GET() {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const base: Record<ChannelKey, boolean> = {
      inrcy_site: false,
      site_web: false,
      gmb: false,
      facebook: false,
      instagram: false,
      linkedin: false,
    };

    // Lecture configs utilisateur
    const [profileRes, inrcyCfgRes, proCfgRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("inrcy_site_ownership,inrcy_site_url")
        .eq("user_id", userId)
        .maybeSingle(),

      supabase
        .from("inrcy_site_configs")
        .select("site_url")
        .eq("user_id", userId)
        .maybeSingle(),

      supabase
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const profile = asRecord(profileRes.data);
    const inrcyCfg = asRecord(inrcyCfgRes.data);

    const ownership = String(profile["inrcy_site_ownership"] ?? "none");

    const inrcyUrl = String(
      profile["inrcy_site_url"] ?? inrcyCfg["site_url"] ?? ""
    ).trim();

    const proCfg = asRecord(proCfgRes.data);
    const proSettings = asRecord(proCfg["settings"]);
    const siteWeb = asRecord(proSettings["site_web"]);

    const siteWebUrl = String(siteWeb["url"] ?? "").trim();

    // Lecture intégrations
    const { data: rows } = await supabase
      .from("integrations")
      .select("provider,status,resource_id,source,product")
      .eq("user_id", userId)
      .in("provider", ["google", "facebook", "instagram", "linkedin"]);

    const integrationRows: IntegrationRow[] = rows ?? [];

    // Vérifie GA4 + GSC
    const hasGoogleStats = (source: "site_inrcy" | "site_web") => {
      const hasGa4 = integrationRows.some(
        (r) =>
          r.provider === "google" &&
          r.status === "connected" &&
          r.source === source &&
          r.product === "ga4"
      );

      const hasGsc = integrationRows.some(
        (r) =>
          r.provider === "google" &&
          r.status === "connected" &&
          r.source === source &&
          r.product === "gsc"
      );

      return hasGa4 && hasGsc;
    };

    // iNrCy site
    base.inrcy_site =
      ownership !== "none" && !!inrcyUrl && hasGoogleStats("site_inrcy");

    // site web externe
    base.site_web = !!siteWebUrl && hasGoogleStats("site_web");

    // autres canaux
    for (const r of integrationRows) {
      if (r.provider === "google" && r.status === "connected" && r.resource_id)
        base.gmb = true;

      if (r.provider === "facebook" && r.status === "connected" && r.resource_id)
        base.facebook = true;

      if (
        r.provider === "instagram" &&
        r.status === "connected" &&
        r.resource_id
      )
        base.instagram = true;

      if (r.provider === "linkedin" && r.status === "connected")
        base.linkedin = true;
    }

    return NextResponse.json({ channels: base });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}