import "server-only";

import { createHash, randomUUID } from "crypto";
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

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type YoutubeShortsUploadDependencies = {
  fetchImpl?: FetchLike;
  waitImpl?: (ms: number) => Promise<void>;
  chunkSizeBytes?: number;
  maxChunkRetries?: number;
  now?: () => Date;
  requestTimeoutMs?: number;
};

export type YoutubeResumableUploadCheckpointState =
  | "uploading"
  | "published"
  | "failed"
  | "upload_unknown";

export type YoutubeResumableUploadCheckpoint = {
  version: 1;
  sessionUrl: string;
  requestFingerprint: string;
  totalBytes: number;
  mimeType: string;
  rangeSupported: boolean;
  chunkSizeBytes: number;
  offset: number;
  state: YoutubeResumableUploadCheckpointState;
  createdAt: string;
  updatedAt: string;
  videoId: string | null;
  lastHttpStatus: number | null;
};

export type YoutubeResumableUploadPhaseResult =
  | {
      ok: true;
      phase: "create" | "upload";
      outcome: "checkpoint" | "processing";
      checkpoint: YoutubeResumableUploadCheckpoint;
      retryAfterMs?: number;
    }
  | ({
      ok: true;
      phase: "upload";
      outcome: "published";
      checkpoint: YoutubeResumableUploadCheckpoint;
    } & YoutubeShortsUploadResult)
  | {
      ok: false;
      phase: "create" | "upload";
      outcome: "retryable" | "failed" | "ambiguous";
      error: string;
      code: string;
      retryable: boolean;
      requestMayHaveSucceeded: boolean;
      checkpoint?: YoutubeResumableUploadCheckpoint;
      retryAfterMs?: number;
      status?: number;
      reason?: string | null;
      raw?: unknown;
    };

const YOUTUBE_VIDEO_MAX_BYTES = 300 * 1024 * 1024;
const YOUTUBE_RESUMABLE_CHUNK_GRANULARITY_BYTES = 256 * 1024;
const YOUTUBE_RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;
const YOUTUBE_RESUMABLE_MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const YOUTUBE_SINGLE_STREAM_FALLBACK_MAX_BYTES = 40 * 1024 * 1024;
const YOUTUBE_DEFAULT_MAX_CHUNK_RETRIES = 4;
const YOUTUBE_RESUMABLE_CHECKPOINT_VERSION = 1 as const;
const YOUTUBE_PHASE_HTTP_TIMEOUT_MS = 12_000;
const YOUTUBE_PHASE_RETRY_AFTER_MS = 2_000;

type YoutubeVideoSource = {
  size: number;
  mimeType: string;
  rangeSupported: boolean;
};

type YoutubeTransferResult = {
  response: Response;
  data: unknown;
};

