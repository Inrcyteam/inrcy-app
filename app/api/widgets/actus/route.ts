import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// In-memory rate limit (best-effort). Works per server instance.
const RL_WINDOW_MS = 5 * 60 * 1000; // 5 min
const RL_MAX = 120; // per key / window
const rl = new Map<string, { count: number; resetAt: number }>();

function corsHeaders(req?: Request) {
  const origin = req?.headers.get("origin") || "*";
  return {
    // Safer than '*': we echo back the caller origin.
    // (Still public, but prevents some browser-side credential/cookie weirdness.)
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-InrCy-Widget-Token",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function getClientIp(req: Request) {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function rateLimitOrThrow(key: string) {
  const now = Date.now();
  const cur = rl.get(key);
  if (!cur || cur.resetAt <= now) {
    rl.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return;
  }
  cur.count += 1;
  if (cur.count > RL_MAX) {
    const secs = Math.ceil((cur.resetAt - now) / 1000);
    throw new Error(`Rate limited. Retry in ${secs}s`);
  }
}

function normalizeDomain(input: string | null): string {
  if (!input) return "";
  let raw = input.trim();
  try {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const u = new URL(raw);
    return (u.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = normalizeDomain(searchParams.get("domain"));
    const source = (searchParams.get("source") || "site_web").trim(); // "inrcy_site" | "site_web"
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "5", 10) || 5, 1),
      20
    );

    if (!domain) {
      return NextResponse.json(
        { ok: false, error: "Missing domain" },
        { status: 400, headers: corsHeaders(req) }
      );
    }

    // ✅ Security: protect the public widget endpoint behind a shared token.
    // - Backward compatible: if INRCY_WIDGETS_TOKEN is NOT set, the endpoint stays public.
    // - If set, callers must send ?token=... or header X-InrCy-Widget-Token.
    const expectedToken = process.env.INRCY_WIDGETS_TOKEN;
    const providedToken =
      searchParams.get("token") || req.headers.get("x-inrcy-widget-token") || "";

    if (expectedToken && providedToken !== expectedToken) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: corsHeaders(req) }
      );
    }

    // ✅ Best-effort rate limiting (reduces scraping/abuse).
    const ip = getClientIp(req);
    rateLimitOrThrow(`${ip}:${domain}:${source}`);

    const supabase = getSupabaseAdmin();

    // 1) Resolve user_id from domain (based on stored URLs)
    let userId: string | null = null;

    if (source === "inrcy_site") {
      // inrcy_site_configs has site_url
      const { data, error } = await supabase
        .from("inrcy_site_configs")
        .select("user_id, site_url")
        .ilike("site_url", `%${domain}%`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      userId = (data as any)?.user_id ?? null;
    } else {
      // site_web: pro_tools_configs has settings JSON with settings.site_web.url
      const { data, error } = await supabase
        .from("pro_tools_configs")
        .select("user_id, settings")
        .limit(200); // small enough in practice; optimize later if needed

      if (error) throw error;

      const rows = (data || []) as any[];
      const match = rows.find((r) => {
        const url = String(r?.settings?.site_web?.url || "");
        return normalizeDomain(url) === domain;
      });

      userId = match?.user_id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { ok: true, domain, user_id: null, articles: [] },
        { status: 200, headers: corsHeaders(req) }
      );
    }

    // 2) Fetch articles
    const { data: articles, error: artErr } = await supabase
      .from("site_articles")
      .select("id, created_at, title, content, images")
      .eq("user_id", userId)
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (artErr) throw artErr;

    return NextResponse.json(
      { ok: true, domain, user_id: userId, articles: articles || [] },
      { status: 200, headers: corsHeaders(req) }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
