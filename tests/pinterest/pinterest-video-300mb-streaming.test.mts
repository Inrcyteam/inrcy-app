import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publisher = readFileSync(
  new URL("../../lib/pinterestPublish.ts", import.meta.url),
  "utf8",
);
const protocol = readFileSync(
  new URL("../../lib/pinterestVideoProtocol.ts", import.meta.url),
  "utf8",
);

test("Pinterest streams the source to disk and uploads a file-backed Blob", () => {
  const downloadSection = publisher.slice(
    publisher.indexOf("async function downloadPinterestVideoSource"),
    publisher.indexOf("async function uploadPinterestCover"),
  );
  const createSection = publisher.slice(
    publisher.indexOf("export async function createPinterestVideoPin"),
    publisher.indexOf("export type PinterestUpdatePinArgs"),
  );

  assert.match(downloadSection, /Readable\.fromWeb/);
  assert.match(downloadSection, /createWriteStream/);
  assert.doesNotMatch(downloadSection, /arrayBuffer\s*\(/);
  assert.match(createSection, /openAsBlob\([\s\S]{0,100}prepared\.videoPath/);
  assert.match(createSection, /videoFile,/);
  assert.doesNotMatch(createSection, /new Uint8Array\(prepared/);
});

test("Pinterest enforces the source limit while bytes are streaming", () => {
  assert.match(publisher, /receivedBytes > PINTEREST_VIDEO_POLICY\.maxBytes/);
  assert.match(publisher, /announcedSize > PINTEREST_VIDEO_POLICY\.maxBytes/);
  assert.match(protocol, /uploadFile\.size !== Number\(videoSize\)/);
});
