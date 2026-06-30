import { NextResponse } from "next/server";

import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { bubbleAccessDisabledResponse, isAppBubbleEnabledForUser } from "@/lib/appBubbleAccessServer";
import { requireUser } from "@/lib/requireUser";
import { asRecord, asString } from "@/lib/tsSafe";
import { trustpilotDeleteReviewReply, trustpilotReplyToReview } from "@/lib/trustpilotReviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_REPLY_LENGTH = 4096;

function clean(value: unknown, max = MAX_REPLY_LENGTH) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    if (!(await isAppBubbleEnabledForUser(supabase, user.id, "trustpilot"))) {
      return bubbleAccessDisabledResponse("Trustpilot");
    }

    const body = asRecord(await req.json().catch(() => ({})));
    const reviewName = clean(asString(body.reviewName), 140);
    const comment = clean(asString(body.comment), MAX_REPLY_LENGTH + 1);

    if (!reviewName) {
      return NextResponse.json(
        { error: "Avis Trustpilot introuvable.", user_message: "Avis Trustpilot introuvable." },
        { status: 400 },
      );
    }

    if (comment.length < 2) {
      return NextResponse.json(
        { error: "La réponse ne peut pas être vide.", user_message: "La réponse ne peut pas être vide." },
        { status: 400 },
      );
    }

    if (comment.length > MAX_REPLY_LENGTH) {
      return NextResponse.json(
        {
          error: `La réponse est trop longue. Maximum ${MAX_REPLY_LENGTH} caractères.`,
          user_message: `La réponse est trop longue. Maximum ${MAX_REPLY_LENGTH} caractères.`,
        },
        { status: 400 },
      );
    }

    const reply = await trustpilotReplyToReview(user.id, reviewName, comment);

    return NextResponse.json({
      ok: true,
      reviewName,
      reply,
      replyStatus: "answered",
    });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 500,
      fallback: "Impossible de publier la réponse Trustpilot pour le moment.",
    });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    if (!(await isAppBubbleEnabledForUser(supabase, user.id, "trustpilot"))) {
      return bubbleAccessDisabledResponse("Trustpilot");
    }

    const body = asRecord(await req.json().catch(() => ({})));
    const reviewName = clean(asString(body.reviewName), 140);

    if (!reviewName) {
      return NextResponse.json(
        { error: "Avis Trustpilot introuvable.", user_message: "Avis Trustpilot introuvable." },
        { status: 400 },
      );
    }

    await trustpilotDeleteReviewReply(user.id, reviewName);

    return NextResponse.json({
      ok: true,
      reviewName,
      reply: null,
      replyStatus: "unanswered",
    });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 500,
      fallback: "Impossible de supprimer la réponse Trustpilot pour le moment.",
    });
  }
}
