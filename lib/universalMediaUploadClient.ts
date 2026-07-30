import { createClient } from "@/lib/supabaseClient";
import {
  UNIVERSAL_MEDIA_TUS_CHUNK_SIZE_BYTES,
  UNIVERSAL_MEDIA_TUS_RETRY_DELAYS_MS,
  clampUniversalUploadProgress,
  selectUniversalMediaUploadProtocol,
  type UniversalMediaUploadProtocol,
  type UniversalMediaUploadTarget,
  type UniversalUploadMediaType,
} from "@/lib/mediaUploadPolicy";

export type UniversalMediaUploadIntent = {
  ok: true;
  target: UniversalMediaUploadTarget;
  mediaType: UniversalUploadMediaType;
  protocol: UniversalMediaUploadProtocol;
  bucket: string;
  storagePath: string;
  token: string;
  signedUrl?: string | null;
  publicUrl?: string | null;
  contentType: string;
  resumableEndpoint: string;
  mediaId?: string | null;
  clientMediaKey?: string | null;
  reused?: boolean;
  alreadyUploaded?: boolean;
};

export type UniversalMediaUploadProgress = {
  protocol: UniversalMediaUploadProtocol;
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
};

export type UniversalMediaUploadResult = {
  protocol: UniversalMediaUploadProtocol;
  bucket: string;
  storagePath: string;
  publicUrl: string | null;
  contentType: string;
  mediaType: UniversalUploadMediaType;
  mediaId: string | null;
  clientMediaKey: string | null;
  reused: boolean;
};

export type UniversalMediaUploadOptions = {
  target: UniversalMediaUploadTarget;
  requestedPath?: string;
  requestedFolder?: string;
  clientMediaKey?: string;
  workspaceId?: string;
  workspacePosition?: number;
  source?: string;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: UniversalMediaUploadProgress) => void;
  signal?: AbortSignal;
  persistProgress?: boolean;
};

type PreparedIntentOptions = Pick<
  UniversalMediaUploadOptions,
  "onProgress" | "signal" | "persistProgress"
>;

// 3 s garde une progression fluide tout en restant sous le rate limit même
// lorsque 5 images sont envoyées en parallèle à l'étape suivante.
const PROGRESS_PERSIST_INTERVAL_MS = 3_000;

// Versionne le format de reprise locale. La version 2 correspond au transport
// TUS signé Supabase via /upload/resumable/sign. Toute ancienne entrée créée
// avec l'endpoint non signé est volontairement invalidée.
const TUS_RESUME_STORAGE_VERSION = 2;
const TUS_RESUME_STORAGE_TTL_MS = 110 * 60 * 1_000;

function makePermanentTusError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function getSupabasePublicApiKey() {
  const apiKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  ).trim();
  if (!apiKey) {
    throw makePermanentTusError(
      "La configuration publique Supabase nécessaire à l’envoi du média est absente.",
    );
  }
  return apiKey;
}

function makeAbortError() {
  try {
    return new DOMException("Upload annulé.", "AbortError");
  } catch {
    const error = new Error("Upload annulé.");
    error.name = "AbortError";
    return error;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw makeAbortError();
}

export function isUniversalMediaUploadEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1 === "true";
}

export function buildUniversalClientMediaKey(file: File, prefix = "media") {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return [
    prefix,
    file.name || "media",
    file.size || 0,
    file.lastModified || 0,
    randomPart,
  ]
    .join(":")
    .slice(0, 480);
}

async function readJsonResponse(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(json?.error || fallback));
  }
  return json;
}

