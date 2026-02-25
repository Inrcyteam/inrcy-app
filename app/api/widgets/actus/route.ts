import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

// In-memory rate limit (best-effort). Works per server instance.
const RL_WINDOW_MS = 5 * 60 * 1000; // 5 min
const RL_MAX = 120; // per key / window
const rl = new Map<string, { count: number; resetAt: number }>();

function corsHeaders(req?: Request) {
  const origin = req?.headers.get("origin") || "";
  return {
    // We set this dynamically *after* verifying the widget token and origin.
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-InrCy-Widget-Token",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

type WidgetTokenPayload = {
  v: 1;
  domain: string;
  source: string;
  iat: number;
  exp: number;
};

function b64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecodeToBuffer(s: string) {
  const pad = s.length % 4;
  const base64 = (s + (pad ? "=".repeat(4 - pad) : ""))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function verifyWidgetToken(token: string, secret: string): WidgetTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid token format");
  const [body, sig] = parts;

  const expected = b64urlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  // Constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(b64urlDecodeToBuffer(body).toString("utf8")) as WidgetTokenPayload;
  if (!payload || payload.v !== 1) throw new Error("Invalid token payload");
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error("Token expired");
  return payload;
}

function originHost(req: Request): string {
  const origin = req.headers.get("origin") || "";
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      // ignore
    }
  }
  const ref = req.headers.get("referer") || "";
  if (ref) {
    try {
      return new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      // ignore
    }
  }
  return "";
}

function allowedCorsOrigin(req: Request, expectedDomain: string): string | null {
  const origin = req.headers.get("origin") || "";
  if (!origin) return null;
  try {
    const u = new URL(origin);
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    const dom = expectedDomain.toLowerCase().replace(/^www\./, "");
    if (host !== dom) return null;
    return origin;
  } catch {
    return null;
  }
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

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
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

    // ✅ Production-grade widget security (copy/paste-proof):
    // - Dashboard issues a SIGNED token bound to a specific domain + source.
    // - Endpoint verifies signature AND that browser Origin matches that domain.
    // - Copy/paste of the widget snippet to another domain stops working.
    const signingSecret = process.env.INRCY_WIDGETS_SIGNING_SECRET;
    if (!signingSecret) {
      throw new Error(
        "Missing INRCY_WIDGETS_SIGNING_SECRET (required for widgets security)"
      );
    }

    const providedToken =
      searchParams.get("token") || req.headers.get("x-inrcy-widget-token") || "";
    if (!providedToken) {
      return NextResponse.json(
        { ok: false, error: "Missing token" },
        { status: 401, headers: corsHeaders(req) }
      );
    }

    const tok = verifyWidgetToken(providedToken, signingSecret);
    const tokDomain = normalizeDomain(tok.domain);
    const tokSource = String(tok.source || "").trim();
    if (!tokDomain || tokDomain !== domain) {
      return NextResponse.json(
        { ok: false, error: "Token/domain mismatch" },
        { status: 403, headers: corsHeaders(req) }
      );
    }
    if (!tokSource || tokSource !== source) {
      return NextResponse.json(
        { ok: false, error: "Token/source mismatch" },
        { status: 403, headers: corsHeaders(req) }
      );
    }

    // Origin hard-binding: request must come from the same domain as the token.
    const host = originHost(req);
    if (!host || host !== tokDomain) {
      return NextResponse.json(
        { ok: false, error: "Origin not allowed" },
        { status: 403, headers: corsHeaders(req) }
      );
    }

    const allowOrigin = allowedCorsOrigin(req, tokDomain);
    const headersOk = {
      ...corsHeaders(req),
      "Access-Control-Allow-Origin": allowOrigin || "null",
    };

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
      userId = (data as unknown)?.user_id ?? null;
    } else {
      // site_web: pro_tools_configs has settings JSON with settings.site_web.url
      const { data, error } = await supabase
        .from("pro_tools_configs")
        .select("user_id, settings")
        .limit(200); // small enough in practice; optimize later if needed

      if (error) throw error;

      const rows = (data || []) as unknown[];
      const match = rows.find((r) => {
        const url = String(r?.settings?.site_web?.url || "");
        return normalizeDomain(url) === domain;
      });

      userId = match?.user_id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { ok: true, domain, user_id: null, articles: [] },
        { status: 200, headers: headersOk }
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
      { status: 200, headers: headersOk }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e instanceof Error ? e.message : String(e)) || "Server error" },
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
