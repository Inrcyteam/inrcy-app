import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

async function read(relativePath: string) {
  return await readFile(new URL(relativePath, ROOT), "utf8");
}

test("publication consumption uses a compatible uploaded image without click-time Sharp repair", async () => {
  const source = await read("lib/mediaWorkspaceConsumption.ts");
  const start = source.indexOf(
    "export async function resolveWorkspacePublicationConsumption",
  );
  const end = source.indexOf(
    "export async function resolveWorkspaceAiConsumption",
    start,
  );
  assert.ok(start >= 0 && end > start);
  const publicationPath = source.slice(start, end);

  assert.match(source, /DIRECT_PUBLICATION_IMAGE_MIME_TYPES/);
  assert.match(source, /media\.sourceSizeBytes <= INR_MEDIA_IMAGE_MAX_BYTES/);
  assert.match(source, /positiveMetadataNumber\(metadata\.width\)/);
  assert.match(publicationPath, /allowUploadedImageSourceForPublication:\s*true/);
  assert.match(publicationPath, /canUseDirectWorkspaceImageSource\(item\)/);
  assert.match(publicationPath, /bucket:\s*item\.sourceBucket/);
  assert.match(publicationPath, /storagePath:\s*item\.sourceStoragePath/);
  assert.doesNotMatch(publicationPath, /repairImageVariantsFromSource/);
  assert.doesNotMatch(publicationPath, /assertStoredImageVariantIsValid/);
});

test("publication always consumes the managed canonical video", async () => {
  const source = await read("lib/mediaWorkspaceConsumption.ts");
  const start = source.indexOf(
    "export async function resolveWorkspacePublicationConsumption",
  );
  const end = source.indexOf(
    "export async function resolveWorkspaceAiConsumption",
    start,
  );
  assert.ok(start >= 0 && end > start);
  const publicationPath = source.slice(start, end);

  assert.match(publicationPath, /allowUploadedVideoSource:\s*false/);
  assert.match(publicationPath, /const publicationVariant = canonical/);
  assert.doesNotMatch(publicationPath, /directSourceReady/);
  assert.match(
    publicationPath,
    /bucket:\s*publicationVariant\?\.bucket \|\| item\.sourceBucket/,
  );
  assert.match(
    publicationPath,
    /storagePath:\s*publicationVariant\?\.storagePath \|\| item\.sourceStoragePath/,
  );
});
