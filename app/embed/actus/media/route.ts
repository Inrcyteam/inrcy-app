import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function jsonError(status: number) {
  return new NextResponse(null, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function extractBoosterStoragePath(raw: string): string | null {
  const source = String(raw || "").trim();
  if (!source) return null;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }

  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (configuredSupabaseUrl) {
    try {
      const expected = new URL(configuredSupabaseUrl);
      if (url.origin !== expected.origin) return null;
    } catch {
      // Keep parsing by path when the configured URL is malformed.
    }
  }

  const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/booster\/(.+)$/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]).replace(/^\/+/, "");
  } catch {
    return match[1].replace(/^\/+/, "");
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("src") || "";
  const path = extractBoosterStoragePath(src);
  if (!path) return jsonError(400);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const signed = await supabase.storage.from("booster").createSignedUrl(path, 60 * 60);
  const target = signed.data?.signedUrl;
  if (!target) return jsonError(404);

  return NextResponse.redirect(target, {
    status: 302,
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
