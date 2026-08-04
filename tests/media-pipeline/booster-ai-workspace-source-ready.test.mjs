import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "lib/mediaWorkspaceConsumption.ts"),
  "utf8",
);

test("la génération IA accepte une image uploadée sans attendre la publication", () => {
  assert.match(source, /allowUploadedImageSourceForAi\?: boolean/);
  assert.match(source, /item\.mediaType === "image"[\s\S]*allowUploadedImageSourceForAi[\s\S]*return false/);
  assert.match(source, /allowUploadedImageSourceForAi: true/);
});

test("le secours IA lit l'original sans réparer les variantes de publication", () => {
  assert.match(source, /async function sourceImageToProviderSafeDataUrl/);
  assert.match(source, /downloadWorkspaceImageSource\(params\)/);
  assert.match(source, /return await sourceImageToProviderSafeDataUrl/);
  const resolverStart = source.indexOf("async function resolveProviderSafeImageDataUrl");
  const resolverEnd = source.indexOf("export async function resolveWorkspacePublicationConsumption", resolverStart);
  const resolver = source.slice(resolverStart, resolverEnd);
  assert.doesNotMatch(resolver, /repairImageVariantsFromSource\(params\)/);
});

test("la publication conserve son contrôle ready historique", () => {
  assert.match(source, /item\.processingStatus !== "ready"/);
  assert.match(source, /\["ready", "legacy_ready"\]\.includes\(item\.publicationStatus\)/);
});
