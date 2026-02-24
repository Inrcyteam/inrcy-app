/*
 * Smoke check for production/preview after deployment.
 *
 * Usage:
 *   APP_BASE_URL=https://app.inrcy.com HEALTHCHECK_TOKEN=... node scripts/smoke-health.mjs
 */

const base = process.env.APP_BASE_URL;
const token = process.env.HEALTHCHECK_TOKEN;

if (!base) {
  console.error("APP_BASE_URL is required (e.g. https://app.inrcy.com)");
  process.exit(1);
}
if (!token) {
  console.error("HEALTHCHECK_TOKEN is required");
  process.exit(1);
}

const url = new URL("/api/health/internal", base).toString();

const res = await fetch(url, {
  method: "GET",
  headers: {
    "x-health-token": token,
  },
});

const text = await res.text();
if (!res.ok) {
  console.error(`[smoke] FAIL ${res.status} ${url}`);
  console.error(text);
  process.exit(1);
}

console.log(`[smoke] OK ${res.status} ${url}`);
console.log(text);
