import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BOOSTER_ORIGINAL_ALPHA_PRESERVING_CHANNELS,
  getBoosterOriginalPublicationExtension,
  shouldPreserveBoosterOriginalAlpha,
} from "../../lib/boosterImageOutputPolicy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("les trois surfaces iNrCy conservent les originaux transparents", () => {
  assert.deepEqual(BOOSTER_ORIGINAL_ALPHA_PRESERVING_CHANNELS, [
    "inrcy_site",
    "site_web",
    "inr_search",
  ]);
  for (const channel of BOOSTER_ORIGINAL_ALPHA_PRESERVING_CHANNELS) {
    assert.equal(
      getBoosterOriginalPublicationExtension({
        channel,
        sourceMime: "image/png",
      }),
      "png",
    );
    assert.equal(
      shouldPreserveBoosterOriginalAlpha({
        channel,
        sourceMime: "image/webp",
      }),
      true,
    );
  }
});

test("les canaux sociaux opaques restent en JPEG léger", () => {
  for (const channel of ["gmb", "facebook", "instagram", "linkedin"] as const) {
    assert.equal(
      getBoosterOriginalPublicationExtension({
        channel,
        sourceMime: "image/png",
      }),
      "jpg",
    );
  }
});

test("le cache image est invalidé et le rendu original choisit PNG ou JPEG", () => {
  const source = read("lib/boosterImageServerPreparation.ts");
  assert.match(source, /CHANNEL_IMAGE_VARIANT_PIPELINE_VERSION = 7/);
  assert.match(source, /shouldPreserveBoosterOriginalAlpha/);
  assert.match(source, /\.png\(\{ compressionLevel: 9/);
  assert.match(source, /\.flatten\(\{ background: "#ffffff" \}\)/);
  assert.match(source, /originalOutputPolicy/);
});

test("Facebook envoie au plus deux images simultanément et garde l'ordre", () => {
  const source = read("lib/facebookPublish.ts");
  assert.match(source, /FACEBOOK_IMAGE_UPLOAD_CONCURRENCY = 2/);
  assert.match(source, /mapWithConcurrency/);
  assert.match(source, /new Array<R>\(values\.length\)/);
  assert.match(source, /results\[index\] = await mapper/);
});

test("Facebook et LinkedIn publient le texte si leur média échoue", () => {
  const immediate = read("app/api/booster/publish-now/route.ts");
  const inrSend = read("lib/inrsend/publicationChannelActions.ts");
  for (const source of [immediate, inrSend]) {
    assert.match(source, /published_without_video/);
    assert.match(source, /published_without_image/);
    assert.match(source, /published_with_partial_images/);
    assert.match(source, /fallbackResp/);
  }
});

test("aucun fond flouté n'est réintroduit", () => {
  const source = read("lib/boosterImageServerPreparation.ts");
  assert.match(source, /blurBackground: false/);
  assert.doesNotMatch(source, /\.blur\(/);
});
