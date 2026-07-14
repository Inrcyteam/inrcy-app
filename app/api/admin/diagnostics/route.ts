import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminSecurity";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const TABLE = "inrcy_diagnostic_reports";

type DiagnosticStatus = "all" | "open" | "resolved";

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "open") as DiagnosticStatus;
  const q = cleanText(url.searchParams.get("q"), 120).replaceAll(",", " ");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);

  let query = supabaseAdmin
    .from(TABLE)
    .select("id,created_at,updated_at,status,source,reason,automatic,client_name,company,phone,message,summary,url,user_agent,report,resolved_at,resolved_by")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "open" || status === "resolved") {
    query = query.eq("status", status);
  }

  if (q) {
    query = query.or(`summary.ilike.%${q}%,company.ilike.%${q}%,client_name.ilike.%${q}%,phone.ilike.%${q}%,message.ilike.%${q}%,url.ilike.%${q}%,source.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({
      reports: [],
      tableReady: false,
      error: "Table diagnostics non disponible.",
      setupSql: "ops/sql/2026-06-10_admin_diagnostic_reports.sql",
    });
  }

  return NextResponse.json({ reports: data ?? [], tableReady: true });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  const body = await request.json().catch(() => ({}));
  const id = cleanText(body?.id, 80);
  const nextStatus = cleanText(body?.status, 20);

  if (!id) return NextResponse.json({ error: "Diagnostic obligatoire." }, { status: 400 });
  if (!["open", "resolved"].includes(nextStatus)) {
    return NextResponse.json({ error: "Statut diagnostic invalide." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "resolved") {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = authData?.user?.id ?? null;
  } else {
    patch.resolved_at = null;
    patch.resolved_by = null;
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("id,status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Diagnostic introuvable." }, { status: 404 });

  return NextResponse.json({ ok: true, report: data });
}
