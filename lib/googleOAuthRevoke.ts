import "server-only";

import { tryDecryptToken } from "@/lib/oauthCrypto";
import { safeErrorMessage } from "@/lib/tsSafe";
import { log } from "@/lib/observability/logger";

export function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}

export async function revokeGoogleTokensBestEffort(input: {
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  integrationId?: string | null;
  context?: string | null;
} | Array<{
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  integrationId?: string | null;
  context?: string | null;
}>): Promise<void> {
  const items = Array.isArray(input) ? input : [input];
  const tokens = uniqueNonEmpty(items.flatMap((item) => [
    tryDecryptToken(item.accessTokenEnc || null),
    tryDecryptToken(item.refreshTokenEnc || null),
  ]));

  for (const token of tokens) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        cache: "no-store",
      });

      if (!res.ok) {
        log.warn("google_oauth_revoke_non_ok", {
          status: res.status,
          contexts: items.map((item) => item.context || null).filter(Boolean),
          integration_ids: items.map((item) => item.integrationId || null).filter(Boolean),
        });
      }
    } catch (e) {
      log.warn("google_oauth_revoke_failed", {
        error_message: safeErrorMessage(e),
        contexts: items.map((item) => item.context || null).filter(Boolean),
        integration_ids: items.map((item) => item.integrationId || null).filter(Boolean),
      });
    }
  }
}
