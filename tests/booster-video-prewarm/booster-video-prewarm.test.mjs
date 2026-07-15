import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL(
  "../../app/dashboard/booster/publier/PublishModal.tsx",
  import.meta.url,
);
const source = await readFile(sourcePath, "utf8");

test("les captures vidéo sont préchauffées et mises en cache par fichier", () => {
  assert.match(source, /type VideoFramesPreparationCache = \{/);
  assert.match(source, /const getOrPrepareVideoFramesForAI = useCallback/);
  assert.match(source, /void getOrPrepareVideoFramesForAI\(normalizedFile\)/);
  assert.match(source, /void getOrPrepareVideoFramesForAI\(videoFile\)/);
  assert.match(source, /videoFramesForAiCacheRef\.current = null/);
});

test("la transcription et les captures sont attendues en parallèle", () => {
  assert.match(
    source,
    /Promise\.allSettled\(\[\s*[\s\S]*transcribeVideoAudioForAI\(videoFile\)[\s\S]*getOrPrepareVideoFramesForAI\(videoFile\)[\s\S]*\]\)/,
  );
});

test("une vidéo supérieure à 40 Mo n'est pas téléversée pour transcription", () => {
  assert.match(
    source,
    /const MAX_VIDEO_TRANSCRIBE_BYTES = 40 \* 1024 \* 1024;/,
  );
  assert.match(
    source,
    /if \(file\.size > MAX_VIDEO_TRANSCRIBE_BYTES\) return null;[\s\S]*const formData = new FormData\(\);/,
  );
});
