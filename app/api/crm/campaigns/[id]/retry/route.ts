import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { processPendingMailCampaigns } from "@/lib/crmCampaigns";

export const runtime = "nodejs";

async function getRouteId(ctx: any) {
  const params = await ctx?.params;
  return String(params?.id || "").trim();
}

export async function POST(req: Request, ctx: any) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const campaignId = await getRouteId(ctx);
  if (!campaignId) {
    return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("mail_campaigns")
    .select("id,user_id,status")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }
  if (!campaign?.id) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: failedRows, error: failedError } = await supabase
    .from("mail_campaign_recipients")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .eq("status", "failed")
    .limit(1000);

  if (failedError) {
    return NextResponse.json({ error: failedError.message }, { status: 500 });
  }

  const ids = (failedRows || []).map((row: any) => String(row.id || "")).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Aucun échec à relancer." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("mail_campaign_recipients")
    .update({
      status: "queued",
      error: null,
      last_error: null,
      attempt_count: 0,
      next_attempt_at: now,
      processing_started_at: null,
      updated_at: now,
    })
    .in("id", ids)
    .eq("user_id", user.id)
    .eq("status", "failed");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase
    .from("mail_campaigns")
    .update({ status: "queued", finished_at: null, last_error: null, updated_at: now, last_activity_at: now })
    .eq("id", campaignId)
    .eq("user_id", user.id);

  const immediate = await processPendingMailCampaigns({ campaignIds: [campaignId], maxCampaigns: 1 });

  return NextResponse.json({
    success: true,
    campaignId,
    retried: ids.length,
    immediate,
  });
}
