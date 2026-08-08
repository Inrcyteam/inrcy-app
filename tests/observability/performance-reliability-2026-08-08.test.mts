import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(ROOT, relativePath), "utf8");

test("large private media is redirected to Storage instead of buffered in Vercel memory", () => {
  const route = read("app/api/media-library/items/[id]/content/route.ts");

  assert.match(route, /createSafeStorageSignedUrl\(bucket, storagePath, 120\)/);
  assert.match(route, /status: 307/);
  assert.match(route, /Location: signedUrl/);
  assert.doesNotMatch(route, /\.download\(storagePath\)/);
  assert.doesNotMatch(route, /new Response\(download\.data/);
});

test("dashboard language reads are coalesced per account and cached", () => {
  const hook = read("app/dashboard/_hooks/useDashboardLanguage.ts");

  assert.match(hook, /DB_LANGUAGE_CACHE_TTL_MS/);
  assert.match(hook, /dbLanguageRequests = new Map/);
  assert.match(hook, /if \(activeRequest\) return activeRequest/);
  assert.match(hook, /loadSharedDbLanguage\(\)/);
  assert.match(hook, /dbLanguageCache\.set\(accountId/);
});

test("IMAP operations have bounded lifecycle and cannot emit an unhandled error", () => {
  const imap = read("lib/imapClient.ts");
  const scanner = read("lib/mailBounceScanner.ts");

  assert.match(imap, /connectionTimeout,/);
  assert.match(imap, /greetingTimeout,/);
  assert.match(imap, /socketTimeout,/);
  assert.match(imap, /disableAutoIdle: true/);
  assert.match(imap, /client\.on\("error", handleClientError\)/);
  assert.match(imap, /IMAP_OPERATION_TIMEOUT/);
  assert.match(imap, /client\.close\(\)/);
  assert.match(imap, /client\.removeListener\("error", handleClientError\)/);

  assert.match(scanner, /isMailboxAuthenticationFailure/);
  assert.match(scanner, /needs_reconnect_reason: "mailbox_authentication_failed"/);
  assert.match(scanner, /status: "disconnected"/);
});

test("generation reduces second passes without weakening the repair safety net", () => {
  const prompt = read("lib/boosterPrompt.ts");
  const generation = read("lib/boosterPublishGeneration.ts");
  const route = read("app/api/booster/generate/route.ts");

  assert.match(prompt, /CONTRÔLE FINAL SILENCIEUX/);
  assert.match(prompt, /chaque canal demandé est présent/);
  assert.match(generation, /repairChannelsOnce/);
  assert.match(generation, /primaryCompliantChannels/);
  assert.match(generation, /qualityIssueCounts/);
  assert.match(route, /generationPerformance: performance/);
});

test("media optimization exposes download, transform and upload timings", () => {
  const worker = read("lib/mediaLibraryOptimizationWorker.ts");

  assert.match(worker, /\[media-library-optimization\] timing/);
  assert.match(worker, /downloadMs/);
  assert.match(worker, /transformMs/);
  assert.match(worker, /uploadRegisterMs/);
  assert.match(worker, /compressionRatio/);
  assert.match(worker, /totalMs: Date\.now\(\) - startedAt/);
});

test("known recovered states no longer pollute production warnings and errors", () => {
  const pricing = read("lib/aiGatewayClient.ts");
  const youtube = read("lib/stats/buildOverview.ts");
  const transcription = read("lib/aiGatewayTranscription.ts");
  const generateRoute = read("app/api/booster/generate/route.ts");

  assert.doesNotMatch(
    pricing,
    /console\.warn\("\[ai-gateway\] conservative guard pricing active"/,
  );
  assert.doesNotMatch(youtube, /YOUTUBE_STATS_REAL_ERROR/);
  assert.match(youtube, /youtube_credentials_expired/);
  assert.match(transcription, /ai_gateway_transcription_protocol_unsupported/);
  assert.match(transcription, /AI_GATEWAY_PROTOCOL_VERSION = "0\.0\.1"/);
  assert.match(
    transcription,
    /AI_GATEWAY_TRANSCRIPTION_SPECIFICATION_VERSION = "4"/,
  );
  assert.doesNotMatch(transcription, /TRANSCRIPTION_PROTOCOL_COOLDOWN_MS/);
  assert.match(generateRoute, /expectedUnavailable/);
  assert.match(generateRoute, /audio transcription timing/);
});
