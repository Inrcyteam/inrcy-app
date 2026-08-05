import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "./mediaRules.ts";

export const TIKTOK_RANGE_UPLOAD_MAX_ATTEMPTS = 3;
export const TIKTOK_RANGE_SOURCE_TIMEOUT_MS = 30_000;
export const TIKTOK_RANGE_CHUNK_TIMEOUT_MS = 90_000;

export type TikTokRangeSource = {
  /** Stable storage identity. Signed URLs must never be persisted here. */
  sourceKey: string;
  declaredContentType?: string | null;
  getUrl: () => Promise<string>;
};

export type TikTokRangeSourceProbe = {
  totalBytes: number;
  contentType: string;
};

export type TikTokVideoUploadCheckpoint = {
  version: 1;
  publishId: string;
  uploadUrl: string;
  sourceKey: string;
  totalBytes: number;
  contentType: string;
  chunkSize: number;
  totalChunkCount: number;
  nextOffset: number;
  initializedAt: string;
  updatedAt: string;
};

export type TikTokRangeUploadProgress = {
  nextOffset: number;
  responseStatus: number;
  recoveredFromAlreadyUploadedChunk: boolean;
};

type FetchLike = typeof fetch;

type ParsedContentRange = {
  firstByte: number;
  lastByte: number;
  totalBytes: number;
};

type ParsedTikTokUploadContentRange = {
  firstByte: number;
  /**
   * TikTok documents this value as UPLOADED_BYTES (a next offset), while some
   * responses use the usual inclusive Content-Range last-byte convention.
   */
  reportedEnd: number;
  totalBytes: number;
};

export class TikTokRangeUploadError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; status?: number | null; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "TikTokRangeUploadError";
    this.code = code;
    this.retryable = options.retryable === true;
    this.status = Number.isFinite(options.status) ? Number(options.status) : null;
  }
}

function positiveInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) && numberValue > 0
    ? numberValue
    : 0;
}

function isRetryableHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("tiktok_range_timeout")),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function validateHttpsUrl(value: string, kind: "source" | "upload") {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TikTokRangeUploadError(
      `tiktok_${kind}_url_invalid`,
      `L'URL ${kind === "source" ? "de la vidéo" : "d'upload TikTok"} est invalide.`,
    );
  }
  if (parsed.protocol !== "https:") {
    throw new TikTokRangeUploadError(
      `tiktok_${kind}_url_invalid`,
      `L'URL ${kind === "source" ? "de la vidéo" : "d'upload TikTok"} doit utiliser HTTPS.`,
    );
  }
  if (
    kind === "upload" &&
    parsed.hostname !== "tiktokapis.com" &&
    !parsed.hostname.endsWith(".tiktokapis.com")
  ) {
    throw new TikTokRangeUploadError(
      "tiktok_upload_url_untrusted",
      "TikTok a renvoyé une destination d'upload non reconnue.",
    );
  }
  return parsed.toString();
}

export function assertTikTokRangeVideoSize(totalBytes: unknown) {
  const size = positiveInteger(totalBytes);
  if (!size) {
    throw new TikTokRangeUploadError(
      "tiktok_video_source_size_invalid",
      "La taille réelle de la vidéo TikTok est invalide.",
    );
  }
  if (size > INR_MEDIA_VIDEO_SOURCE_MAX_BYTES) {
    throw new TikTokRangeUploadError(
      "tiktok_video_source_too_large",
      "La vidéo TikTok dépasse la limite iNrCy de 300 Mo.",
    );
  }
  return size;
}

export function parseTikTokContentRange(value: unknown): ParsedContentRange | null {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(String(value || "").trim());
  if (!match) return null;
  const firstByte = Number(match[1]);
  const lastByte = Number(match[2]);
  const totalBytes = Number(match[3]);
  if (
    !Number.isSafeInteger(firstByte) ||
    !Number.isSafeInteger(lastByte) ||
    !Number.isSafeInteger(totalBytes) ||
    firstByte < 0 ||
    lastByte < firstByte ||
    totalBytes <= lastByte
  ) {
    return null;
  }
  return { firstByte, lastByte, totalBytes };
}