export async function requestUniversalMediaUploadIntent(
  file: File,
  options: UniversalMediaUploadOptions,
): Promise<UniversalMediaUploadIntent> {
  throwIfAborted(options.signal);
  const clientMediaKey =
    options.clientMediaKey || buildUniversalClientMediaKey(file, options.target);
  const response = await fetch("/api/media-pipeline/upload-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target: options.target,
      clientMediaKey,
      workspaceId: options.workspaceId || null,
      workspacePosition:
        typeof options.workspacePosition === "number"
          ? options.workspacePosition
          : null,
      requestedPath: options.requestedPath || null,
      requestedFolder: options.requestedFolder || null,
      source: options.source || null,
      metadata: options.metadata || {},
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      },
    }),
    signal: options.signal,
    cache: "no-store",
  });
  const json = await readJsonResponse(
    response,
    "Impossible de préparer l’envoi du média.",
  );
  return json as UniversalMediaUploadIntent;
}

async function postUniversalUploadEvent(params: {
  intent: UniversalMediaUploadIntent;
  event: "uploading" | "uploaded" | "failed" | "removed";
  progress?: number;
  error?: unknown;
  file?: File;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
  required?: boolean;
}) {
  if (!params.intent.mediaId) return;
  const errorMessage =
    params.error instanceof Error
      ? params.error.message
      : params.error
        ? String(params.error)
        : null;

  const requestBody = JSON.stringify({
    mediaId: params.intent.mediaId,
    event: params.event,
    progress:
      typeof params.progress === "number"
        ? clampUniversalUploadProgress(params.progress)
        : undefined,
    errorMessage,
    detectedMimeType: params.file?.type || params.intent.contentType,
    sizeBytes: params.file?.size,
    metadata: params.metadata || {},
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      throwIfAborted(params.signal);
      const response = await fetch("/api/media-pipeline/upload-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
        keepalive: params.event === "failed" || params.event === "removed",
        signal: params.signal,
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);
      if (response.ok) return json;

      const failure = new Error(
        String(
          json?.error ||
            `Confirmation de l’envoi refusée (${response.status}).`,
        ),
      ) as Error & { status?: number };
      failure.status = response.status;
      lastError = failure;
      if (
        response.status !== 408 &&
        response.status !== 409 &&
        response.status !== 423 &&
        response.status !== 429 &&
        response.status < 500
      ) {
        break;
      }
    } catch (error) {
      lastError = error;
      if (params.signal?.aborted) break;
    }

    if (attempt < 2) {
      await wait(500 * (attempt + 1), params.signal).catch(() => undefined);
    }
  }

  if (params.required) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Impossible de confirmer l’envoi du média.");
  }
  return null;
}

function isTransientSignedUploadError(error: unknown) {
  const message = String(
    (error as { message?: unknown })?.message || error || "",
  ).toLowerCase();
  const status = Number(
    (error as { status?: unknown; statusCode?: unknown })?.status ||
      (error as { statusCode?: unknown })?.statusCode ||
      0,
  );
  return (
    status === 0 ||
    status === 408 ||
    status === 409 ||
    status === 423 ||
    status === 429 ||
    status >= 500 ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("gateway") ||
    message.includes("temporarily")
  );
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(makeAbortError());
      },
      { once: true },
    );
  });
}

