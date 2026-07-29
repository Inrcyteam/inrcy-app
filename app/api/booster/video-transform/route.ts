import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "@/lib/mediaRules";
import {
  buildVideoTransformPlan,
  type BoosterVideoTransformRequestVariant,
  type BoosterVideoTransformSource,
} from "@/lib/boosterVideoTransforms";
import { prepareBoosterVideoVariantsOnServer } from "@/lib/boosterVideoVariantServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const rateLimited = await enforceRateLimit({
      name: "booster_video_transform",
      identifier: activeUserId,
      limit: 6,
      window: "1 m",
      failClosed: false,
    });
    if (rateLimited) return rateLimited;

    const body = (await req.json().catch(() => null)) as {
      source?: BoosterVideoTransformSource;
      variants?: BoosterVideoTransformRequestVariant[];
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Données de transformation vidéo invalides." },
        { status: 400 },
      );
    }

    const source = body.source || {};
    const variants = Array.isArray(body.variants) ? body.variants : [];
    if (!buildVideoTransformPlan(variants).length) {
      return NextResponse.json(
        { error: "Aucun format vidéo à générer." },
        { status: 400 },
      );
    }
    if (
      Number.isFinite(Number(source.size)) &&
      Number(source.size) > INR_MEDIA_VIDEO_SOURCE_MAX_BYTES
    ) {
      return NextResponse.json(
        { error: "Vidéo source trop lourde pour la transformation serveur." },
        { status: 413 },
      );
    }

    const result = await prepareBoosterVideoVariantsOnServer({
      accountId: activeUserId,
      source,
      variants,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[Booster] video-transform failed", error);
    return NextResponse.json(
      {
        ok: false,
        fallbackToOriginal: true,
        variants: [],
        errors: [
          {
            message:
              error?.message ||
              "Adaptation automatique indisponible : la vidéo originale sera utilisée.",
          },
        ],
      },
      { status: 200 },
    );
  }
}
