import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";

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
  const origin = getOrigin(req);
  const fallbackUrl = `${origin}/icons/inrbadge-dashboard.png`;

  if (!userId) {
    return NextResponse.redirect(fallbackUrl, { status: 307 });
  }

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("logo_url,logo_path")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = data as Record<string, unknown> | null;
  const logo = await resolveProfileLogoUrl(supabaseAdmin, {
    logo_path: trim(profile?.logo_path) || null,
    logo_url: trim(profile?.logo_url) || null,
  });

  const logoUrl = trim(logo.logoUrl);
  if (!logoUrl) {
    return NextResponse.redirect(fallbackUrl, { status: 307 });
  }

  return NextResponse.redirect(logoUrl, { status: 307 });
}
