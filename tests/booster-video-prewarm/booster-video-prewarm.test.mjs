import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL(
  "../../app/dashboard/booster/publier/PublishModal.tsx",
  import.meta.url,
);
const source = await readFile(sourcePath, "utf8");
const videoAiRuntime = await readFile(
  new URL(
    "../../app/dashboard/booster/publier/publishModal.videoAiRuntime.ts",
    import.meta.url,
  ),
  "utf8",
);
const foundations = await readFile(
  new URL(
    "../../app/dashboard/booster/publier/publishModal.foundations.ts",
    import.meta.url,
  ),
  "utf8",
);
const audioClient = await readFile(
  new URL("../../lib/boosterVideoAudioClient.ts", import.meta.url),
  "utf8",
);
const transcribeRoute = await readFile(
  new URL("../../app/api/booster/transcribe/route.ts", import.meta.url),
  "utf8",
);

test("les captures vidéo restent mises en cache mais ne sont plus préparées à l'insertion", () => {
  assert.match(foundations, /type VideoFramesPreparationCache = \{/);
  assert.match(source, /const getOrPrepareVideoFramesForAI = useCallback/);
  assert.match(source, /videoFramesForAiCacheRef\.current = null/);
  const addVideoBlock = source.slice(
    source.indexOf("const addVideoFile"),
    source.indexOf("const onVideoChange"),
  );
  assert.doesNotMatch(addVideoBlock, /getOrPrepareVideoFramesForAI/);
  assert.match(source, /preparePersistentAiMedia\(\)/);
});

test("l'audio local et les captures ne subsistent que dans le fallback de génération", () => {
  assert.match(source, /const getOrPrepareVideoAudioFileForAI = useCallback/);
  const addVideoBlock = source.slice(
    source.indexOf("const addVideoFile"),
    source.indexOf("const onVideoChange"),
  );
  assert.doesNotMatch(addVideoBlock, /getOrPrepareVideoAudioFileForAI/);
  assert.doesNotMatch(addVideoBlock, /getOrPrepareVideoFramesForAI/);
  assert.match(
    source,
    /!mediaPipelineCutoverEnabled[\s\S]*const transcriptionPromise = cachedTranscript[\s\S]*getOrPrepareVideoAudioFileForAI\(videoFile\)[\s\S]*transcribeVideoAudioForAI\(videoFile, preparedAudio\)/,
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
  assert.match(videoAiRuntime, /prepareVideoAudioTransport\(preparedAudio\)/);
  assert.match(videoAiRuntime, /formData\.append\("audio", transport\.file, transport\.file\.name\)/);
  assert.match(videoAiRuntime, /audioStoragePath: transport\.storagePath/);
  assert.match(videoAiRuntime, /formData\.append\("origin", "video"\)/);
  assert.match(
    foundations,
    /const MAX_DIRECT_VIDEO_TRANSCRIBE_BYTES = 4 \* 1024 \* 1024;/,
  );
  assert.match(
    videoAiRuntime,
    /else if \(file\.size <= MAX_DIRECT_VIDEO_TRANSCRIBE_BYTES\)[\s\S]*formData\.append\("video", file/,
  );
  assert.match(transcribeRoute, /const audioFromVideo =/);
  assert.match(transcribeRoute, /source: audioFromVideo \? "video_audio_client" : "audio"/);
});
