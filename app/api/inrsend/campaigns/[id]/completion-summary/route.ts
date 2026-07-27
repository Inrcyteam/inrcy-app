import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { sendTrackedMailCampaignCompletionSummary } from "@/lib/mailCampaignCompletionEmail";
import { withApi } from "@/lib/observability/withApi";

export const runtime = "nodejs";

async function getRouteId(ctx: any) {
  const params = await ctx?.params;
  return String(params?.id || "").trim();
}

async function handler(_req: Request, ctx: any) {
  const { supabase, errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;
  const campaignId = await getRouteId(ctx);
  if (!campaignId) return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });

  const { data: campaign, error } = await supabase
    .from("mail_campaigns")
    .select("id,status")
    .eq("id", campaignId)
    .eq("user_id", activeUserId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de vérifier la campagne." }, { status: 500 });
  if (!campaign?.id) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  if (!["completed", "partial", "failed"].includes(String(campaign.status || "").toLowerCase())) {
    return NextResponse.json({ error: "Le bilan sera disponible à la fin de la campagne." }, { status: 409 });
  }

  const result = await sendTrackedMailCampaignCompletionSummary(campaignId, undefined, { force: true });
  if (!result.sent) {
    return NextResponse.json({ error: result.skippedReason || "Le bilan n’a pas pu être envoyé." }, { status: 502 });
  }
  return NextResponse.json({ success: true, sent: true });
}

export const POST = withApi(handler, { route: "/api/inrsend/campaigns/:id/completion-summary" });
