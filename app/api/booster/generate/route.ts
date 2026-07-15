import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  commitAiCredits,
  computeBoosterAiCredits,
  reserveAiCredits,
  rollbackAiCredits,
  isAdminUserForAi,
  type AiCreditReservation,
} from "@/lib/aiUsageQuota";
import { withApi } from "@/lib/observability/withApi";
import { generateSharedBoosterPosts } from "@/lib/boosterPublishGeneration";
import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "@/lib/mediaRules";
import {
  type BoosterChannels,
  type BoosterStyle,
  type BoosterTheme,
} from "@/lib/boosterPrompt";
import {
  normalizeAiPreferredEngine,
  type AiPreferredEngine,
} from "@/lib/aiEnginePreference";
import { getBoosterGenerationContext } from "@/lib/boosterGenerationContext";
import { readBoosterGenerationRequest } from "@/lib/boosterGenerationRequestTransport";
import { loadPersistedInrAgentVideoForAi } from "@/lib/inrAgentVideoContextCache";
import {
  normalizeVideoAiContextReference,
  type VideoAiContextReference,
} from "@/lib/videoAiContextReference";

export const maxDuration = 120;

type Payload = {
  idea?: string;
  publicationInstruction?: string;
  theme?: BoosterTheme;
  style?: BoosterStyle;
  aiPreferredEngine?: AiPreferredEngine;
  channels?: BoosterChannels[];
  mediaType?: "images" | "video";
  useImagesForAI?: boolean;
  imageCount?: number;
  imagesForAI?: Array<{ name?: string; type?: string; dataUrl?: string }>;
  videoForAI?: {
    name?: string;
    type?: string;
    size?: number;
    duration?: number | null;
    source?: "browser_file" | "supabase_storage";
    storagePath?: string;
    publicUrl?: string;
    url?: string;
    visualFrames?: Array<{
      name?: string;
      type?: string;
      dataUrl?: string;
      frameTarget?: "start" | "middle" | "end";
      timeSeconds?: number;
    }>;
    audioTranscript?: string | null;
    rawAudioTranscript?: string | null;
    contextRef?: VideoAiContextReference | null;
    analysisPlan?: {
      visualFrames?: "pending" | "ready";
      audioTranscript?: "pending" | "ready" | "unavailable";
      frameTargets?: Array<"start" | "middle" | "end">;
    };
  } | null;
};

type BoosterAiImage = {
  dataUrl: string;
  detail: "low" | "high" | "auto";
};

type BoosterVideoContext = {
  mimeType: string;
  size: number | null;
  duration: number | null;
  source: "browser_file" | "supabase_storage";
  storagePath: string;
  publicUrl: string;
  frameCount: number;
  audioTranscript: string;
  analysisPlan: {
    visualFrames: "pending" | "ready";
    audioTranscript: "pending" | "ready" | "unavailable";
    frameTargets: Array<"start" | "middle" | "end">;
  };
};

type JsonRecord = Record<string, unknown>;

const allowedChannels: BoosterChannels[] = [
  "inrcy_site",
  "site_web",
  "inr_search",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube_shorts",
  "pinterest",
];
const allowedThemes: BoosterTheme[] = [
  "",
  "promotion",
  "information",
  "conseil",
  "avis_client",
  "realisation",
  "actualite",
  "autre",
];
const allowedStyles: BoosterStyle[] = ["sobre", "equilibre", "dynamique"];
const siteChannels = new Set<BoosterChannels>(["inrcy_site", "site_web", "inr_search"]);
const AI_IMAGE_MAX_COUNT = 5;
const AI_IMAGE_MAX_DATA_URL_LENGTH = 3_500_000;
const AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH = 10_000_000;
const AI_IMAGE_DATA_URL_RE =
  /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const BOOSTER_MAX_VIDEO_BYTES = INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;
const BOOSTER_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

function normalizeGenerationMediaType(value: unknown): "images" | "video" {
  return value === "video" ? "video" : "images";
}

function cleanVideoTranscript(value: unknown, maxLength = 1800) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, "")
    .slice(0, maxLength)
    .trim();
}
function sanitizeImagesForAI(body: Payload): BoosterAiImage[] {
  if (!body.useImagesForAI || !Array.isArray(body.imagesForAI)) return [];

  const images: BoosterAiImage[] = [];
  let totalLength = 0;

  for (const image of body.imagesForAI.slice(0, AI_IMAGE_MAX_COUNT)) {
    const dataUrl = String(image?.dataUrl || "").trim();
    if (
      !dataUrl ||
      dataUrl.length > AI_IMAGE_MAX_DATA_URL_LENGTH ||
      !AI_IMAGE_DATA_URL_RE.test(dataUrl)
    ) {
      continue;
    }

    totalLength += dataUrl.length;
    if (totalLength > AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH) break;

    images.push({ dataUrl, detail: "low" });
  }

  return images;
}

