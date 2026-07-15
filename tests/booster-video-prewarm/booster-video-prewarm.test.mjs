import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL(
  "../../app/dashboard/booster/publier/PublishModal.tsx",
  import.meta.url,
);
const source = await readFile(sourcePath, "utf8");
const audioClient = await readFile(
  new URL("../../lib/boosterVideoAudioClient.ts", import.meta.url),
  "utf8",
);
const transcribeRoute = await readFile(
  new URL("../../app/api/booster/transcribe/route.ts", import.meta.url),
  "utf8",
);

test("les captures vidéo sont préchauffées et mises en cache par fichier", () => {
  assert.match(source, /type VideoFramesPreparationCache = \{/);
  assert.match(source, /const getOrPrepareVideoFramesForAI = useCallback/);
  assert.match(source, /void getOrPrepareVideoFramesForAI\(normalizedFile\)/);
  assert.match(source, /void getOrPrepareVideoFramesForAI\(videoFile\)/);
  assert.match(source, /videoFramesForAiCacheRef\.current = null/);
});

test("l'audio local et les captures sont préparés avant puis attendus en parallèle", () => {
  assert.match(source, /const getOrPrepareVideoAudioFileForAI = useCallback/);
  assert.match(source, /void getOrPrepareVideoAudioFileForAI\(normalizedFile\)/);
  assert.match(source, /void getOrPrepareVideoAudioFileForAI\(videoFile\)/);
  assert.match(
    source,
    /const transcriptionPromise = cachedTranscript[\s\S]*getOrPrepareVideoAudioFileForAI\(videoFile\)[\s\S]*transcribeVideoAudioForAI\(videoFile, preparedAudio\)/,
  );
  assert.match(
    source,
    /Promise\.allSettled\(\[\s*transcriptionPromise,\s*getOrPrepareVideoFramesForAI\(videoFile\),?\s*\]\)/,
  );
});

test("la transcription vidéo envoie l'audio seul et évite le 413 des grosses vidéos", () => {
  assert.match(audioClient, /new OfflineAudioContext\(/);
  assert.match(audioClient, /targetSampleRate \|\| DEFAULT_TARGET_SAMPLE_RATE/);
  assert.match(audioClient, /type: "audio\/wav"/);
  assert.match(source, /prepareVideoAudioTransport\(preparedAudio\)/);
  assert.match(source, /formData\.append\("audio", transport\.file, transport\.file\.name\)/);
  assert.match(source, /audioStoragePath: transport\.storagePath/);
  assert.match(source, /formData\.append\("origin", "video"\)/);
  assert.match(
    source,
    /const MAX_DIRECT_VIDEO_TRANSCRIBE_BYTES = 4 \* 1024 \* 1024;/,
  );
  assert.match(
    source,
    /else if \(file\.size <= MAX_DIRECT_VIDEO_TRANSCRIBE_BYTES\)[\s\S]*formData\.append\("video", file/,
  );
  assert.match(transcribeRoute, /const audioFromVideo =/);
  assert.match(transcribeRoute, /source: audioFromVideo \? "video_audio_client" : "audio"/);
});
