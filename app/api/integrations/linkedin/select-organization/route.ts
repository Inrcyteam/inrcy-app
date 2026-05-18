import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { asRecord, asString } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { withCurrentConnectionVersion } from "@/lib/connectionVersions";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

async function invalidateUserStatsCache(
  supabase: SupabaseServerClient,
  userId: string,
) {
  await clearAllToolCaches(supabase, userId);
}

function normalizeCompanyUrl(orgId: string, orgUrl?: string | null) {
  const raw = String(orgUrl || "").trim();
  if (
    raw.startsWith("https://www.linkedin.com/company/") ||
    raw.startsWith("https://linkedin.com/company/")
  )
    return raw;
  return `https://www.linkedin.com/company/${orgId}`;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user)
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const mode = String(body?.mode || "");
  const orgId = String(body?.orgId || "").trim();
  const orgName = body?.orgName ? String(body.orgName).trim() : null;
  const orgUrl = body?.orgUrl
    ? normalizeCompanyUrl(orgId, String(body.orgUrl))
    : orgId
      ? normalizeCompanyUrl(orgId)
      : null;

  const { data: currentIntegration } = await supabaseAdmin
    .from("integrations")
    .select("meta,provider_account_id,display_name,resource_label")
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin")
    .maybeSingle();

  const currentRec = asRecord(currentIntegration);
  const currentMeta = asRecord(currentRec["meta"]);
  const providerAccountId = asString(currentRec["provider_account_id"]);
  const profileUrn =
    asString(currentMeta["profile_urn"]) ||
    (providerAccountId ? `urn:li:person:${providerAccountId}` : null);
  const displayName =
    asString(currentMeta["profile_display_name"]) ||
    asString(currentRec["display_name"]) ||
    asString(currentRec["resource_label"]) ||
    null;
  const profileUrl = asString(currentMeta["profile_url"]) || null;

  if (mode === "profile") {
    await supabaseAdmin
      .from("integrations")
      .update({
        resource_id: profileUrn,
        resource_label: displayName,
        meta: withCurrentConnectionVersion("channel:linkedin", {
          ...currentMeta,
          profile_display_name: displayName,
          profile_url: profileUrl,
          profile_urn: profileUrn,
          org_urn: null,
          org_id: null,
          org_name: null,
          org_url: null,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider", "linkedin")
      .eq("source", "linkedin")
      .eq("product", "linkedin");

    try {
      const { data: scRow } = await supabaseAdmin
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();
      const current = asRecord(asRecord(scRow)["settings"]);
      const merged = {
        ...current,
        linkedin: {
          ...asRecord(current["linkedin"]),
          accountConnected: true,
          connected: true,
          displayName,
          url:
            profileUrl ||
            asString(asRecord(current["linkedin"])["profileUrl"]) ||
            asString(asRecord(current["linkedin"])["url"]) ||
            "",
          profileUrl:
            profileUrl ||
            asString(asRecord(current["linkedin"])["profileUrl"]) ||
            "",
          orgId: "",
          orgName: "",
          orgUrl: "",
        },
      };
      await supabaseAdmin
        .from("pro_tools_configs")
        .upsert(
          { user_id: user.id, settings: merged },
          { onConflict: "user_id" },
        );
    } catch {}

    await invalidateUserStatsCache(supabase, user.id);

    return NextResponse.json({ ok: true, mode: "profile", profileUrl });
  }

  if (!orgId)
    return NextResponse.json(
      { error: "Organisation manquante." },
      { status: 400 },
    );

  const orgUrn = `urn:li:organization:${orgId}`;
  const finalOrgName = orgName || orgId;
  const finalOrgUrl = orgUrl || normalizeCompanyUrl(orgId);

  await supabaseAdmin
    .from("integrations")
    .update({
      resource_id: orgId,
      resource_label: finalOrgName,
      meta: withCurrentConnectionVersion("channel:linkedin", {
        ...currentMeta,
        profile_display_name: displayName,
        profile_url: profileUrl,
        profile_urn: profileUrn,
        org_urn: orgUrn,
        org_id: orgId,
        org_name: finalOrgName,
        org_url: finalOrgUrl,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "linkedin")
    .eq("source", "linkedin")
    .eq("product", "linkedin");

  try {
    const { data: scRow } = await supabaseAdmin
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();
    const current = asRecord(asRecord(scRow)["settings"]);
    const currentLinkedin = asRecord(current["linkedin"]);
    const merged = {
      ...current,
      linkedin: {
        ...currentLinkedin,
        accountConnected: true,
        connected: true,
        displayName,
        url: finalOrgUrl,
        profileUrl: profileUrl || asString(currentLinkedin["profileUrl"]) || "",
        orgId,
        orgName: finalOrgName,
        orgUrl: finalOrgUrl,
      },
    };
    await supabaseAdmin
      .from("pro_tools_configs")
      .upsert(
        { user_id: user.id, settings: merged },
        { onConflict: "user_id" },
      );
  } catch {}

  await invalidateUserStatsCache(supabase, user.id);

  return NextResponse.json({
    ok: true,
    mode: "organization",
    organizationId: orgId,
    organizationName: finalOrgName,
    organizationUrl: finalOrgUrl,
    profileUrl: finalOrgUrl,
  });
}
