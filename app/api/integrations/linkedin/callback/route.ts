import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptToken } from "@/lib/oauthCrypto";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

async function postForm(url: string, form: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || data?.error || `HTTP ${res.status}`);
  return data;
}

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");
    const err = urlObj.searchParams.get("error");
    const errDesc = urlObj.searchParams.get("error_description");

    if (!stateRaw) return NextResponse.json({ error: "Missing ?state" }, { status: 400 });

    let state: unknown;
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const returnTo = state?.returnTo || "/dashboard?panel=linkedin";

    if (!code) {
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "linkedin");
      finalUrl.searchParams.set("ok", "0");
      if (err) finalUrl.searchParams.set("reason", String(err));
      if (errDesc) finalUrl.searchParams.set("message", String(errDesc).slice(0, 200));
      return NextResponse.redirect(finalUrl);
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectFromEnv = process.env.LINKEDIN_REDIRECT_URI;
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/linkedin/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = authData.user.id;

    const rlUser = await enforceRateLimit({
      name: "oauth_linkedin_cb",
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: "oauth_linkedin_cb_ip",
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

    const token = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const accessToken = String(token?.access_token || "");
    if (!accessToken) return NextResponse.json({ error: "No access_token from LinkedIn", token }, { status: 500 });

    // OpenID Connect userinfo (works when openid scope granted)
    let userinfo: Record<string, unknown> = {};
    try {
      userinfo = await fetchJson("https://api.linkedin.com/v2/userinfo", accessToken);
    } catch {
      userinfo = {};
    }

    const sub = String(userinfo?.sub || "");
    const name = String(userinfo?.name || userinfo?.localizedFirstName || "");
    const email = String(userinfo?.email || "");
    // OpenID Connect can optionally provide a public profile URL via the standard "profile" claim.
    const profileUrl = (userinfo as unknown)?.profile || (userinfo as unknown)?.profile_url || null;

    const authorUrn = sub ? `urn:li:person:${sub}` : "";

    // Upsert integration
    // Upsert (robuste même si l’utilisateur reconnecte plusieurs fois)
// Nécessite un UNIQUE INDEX sur (user_id, provider, source, product) côté Supabase.
const payload: Record<string, unknown> = {
  user_id: userId,
  provider: "linkedin",
  category: "social",
  source: "linkedin",
  product: "linkedin",
  status: "connected",
  email_address: email || null,
  display_name: name || null,
  provider_account_id: sub || null,
  scopes: "openid profile email w_member_social",
  access_token_enc: encryptToken(accessToken),
  refresh_token_enc: null,
  expires_at: null,
  resource_id: authorUrn || null,
  resource_label: name || null,
  meta: { profile_url: profileUrl, org_urn: null },
};

await supabase
  .from("integrations")
  .upsert(payload, { onConflict: "user_id,provider,source,product" });

// Mirror in pro_tools_configs
    try {
      const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = (scRow as unknown)?.settings ?? {};
      const merged = {
        ...current,
        linkedin: {
          ...(current?.linkedin ?? {}),
          accountConnected: true,
          connected: true,
          displayName: name || null,
          url: profileUrl,
        },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {}

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("linked", "linkedin");
    finalUrl.searchParams.set("ok", "1");
    return NextResponse.redirect(finalUrl);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Unknown error" }, { status: 500 });
  }
}
