import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";
import { getInrBadgeTexts, normalizeInrBadgeLanguage } from "@/lib/inrBadgeLanguage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function trim(value: unknown) {
  return String(value || "").trim();
}

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getOrigin(req: Request) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await ctx.params;
  const slug = trim(rawSlug);
  const userId = extractInrBadgeUserIdFromSlug(slug);

  let name = "iNr'Badge";
  let language = normalizeInrBadgeLanguage(null);
  if (userId) {
    const [{ data }, toolsRes, businessRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("company_legal_name,first_name,last_name")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("business_profiles")
        .select("client_language")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const profile = data as Record<string, unknown> | null;
    const rootSettings = safeObj((toolsRes.data as { settings?: unknown } | null)?.settings);
    const business = (businessRes.data ?? {}) as Record<string, unknown>;
    language = normalizeInrBadgeLanguage(business.client_language || rootSettings.inrBadgeLanguage);
    const company = trim(profile?.company_legal_name);
    const displayName = [trim(profile?.first_name), trim(profile?.last_name)].filter(Boolean).join(" ");
    name = company || displayName || name;
  }

  const badgeText = getInrBadgeTexts(language);
  const origin = getOrigin(req);
  const encodedSlug = encodeURIComponent(slug);
  const iconUrl = `${origin}/badge/${encodedSlug}/icon.png`;
  const startUrl = `${origin}/badge/${encodedSlug}`;

  return NextResponse.json(
    {
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      description: badgeText.shareSheetTitle,
      start_url: startUrl,
      scope: `${origin}/badge/${encodedSlug}`,
      display: "standalone",
      background_color: "#071126",
      theme_color: "#071126",
      icons: [
        { src: iconUrl, sizes: "192x192", purpose: "any maskable" },
        { src: iconUrl, sizes: "512x512", purpose: "any maskable" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