type YoutubeSessionProbe =
  | { kind: "resume"; offset: number }
  | { kind: "completed"; response: Response; data: unknown }
  | { kind: "failed"; response: Response; data: unknown };

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
  return Array.from(
    new Set(
      items
        .map((tag) => String(tag || "").replace(/^#/, "").trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 30)),
    ),
  ).slice(0, 12);
}

function buildYoutubeUploadMetadata(input: YoutubeShortsUploadInput) {
  return {
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
}

export function buildYoutubeResumableUploadRequestFingerprint(
  input: Omit<YoutubeShortsUploadInput, "accessToken"> & {
    accessToken?: string;
  },
) {
  const metadata = buildYoutubeUploadMetadata(input as YoutubeShortsUploadInput);
  const canonical = JSON.stringify({
    videoUrl: String(input.videoUrl || "").trim(),
    mimeType: String(input.mimeType || "").trim().toLowerCase(),
    publicationType: input.publicationType === "short" ? "short" : "video",
    metadata,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function isYoutubeSessionUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "googleapis.com" || hostname.endsWith(".googleapis.com")) &&
      /\/upload\/youtube\/v3\/videos(?:$|[/?])/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isYoutubeCheckpointState(
  value: string,
): value is YoutubeResumableUploadCheckpointState {
  return ["uploading", "published", "failed", "upload_unknown"].includes(
    value,
  );
}

export function parseYoutubeResumableUploadCheckpoint(
  value: unknown,
): YoutubeResumableUploadCheckpoint | null {
  const record = asRecord(value);
  const version = Number(record.version);
  const sessionUrl = String(asString(record.sessionUrl) || "").trim();
  const requestFingerprint = String(asString(record.requestFingerprint) || "")
    .trim()
    .toLowerCase();
  const totalBytes = Number(record.totalBytes);
  const mimeType = String(asString(record.mimeType) || "").trim();
  const rangeSupported = record.rangeSupported === true;
  const chunkSizeBytes = Number(record.chunkSizeBytes);
  const offset = Number(record.offset);
  const state = String(asString(record.state) || "").trim();
  const createdAt = String(asString(record.createdAt) || "").trim();
  const updatedAt = String(asString(record.updatedAt) || "").trim();
  const videoId = String(asString(record.videoId) || "").trim() || null;
  const lastHttpStatusRaw = record.lastHttpStatus;
  const lastHttpStatus =
    lastHttpStatusRaw === null || lastHttpStatusRaw === undefined
      ? null
      : Number(lastHttpStatusRaw);

  if (
    version !== YOUTUBE_RESUMABLE_CHECKPOINT_VERSION ||
    !isYoutubeSessionUrl(sessionUrl) ||
    !/^[a-f0-9]{64}$/.test(requestFingerprint) ||
    !Number.isSafeInteger(totalBytes) ||
    totalBytes <= 0 ||
    totalBytes > YOUTUBE_VIDEO_MAX_BYTES ||
    !mimeType ||
    !Number.isSafeInteger(chunkSizeBytes) ||
    chunkSizeBytes < YOUTUBE_RESUMABLE_CHUNK_GRANULARITY_BYTES ||
    chunkSizeBytes > YOUTUBE_RESUMABLE_MAX_CHUNK_BYTES ||
    chunkSizeBytes % YOUTUBE_RESUMABLE_CHUNK_GRANULARITY_BYTES !== 0 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > totalBytes ||
    !isYoutubeCheckpointState(state) ||
    !createdAt ||
    !updatedAt ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    (lastHttpStatus !== null &&
      (!Number.isSafeInteger(lastHttpStatus) || lastHttpStatus < 100)) ||
    (state === "published" && (!videoId || offset !== totalBytes))
  ) {
    return null;
  }

  return {
    version: YOUTUBE_RESUMABLE_CHECKPOINT_VERSION,
    sessionUrl,
    requestFingerprint,
    totalBytes,
    mimeType,
    rangeSupported,
    chunkSizeBytes,
    offset,
    state,
    createdAt,
    updatedAt,
    videoId,
    lastHttpStatus,
  };
}

function youtubePhaseNowIso(dependencies: YoutubeShortsUploadDependencies) {
  return (dependencies.now?.() || new Date()).toISOString();
}

function withYoutubeCheckpointUpdate(
  checkpoint: YoutubeResumableUploadCheckpoint,
  dependencies: YoutubeShortsUploadDependencies,
  patch: Partial<YoutubeResumableUploadCheckpoint>,
) {
  return {
    ...checkpoint,
    ...patch,
    updatedAt: youtubePhaseNowIso(dependencies),
  } satisfies YoutubeResumableUploadCheckpoint;
}

function createYoutubePhaseFetch(
  dependencies: YoutubeShortsUploadDependencies,
) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch.bind(globalThis);
  const timeoutMs = Math.max(
    5_000,
    Math.min(
      45_000,
      Number(dependencies.requestTimeoutMs || YOUTUBE_PHASE_HTTP_TIMEOUT_MS),
    ),
  );
  return ((input: RequestInfo | URL, init: RequestInit = {}) =>
    fetchImpl(input, {
      ...init,
      signal: init.signal || AbortSignal.timeout(timeoutMs),
    })) satisfies FetchLike;
}

function youtubeRetryAfterMs(response?: Response | null) {
  const raw = String(response?.headers.get("retry-after") || "").trim();
  if (/^\d+$/.test(raw)) {
    return Math.max(1_000, Math.min(60_000, Number(raw) * 1_000));
  }
  return YOUTUBE_PHASE_RETRY_AFTER_MS;
}

function parsePositiveContentLength(value: string | null) {
  const raw = String(value || "").trim();
  if (!/^\d+$/.test(raw)) return 0;
  const size = Number(raw);
  return Number.isSafeInteger(size) && size > 0 ? size : 0;
}

function parseExactContentRange(value: string | null) {
  const match = String(value || "").match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  const firstByte = Number(match[1]);
  const lastByte = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(firstByte) ||
    !Number.isSafeInteger(lastByte) ||
    !Number.isSafeInteger(total) ||
    firstByte < 0 ||
    lastByte < firstByte ||
    total <= lastByte
  ) {
    return null;
  }
  return { firstByte, lastByte, total };
}

function parseYoutubeResumeOffset(value: string | null, total: number) {
  if (!value) return 0;
  const match = String(value).match(/^(?:bytes=)?0-(\d+)$/i);
  if (!match) {
    throw new Error("YouTube a renvoyé une position de reprise invalide.");
  }
  const lastByte = Number(match[1]);
  if (!Number.isSafeInteger(lastByte) || lastByte < 0 || lastByte >= total) {
    throw new Error("YouTube a renvoyé une position de reprise hors limites.");
  }
  return lastByte + 1;
}

function normalizeChunkSize(value: unknown) {
  const requested = Number(value || YOUTUBE_RESUMABLE_CHUNK_BYTES);
  const bounded = Math.min(
    YOUTUBE_RESUMABLE_MAX_CHUNK_BYTES,
    Math.max(YOUTUBE_RESUMABLE_CHUNK_GRANULARITY_BYTES, requested),
  );
  return (
    Math.floor(bounded / YOUTUBE_RESUMABLE_CHUNK_GRANULARITY_BYTES) *
    YOUTUBE_RESUMABLE_CHUNK_GRANULARITY_BYTES
  );
}

function isTransientUploadStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function defaultWait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function cancelResponseBody(response: Response | null) {
  try {
    await response?.body?.cancel();
  } catch {
    // Best effort. Probe/range bodies must not stay open after an invalid reply.
  }
}

async function readResponseData(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: { message: raw } };
  }
}

