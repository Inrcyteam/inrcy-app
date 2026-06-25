import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdminApi } from "@/lib/adminSecurity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "inrcy-image-bank";
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_MB_LABEL = "10 Mo";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageBankCategory = {
  id: string;
  sector_slug: string;
  sector_label: string;
  job_slug: string;
  job_label: string;
  storage_prefix: string;
};

type PrepareFile = {
  client_id?: unknown;
  name?: unknown;
  type?: unknown;
  size?: unknown;
};

type FinalizeUpload = {
  client_id?: unknown;
  original_name?: unknown;
  storage_path?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
  width?: unknown;
  height?: unknown;
};

function jsonError(message: string, status = 500, detail?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(detail ? { detail: String(detail) } : {}),
    },
    { status },
  );
}

function cleanTags(raw: unknown) {
  return String(raw ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function cleanText(raw: unknown, fallback = "", max = 500) {
  return String(raw ?? fallback).trim().slice(0, max);
}

function cleanNumber(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function cleanNullableDimension(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function orientationFromSize(width: number | null, height: number | null) {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (ratio > 1.12) return "paysage";
  if (ratio < 0.88) return "portrait";
  return "carre";
}

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function safeFileStem(name: string) {
  const base = String(name || "image-inrcy")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || "image-inrcy";
}

function assertAllowedFile(name: string, mime: string, size: number) {
  if (!ALLOWED_TYPES.has(mime)) {
    throw new Error(`${name || "Image"} : format non autorisé. Utilise JPG, PNG ou WebP.`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`${name || "Image"} : taille invalide.`);
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error(`${name || "Image"} : image trop lourde. Maximum ${MAX_FILE_MB_LABEL}.`);
  }
}

function buildStoragePath(category: ImageBankCategory, name: string, mime: string, index: number) {
  const extension = extFromMime(mime);
  const safeIndex = String(index + 1).padStart(3, "0");
  const unique = randomUUID().slice(0, 10);
  const prefix = category.storage_prefix.endsWith("/") ? category.storage_prefix : `${category.storage_prefix}/`;
  return `${prefix}${category.job_slug}-${Date.now()}-${safeIndex}-${unique}-${safeFileStem(name)}.${extension}`;
}

async function getCategory(categoryId: string): Promise<ImageBankCategory | null> {
  const { data, error } = await supabaseAdmin
    .from("inrcy_image_bank_categories")
    .select("id,sector_slug,sector_label,job_slug,job_label,storage_prefix")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return (data as ImageBankCategory | null) ?? null;
}

async function requireCategory(categoryId: string) {
  if (!categoryId) throw new Error("Métier obligatoire.");
  const category = await getCategory(categoryId);
  if (!category) throw new Error("Métier introuvable dans la banque iNrCy.");
  return category;
}

async function handlePrepareUpload(body: Record<string, unknown>) {
  const categoryId = cleanText(body.category_id, "", 80);
  const category = await requireCategory(categoryId);
  const files = Array.isArray(body.files) ? (body.files as PrepareFile[]) : [];
  if (files.length === 0) {
    return jsonError("Ajoute au moins une image.", 400);
  }
  if (files.length > MAX_FILES) {
    return jsonError(`Import limité à ${MAX_FILES} images par lot.`, 400);
  }

  const items = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const clientId = cleanText(file.client_id, `file-${index}`, 180);
    const name = cleanText(file.name, `image-${index + 1}`, 180);
    const mime = cleanText(file.type, "", 80);
    const size = cleanNumber(file.size);

    assertAllowedFile(name, mime, size);
    const storagePath = buildStoragePath(category, name, mime, index);
    const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
    if (signed.error || !signed.data?.token) {
      throw new Error(signed.error?.message || "Impossible de préparer l’upload Supabase.");
    }

    items.push({
      client_id: clientId,
      original_name: name,
      bucket: BUCKET,
      storage_path: storagePath,
      token: signed.data.token,
      signed_url: signed.data.signedUrl,
      content_type: mime,
      max_file_bytes: MAX_FILE_BYTES,
    });
  }

  return NextResponse.json({ ok: true, bucket: BUCKET, items, max_file_bytes: MAX_FILE_BYTES });
}

async function insertImageRows(category: ImageBankCategory, body: Record<string, unknown>) {
  const uploads = Array.isArray(body.uploads) ? (body.uploads as FinalizeUpload[]) : [];
  if (uploads.length === 0) {
    return jsonError("Aucune image à finaliser.", 400);
  }
  if (uploads.length > MAX_FILES) {
    return jsonError(`Finalisation limitée à ${MAX_FILES} images par lot.`, 400);
  }

  const tags = cleanTags(body.tags);
  const source = cleanText(body.source, "inrcy", 80) || "inrcy";
  const sourceUrl = cleanText(body.source_url, "", 600) || null;
  const licenseRef = cleanText(body.license_ref, "", 240) || null;
  const baseTitle = cleanText(body.title, "", 180);
  const results: Array<{ id?: string; storage_path?: string; original_name: string; ok: boolean; error?: string }> = [];

  for (let index = 0; index < uploads.length; index += 1) {
    const upload = uploads[index];
    const originalName = cleanText(upload.original_name, `image-${index + 1}`, 180);
    const storagePath = cleanText(upload.storage_path, "", 500);
    const mimeType = cleanText(upload.mime_type, "", 80);
    const sizeBytes = cleanNumber(upload.size_bytes);
    const width = cleanNullableDimension(upload.width);
    const height = cleanNullableDimension(upload.height);

    try {
      assertAllowedFile(originalName, mimeType, sizeBytes);
      if (!storagePath || !storagePath.startsWith(category.storage_prefix)) {
        throw new Error("Chemin Storage invalide pour ce métier.");
      }

      const orientation = orientationFromSize(width, height);
      const safeIndex = String(index + 1).padStart(3, "0");
      const title = baseTitle || `${category.job_label} ${safeIndex}`;
      const insert = await supabaseAdmin
        .from("inrcy_image_bank")
        .insert({
          category_id: category.id,
          bucket_name: BUCKET,
          storage_path: storagePath,
          title,
          sector: category.sector_slug,
          job: category.job_slug,
          tags,
          orientation,
          mime_type: mimeType,
          width,
          height,
          size_bytes: sizeBytes,
          source,
          source_url: sourceUrl,
          license_ref: licenseRef,
          is_active: true,
        })
        .select("id,storage_path")
        .single();

      if (insert.error) {
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
        throw insert.error;
      }

      results.push({
        ok: true,
        id: insert.data?.id,
        storage_path: insert.data?.storage_path,
        original_name: originalName,
      });
    } catch (error: any) {
      results.push({
        ok: false,
        original_name: originalName,
        error: error?.message || "Finalisation impossible.",
      });
    }
  }

  return NextResponse.json({
    ok: results.some((result) => result.ok),
    uploaded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
}

async function handleFinalizeUpload(body: Record<string, unknown>) {
  const categoryId = cleanText(body.category_id, "", 80);
  const category = await requireCategory(categoryId);
  return insertImageRows(category, body);
}

async function handleJsonUpload(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return jsonError("Requête d’import invalide.", 400);
  }

  const mode = cleanText(body.mode, "", 40);
  if (mode === "prepare") return handlePrepareUpload(body);
  if (mode === "finalize") return handleFinalizeUpload(body);

  return jsonError("Mode d’import inconnu.", 400);
}

async function handleMultipartUpload(request: NextRequest) {
  const form = await request.formData();
  const categoryId = cleanText(form.get("category_id"), "", 80);
  const category = await requireCategory(categoryId);

  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    return jsonError("Ajoute au moins une image.", 400);
  }
  if (files.length > MAX_FILES) {
    return jsonError(`Import limité à ${MAX_FILES} images à la fois.`, 400);
  }

  const tags = cleanTags(form.get("tags"));
  const source = cleanText(form.get("source"), "inrcy", 80) || "inrcy";
  const sourceUrl = cleanText(form.get("source_url"), "", 600) || null;
  const licenseRef = cleanText(form.get("license_ref"), "", 240) || null;
  const baseTitle = cleanText(form.get("title"), "", 180);

  const now = Date.now();
  const results: Array<{ id?: string; storage_path?: string; original_name: string; ok: boolean; error?: string }> = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const originalName = file.name || `image-${index + 1}.${extFromMime(file.type)}`;

    try {
      assertAllowedFile(originalName, file.type, file.size);

      const inputBuffer = Buffer.from(await file.arrayBuffer());
      const optimized = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const meta = await sharp(optimized).metadata();
      const width = meta.width ?? null;
      const height = meta.height ?? null;
      const orientation = orientationFromSize(width, height);
      const safeIndex = String(index + 1).padStart(3, "0");
      const prefix = category.storage_prefix.endsWith("/") ? category.storage_prefix : `${category.storage_prefix}/`;
      const storagePath = `${prefix}${category.job_slug}-${now}-${safeIndex}-${randomUUID().slice(0, 10)}.webp`;

      const upload = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, optimized, {
        contentType: "image/webp",
        upsert: false,
      });
      if (upload.error) throw upload.error;

      const title = baseTitle || `${category.job_label} ${safeIndex}`;
      const insert = await supabaseAdmin
        .from("inrcy_image_bank")
        .insert({
          category_id: category.id,
          bucket_name: BUCKET,
          storage_path: storagePath,
          title,
          sector: category.sector_slug,
          job: category.job_slug,
          tags,
          orientation,
          mime_type: "image/webp",
          width,
          height,
          size_bytes: optimized.byteLength,
          source,
          source_url: sourceUrl,
          license_ref: licenseRef,
          is_active: true,
        })
        .select("id,storage_path")
        .single();

      if (insert.error) {
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
        throw insert.error;
      }

      results.push({
        ok: true,
        id: insert.data?.id,
        storage_path: insert.data?.storage_path,
        original_name: originalName,
      });
    } catch (error: any) {
      results.push({
        ok: false,
        original_name: originalName,
        error: error?.message || "Import impossible.",
      });
    }
  }

  return NextResponse.json({
    ok: results.some((result) => result.ok),
    uploaded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminApi();
    if (!admin.ok) return admin.response;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await handleJsonUpload(request);
    }

    return await handleMultipartUpload(request);
  } catch (error: any) {
    const message = error?.message || "Import impossible.";
    const status = /métier obligatoire|métier introuvable|ajoute au moins|format non autorisé|trop lourde|invalide|limité/i.test(message) ? 400 : 500;
    return jsonError(message, status);
  }
}
