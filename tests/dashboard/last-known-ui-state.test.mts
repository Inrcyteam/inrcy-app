import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const dashboardClient = read("app/dashboard/DashboardClient.tsx");
const publishModal = read("app/dashboard/booster/publier/PublishModal.tsx");
const notificationsHook = read("app/dashboard/_hooks/useDashboardNotifications.ts");
const dashboardTopbar = read("app/dashboard/_components/DashboardTopbar.tsx");
const accountCache = read("lib/browserAccountCache.ts");

test("generator power reuses the last confirmed details before live checks settle", () => {
  assert.match(dashboardClient, /GENERATOR_POWER_SNAPSHOT_CACHE_KEY = "inrcy_generator_power_snapshot_v1"/);
  assert.match(
    dashboardClient,
    /const shouldUseConfirmedGeneratorPowerDetails = !generatorPowerReady \|\| generatorPowerIsSettling;/,
  );
  assert.match(
    dashboardClient,
    /const remainingGeneratorPowerSteps = shouldUseConfirmedGeneratorPowerDetails[\s\S]*generatorPower >= 100[\s\S]*\? 0/,
  );
  assert.match(dashboardClient, /writeCachedGeneratorPowerSnapshot\(nextSnapshot\)/);
});

test("Booster selects every newly confirmed connected channel without overriding the pro or a draft", () => {
  assert.match(publishModal, /const manuallyControlledChannelsRef = useRef<Set<ChannelKey>>\(new Set\(\)\)/);
  assert.match(publishModal, /const draftChannelsRestoredRef = useRef\(false\)/);
  assert.match(
    publishModal,
    /!draftChannelsRestoredRef\.current[\s\S]*!manuallyControlledChannelsRef\.current\.has\(key\)[\s\S]*nextSelection\[key\] = true/,
  );
  assert.match(publishModal, /applyConnectedChannels\(nextConnected\)/);
  assert.match(publishModal, /manuallyControlledChannelsRef\.current\.add\(key\)/);
  assert.match(publishModal, /draftChannelsRestoredRef\.current = true;[\s\S]*setChannels\(nextChannels\)/);
});

test("notification and iNrAgent badges hydrate from account-scoped caches before background refresh", () => {
  assert.match(notificationsHook, /DASHBOARD_NOTIFICATIONS_CACHE_KEY = "inrcy_dashboard_notifications_v1"/);
  assert.match(notificationsHook, /\(\) => readCachedNotifications\(\)\.items/);
  assert.match(notificationsHook, /ACTIVE_INRCY_ACCOUNT_EVENT/);
  assert.match(dashboardTopbar, /INR_AGENT_PENDING_COUNT_CACHE_KEY = "inrcy_inr_agent_pending_count_v1"/);
  assert.match(dashboardTopbar, /\(\) => readCachedPendingInrAgentCount\(\)/);
  assert.match(dashboardTopbar, /ACTIVE_INRCY_ACCOUNT_EVENT/);
  assert.match(accountCache, /"inrcy_dashboard_notifications_v1"/);
  assert.match(accountCache, /"inrcy_inr_agent_pending_count_v1"/);
});
