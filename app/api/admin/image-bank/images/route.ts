import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminSecurity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "inrcy-image-bank";

function cleanText(value: unknown, max = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function cleanTags(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((tag) => cleanText(tag, 60).toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
  }

  return cleanText(value)
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const categoryId = url.searchParams.get("category_id");
  const active = url.searchParams.get("active") || "active";
  const source = url.searchParams.get("source") || "all";
  const q = cleanText(url.searchParams.get("q"), 120);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 80), 1),
    200,
  );

  let query = supabaseAdmin
    .from("inrcy_image_bank")
    .select(
      "id,category_id,storage_path,title,sector,job,tags,orientation,mime_type,width,height,size_bytes,source,source_url,license_ref,is_active,usage_count,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (active === "active") {
    query = query.eq("is_active", true);
  } else if (active === "inactive") {
    query = query.eq("is_active", false);
  }

  if (source !== "all") {
    query = query.eq("source", source);
  }

  if (q) {
    const safeQ = q.replaceAll(",", " ");
    query = query.or(
      `storage_path.ilike.%${safeQ}%,title.ilike.%${safeQ}%,job.ilike.%${safeQ}%,source.ilike.%${safeQ}%,license_ref.ilike.%${safeQ}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Impossible de charger les images." },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const withUrls = await Promise.all(
    rows.map(async (row: any) => {
      const storage = supabaseAdmin.storage.from(BUCKET);
      const [thumbnailSigned, originalSigned] = await Promise.all([
        storage.createSignedUrl(row.storage_path, 60 * 30, {
          transform: {
            width: 320,
            height: 320,
            resize: "cover",
            quality: 72,
          },
        }),
        storage.createSignedUrl(row.storage_path, 60 * 30),
      ]);

      return {
        ...row,
        signed_url:
          thumbnailSigned.data?.signedUrl ??
          originalSigned.data?.signedUrl ??
          null,
        original_signed_url: originalSigned.data?.signedUrl ?? null,
      };
    }),
  );

  return NextResponse.json({ images: withUrls });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => ({}));
  const id = cleanText(body?.id, 80);
  if (!id) {
    return NextResponse.json({ error: "Image obligatoire." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    patch.title = cleanText(body.title, 180) || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "tags")) {
    patch.tags = cleanTags(body.tags);
  }

  if (Object.prototype.hasOwnProperty.call(body, "source")) {
    patch.source = cleanText(body.source, 80) || "inrcy";
  }

  if (Object.prototype.hasOwnProperty.call(body, "source_url")) {
    patch.source_url = cleanText(body.source_url, 600) || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "license_ref")) {
    patch.license_ref = cleanText(body.license_ref, 240) || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
    patch.is_active = Boolean(body.is_active);
  }

  const { data, error } = await supabaseAdmin
    .from("inrcy_image_bank")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Impossible de mettre à jour l’image." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, image: data });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const requestedIds = [
    cleanText(url.searchParams.get("id"), 80),
    ...url.searchParams.getAll("ids").map((value) => cleanText(value, 80)),
    ...(Array.isArray(body?.ids)
      ? body.ids.map((value: unknown) => cleanText(value, 80))
      : []),
  ]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .slice(0, 200);

  if (!requestedIds.length) {
    return NextResponse.json({ error: "Image obligatoire." }, { status: 400 });
  }

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from("inrcy_image_bank")
    .select("id,storage_path")
    .in("id", requestedIds);

  if (fetchError) {
    return NextResponse.json(
      {
        error: "Impossible de retrouver les images.",
      },
      { status: 500 },
    );
  }

  const foundRows = Array.isArray(rows) ? rows : [];
  if (!foundRows.length) {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }

  const storagePaths = foundRows
    .map((row: any) => cleanText(row.storage_path, 900))
    .filter(Boolean);

  if (storagePaths.length) {
    const remove = await supabaseAdmin.storage
      .from(BUCKET)
      .remove(storagePaths);
    if (remove.error) {
      return NextResponse.json(
        {
          error: "Impossible de supprimer les fichiers Storage.",
          detail: remove.error.message,
        },
        { status: 500 },
      );
    }
  }

  const foundIds = foundRows
    .map((row: any) => cleanText(row.id, 80))
    .filter(Boolean);
  const del = await supabaseAdmin
    .from("inrcy_image_bank")
    .delete()
    .in("id", foundIds);
  if (del.error) {
    return NextResponse.json(
      {
        error: "Impossible de supprimer les lignes Supabase.",
        detail: del.error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, deleted: foundIds.length });
}
