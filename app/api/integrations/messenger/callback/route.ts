import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { FbPage, FbTokenExchange, fbFetchJson, messengerScopes } from "@/lib/messengerGraph";

type FbMe = { id?: string; name?: string; email?: string };

function decodeState(stateRaw: string): { returnTo?: string } {
  try {
    return JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8")) as any;
  } catch {
    return {};
  }
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const code = urlObj.searchParams.get("code");
    const stateRaw = urlObj.searchParams.get("state") || "";

    const fbErrorMsg = urlObj.searchParams.get("error_message") || urlObj.searchParams.get("error_description");
    const fbErrorCode = urlObj.searchParams.get("error_code") || urlObj.searchParams.get("error");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const state = decodeState(stateRaw);
    const returnTo = state?.returnTo || "/dashboard?panel=mails";

    if (!code) {
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "messenger");
      finalUrl.searchParams.set("ok", "0");
      if (fbErrorCode) finalUrl.searchParams.set("reason", String(fbErrorCode));
      if (fbErrorMsg) finalUrl.searchParams.set("message", String(fbErrorMsg).slice(0, 200));
      return NextResponse.redirect(finalUrl);
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectFromEnv = process.env.MESSENGER_REDIRECT_URI;
    const redirectUri = redirectFromEnv || `${siteUrl}/api/integrations/messenger/callback`;

    if (!appId || !appSecret) {
      return NextResponse.json({ error: "Missing FACEBOOK_APP_ID/FACEBOOK_APP_SECRET" }, { status: 500 });
    }

    const supabase = await createSupabaseServer();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    // 1) Exchange code -> short-lived user access token
    const tokenData = await fbFetchJson<FbTokenExchange>(
      `oauth/access_token?${new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        client_secret: appSecret,
        code,
      }).toString()}`
    );
    const shortUserToken = tokenData.access_token;
    if (!shortUserToken) {
      return NextResponse.json({ error: "No access_token from Facebook", tokenData }, { status: 500 });
    }

    // 2) Upgrade to long-lived user token (best-effort)
    let longUserToken = shortUserToken;
    try {
      const longToken = await fbFetchJson<FbTokenExchange>(
        `oauth/access_token?${new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortUserToken,
        }).toString()}`
      );
      if (longToken.access_token) longUserToken = longToken.access_token;
    } catch {
      // keep short-lived in dev
    }

    // 3) Read basic profile (non-fatal)
    let me: FbMe = {};
    try {
      me = await fbFetchJson<FbMe>(
        `me?${new URLSearchParams({
          fields: "id,name,email",
          access_token: longUserToken,
        }).toString()}`
      );
    } catch {
      me = {};
    }

    // 4) List managed Pages (requires pages_show_list)
    // NOTE: In production you will likely need Advanced Access / App Review.
    const pagesResp = await fbFetchJson<{ data?: FbPage[] }>(
      `me/accounts?${new URLSearchParams({
        fields: "id,name,access_token",
        access_token: longUserToken,
      }).toString()}`
    );
    const pages = pagesResp.data || [];
    const picked = pages[0];

    if (!picked?.id || !picked?.access_token) {
      const finalUrl = new URL(returnTo, siteUrl);
      finalUrl.searchParams.set("linked", "messenger");
      finalUrl.searchParams.set("ok", "0");
      finalUrl.searchParams.set("reason", "no_page_or_missing_permission");
      finalUrl.searchParams.set("toast", "messenger_no_page");
      return NextResponse.redirect(finalUrl);
    }

    // 5) Store in messenger_accounts
    // IMPORTANT: For now we store tokens as plain text in DB (dev-friendly).
    // For prod, encrypt at rest or store in a secrets vault.
    const payload: any = {
      user_id: userId,
      page_id: picked.id,
      page_name: picked.name ?? null,
      status: "connected",
      page_access_token: picked.access_token,
      user_access_token: longUserToken,
      scopes: messengerScopes(),
      provider_account_id: me.id ?? null,
      provider_display_name: me.name ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: existingErr } = await supabase
      .from("messenger_accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingErr) {
      return NextResponse.json({ error: "DB read existing failed", existingErr }, { status: 500 });
    }

    if ((existing as any)?.id) {
      const { error: upErr } = await supabase.from("messenger_accounts").update(payload).eq("id", (existing as any).id);
      if (upErr) return NextResponse.json({ error: "DB update failed", upErr }, { status: 500 });
    } else {
      const { error: insErr } = await supabase.from("messenger_accounts").insert({ ...payload, created_at: new Date().toISOString() });
      if (insErr) return NextResponse.json({ error: "DB insert failed", insErr }, { status: 500 });
    }

    const finalUrl = new URL(returnTo, siteUrl);
    finalUrl.searchParams.set("toast", "messenger_connected");
    return NextResponse.redirect(finalUrl);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
