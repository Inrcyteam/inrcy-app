type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchWithBrowserDeadline(params: {
  fetchImpl: FetchLike;
  input: RequestInfo | URL;
  init?: RequestInit;
  timeoutMs: number;
  timeoutCode: string;
}): Promise<Response> {
  const timeoutMs = Math.max(1, Math.floor(params.timeoutMs));
  const upstreamSignal = params.init?.signal;
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const abortFromUpstream = () => controller?.abort();

  if (controller && upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, {
        once: true,
      });
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort();
      const error = new Error(params.timeoutCode);
      error.name = "AbortError";
      reject(error);
    }, timeoutMs);
  });

  try {
    const request = params.fetchImpl(params.input, {
      ...(params.init || {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    return await Promise.race([request, deadline]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}
