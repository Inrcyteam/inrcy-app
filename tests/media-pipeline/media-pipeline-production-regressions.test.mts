import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { normalizeImageSource } from "../../lib/mediaImageNormalizer.ts";

const ROOT = process.cwd();

async function readSource(relativePath: string) {
  return await readFile(path.resolve(ROOT, relativePath), "utf8");
}

function containsJpegMarker(buffer: Buffer, marker: number) {
  for (let index = 0; index < buffer.byteLength - 1; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === marker) return true;
  }
  return false;
}

test("l'aperçu IA normalisé est un JPEG baseline sRGB complet et signé", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "inrcy-provider-safe-"));
  const inputPath = path.join(directory, "source.png");

  try {
    const input = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: { r: 30, g: 120, b: 220, alpha: 0.72 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(inputPath, input);

    const normalized = await normalizeImageSource({
      inputPath,
      mimeType: "image/png",
      originalFileName: "source.png",
    });
    const preview = normalized.variants.ai_preview;
    const metadata = await sharp(preview.buffer).metadata();
    const digest = createHash("sha256").update(preview.buffer).digest("hex");

    assert.equal(preview.mimeType, "image/jpeg");
    assert.equal(preview.extension, "jpg");
    assert.equal(preview.buffer[0], 0xff);
    assert.equal(preview.buffer[1], 0xd8);
    assert.equal(preview.buffer.at(-2), 0xff);
    assert.equal(preview.buffer.at(-1), 0xd9);
    assert.equal(containsJpegMarker(preview.buffer, 0xc0), true);
    assert.equal(containsJpegMarker(preview.buffer, 0xc2), false);
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.space, "srgb");
    assert.equal(metadata.channels, 3);
    assert.equal(preview.transformSpec.progressive, false);
    assert.equal(preview.transformSpec.ai_provider_safe_version, 1);
    assert.equal(preview.metadata.ai_provider_safe_version, 1);
    assert.equal(preview.metadata.output_sha256, digest);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("la consommation IA répare les anciennes variantes et charge les cinq images en parallèle", async () => {
  const source = await readSource("lib/mediaWorkspaceConsumption.ts");

  assert.match(source, /async function imageVariantToProviderSafeDataUrl/);
  assert.match(source, /expectedSha256 === sha256\(buffer\)/);
  assert.match(source, /\.toColourspace\("srgb"\)/);
  assert.match(source, /progressive:\s*false/);
  assert.match(
    source,
    /const candidates = \["ai_preview", "canonical", "thumbnail"\]/,
  );
  assert.match(source, /AI_PROVIDER_SAFE_CONCURRENCY\s*=\s*3/);
  assert.match(
    source,
    /mapWithConcurrency\(\s*selectedMedia,\s*AI_PROVIDER_SAFE_CONCURRENCY/,
  );
  assert.match(source, /type:\s*"image\/jpeg"/);
});

test("les aperçus locaux restent affichés pendant la préparation serveur", async () => {
  const source = await readSource(
    "app/dashboard/booster/publier/PublishModal.tsx",
  );
  const videoAiRuntime = await readSource(
    "app/dashboard/booster/publier/publishModal.videoAiRuntime.ts",
  );

  assert.match(videoAiRuntime, /export function preloadPreparedImagePreview/);
  assert.match(source, /preloadPreparedImagePreview\(previewUrl\)/);
  assert.match(source, /const imagesRef = useRef<File\[\]>\(\[\]\)/);
  assert.match(
    source,
    /if \(previous\?\.startsWith\("blob:"\) \|\| previous === previewUrl\)/,
  );
  assert.match(source, /makeImageKey\(currentFile\) !== expectedImageKey/);
});

test("les vidéos MP4 directes préchauffent les variantes et gardent une récupération au clic", async () => {
  const hook = await readSource(
    "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
  );
  const modal = await readSource(
    "app/dashboard/booster/publier/PublishModal.tsx",
  );

  assert.match(hook, /const corePreparationReadyRef = useRef\(false\)/);
  assert.match(hook, /corePreparationReadyRef\.current = true/);
  assert.match(
    hook,
    /request\.mediaType === "video" &&[\s\S]{0,120}request\.directVideoSource/,
  );
  assert.match(hook, /loadMediaPublicationWorkspace\(/);
  assert.match(modal, /startBackgroundVideoPrewarm/);
  assert.match(modal, /async function prepareCutoverVideoVariants/);
  assert.equal(
    (modal.match(/prewarmPersistentMediaWorkspace\(/g) || []).length,
    3,
  );
  assert.match(modal, /options\?\.generateMissingVideoVariants === false/);
});

test("un 413 TUS explique la limite globale Supabase à configurer", async () => {
  const source = await readSource("lib/universalMediaUploadClient.ts");

  assert.match(source, /response\.status === 413/);
  assert.match(source, /limite requise : 320 Mo/);
});
