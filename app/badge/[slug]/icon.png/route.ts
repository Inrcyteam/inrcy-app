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

function responseCacheControl(req: Request) {
  return new URL(req.url).searchParams.get("v")
    ? "public, max-age=31536000, immutable"
    : "no-store, max-age=0";
}

function redirectToFallback(req: Request) {
  const fallbackUrl = `${getOrigin(req)}/icons/inrbadge-dashboard.png`;
  return NextResponse.redirect(fallbackUrl, {
    status: 307,
    headers: {
      "Cache-Control": responseCacheControl(req),
    },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await ctx.params;
  const slug = trim(rawSlug);
  const userId = extractInrBadgeUserIdFromSlug(slug);

  if (!userId) return redirectToFallback(req);

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
  if (!logoUrl) return redirectToFallback(req);

  try {
    // Some profile logos exceed Next.js' 2 MB data-cache limit. The route
    // response is already cached below, so do not cache the upstream bytes.
    const absoluteLogoUrl = new URL(logoUrl, getOrigin(req)).toString();
    const imageRes = await fetch(absoluteLogoUrl, { cache: "no-store" });
    if (!imageRes.ok) return redirectToFallback(req);

    const body = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get("content-type") || "image/png";

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": responseCacheControl(req),
      },
    });
  } catch {
    return redirectToFallback(req);
  }
}
