import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { invalidateUserIntegrationCaches, mergeProToolSettings } from "@/lib/integrationSync";
import { asRecord } from "@/lib/tsSafe";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orgId = String(body?.orgId || "");
  const orgName = body?.orgName ? String(body.orgName) : null;
  if (!orgId) return NextResponse.json({ error: "Missing orgId" }, { status: 400 });

  const { data: currentRow } = await supabase
    .from("integrations")
    .select("meta")
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin")
    .maybeSingle();

  const orgUrn = `urn:li:organization:${orgId}`;
  const prevMeta = asRecord(asRecord(currentRow)["meta"]);

  const { error: updateErr } = await supabase
    .from("integrations")
    .update({ meta: { ...prevMeta, org_urn: orgUrn, org_id: orgId, org_name: orgName }, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin");

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  try {
    await mergeProToolSettings(supabase, user.id, "linkedin", {
      accountConnected: true,
      connected: true,
      orgId,
    });
  } catch {}

  await invalidateUserIntegrationCaches(supabase, user.id);
  return NextResponse.json({ ok: true, profileUrl: null });
}
