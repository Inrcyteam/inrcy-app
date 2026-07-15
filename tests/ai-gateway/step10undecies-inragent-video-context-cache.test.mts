import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const cache = read("lib/inrAgentVideoContextCache.ts");
const route = read("app/api/agent/actions/prepare-publish/route.ts");
const mediaItems = read("app/api/media-library/items/route.ts");
const migration = read("ops/sql/2026-07-15_inragent_video_ai_context_cache.sql");

test("le contexte vidéo iNrAgent est versionné et lié à une empreinte de source", () => {
  assert.match(cache, /buildInrAgentVideoSourceFingerprint/);
  assert.match(cache, /createHash\("sha256"\)/);
  assert.match(cache, /INR_AGENT_VIDEO_AI_PREPARATION_VERSION/);
  assert.match(cache, /row\.ai_source_fingerprint === fingerprint/);
  assert.match(cache, /Number\(row\.ai_preparation_version \|\| 0\)/);
});

test("un cache valide évite une nouvelle extraction et une nouvelle transcription", () => {
  const hitIndex = cache.indexOf('source: "hit"');
  const preparationIndex = cache.lastIndexOf("prepareInrAgentVideoForAi({");
  assert.ok(hitIndex >= 0);
  assert.ok(preparationIndex > hitIndex);
  assert.match(cache, /loadPersistedFrames\(bucket, cachedFramePaths\)/);
  assert.match(cache, /cachedTranscript/);
  assert.match(route, /videoContextCacheSource: videoPreparation\?\.cache\.source/);
});

test("les trois captures et la transcription sont persistées dans la médiathèque", () => {
  assert.match(cache, /ai_status: args\.result\.status/);
  assert.match(cache, /ai_transcript: cleanTranscript\(args\.result\.transcript\)/);
  assert.match(cache, /ai_frame_paths: uploadedPaths/);
  assert.match(cache, /ai_prepared_at: preparedAt/);
  assert.match(cache, /ai_timings: args\.result\.timings/);
  assert.match(cache, /contentType: "image\/jpeg"/);
  assert.match(cache, /cacheControl: "31536000"/);
});

test("une préparation obsolète nettoie ses anciennes captures après remplacement", () => {
  assert.match(cache, /const obsoletePaths = oldFramePaths\.filter/);
  assert.match(cache, /await removeDerivativePaths\(bucket, args\.userId, obsoletePaths\)/);
  assert.match(cache, /\? "refresh" : "miss"/);
});

test("la suppression d'une vidéo supprime aussi ses dérivés IA", () => {
  assert.match(mediaItems, /loadInrAgentVideoDerivativePaths\(\{/);
  assert.match(mediaItems, /paths\.push\(\.\.\.derivatives\.paths\)/);
  assert.match(cache, /users\/\$\{userId\}\/ai\/video\//);
});

test("la migration Lot C ajoute toutes les colonnes persistantes sans casser l'existant", () => {
  for (const column of [
    "ai_status",
    "ai_transcript",
    "ai_frame_paths",
    "ai_prepared_at",
    "ai_preparation_version",
    "ai_source_fingerprint",
    "ai_warnings",
    "ai_timings",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(migration, /pro_media_library_video_ai_status_idx/);
});

test("l'absence temporaire de migration conserve le fallback non bloquant", () => {
  assert.match(cache, /isVideoAiCacheSchemaUnavailable/);
  assert.match(cache, /source: "disabled"/);
  assert.match(cache, /const fresh = await prepareInrAgentVideoForAi/);
});
