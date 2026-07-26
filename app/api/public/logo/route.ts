import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { LOGO_BUCKET } from "@/lib/profileLogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_LOGO_PATH = /^[0-9a-f-]{20,}\/logo\.(?:png|jpe?g|webp|svg)$/i;

function contentTypeFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "image/png";
}

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path")?.trim().replace(/^\/+/, "") || "";
  if (!ALLOWED_LOGO_PATH.test(path) || path.includes("..")) {
    return NextResponse.json({ error: "Logo invalide." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage.from(LOGO_BUCKET).download(path);
  if (error || !data) {
    const status = Number((error as { statusCode?: string | number } | null)?.statusCode || 0);
    return NextResponse.json(
      { error: "Logo introuvable." },
      { status: status === 404 || status === 400 ? 404 : 503 },
    );
  }

  return new NextResponse(data.stream(), {
    status: 200,
    headers: {
      "Content-Type": data.type || contentTypeFromPath(path),
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      ...(path.toLowerCase().endsWith(".svg")
        ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" }
        : {}),
    },
  });
}
