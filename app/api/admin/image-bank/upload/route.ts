import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdminApi } from "@/lib/adminSecurity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "inrcy-image-bank";
const MAX_FILES = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageBankCategory = {
  id: string;
  sector_slug: string;
  sector_label: string;
  job_slug: string;
  job_label: string;
  storage_prefix: string;
};

function cleanTags(raw: FormDataEntryValue | null) {
  return String(raw ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function cleanText(raw: FormDataEntryValue | null, fallback = "") {
  return String(raw ?? fallback).trim().slice(0, 500);
}

function orientationFromSize(width: number, height: number) {
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

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const form = await request.formData();
  const categoryId = cleanText(form.get("category_id"));
  if (!categoryId) {
    return NextResponse.json({ error: "Métier obligatoire." }, { status: 400 });
  }

  const category = await getCategory(categoryId);
  if (!category) {
    return NextResponse.json({ error: "Métier introuvable dans la banque iNrCy." }, { status: 404 });
  }

  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Ajoute au moins une image." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Import limité à ${MAX_FILES} images à la fois.` }, { status: 400 });
  }

  const tags = cleanTags(form.get("tags"));
  const source = cleanText(form.get("source"), "inrcy") || "inrcy";
  const sourceUrl = cleanText(form.get("source_url")) || null;
  const licenseRef = cleanText(form.get("license_ref")) || null;
  const baseTitle = cleanText(form.get("title"));

  const now = Date.now();
  const results: Array<{ id?: string; storage_path?: string; original_name: string; ok: boolean; error?: string }> = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const originalName = file.name || `image-${index + 1}.${extFromMime(file.type)}`;

    try {
      if (!ALLOWED_TYPES.has(file.type)) {
        throw new Error("Format non autorisé. Utilise JPG, PNG ou WebP.");
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new Error("Image trop lourde. Maximum 5 Mo.");
      }

      const inputBuffer = Buffer.from(await file.arrayBuffer());
      const optimized = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const meta = await sharp(optimized).metadata();
      const width = meta.width ?? null;
      const height = meta.height ?? null;
      const orientation = orientationFromSize(width ?? 0, height ?? 0);
      const safeIndex = String(index + 1).padStart(3, "0");
      const storagePath = `${category.storage_prefix}${category.job_slug}-${now}-${safeIndex}.webp`;

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
    ok: results.some((r) => r.ok),
    uploaded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