async function uploadWithSignedToken(
  file: File,
  intent: UniversalMediaUploadIntent,
  options: PreparedIntentOptions,
) {
  const supabase = createClient();
  const total = Math.max(1, Number(file.size || 0));
  options.onProgress?.({
    protocol: "signed",
    bytesUploaded: 0,
    bytesTotal: total,
    percent: 0,
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    throwIfAborted(options.signal);
    const { error } = await supabase.storage
      .from(intent.bucket)
      .uploadToSignedUrl(intent.storagePath, intent.token, file, {
        contentType: intent.contentType || file.type || "application/octet-stream",
        cacheControl: "3600",
      });
    if (!error) {
      options.onProgress?.({
        protocol: "signed",
        bytesUploaded: total,
        bytesTotal: total,
        percent: 100,
      });
      return;
    }

    lastError = error;
    if (!isTransientSignedUploadError(error) || attempt === 2) break;
    await wait(500 * (attempt + 1), options.signal);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        String(
          (lastError as { message?: unknown })?.message ||
            "Envoi Supabase impossible.",
        ),
      );
}

function encodeTusMetadataValue(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildTusMetadata(intent: UniversalMediaUploadIntent) {
  const values: Record<string, string> = {
    bucketName: intent.bucket,
    objectName: intent.storagePath,
    contentType: intent.contentType || "application/octet-stream",
    cacheControl: "3600",
    metadata: JSON.stringify({
      inrcy: true,
      mediaId: intent.mediaId || null,
      clientMediaKey: intent.clientMediaKey || null,
    }),
  };
  return Object.entries(values)
    .map(([key, value]) => `${key} ${encodeTusMetadataValue(value)}`)
    .join(",");
}

function tusStorageKey(intent: UniversalMediaUploadIntent, file: File) {
  return `inrcy:tus:${[
    intent.bucket,
    intent.storagePath,
    file.size,
    file.lastModified,
  ].join(":")}`;
}

function readStoredTusUrl(
  key: string,
  intent: UniversalMediaUploadIntent,
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      url?: unknown;
      endpoint?: unknown;
      expiresAt?: unknown;
    };
    const version = Number(parsed.version || 0);
    const endpoint = String(parsed.endpoint || "");
    const uploadUrl = String(parsed.url || "");
    const expiresAt = Number(parsed.expiresAt || 0);

    let sameOrigin = false;
    try {
      sameOrigin =
        new URL(uploadUrl).origin === new URL(intent.resumableEndpoint).origin;
    } catch {
      sameOrigin = false;
    }

    if (
      version !== TUS_RESUME_STORAGE_VERSION ||
      endpoint !== intent.resumableEndpoint ||
      !uploadUrl ||
      !sameOrigin ||
      !expiresAt ||
      expiresAt <= Date.now()
    ) {
      // Les anciennes reprises utilisant /upload/resumable sans /sign sont
      // supprimées ici afin qu'elles ne puissent jamais polluer le nouveau flux.
      window.localStorage.removeItem(key);
      return null;
    }
    return uploadUrl;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

function storeTusUrl(
  key: string,
  url: string,
  intent: UniversalMediaUploadIntent,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: TUS_RESUME_STORAGE_VERSION,
        url,
        endpoint: intent.resumableEndpoint,
        // Le token créé par createSignedUploadUrl est temporaire. Une durée
        // inférieure à 2 h évite toute reprise avec une signature expirée.
        expiresAt: Date.now() + TUS_RESUME_STORAGE_TTL_MS,
      }),
    );
  } catch {
    // Safari privé ou stockage navigateur indisponible : l'upload reste
    // résumable pendant la session réseau courante, sans persistance locale.
  }
}

