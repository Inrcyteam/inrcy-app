import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPinterestCarouselGeometryPlan,
  getPinterestVisualGeometry,
} from "../../lib/pinterestCarouselPolicy.ts";

test("Pinterest conserve les originaux lorsque tous les ratios sont identiques", () => {
  const plan = buildPinterestCarouselGeometryPlan([
    { width: 1080, height: 1350 },
    { width: 800, height: 1000 },
    { width: 1200, height: 1500 },
  ]);

  assert.equal(plan.harmonize, false);
  assert.equal(plan.reason, "already_uniform");
  assert.equal(plan.targetWidth, null);
  assert.equal(plan.targetHeight, null);
});

test("Pinterest choisit le ratio commun qui minimise les modifications du carrousel", () => {
  const plan = buildPinterestCarouselGeometryPlan([
    { width: 1080, height: 1350 },
    { width: 1920, height: 1080 },
    { width: 1000, height: 1000 },
  ]);

  assert.equal(plan.harmonize, true);
  assert.equal(plan.reason, "mixed_ratios");
  assert.equal(plan.targetWidth, 1000);
  assert.equal(plan.targetHeight, 1000);
  assert.equal(plan.targetRatio, 1);
});

test("Pinterest ne descend jamais sous 2:3 et choisit le meilleur ratio global", () => {
  const plan = buildPinterestCarouselGeometryPlan([
    { width: 600, height: 1200 },
    { width: 1200, height: 1200 },
  ]);

  assert.equal(plan.harmonize, true);
  assert.equal(plan.reason, "first_image_too_tall");
  assert.equal(plan.targetWidth, 1000);
  assert.equal(plan.targetHeight, 1000);
  assert.equal(plan.targetRatio, 1);
});

test("Pinterest compare les dimensions visuelles après orientation EXIF", () => {
  assert.deepEqual(
    getPinterestVisualGeometry({ width: 1200, height: 800, orientation: 6 }),
    {
      width: 800,
      height: 1200,
      ratio: 2 / 3,
      ratioKey: "2:3",
    },
  );
});


test("Pinterest privilégie le ratio majoritaire parmi 5 photos", () => {
  const plan = buildPinterestCarouselGeometryPlan([
    { width: 1080, height: 1350 },
    { width: 800, height: 1000 },
    { width: 1200, height: 1500 },
    { width: 1920, height: 1080 },
    { width: 1000, height: 1000 },
  ]);

  assert.equal(plan.harmonize, true);
  assert.equal(plan.targetRatio, 4 / 5);
  assert.equal(plan.targetWidth, 1000);
  assert.equal(plan.targetHeight, 1250);
});

test("Pinterest privilégie le paysage quand 4 photos sur 5 sont en paysage", () => {
  const plan = buildPinterestCarouselGeometryPlan([
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1280, height: 720 },
    { width: 1200, height: 675 },
    { width: 1080, height: 1350 },
  ]);

  assert.equal(plan.targetRatio, 16 / 9);
  assert.equal(plan.targetWidth, 1000);
  assert.equal(plan.targetHeight, 563);
});
