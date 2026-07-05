import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOSTER_AUTO_CROP_MAX_LOSS,
  areBoosterImageTransformsEquivalent,
  canUseAutomaticCover,
  getBoosterImageDecision,
  getBoosterImageDisplayPlan,
  getBoosterImageRenderDimensions,
  getBoosterImageSequenceTargetRatio,
} from "../../lib/boosterImageDecision.ts";

test("Instagram keeps supported ratios original", () => {
  assert.equal(
    getBoosterImageDecision({
      channel: "instagram",
      meta: { width: 1600, height: 900 },
    }).mode,
    "original",
  );
});

test("Instagram adapts ratios outside 4:5..1.91", () => {
  const tall = getBoosterImageDecision({
    channel: "instagram",
    meta: { width: 1080, height: 1920 },
  });
  const wide = getBoosterImageDecision({
    channel: "instagram",
    meta: { width: 2400, height: 1000 },
  });

  assert.equal(tall.mode, "adapted");
  assert.equal(tall.targetRatio, 4 / 5);
  assert.equal(wide.mode, "adapted");
  assert.equal(wide.targetRatio, 1.91);
});


test("Instagram 1.91 target never overshoots the hard max after pixel rounding", () => {
  const dimensions = getBoosterImageRenderDimensions({
    baseWidth: 1080,
    baseHeight: 1350,
    targetRatio: 1.91,
  });

  assert.deepEqual(dimensions, { width: 1080, height: 566 });
  assert.ok(dimensions.width / dimensions.height <= 1.91);
});

test("TikTok landscape remains original in the centralized policy", () => {
  assert.equal(
    getBoosterImageDecision({
      channel: "tiktok",
      meta: { width: 1920, height: 1080 },
    }).mode,
    "original",
  );
});

test("Pinterest only adapts images taller than 2:3", () => {
  assert.equal(
    getBoosterImageDecision({
      channel: "pinterest",
      meta: { width: 1080, height: 1920 },
    }).mode,
    "adapted",
  );
  assert.equal(
    getBoosterImageDecision({
      channel: "pinterest",
      meta: { width: 1000, height: 1500 },
    }).mode,
    "original",
  );
});

test("A real transform delta is classified as customized", () => {
  const automaticTransform = {
    fit: "contain" as const,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    blurBackground: false,
    backgroundMode: "color",
    backgroundColor: "#ffffff",
  };
  const currentTransform = { ...automaticTransform, zoom: 1.2 };

  assert.equal(
    getBoosterImageDecision({
      channel: "facebook",
      meta: { width: 1200, height: 800 },
      currentTransform,
      automaticTransform,
    }).mode,
    "customized",
  );
  assert.equal(
    areBoosterImageTransformsEquivalent(
      automaticTransform,
      automaticTransform,
    ),
    true,
  );
});



test("Persisted Adapter provenance stays customized even when the transform equals the automatic reference", () => {
  const automaticTransform = {
    fit: "contain" as const,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    backgroundMode: "color",
    backgroundColor: "#ffffff",
  };
  const decision = getBoosterImageDecision({
    channel: "facebook",
    meta: { width: 1600, height: 900 },
    customized: true,
    automaticTransform,
    currentTransform: { ...automaticTransform },
  });

  assert.equal(decision.mode, "customized");
  assert.equal(decision.label, "Personnalisée");
  assert.equal(decision.reason, "manual_customization");
});

test("The existing 8% automatic-crop safety curtain is preserved", () => {
  assert.equal(BOOSTER_AUTO_CROP_MAX_LOSS, 0.08);
  assert.equal(canUseAutomaticCover(1, 1.05), true);
  assert.equal(canUseAutomaticCover(1, 1.2), false);
});


test("Booster preview preserves the source ratio for Originale", () => {
  const plan = getBoosterImageDisplayPlan({
    channel: "tiktok",
    meta: { width: 1920, height: 1080 },
  });

  assert.equal(plan.decision.label, "Originale");
  assert.equal(plan.previewRatio, 16 / 9);
  assert.equal(plan.automaticFit, "contain");
  assert.equal(plan.preserveSourceComposition, true);
});

test("Booster preview applies the 8% curtain for Adaptée", () => {
  const tall = getBoosterImageDisplayPlan({
    channel: "instagram",
    meta: { width: 1080, height: 1920 },
  });
  const slightlyWide = getBoosterImageDisplayPlan({
    channel: "instagram",
    meta: { width: 2000, height: 1000 },
  });

  assert.equal(tall.decision.label, "Adaptée");
  assert.equal(tall.previewRatio, 4 / 5);
  assert.equal(tall.automaticFit, "contain");
  assert.equal(slightlyWide.decision.label, "Adaptée");
  assert.equal(slightlyWide.previewRatio, 1.91);
  assert.equal(slightlyWide.automaticFit, "cover");
});

test("Booster preview exposes Personnalisée only for a real Adapter delta", () => {
  const automaticTransform = {
    fit: "contain" as const,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    backgroundMode: "color",
    backgroundColor: "#ffffff",
  };
  const plan = getBoosterImageDisplayPlan({
    channel: "linkedin",
    meta: { width: 1600, height: 900 },
    automaticTransform,
    currentTransform: { ...automaticTransform, offsetX: 12 },
  });

  assert.equal(plan.decision.label, "Personnalisée");
  assert.equal(plan.previewRatio, null);
});


test("Instagram carousel uses the first normalized image ratio as shared target", () => {
  const target = getBoosterImageSequenceTargetRatio({
    channel: "instagram",
    metas: [
      { width: 1600, height: 900 },
      { width: 1000, height: 1000 },
      { width: 1080, height: 1350 },
    ],
  });

  assert.ok(target);
  assert.equal(Math.round(Number(target) * 1000) / 1000, 1.778);

  const second = getBoosterImageDecision({
    channel: "instagram",
    meta: { width: 1000, height: 1000 },
    requiredTargetRatio: target,
  });
  assert.equal(second.mode, "adapted");
  assert.equal(second.reason, "sequence_target_ratio");
});

test("Instagram carousel lets a customized first-image canvas drive the sequence", () => {
  const target = getBoosterImageSequenceTargetRatio({
    channel: "instagram",
    metas: [
      { width: 1600, height: 900 },
      { width: 1000, height: 1000 },
    ],
    firstImageCustomizedTargetRatio: 4 / 5,
  });
  assert.equal(target, 4 / 5);
});

test("Instagram carousel normalizes an unsupported first image before sharing its ratio", () => {
  const target = getBoosterImageSequenceTargetRatio({
    channel: "instagram",
    metas: [
      { width: 1080, height: 1920 },
      { width: 1600, height: 900 },
    ],
  });
  assert.equal(target, 4 / 5);
});

test("Manual customization stays stronger than an automatic carousel target", () => {
  const automaticTransform = {
    fit: "contain" as const,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    backgroundMode: "color",
    backgroundColor: "#ffffff",
  };
  const decision = getBoosterImageDecision({
    channel: "instagram",
    meta: { width: 1000, height: 1000 },
    automaticTransform,
    currentTransform: { ...automaticTransform, zoom: 1.15 },
    requiredTargetRatio: 16 / 9,
  });
  assert.equal(decision.mode, "customized");
  assert.equal(decision.reason, "manual_customization");
});