function sanitizeVideoFramesForAI(body: Payload): BoosterAiImage[] {
  if (normalizeGenerationMediaType(body.mediaType) !== "video") return [];
  const frames = Array.isArray(body.videoForAI?.visualFrames)
    ? body.videoForAI?.visualFrames
    : [];

  const images: BoosterAiImage[] = [];
  let totalLength = 0;

  for (const frame of frames.slice(0, 3)) {
    const dataUrl = String(frame?.dataUrl || "").trim();
    if (
      !dataUrl ||
      dataUrl.length > AI_IMAGE_MAX_DATA_URL_LENGTH ||
      !AI_IMAGE_DATA_URL_RE.test(dataUrl)
    ) {
      continue;
    }

    totalLength += dataUrl.length;
    if (totalLength > AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH) break;

    images.push({ dataUrl, detail: "low" });
  }

  return images;
}

function sanitizeVideoForAI(body: Payload): BoosterVideoContext | null {
  if (normalizeGenerationMediaType(body.mediaType) !== "video") return null;
  const video = body.videoForAI;
  if (!video || typeof video !== "object") return null;

  const mimeType = String(video.type || "")
    .toLowerCase()
    .trim();
  const size = Number(video.size || 0);
  const duration = Number(video.duration || 0);

  const source =
    video.source === "supabase_storage" ? "supabase_storage" : "browser_file";
  const frameTargets = Array.isArray(video.analysisPlan?.frameTargets)
    ? video.analysisPlan.frameTargets.filter(
        (target): target is "start" | "middle" | "end" =>
          target === "start" || target === "middle" || target === "end",
      )
    : [];

  const audioTranscript = cleanVideoTranscript(
    video.audioTranscript || video.rawAudioTranscript,
  );
  const requestedAudioStatus = video.analysisPlan?.audioTranscript;

  return {
    mimeType: BOOSTER_VIDEO_MIME_TYPES.has(mimeType) ? mimeType : "video/mp4",
    size:
      Number.isFinite(size) && size > 0 && size <= BOOSTER_MAX_VIDEO_BYTES
        ? size
        : null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    source,
    storagePath: String(video.storagePath || "").trim(),
    publicUrl: String(video.publicUrl || video.url || "").trim(),
    frameCount: Array.isArray(video.visualFrames)
      ? video.visualFrames.length
      : 0,
    audioTranscript,
    analysisPlan: {
      visualFrames:
        Array.isArray(video.visualFrames) &&
        video.visualFrames.length > 0 &&
        video.analysisPlan?.visualFrames === "ready"
          ? "ready"
          : "pending",
      audioTranscript: audioTranscript
        ? "ready"
        : requestedAudioStatus === "unavailable"
          ? "unavailable"
          : "pending",
      frameTargets: frameTargets.length
        ? frameTargets
        : ["start", "middle", "end"],
    },
  };
}

function formatVideoDurationLabel(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) return `${rounded} seconde${rounded > 1 ? "s" : ""}`;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

