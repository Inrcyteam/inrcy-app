import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "lib/mediaWorkspaceConsumption.ts"),
  "utf8",
);

test("la génération IA utilise toujours la vidéo originale", () => {
  const start = source.indexOf("async function resolveWorkspaceAiVideoFamily");
  const end = source.indexOf("export async function syncPublicationWorkspaceContext", start);
  const resolver = source.slice(start, end);

  assert.match(resolver, /const videoReference = \{/);
  assert.match(resolver, /storagePath: item\.sourceStoragePath/);
  assert.doesNotMatch(resolver, /const aiPreview/);
  assert.doesNotMatch(resolver, /workspace_ai_preview_missing/);
  assert.match(resolver, /type: normalizeMime\(videoReference\.mimeType, "video\/mp4"\)/);
});
