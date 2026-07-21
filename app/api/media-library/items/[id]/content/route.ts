import { NextRequest, NextResponse } from "next/server";

import { verifyMediaLibraryContentToken } from "@/lib/mediaLibraryContentUrl";
import { probeStorageObject } from "@/lib/safeStorageSignedUrl";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "Média introuvable." }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = String(rawId || "").trim();
  const token = request.nextUrl.searchParams.get("token") || "";

  if (!id || !verifyMediaLibraryContentToken(id, token)) return notFound();

  const { data: row, error } = await supabaseAdmin
    .from("pro_media_library")
    .select("id,bucket_name,storage_path,mime_type,is_active")
    .eq("id", id)
    .maybeSingle();

  if (error || !row || row.is_active === false) return notFound();

  const bucket = String(row.bucket_name || "inrcy-pro-media").trim();
  const storagePath = String(row.storage_path || "").trim();
  if (!bucket || !storagePath) return notFound();

  const probe = await probeStorageObject(bucket, storagePath);
  if (probe === "unknown") {
    return NextResponse.json(
      { error: "Stockage momentanément indisponible." },
      { status: 503 },
    );
  }
  if (probe === "missing") {
    await supabaseAdmin
      .from("pro_media_library")
      .update({ is_active: false })
      .eq("id", id);
    return notFound();
  }

  const download = await supabaseAdmin.storage.from(bucket).download(storagePath);
  if (download.error || !download.data) {
    return NextResponse.json(
      { error: "Lecture du média momentanément indisponible." },
      { status: 503 },
    );
  }

  return new Response(download.data, {
    status: 200,
    headers: {
      "Content-Type":
        String(row.mime_type || download.data.type || "application/octet-stream"),
      "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
