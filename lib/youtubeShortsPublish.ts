import "server-only";

import { randomUUID } from "crypto";
import { asRecord, asString } from "@/lib/tsSafe";

export type YoutubeShortsUploadInput = {
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
  privacyStatus: "public" | "unlisted" | "private";
  madeForKids?: boolean;
  mimeType?: string | null;
  tags?: string[] | null;
  publicationType?: "short" | "video" | null;
};

export type YoutubeShortsUploadResult = {
  ok: boolean;
  videoId?: string | null;
  videoUrl?: string | null;
  shortsUrl?: string | null;
  title?: string | null;
  privacyStatus?: string | null;
  raw?: unknown;
  error?: string;
  reason?: string | null;
  status?: number;
  processingStatus?: string | null;
  uploadStatus?: string | null;
  publicationType?: "short" | "video" | null;
};

function sanitizeTitle(input: string) {
  const title = String(input || "").replace(/\s+/g, " ").trim();
  return (title || "Vidéo iNrCy").slice(0, 95);
}

function sanitizeDescription(input: string) {
  return String(input || "").trim().slice(0, 4800);
}

function getYoutubeErrorReason(data: unknown) {
  const rec = asRecord(data);
  const err = asRecord(rec.error);
  const errors = Array.isArray(err.errors) ? err.errors : [];
  const first = asRecord(errors[0]);
  return asString(first.reason) || asString(err.status) || null;
}

function youtubeErrorMessage(data: unknown, fallback: string) {
  const rec = asRecord(data);
  const err = asRecord(rec.error);
  const message = asString(err.message);
  const errors = Array.isArray(err.errors) ? err.errors : [];
  const first = asRecord(errors[0]);
  const reason = getYoutubeErrorReason(data);
  const raw = `${reason || ""} ${message || ""} ${asString(first.message) || ""}`.toLowerCase();

  if (/quota|dailylimit|uploadlimit|ratelimit|rate limit|exceeded/.test(raw)) {
    return "Quota YouTube atteint. Réessayez plus tard ou vérifiez le quota API Google.";
  }
  if (/insufficient|permission|forbidden|scope|accessnotconfigured|not authorized|unauthorized/.test(raw)) {
    return "Autorisation YouTube insuffisante. Déconnectez puis reconnectez YouTube.";
  }
  if (/invalid credentials|auth|token|expired|invalid_grant/.test(raw)) {
    return "Connexion YouTube expirée. Déconnectez puis reconnectez YouTube.";
  }
  if (/invalidtitle|title|metadata/.test(raw)) {
    return "Titre ou métadonnées YouTube invalides.";
  }
  if (/invaliddescription|description/.test(raw)) {
    return "Description YouTube invalide.";
  }
  if (/media|video|upload|unsupported|invalid/.test(raw)) {
    return "Vidéo refusée par YouTube. Vérifiez le format, la durée et le poids du fichier.";
  }

  return message || asString(first.message) || asString(first.reason) || fallback;
}

function sanitizeTags(input: unknown) {
  const items = Array.isArray(input) ? input : [];
  return Array.from(new Set(
    items
      .map((tag) => String(tag || "").replace(/^#/, "").trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 30)),
  )).slice(0, 12);
}

async function fetchVideoBlob(videoUrl: string) {
  const res = await fetch(videoUrl, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Vidéo iNrCy inaccessible pour YouTube (${res.status}).`);
  const blob = await res.blob();
  if (!blob.size) throw new Error("Vidéo iNrCy vide ou introuvable.");
  if (blob.size > 512 * 1024 * 1024) throw new Error("Vidéo trop lourde pour l'upload YouTube depuis iNrCy.");
  return blob;
}

export async function uploadYoutubeShort(input: YoutubeShortsUploadInput): Promise<YoutubeShortsUploadResult> {
  const accessToken = String(input.accessToken || "").trim();
  const videoUrl = String(input.videoUrl || "").trim();
  if (!accessToken) return { ok: false, error: "Connexion YouTube expirée." };
  if (!videoUrl) return { ok: false, error: "Vidéo YouTube introuvable." };

  try {
    const blob = await fetchVideoBlob(videoUrl);
    const mimeType = String(input.mimeType || blob.type || "video/mp4").trim() || "video/mp4";
    const metadata = {
      snippet: {
        title: sanitizeTitle(input.title),
        description: sanitizeDescription(input.description),
        categoryId: "22",
        tags: sanitizeTags(input.tags),
      },
      status: {
        privacyStatus: input.privacyStatus,
        selfDeclaredMadeForKids: Boolean(input.madeForKids),
      },
    };

    const initUrl = `https://www.googleapis.com/upload/youtube/v3/videos?${new URLSearchParams({
      uploadType: "resumable",
      part: "snippet,status",
    }).toString()}`;

    const initRes = await fetch(initUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(blob.size),
      },
      body: JSON.stringify(metadata),
      cache: "no-store",
    });

    if (!initRes.ok) {
      const data = await initRes.json().catch(() => ({}));
      return {
        ok: false,
        status: initRes.status,
        reason: getYoutubeErrorReason(data),
        error: youtubeErrorMessage(data, "YouTube a refusé la préparation de l'upload."),
        raw: data,
      };
    }

    const location = initRes.headers.get("location") || "";
    if (!location) return { ok: false, error: "YouTube n'a pas renvoyé d'URL d'upload." };

    const uploadRes = await fetch(location, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
        "Content-Length": String(blob.size),
      },
      body: blob,
      cache: "no-store",
    });

    const data = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      return {
        ok: false,
        status: uploadRes.status,
        reason: getYoutubeErrorReason(data),
        error: youtubeErrorMessage(data, "YouTube a refusé la vidéo."),
        raw: data,
      };
    }

    const dataRec = asRecord(data);
    const videoId = asString(dataRec.id) || null;
    const status = asRecord(dataRec.status);
    const processingDetails = asRecord(dataRec.processingDetails);
    return {
      ok: true,
      videoId,
      videoUrl: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null,
      shortsUrl: videoId ? `https://www.youtube.com/shorts/${encodeURIComponent(videoId)}` : null,
      title: asString(asRecord(dataRec.snippet).title) || metadata.snippet.title,
      privacyStatus: asString(status.privacyStatus) || input.privacyStatus,
      uploadStatus: asString(status.uploadStatus) || null,
      processingStatus: asString(processingDetails.processingStatus) || null,
      publicationType: input.publicationType === "short" ? "short" : "video",
      raw: data,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Publication YouTube impossible.",
      raw: { requestId: randomUUID() },
    };
  }
}
