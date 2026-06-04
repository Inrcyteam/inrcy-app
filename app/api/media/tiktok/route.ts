import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTiktokMediaSignature } from "@/lib/tiktokMediaUrl";

function safeStoragePath(input: string) {
  const path = String(input || "").trim();
  if (!path) return "";
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return "";
  return path;
}

async function loadMedia(request: Request, includeBody: boolean) {
  const url = new URL(request.url);
  const path = safeStoragePath(url.searchParams.get("path") || "");
  const exp = Number(url.searchParams.get("exp") || "0");
  const sig = url.searchParams.get("sig") || "";

  if (!path || !verifyTiktokMediaSignature(path, exp, sig)) {
    return NextResponse.json({ error: "Lien média TikTok invalide ou expiré." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.storage.from("booster").download(path);
  if (error || !data) {
    return NextResponse.json({ error: "Média introuvable." }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", data.type || "application/octet-stream");
  headers.set("Content-Length", String(data.size || 0));
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");

  if (!includeBody) return new NextResponse(null, { status: 200, headers });
  return new NextResponse(data, { status: 200, headers });
}

export async function GET(request: Request) {
  return loadMedia(request, true);
}

export async function HEAD(request: Request) {
  return loadMedia(request, false);
}
