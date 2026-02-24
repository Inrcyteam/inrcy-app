/*
 * Minimal env verification for safer deployments.
 *
 * Usage:
 *   node scripts/verify-env.mjs
 *
 * In CI you can set STRICT=1 to make missing vars fail the build.
 */

const strict = process.env.STRICT === "1";

/** @type {string[]} */
const required = [
  // Supabase
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",

  // KV / Upstash (rate limits + quotas)
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",

  // Internal deep health
  "HEALTHCHECK_TOKEN",
];

/** @type {string[]} */
const optionalButRecommended = [
  // Observability
  "SENTRY_AUTH_TOKEN",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",

  // AI
  "OPENAI_API_KEY",
];

function check(list, label) {
  const missing = list.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
  if (missing.length) {
    console.warn(`\n[env] Missing ${label}:`);
    for (const k of missing) console.warn(`  - ${k}`);
  } else {
    console.log(`\n[env] OK: ${label}`);
  }
  return missing;
}

const missingRequired = check(required, "required variables");
check(optionalButRecommended, "optional (recommended) variables");

if (missingRequired.length && strict) {
  console.error("\n[env] STRICT=1 → failing due to missing required variables.");
  process.exit(1);
}

console.log("\n[env] done");
