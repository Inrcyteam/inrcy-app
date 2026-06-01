import type {
  BoosterVideoTransformRequestVariant,
  BoosterVideoTransformSource,
  BoosterVideoTransformedVariant,
} from "@/lib/boosterVideoTransforms";

export type BoosterVideoTransformResponse = {
  ok: boolean;
  source?: {
    storagePath?: string | null;
    publicUrl?: string | null;
    size?: number;
    duration?: number | null;
  };
  variants?: BoosterVideoTransformedVariant[];
  errors?: Array<{
    key?: string;
    format?: string;
    adaptationMode?: string;
    message: string;
  }>;
  error?: string;
};

export async function requestBoosterVideoTransforms(params: {
  source: BoosterVideoTransformSource;
  variants: BoosterVideoTransformRequestVariant[];
}): Promise<BoosterVideoTransformResponse> {
  const res = await fetch("/api/booster/video-transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: String(json?.error || "Transformation vidéo impossible."),
      errors: Array.isArray(json?.errors) ? json.errors : undefined,
    };
  }

  return json as BoosterVideoTransformResponse;
}


export type BoosterVideoStorageCleanupResponse = {
  ok: boolean;
  removed?: string[];
  kept?: string[];
  error?: string;
};

export async function requestBoosterVideoStorageCleanup(params: {
  payloads?: unknown[];
  paths?: string[];
}): Promise<BoosterVideoStorageCleanupResponse> {
  const payload = {
    payloads: Array.isArray(params.payloads) ? params.payloads.filter(Boolean) : [],
    paths: Array.isArray(params.paths) ? params.paths.filter(Boolean) : [],
  };

  if (!payload.payloads.length && !payload.paths.length) {
    return { ok: true, removed: [], kept: [] };
  }

  const res = await fetch("/api/booster/video-storage-cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: String(json?.error || "Nettoyage vidéo impossible."),
    };
  }

  return json as BoosterVideoStorageCleanupResponse;
}
