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

  // Widgets / encrypted credentials
  "INRCY_WIDGETS_SIGNING_SECRET",
  "INRCY_CREDENTIALS_SECRET",

  // SMTP / transactional email
  "TX_SMTP_HOST",
  "TX_SMTP_PORT",
  "TX_SMTP_USER",
  "TX_SMTP_PASS",

  // Stripe
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PRICE_STARTER_ID",
  "STRIPE_PRICE_YEARLY",
  "STRIPE_PRICE_ACCEL_ID",
  "STRIPE_PRICE_ACCEL_YEARLY_ID",
];

/** @type {{ label: string; keys: string[] }[]} */
const requiredGroups = [
  {
    label: "Cron secret",
    keys: ["VERCEL_CRON_SECRET", "CRON_SECRET"],
  },
];

/** @type {string[]} */
const optionalButRecommended = [
  // Admin-only routes / onboarding helpers
  "ADMIN_SECRET",
  "SUPABASE_NEW_USER_WEBHOOK_SECRET",
  "INRCY_NEW_USER_ALERT_EMAIL",
  "INRCY_TRIAL_SIGNUP_SECRET",

  // SMTP identity
  "TX_MAIL_FROM",

  // Legacy / additional Stripe plans
  "STRIPE_PRICE_SPEED_ID",
  "STRIPE_PRICE_FULL_ID",

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

function hasValue(key) {
  return Boolean(process.env[key] && String(process.env[key]).trim() !== "");
}

function check(list, label) {
  const missing = list.filter((key) => !hasValue(key));
  if (missing.length) {
    console.warn(`\n[env] Missing ${label}:`);
    for (const key of missing) console.warn(`  - ${key}`);
  } else {
    console.log(`\n[env] OK: ${label}`);
  }
  return missing;
}

function checkGroups(groups) {
  const missing = [];
  for (const group of groups) {
    if (group.keys.some(hasValue)) continue;
    missing.push(`${group.label} (${group.keys.join(" or ")})`);
  }

  if (missing.length) {
    console.warn("\n[env] Missing required variable groups:");
    for (const group of missing) console.warn(`  - ${group}`);
  } else {
    console.log("\n[env] OK: required variable groups");
  }

  return missing;
}

const missingRequired = check(required, "required variables");
const missingRequiredGroups = checkGroups(requiredGroups);
check(optionalButRecommended, "optional (recommended) variables");

if ((missingRequired.length || missingRequiredGroups.length) && strict) {
  console.error("\n[env] STRICT=1 → failing due to missing required variables.");
  process.exit(1);
}

console.log("\n[env] done");
