import assert from "node:assert/strict";
import test from "node:test";
import { buildPinterestImageMediaSource } from "../../lib/pinterestImagePinPayload.ts";

test("Pinterest conserve le format image_url pour une seule image", () => {
  assert.deepEqual(
    buildPinterestImageMediaSource(["https://cdn.example.test/image-1.jpg"]),
    {
      source_type: "image_url",
      url: "https://cdn.example.test/image-1.jpg",
      is_standard: true,
    },
  );
});

test("Pinterest utilise multiple_image_urls de 2 à 5 images", () => {
  const urls = Array.from(
    { length: 5 },
    (_, index) => `https://cdn.example.test/image-${index + 1}.jpg`,
  );

  assert.deepEqual(buildPinterestImageMediaSource(urls), {
    source_type: "multiple_image_urls",
    index: 0,
    items: urls.map((url) => ({ url })),
  });
});

test("Pinterest refuse plus de 5 images", () => {
  const urls = Array.from(
    { length: 6 },
    (_, index) => `https://cdn.example.test/image-${index + 1}.jpg`,
  );

  assert.throws(
    () => buildPinterestImageMediaSource(urls),
    /au maximum 5 images/,
  );
});

test("Pinterest refuse une URL non publique", () => {
  assert.throws(
    () => buildPinterestImageMediaSource(["data:image/jpeg;base64,abc"]),
    /images publiques valides/,
  );
});
