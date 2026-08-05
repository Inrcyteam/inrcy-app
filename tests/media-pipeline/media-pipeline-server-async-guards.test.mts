import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const generateRoute = read("app/api/booster/generate/route.ts");
const videoWorker = read("lib/mediaVideoNormalizationWorker.ts");

test("le contexte vidéo historique reste un enrichissement borné et optionnel", () => {
  const historicalStart = generateRoute.indexOf(
    'if (mediaType === "video" && !strictMediaCutover)',
  );
  const workspaceStart = generateRoute.indexOf(
    "if (mediaWorkspaceId && useWorkspaceMediaForAI)",
    historicalStart,
  );
  const historicalBlock = generateRoute.slice(historicalStart, workspaceStart);

  assert.ok(historicalStart >= 0);
  assert.ok(workspaceStart > historicalStart);
  assert.match(
    historicalBlock,
    /withinMediaContextBudget\(\s*loadPersistedInrAgentVideoForAi\(/,
  );
  assert.match(historicalBlock, /mediaContextDeadlineAt/);
  assert.match(historicalBlock, /catch \(contextError\)/);
  assert.match(historicalBlock, /persistedVideoContextFallback\s*=/);
  assert.match(
    generateRoute,
    /persistedVideoContextFallback[\s\S]*videoFrameImagesForAI\.length === 0[\s\S]*!videoForAI\?\.audioTranscript[\s\S]*mediaAnalysisFallback = persistedVideoContextFallback/,
  );
  assert.match(
    generateRoute,
    /resolveWorkspaceAiConsumption\([\s\S]*?\),\s*mediaContextDeadlineAt,\s*\)/,
  );
});

test("la sauvegarde du contexte généré utilise la durée de vie serverless after", () => {
  assert.match(
    generateRoute,
    /import \{ after, NextResponse \} from "next\/server"/,
  );
  assert.match(
    generateRoute,
    /if \(mediaWorkspaceId\) \{\s*after\(async \(\) => \{[\s\S]*await withinMediaContextBudget\(\s*syncPublicationWorkspaceContext\(/,
  );
  assert.doesNotMatch(generateRoute, /void syncPublicationWorkspaceContext\(/);
});

test("le téléchargement Storage du worker vidéo libère son lease sur socket bloquée", () => {
  const downloadStart = videoWorker.indexOf(
    "async function downloadSourceToTemp",
  );
  const uploadStart = videoWorker.indexOf(
    "async function uploadVariant",
    downloadStart,
  );
  const downloadBlock = videoWorker.slice(downloadStart, uploadStart);

  assert.ok(downloadStart >= 0);
  assert.ok(uploadStart > downloadStart);
  assert.match(videoWorker, /VIDEO_SOURCE_DOWNLOAD_TIMEOUT_MS = 120_000/);
  assert.match(downloadBlock, /const abortController = new AbortController\(\)/);
  assert.match(
    downloadBlock,
    /setTimeout\([\s\S]*abortController\.abort\(\)[\s\S]*VIDEO_SOURCE_DOWNLOAD_TIMEOUT_MS/,
  );
  assert.match(
    downloadBlock,
    /fetch\(signed\.data\.signedUrl,[\s\S]*signal: abortController\.signal/,
  );
  assert.match(
    downloadBlock,
    /"video_source_download_timeout"[\s\S]*true/,
  );
  assert.match(downloadBlock, /finally \{\s*clearTimeout\(downloadTimeout\)/);
});
