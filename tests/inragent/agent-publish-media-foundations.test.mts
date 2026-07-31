import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  mediaPatchFromLibraryItem,
  readAgentApiJson,
} from "../../app/dashboard/agent/_lib/agent.publish-media-foundations.ts";

const client = readFileSync("app/dashboard/agent/AgentClient.tsx", "utf8");
const foundations = readFileSync(
  "app/dashboard/agent/_lib/agent.publish-media-foundations.ts",
  "utf8",
);

test("AgentClient delegates pure publication media foundations", () => {
  assert.match(client, /from "\.\/_lib\/agent\.publish-media-foundations"/);
  assert.doesNotMatch(client, /^  function readAgentImageFileInfo/m);
  assert.doesNotMatch(client, /^  function readAgentVideoFileInfo/m);
  assert.doesNotMatch(client, /^  async function readAgentMediaFileInfo/m);
  assert.doesNotMatch(client, /^  async function readAgentApiJson/m);
  assert.doesNotMatch(client, /^  function mediaPatchFromLibraryItem/m);
  assert.match(foundations, /export function readAgentImageFileInfo/);
  assert.match(foundations, /export function readAgentVideoFileInfo/);
  assert.match(foundations, /export async function readAgentMediaFileInfo/);
  assert.match(foundations, /export async function readAgentApiJson/);
  assert.match(foundations, /export function mediaPatchFromLibraryItem/);
  assert.doesNotMatch(foundations, /\buseState\b|\buseEffect\b|\bcreateClient\b/);
});

test("media library mapping keeps all compatibility aliases", () => {
  const patch = mediaPatchFromLibraryItem({
    id: "media-1",
    bucket_name: "bucket",
    storage_path: "folder/video.mp4",
    signed_url: "https://example.test/video.mp4",
    title: "Démo",
    mime_type: "video/mp4",
    size_bytes: 1234,
    width: 1080,
    height: 1920,
    duration_seconds: 12.5,
    media_type: "video",
  } as any);
  assert.equal(patch.bucket, "bucket");
  assert.equal(patch.bucketName, "bucket");
  assert.equal(patch.path, "folder/video.mp4");
  assert.equal(patch.storagePath, "folder/video.mp4");
  assert.equal(patch.kind, "video");
  assert.equal(patch.mediaType, "video");
  assert.equal(patch.duration, 12.5);
});

test("API JSON helper keeps JSON and text fallbacks", async () => {
  assert.deepEqual(
    await readAgentApiJson(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
      "fallback",
    ),
    { ok: true },
  );
  assert.deepEqual(
    await readAgentApiJson(new Response("Erreur distante"), "fallback"),
    { error: "Erreur distante" },
  );
});
