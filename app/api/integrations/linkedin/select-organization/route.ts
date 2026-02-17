import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

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

  const orgUrn = `urn:li:organization:${orgId}`;

  await supabase
    .from("stats_integrations")
    .update({ meta: { org_urn: orgUrn, org_id: orgId, org_name: orgName } })
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin");

  try {
    const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = (scRow as any)?.settings ?? {};
    const merged = {
      ...current,
      linkedin: {
        ...(current?.linkedin ?? {}),
        accountConnected: true,
        connected: true,
        orgId,
      },
    };
    await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
  } catch {}

  return NextResponse.json({ ok: true, profileUrl: null });
}
