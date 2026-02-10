import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  };
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
    throw new Error("Missing SUPABASE env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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
    const source = (searchParams.get("source") || "site_web").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "5", 10) || 5, 1), 20);

    if (!domain) {
      return NextResponse.json(
        { ok: false, error: "Missing domain" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const supabase = getSupabaseAdmin();

    // 1) Find user_id for this domain depending on source
    let userId: string | null = null;

    if (source === "site_inrcy") {
      const { data, error } = await supabase
        .from("inrcy_site_configs")
        .select("user_id, domain, site_domain")
        .or(`domain.eq.${domain},site_domain.eq.${domain}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      userId = (data as any)?.user_id ?? null;
    } else {
      // site_web by default
      const { data, error } = await supabase
        .from("pro_tools_configs")
        .select("user_id, domain, site_domain")
        .or(`domain.eq.${domain},site_domain.eq.${domain}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      userId = (data as any)?.user_id ?? null;
    }

    if (!userId) {
      // Do not 404; widgets should fail gracefully.
      return NextResponse.json(
        { ok: true, domain, user_id: null, articles: [] },
        { status: 200, headers: corsHeaders() }
      );
    }

    // 2) Fetch articles
    const { data: articles, error: artErr } = await supabase
      .from("site_articles")
      .select("id, created_at, title, content")
      .eq("user_id", userId)
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (artErr) throw artErr;

    return NextResponse.json(
      { ok: true, domain, user_id: userId, articles: articles || [] },
      { status: 200, headers: corsHeaders() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
