import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  const querySecret = new URL(req.url).searchParams.get("secret") || "";

  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("stats_cache")
    .delete()
    .lt("expires_at", new Date().toISOString());

  if (error) {
    console.error("Cleanup stats_cache error:", error);
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  return GET(req);
}
