import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptToken as _encryptToken } from "@/lib/oauthCrypto";
import { gmbListAccounts } from "@/lib/googleBusiness";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

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

async function invalidateUserStatsCache(supabase: unknown, userId: string) {
  // Best-effort cache invalidation (new + legacy). Never fail the OAuth flow on cache.
  try {
    await supabase.from("stats_cache").delete().eq("user_id", userId);
  } catch {}

  // Legacy cache table in your DB is `cache_statistiques`.
  // Depending on migrations it may have `id_de_l_utilisateur` or `user_id`.
  try {
    await supabase.from("cache_statistiques").delete().eq("id_de_l_utilisateur", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("user_id", userId);
  } catch {}
}

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

    let state: unknown = null;
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
    // IMPORTANT: the redirect_uri used here MUST match exactly what was used in the initial OAuth step.
    // Prefer env; otherwise use the canonical siteUrl (not req.url origin).
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/google-business/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    const rlUser = await enforceRateLimit({
      name: "oauth_google_business_cb",
      identifier: userId,
      limit: 10,
      window: "10 m",
    });
    if (rlUser) return rlUser;

    const ip = getClientIp(req);
    const rlIp = await enforceRateLimit({
      name: "oauth_google_business_cb_ip",
      identifier: ip,
      limit: 20,
      window: "10 m",
    });
    if (rlIp) return rlIp;

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
      .from("integrations")
      .select("id,refresh_token_enc")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb")
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    const refreshTokenToStore = tokenData.refresh_token ?? (existing as unknown)?.refresh_token_enc ?? null;

    const expiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

    const payload: Record<string, unknown> = {
      user_id: userId,
      provider: "google",
      category: "local",
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

    if ((existing as unknown)?.id) {
      const { error: upErr } = await supabase
        .from("integrations")
        .update(payload)
        .eq("id", (existing as Record<string, unknown>)?.id as string);
      if (upErr) return NextResponse.json({ error: "DB update failed", upErr }, { status: 500 });
    } else {
      const { error: insErr } = await supabase.from("integrations").insert(payload);
      if (insErr) return NextResponse.json({ error: "DB insert failed", insErr }, { status: 500 });
    }

    // Also keep a boolean in pro_tools_configs.settings so the dashboard can show it instantly.
    try {
      const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
      const current = (scRow as unknown)?.settings ?? {};
      const merged = {
        ...current,
        gmb: {
          ...(current?.gmb ?? {}),
          connected: true,
          accountEmail: userInfo.email,
          accountDisplayName: userInfo.name ?? null,
        },
      };
      await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
    } catch {
      // non-fatal
    }


    // IMPORTANT:
    // We DO NOT auto-select a location here.
    // GMB stats are tied to a specific establishment (location). Until the user explicitly
    // chooses a location in the UI, we must not fetch or display metrics.
    // We can however store a default *account* hint to help list locations faster.
    try {
      if (payload.access_token_enc) {
        const accounts = await gmbListAccounts(payload.access_token_enc);
        const firstAcc = accounts?.[0]?.name; // e.g. "accounts/123"
        if (firstAcc) {
          await supabase
            .from("integrations")
            .update({ meta: { ...(payload.meta || {}), account: firstAcc }, resource_id: null, resource_label: null })
            .eq("user_id", userId)
            .eq("provider", "google")
            .eq("source", "gmb")
            .eq("product", "gmb");
        }
      }
    } catch {
      // ignore discovery errors
    }

    // Invalidate stats cache so iNrStats + Generator reflect the new connection immediately.
    await invalidateUserStatsCache(supabase, userId);

    // Build final redirect URL safely and append params without breaking existing querystring
    const finalUrl = new URL(returnToPath, siteUrl);
    finalUrl.searchParams.set("linked", "gmb");
    finalUrl.searchParams.set("ok", "1");

    return NextResponse.redirect(finalUrl);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)) || "Unknown error" }, { status: 500 });
  }
}