function clearStoredTusUrl(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

function isTransientTusStatus(status: number) {
  return (
    status === 0 ||
    status === 408 ||
    status === 409 ||
    status === 423 ||
    status === 429 ||
    status >= 500
  );
}

function makeTusHttpError(
  status: number,
  fallback: string,
  responseBody?: string | null,
) {
  let detail = String(responseBody || "").trim();
  if (detail) {
    try {
      const parsed = JSON.parse(detail) as {
        error?: unknown;
        message?: unknown;
        msg?: unknown;
      };
      detail = String(parsed.message || parsed.error || parsed.msg || detail).trim();
    } catch {
      detail = detail.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  const message = detail
    ? `${fallback} (${status}) : ${detail}`
    : `${fallback} (${status}).`;
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

async function readTusResponseError(response: Response, fallback: string) {
  const body = await response.text().catch(() => "");
  if (response.status === 413) {
    return makePermanentTusError(
      "La plateforme de stockage n'est pas encore configurée pour ce poids de fichier (limite requise : 320 Mo).",
      413,
    );
  }
  return makeTusHttpError(response.status, fallback, body);
}

function assertSignedTusEndpoint(endpoint: string) {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw makePermanentTusError(
      "Endpoint d’envoi résumable Supabase invalide.",
    );
  }
  if (!parsed.pathname.endsWith("/storage/v1/upload/resumable/sign")) {
    throw makePermanentTusError(
      "L’envoi résumable signé Supabase est mal configuré. Rechargez l’application puis réessayez.",
    );
  }
}

async function readTusOffset(
  uploadUrl: string,
  intent: UniversalMediaUploadIntent,
  signal?: AbortSignal,
): Promise<number | null> {
  const response = await fetch(uploadUrl, {
    method: "HEAD",
    headers: {
      "Tus-Resumable": "1.0.0",
      apikey: getSupabasePublicApiKey(),
      "x-signature": intent.token,
      "x-upsert": "true",
    },
    signal,
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    throw await readTusResponseError(
      response,
      "Reprise de l’envoi impossible",
    );
  }
  const offset = Number(response.headers.get("Upload-Offset") || 0);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

async function createTusUploadUrlOnce(
  file: File,
  intent: UniversalMediaUploadIntent,
  signal?: AbortSignal,
) {
  assertSignedTusEndpoint(intent.resumableEndpoint);
  const response = await fetch(intent.resumableEndpoint, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": buildTusMetadata(intent),
      apikey: getSupabasePublicApiKey(),
      "x-signature": intent.token,
      "x-upsert": "true",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw await readTusResponseError(
      response,
      "Initialisation de l’envoi résumable impossible",
    );
  }
  const location = response.headers.get("Location");
  if (!location) {
    throw makePermanentTusError(
      "URL de reprise Supabase manquante.",
      422,
    );
  }
  return new URL(location, intent.resumableEndpoint).toString();
}

async function createTusUploadUrl(
  file: File,
  intent: UniversalMediaUploadIntent,
  signal?: AbortSignal,
) {
  let lastError: unknown = null;
  for (
    let attempt = 0;
    attempt < UNIVERSAL_MEDIA_TUS_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    throwIfAborted(signal);
    const delay = UNIVERSAL_MEDIA_TUS_RETRY_DELAYS_MS[attempt];
    if (delay > 0) await wait(delay, signal);
    try {
      return await createTusUploadUrlOnce(file, intent, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw makeAbortError();
      const status = Number((error as { status?: unknown })?.status || 0);
      // Les erreurs de signature, de clé publique ou de métadonnées sont
      // définitives : elles remontent immédiatement au lieu d'attendre les retries.
      if (!isTransientTusStatus(status)) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Initialisation de l’envoi résumable interrompue.");
}

function patchTusChunk(params: {
  uploadUrl: string;
  chunk: Blob;
  offset: number;
  totalBytes: number;
  intent: UniversalMediaUploadIntent;
  signal?: AbortSignal;
  onProgress?: (uploadedBytes: number) => void;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => {
      params.signal?.removeEventListener("abort", abort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const abort = () => {
      xhr.abort();
      fail(makeAbortError());
    };

    xhr.open("PATCH", params.uploadUrl, true);
    xhr.setRequestHeader("Tus-Resumable", "1.0.0");
    xhr.setRequestHeader("Upload-Offset", String(params.offset));
    xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
    xhr.setRequestHeader("apikey", getSupabasePublicApiKey());
    xhr.setRequestHeader("x-signature", params.intent.token);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (event) => {
      const loaded = Math.min(params.chunk.size, Number(event.loaded || 0));
      params.onProgress?.(
        Math.min(params.totalBytes, params.offset + loaded),
      );
    };
    xhr.onerror = () => {
      const error = new Error("Coupure réseau pendant l’envoi résumable.") as Error & {
        status?: number;
      };
      error.status = xhr.status || 0;
      fail(error);
    };
    xhr.onabort = () => fail(makeAbortError());
    xhr.onload = () => {
      if (settled) return;
      const status = xhr.status;
      if (status < 200 || status >= 300) {
        fail(
          makeTusHttpError(
            status,
            "Envoi résumable refusé",
            xhr.responseText,
          ),
        );
        return;
      }
      const nextOffset = Number(xhr.getResponseHeader("Upload-Offset"));
      const fallbackOffset = params.offset + params.chunk.size;
      settled = true;
      cleanup();
      resolve(
        Number.isFinite(nextOffset) && nextOffset >= fallbackOffset
          ? nextOffset
          : fallbackOffset,
      );
    };

    params.signal?.addEventListener("abort", abort, { once: true });
    if (params.signal?.aborted) {
      abort();
      return;
    }
    xhr.send(params.chunk);
  });
}

async function uploadWithTus(
  file: File,
  intent: UniversalMediaUploadIntent,
  options: PreparedIntentOptions,
) {
  if (typeof window === "undefined" || typeof XMLHttpRequest === "undefined") {
    return await uploadWithSignedToken(file, intent, options);
  }

  const storageKey = tusStorageKey(intent, file);
  let uploadUrl = readStoredTusUrl(storageKey, intent);
  let offset = 0;

  if (uploadUrl) {
    try {
      const existingOffset = await readTusOffset(uploadUrl, intent, options.signal);
      if (existingOffset === null) {
        clearStoredTusUrl(storageKey);
        uploadUrl = null;
      } else {
        offset = Math.min(file.size, existingOffset);
      }
    } catch {
      clearStoredTusUrl(storageKey);
      uploadUrl = null;
      offset = 0;
    }
  }

  if (!uploadUrl) {
    uploadUrl = await createTusUploadUrl(file, intent, options.signal);
    storeTusUrl(storageKey, uploadUrl, intent);
  }

  const report = (bytesUploaded: number) => {
    const total = Math.max(1, file.size);
    options.onProgress?.({
      protocol: "tus",
      bytesUploaded,
      bytesTotal: total,
      percent: clampUniversalUploadProgress((bytesUploaded / total) * 100),
    });
  };
  report(offset);

  while (offset < file.size) {
    throwIfAborted(options.signal);
    let completed = false;
    let lastError: unknown = null;

    for (
      let attempt = 0;
      attempt < UNIVERSAL_MEDIA_TUS_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      throwIfAborted(options.signal);
      const delay = UNIVERSAL_MEDIA_TUS_RETRY_DELAYS_MS[attempt];
      if (delay > 0) await wait(delay, options.signal);
      try {
        // Recalculer le chunk à chaque tentative est indispensable : après une
        // coupure, le HEAD peut signaler qu'une partie du chunk précédent a
        // déjà été acceptée. On repart alors exactement de l'offset serveur,
        // sans renvoyer ni sauter le moindre octet.
        const chunkStart = offset;
        const chunkEnd = Math.min(
          file.size,
          chunkStart + UNIVERSAL_MEDIA_TUS_CHUNK_SIZE_BYTES,
        );
        const chunk = file.slice(chunkStart, chunkEnd);
        offset = await patchTusChunk({
          uploadUrl,
          chunk,
          offset: chunkStart,
          totalBytes: file.size,
          intent,
          signal: options.signal,
          onProgress: report,
        });
        report(offset);
        completed = true;
        break;
      } catch (error) {
        lastError = error;
        if (options.signal?.aborted) throw makeAbortError();
        const status = Number((error as { status?: unknown })?.status || 0);
        if (!isTransientTusStatus(status)) throw error;

        // Après une coupure, le serveur peut avoir reçu tout ou partie du chunk.
        // HEAD donne l'offset réel avant la tentative suivante et évite de
        // renvoyer des octets déjà acceptés.
        try {
          const serverOffset = await readTusOffset(
            uploadUrl,
            intent,
            options.signal,
          );
          if (serverOffset === null) {
            clearStoredTusUrl(storageKey);
            uploadUrl = await createTusUploadUrl(file, intent, options.signal);
            storeTusUrl(storageKey, uploadUrl, intent);
            offset = 0;
          } else {
            offset = Math.min(file.size, serverOffset);
            if (offset >= file.size) {
              report(offset);
              completed = true;
              break;
            }
          }
        } catch {
          // La boucle de retry gère la prochaine tentative.
        }
      }
    }

    if (!completed) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Envoi résumable interrompu après plusieurs tentatives.");
    }
  }

  clearStoredTusUrl(storageKey);
  report(file.size);
}

export async function uploadFileToPreparedUniversalIntent(
  file: File,
  intent: UniversalMediaUploadIntent,
  options: PreparedIntentOptions = {},
): Promise<UniversalMediaUploadResult> {
  throwIfAborted(options.signal);

  if (intent.alreadyUploaded) {
    options.onProgress?.({
      protocol: intent.protocol,
      bytesUploaded: file.size,
      bytesTotal: file.size,
      percent: 100,
    });
    return {
      protocol: intent.protocol,
      bucket: intent.bucket,
      storagePath: intent.storagePath,
      publicUrl: intent.publicUrl || null,
      contentType: intent.contentType,
      mediaType: intent.mediaType,
      mediaId: intent.mediaId || null,
      clientMediaKey: intent.clientMediaKey || null,
      reused: true,
    };
  }

  let lastPersistAt = 0;
  let lastPersistedProgress = -1;
  const persistProgress = async (percent: number) => {
    if (!options.persistProgress || !intent.mediaId) return;
    const now = Date.now();
    const normalized = clampUniversalUploadProgress(percent);
    if (
      normalized !== 100 &&
      normalized - lastPersistedProgress < 5 &&
      now - lastPersistAt < PROGRESS_PERSIST_INTERVAL_MS
    ) {
      return;
    }
    lastPersistAt = now;
    lastPersistedProgress = normalized;
    await postUniversalUploadEvent({
      intent,
      event: normalized >= 100 ? "uploaded" : "uploading",
      progress: normalized,
      file,
      signal: options.signal,
    });
  };

  const emitProgress = (progress: UniversalMediaUploadProgress) => {
    options.onProgress?.(progress);
    void persistProgress(progress.percent);
  };

  let storageUploadCompleted = false;
  try {
    await postUniversalUploadEvent({
      intent,
      event: "uploading",
      progress: 0,
      file,
      signal: options.signal,
    });
    const protocol =
      intent.protocol || selectUniversalMediaUploadProtocol(file.size);
    if (protocol === "tus") {
      await uploadWithTus(file, intent, {
        ...options,
        onProgress: emitProgress,
      });
    } else {
      await uploadWithSignedToken(file, intent, {
        ...options,
        onProgress: emitProgress,
      });
    }
    storageUploadCompleted = true;

    await postUniversalUploadEvent({
      intent,
      event: "uploaded",
      progress: 100,
      file,
      signal: options.signal,
      required: true,
    });

    return {
      protocol,
      bucket: intent.bucket,
      storagePath: intent.storagePath,
      publicUrl: intent.publicUrl || null,
      contentType: intent.contentType,
      mediaType: intent.mediaType,
      mediaId: intent.mediaId || null,
      clientMediaKey: intent.clientMediaKey || null,
      reused: Boolean(intent.reused),
    };
  } catch (error) {
    if (!storageUploadCompleted || options.signal?.aborted) {
      await postUniversalUploadEvent({
        intent,
        event: options.signal?.aborted ? "removed" : "failed",
        progress: 0,
        error,
        file,
      });
    }
    throw error;
  }
}

export async function uploadUniversalMediaFile(
  file: File,
  options: UniversalMediaUploadOptions,
): Promise<UniversalMediaUploadResult> {
  const intent = await requestUniversalMediaUploadIntent(file, options);
  return await uploadFileToPreparedUniversalIntent(file, intent, options);
}
