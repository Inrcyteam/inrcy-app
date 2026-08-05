export type OptionalMediaEnrichmentResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error"; error?: unknown };

/**
 * Media decoding is an optional enrichment for AI generation. This helper
 * bounds browser-only work (FileReader, canvas and video decoders) without
 * cancelling the underlying warm-up: a late result can still populate its
 * cache for the next generation, while the current request continues with
 * the professional's phrase and profile.
 */
export async function settleOptionalMediaEnrichment<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<OptionalMediaEnrichmentResult<T>> {
  const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const operationResult = Promise.resolve()
    .then(operation)
    .then(
      (value): OptionalMediaEnrichmentResult<T> => ({ ok: true, value }),
      (error): OptionalMediaEnrichmentResult<T> => ({
        ok: false,
        reason: "error",
        error,
      }),
    );
  const timeoutResult = new Promise<OptionalMediaEnrichmentResult<T>>(
    (resolve) => {
      timeoutId = setTimeout(
        () => resolve({ ok: false, reason: "timeout" }),
        boundedTimeoutMs,
      );
    },
  );

  try {
    return await Promise.race([operationResult, timeoutResult]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

type ScrollTarget = Pick<Element, "scrollIntoView">;

export function scrollIntoViewWhenAvailable(params: {
  getTarget: () => ScrollTarget | null;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  options: ScrollIntoViewOptions;
  maxAttempts?: number;
}): () => void {
  const maxAttempts = Math.max(1, Math.floor(params.maxAttempts ?? 24));
  let attempts = 0;
  let frameHandle: number | null = null;
  let cancelled = false;

  const attemptScroll = () => {
    frameHandle = null;
    if (cancelled) return;

    attempts += 1;
    const target = params.getTarget();
    if (target) {
      target.scrollIntoView(params.options);
      return;
    }

    if (attempts < maxAttempts) {
      frameHandle = params.requestFrame(attemptScroll);
    }
  };

  // Try synchronously first, then retry over bounded animation frames while
  // React mounts the generated-content workspace.
  attemptScroll();

  return () => {
    cancelled = true;
    if (frameHandle !== null) params.cancelFrame(frameHandle);
  };
}
