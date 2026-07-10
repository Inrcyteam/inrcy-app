import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AI_FEATURE_POLICIES,
  getDefaultAllowedAiGatewayTranscriptionModels,
} from "../../lib/aiGatewayPolicy.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

test("raw transcription is routed exclusively through Vercel AI Gateway", () => {
  const client = read("lib/aiGatewayTranscription.ts");
  const config = read("lib/aiGatewayConfig.ts");
  assert.match(config, /v4\/ai\/transcription-model/);
  assert.match(client, /ai-model-id/);
  assert.match(client, /AI_GATEWAY_TRANSCRIBE_MODEL/);
  assert.doesNotMatch(client, /api\.openai\.com|OPENAI_API_KEY|OPENAI_TRANSCRIBE_MODEL/);
});

test("transcription keeps a quality-first model with a Whisper fallback", () => {
  const models = getDefaultAllowedAiGatewayTranscriptionModels();
  assert.ok(models.has("openai/gpt-4o-transcribe"));
  assert.ok(models.has("openai/whisper-1"));
  assert.ok(models.has("openai/gpt-4o-mini-transcribe"));
});

test("raw transcription attempts are attached to the active account economic guard", () => {
  const client = read("lib/aiGatewayTranscription.ts");
  assert.match(client, /reserveAiGatewayAccountAttempt\(args\.accountId\)/);
  assert.match(client, /feature:\s*"booster\.transcribe"/);
  assert.equal(AI_FEATURE_POLICIES["booster.transcribe"].maxRetries, 1);
});

test("video transcription extracts an audio track before Gateway when FFmpeg is available", () => {
  const media = read("lib/transcriptionMedia.ts");
  const route = read("app/api/booster/transcribe/route.ts");
  assert.match(media, /-vn/);
  assert.match(media, /audio\.mp3/);
  assert.match(route, /extractVideoAudioForGateway/);
  assert.match(route, /mediaType = "audio\/mpeg"/);
});

test("obsolete direct OpenAI transcription configuration is absent from active runtime code", () => {
  const active = [
    read("app/api/booster/transcribe/route.ts"),
    read("lib/aiGatewayClient.ts"),
    read("lib/aiGatewayTranscription.ts"),
    read("scripts/verify-env.mjs"),
    read("app/api/admin/settings/route.ts"),
  ].join("\n");

  assert.doesNotMatch(active, /OPENAI_API_KEY|OPENAI_TRANSCRIBE_MODEL|api\.openai\.com/);
});
