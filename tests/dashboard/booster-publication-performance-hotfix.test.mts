import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getAutomaticVideoSettingsForPublication } from "../../lib/boosterVideoSettings.ts";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const publishClient = read("lib/boosterPublishClient.ts");
const publishModal = read("app/dashboard/booster/publier/PublishModal.tsx");
const resultModal = read("app/dashboard/_components/PublishExecutionResultModal.tsx");
const youtube = read("lib/youtubeShortsPublish.ts");
const layer = read("app/dashboard/_components/DashboardBoosterModalLayer.tsx");

test("queued publication waits up to 30 seconds for a useful balance, then continues in background", () => {
  assert.match(publishClient, /BOOSTER_PUBLISH_RESULT_GRACE_MS = 30_000/);
  assert.match(publishClient, /options\.maxPollingMs \|\| BOOSTER_PUBLISH_RESULT_GRACE_MS/);
  assert.match(publishModal, /estimatedPublishMs = BOOSTER_PUBLISH_RESULT_GRACE_MS/);
  assert.match(publishClient, /releasedToBackground: true/);
  assert.doesNotMatch(publishClient, /8 \* 60_000/);
  assert.match(resultModal, /api\/booster\/publications/);
  assert.match(resultModal, /hasPendingAsyncJob/);
  assert.match(layer, /void Promise\.resolve\(refreshMetrics\(\)\)/);
  assert.doesNotMatch(layer, /finally \{\s*await refreshMetrics\(\)/);
});

test("YouTube respects the selected original instead of forcing 9:16", () => {
  assert.deepEqual(
    getAutomaticVideoSettingsForPublication({
      channel: "youtube_shorts",
      settings: { format: "original", adaptationMode: "safe_frame" },
      durationSeconds: 34,
    }),
    { format: "original", adaptationMode: "safe_frame" },
  );
  assert.doesNotMatch(
    publishModal,
    /current\.youtube_shorts === "9_16"[\s\S]*setVideoAdaptationModeByChannel/,
  );
  assert.match(publishModal, /originalSelectedForEveryChannel/);
  assert.match(publishModal, /source: "original"/);
});

test("YouTube streams the stored source instead of buffering the full video", () => {
  assert.match(youtube, /res\.body as unknown as BodyInit/);
  assert.match(youtube, /uploadRequest\.duplex = "half"/);
  assert.match(youtube, /Content-Length": String\(source\.size\)/);
  assert.doesNotMatch(youtube, /const blob = await fetchVideoBlob/);
});

test("media preparation progress no longer stays fixed at 6, 24 or 25 percent", () => {
  assert.match(publishModal, /uploadPulse = window\.setInterval/);
  assert.match(publishModal, /visualPreparationFloor/);
  assert.match(publishModal, /Analyse des \$\{mediaLabel\}/);
  assert.match(publishModal, /Contrôle des \$\{mediaLabel\}/);
});
