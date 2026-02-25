import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { tryDecryptToken } from "@/lib/oauthCrypto";

/**
 * /api/generator/kpis
 *
 * Leads = (Gmail INBOX received) + (GSC clicks) + (GA4 pageviews)
 * CA généré = Leads(month) * (tx_conversion/100) * panier_moyen
 *
 * ✅ Fix included:
 * Your /api/stats/overview returns numbers under `totals` (ex: totals.clicks, totals.pageviews).
 * This endpoint now reads BOTH root-level and totals-level shapes.
 *
 * Note: Gmail tokens are encrypted in your DB (access_token_enc / refresh_token_enc),
 * so Gmail will stay at 0 until we plug in your decrypt helper.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

type AnyRec = Record<string, unknown>;

function pickFirst<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return null;
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isExpired(expiresAt: unknown): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t <= Date.now() + 60_000;
}

async function refreshGmailAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to refresh Gmail token: ${res.status} ${txt}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

function extractGmailTokens(account: AnyRec) {
  // Your DB shows encrypted columns: access_token_enc / refresh_token_enc
  // We can decrypt tokens server-side to avoid storing clear tokens in DB.
  const accessTokenPlain = pickFirst<string>(
    account.access_token,
    account.accessToken,
    account.token,
    account.oauth_access_token
  );

  const refreshTokenPlain = pickFirst<string>(
    account.refresh_token,
    account.refreshToken,
    account.oauth_refresh_token
  );

  const expiresAt = pickFirst<string>(
    account.expires_at,
    account.expiresAt,
    account.token_expires_at
  );

  // Encrypted (for debug only)
  const accessTokenEnc = pickFirst<string>(account.access_token_enc);
  const refreshTokenEnc = pickFirst<string>(account.refresh_token_enc);

  const accessToken = accessTokenPlain || tryDecryptToken(accessTokenEnc) || undefined;
  const refreshToken = refreshTokenPlain || tryDecryptToken(refreshTokenEnc) || undefined;

  return { accessToken, refreshToken, expiresAt, accessTokenEnc, refreshTokenEnc };
}

async function getLatestGmailAccount(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  userId: string,
  debug: AnyRec
) {
  const { data, error } = await supabase
    .from("mail_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Supabase mail_accounts error: ${error.message}`);
  const account = (data && data[0]) || null;

  debug.mail_accounts_found = Array.isArray(data) ? data.length : 0;
  debug.mail_account_fields = account ? Object.keys(account) : [];

  return account;
}

async function _countGmailInbox(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  userId: string,
  days: number,
  debug: AnyRec
) {
  const account = await getLatestGmailAccount(supabase, userId, debug);
  if (!account) return 0;

  const { accessToken: rawAccess, refreshToken, expiresAt, accessTokenEnc, refreshTokenEnc } =
    extractGmailTokens(account);

  debug.gmail_tokens = {
    has_access_token: !!rawAccess,
    has_refresh_token: !!refreshToken,
    has_access_token_enc: !!accessTokenEnc,
    has_refresh_token_enc: !!refreshTokenEnc,
    expires_at: expiresAt ?? null,
  };

  let accessToken = rawAccess;

  if (!accessToken || isExpired(expiresAt)) {
    if (!refreshToken) {
      // With your schema, refresh_token is encrypted => will hit here until decrypt is wired.
      throw new Error("No refresh token found in mail_accounts row (encrypted refresh_token_enc detected).");
    }
    const refreshed = await refreshGmailAccessToken(refreshToken);
    accessToken = refreshed.accessToken;
    debug.gmail_refreshed = true;
  }

  const after = Math.floor(Date.now() / 1000) - days * 86400;
  const q = `in:inbox after:${after}`;

  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "1");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gmail list failed: ${res.status} ${txt}`);
  }

  const json = (await res.json()) as { resultSizeEstimate?: number };
  return json.resultSizeEstimate ?? 0;
}

async function _getStats(origin: string, days: number, req: Request) {
  const cookie = req.headers.get("cookie") ?? "";

  const res = await fetch(`${origin}/api/stats/overview?days=${days}`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Stats overview failed: ${res.status} ${txt}`);
  }

  const json = await res.json();

  // ✅ YOUR SHAPE: { totals: { clicks, pageviews, ... }, ... }
  const src = (json?.totals && typeof json.totals === "object") ? json.totals : json;

  const clicks = num(src?.clicks ?? src?.seoClicks ?? src?.gscClicks ?? 0);
  const pageviews = num(src?.pageviews ?? src?.pagesViews ?? src?.ga4Pageviews ?? 0);

  return { clicks, pageviews };
}

async function getOpportunities(origin: string, req: Request) {
  // Générateur windows are fixed:
  // - today: 48h (2 days)
  // - week : 7 days
  // - month: 28 days
  const url = `${origin}/api/inrstats/opportunities?mode=generator`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      cookie: req.headers.get("cookie") || "",
    },
  });
  if (!res.ok) throw new Error(`iNrStats opportunities failed (${res.status})`);
  return res.json();
}

async function getProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  userId: string,
  debug: AnyRec
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Supabase profiles error: ${error.message}`);

  const row = (data as unknown) || null;
  debug.profiles_found = row ? 1 : 0;
  debug.profile_fields = row ? Object.keys(row) : [];

  const lead_conversion_rate = num(
    pickFirst(row?.lead_conversion_rate, row?.tx_conversion, row?.conversion_rate, row?.leadConversionRate),
    0
  );
  const avg_basket = num(
    pickFirst(row?.avg_basket, row?.panier_moyen, row?.average_basket, row?.avgBasket),
    0
  );

  return { lead_conversion_rate, avg_basket };
}

export async function GET(req: Request) {
  const debug: AnyRec = {
    ok: false,
    errors: {},
    env: {
      has_SUPABASE_URL: !!SUPABASE_URL,
      has_GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      has_GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    },
  };

  try {
    if (!SUPABASE_URL) {
      return NextResponse.json(
        {
          error:
            "Missing Supabase env vars. Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
          debug,
        },
        { status: 500 }
      );
    }

    // ✅ Auth guard: this endpoint returns PRIVATE KPIs, so it MUST be called by a logged-in user.
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr) debug.errors.auth = authErr.message;
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", debug: process.env.NODE_ENV === "development" ? debug : undefined },
        { status: 401 }
      );
    }

    const { searchParams, origin } = new URL(req.url);

    // Kept only for debug / future tuning. The real windows are enforced server-side.
    const monthDays = Math.max(1, Number(searchParams.get("monthDays") || 28));
    const weekDays = Math.max(1, Number(searchParams.get("weekDays") || 7));
    const todayDays = Math.max(1, Number(searchParams.get("todayDays") || 2));
    debug.windows = { monthDays, weekDays, todayDays, mode: "generator" };

    const safe = async <T>(key: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (e: Record<string, unknown>) {
        debug.errors[key] = e?.message ?? String(e);
        return fallback;
      }
    };

    const profile = await safe("profile", () => getProfile(supabase, user.id, debug), {
      lead_conversion_rate: 0,
      avg_basket: 0,
    });

    // The Générateur must reflect iNr'Stats opportunités.
    // We take the snapshot from /api/inrstats/opportunities and only add the CA estimation here.
    const opp = await safe(
      "opportunities",
      () => getOpportunities(origin, req),
      { baseDays: monthDays, today: 0, week: 0, month: 0, confidence: "low" }
    );

    const leads = {
      month: Number(opp.month) || 0,
      week: Number(opp.week) || 0,
      today: Number(opp.today) || 0,
    };

    const estimatedValue = Math.round(
      leads.month * (profile.lead_conversion_rate / 100) * profile.avg_basket
    );

    debug.ok = true;

    // ✅ Debug is useful in dev, but should not leak in prod.
    const includeDebug =
      process.env.NODE_ENV === "development" || req.headers.get("x-inrcy-debug") === "1";

    return NextResponse.json({
      leads,
      estimatedValue,
      details: {
        opportunities: opp,
        profile,
      },
      ...(includeDebug ? { debug } : {}),
    });
  } catch (e: Record<string, unknown>) {
    debug.errors.unhandled = e?.message ?? String(e);
    const includeDebug =
      process.env.NODE_ENV === "development" || req.headers.get("x-inrcy-debug") === "1";
    return NextResponse.json(
      { error: debug.errors.unhandled, ...(includeDebug ? { debug } : {}) },
      { status: 500 }
    );
  }
}
