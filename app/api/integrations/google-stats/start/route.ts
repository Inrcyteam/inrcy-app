import { NextResponse } from "next/server";
import { makeOAuthState, safeInternalPath } from "@/lib/security";
import { asRecord } from "@/lib/tsSafe";

const ALLOWED_SOURCES = ["site_inrcy", "site_web"] as const;
const ALLOWED_PRODUCTS = ["ga4", "gsc"] as const;

type Source = (typeof ALLOWED_SOURCES)[number];
type Product = (typeof ALLOWED_PRODUCTS)[number];

function isAllowedSource(v: string): v is Source {
  return (ALLOWED_SOURCES as readonly string[]).includes(v);
}
function isAllowedProduct(v: string): v is Product {
  return (ALLOWED_PRODUCTS as readonly string[]).includes(v);
}

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

  const appOrigin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const redirectUri = redirectFromEnv || `${appOrigin}/api/integrations/google-stats/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Configuration Google incomplète côté serveur." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "";
  const product = searchParams.get("product") || "";
  const mode = searchParams.get("mode") || "";
  const returnTo = safeInternalPath(searchParams.get("returnTo") || `/dashboard?panel=${encodeURIComponent(source)}`, `/dashboard?panel=${encodeURIComponent(source)}`);

  // Optional: if the UI passes a siteUrl (user just typed it), embed domain in OAuth state
  // so the callback can auto-resolve GA4/GSC for THAT site without requiring manual IDs.
  const siteUrlFromQuery = searchParams.get("siteUrl") || "";

  if (!isAllowedSource(source)) {
    return NextResponse.json({ error: "La source demandée n'est pas reconnue." }, { status: 400 });
  }
  if (!isAllowedProduct(product)) {
    return NextResponse.json({ error: "Produit invalide." }, { status: 400 });
  }

  // Legacy support: only explicit mode=activate triggers the dual activation flow.
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
      return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
    }
    const userId = authData.user.id;

    
// Nouveau schéma :
// - site_inrcy -> inrcy_site_configs.site_url
// - site_web -> pro_tools_configs.settings.site_web.url

const [inrcyCfgRes, proCfgRes] = await Promise.all([
  supabase.from("inrcy_site_configs").select("site_url").eq("user_id", userId).maybeSingle(),
  supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle(),
]);

const inrcySiteUrl = String(asRecord(inrcyCfgRes.data)["site_url"] ?? "");
const proSettings = asRecord(asRecord(proCfgRes.data)["settings"]);

const rawUrl =
  (siteUrlFromQuery && String(siteUrlFromQuery).trim())
    ? String(siteUrlFromQuery).trim()
      : (
        source === "site_web"
          ? (String(asRecord(asRecord(proSettings)["site_web"])["url"] ?? ""))
          : (inrcySiteUrl || "")
      );

    const parsed = extractDomainFromUrl(String(rawUrl || "").trim());
    if (!parsed) {
      return NextResponse.json(
        { error: "Le lien du site est manquant ou invalide. Veuillez l’enregistrer puis réessayer." },
        { status: 400 }
      );
    }

    domain = parsed.domain;
    siteUrl = parsed.normalizedUrl;
  }

  const { stateB64, nonce, cookieName } = makeOAuthState("google_stats", returnTo, { source, product, mode, domain, siteUrl });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state: stateB64,
    scope: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const res = NextResponse.redirect(url);
  res.cookies.set(cookieName, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
