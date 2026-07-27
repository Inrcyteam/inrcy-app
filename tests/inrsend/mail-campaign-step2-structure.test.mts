import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const crm = readFileSync("lib/crmCampaigns.ts", "utf8");
const createRoute = readFileSync("app/api/crm/campaigns/route.ts", "utf8");
const retryRoute = readFileSync("app/api/crm/campaigns/[id]/retry/route.ts", "utf8");
const completion = readFileSync("lib/mailCampaignCompletionEmail.ts", "utf8");
const pacing = readFileSync("lib/mailCampaignPacing.ts", "utf8");
const suppression = readFileSync("lib/mailSuppression.ts", "utf8");
const sql = readFileSync("ops/sql/2026-07-27_inrsend_step2_intelligent_campaigns.sql", "utf8");

test("la campagne est plafonnee a 300 destinataires meme avec une ancienne variable", () => {
  assert.match(createRoute, /HARD_MAX_CAMPAIGN_RECIPIENTS = 300/);
  assert.match(createRoute, /Math\.min\(HARD_MAX_CAMPAIGN_RECIPIENTS/);
  assert.match(createRoute, /getMailCampaignDeliveryConfig.*mailCampaignPacing/);
});

test("les garde-fous de cadence ne peuvent pas etre acceleres par Vercel", () => {
  assert.match(pacing, /BATCH_SIZE, 5, 1, 5/);
  assert.match(pacing, /DELAY_MS, 8_000, 8_000/);
  assert.match(pacing, /BATCH_PAUSE_MS, 60_000, 60_000/);
  assert.match(pacing, /HOURLY_LIMIT, 150, 1, 150/);
  assert.match(pacing, /DAILY_LIMIT, 300, 1, 300/);
});

test("les destinataires sont reclames atomiquement", () => {
  assert.match(crm, /claim_mail_campaign_recipients/);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /mail_campaign_recipients_dispatch_key_uniq/);
  assert.match(sql, /on public\.mail_campaign_recipients \(dispatch_key\);/);
  assert.doesNotMatch(sql, /where dispatch_key is not null/);
});

test("les pauses automatiques ont une date de reprise", () => {
  assert.match(sql, /status in \('queued', 'processing', 'paused', 'sent', 'completed', 'partial', 'failed'\)/);
  assert.match(crm, /pause_reason/);
  assert.match(crm, /resume_at/);
  assert.match(crm, /retryAfterMs/);
});

test("une erreur de connexion met la campagne en pause sans condamner les contacts", () => {
  assert.doesNotMatch(crm, /markCampaignRecipientsFailedForAccountIssue/);
  assert.match(crm, /resumeAt: null/);
  assert.match(retryRoute, /Reprise|resumed|pause_reason/);
});


test("les erreurs temporaires ne sont jamais transformees en plainte ou blacklist", () => {
  const softPosition = suppression.indexOf("SOFT_BOUNCE_PATTERNS.some");
  const hardPosition = suppression.indexOf("HARD_BOUNCE_PATTERNS.some");
  assert.ok(softPosition >= 0 && hardPosition > softPosition);
  assert.doesNotMatch(suppression, /message rejected as spam\/i/);
  assert.doesNotMatch(suppression, /policy rejection\/i/);
});

test("le bilan ne promet plus une livraison certaine", () => {
  assert.match(completion, /Campagne terminée/);
  assert.match(completion, /acceptés par les messageries/);
  assert.doesNotMatch(completion, /Campagne réussie/);
});
