import { NextResponse } from "next/server";
import { getGmbToken } from "@/lib/googleBusiness";
import { getGmbReviewTargetFromRow, gmbListReviews } from "@/lib/googleBusinessReviews";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const token = await getGmbToken();
    if (!token?.accessToken) {
      return NextResponse.json({
        connected: false,
        configured: false,
        accountName: null,
        locationName: null,
        locationTitle: null,
        averageRating: null,
        totalReviewCount: 0,
        nextPageToken: null,
        reviews: [],
      });
    }

    const target = getGmbReviewTargetFromRow(token.row);
    if (!target.accountName || !target.locationName) {
      return NextResponse.json({
        connected: true,
        configured: false,
        accountName: target.accountName,
        locationName: target.locationName,
        locationTitle: target.locationTitle,
        averageRating: null,
        totalReviewCount: 0,
        nextPageToken: null,
        reviews: [],
      });
    }

    const url = new URL(req.url);
    const pageSize = Number(url.searchParams.get("pageSize") || 50);
    const pageToken = url.searchParams.get("pageToken");
    const requestedOrderBy = url.searchParams.get("orderBy") || "updateTime desc";
    const orderBy = ["updateTime desc", "rating desc"].includes(requestedOrderBy) ? requestedOrderBy : "updateTime desc";

    const payload = await gmbListReviews(token.accessToken, target.accountName, target.locationName, {
      pageSize,
      pageToken,
      orderBy,
    });

    return NextResponse.json({ ...payload, locationTitle: target.locationTitle });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 500,
      fallback: "Impossible de charger les avis Google pour le moment.",
    });
  }
}