function parseTikTokUploadContentRange(
  value: unknown,
): ParsedTikTokUploadContentRange | null {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(
    String(value || "").trim(),
  );
  if (!match) return null;
  const firstByte = Number(match[1]);
  const reportedEnd = Number(match[2]);
  const totalBytes = Number(match[3]);
  if (
    !Number.isSafeInteger(firstByte) ||
    !Number.isSafeInteger(reportedEnd) ||
    !Number.isSafeInteger(totalBytes) ||
    firstByte < 0 ||
    reportedEnd < firstByte ||
    totalBytes <= 0 ||
    reportedEnd > totalBytes
  ) {
    return null;
  }
  return { firstByte, reportedEnd, totalBytes };
}

export function validateTikTokSourceRangeHeaders(params: {
  status: number;
  contentRange: unknown;
  contentLength: unknown;
  firstByte: number;
  lastByte: number;
  expectedTotalBytes?: number | null;
}) {
  if (params.status !== 206) {
    throw new TikTokRangeUploadError(
      "tiktok_source_range_status_invalid",
      `Le stockage n'a pas confirmé la lecture partielle de la vidéo (HTTP ${params.status || "inconnu"}).`,
      { retryable: isRetryableHttpStatus(params.status), status: params.status },
    );
  }
  const parsed = parseTikTokContentRange(params.contentRange);
  if (
    !parsed ||
    parsed.firstByte !== params.firstByte ||
    parsed.lastByte !== params.lastByte ||
    (positiveInteger(params.expectedTotalBytes) > 0 &&
      parsed.totalBytes !== params.expectedTotalBytes)
  ) {
    throw new TikTokRangeUploadError(
      "tiktok_source_content_range_invalid",
      "Le stockage a renvoyé une plage vidéo incohérente.",
    );
  }
  const expectedLength = params.lastByte - params.firstByte + 1;
  const contentLength = positiveInteger(params.contentLength);
  if (contentLength !== expectedLength) {
    throw new TikTokRangeUploadError(
      "tiktok_source_content_length_invalid",
      "Le stockage a renvoyé une longueur vidéo incohérente.",
    );
  }
  return parsed;
}

