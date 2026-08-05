import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const client = read("lib/boosterPublishClient.ts");
const layer = read("app/dashboard/_components/DashboardBoosterModalLayer.tsx");
const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
const footer = read(
  "app/dashboard/booster/publier/components/PublishFooterActions.tsx",
);
const execution = read(
  "app/dashboard/_components/PublishExecutionProgress.tsx",
);
const mediaPanel = read(
  "app/dashboard/booster/publier/components/PublishImagesPanel.tsx",
);
const css = read("app/dashboard/dashboard.module.css");

test("publication progress consumes existing durable snapshots without an extra request", () => {
  assert.match(client, /stage: "request_accepted"/);
  assert.match(client, /stage: "status_update"/);
  assert.match(client, /stage: "completed"/);
  assert.match(client, /stage: "released_to_background"/);
  assert.match(client, /payload: latestPayload/);
  assert.match(modal, /_onPublicationProgress: onPublicationProgress/);
  assert.match(modal, /summary\.entries/);
  assert.match(modal, /entryByChannel/);
  assert.match(modal, /terminalCount/);
  assert.doesNotMatch(modal, /publishPulseTimerRef/);
});

test("the client-only callback is deleted before the server payload is built", () => {
  const deleteIndex = layer.indexOf(
    "delete publishPayload._onPublicationProgress",
  );
  const postIndex = layer.indexOf("postBoosterPublication(", deleteIndex);
  assert.ok(deleteIndex >= 0 && postIndex > deleteIndex);
  assert.match(layer, /onProgress: onPublicationProgress/);
});

test("the execution UI exposes real per-channel states and an indeterminate sweep", () => {
  assert.match(modal, /setPublishChannelProgress/);
  assert.match(modal, /statusLabel: "Finalisation média"/);
  assert.match(modal, /statusLabel: "Envoi en cours"/);
  assert.match(modal, /statusLabel: "Publié"/);
  assert.match(modal, /statusLabel: "Échec"/);
  assert.match(footer, /channels=\{scheduling \? \[\] : publishChannelProgress\}/);
  assert.match(execution, /État de publication par canal/);
  assert.match(execution, /role="progressbar"/);
  assert.match(css, /\.publishProgressFillActive::after/);
  assert.match(css, /@keyframes publishProgressSweep/);
});

test("mixed photo and video allocation is explicit and persists to draft and publish", () => {
  assert.match(mediaPanel, /Répartition actuelle des médias par canal/);
  assert.match(mediaPanel, /mediaAllocation\.images/);
  assert.match(mediaPanel, /mediaAllocation\.video/);
  assert.match(mediaPanel, /choisissez Photos, Vidéo ou Aucun/);
  assert.match(modal, /channelMediaModes,/);
  assert.match(modal, /setChannelMediaModes\(nextChannelMediaModes\)/);
  assert.match(
    modal,
    /mediaModeByChannel: buildChannelRecord\(\s*publishTargetMediaModeByChannel,\s*publishTargetChannels/,
  );
});
