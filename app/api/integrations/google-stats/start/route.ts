import { NextResponse } from "next/server";

const ALLOWED_SOURCES = ["site_inrcy", "site_web"] as const;
const ALLOWED_PRODUCTS = ["ga4", "gsc"] as const;

function extractDomainFromUrl(rawUrl: string): { normalizedUrl: string; domain: string } | null {
  try {
    // Accept:
    // - https://example.com
    // - http://example.com
    // - example.com (users often omit protocol)
    const input = /^(https?:\/\/)/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    if (!host) return null;
    // Keep a normalized URL (no hash)
    u.hash = "";
    return { normalizedUrl: u.toString(), domain: host };
  } catch {
    return null;
  }
}

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
  const force = searchParams.get("force") || "";
  const mode = searchParams.get("mode") || (force === "1" ? "activate" : "");
  const returnTo = searchParams.get("returnTo") || `/dashboard?panel=${encodeURIComponent(source)}`;

  // Optional: if the UI passes a siteUrl (user just typed it), embed domain in OAuth state
  // so the callback can auto-resolve GA4/GSC for THAT site without requiring manual IDs.
  const siteUrlFromQuery = searchParams.get("siteUrl") || "";

  if (!ALLOWED_SOURCES.includes(source as any)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }
  if (!ALLOWED_PRODUCTS.includes(product as any)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  // "mode=activate" => we will resolve GA4+GSC automatically from the configured site URL.
  // We embed the domain in the OAuth state so the callback can enforce coherence.
  let domain: string | null = null;
  let siteUrl: string | null = null;

  
  if (siteUrlFromQuery) {
    const parsed = extractDomainFromUrl(String(siteUrlFromQuery).trim());
    if (parsed) {
      domain = parsed.domain;
      siteUrl = parsed.normalizedUrl;
    }
  }

if (mode === "activate") {
    const { createSupabaseServer } = await import("@/lib/supabaseServer");
    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    
// Nouveau schéma :
// - site_inrcy -> inrcy_site_configs.site_url
// - site_web -> pro_tools_configs.settings.site_web.url
// Fallback : ancienne table site_configs

const [inrcyCfgRes, proCfgRes, legacyCfgRes] = await Promise.all([
  supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
  supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
  supabase.from("site_configs").select("settings,site_url").eq("user_id", userId).maybeSingle(),
]);

// On ne bloque pas si la legacy table n'existe plus, mais on garde ce fallback pendant la transition.
const inrcySiteUrl = (inrcyCfgRes.data as any | null)?.site_url ?? "";
const proSettings = (proCfgRes.data as any | null)?.settings ?? {};
const legacySettings = (legacyCfgRes.data as any | null)?.settings ?? {};
const legacySiteUrl = (legacyCfgRes.data as any | null)?.site_url ?? "";

const rawUrl =
  (siteUrlFromQuery && String(siteUrlFromQuery).trim())
    ? String(siteUrlFromQuery).trim()
    : (
        source === "site_web"
          ? (proSettings?.site_web?.url ?? legacySettings?.site_web?.url ?? "")
          : (inrcySiteUrl || legacySiteUrl || "")
      );

    const parsed = extractDomainFromUrl(String(rawUrl || "").trim());
    if (!parsed) {
      return NextResponse.json(
        { error: "Site URL invalid or missing. Please save the site link first." },
        { status: 400 }
      );
    }

    domain = parsed.domain;
    siteUrl = parsed.normalizedUrl;
  }

  const state = Buffer.from(JSON.stringify({ source, product, returnTo, mode, domain, siteUrl })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
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
