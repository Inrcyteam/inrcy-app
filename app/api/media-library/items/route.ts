import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "inrcy-pro-media";

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((tag) => cleanText(tag, 60).toLowerCase()).filter(Boolean).slice(0, 30);
  }

  return cleanText(value)
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
}

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

function tableMissingError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("pro_media_library");
}

function isOwnedStoragePath(userId: string, storagePath: string) {
  return storagePath.startsWith(`users/${userId}/`);
}

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const type = cleanText(url.searchParams.get("type"), 20) || "all";
  const active = cleanText(url.searchParams.get("active"), 20) || "active";
  const q = cleanText(url.searchParams.get("q"), 120);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 120), 1), 240);
  const fetchLimit = q ? 500 : limit;

  let query = supabaseAdmin
    .from("pro_media_library")
    .select("id,user_id,bucket_name,storage_path,media_type,mime_type,size_bytes,title,tags,source,width,height,duration_seconds,is_active,usage_count,last_used_at,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (type === "image" || type === "video") query = query.eq("media_type", type);
  if (active === "active") query = query.eq("is_active", true);
  else if (active === "inactive") query = query.eq("is_active", false);

  const { data, error } = await query;
  if (error) {
    if (tableMissingError(error)) {
      return jsonError("La Médiathèque n’est pas encore installée. Lance le SQL fourni dans Supabase.", 503, error.message);
    }
    return jsonError("Impossible de charger la médiathèque.", 500, error.message);
  }

  const rawRows = data ?? [];
  const normalizedQ = q.toLowerCase();
  const rows = (normalizedQ
    ? rawRows.filter((row: any) => {
        const haystack = [
          row.title,
          row.storage_path,
          row.source,
          row.media_type,
          ...(Array.isArray(row.tags) ? row.tags : []),
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(normalizedQ);
      })
    : rawRows
  ).slice(0, limit);

  const withUrls = await Promise.all(
    rows.map(async (row: any) => {
      const bucket = String(row.bucket_name || BUCKET);
      const signed = await supabaseAdmin.storage.from(bucket).createSignedUrl(row.storage_path, 60 * 60);
      return {
        ...row,
        signed_url: signed.data?.signedUrl ?? null,
      };
    }),
  );

  const stats = {
    total: rows.length,
    images: rows.filter((row: any) => row.media_type === "image").length,
    videos: rows.filter((row: any) => row.media_type === "video").length,
    total_bytes: rows.reduce((sum: number, row: any) => sum + Number(row.size_bytes || 0), 0),
  };

  return NextResponse.json({ ok: true, items: withUrls, stats });
}

export async function PATCH(request: NextRequest) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const id = cleanText(body?.id, 80);
  if (!id) return jsonError("Média obligatoire.", 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    patch.title = cleanText(body.title, 180) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "tags")) {
    patch.tags = cleanTags(body.tags);
  }
  if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
    patch.is_active = Boolean(body.is_active);
  }
  if (Object.prototype.hasOwnProperty.call(body, "source")) {
    patch.source = cleanText(body.source, 80) || "mediatheque";
  }

  const { data, error } = await supabaseAdmin
    .from("pro_media_library")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (tableMissingError(error)) return jsonError("La table pro_media_library n’existe pas encore.", 503, error.message);
    return jsonError("Impossible de mettre à jour le média.", 500, error.message);
  }
  if (!data) return jsonError("Média introuvable.", 404);

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(request: NextRequest) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"), 80);
  if (!id) return jsonError("Média obligatoire.", 400);

  const { data: row, error: fetchError } = await supabaseAdmin
    .from("pro_media_library")
    .select("id,bucket_name,storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    if (tableMissingError(fetchError)) return jsonError("La table pro_media_library n’existe pas encore.", 503, fetchError.message);
    return jsonError("Impossible de retrouver le média.", 500, fetchError.message);
  }
  if (!row) return jsonError("Média introuvable.", 404);

  const storagePath = String((row as any).storage_path || "");
  if (!isOwnedStoragePath(user.id, storagePath)) return jsonError("Chemin Storage invalide.", 403);

  const bucket = String((row as any).bucket_name || BUCKET);
  const remove = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
  if (remove.error) return jsonError("Impossible de supprimer le fichier Storage.", 500, remove.error.message);

  const del = await supabaseAdmin.from("pro_media_library").delete().eq("id", id).eq("user_id", user.id);
  if (del.error) return jsonError("Impossible de supprimer la ligne Supabase.", 500, del.error.message);

  return NextResponse.json({ ok: true });
}
