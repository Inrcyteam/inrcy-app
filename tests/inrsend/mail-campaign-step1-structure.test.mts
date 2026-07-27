import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("campaign worker uses a distributed mailbox lock and pacing", () => {
  const source = read("lib/crmCampaigns.ts");
  assert.match(source, /tryAcquireMailCampaignMailboxLock/);
  assert.match(source, /renewMailCampaignMailboxLock/);
  assert.match(source, /releaseMailCampaignMailboxLock/);
  assert.match(source, /waitForNextCampaignRecipient\((?:args\.config|campaignConfig)\.sendDelayMs\)/);
  assert.match(source, /deferReadyCampaignRecipients\(campaignId, (?:args\.config|campaignConfig)\.batchPauseMs\)/);
  assert.match(source, /Promise\.allSettled/);
});

test("SMTP delivery checks accepted and rejected recipients", () => {
  const source = read("lib/inrsend/sendMailFromIntegration.ts");
  assert.match(source, /smtpResult\?\.accepted/);
  assert.match(source, /smtpResult\?\.rejected/);
  assert.match(source, /Le serveur SMTP n’a pas accepté le destinataire/);
});

test("scheduled agent campaigns are handed to the dedicated paced cron", () => {
  const source = read("app/api/cron/inr-agent-scheduled-actions/route.ts");
  assert.doesNotMatch(source, /processPendingMailCampaigns/);
  assert.match(source, /cron dédié \/api\/cron\/mail-campaigns/);
});

test("Supabase migration exposes the three lock functions", () => {
  const source = read("ops/sql/2026-07-27_inrsend_step1_safe_dispatch.sql");
  assert.match(source, /try_acquire_mail_campaign_mailbox_lock/);
  assert.match(source, /renew_mail_campaign_mailbox_lock/);
  assert.match(source, /release_mail_campaign_mailbox_lock/);
  assert.match(source, /grant execute[\s\S]*service_role/);
});
