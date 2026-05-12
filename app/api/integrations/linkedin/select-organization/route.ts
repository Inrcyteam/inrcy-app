import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { asRecord } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { withCurrentConnectionVersion } from "@/lib/connectionVersions";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

async function invalidateUserStatsCache(supabase: SupabaseServerClient, userId: string) {
  await clearAllToolCaches(supabase, userId);
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const mode = String(body?.mode || "");
  const orgId = String(body?.orgId || "");
  const orgName = body?.orgName ? String(body.orgName) : null;

  const { data: currentIntegration } = await supabaseAdmin
    .from("integrations")
    .select("meta,provider_account_id,display_name")
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin")
    .maybeSingle();

  const currentRec = asRecord(currentIntegration);
  const currentMeta = asRecord(currentRec["meta"]);

  if (mode === "profile") {
    const providerAccountId = String(currentRec["provider_account_id"] || "");
    const profileUrn = providerAccountId ? `urn:li:person:${providerAccountId}` : null;
    const displayName = currentRec["display_name"] ? String(currentRec["display_name"]) : null;

    await supabaseAdmin
      .from("integrations")
      .update({
        resource_id: profileUrn,
        resource_label: displayName,
        meta: withCurrentConnectionVersion("channel:linkedin", {
          ...currentMeta,
          org_urn: null,
          org_id: null,
          org_name: null,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider", "linkedin")
      .eq("source", "linkedin")
      .eq("product", "linkedin");

    try {
      const { data: scRow } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
      const current = asRecord(asRecord(scRow)["settings"]);
      const merged = {
        ...current,
        linkedin: {
          ...asRecord(current["linkedin"]),
          accountConnected: true,
          connected: true,
          orgId: "",
          orgName: "",
        },
      };
      await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
    } catch {}

    await invalidateUserStatsCache(supabase, user.id);

    return NextResponse.json({ ok: true, mode: "profile" });
  }

  if (!orgId) return NextResponse.json({ error: "Organisation manquante." }, { status: 400 });

  const orgUrn = `urn:li:organization:${orgId}`;

  await supabaseAdmin
    .from("integrations")
    .update({
      resource_id: orgId,
      resource_label: orgName,
      meta: withCurrentConnectionVersion("channel:linkedin", {
        ...currentMeta,
        org_urn: orgUrn,
        org_id: orgId,
        org_name: orgName,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin");

  try {
    const { data: scRow } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = asRecord(asRecord(scRow)["settings"]);
    const merged = {
      ...current,
      linkedin: {
        ...asRecord(current["linkedin"]),
        accountConnected: true,
        connected: true,
        orgId,
        orgName,
      },
    };
    await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
  } catch {}

  await invalidateUserStatsCache(supabase, user.id);

  return NextResponse.json({ ok: true, mode: "organization", organizationId: orgId, organizationName: orgName, profileUrl: null });
}
