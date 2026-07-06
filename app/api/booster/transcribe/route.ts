import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { fetchWithRetry } from "@/lib/observability/fetch";
import { withApi } from "@/lib/observability/withApi";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES } from "@/lib/mediaRules";

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

function sanitizeAudioFileName(name: string, type: string) {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  if (clean && /\.(webm|m4a|mp4|mp3|mpeg|mpga|wav|ogg)$/i.test(clean))
    return clean;
  if (type.includes("mp4")) return "booster-vocal.m4a";
  if (type.includes("mpeg")) return "booster-vocal.mp3";
  if (type.includes("ogg")) return "booster-vocal.ogg";
  if (type.includes("wav")) return "booster-vocal.wav";
  return "booster-vocal.webm";
}

function sanitizeVideoFileName(name: string, type: string) {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 90);
  if (clean && /\.(mp4|mov|webm|m4v)$/i.test(clean)) return clean;
  const normalized = normalizeMime(type);
  if (normalized.includes("quicktime")) return "booster-video.mov";
  if (normalized.includes("webm")) return "booster-video.webm";
  return "booster-video.mp4";
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
  options?: { source?: "audio" | "video" },
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Configuration OpenAI manquante.");

  const primaryModel =
    process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
  const models = Array.from(new Set([primaryModel, "whisper-1"]));
  const errors: string[] = [];

  for (const model of models) {
    const formData = new FormData();
    formData.append(
      "file",
      file,
      options?.source === "video"
        ? sanitizeVideoFileName(file.name || "", file.type || "")
        : sanitizeAudioFileName(file.name || "", file.type || ""),
    );
    formData.append("model", model);
    formData.append("language", "fr");
    formData.append("response_format", "json");
    formData.append(
      "prompt",
      options?.source === "video"
        ? "Audio extrait d’une vidéo fournie par un professionnel pour préparer une publication iNrCy. Transcrire uniquement les paroles utiles. Conserver les noms propres, villes, métiers, prestations et informations commerciales."
        : "Vocal court dicté par un professionnel pour préparer une publication iNrCy. Conserver les noms propres, villes, métiers, prestations et informations commerciales.",
    );

    try {
      const response = await fetchWithRetry(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
          retries: 1,
          timeoutMs: 55_000,
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        errors.push(
          `${model}: ${response.status} ${errorText || response.statusText}`.trim(),
        );
        // Une erreur d'authentification/configuration ne sera pas corrigée par un autre modèle.
        if (response.status === 401 || response.status === 403) break;
        continue;
      }

      const json = (await response.json().catch(() => ({}))) as {
        text?: string;
      };
      const text = cleanTranscriptText(json.text);
      if (text) return text;
      errors.push(`${model}: transcription vide`);
    } catch (error) {
      errors.push(
        `${model}: ${error instanceof Error ? error.message : "échec de transcription"}`,
      );
    }
  }

  throw new Error(
    `OpenAI transcription indisponible : ${errors.filter(Boolean).join(" | ") || "aucun résultat"}`,
  );
}

async function correctTranscript(rawTranscript: string) {
  const fallback = cleanTranscriptText(rawTranscript);
  if (!fallback) return "";

  try {
    const result = await openaiGenerateJSON<CorrectionResponse>({
      model:
        process.env.OPENAI_TRANSCRIPT_CLEANUP_MODEL ||
        process.env.OPENAI_MODEL ||
        "gpt-4o-mini",
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
  try {
    const { user, errorResponse, activeUserId } = await requireUser();
    if (errorResponse) return errorResponse;

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
      const correctedText = await correctTranscript(liveText);
      if (!correctedText) {
        return jsonUserFacingError(
          "Le vocal n’a pas pu être converti en texte.",
          {
            status: 502,
            code: "voice_text_cleanup_empty",
          },
        );
      }

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

      // L'analyse audio d'une vidéo est un bonus de contexte pour l'IA, jamais un
      // prérequis de génération. Si OpenAI transcription est momentanément indisponible,
      // on laisse Booster continuer avec la phrase libre + les frames vidéo au lieu de
      // remonter un 502 visible dans la console et de dégrader l'expérience client.
      let transcript = "";
      try {
        transcript = await transcribeMedia(video, { source: "video" });
      } catch {
        return NextResponse.json({
          ok: true,
          text: "",
          raw_text: "",
          source: "video_audio_unavailable",
          skipped: true,
        });
      }

      if (!transcript) {
        return NextResponse.json({
          ok: true,
          text: "",
          raw_text: "",
          source: "video_audio_empty",
          skipped: true,
        });
      }

      const correctedText = await correctTranscript(transcript);
      if (!correctedText) {
        return NextResponse.json({
          ok: true,
          text: transcript,
          raw_text: transcript,
          source: "video_audio_raw",
          skipped_cleanup: true,
        });
      }

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

    const transcript = await transcribeMedia(audio, { source: "audio" });
    if (!transcript) {
      return jsonUserFacingError("Aucun texte n’a été détecté dans le vocal.", {
        status: 422,
        code: "empty_transcript",
      });
    }

    const correctedText = await correctTranscript(transcript);
    if (!correctedText) {
      return jsonUserFacingError(
        "Le vocal n’a pas pu être converti en texte.",
        {
          status: 502,
          code: "transcription_empty_after_cleanup",
        },
      );
    }

    return NextResponse.json({
      ok: true,
      text: correctedText,
      raw_text: transcript,
      source: "audio",
    });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 502,
      fallback: "Le vocal n’a pas pu être transcrit. Merci de réessayer.",
      code: "booster_transcription_failed",
    });
  }
};

export const POST = withApi(handler, { route: "/api/booster/transcribe" });
