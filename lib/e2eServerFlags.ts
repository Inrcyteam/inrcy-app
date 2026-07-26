import "server-only";

/**
 * Server-only flags used by the dedicated Playwright process.
 * They are never exposed through browser-visible environment variables or browser storage.
 */
export function isRequiredSetupE2EBypassEnabled() {
  return process.env.E2E_BYPASS_REQUIRED_SETUP === "true";
}
