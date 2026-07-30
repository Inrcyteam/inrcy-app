import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publishLib = readFileSync(new URL("../../lib/tiktokPublish.ts", import.meta.url), "utf8");
const publishNow = readFileSync(new URL("../../app/api/booster/publish-now/route.ts", import.meta.url), "utf8");
const retryRoute = readFileSync(new URL("../../app/api/inrsend/publications/[publicationId]/tiktok/retry/route.ts", import.meta.url), "utf8");
const statusRoute = readFileSync(new URL("../../app/api/inrsend/publications/[publicationId]/tiktok/status/route.ts", import.meta.url), "utf8");
const detailsModal = readFileSync(new URL("../../app/dashboard/mails/_components/MailboxDetailsModal.tsx", import.meta.url), "utf8");

test("TikTok video publication is FILE_UPLOAD only", () => {
  assert.match(publishNow, /tiktokDirectPostVideoFileUpload/);
  assert.doesNotMatch(publishNow, /\btiktokDirectPostVideo\s*\(/);
  assert.match(publishNow, /tiktok_video_file_upload_required/);
  assert.match(retryRoute, /tiktokDirectPostVideoFileUpload/);
  assert.doesNotMatch(retryRoute, /\btiktokDirectPostVideo\s*\(/);
  assert.match(retryRoute, /tiktok_video_file_upload_required/);
});

test("legacy URL video entry point is a defensive refusal", () => {
  const videoFunction = publishLib.slice(
    publishLib.indexOf("export async function tiktokDirectPostVideo"),
    publishLib.indexOf("export async function tiktokDirectPostVideoFileUpload"),
  );
  assert.match(videoFunction, /FILE_UPLOAD_ONLY/);
  assert.doesNotMatch(videoFunction, /source:\s*"PULL_FROM_URL"/);
});

test("photo publication keeps its supported URL transfer", () => {
  const photoFunction = publishLib.slice(publishLib.indexOf("export async function tiktokDirectPostPhotos"));
  assert.match(photoFunction, /source:\s*"PULL_FROM_URL"/);
  assert.match(photoFunction, /photo_images/);
});

test("status fetch errors are no longer disguised as processing", () => {
  assert.match(publishLib, /status:\s*"STATUS_FETCH_ERROR"/);
  assert.match(publishLib, /statusFetchFailed:\s*true/);
  assert.doesNotMatch(publishLib, /status:\s*"STATUS_FETCH_PENDING"/);
  assert.match(statusRoute, /tiktok_status_fetch_error/);
  assert.match(statusRoute, /tiktok_fail_reason/);
});

test("TikTok status progress and stalled state are persisted", () => {
  assert.match(publishLib, /uploadedBytes/);
  assert.match(publishLib, /publiclyAvailablePostIds/);
  assert.match(statusRoute, /tiktok_status_progress_at/);
  assert.match(statusRoute, /tiktok_stalled/);
  assert.match(statusRoute, /15 \* 60 \* 1000/);
});

test("iNrSend automatically polls pending TikTok publications", () => {
  assert.match(detailsModal, /getTiktokAutoPollTarget/);
  assert.match(detailsModal, /tiktokAutoPollInFlightRef/);
  assert.match(detailsModal, /20_000/);
  assert.match(detailsModal, /60_000/);
  assert.match(detailsModal, /Motif technique TikTok/);
});
