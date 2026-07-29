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
}) {
  if (!params.intent.mediaId) return;
  const errorMessage =
    params.error instanceof Error
      ? params.error.message
      : params.error
        ? String(params.error)
        : null;

  await fetch("/api/media-pipeline/upload-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
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
    }),
    keepalive: params.event === "failed" || params.event === "removed",
  }).catch(() => null);
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

function readStoredTusUrl(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: unknown; expiresAt?: unknown };
    const expiresAt = Number(parsed.expiresAt || 0);
    if (!parsed.url || !expiresAt || expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return String(parsed.url);
  } catch {
    return null;
  }
}

function storeTusUrl(key: string, url: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        url,
        // Supabase conserve une URL TUS jusqu'à 24 h. On garde une marge pour
        // éviter de reprendre une URL arrivée à expiration.
        expiresAt: Date.now() + 23 * 60 * 60 * 1_000,
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
  return status === 0 || status === 408 || status === 409 || status === 423 || status === 429 || status >= 500;
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
      "x-signature": intent.token,
      "x-upsert": "true",
    },
    signal,
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    throw new Error(`Reprise de l’envoi impossible (${response.status}).`);
  }
  const offset = Number(response.headers.get("Upload-Offset") || 0);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

async function createTusUploadUrl(
  file: File,
  intent: UniversalMediaUploadIntent,
  signal?: AbortSignal,
) {
  const response = await fetch(intent.resumableEndpoint, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": buildTusMetadata(intent),
      "x-signature": intent.token,
      "x-upsert": "true",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Initialisation de l’envoi résumable impossible (${response.status}).`);
  }
  const location = response.headers.get("Location");
  if (!location) {
    throw new Error("URL de reprise Supabase manquante.");
  }
  return new URL(location, intent.resumableEndpoint).toString();
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
        const error = new Error(`Envoi résumable refusé (${status}).`) as Error & {
          status?: number;
        };
        error.status = status;
        fail(error);
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
  let uploadUrl = readStoredTusUrl(storageKey);
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
    storeTusUrl(storageKey, uploadUrl);
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
            storeTusUrl(storageKey, uploadUrl);
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
    });
  };

  const emitProgress = (progress: UniversalMediaUploadProgress) => {
    options.onProgress?.(progress);
    void persistProgress(progress.percent);
  };

  try {
    await postUniversalUploadEvent({
      intent,
      event: "uploading",
      progress: 0,
      file,
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

    await postUniversalUploadEvent({
      intent,
      event: "uploaded",
      progress: 100,
      file,
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
    await postUniversalUploadEvent({
      intent,
      event: options.signal?.aborted ? "removed" : "failed",
      progress: 0,
      error,
      file,
    });
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
