import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { withApi } from "@/lib/observability/withApi";

export const runtime = "nodejs";

type PayloadV1 = {
  v: 1;
  domain: string;
  source: string;
  iat: number;
  exp: number;
};

function b64urlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function sign(payload: PayloadV1, secret: string) {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64urlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function originHost(req: Request): string {
  const origin = req.headers.get("origin") || "";
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
    } catch {}
  }
  return "";
}

function requestHost(req: Request): string {
  const h = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").trim();
  return h.toLowerCase().replace(/^www\./, "");
}

function requestProto(req: Request): string {
  return (req.headers.get("x-forwarded-proto") || "https").trim();
}

function parseAllowedOrigins(): string[] {
  return (process.env.INRCY_WIDGET_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

function corsHeaders(allowOrigin: string | null) {
  return {
    "Access-Control-Allow-Origin": allowOrigin || "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    Vary: "Origin",
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  // Preflight: we don't know the domain yet, answer with "null".
  return new NextResponse(null, { status: 204, headers: corsHeaders(null) });
}

const handler = async (req: Request) => {
  try {
    const secret = process.env.INRCY_WIDGETS_SIGNING_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "Missing INRCY_WIDGETS_SIGNING_SECRET" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const domain = normalizeDomain(searchParams.get("domain"));
    const source = (searchParams.get("source") || "").trim();

    if (!domain) {
      return NextResponse.json({ ok: false, error: "Missing domain" }, { status: 400, headers: corsHeaders(null) });
    }
    if (source !== "inrcy_site" && source !== "site_web") {
      return NextResponse.json({ ok: false, error: "Invalid source" }, { status: 400, headers: corsHeaders(null) });
    }

    // Must be an authenticated dashboard user.
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders(null) });
    }

    // Extra safety: ensure the domain belongs to THIS user for this source.
    if (source === "inrcy_site") {
      const { data, error } = await supabase
        .from("inrcy_site_configs")
        .select("site_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      const d = normalizeDomain((data as any)?.site_url || "");
      if (!d || d !== domain) {
        return NextResponse.json({ ok: false, error: "Domain not linked to your iNrCy site" }, { status: 403, headers: corsHeaders(null) });
      }
    } else {
      const { data, error } = await supabase
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const d = normalizeDomain((data as any)?.settings?.site_web?.url || "");
      if (!d || d !== domain) {
        return NextResponse.json({ ok: false, error: "Domain not linked to your website" }, { status: 403, headers: corsHeaders(null) });
      }
    }

    // CORS hard-binding (widgets) + dashboard allowlist (issuing tokens from app.inrcy.com).
    // - For embedded widgets: Origin must match the target domain.
    // - For the dashboard: allow explicit origins from env var INRCY_WIDGET_ALLOWED_ORIGINS.
    const origin = req.headers.get("origin");
    const originH = originHost(req);
    const allowedOrigins = parseAllowedOrigins();

    // Dashboard calls (Origin in allowlist)
    let allowOrigin: string | null = isAllowedOrigin(origin, allowedOrigins) ? origin! : null;

    // Widget calls (Origin host matches the domain)
    if (!allowOrigin && origin && originH === domain) {
      allowOrigin = origin;
    }

    // If Origin is missing (e.g., direct navigation or some same-origin calls), allow only if
    // the request host itself is on the allowlist.
    if (!allowOrigin && !origin) {
      const h = requestHost(req);
      const proto = requestProto(req);
      const effective = h ? `${proto}://${h}` : null;
      if (isAllowedOrigin(effective, allowedOrigins)) {
        allowOrigin = null; // Not needed for navigation; keep CORS conservative.
      } else {
        return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers: corsHeaders(null) });
      }
    }

    if (!allowOrigin && origin) {
      return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers: corsHeaders(null) });
    }

    const now = Math.floor(Date.now() / 1000);
    // Long-lived token (1 year). Rotation is possible by changing the signing secret.
    const payload: PayloadV1 = {
      v: 1,
      domain,
      source,
      iat: now,
      exp: now + 60 * 60 * 24 * 365,
    };

    const token = sign(payload, secret);
    return NextResponse.json({ ok: true, token, payload }, { status: 200, headers: corsHeaders(allowOrigin) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500, headers: corsHeaders(null) });
  }
};

export const GET = withApi(handler, { route: "/api/widgets/issue-token" });
