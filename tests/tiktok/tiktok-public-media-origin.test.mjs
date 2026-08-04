import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/tiktokMediaUrl.ts", "utf8");

test("TikTok photo URLs prefer a configured public origin over localhost", () => {
  const appIndex = source.indexOf("process.env.NEXT_PUBLIC_APP_URL");
  const requestIndex = source.indexOf("requestUrl,");
  assert.ok(appIndex >= 0, "NEXT_PUBLIC_APP_URL must be considered");
  assert.ok(requestIndex > appIndex, "request origin must be a later fallback");
  assert.match(source, /hostname === \"localhost\"/);
  assert.match(source, /url\.protocol !== \"https:\"/);
});

test("TikTok photo URLs always keep a public production fallback", () => {
  assert.match(source, /https:\/\/app\.inrcy\.com/);
});
