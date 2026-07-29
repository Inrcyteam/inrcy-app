/*
 * Vérification post-déploiement du pipeline média via le healthcheck interne.
 *
 * APP_BASE_URL=https://app.inrcy.com HEALTHCHECK_TOKEN=... node scripts/smoke-media-pipeline.mjs
 * Ajouter REQUIRE_MEDIA_PIPELINE_CUTOVER=1 pour exiger le palier final.
 */

const base = String(process.env.APP_BASE_URL || "").trim();
const token = String(process.env.HEALTHCHECK_TOKEN || "").trim();
const requireCutover = process.env.REQUIRE_MEDIA_PIPELINE_CUTOVER === "1";

if (!base) {
  console.error("APP_BASE_URL est requis.");
  process.exit(1);
}
if (!token) {
  console.error("HEALTHCHECK_TOKEN est requis.");
  process.exit(1);
}

const url = new URL("/api/health/internal", base).toString();
const response = await fetch(url, {
  method: "GET",
  headers: { "x-health-token": token },
  cache: "no-store",
});
const body = await response.json().catch(() => null);

if (!response.ok || !body?.ok) {
  console.error(`[media-smoke] FAIL ${response.status} ${url}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const media = body?.checks?.media_pipeline;
if (!media || media.ok !== true) {
  console.error("[media-smoke] FAIL : contrôle media_pipeline absent ou KO.");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const stage = String(media?.details?.stage || "unknown");
if (requireCutover && stage !== "full_cutover") {
  console.error(
    `[media-smoke] FAIL : palier full_cutover attendu, palier reçu=${stage}.`,
  );
  process.exit(1);
}

console.log(`[media-smoke] OK ${response.status} ${url}`);
console.log(`stage=${stage}`);
console.log(`full_cutover=${Boolean(media?.details?.full_cutover)}`);
console.log(`warning=${media?.warning || "none"}`);
console.log(`details=${JSON.stringify(media?.details || {})}`);
