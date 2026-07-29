import assert from "node:assert/strict";
import test from "node:test";

import {
  createProfileLogoVersion,
  extractLogoPathFromUrl,
  getProfileLogoDisplayUrl,
  getProfileLogoVersion,
  resolveProfileLogoUrl,
} from "../../lib/profileLogo.ts";

const PATH = "12345678-1234-1234-1234-123456789abc/logo.png";

test("a versioned profile logo URL keeps the storage path and cache token", async () => {
  const displayUrl = getProfileLogoDisplayUrl(PATH, "logo-v2");

  assert.equal(displayUrl, `/api/public/logo?path=${encodeURIComponent(PATH)}&v=logo-v2`);
  assert.equal(extractLogoPathFromUrl(displayUrl), PATH);
  assert.equal(getProfileLogoVersion(displayUrl), "logo-v2");

  const resolved = await resolveProfileLogoUrl(null as never, {
    logo_path: PATH,
    logo_url: displayUrl,
  });

  assert.deepEqual(resolved, { logoPath: PATH, logoUrl: displayUrl });
});

test("logo versions are deterministic for a supplied timestamp", () => {
  assert.equal(createProfileLogoVersion(1_700_000_000_000), Math.trunc(1_700_000_000_000).toString(36));
});

test("invalid cache tokens are sanitized", () => {
  const displayUrl = getProfileLogoDisplayUrl(PATH, "v2<script>");
  assert.equal(getProfileLogoVersion(displayUrl), "v2script");
});
