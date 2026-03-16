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
  // Core URLs
  "NEXT_PUBLIC_APP_URL",

  // Supabase
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",

  // KV / Upstash (rate limits + quotas)
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",

  // Internal / ops
  "HEALTHCHECK_TOKEN",
  "VERCEL_CRON_SECRET",
  "ADMIN_SECRET",

  // Widgets
  "INRCY_WIDGETS_SIGNING_SECRET",

  // SMTP / transactional email
  "TX_SMTP_HOST",
  "TX_SMTP_PORT",
  "TX_SMTP_USER",
  "TX_SMTP_PASS",

  // Stripe
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER_ID",
  "STRIPE_PRICE_ACCEL_ID",
];

/** @type {string[]} */
const optionalButRecommended = [
  // Observability
  "SENTRY_AUTH_TOKEN",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",

  // AI
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "HEALTHCHECK_ALERT_TO",

  // Integrations / OAuth
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_GMB_REDIRECT_URI",
  "GOOGLE_STATS_REDIRECT_URI",
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "FACEBOOK_REDIRECT_URI",
  "INSTAGRAM_REDIRECT_URI",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_REDIRECT_URI",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
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
