import { getPinterestApiBaseUrl } from "@/lib/pinterestOAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { asRecord, asString } from "@/lib/tsSafe";
import { publishPinterestVideoWithProtocol } from "@/lib/pinterestVideoProtocol";
import { buildPinterestImageMediaSource } from "@/lib/pinterestImagePinPayload";
import { getVideoPublicationPolicy } from "@/lib/videoPublicationPolicy";
import { toExactStorageArrayBuffer } from "@/lib/supabaseStorageBinary";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { access, chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";

export type PinterestCreateImagePinArgs = {
  accessToken: string;
  boardId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  link?: string | null;
};

export type PinterestCreatePinResult = {
  ok: boolean;
  id: string | null;
  url: string | null;
  board_id: string | null;
  media_id?: string | null;
  media_status?: string | null;
  media_type?: "image" | "video";
  cover_image_url?: string | null;
};

export type PinterestCreateVideoPinArgs = {
  accessToken: string;
  userId: string;
  boardId: string;
  title: string;
  description?: string;
  videoUrl: string;
  videoStoragePath?: string | null;
  videoContentType?: string | null;
  videoFileName?: string | null;
  coverImageUrl?: string | null;
  coverStoragePath?: string | null;
  link?: string | null;
};

function cleanSingleLineText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function cleanMultilineText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function normalizePublicUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw;
}

function getBoosterPublicUrl(storagePath: unknown) {
  const cleanPath = sanitizeStoragePath(storagePath);
  if (!cleanPath) return "";
  return normalizePublicUrl(
    supabaseAdmin.storage.from(PINTEREST_COVER_BUCKET).getPublicUrl(cleanPath)
      .data.publicUrl,
  );
}

function buildPinterestPinUrl(pinId: string | null) {
  return pinId
    ? `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`
    : null;
}

type PinterestApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function pinterestApiRequest<T = unknown>(
  path: string,
  accessToken: string,
  options: { method: PinterestApiMethod; body?: unknown },
): Promise<T> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const hasBody =
    options.body !== undefined &&
    options.method !== "DELETE" &&
    options.method !== "GET";
  const res = await fetch(`${getPinterestApiBaseUrl()}/v5${cleanPath}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const raw = await res.text().catch(() => "");
  let json: unknown = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = { message: raw };
    }
  }

  if (!res.ok) {
    const rec = asRecord(json);
    const message =
      asString(rec.message) ||
      asString(rec.error_description) ||
      asString(rec.error) ||
      `Pinterest a refusé l'action (${res.status}).`;
    const pinterestCode =
      asString(rec.code) || asString(rec.error_code) || asString(rec.error_type) || null;
    const error = new Error(message) as Error & {
      status?: number;
      pinterestCode?: string | null;
    };
    error.status = res.status;
    error.pinterestCode = pinterestCode;
    throw error;
  }
  return json as T;
}

const execFileAsync = promisify(execFile);
const PINTEREST_VIDEO_POLICY = getVideoPublicationPolicy("pinterest");
const PINTEREST_COVER_BUCKET = "booster";
const PINTEREST_VIDEO_TIMEOUT_MS = 120000;

function sanitizeStoragePath(value: unknown) {
  const clean = String(value || "")
    .replace(/\\/g, "/")
    .replace(/\u0000/g, "")
    .replace(/^\/+/, "")
    .trim();
  if (!clean || clean.includes("..")) return "";
  return clean;
}

function sanitizePathSegment(value: unknown, fallback: string) {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 90);
  return clean || fallback;
}

