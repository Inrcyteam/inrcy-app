import { NextRequest, NextResponse } from "next/server";
import { getMyRole } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "inrcy-image-bank";

export async function GET(request: NextRequest) {
  const { isStaff } = await getMyRole();
  if (!isStaff) {
    return NextResponse.json({ error: "Accès admin requis." }, { status: 403 });
  }

  const url = new URL(request.url);
  const categoryId = url.searchParams.get("category_id");
  const limit = Math.min(Number(url.searchParams.get("limit") || 80), 200);

  let query = supabaseAdmin
    .from("inrcy_image_bank")
    .select(
      "id,category_id,storage_path,title,sector,job,tags,orientation,mime_type,width,height,size_bytes,source,source_url,license_ref,is_active,usage_count,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Impossible de charger les images.", detail: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const withUrls = await Promise.all(
    rows.map(async (row: any) => {
      const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 30);
      return {
        ...row,
        signed_url: signed.data?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ images: withUrls });
}
