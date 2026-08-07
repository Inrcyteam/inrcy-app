import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(ROOT, relativePath), "utf8");

test("Booster explains the 300 Mo source ceiling and the automatic optimization thresholds", () => {
  const shared = read("app/dashboard/booster/publier/publishModal.shared.tsx");
  const intent = read(
    "app/dashboard/booster/publier/components/PublishIntentPanel.tsx",
  );
  const media = read(
    "app/dashboard/booster/publier/components/PublishImagesPanel.tsx",
  );

  assert.match(
    shared,
    /Jusqu’à \$\{BOOSTER_MAX_IMAGE_COUNT\} images ou 1 vidéo de \$\{MEDIA_LIBRARY_VIDEO_SOURCE_MAX_MB_LABEL\} max · optimisation proposée au-delà de \$\{BOOSTER_MAX_IMAGE_MB_LABEL\} par image ou \$\{BOOSTER_MAX_VIDEO_MB_LABEL\} pour la vidéo\./,
  );
  assert.match(shared, /BOOSTER_PUBLICATION_MEDIA_OPTIMIZATION_LABEL/);
  assert.match(intent, /BOOSTER_GENERATION_MEDIA_OPTIMIZATION_LABEL/);
  assert.match(media, /BOOSTER_PUBLICATION_MEDIA_OPTIMIZATION_LABEL/);
});

test("the publication balance highlights successes and keeps independent processing and failure quotas", () => {
  const modal = read(
    "app/dashboard/_components/PublishExecutionResultModal.tsx",
  );

  assert.match(modal, /width: "min\(760px, 100%\)"/);
  assert.match(modal, /const hasPublishedChannels = publishedCount > 0/);
  assert.match(modal, /hasPublishedChannels[\s\S]*?linear-gradient\(135deg, #16a34a, #34d399\)/);
  assert.match(modal, /variant="success"[\s\S]*?Réussites[\s\S]*?publishedCount/);
  assert.match(modal, /variant="warning"[\s\S]*?En traitement[\s\S]*?pendingCount/);
  assert.match(modal, /variant="error"[\s\S]*?Échecs ou canaux à corriger[\s\S]*?failedOrSkippedCount/);
  assert.match(modal, /const orderedEntries = \[\.\.\.entries\]\.sort/);
  assert.match(modal, />\s*Voir\s*<\/a>/);
  assert.match(modal, /Voir dans iNr'Send/);
  assert.match(modal, /Retenter \$\{retryableFailureCount\}/);
});

test("Pinterest derives its account URL for settings, the immediate balance and iNrSend", () => {
  const oauth = read("lib/pinterestOAuth.ts");
  const settings = read(
    "app/dashboard/settings/_components/PinterestSettingsContent.tsx",
  );
  const publishModal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const inrSend = read(
    "app/dashboard/mails/_components/MailboxDetailsModal.tsx",
  );

  assert.match(
    oauth,
    /https:\/\/www\.pinterest\.fr\/\$\{encodeURIComponent\(clean\)\}\//,
  );
  assert.match(settings, /status\?live=1/);
  assert.match(
    settings,
    /setProfileLinkDraft\(settings\.publicProfileUrl \|\| settings\.profileUrl \|\| ""\)/,
  );
  assert.match(publishModal, /status\?live=1/g);
  assert.match(publishModal, /recoveredPinterestHref/);
  assert.match(publishModal, /channelLinks = Object\.fromEntries/);
  assert.match(inrSend, /status\?live=1/);
  assert.match(inrSend, /activeChannelAccountHref/);
  assert.match(inrSend, /Ouvrir le compte/);
});

test("iNrStats channel panels use the global column width while zoom reflow stays active", () => {
  const client = read("app/dashboard/stats/StatsClient.tsx");
  const css = read("app/dashboard/stats/stats.module.css");

  assert.match(client, /styles\.statsWorkspaceChannel/);
  assert.match(client, /data-stats-view=\{activeStatsPanel === "all" \? "global" : "channel"\}/);
  assert.match(
    css,
    /\.statsWorkspaceChannel \.channelStatsHeader[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/,
  );
  assert.match(
    css,
    /\.statsWorkspaceChannel \.channelStatsHeader \.allStatsKpis[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/,
  );
  assert.match(
    css,
    /\.statsWorkspaceChannel \.channelStatsPanel \.detailTopRow,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/,
  );
  assert.match(css, /@container channelStats \(max-width: 800px\)/);
  assert.match(css, /overflow-x: hidden !important;[\s\S]*?overflow-y: visible !important/);
});
