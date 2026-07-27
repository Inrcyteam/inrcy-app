import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MailCampaignMailboxLock = {
  integrationId: string;
  ownerToken: string;
  leaseSeconds: number;
};

function migrationErrorMessage(error: unknown) {
  const raw = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = typeof raw.message === "string" ? raw.message : String(error || "");
  const code = typeof raw.code === "string" ? raw.code : "";
  if (code === "PGRST202" || code === "42883" || message.toLowerCase().includes("could not find the function")) {
    return "Le verrou anti-chevauchement iNr’Send n’est pas installé. Exécutez la migration ops/sql/2026-07-27_inrsend_step1_safe_dispatch.sql dans Supabase avant de relancer les campagnes.";
  }
  return message || "Impossible de sécuriser la file d’envoi de cette boîte mail.";
}

export async function tryAcquireMailCampaignMailboxLock(args: {
  integrationId: string;
  leaseSeconds: number;
}): Promise<MailCampaignMailboxLock | null> {
  const ownerToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc("try_acquire_mail_campaign_mailbox_lock", {
    p_integration_id: args.integrationId,
    p_owner_token: ownerToken,
    p_lease_seconds: args.leaseSeconds,
  });

  if (error) throw new Error(migrationErrorMessage(error));
  if (data !== true) return null;
  return {
    integrationId: args.integrationId,
    ownerToken,
    leaseSeconds: args.leaseSeconds,
  };
}

export async function renewMailCampaignMailboxLock(lock: MailCampaignMailboxLock) {
  const { data, error } = await supabaseAdmin.rpc("renew_mail_campaign_mailbox_lock", {
    p_integration_id: lock.integrationId,
    p_owner_token: lock.ownerToken,
    p_lease_seconds: lock.leaseSeconds,
  });
  if (error) throw new Error(migrationErrorMessage(error));
  return data === true;
}

export async function releaseMailCampaignMailboxLock(lock: MailCampaignMailboxLock) {
  const { error } = await supabaseAdmin.rpc("release_mail_campaign_mailbox_lock", {
    p_integration_id: lock.integrationId,
    p_owner_token: lock.ownerToken,
  });
  if (error) {
    console.warn("[crmCampaigns] mailbox lock release failed", {
      integrationId: lock.integrationId,
      error,
    });
  }
}
