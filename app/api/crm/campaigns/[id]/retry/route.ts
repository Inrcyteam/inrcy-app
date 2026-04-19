import { NextResponse } from "next/server";
import { evaluateCampaignDispatchState, getMailCampaignDeliveryConfig, processPendingMailCampaigns } from "@/lib/crmCampaigns";
import { requireUser } from "@/lib/requireUser";
import { fetchSuppressedEmailsByUser } from "@/lib/mailSuppression";

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
    .select("id,user_id,status,integration_id")
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
    .select("id,email,suppression_reason,bounce_type")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .eq("status", "failed")
    .limit(1000);

  if (failedError) {
    return NextResponse.json({ error: failedError.message }, { status: 500 });
  }

  const suppressedMap = await fetchSuppressedEmailsByUser(
    user.id,
    (failedRows || []).map((row: any) => String(row?.email || "")),
  );

  let blocked = 0;
  const ids = (failedRows || [])
    .filter((row: any) => {
      const email = String(row?.email || "").trim().toLowerCase();
      if (!email) return false;
      if (row?.suppression_reason) {
        blocked += 1;
        return false;
      }
      if (String(row?.bounce_type || "").toLowerCase() === "hard") {
        blocked += 1;
        return false;
      }
      if (suppressedMap.has(email)) {
        blocked += 1;
        return false;
      }
      return true;
    })
    .map((row: any) => String(row.id || ""))
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ error: blocked > 0 ? "Aucun échec relançable (adresses bloquées ou rebonds durs)." : "Aucun échec à relancer." }, { status: 400 });
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
      delivery_status: null,
      delivery_event: null,
      delivery_last_event_at: null,
      delivered_at: null,
      bounced_at: null,
    })
    .in("id", ids)
    .eq("user_id", user.id)
    .eq("status", "failed");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const dispatchState = await evaluateCampaignDispatchState({
    userId: user.id,
    integrationId: String(campaign.integration_id || ""),
    currentCampaignId: campaignId,
  });
  const deliveryConfig = getMailCampaignDeliveryConfig();
  const targetStatus = dispatchState.state === "paused" ? "paused" : "queued";

  await supabase
    .from("mail_campaigns")
    .update({
      status: targetStatus,
      finished_at: null,
      last_error: dispatchState.state === "ready" ? null : dispatchState.reason,
      updated_at: now,
      last_activity_at: now,
    })
    .eq("id", campaignId)
    .eq("user_id", user.id);

  let immediate: unknown = null;
  if (dispatchState.state === "ready") {
    immediate = await processPendingMailCampaigns({ campaignIds: [campaignId], maxCampaigns: 1 });
  }

  return NextResponse.json({
    success: true,
    campaignId,
    retried: ids.length,
    blocked,
    campaignStatus: dispatchState.state === "ready" ? "processing" : targetStatus,
    deferredReason: dispatchState.reason,
    batchSize: dispatchState.state === "ready" ? Math.max(1, dispatchState.availableNow) : deliveryConfig.batchSize,
    hourlyLimit: deliveryConfig.hourlyLimit,
    dailyLimit: deliveryConfig.dailyLimit,
    activeLimit: deliveryConfig.maxActivePerIntegration,
    immediate,
  });
}
