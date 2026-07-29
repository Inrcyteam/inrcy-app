import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardClientSource = readFileSync(
  new URL("../../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("generator power keeps the last confirmed value while channel states settle", () => {
  assert.match(
    dashboardClientSource,
    /const generatorPower = displayedGeneratorPower \?\? 0;/,
  );
  assert.doesNotMatch(
    dashboardClientSource,
    /usingCachedGeneratorPower \? displayedGeneratorPower : computedGeneratorPower/,
  );
});

test("generator power commits only after a quiet settling window", () => {
  assert.match(
    dashboardClientSource,
    /const GENERATOR_POWER_SETTLE_MS = 700;/,
  );
  assert.match(
    dashboardClientSource,
    /if \(!generatorPowerReady \|\| displayedGeneratorPower === computedGeneratorPower\) return;/,
  );
  assert.match(
    dashboardClientSource,
    /window\.setTimeout\(\(\) => \{[\s\S]*setDisplayedGeneratorPower\(computedGeneratorPower\)[\s\S]*writeUiCacheValue\(GENERATOR_POWER_CACHE_KEY, String\(computedGeneratorPower\)\)[\s\S]*\}, GENERATOR_POWER_SETTLE_MS\)/,
  );
  assert.match(
    dashboardClientSource,
    /return \(\) => window\.clearTimeout\(settleTimer\);/,
  );
});

test("OAuth returns rehydrate the account-scoped confirmed power", () => {
  assert.match(
    dashboardClientSource,
    /const hydrateActiveAccountCaches = \(\) => \{[\s\S]*applyDashboardChannelState\(readCachedDashboardChannelState\(\)\)[\s\S]*readCachedGeneratorPowerPercent\(\)[\s\S]*setDisplayedGeneratorPower\(cachedPower\)/,
  );
  assert.match(
    dashboardClientSource,
    /setActiveBrowserUserId\(activeUserId\);[\s\S]*hydrateActiveAccountCaches\(\);/,
  );
});
