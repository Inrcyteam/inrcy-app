import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/rateLimit";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function isAllowedImageMime(type: string) {
  return /^image\/(png|jpe?g|webp|gif|avif|heic|heif)$/i.test(type || "");
}

function sanitizeFileName(name: string) {
  return String(name || "image")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "") || "image";
}

function sanitizeStoragePath(path: string, fallbackName: string, userId: string) {
  const clean = String(path || "")
    .replace(/\\/g, "/")
    .replace(/\.\.+/g, "")
    .replace(/^\/+/, "")
    .trim();

  const relative = clean || `booster-prepublish/${randomUUID()}-${sanitizeFileName(fallbackName)}`;
  return relative.startsWith(`${userId}/`) ? relative : `${userId}/${relative}`;
}

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const rateLimited = await enforceRateLimit({
      name: "booster_upload_prepared",
      identifier: user.id,
      limit: 20,
      window: "1 m",
      // Ne bloque pas l upload si Upstash / KV est momentanement indisponible.
      // Sinon l ajout d une photo empeche la publication avec une erreur 503.
      failClosed: false,
    });
    if (rateLimited) return rateLimited;

    const formData = await req.formData().catch(() => null);
    if (!formData) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }

    if (!isAllowedImageMime(file.type)) {
      return NextResponse.json({ error: "Format d’image non autorisé." }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image trop lourde. Taille maximale : 10 Mo." }, { status: 413 });
    }

    const requestedPath = String(formData.get("path") || "");
    const storagePath = sanitizeStoragePath(requestedPath, file.name || "image", user.id);
    const arrayBuffer = await file.arrayBuffer();

    const upload = await supabaseAdmin.storage.from("booster").upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message || "Upload impossible." }, { status: 500 });
    }

    const publicUrl = supabaseAdmin.storage.from("booster").getPublicUrl(storagePath)?.data?.publicUrl || null;

    return NextResponse.json({
      ok: true,
      storagePath,
      publicUrl,
    });
  } catch (e) {
    console.error("[Booster] upload-prepared failed", e);
    return NextResponse.json({ error: "Impossible d'uploader l'image préparée." }, { status: 500 });
  }
}
