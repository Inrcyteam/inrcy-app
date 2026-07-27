import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { loadAndPersistMailCampaignReport } from "@/lib/mailCampaignReportServer";
import { withApi } from "@/lib/observability/withApi";

export const runtime = "nodejs";

async function getRouteId(ctx: any) {
  const params = await ctx?.params;
  return String(params?.id || "").trim();
}

async function handler(_req: Request, ctx: any) {
  const { errorResponse, activeUserId } = await requireUser();
  if (errorResponse) return errorResponse;
  const campaignId = await getRouteId(ctx);
  if (!campaignId) return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });

  const report = await loadAndPersistMailCampaignReport({
    campaignId,
    userId: activeUserId,
  });
  if (!report) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  return NextResponse.json({ success: true, report });
}

export const GET = withApi(handler, { route: "/api/inrsend/campaigns/:id/report" });
