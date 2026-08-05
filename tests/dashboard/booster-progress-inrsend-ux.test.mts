import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const publishModal = read("app/dashboard/booster/publier/PublishModal.tsx");
const resultModal = read("app/dashboard/_components/PublishExecutionResultModal.tsx");
const layer = read("app/dashboard/_components/DashboardBoosterModalLayer.tsx");
const mailboxClient = read("app/dashboard/mails/MailboxClient.tsx");
const mailboxModal = read("app/dashboard/mails/_components/MailboxDetailsModal.tsx");
const mailboxVideo = read("app/dashboard/mails/_lib/mailboxPublicationVideo.foundations.ts");

test("AI generation advances continuously with fixed milestone phrases", () => {
  assert.match(publishModal, /getGenerationTimelineProgress/);
  assert.match(publishModal, /0, 8_000, 1, 25/);
  assert.match(publishModal, /Préparation des médias pour l’analyse/);
  assert.match(publishModal, /iNrCy analyse votre intention et vos médias/);
  assert.match(publishModal, /Adaptation et vérification des contenus/);
  assert.doesNotMatch(publishModal, /const generationSteps =/);
});

test("publication timeline spans the click-to-balance 30-second window and keeps channel labels", () => {
  assert.match(publishModal, /28_000, 30_000, 94, 99/);
  assert.match(publishModal, /publication sur \$\{label\}/);
  assert.match(publishModal, /publishDispatchStartedRef\.current = true/);
  assert.match(publishModal, /__clientPublishStartedAt: publishStartedAt/);
  assert.match(publishModal, /setPublishProgress\(100\)/);
  assert.match(publishModal, /setPublishProgressLabel\("Bilan prêt\."\)/);
});

test("pending channels are rendered as orange finalization, never as failures", () => {
  assert.match(resultModal, /status === "queued" \|\| status === "processing"/);
  assert.match(resultModal, /return "finalizing"/);
  assert.match(resultModal, /label: "Finalisation"/);
  assert.match(resultModal, /color: "#fbbf24"/);
  assert.doesNotMatch(resultModal, /Envoi accepté, traitement en cours/);
});

test("the iNrSend button performs a single direct navigation", () => {
  const start = layer.indexOf("onOpenInrSend={() =>");
  assert.ok(start >= 0, "the iNrSend callback must exist");
  const openBlock = layer.slice(start, start + 900);
  assert.match(openBlock, /router\.push\("\/dashboard\/mails\?folder=publications"\)/);
  assert.doesNotMatch(openBlock, /closePublishModal\(\)/);
  assert.doesNotMatch(openBlock, /router\.replace/);
});

test("iNrSend action loading is scoped to the publication channel", () => {
  assert.match(mailboxClient, /detailsActionChannelKey/);
  assert.match(mailboxClient, /detailsActionKind/);
  assert.match(mailboxModal, /activeDetailsActionBusy/);
  assert.match(mailboxModal, /detailsActionKind === "delete"/);
  assert.match(mailboxModal, /detailsActionKind === "save"/);
});

test("iNrSend accepts storage download URLs for the actually published video", () => {
  assert.match(mailboxModal, /getVideoAttachmentUrl\(activeVideoDisplayAttachment\)/);
  assert.match(mailboxVideo, /att\?\.downloadUrl/);
  assert.match(mailboxModal, /activeVideoAttachment \|\| activeSourceVideoAttachment/);
});
