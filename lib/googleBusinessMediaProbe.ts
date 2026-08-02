import {
  GOOGLE_BUSINESS_IMAGE_OFFICIAL_MAX_BYTES,
  GOOGLE_BUSINESS_IMAGE_MIN_BYTES,
  GOOGLE_BUSINESS_VIDEO_OFFICIAL_MAX_BYTES,
} from "./googleBusinessMediaPolicy.ts";

export type GoogleBusinessMediaKind = "image" | "video";

export type GoogleBusinessMediaProbeResult = {
  ok: boolean;
  url: string;
  kind: GoogleBusinessMediaKind;
  status: number | null;
  contentType: string;
  contentLength: number | null;
  reason:
    | "ok"
    | "url_invalid"
    | "http_error"
    | "content_type_invalid"
    | "file_too_small"
    | "file_too_large"
    | "network_error";
};

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function normalizedContentType(value: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    ?.trim();
}

export function parseGoogleBusinessMediaContentLength(response: Response) {
  const contentRange = String(response.headers.get("content-range") || "");
  const rangeMatch = /\/(\d+)\s*$/.exec(contentRange);
  const rangedTotal = Number(rangeMatch?.[1] || 0);
  if (Number.isFinite(rangedTotal) && rangedTotal > 0) return rangedTotal;

  const raw = response.headers.get("content-length");
  const value = Number(raw || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function validateHeaders(params: {
  url: string;
  kind: GoogleBusinessMediaKind;
  response: Response;
}): GoogleBusinessMediaProbeResult {
  const { url, kind, response } = params;
  const contentType = normalizedContentType(response.headers.get("content-type"));
  const contentLength = parseGoogleBusinessMediaContentLength(response);
  const typeOk =
    kind === "image"
      ? contentType === "image/jpeg" || contentType === "image/png"
      : contentType === "video/mp4" || contentType === "application/mp4";

  if (!typeOk) {
    return {
      ok: false,
      url,
      kind,
      status: response.status,
      contentType,
      contentLength,
      reason: "content_type_invalid",
    };
  }

  if (
    kind === "image" &&
    contentLength !== null &&
    contentLength < GOOGLE_BUSINESS_IMAGE_MIN_BYTES
  ) {
    return {
      ok: false,
      url,
      kind,
      status: response.status,
      contentType,
      contentLength,
      reason: "file_too_small",
    };
  }

  const maxBytes =
    kind === "image"
      ? GOOGLE_BUSINESS_IMAGE_OFFICIAL_MAX_BYTES
      : GOOGLE_BUSINESS_VIDEO_OFFICIAL_MAX_BYTES;
  if (contentLength !== null && contentLength > maxBytes) {
    return {
      ok: false,
      url,
      kind,
      status: response.status,
      contentType,
      contentLength,
      reason: "file_too_large",
    };
  }

  return {
    ok: true,
    url,
    kind,
    status: response.status,
    contentType,
    contentLength,
    reason: "ok",
  };
}

async function fetchHeaders(
  url: string,
  kind: GoogleBusinessMediaKind,
  method: "HEAD" | "GET",
): Promise<GoogleBusinessMediaProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        url,
        kind,
        status: response.status,
        contentType: normalizedContentType(response.headers.get("content-type")),
        contentLength: parseGoogleBusinessMediaContentLength(response),
        reason: "http_error",
      };
    }
    const result = validateHeaders({ url, kind, response });
    await response.body?.cancel().catch(() => undefined);
    return result;
  } catch {
    return {
      ok: false,
      url,
      kind,
      status: null,
      contentType: "",
      contentLength: null,
      reason: "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeGoogleBusinessMediaUrl(params: {
  url: string;
  kind: GoogleBusinessMediaKind;
  attempts?: number;
}): Promise<GoogleBusinessMediaProbeResult> {
  const url = String(params.url || "").trim();
  if (!/^https:\/\//i.test(url)) {
    return {
      ok: false,
      url,
      kind: params.kind,
      status: null,
      contentType: "",
      contentLength: null,
      reason: "url_invalid",
    };
  }

  const attempts = Math.max(1, Math.min(3, Math.round(params.attempts || 3)));
  let lastResult: GoogleBusinessMediaProbeResult | null = null;
  for (let index = 0; index < attempts; index += 1) {
    const head = await fetchHeaders(url, params.kind, "HEAD");
    if (head.ok) return head;

    const get = await fetchHeaders(url, params.kind, "GET");
    if (get.ok) return get;
    lastResult = get.reason === "network_error" ? head : get;

    if (index < attempts - 1) {
      await sleep(index === 0 ? 300 : 800);
    }
  }

  return (
    lastResult || {
      ok: false,
      url,
      kind: params.kind,
      status: null,
      contentType: "",
      contentLength: null,
      reason: "network_error",
    }
  );
}

export async function filterGoogleBusinessMediaUrls(params: {
  urls: readonly string[];
  kind: GoogleBusinessMediaKind;
}) {
  const uniqueUrls = Array.from(
    new Set(params.urls.map((url) => String(url || "").trim()).filter(Boolean)),
  );
  const probes = await Promise.all(
    uniqueUrls.map((url) =>
      probeGoogleBusinessMediaUrl({ url, kind: params.kind }),
    ),
  );
  return {
    acceptedUrls: probes.filter((probe) => probe.ok).map((probe) => probe.url),
    rejected: probes.filter((probe) => !probe.ok),
    probes,
  };
}
