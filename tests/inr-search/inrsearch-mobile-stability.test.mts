import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("mobile iNrSearch pages always use the lightweight motion mode", () => {
  const source = read("app/entreprises/[slug]/InrSearchVisualIdentity.tsx");

  assert.match(
    source,
    /\(max-width: 900px\), \(hover: none\) and \(pointer: coarse\)/,
  );
  assert.match(source, /root\.dataset\.mobileStability = mobileStability \? "true" : "false"/);
  assert.match(
    source,
    /media\.matches \|\| mobileStability \|\| hardware <= 4 \|\| memory <= 4/,
  );
  assert.match(source, /mobileStabilityMedia\.removeEventListener/);
});

test("pointer parallax is not registered on touch and mobile browsers", () => {
  const source = read("app/entreprises/[slug]/InrSearchExperience.tsx");

  assert.match(source, /event\.pointerType !== "mouse"/);
  assert.match(source, /mobileStabilityQuery\.matches/);
  assert.match(
    source,
    /!reducedMotionQuery\.matches && !mobileStabilityQuery\.matches/,
  );
});

test("the mobile stability layer preserves the layout and freezes only decorative effects", () => {
  const css = read("app/entreprises/[slug]/inrSearchPublic.module.css");
  const marker = "/* iNrSearch — Étape 2 : stabilité graphique mobile sans modification de la composition. */";
  const index = css.indexOf(marker);

  assert.ok(index >= 0, "mobile stability marker must be present");
  const block = css.slice(index);

  assert.match(block, /@media \(max-width: 900px\), \(hover: none\) and \(pointer: coarse\)/);
  assert.match(block, /\.visualIdentityLayer \{[\s\S]*mix-blend-mode: normal/);
  assert.match(block, /\.visualIdentityScanline \{[\s\S]*display: none/);
  assert.match(block, /backdrop-filter: none !important/);
  assert.match(block, /animation: none !important/);
  assert.doesNotMatch(block, /\.orbitControls\s*\{[\s\S]{0,120}display:\s*none/);
  assert.doesNotMatch(block, /\.presentationSatellite\s*\{[\s\S]{0,120}display:\s*none/);
  assert.doesNotMatch(block, /border:\s*none/);
  assert.doesNotMatch(block, /box-shadow:\s*none/);
});