async function probeYoutubeVideoSource(params: {
  videoUrl: string;
  fetchImpl: FetchLike;
}) {
  if (params.videoUrl.startsWith("data:")) {
    throw new Error(
      "Les vidéos YouTube doivent provenir du stockage sécurisé iNrCy.",
    );
  }

  let size = 0;
  let mimeType = "video/mp4";
  let head: Response | null = null;
  try {
    head = await params.fetchImpl(params.videoUrl, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
    });
    if (head.ok) {
      size = parsePositiveContentLength(head.headers.get("content-length"));
      mimeType =
        String(head.headers.get("content-type") || mimeType)
          .split(";")[0]
          .trim() || mimeType;
    }
  } catch {
    // The bounded range probe below is authoritative when HEAD is unavailable.
  } finally {
    await cancelResponseBody(head);
  }

  let rangeSupported = false;
  let rangeProbe: Response | null = null;
  try {
    rangeProbe = await params.fetchImpl(params.videoUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
        "Accept-Encoding": "identity",
      },
      redirect: "follow",
      cache: "no-store",
    });
    const probedMimeType = String(
      rangeProbe.headers.get("content-type") || "",
    )
      .split(";")[0]
      .trim();
    if (probedMimeType) mimeType = probedMimeType;

    if (rangeProbe.status === 206) {
      const contentRange = parseExactContentRange(
        rangeProbe.headers.get("content-range"),
      );
      if (
        !contentRange ||
        contentRange.firstByte !== 0 ||
        contentRange.lastByte !== 0 ||
        (size > 0 && contentRange.total !== size)
      ) {
        throw new Error("Le stockage vidéo a renvoyé une plage incohérente.");
      }
      size = contentRange.total;
      rangeSupported = true;
    } else if (rangeProbe.ok && !size) {
      size = parsePositiveContentLength(
        rangeProbe.headers.get("content-length"),
      );
    }
  } finally {
    await cancelResponseBody(rangeProbe);
  }

  if (!size) {
    throw new Error("La taille de la vidéo YouTube n'est pas vérifiable.");
  }
  if (size > YOUTUBE_VIDEO_MAX_BYTES) {
    throw new Error("La vidéo YouTube dépasse la limite de 300 Mo.");
  }
  return { size, mimeType, rangeSupported } satisfies YoutubeVideoSource;
}

async function openYoutubeSourceRange(params: {
  sourceUrl: string;
  firstByte: number;
  lastByte: number;
  total: number;
  fetchImpl: FetchLike;
}) {
  const expectedLength = params.lastByte - params.firstByte + 1;
  const response = await params.fetchImpl(params.sourceUrl, {
    method: "GET",
    headers: {
      Range: `bytes=${params.firstByte}-${params.lastByte}`,
      "Accept-Encoding": "identity",
    },
    redirect: "follow",
    cache: "no-store",
  });
  const contentRange = parseExactContentRange(
    response.headers.get("content-range"),
  );
  const declaredLength = parsePositiveContentLength(
    response.headers.get("content-length"),
  );
  if (
    response.status !== 206 ||
    !contentRange ||
    contentRange.firstByte !== params.firstByte ||
    contentRange.lastByte !== params.lastByte ||
    contentRange.total !== params.total ||
    (declaredLength > 0 && declaredLength !== expectedLength) ||
    !response.body
  ) {
    await cancelResponseBody(response);
    throw new Error(
      `Le stockage n'a pas confirmé la plage vidéo ${params.firstByte}-${params.lastByte}.`,
    );
  }
  return { response, expectedLength };
}

async function openYoutubeFullSource(params: {
  sourceUrl: string;
  source: YoutubeVideoSource;
  fetchImpl: FetchLike;
}) {
  const response = await params.fetchImpl(params.sourceUrl, {
    method: "GET",
    headers: { "Accept-Encoding": "identity" },
    redirect: "follow",
    cache: "no-store",
  });
  const declaredLength = parsePositiveContentLength(
    response.headers.get("content-length"),
  );
  if (
    response.status !== 200 ||
    declaredLength !== params.source.size ||
    !response.body
  ) {
    await cancelResponseBody(response);
    throw new Error(
      "Le stockage sans Range n'a pas confirmé la vidéo YouTube complète.",
    );
  }
  return response;
}

