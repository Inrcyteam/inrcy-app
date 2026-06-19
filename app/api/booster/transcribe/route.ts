import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { fetchWithRetry } from "@/lib/observability/fetch";
import { withApi } from "@/lib/observability/withApi";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";
export const maxDuration = 120;

type CorrectionResponse = {
  text?: string;
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_TRANSCRIBE_BYTES = 40 * 1024 * 1024;
const MIN_AUDIO_BYTES = 900;
const ALLOWED_AUDIO_PREFIXES = ["audio/"];
const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]);

function normalizeMime(type: string) {
  return String(type || "").toLowerCase().split(";")[0]?.trim() || "";
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
  return ALLOWED_VIDEO_MIME_TYPES.has(type) || /\.(mp4|mov|webm|m4v)$/i.test(name);
}

function sanitizeAudioFileName(name: string, type: string) {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  if (clean && /\.(webm|m4a|mp4|mp3|mpeg|mpga|wav|ogg)$/i.test(clean)) return clean;
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

async function transcribeMedia(file: File, options?: { source?: "audio" | "video" }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Configuration OpenAI manquante.");

  const formData = new FormData();
  formData.append(
    "file",
    file,
    options?.source === "video"
      ? sanitizeVideoFileName(file.name || "", file.type || "")
      : sanitizeAudioFileName(file.name || "", file.type || ""),
  );
  formData.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  formData.append("language", "fr");
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    options?.source === "video"
      ? "Audio extrait d’une vidéo fournie par un professionnel pour préparer une publication iNrCy. Transcrire uniquement les paroles utiles. Conserver les noms propres, villes, métiers, prestations et informations commerciales."
      : "Vocal court dicté par un professionnel pour préparer une publication iNrCy. Conserver les noms propres, villes, métiers, prestations et informations commerciales.",
  );

  const response = await fetchWithRetry("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    retries: 1,
    timeoutMs: 45_000,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI transcription error (${response.status}): ${errorText || response.statusText}`);
  }

  const json = (await response.json().catch(() => ({}))) as { text?: string };
  return cleanTranscriptText(json.text);
}

async function correctTranscript(rawTranscript: string) {
  const fallback = cleanTranscriptText(rawTranscript);
  if (!fallback) return "";

  try {
    const result = await openaiGenerateJSON<CorrectionResponse>({
      model: process.env.OPENAI_TRANSCRIPT_CLEANUP_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
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
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const rateLimit = await enforceRateLimit({
      name: "booster_transcribe",
      identifier: user.id,
      limit: 12,
      window: "10 m",
    });
    if (rateLimit) return rateLimit;

    const formData = await request.formData().catch(() => null);
    const audio = formData?.get("audio");
    const video = formData?.get("video");
    const textEntry = formData?.get("text");
    const liveText = cleanTranscriptText(typeof textEntry === "string" ? textEntry : "");

    if (liveText) {
      const correctedText = await correctTranscript(liveText);
      if (!correctedText) {
        return jsonUserFacingError("Le vocal n’a pas pu être converti en texte.", {
          status: 502,
          code: "voice_text_cleanup_empty",
        });
      }

      return NextResponse.json({ ok: true, text: correctedText, raw_text: liveText, source: "live_text" });
    }

    if (video instanceof File) {
      if (video.size < MIN_AUDIO_BYTES) {
        return jsonUserFacingError("La vidéo est trop courte ou vide.", { status: 400, code: "video_too_short" });
      }

      if (video.size > MAX_VIDEO_TRANSCRIBE_BYTES) {
        return jsonUserFacingError("La vidéo est trop lourde pour l’analyse audio. Taille maximale : 40 Mo.", {
          status: 413,
          code: "video_too_large",
        });
      }

      if (!isAllowedVideoFile(video)) {
        return jsonUserFacingError("Format vidéo non supporté pour l’analyse audio. Formats acceptés : MP4/M4V, MOV ou WebM.", { status: 415, code: "video_unsupported" });
      }

      const transcript = await transcribeMedia(video, { source: "video" });
      if (!transcript) {
        return jsonUserFacingError("Aucune parole exploitable n’a été détectée dans la vidéo.", { status: 422, code: "empty_video_transcript" });
      }

      const correctedText = await correctTranscript(transcript);
      if (!correctedText) {
        return jsonUserFacingError("L’audio de la vidéo n’a pas pu être converti en texte.", {
          status: 502,
          code: "video_transcription_empty_after_cleanup",
        });
      }

      return NextResponse.json({ ok: true, text: correctedText, raw_text: transcript, source: "video_audio" });
    }

    if (!(audio instanceof File)) {
      return jsonUserFacingError("Fichier audio manquant.", { status: 400, code: "audio_missing" });
    }

    if (audio.size < MIN_AUDIO_BYTES) {
      return jsonUserFacingError("Le vocal est trop court ou vide.", { status: 400, code: "audio_too_short" });
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return jsonUserFacingError("Le vocal est trop lourd. Réessaie avec un message plus court.", {
        status: 413,
        code: "audio_too_large",
      });
    }

    if (!isAllowedAudioFile(audio)) {
      return jsonUserFacingError("Format audio non supporté.", { status: 415, code: "audio_unsupported" });
    }

    const transcript = await transcribeMedia(audio, { source: "audio" });
    if (!transcript) {
      return jsonUserFacingError("Aucun texte n’a été détecté dans le vocal.", { status: 422, code: "empty_transcript" });
    }

    const correctedText = await correctTranscript(transcript);
    if (!correctedText) {
      return jsonUserFacingError("Le vocal n’a pas pu être converti en texte.", {
        status: 502,
        code: "transcription_empty_after_cleanup",
      });
    }

    return NextResponse.json({ ok: true, text: correctedText, raw_text: transcript, source: "audio" });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 502,
      fallback: "Le vocal n’a pas pu être transcrit. Merci de réessayer.",
      code: "booster_transcription_failed",
    });
  }
};

export const POST = withApi(handler, { route: "/api/booster/transcribe" });
