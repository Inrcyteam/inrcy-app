import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { gmbListAccounts, gmbListLocations } from "@/lib/googleBusiness";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
};

function safeReturnTo(stateReturnTo: unknown, siteUrl: string) {
  // Default panel
  const fallbackPath = "/dashboard?panel=gmb";

  if (typeof stateReturnTo !== "string" || stateReturnTo.trim() === "") return fallbackPath;

  // If it's an absolute URL, only allow it if it matches our site origin
  if (/^https?:\/\//i.test(stateReturnTo)) {
    try {
      const u = new URL(stateReturnTo);
      const allowedOrigin = new URL(siteUrl).origin;
      if (u.origin !== allowedOrigin) return fallbackPath;
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return fallbackPath;
    }
  }

  // If it's a relative path, keep it (must start with /)
  if (!stateReturnTo.startsWith("/")) return fallbackPath;
  return stateReturnTo;
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state");

    if (!code) return NextResponse.json({ error: "Missing ?code" }, { status: 400 });
    if (!stateRaw) return NextResponse.json({ error: "Missing ?state" }, { status: 400 });

    let state: any = null;
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    // IMPORTANT:
    // - In dev you often hit this route via Cloudflare tunnel (https://xxxx.trycloudflare.com)
    // - But your app UI might be on http://localhost:3000 (no TLS)
    // So we MUST NOT guess the final redirect origin from req.url.
    // We use NEXT_PUBLIC_SITE_URL as the canonical base URL to redirect back to.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

    const returnToPath = safeReturnTo(state?.returnTo, siteUrl);

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectFromEnv = process.env.GOOGLE_GMB_REDIRECT_URI;

    // For the token exchange, redirect_uri MUST match exactly what you configured in Google Cloud.
    // Prefer env so you can switch between dev tunnel and production.
    const redirectUri = redirectFromEnv || `${new URL(req.url).origin}/api/integrations/google-business/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok) {
      return NextResponse.json({ error: "Token exchange failed", tokenData }, { status: 500 });
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = (await userRes.json()) as GoogleUserInfo;
    if (!userRes.ok || !userInfo?.email) {
      return NextResponse.json({ error: "Userinfo fetch failed", userInfo }, { status: 500 });
    }

    // Preserve refresh_token if Google doesn't return it
    const { data: existing, error: existingErr } = await supabase
      .from("stats_integrations")
      .select("id,refresh_token_enc")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb")
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    const refreshTokenToStore = tokenData.refresh_token ?? (existing as any)?.refresh_token_enc ?? null;

    const expiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

    const payload: any = {
      user_id: userId,
      provider: "google",
      source: "gmb",
      product: "gmb",
      status: "connected",
      email_address: userInfo.email,
      display_name: userInfo.name ?? null,
      provider_account_id: userInfo.id ?? null,
      scopes: tokenData.scope ?? null,
      access_token_enc: tokenData.access_token ?? null,
      refresh_token_enc: refreshTokenToStore,
      expires_at: expiresAt,
      meta: { picture: userInfo.picture ?? null },
    };

    if ((existing as any)?.id) {
      const { error: upErr } = await supabase.from("stats_integrations").update(payload).eq("id", (existing as any).id);
      if (upErr) return NextResponse.json({ error: "DB update failed", upErr }, { status: 500 });
    } else {
      const { error: insErr } = await supabase.from("stats_integrations").insert(payload);
      if (insErr) return NextResponse.json({ error: "DB insert failed", insErr }, { status: 500 });
    }


    // Try to discover an account + location so the Stats module can fetch GMB metrics.
    // This is best-effort; we keep the connection even if discovery fails.
    try {
      if (payload.access_token_enc) {
        const accounts = await gmbListAccounts(payload.access_token_enc);
        const firstAcc = accounts?.[0]?.name; // e.g. "accounts/123"
        if (firstAcc) {
          const locations = await gmbListLocations(payload.access_token_enc, firstAcc);
          const firstLoc = locations?.[0];
          if (firstLoc?.name) {
            // Store the selected default location in stats_integrations.resource_id/resource_label for later metrics calls.
            const locName = firstLoc.name; // e.g. "locations/456"
            const locLabel = firstLoc.title ?? null;

            await supabase
              .from("stats_integrations")
              .update({ resource_id: locName, resource_label: locLabel, meta: { ...(payload.meta || {}), account: firstAcc } })
              .eq("user_id", userId)
              .eq("provider", "google")
              .eq("source", "gmb")
              .eq("product", "gmb");
          }
        }
      }
    } catch {
      // ignore discovery errors
    }

    // Build final redirect URL safely and append params without breaking existing querystring
    const finalUrl = new URL(returnToPath, siteUrl);
    finalUrl.searchParams.set("linked", "gmb");
    finalUrl.searchParams.set("ok", "1");

    return NextResponse.redirect(finalUrl);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