async function queryYoutubeResumableSession(params: {
  location: string;
  accessToken: string;
  total: number;
  fetchImpl: FetchLike;
}): Promise<YoutubeSessionProbe> {
  const response = await params.fetchImpl(params.location, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${params.total}`,
    },
    cache: "no-store",
  });
  if (response.status === 308) {
    await cancelResponseBody(response);
    return {
      kind: "resume",
      offset: parseYoutubeResumeOffset(response.headers.get("range"), params.total),
    };
  }
  const data = await readResponseData(response);
  if (response.ok) return { kind: "completed", response, data };
  return { kind: "failed", response, data };
}

function createYoutubeChunkUploadRequest(params: {
  accessToken: string;
  mimeType: string;
  firstByte: number;
  lastByte: number;
  total: number;
  body: BodyInit;
}) {
  const uploadRequest: RequestInit & { duplex?: "half" } = {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": params.mimeType,
      "Content-Length": String(params.lastByte - params.firstByte + 1),
      "Content-Range": `bytes ${params.firstByte}-${params.lastByte}/${params.total}`,
    },
    body: params.body,
    cache: "no-store",
  };
  uploadRequest.duplex = "half";
  return uploadRequest;
}

async function recoverYoutubeUploadOffset(params: {
  location: string;
  accessToken: string;
  total: number;
  fallbackOffset: number;
  fetchImpl: FetchLike;
}) {
  try {
    const recovered = await queryYoutubeResumableSession(params);
    if (
      recovered.kind === "failed" &&
      isTransientUploadStatus(recovered.response.status)
    ) {
      return { kind: "resume", offset: params.fallbackOffset } as const;
    }
    return recovered;
  } catch {
    return { kind: "resume", offset: params.fallbackOffset } as const;
  }
}

async function uploadYoutubeByRanges(params: {
  location: string;
  accessToken: string;
  sourceUrl: string;
  source: YoutubeVideoSource;
  fetchImpl: FetchLike;
  waitImpl: (ms: number) => Promise<void>;
  chunkSize: number;
  maxRetries: number;
}): Promise<YoutubeTransferResult> {
  let offset = 0;
  let consecutiveFailures = 0;
  let noProgressResponses = 0;

  while (offset < params.source.size) {
    const chunkStart = offset;
    const chunkEnd = Math.min(
      params.source.size - 1,
      chunkStart + params.chunkSize - 1,
    );
    let sourceRange: Awaited<ReturnType<typeof openYoutubeSourceRange>> | null =
      null;
    let uploadResponse: Response;

    try {
      sourceRange = await openYoutubeSourceRange({
        sourceUrl: params.sourceUrl,
        firstByte: chunkStart,
        lastByte: chunkEnd,
        total: params.source.size,
        fetchImpl: params.fetchImpl,
      });
      uploadResponse = await params.fetchImpl(
        params.location,
        createYoutubeChunkUploadRequest({
          accessToken: params.accessToken,
          mimeType: params.source.mimeType,
          firstByte: chunkStart,
          lastByte: chunkEnd,
          total: params.source.size,
          body: sourceRange.response.body as unknown as BodyInit,
        }),
      );
    } catch (error) {
      if (sourceRange) await cancelResponseBody(sourceRange.response);
      consecutiveFailures += 1;
      if (consecutiveFailures > params.maxRetries) throw error;
      const recovered = await recoverYoutubeUploadOffset({
        location: params.location,
        accessToken: params.accessToken,
        total: params.source.size,
        fallbackOffset: offset,
        fetchImpl: params.fetchImpl,
      });
      if (recovered.kind === "completed") {
        return { response: recovered.response, data: recovered.data };
      }
      if (recovered.kind === "failed") {
        return { response: recovered.response, data: recovered.data };
      }
      offset = recovered.offset;
      await params.waitImpl(Math.min(2_000, 250 * 2 ** consecutiveFailures));
      continue;
    }

    if (uploadResponse.status === 308) {
      await cancelResponseBody(uploadResponse);
      const nextOffset = parseYoutubeResumeOffset(
        uploadResponse.headers.get("range"),
        params.source.size,
      );
      if (nextOffset > chunkEnd + 1) {
        throw new Error("YouTube a confirmé des octets qui n'ont pas été envoyés.");
      }
      if (nextOffset <= offset) {
        noProgressResponses += 1;
        if (noProgressResponses > params.maxRetries) {
          throw new Error("La session YouTube n'avance plus.");
        }
      } else {
        noProgressResponses = 0;
        consecutiveFailures = 0;
      }
      offset = nextOffset;
      continue;
    }

    const data = await readResponseData(uploadResponse);
    if (uploadResponse.ok) return { response: uploadResponse, data };
    if (!isTransientUploadStatus(uploadResponse.status)) {
      return { response: uploadResponse, data };
    }

    consecutiveFailures += 1;
    if (consecutiveFailures > params.maxRetries) {
      return { response: uploadResponse, data };
    }
    const recovered = await recoverYoutubeUploadOffset({
      location: params.location,
      accessToken: params.accessToken,
      total: params.source.size,
      fallbackOffset: offset,
      fetchImpl: params.fetchImpl,
    });
    if (recovered.kind === "completed") {
      return { response: recovered.response, data: recovered.data };
    }
    if (recovered.kind === "failed") {
      return { response: recovered.response, data: recovered.data };
    }
    offset = recovered.offset;
    await params.waitImpl(Math.min(2_000, 250 * 2 ** consecutiveFailures));
  }

  throw new Error("YouTube n'a pas confirmé la fin de l'upload vidéo.");
}

async function uploadYoutubeWithoutRanges(params: {
  location: string;
  accessToken: string;
  sourceUrl: string;
  source: YoutubeVideoSource;
  fetchImpl: FetchLike;
  waitImpl: (ms: number) => Promise<void>;
  maxRetries: number;
}): Promise<YoutubeTransferResult> {
  const source = params.source;
  if (source.size > YOUTUBE_SINGLE_STREAM_FALLBACK_MAX_BYTES) {
    throw new Error(
      "Le stockage vidéo ne permet pas la reprise YouTube pour ce fichier volumineux.",
    );
  }

  for (let attempt = 0; attempt <= params.maxRetries; attempt += 1) {
    let res: Response | null = null;
    let uploadResponse: Response;
    try {
      res = await openYoutubeFullSource({
        sourceUrl: params.sourceUrl,
        source,
        fetchImpl: params.fetchImpl,
      });
      const uploadRequest: RequestInit & { duplex?: "half" } = {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": source.mimeType,
          "Content-Length": String(source.size),
          "Content-Range": `bytes 0-${source.size - 1}/${source.size}`,
        },
        body: res.body as unknown as BodyInit,
        cache: "no-store",
      };
      uploadRequest.duplex = "half";
      uploadResponse = await params.fetchImpl(params.location, uploadRequest);
    } catch (error) {
      if (res) await cancelResponseBody(res);
      if (attempt >= params.maxRetries) throw error;
      const recovered = await recoverYoutubeUploadOffset({
        location: params.location,
        accessToken: params.accessToken,
        total: params.source.size,
        fallbackOffset: 0,
        fetchImpl: params.fetchImpl,
      });
      if (recovered.kind === "completed") {
        return { response: recovered.response, data: recovered.data };
      }
      if (recovered.kind === "failed") {
        return { response: recovered.response, data: recovered.data };
      }
      if (recovered.offset > 0) {
        throw new Error(
          "YouTube a reçu une partie de la vidéo, mais le stockage ne permet pas une reprise sûre.",
        );
      }
      await params.waitImpl(Math.min(2_000, 250 * 2 ** attempt));
      continue;
    }

    if (uploadResponse.status === 308) {
      await cancelResponseBody(uploadResponse);
      const offset = parseYoutubeResumeOffset(
        uploadResponse.headers.get("range"),
        params.source.size,
      );
      if (offset > 0) {
        throw new Error(
          "YouTube demande une reprise partielle, indisponible sans Range source.",
        );
      }
      continue;
    }

    const data = await readResponseData(uploadResponse);
    if (uploadResponse.ok || !isTransientUploadStatus(uploadResponse.status)) {
      return { response: uploadResponse, data };
    }
    if (attempt >= params.maxRetries) return { response: uploadResponse, data };

    const recovered = await recoverYoutubeUploadOffset({
      location: params.location,
      accessToken: params.accessToken,
      total: params.source.size,
      fallbackOffset: 0,
      fetchImpl: params.fetchImpl,
    });
    if (recovered.kind === "completed") {
      return { response: recovered.response, data: recovered.data };
    }
    if (recovered.kind === "failed") {
      return { response: recovered.response, data: recovered.data };
    }
    if (recovered.offset > 0) {
      throw new Error(
        "YouTube a reçu une partie de la vidéo, mais le stockage ne permet pas une reprise sûre.",
      );
    }
    await params.waitImpl(Math.min(2_000, 250 * 2 ** attempt));
  }

  throw new Error("YouTube n'a pas confirmé l'upload vidéo monobloc.");
}

function youtubePublishedPhaseResult(params: {
  checkpoint: YoutubeResumableUploadCheckpoint;
  input: YoutubeShortsUploadInput;
  dependencies: YoutubeShortsUploadDependencies;
  data: unknown;
  httpStatus: number;
}): YoutubeResumableUploadPhaseResult {
  const dataRecord = asRecord(params.data);
  const videoId = String(asString(dataRecord.id) || "").trim();
  if (!videoId) {
    const unknownCheckpoint = withYoutubeCheckpointUpdate(
      params.checkpoint,
      params.dependencies,
      {
        state: "upload_unknown",
        offset: params.checkpoint.totalBytes,
        lastHttpStatus: params.httpStatus,
      },
    );
    return {
      ok: false,
      phase: "upload",
      outcome: "ambiguous",
      error: "YouTube a terminé l'upload sans renvoyer l'identifiant vidéo.",
      code: "youtube_upload_completed_without_video_id",
      retryable: false,
      requestMayHaveSucceeded: true,
      checkpoint: unknownCheckpoint,
      status: params.httpStatus,
      raw: params.data,
    };
  }

  const publishedCheckpoint = withYoutubeCheckpointUpdate(
    params.checkpoint,
    params.dependencies,
    {
      state: "published",
      offset: params.checkpoint.totalBytes,
      videoId,
      lastHttpStatus: params.httpStatus,
    },
  );
  const metadata = buildYoutubeUploadMetadata(params.input);
  const status = asRecord(dataRecord.status);
  const processingDetails = asRecord(dataRecord.processingDetails);
  return {
    ok: true,
    phase: "upload",
    outcome: "published",
    checkpoint: publishedCheckpoint,
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    shortsUrl: `https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`,
    title: asString(asRecord(dataRecord.snippet).title) || metadata.snippet.title,
    privacyStatus:
      asString(status.privacyStatus) || params.input.privacyStatus,
    uploadStatus: asString(status.uploadStatus) || null,
    processingStatus:
      asString(processingDetails.processingStatus) || null,
    publicationType:
      params.input.publicationType === "short" ? "short" : "video",
    raw: params.data,
  };
}

export async function createYoutubeResumableUploadCheckpoint(
  input: YoutubeShortsUploadInput,
  dependencies: YoutubeShortsUploadDependencies = {},
): Promise<YoutubeResumableUploadPhaseResult> {
  const accessToken = String(input.accessToken || "").trim();
  const videoUrl = String(input.videoUrl || "").trim();
  if (!accessToken || !videoUrl) {
    return {
      ok: false,
      phase: "create",
      outcome: "failed",
      error: !accessToken
        ? "Connexion YouTube expirée."
        : "Vidéo YouTube introuvable.",
      code: "youtube_upload_create_invalid_input",
      retryable: false,
      requestMayHaveSucceeded: false,
    };
  }

  const fetchImpl = createYoutubePhaseFetch(dependencies);
  try {
    const probedSource = await probeYoutubeVideoSource({ videoUrl, fetchImpl });
    const source: YoutubeVideoSource = {
      ...probedSource,
      mimeType:
        String(input.mimeType || probedSource.mimeType || "video/mp4").trim() ||
        "video/mp4",
    };
    if (
      !source.rangeSupported &&
      source.size > YOUTUBE_SINGLE_STREAM_FALLBACK_MAX_BYTES
    ) {
      return {
        ok: false,
        phase: "create",
        outcome: "failed",
        error:
          "Le stockage vidéo ne permet pas la reprise YouTube pour ce fichier volumineux.",
        code: "youtube_upload_source_range_required",
        retryable: false,
        requestMayHaveSucceeded: false,
      };
    }

    const initUrl = `https://www.googleapis.com/upload/youtube/v3/videos?${new URLSearchParams(
      { uploadType: "resumable", part: "snippet,status" },
    ).toString()}`;
    const initResponse = await fetchImpl(initUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": source.mimeType,
        "X-Upload-Content-Length": String(source.size),
      },
      body: JSON.stringify(buildYoutubeUploadMetadata(input)),
      cache: "no-store",
    });

    if (!initResponse.ok) {
      const data = await readResponseData(initResponse);
      const retryable = isTransientUploadStatus(initResponse.status);
      return {
        ok: false,
        phase: "create",
        outcome: retryable ? "retryable" : "failed",
        error: youtubeErrorMessage(
          data,
          "YouTube a refusé la préparation de l'upload.",
        ),
        code: retryable
          ? "youtube_upload_session_retryable"
          : "youtube_upload_session_rejected",
        retryable,
        requestMayHaveSucceeded: false,
        retryAfterMs: retryable
          ? youtubeRetryAfterMs(initResponse)
          : undefined,
        status: initResponse.status,
        reason: getYoutubeErrorReason(data),
        raw: data,
      };
    }

    const sessionUrl = String(initResponse.headers.get("location") || "").trim();
    await cancelResponseBody(initResponse);
    if (!isYoutubeSessionUrl(sessionUrl)) {
      return {
        ok: false,
        phase: "create",
        outcome: "retryable",
        error: "YouTube n'a pas renvoyé une URL de session exploitable.",
        code: "youtube_upload_session_url_missing",
        retryable: true,
        requestMayHaveSucceeded: false,
        retryAfterMs: YOUTUBE_PHASE_RETRY_AFTER_MS,
      };
    }

    const createdAt = youtubePhaseNowIso(dependencies);
    return {
      ok: true,
      phase: "create",
      outcome: "checkpoint",
      checkpoint: {
        version: YOUTUBE_RESUMABLE_CHECKPOINT_VERSION,
        sessionUrl,
        requestFingerprint:
          buildYoutubeResumableUploadRequestFingerprint(input),
        totalBytes: source.size,
        mimeType: source.mimeType,
        rangeSupported: source.rangeSupported,
        chunkSizeBytes: normalizeChunkSize(dependencies.chunkSizeBytes),
        offset: 0,
        state: "uploading",
        createdAt,
        updatedAt: createdAt,
        videoId: null,
        lastHttpStatus: initResponse.status,
      },
    };
  } catch (error) {
    return {
      ok: false,
      phase: "create",
      outcome: "retryable",
      error:
        error instanceof Error
          ? error.message
          : "La session d'upload YouTube n'a pas pu être créée.",
      code: "youtube_upload_session_interrupted",
      retryable: true,
      // Initiating a session uploads no media bytes. A replacement session
      // therefore cannot publish a duplicate video if Location was lost.
      requestMayHaveSucceeded: false,
      retryAfterMs: YOUTUBE_PHASE_RETRY_AFTER_MS,
    };
  }
}

export async function resumeYoutubeResumableUploadCheckpoint(
  input: YoutubeShortsUploadInput & { checkpoint: unknown },
  dependencies: YoutubeShortsUploadDependencies = {},
): Promise<YoutubeResumableUploadPhaseResult> {
  const checkpoint = parseYoutubeResumableUploadCheckpoint(input.checkpoint);
  const expectedFingerprint = buildYoutubeResumableUploadRequestFingerprint(input);
  if (!checkpoint || checkpoint.requestFingerprint !== expectedFingerprint) {
    return {
      ok: false,
      phase: "upload",
      outcome: "ambiguous",
      error: "Le checkpoint d'upload YouTube est invalide.",
      code: "youtube_upload_checkpoint_invalid",
      retryable: false,
      requestMayHaveSucceeded: true,
    };
  }
  if (checkpoint.state === "published" && checkpoint.videoId) {
    return youtubePublishedPhaseResult({
      checkpoint,
      input,
      dependencies,
      data: { id: checkpoint.videoId },
      httpStatus: checkpoint.lastHttpStatus || 201,
    });
  }
  if (checkpoint.state === "upload_unknown" || checkpoint.state === "failed") {
    return {
      ok: false,
      phase: "upload",
      outcome:
        checkpoint.state === "upload_unknown" ? "ambiguous" : "failed",
      error:
        checkpoint.state === "upload_unknown"
          ? "Le résultat de l'upload YouTube est incertain."
          : "La session d'upload YouTube est dans un état terminal.",
      code:
        checkpoint.state === "upload_unknown"
          ? "youtube_upload_result_unknown"
          : "youtube_upload_session_terminal",
      retryable: false,
      requestMayHaveSucceeded: checkpoint.state === "upload_unknown",
      checkpoint,
    };
  }

  const accessToken = String(input.accessToken || "").trim();
  if (!accessToken) {
    return {
      ok: false,
      phase: "upload",
      outcome: "failed",
      error: "Connexion YouTube expirée.",
      code: "youtube_upload_token_missing",
      retryable: false,
      requestMayHaveSucceeded: false,
      checkpoint,
    };
  }

  const fetchImpl = createYoutubePhaseFetch(dependencies);
  let sessionProbe: YoutubeSessionProbe;
  try {
    sessionProbe = await queryYoutubeResumableSession({
      location: checkpoint.sessionUrl,
      accessToken,
      total: checkpoint.totalBytes,
      fetchImpl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/position de reprise/i.test(message)) {
      const failedCheckpoint = withYoutubeCheckpointUpdate(
        checkpoint,
        dependencies,
        { state: "failed" },
      );
      return {
        ok: false,
        phase: "upload",
        outcome: "failed",
        error: message,
        code: "youtube_upload_session_offset_invalid",
        retryable: false,
        requestMayHaveSucceeded: false,
        checkpoint: failedCheckpoint,
      };
    }
    return {
      ok: false,
      phase: "upload",
      outcome: "retryable",
      error: message || "Impossible de vérifier la session YouTube.",
      code: "youtube_upload_session_probe_interrupted",
      retryable: true,
      requestMayHaveSucceeded: true,
      retryAfterMs: YOUTUBE_PHASE_RETRY_AFTER_MS,
      checkpoint,
    };
  }

  if (sessionProbe.kind === "completed") {
    return youtubePublishedPhaseResult({
      checkpoint,
      input,
      dependencies,
      data: sessionProbe.data,
      httpStatus: sessionProbe.response.status,
    });
  }
  if (sessionProbe.kind === "failed") {
    const retryable = isTransientUploadStatus(sessionProbe.response.status);
    const nextCheckpoint = retryable
      ? checkpoint
      : withYoutubeCheckpointUpdate(checkpoint, dependencies, {
          state: "failed",
          lastHttpStatus: sessionProbe.response.status,
        });
    return {
      ok: false,
      phase: "upload",
      outcome: retryable ? "retryable" : "failed",
      error: youtubeErrorMessage(
        sessionProbe.data,
        "YouTube a refusé la reprise de l'upload.",
      ),
      code: retryable
        ? "youtube_upload_session_probe_retryable"
        : "youtube_upload_session_rejected",
      retryable,
      requestMayHaveSucceeded: retryable,
      retryAfterMs: retryable
        ? youtubeRetryAfterMs(sessionProbe.response)
        : undefined,
      checkpoint: nextCheckpoint,
      status: sessionProbe.response.status,
      reason: getYoutubeErrorReason(sessionProbe.data),
      raw: sessionProbe.data,
    };
  }

  if (sessionProbe.offset < checkpoint.offset) {
    const unknownCheckpoint = withYoutubeCheckpointUpdate(
      checkpoint,
      dependencies,
      { state: "upload_unknown" },
    );
    return {
      ok: false,
      phase: "upload",
      outcome: "ambiguous",
      error: "YouTube a renvoyé un offset antérieur au checkpoint durable.",
      code: "youtube_upload_offset_regressed",
      retryable: false,
      requestMayHaveSucceeded: true,
      checkpoint: unknownCheckpoint,
    };
  }

  const synchronizedCheckpoint = withYoutubeCheckpointUpdate(
    checkpoint,
    dependencies,
    { offset: sessionProbe.offset, lastHttpStatus: 308 },
  );
  if (!checkpoint.rangeSupported && sessionProbe.offset > 0) {
    const failedCheckpoint = withYoutubeCheckpointUpdate(
      synchronizedCheckpoint,
      dependencies,
      { state: "failed" },
    );
    return {
      ok: false,
      phase: "upload",
      outcome: "failed",
      error:
        "YouTube demande une reprise partielle, indisponible sans Range source.",
      code: "youtube_upload_source_range_unavailable",
      retryable: false,
      requestMayHaveSucceeded: false,
      checkpoint: failedCheckpoint,
    };
  }

  const chunkStart = sessionProbe.offset;
  const chunkEnd = checkpoint.rangeSupported
    ? Math.min(
        checkpoint.totalBytes - 1,
        chunkStart + checkpoint.chunkSizeBytes - 1,
      )
    : checkpoint.totalBytes - 1;
  let sourceResponse: Response | null = null;
  let uploadResponse: Response;
  try {
    if (checkpoint.rangeSupported) {
      const sourceRange = await openYoutubeSourceRange({
        sourceUrl: input.videoUrl,
        firstByte: chunkStart,
        lastByte: chunkEnd,
        total: checkpoint.totalBytes,
        fetchImpl,
      });
      sourceResponse = sourceRange.response;
    } else {
      sourceResponse = await openYoutubeFullSource({
        sourceUrl: input.videoUrl,
        source: {
          size: checkpoint.totalBytes,
          mimeType: checkpoint.mimeType,
          rangeSupported: false,
        },
        fetchImpl,
      });
    }
    uploadResponse = await fetchImpl(
      checkpoint.sessionUrl,
      createYoutubeChunkUploadRequest({
        accessToken,
        mimeType: checkpoint.mimeType,
        firstByte: chunkStart,
        lastByte: chunkEnd,
        total: checkpoint.totalBytes,
        body: sourceResponse.body as unknown as BodyInit,
      }),
    );
  } catch (error) {
    await cancelResponseBody(sourceResponse);
    return {
      ok: false,
      phase: "upload",
      outcome: "retryable",
      error:
        error instanceof Error
          ? error.message
          : "Le transfert d'un segment YouTube a été interrompu.",
      code: "youtube_upload_chunk_interrupted",
      retryable: true,
      // The next worker asks this exact session for its authoritative offset.
      // It never assumes that an interrupted PUT stored zero bytes.
      requestMayHaveSucceeded: true,
      retryAfterMs: YOUTUBE_PHASE_RETRY_AFTER_MS,
      checkpoint: synchronizedCheckpoint,
    };
  }

  if (uploadResponse.status === 308) {
    await cancelResponseBody(uploadResponse);
    let nextOffset: number;
    try {
      nextOffset = parseYoutubeResumeOffset(
        uploadResponse.headers.get("range"),
        checkpoint.totalBytes,
      );
    } catch (error) {
      const failedCheckpoint = withYoutubeCheckpointUpdate(
        synchronizedCheckpoint,
        dependencies,
        { state: "failed", lastHttpStatus: uploadResponse.status },
      );
      return {
        ok: false,
        phase: "upload",
        outcome: "failed",
        error:
          error instanceof Error
            ? error.message
            : "YouTube a renvoyé un offset invalide.",
        code: "youtube_upload_chunk_offset_invalid",
        retryable: false,
        requestMayHaveSucceeded: false,
        checkpoint: failedCheckpoint,
      };
    }
    if (nextOffset < chunkStart || nextOffset > chunkEnd + 1) {
      const unknownCheckpoint = withYoutubeCheckpointUpdate(
        synchronizedCheckpoint,
        dependencies,
        { state: "upload_unknown", lastHttpStatus: uploadResponse.status },
      );
      return {
        ok: false,
        phase: "upload",
        outcome: "ambiguous",
        error: "YouTube a confirmé une plage différente du segment envoyé.",
        code: "youtube_upload_chunk_ack_mismatch",
        retryable: false,
        requestMayHaveSucceeded: true,
        checkpoint: unknownCheckpoint,
      };
    }
    if (nextOffset === chunkStart) {
      return {
        ok: false,
        phase: "upload",
        outcome: "retryable",
        error: "La session YouTube n'a pas encore accepté le segment.",
        code: "youtube_upload_chunk_no_progress",
        retryable: true,
        requestMayHaveSucceeded: false,
        retryAfterMs: youtubeRetryAfterMs(uploadResponse),
        checkpoint: synchronizedCheckpoint,
      };
    }
    const nextCheckpoint = withYoutubeCheckpointUpdate(
      synchronizedCheckpoint,
      dependencies,
      { offset: nextOffset, lastHttpStatus: uploadResponse.status },
    );
    return {
      ok: true,
      phase: "upload",
      outcome: "processing",
      checkpoint: nextCheckpoint,
      retryAfterMs: youtubeRetryAfterMs(uploadResponse),
    };
  }

  const data = await readResponseData(uploadResponse);
  if (uploadResponse.ok) {
    return youtubePublishedPhaseResult({
      checkpoint: synchronizedCheckpoint,
      input,
      dependencies,
      data,
      httpStatus: uploadResponse.status,
    });
  }
  if (isTransientUploadStatus(uploadResponse.status)) {
    return {
      ok: false,
      phase: "upload",
      outcome: "retryable",
      error: youtubeErrorMessage(data, "Le transfert YouTube doit reprendre."),
      code: "youtube_upload_chunk_retryable",
      retryable: true,
      requestMayHaveSucceeded: true,
      retryAfterMs: youtubeRetryAfterMs(uploadResponse),
      checkpoint: synchronizedCheckpoint,
      status: uploadResponse.status,
      reason: getYoutubeErrorReason(data),
      raw: data,
    };
  }

  const failedCheckpoint = withYoutubeCheckpointUpdate(
    synchronizedCheckpoint,
    dependencies,
    { state: "failed", lastHttpStatus: uploadResponse.status },
  );
  return {
    ok: false,
    phase: "upload",
    outcome: "failed",
    error: youtubeErrorMessage(data, "YouTube a refusé la vidéo."),
    code: "youtube_upload_chunk_rejected",
    retryable: false,
    requestMayHaveSucceeded: false,
    checkpoint: failedCheckpoint,
    status: uploadResponse.status,
    reason: getYoutubeErrorReason(data),
    raw: data,
  };
}

export async function uploadYoutubeShort(
  input: YoutubeShortsUploadInput,
  dependencies: YoutubeShortsUploadDependencies = {},
): Promise<YoutubeShortsUploadResult> {
  const accessToken = String(input.accessToken || "").trim();
  const videoUrl = String(input.videoUrl || "").trim();
  if (!accessToken) return { ok: false, error: "Connexion YouTube expirée." };
  if (!videoUrl) return { ok: false, error: "Vidéo YouTube introuvable." };

  const fetchImpl = dependencies.fetchImpl || globalThis.fetch.bind(globalThis);
  const waitImpl = dependencies.waitImpl || defaultWait;
  const chunkSize = normalizeChunkSize(dependencies.chunkSizeBytes);
  const maxRetries = Math.max(
    0,
    Math.min(
      8,
      Math.floor(
        Number(
          dependencies.maxChunkRetries ?? YOUTUBE_DEFAULT_MAX_CHUNK_RETRIES,
        ),
      ),
    ),
  );

  try {
    const probedSource = await probeYoutubeVideoSource({
      videoUrl,
      fetchImpl,
    });
    const source: YoutubeVideoSource = {
      ...probedSource,
      mimeType:
        String(input.mimeType || probedSource.mimeType || "video/mp4").trim() ||
        "video/mp4",
    };
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
    const initRes = await fetchImpl(initUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": source.mimeType,
        "X-Upload-Content-Length": String(source.size),
      },
      body: JSON.stringify(metadata),
      cache: "no-store",
    });

    if (!initRes.ok) {
      const data = await readResponseData(initRes);
      return {
        ok: false,
        status: initRes.status,
        reason: getYoutubeErrorReason(data),
        error: youtubeErrorMessage(
          data,
          "YouTube a refusé la préparation de l'upload.",
        ),
        raw: data,
      };
    }

    const location = initRes.headers.get("location") || "";
    if (!location) {
      return { ok: false, error: "YouTube n'a pas renvoyé d'URL d'upload." };
    }

    const transfer = source.rangeSupported
      ? await uploadYoutubeByRanges({
          location,
          accessToken,
          sourceUrl: videoUrl,
          source,
          fetchImpl,
          waitImpl,
          chunkSize,
          maxRetries,
        })
      : await uploadYoutubeWithoutRanges({
          location,
          accessToken,
          sourceUrl: videoUrl,
          source,
          fetchImpl,
          waitImpl,
          maxRetries,
        });

    if (!transfer.response.ok) {
      return {
        ok: false,
        status: transfer.response.status,
        reason: getYoutubeErrorReason(transfer.data),
        error: youtubeErrorMessage(
          transfer.data,
          "YouTube a refusé la vidéo.",
        ),
        raw: transfer.data,
      };
    }

    const dataRec = asRecord(transfer.data);
    const videoId = asString(dataRec.id) || null;
    const status = asRecord(dataRec.status);
    const processingDetails = asRecord(dataRec.processingDetails);
    return {
      ok: true,
      videoId,
      videoUrl: videoId
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
        : null,
      shortsUrl: videoId
        ? `https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`
        : null,
      title:
        asString(asRecord(dataRec.snippet).title) || metadata.snippet.title,
      privacyStatus: asString(status.privacyStatus) || input.privacyStatus,
      uploadStatus: asString(status.uploadStatus) || null,
      processingStatus:
        asString(processingDetails.processingStatus) || null,
      publicationType: input.publicationType === "short" ? "short" : "video",
      raw: transfer.data,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Publication YouTube impossible.",
      raw: { requestId: randomUUID() },
    };
  }
}
