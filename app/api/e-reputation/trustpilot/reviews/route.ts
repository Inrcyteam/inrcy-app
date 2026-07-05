import { NextResponse } from "next/server";

import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { requireUser } from "@/lib/requireUser";
import { listTrustpilotReviewsForUser } from "@/lib/trustpilotReviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { supabase, activeUserId, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    if (!(await isAppBubbleEnabledForUser(supabase, activeUserId, "trustpilot"))) {
      return bubbleAccessDisabledResponse("Trustpilot");
    }

    const url = new URL(req.url);
    const pageSize = Number(url.searchParams.get("pageSize") || 50);
    const pageToken = url.searchParams.get("pageToken");
    const payload = await listTrustpilotReviewsForUser(activeUserId, { pageSize, pageToken });

    return NextResponse.json(payload);
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 500,
      fallback: "Impossible de charger les avis Trustpilot pour le moment.",
    });
  }
}