function normalizeUploadContentType(...candidates: unknown[]) {
  const allowed = new Set(["video/mp4", "video/quicktime", "video/webm"]);
  for (const candidate of candidates) {
    const contentType = String(candidate || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (allowed.has(contentType)) return contentType;
  }
  return "video/mp4";
}

async function readExactBodyLength(
  body: ReadableStream<Uint8Array> | null,
  expectedBytes: number,
) {
  if (!body) {
    throw new TikTokRangeUploadError(
      "tiktok_source_body_missing",
      "Le stockage n'a renvoyé aucun octet vidéo.",
    );
  }
  const reader = body.getReader();
  let observedBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      observedBytes += next.value.byteLength;
      if (observedBytes > expectedBytes) {
        await reader.cancel("tiktok_source_body_too_long").catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (observedBytes !== expectedBytes) {
    throw new TikTokRangeUploadError(
      "tiktok_source_body_length_invalid",
      "Le stockage n'a pas transmis le nombre exact d'octets vidéo attendu.",
    );
  }
}

async function fetchSourceRange(params: {
  source: TikTokRangeSource;
  firstByte: number;
  lastByte: number;
  expectedTotalBytes?: number | null;
  fetchImpl: FetchLike;
}) {
  const sourceUrl = validateHttpsUrl(await params.source.getUrl(), "source");
  const timeout = timeoutSignal(TIKTOK_RANGE_SOURCE_TIMEOUT_MS);
  try {
    const response = await params.fetchImpl(sourceUrl, {
      method: "GET",
      headers: {
        Accept: "video/*,application/octet-stream",
        Range: `bytes=${params.firstByte}-${params.lastByte}`,
      },
      redirect: "error",
      cache: "no-store",
      signal: timeout.signal,
    });
    let parsed: ParsedContentRange;
    try {
      parsed = validateTikTokSourceRangeHeaders({
        status: response.status,
        contentRange: response.headers.get("content-range"),
        contentLength: response.headers.get("content-length"),
        firstByte: params.firstByte,
        lastByte: params.lastByte,
        expectedTotalBytes: params.expectedTotalBytes,
      });
    } catch (error) {
      await response.body?.cancel(error).catch(() => undefined);
      throw error;
    }
    const body = response.body;
    if (!body) {
      throw new TikTokRangeUploadError(
        "tiktok_source_body_missing",
        "Le stockage n'a renvoyé aucun flux vidéo.",
      );
    }
    return {
      response,
      body,
      totalBytes: parsed.totalBytes,
      contentType: normalizeUploadContentType(
        params.source.declaredContentType,
        response.headers.get("content-type"),
      ),
    };
  } catch (error) {
    if (error instanceof TikTokRangeUploadError) throw error;
    throw new TikTokRangeUploadError(
      "tiktok_source_range_fetch_failed",
      "La lecture partielle de la vidéo a échoué.",
      { retryable: true, cause: error },
    );
  } finally {
    timeout.clear();
  }
}

export async function probeTikTokRangeSource(params: {
  source: TikTokRangeSource;
  fetchImpl?: FetchLike;
}): Promise<TikTokRangeSourceProbe> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < TIKTOK_RANGE_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      const fetched = await fetchSourceRange({
        source: params.source,
        firstByte: 0,
        lastByte: 0,
        fetchImpl: params.fetchImpl || fetch,
      });
      await readExactBodyLength(fetched.body, 1);
      return {
        totalBytes: assertTikTokRangeVideoSize(fetched.totalBytes),
        contentType: fetched.contentType,
      };
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TikTokRangeUploadError && error.retryable;
      if (!retryable || attempt + 1 >= TIKTOK_RANGE_UPLOAD_MAX_ATTEMPTS) {
        throw error;
      }
      await wait(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

function createExactLengthStream(
  sourceBody: ReadableStream<Uint8Array>,
  expectedBytes: number,
) {
  const reader = sourceBody.getReader();
  let observedBytes = 0;
  let settled = false;
  let resolveExact!: () => void;
  let rejectExact!: (reason: unknown) => void;
  const exact = new Promise<void>((resolve, reject) => {
    resolveExact = resolve;
    rejectExact = reject;
  });

  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    rejectExact(error);
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    resolveExact();
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (observedBytes !== expectedBytes) {
            const error = new TikTokRangeUploadError(
              "tiktok_source_body_length_invalid",
              "Le stockage n'a pas transmis le nombre exact d'octets vidéo attendu.",
            );
            fail(error);
            controller.error(error);
            return;
          }
          finish();
          controller.close();
          return;
        }
        observedBytes += next.value.byteLength;
        if (observedBytes > expectedBytes) {
          const error = new TikTokRangeUploadError(
            "tiktok_source_body_length_invalid",
            "Le stockage a transmis plus d'octets vidéo que prévu.",
          );
          fail(error);
          controller.error(error);
          await reader.cancel(error).catch(() => undefined);
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        fail(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      fail(reason || new Error("tiktok_source_stream_cancelled"));
      await reader.cancel(reason).catch(() => undefined);
    },
  });

  return { stream, exact };
}

function isValidChunkBoundary(params: {
  offset: number;
  totalBytes: number;
  chunkSize: number;
  totalChunkCount: number;
}) {
  if (params.offset === params.totalBytes) return true;
  if (params.offset <= 0 || params.offset % params.chunkSize !== 0) return false;
  return params.offset / params.chunkSize < params.totalChunkCount;
}

export function normalizeTikTokUploadedOffset(params: {
  contentRange: unknown;
  totalBytes: number;
  expectedOffset: number;
  chunkSize: number;
  totalChunkCount: number;
  allowAhead?: boolean;
  status?: number | null;
}) {
  const progress = parseTikTokUploadContentRange(params.contentRange);
  if (
    !progress ||
    progress.firstByte !== 0 ||
    progress.totalBytes !== params.totalBytes
  ) {
    throw new TikTokRangeUploadError(
      "tiktok_upload_content_range_invalid",
      "TikTok a renvoyé une progression d'upload incohérente.",
      { status: params.status },
    );
  }

  // TikTok's documented response uses an exclusive uploaded-byte count, but a
  // successful 201/206 has historically also appeared as an inclusive last
  // byte. Matching the acknowledged request makes that compatibility safe.
  // A 416 is recovery state and does not acknowledge this request, so only the
  // official exclusive form is trusted there; interpreting a partial count as
  // an inclusive byte could skip data after a crash.
  const rawCandidates = params.allowAhead
    ? [progress.reportedEnd]
    : [progress.reportedEnd, progress.reportedEnd + 1];
  const candidates = rawCandidates.filter(
    (offset, index, values) =>
      Number.isSafeInteger(offset) &&
      offset <= params.totalBytes &&
      values.indexOf(offset) === index &&
      isValidChunkBoundary({
        offset,
        totalBytes: params.totalBytes,
        chunkSize: params.chunkSize,
        totalChunkCount: params.totalChunkCount,
      }),
  );
  const acceptable = candidates.filter((offset) =>
    params.allowAhead
      ? offset >= params.expectedOffset
      : offset === params.expectedOffset,
  );

  if (acceptable.length !== 1 || candidates.length !== 1) {
    throw new TikTokRangeUploadError(
      "tiktok_upload_progress_invalid",
      "TikTok n'a pas confirmé exactement le morceau vidéo envoyé.",
      { status: params.status },
    );
  }
  return acceptable[0];
}

function parseTikTokUploadedOffset(
  response: Response,
  params: {
    totalBytes: number;
    expectedOffset: number;
    chunkSize: number;
    totalChunkCount: number;
    allowAhead?: boolean;
  },
) {
  return normalizeTikTokUploadedOffset({
    contentRange: response.headers.get("content-range"),
    status: response.status,
    ...params,
  });
}

export function validateTikTokCheckpointOffset(params: {
  offset: unknown;
  totalBytes: number;
  chunkSize: number;
  totalChunkCount: number;
}) {
  const offset = Number(params.offset);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > params.totalBytes ||
    (offset > 0 && !isValidChunkBoundary({ ...params, offset }))
  ) {
    throw new TikTokRangeUploadError(
      "tiktok_upload_checkpoint_invalid",
      "Le checkpoint TikTok est incohérent ; l'upload n'est pas relancé pour éviter un doublon.",
    );
  }
  return offset;
}

