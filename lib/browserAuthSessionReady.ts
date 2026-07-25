const DEFAULT_ATTEMPTS = 10;
const DEFAULT_DELAY_MS = 150;

function wait(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

export async function waitForServerAuthSession(options?: {
  attempts?: number;
  delayMs?: number;
}) {
  const attempts = Math.max(1, options?.attempts ?? DEFAULT_ATTEMPTS);
  const delayMs = Math.max(0, options?.delayMs ?? DEFAULT_DELAY_MS);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch("/api/auth/session-ready", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (response.ok) return true;
    } catch {
      // A short transient network failure should not immediately fail login.
    }

    if (attempt + 1 < attempts && delayMs > 0) {
      await wait(delayMs);
    }
  }

  return false;
}
