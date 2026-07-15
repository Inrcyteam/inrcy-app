import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mediaSource = await readFile(
  new URL("../../lib/aiMediaUnderstanding.ts", import.meta.url),
  "utf8",
);
const cacheSource = await readFile(
  new URL("../../lib/aiMediaUnderstandingCache.ts", import.meta.url),
  "utf8",
);
const generationSource = await readFile(
  new URL("../../lib/boosterPublishGeneration.ts", import.meta.url),
  "utf8",
);

test("l'analyse visuelle factuelle utilise un cache serveur avant l'appel IA", () => {
  assert.match(mediaSource, /readVisionAnalysisCache\(/);
  assert.match(mediaSource, /if \(cachedAnalysis\.factsContext\)/);
  assert.match(mediaSource, /visionCacheSource: "hit"/);
  assert.match(mediaSource, /void writeVisionAnalysisCache\(/);
});

test("la clé de cache isole le compte et versionne toutes les entrées visuelles", () => {
  assert.match(cacheSource, /hash\.update\(accountId\)/);
  assert.match(cacheSource, /hash\.update\(visionModel\)/);
  assert.match(cacheSource, /hash\.update\(promptVersion\)/);
  assert.match(cacheSource, /hash\.update\(args\.idea\)/);
  assert.match(cacheSource, /hash\.update\(image\.detail\)/);
  assert.match(cacheSource, /hash\.update\(image\.dataUrl\)/);
  assert.match(cacheSource, /CACHE_TTL_SECONDS = 6 \* 60 \* 60/);
});

test("le cache ne stocke que le résumé factuel et reste facultatif", () => {
  assert.doesNotMatch(cacheSource, /redis\.set\([^\n]*dataUrl/);
  assert.match(cacheSource, /factsContext/);
  assert.match(cacheSource, /if \(!args\.cacheKey\) return \{ source: "disabled" \}/);
  assert.match(cacheSource, /Le cache reste une optimisation/);
});

test("la télémétrie indique les hits et misses du cache visuel", () => {
  assert.match(generationSource, /visionCacheSource: preparedMedia\.visionCacheSource/);
});
