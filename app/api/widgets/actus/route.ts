import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function normalizeDomain(input: string): string {
  const raw = (input || "").trim().toLowerCase();
  if (!raw) return "";

  // Try URL parsing; if it fails, treat as hostname.
  try {
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "");
    return host;
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .replace(/^www\./, "");
  }
}

function cors(json: any, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return cors(
        {
          ok: false,
          error:
            "Supabase admin credentials missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
        },
        500
      );
    }

    const url = new URL(req.url);
    const domainParam = url.searchParams.get("domain") || "";
    const sourceParam = (url.searchParams.get("source") || "").toLowerCase();
    const limitParam = Number(url.searchParams.get("limit") || "5");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10) : 5;

    const domain = normalizeDomain(domainParam);
    if (!domain) {
      return cors({ ok: false, error: "Missing domain." }, 400);
    }

    // 1) Resolve user_id by domain
    let userId: string | null = null;

    const tryInrcy = async () => {
      const { data } = await supabaseAdmin
        .from("inrcy_site_configs")
        .select("user_id, site_url")
        .limit(200);
      const match = (data || []).find((r: any) =>
        typeof r?.site_url === "string"
          ? normalizeDomain(r.site_url).includes(domain)
          : false
      );
      return match?.user_id || null;
    };

    const tryWeb = async () => {
      const { data } = await supabaseAdmin
        .from("pro_tools_configs")
        .select("user_id, settings")
        .limit(200);
      const match = (data || []).find((r: any) => {
        const url = r?.settings?.site_web?.url || r?.settings?.site_web?.domain;
        return typeof url === "string" ? normalizeDomain(url).includes(domain) : false;
      });
      return match?.user_id || null;
    };

    if (sourceParam === "site_inrcy") {
      userId = await tryInrcy();
    } else if (sourceParam === "site_web") {
      userId = await tryWeb();
    } else {
      userId = (await tryInrcy()) || (await tryWeb());
    }

    if (!userId) {
      return cors({ ok: false, error: "Unknown domain." }, 404);
    }

    // 2) Fetch last articles
    let q = supabaseAdmin
      .from("site_articles")
      .select("id, created_at, source, title, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (sourceParam === "site_inrcy" || sourceParam === "site_web") {
      q = q.eq("source", sourceParam);
    }

    const { data: articles, error } = await q;
    if (error) {
      return cors({ ok: false, error: error.message }, 500);
    }

    return cors({ ok: true, domain, user_id: userId, articles: articles || [] }, 200);
  } catch (e: any) {
    return cors({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
}
