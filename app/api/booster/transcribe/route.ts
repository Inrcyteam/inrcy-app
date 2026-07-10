import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { aiGenerateJSON } from "@/lib/aiGatewayClient";
import { type AiPreferredEngine } from "@/lib/aiEnginePreference";
import { buildNormalizedAiGenerationProfile } from "@/lib/aiGenerationProfile";
import { withApi } from "@/lib/observability/withApi";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES } from "@/lib/mediaRules";
import {
  commitAiCredits,
  reserveAiCredits,
  rollbackAiCredits,
  isAdminUserForAi,
  type AiCreditReservation,
} from "@/lib/aiUsageQuota";
import { aiTranscribeMedia } from "@/lib/aiGatewayTranscription";
import { extractVideoAudioForGateway } from "@/lib/transcriptionMedia";

export const runtime = "nodejs";
export const maxDuration = 120;

type CorrectionResponse = {
  text?: string;
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_TRANSCRIBE_BYTES = 40 * 1024 * 1024;
const MIN_AUDIO_BYTES = 900;
const ALLOWED_AUDIO_PREFIXES = ["audio/"];
const ALLOWED_VIDEO_MIME_TYPES = new Set<string>(
  INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES,
);

function normalizeMime(type: string) {
  return (
    String(type || "")
      .toLowerCase()
      .split(";")[0]
      ?.trim() || ""
  );
}

function isFileLike(value: FormDataEntryValue | null | undefined): value is File {
  if (!value || typeof value === "string") return false;
  const candidate = value as File;
  return (
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function videoTranscriptionSkipped(source: string) {
  return NextResponse.json({
    ok: true,
    text: "",
    raw_text: "",
    source,
    skipped: true,
  });
}

function isAllowedAudioFile(file: File) {
  const type = normalizeMime(file.type || "");
  if (!type) return true;
  return ALLOWED_AUDIO_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function isAllowedVideoFile(file: File) {
  const type = normalizeMime(file.type || "");
  const name = String(file.name || "").toLowerCase();
  if (!type && /\.(mp4|mov|webm|m4v)$/i.test(name)) return true;
  return (
    ALLOWED_VIDEO_MIME_TYPES.has(type) || /\.(mp4|mov|webm|m4v)$/i.test(name)
  );
}

function cleanTranscriptText(value: unknown, maxLength = 1400) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^['\"“”‘’]+|['\"“”‘’]+$/g, "")
    .slice(0, maxLength)
    .trim();
}

async function transcribeMedia(
  file: File,
  options: { source: "audio" | "video"; accountId: string },
) {
  let gatewayFile = file;
  let mediaType = normalizeMime(file.type || "") || "audio/webm";

  if (options.source === "video") {
    try {
      gatewayFile = await extractVideoAudioForGateway(file);
      mediaType = "audio/mpeg";
    } catch (error) {
      // La transcription vidéo est un bonus. On garde un dernier essai best-effort
      // avec le conteneur original avant que l'appelant ne bascule en mode skipped.
      console.warn("[booster-transcribe] video audio extraction unavailable", {
        message: error instanceof Error ? error.message : String(error),
      });
      mediaType = normalizeMime(file.type || "") || "video/mp4";
    }
  }

  const result = await aiTranscribeMedia({
    file: gatewayFile,
    accountId: options.accountId,
    mediaType,
    retries: 1,
    timeoutMs: 70_000,
  });

  return cleanTranscriptText(result.text);
}

async function correctTranscript(rawTranscript: string, preferredEngine: AiPreferredEngine, accountId: string) {
  const fallback = cleanTranscriptText(rawTranscript);
  if (!fallback) return "";

  try {
    const result = await aiGenerateJSON<CorrectionResponse>({
      feature: "booster.transcript-cleanup",
      accountId,
      engine: preferredEngine,
      system:
        "Tu corriges une transcription dans sa langue d'origine pour une publication professionnelle. Réponds uniquement en JSON avec la clé text.",
      input: `Corrige uniquement les fautes d'orthographe, la ponctuation, les accords et les majuscules du texte ci-dessous.
Ne traduis pas le texte : conserve sa langue d'origine.
Ne change pas le sens, n'invente rien, ne rajoute aucune information, ne transforme pas en publication complète.
Garde un texte naturel, clair et exploitable comme contexte IA.

Texte transcrit :
${fallback}`,
      maxOutputTokens: 450,
      temperature: 0.1,
    });

    return cleanTranscriptText(result?.text || fallback);
  } catch {
    return fallback;
  }
}

const handler = async (request: Request) => {
  let quotaReservation: AiCreditReservation | null = null;
  try {
    const { supabase, authUserId, errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

    const { data: businessPreference } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", activeUserId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const generationProfile = buildNormalizedAiGenerationProfile({
      business: (businessPreference || {}) as Record<string, unknown>,
      theme: "booster-transcription",
      style: "transcription",
    });
    const preferredEngine = generationProfile.preferences.engine;
    const isAdmin = await isAdminUserForAi(supabase, authUserId);

    const rateLimit = await enforceRateLimit({
      name: "booster_transcribe",
      identifier: activeUserId,
      limit: 12,
      window: "10 m",
    });
    if (rateLimit) return rateLimit;

    const formData = await request.formData().catch(() => null);
    const audio = formData?.get("audio");
    const video = formData?.get("video");
    const textEntry = formData?.get("text");
    const liveText = cleanTranscriptText(
      typeof textEntry === "string" ? textEntry : "",
    );

    if (liveText) {
      if (!isAdmin) {
        const quota = await reserveAiCredits({
          supabase,
          userId: activeUserId,
          action: "transcription",
          credits: 1,
        });
        if (quota.errorResponse) return quota.errorResponse;
        quotaReservation = quota.reservation;
      }
      const correctedText = await correctTranscript(liveText, preferredEngine, activeUserId);
      if (!correctedText) {
        await rollbackAiCredits(quotaReservation);
        return jsonUserFacingError(
          "Le vocal n’a pas pu être converti en texte.",
          {
            status: 502,
            code: "voice_text_cleanup_empty",
          },
        );
      }

      await commitAiCredits(quotaReservation);
      return NextResponse.json({
        ok: true,
        text: correctedText,
        raw_text: liveText,
        source: "live_text",
      });
    }

    if (isFileLike(video)) {
      // La transcription vidéo n'est qu'un enrichissement IA. Un fichier sans piste
      // audio, trop petit pour l'analyse ou dans un conteneur non reconnu ne doit
      // jamais produire un 400/415 visible ni bloquer la génération YouTube.
      if (video.size < MIN_AUDIO_BYTES) {
        return videoTranscriptionSkipped("video_too_short_skipped");
      }

      if (video.size > MAX_VIDEO_TRANSCRIBE_BYTES) {
        return videoTranscriptionSkipped("video_too_large_skipped");
      }

      if (!isAllowedVideoFile(video)) {
        return videoTranscriptionSkipped("video_unsupported_skipped");
      }

      if (!isAdmin) {
        const quota = await reserveAiCredits({
          supabase,
          userId: activeUserId,
          action: "transcription",
          credits: 3,
        });
        if (quota.errorResponse) return quota.errorResponse;
        quotaReservation = quota.reservation;
      }

      // L'analyse audio d'une vidéo est un bonus de contexte pour l'IA, jamais un
      // prérequis de génération. Si la transcription Gateway est momentanément indisponible,
      // on laisse Booster continuer avec la phrase libre + les frames vidéo au lieu de
      // remonter un 502 visible dans la console et de dégrader l'expérience client.
      let transcript = "";
      try {
        transcript = await transcribeMedia(video, { source: "video", accountId: activeUserId });
      } catch {
        await rollbackAiCredits(quotaReservation);
        return NextResponse.json({
          ok: true,
          text: "",
          raw_text: "",
          source: "video_audio_unavailable",
          skipped: true,
        });
      }

      if (!transcript) {
        await rollbackAiCredits(quotaReservation);
        return NextResponse.json({
          ok: true,
          text: "",
          raw_text: "",
          source: "video_audio_empty",
          skipped: true,
        });
      }

      const correctedText = await correctTranscript(transcript, preferredEngine, activeUserId);
      if (!correctedText) {
        await commitAiCredits(quotaReservation);
        return NextResponse.json({
          ok: true,
          text: transcript,
          raw_text: transcript,
          source: "video_audio_raw",
          skipped_cleanup: true,
        });
      }

      await commitAiCredits(quotaReservation);
      return NextResponse.json({
        ok: true,
        text: correctedText,
        raw_text: transcript,
        source: "video_audio",
      });
    }

    if (video !== null && video !== undefined) {
      return videoTranscriptionSkipped("video_payload_unavailable_skipped");
    }

    if (!isFileLike(audio)) {
      return jsonUserFacingError("Fichier audio manquant.", {
        status: 400,
        code: "audio_missing",
      });
    }

    if (audio.size < MIN_AUDIO_BYTES) {
      return jsonUserFacingError("Le vocal est trop court ou vide.", {
        status: 400,
        code: "audio_too_short",
      });
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return jsonUserFacingError(
        "Le vocal est trop lourd. Réessaie avec un message plus court.",
        {
          status: 413,
          code: "audio_too_large",
        },
      );
    }

    if (!isAllowedAudioFile(audio)) {
      return jsonUserFacingError("Format audio non supporté.", {
        status: 415,
        code: "audio_unsupported",
      });
    }

    if (!isAdmin) {
      const quota = await reserveAiCredits({
        supabase,
        userId: activeUserId,
        action: "transcription",
        credits: 2,
      });
      if (quota.errorResponse) return quota.errorResponse;
      quotaReservation = quota.reservation;
    }

    const transcript = await transcribeMedia(audio, { source: "audio", accountId: activeUserId });
    if (!transcript) {
      await rollbackAiCredits(quotaReservation);
      return jsonUserFacingError("Aucun texte n’a été détecté dans le vocal.", {
        status: 422,
        code: "empty_transcript",
      });
    }

    const correctedText = await correctTranscript(transcript, preferredEngine, activeUserId);
    if (!correctedText) {
      await rollbackAiCredits(quotaReservation);
      return jsonUserFacingError(
        "Le vocal n’a pas pu être converti en texte.",
        {
          status: 502,
          code: "transcription_empty_after_cleanup",
        },
      );
    }

    await commitAiCredits(quotaReservation);
    return NextResponse.json({
      ok: true,
      text: correctedText,
      raw_text: transcript,
      source: "audio",
    });
  } catch (error) {
    await rollbackAiCredits(quotaReservation);
    return jsonUserFacingError(error, {
      status: 502,
      fallback: "Le vocal n’a pas pu être transcrit. Merci de réessayer.",
      code: "booster_transcription_failed",
    });
  }
};

export const POST = withApi(handler, { route: "/api/booster/transcribe" });