function inferPinterestVideoFormat(params: {
  contentType?: string | null;
  fileName?: string | null;
  videoUrl?: string | null;
}) {
  const contentType = String(params.contentType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  const source = `${params.fileName || ""} ${params.videoUrl || ""}`
    .toLowerCase()
    .split("?")[0];

  if (contentType === "video/quicktime" || /\.mov(?:\s|$)/.test(source)) {
    return { extension: "mov", contentType: "video/quicktime", supported: true };
  }
  if (contentType === "video/x-m4v" || /\.m4v(?:\s|$)/.test(source)) {
    return { extension: "m4v", contentType: "video/x-m4v", supported: true };
  }
  if (contentType === "video/mp4" || /\.mp4(?:\s|$)/.test(source)) {
    return { extension: "mp4", contentType: "video/mp4", supported: true };
  }
  if (contentType === "video/webm" || /\.webm(?:\s|$)/.test(source)) {
    return { extension: "webm", contentType: "video/webm", supported: false };
  }
  return { extension: "mp4", contentType: "video/mp4", supported: true };
}

function getBundledFfmpegCandidate() {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
}

function getFfmpegCandidates() {
  return [
    process.env.FFMPEG_PATH,
    ffmpegStaticPath,
    getBundledFfmpegCandidate(),
    "ffmpeg",
  ]
    .map((candidate) => String(candidate || "").trim())
    .filter(Boolean);
}

async function ensureFfmpegAvailable() {
  const errors: string[] = [];
  for (const candidate of getFfmpegCandidates()) {
    try {
      if (candidate !== "ffmpeg" && process.platform !== "win32") {
        try {
          await access(candidate);
          await chmod(candidate, 0o755);
        } catch {
          // Le test -version ci-dessous donnera l'erreur exacte.
        }
      }
      await execFileAsync(candidate, ["-version"], {
        timeout: 6000,
        maxBuffer: 1024 * 1024,
      });
      return candidate;
    } catch (error) {
      errors.push(
        `${candidate}: ${String((error as any)?.message || error || "indisponible").slice(0, 180)}`,
      );
    }
  }
  throw new Error(
    `Pinterest nécessite FFmpeg pour préparer la couverture vidéo. ${errors.join(" | ")}`,
  );
}

async function downloadPinterestVideoSource(params: {
  videoUrl: string;
  storagePath?: string | null;
}) {
  const storagePath = sanitizeStoragePath(params.storagePath);
  if (storagePath) {
    const { data, error } = await supabaseAdmin.storage
      .from(PINTEREST_COVER_BUCKET)
      .download(storagePath);
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      if (buffer.length) return buffer;
    }
  }

  const videoUrl = normalizePublicUrl(params.videoUrl);
  if (!videoUrl) {
    throw new Error("Pinterest nécessite une URL vidéo publique valide.");
  }
  const response = await fetch(videoUrl, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Impossible de télécharger la vidéo pour Pinterest (${response.status}).`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("La vidéo Pinterest est vide.");
  return buffer;
}

async function uploadPinterestCover(params: {
  userId: string;
  coverBuffer: Buffer;
}) {
  const safeUserId = sanitizePathSegment(params.userId, randomUUID()).replace(
    /\./g,
    "-",
  );
  const storagePath = `${safeUserId}/pinterest-video-covers/${randomUUID()}.jpg`;
  const { error } = await supabaseAdmin.storage
    .from(PINTEREST_COVER_BUCKET)
    .upload(storagePath, toExactStorageArrayBuffer(params.coverBuffer), {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    throw new Error(
      error.message || "Impossible d'enregistrer la couverture Pinterest.",
    );
  }
  const publicUrl = supabaseAdmin.storage
    .from(PINTEREST_COVER_BUCKET)
    .getPublicUrl(storagePath).data.publicUrl;
  if (!normalizePublicUrl(publicUrl)) {
    throw new Error("La couverture Pinterest n'est pas publiquement accessible.");
  }
  return { publicUrl, storagePath };
}

async function preparePinterestVideoAsset(params: {
  userId: string;
  videoBuffer: Buffer;
  videoUrl: string;
  videoContentType?: string | null;
  videoFileName?: string | null;
  coverImageUrl?: string | null;
}) {
  const sourceFormat = inferPinterestVideoFormat({
    contentType: params.videoContentType,
    fileName: params.videoFileName,
    videoUrl: params.videoUrl,
  });
  const directCover = normalizePublicUrl(params.coverImageUrl);
  const needsFfmpeg = !sourceFormat.supported || !directCover;

  if (!needsFfmpeg) {
    return {
      videoBuffer: params.videoBuffer,
      videoContentType: sourceFormat.contentType,
      videoFileName: sanitizePathSegment(
        params.videoFileName,
        `video-inrcy.${sourceFormat.extension}`,
      ),
      coverImageUrl: directCover,
      coverStoragePath: null as string | null,
    };
  }

  const ffmpegPath = await ensureFfmpegAvailable();
  const tempDir = path.join(os.tmpdir(), `inrcy-pinterest-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const sourcePath = path.join(tempDir, `source.${sourceFormat.extension}`);
    await writeFile(sourcePath, params.videoBuffer);
    let finalPath = sourcePath;
    let finalContentType = sourceFormat.contentType;
    let finalFileName = sanitizePathSegment(
      params.videoFileName,
      `video-inrcy.${sourceFormat.extension}`,
    );

    if (!sourceFormat.supported) {
      finalPath = path.join(tempDir, "pinterest-video.mp4");
      await execFileAsync(
        ffmpegPath,
        [
          "-y",
          "-i",
          sourcePath,
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "27",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          "-movflags",
          "+faststart",
          "-threads",
          "2",
          finalPath,
        ],
        { timeout: PINTEREST_VIDEO_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      );
      finalContentType = "video/mp4";
      finalFileName = `${path.parse(finalFileName).name || "video-inrcy"}.mp4`;
    }

    const finalBuffer = await readFile(finalPath);
    if (!finalBuffer.length) {
      throw new Error("La préparation vidéo Pinterest a produit un fichier vide.");
    }
    if (finalBuffer.length > PINTEREST_VIDEO_POLICY.maxBytes) {
      throw new Error(
        `La vidéo préparée pour Pinterest dépasse ${PINTEREST_VIDEO_POLICY.maxBytesLabel}, limite source iNrCy.`,
      );
    }

    let coverImageUrl = directCover;
    let coverStoragePath: string | null = null;
    if (!coverImageUrl) {
      const coverPath = path.join(tempDir, "pinterest-cover.jpg");
      try {
        await execFileAsync(
          ffmpegPath,
          [
            "-y",
            "-ss",
            "0.2",
            "-i",
            finalPath,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            coverPath,
          ],
          { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
        );
      } catch {
        await execFileAsync(
          ffmpegPath,
          ["-y", "-i", finalPath, "-frames:v", "1", "-q:v", "2", coverPath],
          { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
        );
      }
      const coverBuffer = await readFile(coverPath);
      if (!coverBuffer.length) {
        throw new Error("Pinterest n'a pas pu générer l'image de couverture.");
      }
      const uploadedCover = await uploadPinterestCover({
        userId: params.userId,
        coverBuffer,
      });
      coverImageUrl = uploadedCover.publicUrl;
      coverStoragePath = uploadedCover.storagePath;
    }

    return {
      videoBuffer: finalBuffer,
      videoContentType: finalContentType,
      videoFileName: finalFileName,
      coverImageUrl,
      coverStoragePath,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}


export function isPinterestPinEditRestrictedError(error: unknown) {
  const rec = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = String(
    error instanceof Error ? error.message : rec.message || error || "",
  ).toLowerCase();
  const code = String(rec.pinterestCode || rec.code || "").toLowerCase();
  return (
    message.includes("pin_edit") ||
    code.includes("pin_edit") ||
    (message.includes("restricted feature") && message.includes("edit"))
  );
}

export async function createPinterestImagePin({
  accessToken,
  boardId,
  title,
  description,
  imageUrl,
  imageUrls,
  link,
}: PinterestCreateImagePinArgs): Promise<PinterestCreatePinResult> {
  const token = String(accessToken || "").trim();
  const cleanBoardId = String(boardId || "").trim();
  const requestedImageUrls = Array.isArray(imageUrls) && imageUrls.length
    ? imageUrls
    : [imageUrl];

  if (!token)
    throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanBoardId)
    throw new Error("Choisissez un tableau Pinterest avant de publier.");

  const mediaSource = buildPinterestImageMediaSource(requestedImageUrls);

  const payload: Record<string, unknown> = {
    board_id: cleanBoardId,
    title: cleanSingleLineText(title || "Publication iNrCy", 100),
    description: cleanMultilineText(description || "", 500),
    media_source: mediaSource,
  };

  const cleanLink = normalizePublicUrl(link);
  if (cleanLink) payload.link = cleanLink;

  const json = asRecord(
    await pinterestApiRequest("/pins", token, {
      method: "POST",
      body: payload,
    }),
  );
  const id = asString(json.id) || asString(json.pin_id) || null;

  return {
    ok: true,
    id,
    url: asString(json.url) || asString(json.link) || buildPinterestPinUrl(id),
    board_id: asString(json.board_id) || cleanBoardId,
    media_type: "image",
  };
}

export async function createPinterestVideoPin({
  accessToken,
  userId,
  boardId,
  title,
  description,
  videoUrl,
  videoStoragePath,
  videoContentType,
  videoFileName,
  coverImageUrl,
  coverStoragePath,
  link,
}: PinterestCreateVideoPinArgs): Promise<PinterestCreatePinResult> {
  const token = String(accessToken || "").trim();
  const cleanUserId = String(userId || "").trim();
  const cleanBoardId = String(boardId || "").trim();
  const cleanVideoUrl = normalizePublicUrl(videoUrl);
  const cleanCoverUrl =
    normalizePublicUrl(coverImageUrl) || getBoosterPublicUrl(coverStoragePath);

  if (!token) throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanUserId) throw new Error("Compte iNrCy introuvable pour Pinterest.");
  if (!cleanBoardId)
    throw new Error("Choisissez un tableau Pinterest avant de publier.");
  if (!cleanVideoUrl && !sanitizeStoragePath(videoStoragePath)) {
    throw new Error("Pinterest nécessite une vidéo publique valide.");
  }

  const sourceBuffer = await downloadPinterestVideoSource({
    videoUrl: cleanVideoUrl,
    storagePath: videoStoragePath,
  });
  if (sourceBuffer.length > PINTEREST_VIDEO_POLICY.maxBytes) {
    throw new Error(
      `La vidéo Pinterest dépasse ${PINTEREST_VIDEO_POLICY.maxBytesLabel}, limite source iNrCy.`,
    );
  }

  const prepared = await preparePinterestVideoAsset({
    userId: cleanUserId,
    videoBuffer: sourceBuffer,
    videoUrl: cleanVideoUrl,
    videoContentType,
    videoFileName,
    coverImageUrl: cleanCoverUrl,
  });

  const protocolResult = await publishPinterestVideoWithProtocol({
    apiBaseUrl: getPinterestApiBaseUrl(),
    accessToken: token,
    boardId: cleanBoardId,
    title: cleanSingleLineText(title || "Publication iNrCy", 100),
    description: cleanMultilineText(description || "", 500),
    link: normalizePublicUrl(link) || null,
    coverImageUrl: prepared.coverImageUrl,
    videoBytes: new Uint8Array(prepared.videoBuffer),
    videoContentType: prepared.videoContentType,
    videoFileName: prepared.videoFileName,
  });

  const json = asRecord(protocolResult.pin);
  const id = asString(json.id) || asString(json.pin_id) || null;

  return {
    ok: true,
    id,
    url: asString(json.url) || asString(json.link) || buildPinterestPinUrl(id),
    board_id: asString(json.board_id) || cleanBoardId,
    media_id: protocolResult.mediaId,
    media_status: protocolResult.mediaStatus,
    media_type: "video",
    cover_image_url: prepared.coverImageUrl,
  };
}

export type PinterestUpdatePinArgs = {
  accessToken: string;
  pinId: string;
  title: string;
  description?: string;
  link?: string | null;
  boardId?: string | null;
};

export async function updatePinterestPin({
  accessToken,
  pinId,
  title,
  description,
  link,
  boardId,
}: PinterestUpdatePinArgs): Promise<PinterestCreatePinResult> {
  const token = String(accessToken || "").trim();
  const cleanPinId = String(pinId || "").trim();
  if (!token)
    throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanPinId) throw new Error("Épingle Pinterest introuvable.");

  const payload: Record<string, unknown> = {
    title: cleanSingleLineText(title || "Publication iNrCy", 100),
    description: cleanMultilineText(description || "", 500),
  };

  const cleanBoardId = String(boardId || "").trim();
  if (cleanBoardId) payload.board_id = cleanBoardId;

  const cleanLink = normalizePublicUrl(link);
  payload.link = cleanLink || null;

  const json = asRecord(
    await pinterestApiRequest(
      `/pins/${encodeURIComponent(cleanPinId)}`,
      token,
      {
        method: "PATCH",
        body: payload,
      },
    ),
  );
  const id = asString(json.id) || asString(json.pin_id) || cleanPinId;

  return {
    ok: true,
    id,
    url: asString(json.url) || buildPinterestPinUrl(id),
    board_id: asString(json.board_id) || cleanBoardId || null,
  };
}

export async function deletePinterestPin(
  accessToken: string,
  pinId: string,
): Promise<void> {
  const token = String(accessToken || "").trim();
  const cleanPinId = String(pinId || "").trim();
  if (!token)
    throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanPinId) throw new Error("Épingle Pinterest introuvable.");

  try {
    await pinterestApiRequest(
      `/pins/${encodeURIComponent(cleanPinId)}`,
      token,
      { method: "DELETE" },
    );
  } catch (error) {
    const status = Number((error as Error & { status?: number })?.status || 0);
    if (status === 404) return;
    throw error;
  }
}
