import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("channel variants use the new original-first cache generation", async () => {
  const [images, videos] = await Promise.all([
    read("lib/boosterImageServerPreparation.ts"),
    read("lib/boosterVideoVariantServer.ts"),
  ]);
  assert.match(images, /CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 3/);
  assert.match(images, /initialDecision\.mode === "original"[\s\S]{0,160}originalReferenceTransform/);
  assert.match(images, /backgroundMode: fit === "contain" \? "blur" : "black"/);
  assert.match(images, /\.blur\(28\)/);
  assert.match(videos, /CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 3/);
  assert.match(videos, /split=2\[bgsrc\]\[fgsrc\]/);
  assert.match(videos, /boxblur=20:2/);
});

test("the site iframe follows each image or video natural ratio", async () => {
  const source = await read("app/embed/actus/_lib/render.ts");
  assert.match(source, /data-natural-media-frame/);
  assert.match(source, /--media-ratio/);
  assert.match(source, /syncNaturalMediaRatio/);
  assert.doesNotMatch(source, /\.mediaCol\{[^}]*aspect-ratio:4\/3/);
  assert.doesNotMatch(source, /\.mediaCol\{aspect-ratio:1\/1/);
});

test("Booster, iNrAgent and iNrSend keep Original as the untouched default", async () => {
  const [publishModal, shared, agent, mailbox, mailboxPhase, optimizer, adapterModal] =
    await Promise.all([
      read("app/dashboard/booster/publier/PublishModal.tsx"),
      read("app/dashboard/booster/publier/publishModal.shared.tsx"),
      read("app/dashboard/agent/AgentClient.tsx"),
      read("app/dashboard/mails/MailboxClient.tsx"),
      read("app/dashboard/mails/_lib/mailboxPhase1.tsx"),
      read("lib/imageOptimizer.ts"),
      read("app/dashboard/_components/channel-image-adapter/modal.tsx"),
    ]);

  assert.match(publishModal, /next\[channel\] = "original"/);
  assert.doesNotMatch(
    publishModal,
    /next\[channel\] = getRecommendedVideoFormatForSource/,
  );
  assert.match(shared, /backgroundMode === "blur" \? undefined/);
  assert.match(shared, /ctx\.filter = "blur\(28px\)/);
  assert.match(agent, /Fond flouté sécurisé/);
  assert.doesNotMatch(agent, /Cadre sobre sécurisé/);
  assert.doesNotMatch(
    mailbox,
    /variant\.signature === signature \|\| variant\.channel === channel/,
  );
  assert.match(
    mailboxPhase,
    /facebook: \{ width: 1200, height: 1200, defaultFit: "contain", defaultBlurBackground: false \}/,
  );
  assert.match(
    mailboxPhase,
    /instagram: \{ width: 1080, height: 1350, defaultFit: "contain", defaultBlurBackground: false \}/,
  );
  assert.match(optimizer, /options\?\.nativeFirst !== false/);
  assert.match(optimizer, /SITE_CARD_NATIVE_MAX_SIDE/);
  assert.match(optimizer, /\.blur\(28\)/);
  assert.match(adapterModal, /<option value="blur"/);
});