async function uploadOneChunk(params: {
  source: TikTokRangeSource;
  uploadUrl: string;
  contentType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunkCount: number;
  firstByte: number;
  lastByte: number;
  finalChunk: boolean;
  fetchImpl: FetchLike;
}) {
  const expectedLength = params.lastByte - params.firstByte + 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < TIKTOK_RANGE_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    let exactBody: Promise<void> | null = null;
    try {
      const sourceRange = await fetchSourceRange({
        source: params.source,
        firstByte: params.firstByte,
        lastByte: params.lastByte,
        expectedTotalBytes: params.totalBytes,
        fetchImpl: params.fetchImpl,
      });
      const validated = createExactLengthStream(sourceRange.body, expectedLength);
      exactBody = validated.exact;
      const timeout = timeoutSignal(TIKTOK_RANGE_CHUNK_TIMEOUT_MS);
      let response: Response;
      try {
        const init: RequestInit & { duplex: "half" } = {
          method: "PUT",
          headers: {
            "Content-Type": params.contentType,
            "Content-Length": String(expectedLength),
            "Content-Range": `bytes ${params.firstByte}-${params.lastByte}/${params.totalBytes}`,
          },
          body: validated.stream,
          redirect: "error",
          cache: "no-store",
          signal: timeout.signal,
          duplex: "half",
        };
        response = await params.fetchImpl(params.uploadUrl, init);
      } finally {
        timeout.clear();
      }

      if (response.status === 416) {
        await exactBody.catch(() => undefined);
        const uploadedOffset = parseTikTokUploadedOffset(response, {
          totalBytes: params.totalBytes,
          expectedOffset: params.lastByte + 1,
          chunkSize: params.chunkSize,
          totalChunkCount: params.totalChunkCount,
          allowAhead: true,
        });
        await response.body?.cancel().catch(() => undefined);
        return {
          nextOffset: uploadedOffset,
          responseStatus: response.status,
          recoveredFromAlreadyUploadedChunk: true,
        } satisfies TikTokRangeUploadProgress;
      }

      const expectedStatus = params.finalChunk ? 201 : 206;
      if (response.status !== expectedStatus) {
        const responseText = (await response.text().catch(() => "")).slice(0, 1_000);
        throw new TikTokRangeUploadError(
          "tiktok_chunk_upload_failed",
          responseText || `TikTok upload vidéo HTTP ${response.status}.`,
          {
            retryable: isRetryableHttpStatus(response.status),
            status: response.status,
          },
        );
      }

      const uploadedOffset = parseTikTokUploadedOffset(response, {
        totalBytes: params.totalBytes,
        expectedOffset: params.lastByte + 1,
        chunkSize: params.chunkSize,
        totalChunkCount: params.totalChunkCount,
      });
      await response.body?.cancel().catch(() => undefined);
      await exactBody;
      return {
        nextOffset: uploadedOffset,
        responseStatus: response.status,
        recoveredFromAlreadyUploadedChunk: false,
      } satisfies TikTokRangeUploadProgress;
    } catch (error) {
      if (exactBody) await exactBody.catch(() => undefined);
      const normalized =
        error instanceof TikTokRangeUploadError
          ? error
          : new TikTokRangeUploadError(
              "tiktok_chunk_upload_network_error",
              "Le transfert d'un morceau vidéo vers TikTok a échoué.",
              { retryable: true, cause: error },
            );
      lastError = normalized;
      if (!normalized.retryable || attempt + 1 >= TIKTOK_RANGE_UPLOAD_MAX_ATTEMPTS) {
        throw normalized;
      }
      await wait(500 * 2 ** attempt);
    }
  }

  throw lastError || new TikTokRangeUploadError(
    "tiktok_chunk_upload_failed",
    "Le transfert vidéo TikTok a échoué.",
  );
}

