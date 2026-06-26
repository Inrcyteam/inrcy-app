import { NextResponse } from "next/server";
import { getGmbToken } from "@/lib/googleBusiness";
import {
  getGmbReviewTargetFromRow,
  gmbDeleteReviewReply,
  gmbReplyToReview,
  isGmbReviewNameForParent,
  normalizeGmbReviewName,
} from "@/lib/googleBusinessReviews";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { asRecord, asString } from "@/lib/tsSafe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_REPLY_LENGTH = 4096;

export async function POST(req: Request) {
  try {
    const { errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const body = asRecord(await req.json().catch(() => ({})));
    const reviewName = normalizeGmbReviewName(body.reviewName);
    const comment = (asString(body.comment) || "").trim();

    if (!reviewName) {
      return NextResponse.json(
        { error: "Avis Google introuvable.", user_message: "Avis Google introuvable." },
        { status: 400 }
      );
    }

    if (comment.length < 2) {
      return NextResponse.json(
        { error: "La réponse ne peut pas être vide.", user_message: "La réponse ne peut pas être vide." },
        { status: 400 }
      );
    }

    if (comment.length > MAX_REPLY_LENGTH) {
      return NextResponse.json(
        {
          error: `La réponse est trop longue. Maximum ${MAX_REPLY_LENGTH} caractères.`,
          user_message: `La réponse est trop longue. Maximum ${MAX_REPLY_LENGTH} caractères.`,
        },
        { status: 400 }
      );
    }

    const token = await getGmbToken();
    if (!token?.accessToken) {
      return NextResponse.json(
        { error: "Google Business n’est pas connecté.", user_message: "Google Business n’est pas connecté." },
        { status: 401 }
      );
    }

    const target = getGmbReviewTargetFromRow(token.row);
    if (!target.accountName || !target.locationName) {
      return NextResponse.json(
        {
          error: "Aucun établissement Google Business n’est sélectionné.",
          user_message: "Aucun établissement Google Business n’est sélectionné.",
        },
        { status: 400 }
      );
    }

    if (!isGmbReviewNameForParent(reviewName, target.accountName, target.locationName)) {
      return NextResponse.json(
        {
          error: "Cet avis ne correspond pas à l’établissement Google Business connecté.",
          user_message: "Cet avis ne correspond pas à l’établissement Google Business connecté.",
        },
        { status: 403 }
      );
    }

    const reply = await gmbReplyToReview(token.accessToken, reviewName, comment);

    return NextResponse.json({
      ok: true,
      reviewName,
      reply,
      replyStatus: "answered",
    });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 500,
      fallback: "Impossible de publier la réponse Google pour le moment.",
    });
  }
}


export async function DELETE(req: Request) {
  try {
    const { errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const body = asRecord(await req.json().catch(() => ({})));
    const reviewName = normalizeGmbReviewName(body.reviewName);

    if (!reviewName) {
      return NextResponse.json(
        { error: "Avis Google introuvable.", user_message: "Avis Google introuvable." },
        { status: 400 }
      );
    }

    const token = await getGmbToken();
    if (!token?.accessToken) {
      return NextResponse.json(
        { error: "Google Business n’est pas connecté.", user_message: "Google Business n’est pas connecté." },
        { status: 401 }
      );
    }

    const target = getGmbReviewTargetFromRow(token.row);
    if (!target.accountName || !target.locationName) {
      return NextResponse.json(
        {
          error: "Aucun établissement Google Business n’est sélectionné.",
          user_message: "Aucun établissement Google Business n’est sélectionné.",
        },
        { status: 400 }
      );
    }

    if (!isGmbReviewNameForParent(reviewName, target.accountName, target.locationName)) {
      return NextResponse.json(
        {
          error: "Cet avis ne correspond pas à l’établissement Google Business connecté.",
          user_message: "Cet avis ne correspond pas à l’établissement Google Business connecté.",
        },
        { status: 403 }
      );
    }

    await gmbDeleteReviewReply(token.accessToken, reviewName);

    return NextResponse.json({
      ok: true,
      reviewName,
      reply: null,
      replyStatus: "unanswered",
    });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 500,
      fallback: "Impossible de supprimer la réponse Google pour le moment.",
    });
  }
}
