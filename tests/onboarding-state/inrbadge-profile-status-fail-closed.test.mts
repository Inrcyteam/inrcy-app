import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardClientSource = readFileSync(
  new URL("../../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);
const fluxBubblesSource = readFileSync(
  new URL("../../app/dashboard/dashboard.flux-bubbles.ts", import.meta.url),
  "utf8",
);

test("iNrBadge never reports connected before the profile check is authoritative", () => {
  assert.match(
    dashboardClientSource,
    /return profileCheckReady && !profileIncomplete;/,
  );
  assert.doesNotMatch(
    dashboardClientSource,
    /cachedInrBadgeProfileReady \?\? !profileIncomplete/,
  );
  assert.match(
    fluxBubblesSource,
    /if \(!inrBadgeProfileCheckReady\) \{[\s\S]*text: "Synchronisation…"/,
  );
});

test("iNrBadge actions stay disabled while the profile check is pending", () => {
  assert.match(
    fluxBubblesSource,
    /\(m\.key === "inrbadge" \? !inrBadgeProfileCheckReady : false\)/,
  );
  assert.match(
    fluxBubblesSource,
    /if \(m\.key === "inrbadge"\) \{[\s\S]*if \(!inrBadgeProfileCheckReady\) return;/,
  );
});
