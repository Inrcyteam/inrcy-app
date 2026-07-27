import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("iNrSearch locks the mobile viewport height without reacting to browser chrome", () => {
  const source = read("app/entreprises/[slug]/InrSearchExperience.tsx");

  assert.match(source, /--inrsearch-viewport-height/);
  assert.match(source, /root\.dataset\.viewportHeight = "locked"/);
  assert.match(source, /MOBILE_VIEWPORT_WIDTH_DELTA = 24/);
  assert.match(source, /if \(!force && !widthChanged && !orientationChanged\) return/);
  assert.match(source, /window\.addEventListener\("orientationchange", onOrientationChange/);
  assert.match(source, /window\.visualViewport\?\.addEventListener\("resize", onViewportResize/);
  assert.doesNotMatch(
    source,
    /window\.addEventListener\("resize", syncFromScroll/,
    "height-only browser chrome resizes must not resync the orbit directly",
  );
});

test("all iNrSearch dynamic viewport references share the same stable variable", () => {
  const css = read("app/entreprises/[slug]/inrSearchPublic.module.css");
  const directDynamicViewport = css.replaceAll(
    "var(--inrsearch-viewport-height, 100dvh)",
    "",
  );

  assert.doesNotMatch(directDynamicViewport, /100dvh/);
  assert.match(css, /--inrsearch-viewport-height: 100vh/);
  assert.match(css, /@supports \(height: 100svh\)/);
  assert.match(css, /--inrsearch-viewport-height: 100svh/);
  assert.match(
    css,
    /height: calc\(var\(--inrsearch-viewport-height, 100dvh\) - var\(--orbit-header\)\)/,
  );
});
