import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../lib/facebookPublish.ts", import.meta.url),
  "utf8",
);

test("Facebook lets Meta pull the hosted video without buffering 300 MB", () => {
  const videoSection = source.slice(
    source.indexOf("function normalizeHostedFacebookVideoUrl"),
  );

  assert.match(videoSection, /form\.append\("file_url", hostedVideoUrl\)/);
  assert.doesNotMatch(videoSection, /arrayBuffer\s*\(/);
  assert.doesNotMatch(videoSection, /form\.append\("source"/);
});

test("Facebook video transport refuses in-memory and non-http sources", () => {
  assert.match(source, /url\.protocol !== "https:"/);
  assert.match(source, /url\.protocol !== "http:"/);
  assert.match(source, /doit d'abord être enregistrée dans l'espace média/);
});
