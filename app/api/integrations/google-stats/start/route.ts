import { NextResponse } from "next/server";

const ALLOWED_SOURCES = ["site_inrcy", "site_web"] as const;
const ALLOWED_PRODUCTS = ["ga4", "gsc"] as const;

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectFromEnv = process.env.GOOGLE_STATS_REDIRECT_URI;

  const origin = new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${origin}/api/integrations/google-stats/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "";
  const product = searchParams.get("product") || "";
  const returnTo = searchParams.get("returnTo") || `/dashboard?panel=${encodeURIComponent(source)}`;

  if (!ALLOWED_SOURCES.includes(source as any)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }
  if (!ALLOWED_PRODUCTS.includes(product as any)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  const state = Buffer.from(
    JSON.stringify({ source, product, returnTo })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    scope: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(url);
}