export async function uploadTikTokVideoFromRangeSource(params: {
  source: TikTokRangeSource;
  uploadUrl: string;
  contentType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunkCount: number;
  initialOffset?: number;
  fetchImpl?: FetchLike;
  onProgress?: (progress: TikTokRangeUploadProgress) => Promise<void> | void;
}) {
  const totalBytes = assertTikTokRangeVideoSize(params.totalBytes);
  const chunkSize = positiveInteger(params.chunkSize);
  const totalChunkCount = positiveInteger(params.totalChunkCount);
  if (!chunkSize || !totalChunkCount) {
    throw new TikTokRangeUploadError(
      "tiktok_upload_plan_invalid",
      "Le plan de transfert vidéo TikTok est invalide.",
    );
  }
  const uploadUrl = validateHttpsUrl(params.uploadUrl, "upload");
  let nextOffset = validateTikTokCheckpointOffset({
    offset: params.initialOffset || 0,
    totalBytes,
    chunkSize,
    totalChunkCount,
  });
  const responses: TikTokRangeUploadProgress[] = [];

  while (nextOffset < totalBytes) {
    const chunkIndex = Math.floor(nextOffset / chunkSize);
    const finalChunk = chunkIndex === totalChunkCount - 1;
    const lastByte = finalChunk
      ? totalBytes - 1
      : Math.min(totalBytes - 1, nextOffset + chunkSize - 1);
    const progress = await uploadOneChunk({
      source: params.source,
      uploadUrl,
      contentType: normalizeUploadContentType(params.contentType),
      totalBytes,
      chunkSize,
      totalChunkCount,
      firstByte: nextOffset,
      lastByte,
      finalChunk,
      fetchImpl: params.fetchImpl || fetch,
    });
    nextOffset = progress.nextOffset;
    validateTikTokCheckpointOffset({
      offset: nextOffset,
      totalBytes,
      chunkSize,
      totalChunkCount,
    });
    responses.push(progress);
    await params.onProgress?.(progress);
  }

  return { nextOffset, responses };
}
