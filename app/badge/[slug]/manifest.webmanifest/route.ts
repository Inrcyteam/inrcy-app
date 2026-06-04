import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trim(value: unknown) {
  return String(value || "").trim();
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
  if (userId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("company_legal_name,first_name,last_name")
      .eq("user_id", userId)
      .maybeSingle();
    const profile = data as Record<string, unknown> | null;
    const company = trim(profile?.company_legal_name);
    const displayName = [trim(profile?.first_name), trim(profile?.last_name)].filter(Boolean).join(" ");
    name = company || displayName || name;
  }

  const origin = getOrigin(req);
  const encodedSlug = encodeURIComponent(slug);
  const iconUrl = `${origin}/badge/${encodedSlug}/icon.png`;
  const startUrl = `${origin}/badge/${encodedSlug}`;

  return NextResponse.json(
    {
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      description: "Fiche iNr'Badge",
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