function buildVideoGenerationInstructions(video: BoosterVideoContext | null) {
  if (!video) return "";

  const durationLabel = formatVideoDurationLabel(video.duration);
  const metadata = [
    durationLabel ? `durée approximative : ${durationLabel}` : "",
    video.mimeType
      ? `format : ${video.mimeType.replace("video/", "").toUpperCase()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ; ");
  const frameContext =
    video.analysisPlan.visualFrames === "ready" && video.frameCount > 0
      ? `Des captures extraites de la vidéo sont jointes au prompt (début, milieu, fin quand possible). Utilise-les pour enrichir le contenu avec des détails visibles, sans changer le sujet principal donné par la phrase libre.`
      : `Aucune capture exploitable n'est disponible : rédiger principalement à partir de l'intention libre du pro, de Mon activité, de Mon profil et du canal demandé.`;
  const audioContext = video.audioTranscript
    ? `Transcription audio détectée dans la vidéo :
"""${video.audioTranscript}"""
Utilise cette transcription comme contexte prioritaire pour comprendre ce qui est dit, les mots métier, les noms, les offres ou les précisions commerciales. Ne la cite pas forcément mot pour mot, transforme-la en publication propre.`
    : video.analysisPlan.audioTranscript === "unavailable"
      ? `Aucune parole exploitable n'a été détectée ou la transcription audio vidéo est indisponible : rédiger sans bloquer la génération.`
      : `La transcription audio vidéo n'est pas disponible : rédiger sans attendre l'audio.`;

  return `Contexte média fourni : 1 vidéo est jointe à la publication${metadata ? ` (${metadata})` : ""}.

${audioContext}

Règles vidéo obligatoires :
- La génération est en mode vidéo : le texte doit être adapté à une publication vidéo.
- ${frameContext}
- La phrase libre reste le sujet principal. La transcription audio complète l'intention quand elle existe ; si elle contredit clairement la phrase libre, privilégier la phrase libre.
- Les captures vidéo servent à préciser l'ambiance, le geste métier, le résultat visible, le produit, le lieu apparent ou le contexte quand c'est cohérent.
- Adapter le texte à une publication vidéo : accroche plus vivante, phrases concrètes, CTA qui incite à découvrir la réalisation, le produit, le conseil ou le moment présenté.
- Ne jamais inventer ce qui se voit ou s'entend dans la vidéo : lieu, personne, marque, avant/après, résultat précis, prix, certification, date, avis client ou détail technique non fourni.
- Si une capture est floue, ambiguë ou peu utile, l'ignorer plutôt que d'inventer.
- Ne pas écrire "on voit dans la vidéo", "regardez cette vidéo" ou "comme montré" si l'intention libre ne le permet pas.
- Ne pas parler de photo, d'image, de carrousel ou de visuel statique.
- Pour Instagram et Facebook : ton plus direct, dynamique et immersif.
- Pour LinkedIn : transformer le support vidéo en preuve de méthode, sérieux ou expertise.
- Pour Google Business : rester sobre, factuel et local.
- Pour Site iNrCy / Site web : utiliser la vidéo comme preuve de terrain, sans affirmer de détails non fournis.`;
}

const handler = async (req: Request) => {
  const routeStartedAt = Date.now();
  let quotaReservation: AiCreditReservation | null = null;
  let generationMs = 0;
  const timingContext: {
    userId?: string;
    engine?: AiPreferredEngine;
    selectedChannels?: number;
    mediaType?: string;
    imageCount?: number;
    videoFrameCount?: number;
    contextLoadMs?: number;
    professionalContextSource?: string;
    publicationsContextSource?: string;
    requestTransport?: "json" | "multipart";
    requestParseMs?: number;
    requestContentLength?: number;
    videoContextLoadMs?: number;
    videoContextReferenceSource?: "none" | "hit" | "invalid";
  } = {};
  try {
    const { supabase, authUserId, errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = activeUserId;
    timingContext.userId = userId;

    const isAdmin = await isAdminUserForAi(supabase, authUserId);

    if (!isAdmin) {
      const rl = await enforceRateLimit({
        name: "booster_generate",
        identifier: authUserId,
        limit: 10,
        window: "1 m",
      });
      if (rl) return rl;
    }

    const requestContentLength = Number(
      req.headers.get("content-length") || 0,
    );
    if (Number.isFinite(requestContentLength) && requestContentLength > 0) {
      timingContext.requestContentLength = requestContentLength;
    }
    const requestParseStartedAt = Date.now();
    const parsedRequest = await readBoosterGenerationRequest(req);
    const body = parsedRequest.body as Payload;
    timingContext.requestTransport = parsedRequest.transport;
    timingContext.requestParseMs = Date.now() - requestParseStartedAt;
    const idea = (body?.idea || "").trim();
    const publicationInstruction = String(
      body?.publicationInstruction || "",
    )
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, 4_000);
    if (!idea) {
      return NextResponse.json({ error: "Idée manquante." }, { status: 400 });
    }

    const theme = allowedThemes.includes(body?.theme as BoosterTheme)
      ? (body.theme as BoosterTheme)
      : "information";
    const style = allowedStyles.includes(body?.style as BoosterStyle)
      ? (body.style as BoosterStyle)
      : "equilibre";
    const aiPreferredEngine = body?.aiPreferredEngine
      ? normalizeAiPreferredEngine(body.aiPreferredEngine)
      : undefined;
    timingContext.engine = aiPreferredEngine;

    const channels = Array.from(
      new Set(
        (Array.isArray(body?.channels) ? body.channels : []).filter(
          (c): c is BoosterChannels =>
            allowedChannels.includes(c as BoosterChannels),
        ),
      ),
    );
    if (!channels.length) {
      return NextResponse.json({ error: "Canaux manquants." }, { status: 400 });
    }
    timingContext.selectedChannels = channels.length;

    const mediaType = normalizeGenerationMediaType(body.mediaType);
    let effectiveBody: Payload = body;
    timingContext.videoContextReferenceSource = "none";

    if (mediaType === "video") {
      const contextRef = normalizeVideoAiContextReference(
        body.videoForAI?.contextRef,
      );
      if (contextRef) {
        const contextLoadStartedAt = Date.now();
        const persistedVideoContext = await loadPersistedInrAgentVideoForAi({
          userId,
          reference: contextRef,
        });
        timingContext.videoContextLoadMs = Date.now() - contextLoadStartedAt;
        timingContext.videoContextReferenceSource = persistedVideoContext
          ? "hit"
          : "invalid";

        if (persistedVideoContext) {
          const existingVideo = body.videoForAI || {};
          const existingFrames = Array.isArray(existingVideo.visualFrames)
            ? existingVideo.visualFrames
            : [];
          const persistedFrames = persistedVideoContext.frames.map(
            (frame, index) => ({
              name: `inragent-frame-${index + 1}.jpg`,
              type: "image/jpeg",
              dataUrl: frame.dataUrl,
              frameTarget: (["start", "middle", "end"] as const)[index],
            }),
          );
          const audioTranscript =
            cleanVideoTranscript(existingVideo.audioTranscript) ||
            persistedVideoContext.transcript;

          effectiveBody = {
            ...body,
            videoForAI: {
              ...existingVideo,
              contextRef,
              visualFrames: existingFrames.length
                ? existingFrames
                : persistedFrames,
              audioTranscript,
              rawAudioTranscript:
                cleanVideoTranscript(existingVideo.rawAudioTranscript) ||
                persistedVideoContext.rawTranscript ||
                audioTranscript,
              analysisPlan: {
                ...existingVideo.analysisPlan,
                visualFrames:
                  existingFrames.length || persistedFrames.length
                    ? "ready"
                    : "pending",
                audioTranscript: audioTranscript ? "ready" : "unavailable",
                frameTargets: ["start", "middle", "end"],
              },
            },
          };
        }
      }
    }

    const imagesForAI = sanitizeImagesForAI({ ...effectiveBody, mediaType });
    const videoFrameImagesForAI = sanitizeVideoFramesForAI({
      ...effectiveBody,
      mediaType,
    });
    const videoForAI = sanitizeVideoForAI({ ...effectiveBody, mediaType });
    const mediaGenerationInstructions =
      buildVideoGenerationInstructions(videoForAI);
    timingContext.mediaType = mediaType;
    timingContext.imageCount = imagesForAI.length;
    timingContext.videoFrameCount = videoFrameImagesForAI.length;

    const contextStartedAt = Date.now();
    const generationContextPromise = getBoosterGenerationContext({
      supabase,
      userId,
    });

    if (!isAdmin) {
      const quota = await reserveAiCredits({
        supabase,
        userId,
        action: "booster",
        credits: computeBoosterAiCredits({
          mediaType,
          imagesForAI,
          videoForAI,
        }),
      });
      if (quota.errorResponse) return quota.errorResponse;
      quotaReservation = quota.reservation;
    }

    const generationContext = await generationContextPromise;
    timingContext.contextLoadMs = Date.now() - contextStartedAt;
    timingContext.professionalContextSource =
      generationContext.cacheSource.professional;
    timingContext.publicationsContextSource =
      generationContext.cacheSource.publications;

    const { profile, business, recentPublications } = generationContext;
    let generationResult: Awaited<ReturnType<typeof generateSharedBoosterPosts>> | null = null;
    const generationStartedAt = Date.now();
    try {
      generationResult = await generateSharedBoosterPosts({
        idea,
        publicationInstruction,
        theme,
        style,
        preferredEngine: aiPreferredEngine,
        channels,
        profile: (profile ?? null) as JsonRecord | null,
        business,
        recentPublications,
        imagesForAI:
          mediaType === "video"
            ? [...videoFrameImagesForAI, ...imagesForAI].slice(
                0,
                AI_IMAGE_MAX_COUNT,
              )
            : imagesForAI,
        mediaContext: mediaGenerationInstructions,
        mediaType,
        accountId: userId,
      });
    } finally {
      generationMs = Date.now() - generationStartedAt;
    }

    if (!generationResult) {
      throw new Error("La génération IA n'a pas pu retourner de résultat.");
    }

    const { versions, recoveredChannels, aiFallback } = generationResult;

    await commitAiCredits(quotaReservation);
    console.info("[booster-generate] route timing", {
      ...timingContext,
      generationMs,
      totalMs: Date.now() - routeStartedAt,
      recoveredChannels: recoveredChannels.length,
      aiFallbackStage: aiFallback?.stage,
      aiFallbackModel: aiFallback?.finalModel,
      success: true,
    });
    return NextResponse.json({
      versions,
      recoveredChannels,
      ...(aiFallback ? { aiFallback } : {}),
    });
  } catch (e: unknown) {
    await rollbackAiCredits(quotaReservation);
    console.warn("[booster-generate] route timing", {
      ...timingContext,
      generationMs,
      totalMs: Date.now() - routeStartedAt,
      success: false,
      message: e instanceof Error ? e.message : String(e || "Erreur inconnue"),
    });
    return jsonUserFacingError(e, {
      status: 502,
      fallback: "La génération IA n'a pas pu aboutir. Merci de réessayer.",
    });
  }
};

export const POST = withApi(handler, { route: "/api/booster/generate" });
