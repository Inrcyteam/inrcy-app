import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/rateLimit";

const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const DEFAULT_UPLOAD_FOLDER = "booster-videos";

const MIME_EXTENSION: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "mp4",
};

const ALLOWED_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);

function normalizeMime(type: string) {
  return String(type || "").toLowerCase().split(";")[0]?.trim() || "";
}

function isAllowedVideoMime(type: string) {
  return /^video\/(mp4|webm|quicktime|x-m4v)$/i.test(normalizeMime(type));
}

function isAllowedVideoFile(file: File) {
  if (isAllowedVideoMime(file.type)) return true;
  const rawName = String(file.name || "").split(/[\\/]/).pop() || "";
  const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase() || "" : "";
  return ALLOWED_VIDEO_EXTENSIONS.has(ext);
}

function normalizeSafeSegment(value: string, fallback: string) {
  const safe = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 90);

  return safe || fallback;
}

function sanitizeUserId(userId: string) {
  return normalizeSafeSegment(userId, randomUUID()).replace(/\./g, "-");
}

function getSafeExtension(name: string, mimeType: string) {
  const mimeExtension = MIME_EXTENSION[normalizeMime(mimeType)];
  if (mimeExtension) return mimeExtension;

  const rawName = String(name || "").split(/[\\/]/).pop() || "";
  const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase() || "" : "";
  return ALLOWED_VIDEO_EXTENSIONS.has(ext) ? (ext === "m4v" ? "mp4" : ext) : "mp4";
}


function getSafeContentType(file: File) {
  const type = normalizeMime(String(file.type || ""));
  if (isAllowedVideoMime(type)) return type;
  const rawName = String(file.name || "").split(/[\\/]/).pop() || "";
  const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase() || "" : "";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "video/mp4";
}

function sanitizeFileName(name: string, mimeType: string) {
  const rawName = String(name || "video-inrcy").split(/[\\/]/).pop() || "video-inrcy";
  const withoutExtension = rawName.replace(/\.[^.]*$/, "");
  const base = normalizeSafeSegment(withoutExtension, "video-inrcy");
  return `${base}.${getSafeExtension(rawName, mimeType)}`.toLowerCase();
}

function sanitizeStorageFolder(folder: string) {
  return normalizeSafeSegment(folder, DEFAULT_UPLOAD_FOLDER).replace(/\./g, "-").toLowerCase();
}

function getRequestedFolder(path: string, userId: string) {
  const safeUserId = sanitizeUserId(userId);
  const cleanParts = String(path || "")
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/^\/+/, "")
    .trim()
    .split("/")
    .filter(Boolean);

  if (cleanParts[0] === userId || cleanParts[0] === safeUserId) cleanParts.shift();
  const firstFolder = cleanParts.find((part) => part !== "." && part !== "..");
  return sanitizeStorageFolder(firstFolder || DEFAULT_UPLOAD_FOLDER);
}

function sanitizeStoragePath(path: string, fallbackName: string, userId: string, mimeType: string) {
  const safeUserId = sanitizeUserId(userId);
  const rawParts = String(path || "")
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/^\/+/, "")
    .trim()
    .split("/")
    .filter(Boolean);

  if (rawParts[0] === userId || rawParts[0] === safeUserId) rawParts.shift();

  const cleanParts = rawParts.filter((part) => part !== "." && part !== "..");
  const rawFileName = cleanParts.length ? cleanParts[cleanParts.length - 1] : fallbackName;
  const fileName = sanitizeFileName(rawFileName || fallbackName, mimeType);
  const folders = cleanParts.slice(0, -1).map(sanitizeStorageFolder).filter(Boolean).slice(0, 4);

  const relativePath = [...(folders.length ? folders : [DEFAULT_UPLOAD_FOLDER]), fileName].join("/");
  return `${safeUserId}/${relativePath}`;
}

function buildFallbackStoragePath(userId: string, fallbackName: string, mimeType: string, requestedPath: string) {
  const safeUserId = sanitizeUserId(userId);
  const folder = getRequestedFolder(requestedPath, userId);
  return `${safeUserId}/${folder}/${randomUUID()}-${sanitizeFileName(fallbackName, mimeType)}`;
}

async function uploadToBoosterStorage(storagePath: string, buffer: Buffer, contentType: string) {
  return await supabaseAdmin.storage.from("booster").upload(storagePath, buffer, {
    contentType: contentType || "application/octet-stream",
    upsert: false,
    cacheControl: "3600",
  });
}

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const rateLimited = await enforceRateLimit({
      name: "booster_upload_video",
      identifier: user.id,
      limit: 10,
      window: "1 m",
      // Ne bloque pas l'upload si Upstash / KV est momentanément indisponible.
      failClosed: false,
    });
    if (rateLimited) return rateLimited;

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "Données invalides. Pour les vidéos, utilisez l’upload direct Supabase." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Vidéo manquante." }, { status: 400 });
    }

    if (!isAllowedVideoFile(file)) {
      return NextResponse.json({ error: "Format vidéo non autorisé. Formats acceptés : MP4/M4V, MOV ou WebM." }, { status: 400 });
    }

    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: "Vidéo trop lourde. Taille maximale : 40 Mo." }, { status: 413 });
    }

    const duration = Number(formData.get("duration") || 0);

    const requestedPath = String(formData.get("path") || "");
    const contentType = getSafeContentType(file);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let storagePath = sanitizeStoragePath(requestedPath, file.name || "video-inrcy.mp4", user.id, contentType);

    let upload = await uploadToBoosterStorage(storagePath, buffer, contentType);

    // Sécurité anti-casse : si Supabase refuse encore une clé ou si elle existe déjà,
    // on retente avec un nom 100 % généré côté serveur.
    if (upload.error) {
      const fallbackPath = buildFallbackStoragePath(user.id, file.name || "video-inrcy.mp4", contentType, requestedPath);
      if (fallbackPath !== storagePath) {
        const retry = await uploadToBoosterStorage(fallbackPath, buffer, contentType);
        if (!retry.error) {
          storagePath = fallbackPath;
          upload = retry;
        }
      }
    }

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message || "Upload vidéo impossible." }, { status: 500 });
    }

    const publicUrl = supabaseAdmin.storage.from("booster").getPublicUrl(storagePath)?.data?.publicUrl || null;

    return NextResponse.json({
      ok: true,
      name: file.name || "video-inrcy.mp4",
      type: contentType,
      size: file.size,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      storagePath,
      publicUrl,
    });
  } catch (e) {
    console.error("[Booster] upload-video failed", e);
    return NextResponse.json({ error: "Impossible d'uploader la vidéo." }, { status: 500 });
  }
}
