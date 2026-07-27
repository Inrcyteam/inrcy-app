import test from "node:test";
import assert from "node:assert/strict";
import { getMailCampaignDeliveryConfig } from "../../lib/mailCampaignPacing.ts";

test("iNr'Send uses safe campaign defaults", () => {
  const config = getMailCampaignDeliveryConfig({} as NodeJS.ProcessEnv);
  assert.equal(config.batchSize, 5);
  assert.equal(config.sendDelayMs, 8_000);
  assert.equal(config.batchPauseMs, 60_000);
  assert.equal(config.hourlyLimit, 150);
  assert.equal(config.dailyLimit, 300);
  assert.equal(config.maxActivePerIntegration, 1);
  assert.equal(config.lockLeaseSeconds, 180);
});

test("unsafe environment values are bounded", () => {
  const config = getMailCampaignDeliveryConfig({
    INRSEND_CAMPAIGN_BATCH_SIZE: "999",
    INRSEND_CAMPAIGN_DELAY_MS: "0",
    INRSEND_CAMPAIGN_BATCH_PAUSE_MS: "1",
    INRSEND_CAMPAIGN_HOURLY_LIMIT: "999999",
    INRSEND_CAMPAIGN_DAILY_LIMIT: "9999999",
    INRSEND_CAMPAIGN_MAX_ACTIVE_PER_BOX: "7",
    INRSEND_CAMPAIGN_LOCK_LEASE_SECONDS: "9999",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(config.batchSize, 5);
  assert.equal(config.sendDelayMs, 8_000);
  assert.equal(config.batchPauseMs, 60_000);
  assert.equal(config.hourlyLimit, 150);
  assert.equal(config.dailyLimit, 300);
  assert.equal(config.maxActivePerIntegration, 1);
  assert.equal(config.lockLeaseSeconds, 900);
});
