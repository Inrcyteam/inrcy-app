import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { fetchWithRetry } from "@/lib/observability/fetch";
import { withApi } from "@/lib/observability/withApi";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";
export const maxDuration = 60;

type CorrectionResponse = {
  text?: string;
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIN_AUDIO_BYTES = 900;
const ALLOWED_AUDIO_PREFIXES = ["audio/"];

function isAllowedAudioFile(file: File) {
  const type = String(file.type || "").toLowerCase();
  if (!type) return true;
  return ALLOWED_AUDIO_PREFIXES.some((prefix) => type.startsWith(prefix));
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

function cleanTranscriptText(value: unknown, maxLength = 1400) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^['\"“”‘’]+|['\"“”‘’]+$/g, "")
    .slice(0, maxLength)
    .trim();
}

async function transcribeAudio(file: File) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Configuration OpenAI manquante.");

  const formData = new FormData();
  formData.append("file", file, sanitizeAudioFileName(file.name || "", file.type || ""));
  formData.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  formData.append("language", "fr");
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    "Vocal court dicté par un professionnel français pour préparer une publication iNrCy. Conserver les noms propres, villes, métiers, prestations et informations commerciales.",
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
        "Tu corriges une phrase dictée vocalement en français pour une publication professionnelle. Réponds uniquement en JSON avec la clé text.",
      input: `Corrige uniquement les fautes d'orthographe, la ponctuation, les accords et les majuscules du texte ci-dessous.
Ne change pas le sens, n'invente rien, ne rajoute aucune information, ne transforme pas en publication complète.
Garde une phrase naturelle, courte et exploitable dans un champ \"Phrase libre\".

Texte dicté :
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

    const transcript = await transcribeAudio(audio);
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

    return NextResponse.json({ ok: true, text: correctedText, raw_text: transcript });
  } catch (error) {
    return jsonUserFacingError(error, {
      status: 502,
      fallback: "Le vocal n’a pas pu être transcrit. Merci de réessayer.",
      code: "booster_transcription_failed",
    });
  }
};

export const POST = withApi(handler, { route: "/api/booster/transcribe" });
