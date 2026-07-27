export type PinterestFetch = typeof fetch;

export type PinterestVideoProtocolArgs = {
  apiBaseUrl: string;
  accessToken: string;
  boardId: string;
  title: string;
  description?: string;
  link?: string | null;
  coverImageUrl: string;
  videoBytes: Uint8Array;
  videoContentType: string;
  videoFileName: string;
  fetchImpl?: PinterestFetch;
  wait?: (ms: number) => Promise<void>;
  maxPollAttempts?: number;
};

export type PinterestVideoProtocolResult = {
  pin: Record<string, unknown>;
  mediaId: string;
  mediaStatus: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

function buildPinterestProtocolError(
  response: Response,
  payload: unknown,
  fallback: string,
) {
  const record = asRecord(payload);
  const message =
    asString(record.message) ||
    asString(record.error_description) ||
    asString(record.error) ||
    fallback;
  const error = new Error(message) as Error & {
    status?: number;
    pinterestCode?: string | null;
  };
  error.status = response.status;
  error.pinterestCode =
    asString(record.code) ||
    asString(record.error_code) ||
    asString(record.error_type) ||
    null;
  return error;
}

async function pinterestJsonRequest(
  fetchImpl: PinterestFetch,
  apiBaseUrl: string,
  accessToken: string,
  path: string,
  options: { method: "GET" | "POST"; body?: unknown },
) {
  const cleanBase = String(apiBaseUrl || "").replace(/\/+$/g, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const hasBody = options.body !== undefined && options.method !== "GET";
  const response = await fetchImpl(`${cleanBase}/v5${cleanPath}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw buildPinterestProtocolError(
      response,
      payload,
      `Pinterest a refusé l'action (${response.status}).`,
    );
  }
  return asRecord(payload);
}

function normalizeMediaStatus(payload: Record<string, unknown>) {
  return String(
    payload.status || payload.media_status || payload.state || "",
  )
    .trim()
    .toLowerCase();
}

function getMediaFailureMessage(payload: Record<string, unknown>) {
  const failure = asRecord(payload.failure_reason || payload.error);
  return (
    asString(payload.message) ||
    asString(payload.error_message) ||
    asString(failure.message) ||
    "Pinterest n'a pas pu traiter la vidéo."
  );
}

export async function publishPinterestVideoWithProtocol({
  apiBaseUrl,
  accessToken,
  boardId,
  title,
  description,
  link,
  coverImageUrl,
  videoBytes,
  videoContentType,
  videoFileName,
  fetchImpl = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxPollAttempts = 24,
}: PinterestVideoProtocolArgs): Promise<PinterestVideoProtocolResult> {
  const registration = await pinterestJsonRequest(
    fetchImpl,
    apiBaseUrl,
    accessToken,
    "/media",
    { method: "POST", body: { media_type: "video" } },
  );

  const mediaId = asString(registration.media_id) || asString(registration.id);
  const uploadUrl = asString(registration.upload_url);
  const uploadParameters = asRecord(registration.upload_parameters);

  if (!mediaId || !uploadUrl || !Object.keys(uploadParameters).length) {
    throw new Error(
      "Pinterest n'a pas renvoyé les informations nécessaires à l'upload vidéo.",
    );
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(uploadParameters)) {
    if (value === null || value === undefined) continue;
    form.append(key, String(value));
  }
  const videoBuffer = new ArrayBuffer(videoBytes.byteLength);
  new Uint8Array(videoBuffer).set(videoBytes);

  form.append(
    "file",
    new Blob([videoBuffer], {
      type: videoContentType || "video/mp4",
    }),
    videoFileName || "video-inrcy.mp4",
  );

  const uploadResponse = await fetchImpl(uploadUrl, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (!uploadResponse.ok) {
    const payload = await readResponsePayload(uploadResponse);
    throw buildPinterestProtocolError(
      uploadResponse,
      payload,
      `L'upload vidéo Pinterest a échoué (${uploadResponse.status}).`,
    );
  }

  let mediaStatus = "processing";
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const media = await pinterestJsonRequest(
      fetchImpl,
      apiBaseUrl,
      accessToken,
      `/media/${encodeURIComponent(mediaId)}`,
      { method: "GET" },
    );
    mediaStatus = normalizeMediaStatus(media) || mediaStatus;

    if (["succeeded", "success", "ready", "complete", "completed"].includes(mediaStatus)) {
      break;
    }
    if (["failed", "failure", "error", "rejected"].includes(mediaStatus)) {
      throw new Error(getMediaFailureMessage(media));
    }

    if (attempt === maxPollAttempts - 1) {
      throw new Error(
        "Pinterest traite encore la vidéo. Réessayez la publication dans quelques instants.",
      );
    }

    await wait(Math.min(5000, 1200 + attempt * 250));
  }

  const payload: Record<string, unknown> = {
    board_id: boardId,
    title,
    description: description || "",
    media_source: {
      source_type: "video_id",
      media_id: mediaId,
      cover_image_url: coverImageUrl,
    },
  };
  if (link) payload.link = link;

  const pin = await pinterestJsonRequest(
    fetchImpl,
    apiBaseUrl,
    accessToken,
    "/pins",
    { method: "POST", body: payload },
  );

  return { pin, mediaId, mediaStatus };
}
