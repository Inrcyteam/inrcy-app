import { NextResponse } from "next/server";
import { getMyRole } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const { isStaff } = await getMyRole();
  if (!isStaff) {
    return NextResponse.json({ error: "Accès admin requis." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("inrcy_image_bank_categories")
    .select("id,sector_slug,sector_label,job_slug,job_label,storage_prefix,sort_order,is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Impossible de charger les métiers.", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] });
}
