import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCampaignRecipientReport,
  buildMailCampaignExperienceReport,
  estimateCampaignDurationMs,
} from "../../lib/mailCampaignReport.ts";

const config = {
  batchSize: 5,
  sendDelayMs: 8_000,
  batchPauseMs: 60_000,
  hourlyLimit: 150,
  dailyLimit: 300,
  maxActivePerIntegration: 1,
  lockLeaseSeconds: 180,
};

test("l'estimation couvre les campagnes de 20, 200 et 300 destinataires", () => {
  assert.equal(estimateCampaignDurationMs({ remaining: 20, config }), 308_000);
  assert.equal(estimateCampaignDurationMs({ remaining: 200, config }), 3_620_000);
  assert.equal(estimateCampaignDurationMs({ remaining: 300, config }), 5_460_000);
});

test("le bilan distingue acceptation, livraison, rebonds et desinscription", () => {
  const counts = aggregateCampaignRecipientReport([
    { status: "sent", delivery_status: "accepted" },
    { status: "sent", delivery_status: "delivered" },
    { status: "failed", bounce_type: "hard", failure_retryable: false },
    { status: "failed", bounce_type: "soft", failure_retryable: true },
    { status: "failed", suppression_reason: "opt_out", unsubscribed_at: "2026-07-27T12:00:00Z" },
  ], 5);

  assert.equal(counts.accepted, 2);
  assert.equal(counts.delivered, 1);
  assert.equal(counts.hardBounce, 1);
  assert.equal(counts.softBounce, 1);
  assert.equal(counts.unsubscribed, 1);
  assert.equal(counts.blacklist, 0);
  assert.equal(counts.complaint, 0);
  assert.equal(counts.blocked, 1);
  assert.equal(counts.retryable, 1);
});

test("le rapport final est persistant et atteint 100 pour cent", () => {
  const report = buildMailCampaignExperienceReport({
    campaign: {
      id: "campaign-1",
      status: "partial",
      total_count: 3,
      created_at: "2026-07-27T12:00:00Z",
      started_at: "2026-07-27T12:01:00Z",
      finished_at: "2026-07-27T12:05:00Z",
      completion_email_status: "failed",
      completion_email_attempts: 1,
      completion_email_last_error: "SMTP indisponible",
    },
    recipients: [
      { status: "sent", delivery_status: "accepted" },
      { status: "sent", delivery_status: "delivered" },
      { status: "failed", bounce_type: "hard", failure_retryable: false },
    ],
    config,
    now: new Date("2026-07-27T12:05:00Z"),
  });

  assert.equal(report.progressPercent, 100);
  assert.equal(report.estimatedRemainingMs, 0);
  assert.equal(report.durationMs, 240_000);
  assert.equal(report.completionEmail.status, "failed");
});
