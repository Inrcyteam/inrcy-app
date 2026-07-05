import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("iNrAgent immediate and scheduled publications use the shared intelligent image matrix", async () => {
  const [execute, schedule, helper] = await Promise.all([
    read("app/api/agent/actions/execute/route.ts"),
    read("app/api/agent/actions/schedule/route.ts"),
    read("lib/boosterImageServerPreparation.ts"),
  ]);

  for (const source of [execute, schedule]) {
    assert.match(source, /prepareBoosterImagesByChannelOnServer/);
    assert.match(source, /imagesByChannel: preparedImages\.imagesByChannel/);
    assert.match(source, /imageSettingsByChannel: preparedImages\.imageSettingsByChannel/);
  }
  assert.match(helper, /getBoosterImageDecision/);
  assert.match(helper, /getBoosterImageSequenceTargetRatio/);
  assert.match(helper, /canUseAutomaticCover/);
  assert.match(helper, /policy: "booster_intelligent_matrix_v1"/);
});

test("iNrSend edit restarts from the preserved original without cumulative crop", async () => {
  const [client, publishRoute, details] = await Promise.all([
    read("app/dashboard/mails/MailboxClient.tsx"),
    read("app/api/booster/publish-now/route.ts"),
    read("app/dashboard/mails/_components/MailboxDetailsModal.tsx"),
  ]);

  assert.match(client, /const initialTransform = originalUrl\s*\? \{ \.\.\.defaultTransform \}/);
  assert.match(publishRoute, /originalSourceUrlByKey/);
  assert.match(publishRoute, /mappedOriginalUrl/);
  assert.match(details, /\? "Originale"\s*:\s*"Personnalisée"/);
});

test("iNrAgent scheduled publication keeps Pinterest image parity and excludes video pins", async () => {
  const schedule = await read("app/api/agent/actions/schedule/route.ts");
  assert.match(schedule, /\| "pinterest";/);
  assert.match(schedule, /pinterest: "pinterest"/);
  assert.match(schedule, /activeMediaMode === "video"\) return channel !== "pinterest"/);
});
