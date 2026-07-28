import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("Booster transmet jusqu'à 5 images à Pinterest", () => {
  const route = read("app/api/booster/publish-now/route.ts");
  assert.match(route, /limit:\s*5/);
  assert.match(route, /imageUrls:\s*pinterestImageUrls/);
  assert.doesNotMatch(route, /Pinterest publie 1 image par épingle/);
});

test("Booster ne bloque plus Pinterest au-delà d'une image", () => {
  const shared = read("app/dashboard/booster/publier/publishModal.shared.tsx");
  assert.match(shared, /épingle multi-images/);
  assert.doesNotMatch(shared, /Sélectionnez une seule image/);
});

test("iNrAgent conserve et remplace les 5 images Pinterest", () => {
  const actions = read("lib/inrsend/publicationChannelActions.ts");
  assert.match(actions, /pinterestImageUrls[\s\S]*?slice\(0, 5\)/);
  assert.match(actions, /imageUrls:\s*params\.imageUrls/);
  assert.doesNotMatch(actions, /pinterest_single_image_required/);
});
