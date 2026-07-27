export type MailCampaignDeliveryConfig = {
  batchSize: number;
  sendDelayMs: number;
  batchPauseMs: number;
  hourlyLimit: number;
  dailyLimit: number;
  maxActivePerIntegration: number;
  lockLeaseSeconds: number;
};

function parseBoundedEnvInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * Safe defaults for classic mailboxes (Gmail, Outlook and IMAP/SMTP).
 *
 * A cron execution handles only a small slice. Messages inside that slice are
 * deliberately spaced out, then the remaining recipients are cooled down
 * before a later cron execution can claim them.
 */
export function getMailCampaignDeliveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): MailCampaignDeliveryConfig {
  return {
    // Etape 2 : les variables peuvent ralentir davantage, jamais rendre le moteur plus agressif.
    batchSize: parseBoundedEnvInt(env.INRSEND_CAMPAIGN_BATCH_SIZE, 5, 1, 5),
    sendDelayMs: parseBoundedEnvInt(env.INRSEND_CAMPAIGN_DELAY_MS, 8_000, 8_000, 30_000),
    batchPauseMs: parseBoundedEnvInt(env.INRSEND_CAMPAIGN_BATCH_PAUSE_MS, 60_000, 60_000, 60 * 60_000),
    hourlyLimit: parseBoundedEnvInt(env.INRSEND_CAMPAIGN_HOURLY_LIMIT, 150, 1, 150),
    dailyLimit: parseBoundedEnvInt(env.INRSEND_CAMPAIGN_DAILY_LIMIT, 300, 1, 300),
    maxActivePerIntegration: parseBoundedEnvInt(env.INRSEND_CAMPAIGN_MAX_ACTIVE_PER_BOX, 1, 1, 1),
    lockLeaseSeconds: parseBoundedEnvInt(env.INRSEND_CAMPAIGN_LOCK_LEASE_SECONDS, 180, 60, 900),
  };
}

export async function waitForNextCampaignRecipient(delayMs: number) {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
