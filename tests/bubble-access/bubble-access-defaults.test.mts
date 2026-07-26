import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_BUBBLE_DEFAULT_ACCESS,
  buildBubbleAccessMap,
  createDefaultBubbleAccessRows,
  isBubbleEnabled,
} from "../../lib/bubbleAccess.ts";

test("TikTok est actif par défaut et Pinterest reste désactivé", () => {
  assert.equal(APP_BUBBLE_DEFAULT_ACCESS.tiktok, true);
  assert.equal(APP_BUBBLE_DEFAULT_ACCESS.pinterest, false);

  const rows = createDefaultBubbleAccessRows("00000000-0000-0000-0000-000000000001");
  assert.equal(rows.find((row) => row.bubble_key === "tiktok")?.enabled, true);
  assert.equal(rows.find((row) => row.bubble_key === "pinterest")?.enabled, false);
});

test("TikTok reste accessible même si une ancienne ligne est encore à false", () => {
  const accessMap = buildBubbleAccessMap([
    { bubble_key: "tiktok", enabled: false },
    { bubble_key: "pinterest", enabled: false },
  ]);

  assert.equal(accessMap.tiktok, true);
  assert.equal(accessMap.pinterest, false);
  assert.equal(isBubbleEnabled({ tiktok: false }, "tiktok"), true);
});