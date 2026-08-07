import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("dashboard exposes a dedicated reconnect state with orange warning UI", () => {
  const types = read("app/dashboard/dashboard.types.ts");
  const shared = read("app/dashboard/dashboard.shared.ts");
  const bubble = read("app/dashboard/_components/DashboardFluxBubble.tsx");
  const bubbleCss = read("app/dashboard/_components/DashboardChannelBubble.module.css");
  const i18n = read("lib/dashboardI18n.ts");

  assert.match(types, /"connected"\s*\|\s*"available"\s*\|\s*"reconnect"\s*\|\s*"coming"/);
  assert.match(shared, /status:\s*"reconnect",\s*text:\s*"À reconnecter"/);
  assert.match(bubble, /item\.bubbleStatus === "reconnect"/);
  assert.match(bubble, /WarningTriangle/);
  assert.match(bubbleCss, /\.reconnectCard\s*\{/);
  assert.match(bubbleCss, /\.statusReconnect\s*\{/);
  assert.match(bubbleCss, /#fb923c/i);
  assert.match(i18n, /reconnect:\s*"À reconnecter"/);
});

test("reconnect state is refreshed in realtime for every OAuth publication channel", () => {
  const shared = read("app/dashboard/dashboard.shared.ts");
  for (const channel of ["gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts", "pinterest"]) {
    assert.ok(shared.includes(`source === "${channel}"`) || shared.includes(`provider === "${channel}"`) || (channel === "youtube_shorts" && shared.includes('provider === "youtube"')), `missing realtime mapping for ${channel}`);
  }
});

test("Booster only enables channels whose official connection status is connected", () => {
  const route = read("app/api/booster/connected-channels/route.ts");
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const selector = read("app/dashboard/booster/publier/components/PublishChannelSelector.tsx");

  assert.match(route, /state\.connected === true && state\.connection_status === "connected"/);
  assert.match(route, /requiresReconnect:\s*requiresReconnect\(states\.gmb\)/);
  assert.match(route, /requiresReconnect:\s*requiresReconnect\(states\.pinterest\)/);
  assert.match(modal, /if \(!connected\[key\]\) return;/);
  assert.match(modal, /\[key\]: connected\[key\] \? selected : false/);
  assert.match(selector, /const requiresReconnect = Boolean\(info\?\.requiresReconnect\)/);
  assert.match(selector, /aria-disabled=\{!isConnected\}/);
  assert.match(selector, /requiresReconnect \? <WarningTriangle/);
});

test("runtime OAuth failures persist a reconnect marker and successful OAuth clears it", () => {
  const versions = read("lib/connectionVersions.ts");
  const diagnostics = read("lib/channelPublishDiagnostics.ts");
  const publishNow = read("app/api/booster/publish-now/route.ts");

  assert.match(versions, /hasConnectionReconnectMarker/);
  assert.match(versions, /if \(hasConnectionReconnectMarker\(versionNode\)\) return "needs_update"/);
  assert.match(versions, /clearConnectionReconnectMarkers/);
  for (const channel of ["gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts", "pinterest"]) {
    assert.ok(diagnostics.includes(`${channel}: {`), `missing persistent reconnect integration key for ${channel}`);
  }
  assert.match(diagnostics, /needs_reconnect:\s*true/);
  assert.match(publishNow, /markPublishChannelReconnectRequired/);
});

test("official integration rows win over stale legacy settings", () => {
  const state = read("lib/channelConnectionState.ts");
  assert.match(state, /const gmbHasOfficialRow = hasIntegrationRecord\(gmb\)/);
  assert.match(state, /const fbHasOfficialRow = hasIntegrationRecord\(fb\)/);
  assert.match(state, /const igHasOfficialRow = hasIntegrationRecord\(ig\)/);
  assert.match(state, /const liHasOfficialRow = hasIntegrationRecord\(li\)/);
  assert.match(state, /pinterestRequiresUpdate/);
});
