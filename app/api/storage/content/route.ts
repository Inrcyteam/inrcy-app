import { NextRequest, NextResponse } from "next/server";

import { probeStorageObject } from "@/lib/safeStorageSignedUrl";
import { verifyStorageContentToken } from "@/lib/storageContentUrl";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
}

export async function GET(request: NextRequest) {
  const bucket = String(request.nextUrl.searchParams.get("bucket") || "").trim();
  const storagePath = String(request.nextUrl.searchParams.get("path") || "")
    .trim()
    .replace(/^\/+/, "");
  const token = request.nextUrl.searchParams.get("token") || "";

  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(bucket) ||
    !storagePath ||
    storagePath.length > 1000 ||
    storagePath.includes("..") ||
    !verifyStorageContentToken(bucket, storagePath, token)
  ) {
    return notFound();
  }

  const probe = await probeStorageObject(bucket, storagePath);
  if (probe === "missing") return notFound();
  if (probe === "unknown") {
    return NextResponse.json(
      { error: "Stockage momentanément indisponible." },
      { status: 503 },
    );
  }

  const download = await supabaseAdmin.storage.from(bucket).download(storagePath);
  if (download.error || !download.data) {
    return NextResponse.json(
      { error: "Lecture momentanément indisponible." },
      { status: 503 },
    );
  }

  return new Response(download.data, {
    status: 200,
    headers: {
      "Content-Type": download.data.type || "application/octet-stream",
      "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
