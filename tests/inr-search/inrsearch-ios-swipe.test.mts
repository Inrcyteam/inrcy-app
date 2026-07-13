import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();
const experiencePath = join(root, "app/entreprises/[slug]/InrSearchExperience.tsx");
const stylesPath = join(root, "app/entreprises/[slug]/inrSearchPublic.module.css");

test("iNrSearch mobile keeps native horizontal swipe available on iOS", () => {
  const styles = readFileSync(stylesPath, "utf8");
  const mobileMarker = "Mobile/tablette : un chapitre horizontal";
  const mobileStyles = styles.slice(styles.indexOf(mobileMarker));
  const mobileOrbitMatch = mobileStyles.match(/\.orbitViewport\s*\{([\s\S]*?)\n\s*\}/);
  const mobileOrbitRule = mobileOrbitMatch?.[1] ?? "";

  assert.match(mobileOrbitRule, /overflow-x:\s*auto !important;/);
  assert.match(mobileOrbitRule, /scroll-snap-type:\s*x mandatory !important;/);
  assert.match(mobileOrbitRule, /touch-action:\s*pan-x pan-y !important;/);
  assert.match(mobileOrbitRule, /-webkit-overflow-scrolling:\s*touch;/);
});

test("iNrSearch swipe detection tolerates iPhone diagonal drift", () => {
  const source = readFileSync(experiencePath, "utf8");

  assert.match(source, /lastX:\s*number/);
  assert.match(source, /orbit\.addEventListener\("pointermove", onPointerMove, \{ passive: true \}\)/);
  assert.match(source, /Math\.max\(72,\s*Math\.min\(112,\s*orbit\.clientWidth \* 0\.18\)\)/);
  assert.match(source, /velocity > 0\.45/);
  assert.match(source, /Math\.abs\(deltaX\) < Math\.abs\(deltaY\) \* 1\.18/);
});

test("iNrSearch swipe still ignores nested controls and local carousels", () => {
  const source = readFileSync(experiencePath, "utf8");

  assert.match(source, /data-local-carousel/);
  assert.match(source, /data-inrsearch-gesture-ignore/);
  assert.match(source, /button/);
  assert.match(source, /role='dialog'/);
});
