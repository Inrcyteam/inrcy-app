import { resolveTxt } from "node:dns/promises";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getMailCampaignDeliveryConfig,
  type MailCampaignDeliveryConfig,
} from "@/lib/mailCampaignPacing";

export type MailboxProvider = "gmail" | "microsoft" | "imap";
export type MailboxHealthStatus = "warming" | "healthy" | "watch" | "paused";
export type MailAuthStatus = "pass" | "warning" | "managed" | "unknown";

export type MailDomainAudit = {
  email: string;
  domain: string | null;
  customDomain: boolean;
  spf: MailAuthStatus;
  dkim: MailAuthStatus;
  dmarc: MailAuthStatus;
  checkedAt: string;
  warnings: string[];
};

export type MailboxReputationPolicy = {
  config: MailCampaignDeliveryConfig;
  healthStatus: MailboxHealthStatus;
  accountEmail: string | null;
  domainAudit: MailDomainAudit | null;
  blocked: boolean;
  blockedReason: string | null;
  resumeAt: string | null;
  mode: "warming" | "normal" | "cautious" | "paused";
};

type ReputationRow = {
  integration_id?: string | null;
  health_status?: string | null;
  accepted_count?: number | null;
  temporary_failure_count?: number | null;
  hard_bounce_count?: number | null;
  complaint_count?: number | null;
  consecutive_failures?: number | null;
  paused_until?: string | null;
  dns_status?: string | null;
  spf_status?: string | null;
  dkim_status?: string | null;
  dmarc_status?: string | null;
  dns_checked_at?: string | null;
  account_email?: string | null;
};

const MANAGED_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "yahoo.fr",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function normalizeProvider(value: unknown): MailboxProvider {
  const provider = String(value || "").toLowerCase();
  if (provider === "gmail" || provider === "microsoft") return provider;
  return "imap";
}

export function extractMailDomain(email: unknown) {
  const value = String(email || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const domain = value.slice(at + 1).replace(/\.$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : null;
}

export function isManagedMailboxDomain(domain: string | null) {
  return Boolean(domain && MANAGED_DOMAINS.has(domain.toLowerCase()));
}

function flattenTxt(records: string[][]) {
  return records.map((parts) => parts.join("")).map((value) => value.trim()).filter(Boolean);
}

async function safeResolveTxt(name: string) {
  try {
    return flattenTxt(await resolveTxt(name));
  } catch {
    return [];
  }
}

function dkimSelectors(provider: MailboxProvider, settings: Record<string, unknown> | null | undefined) {
  const configured = String(settings?.dkim_selector || settings?.dkimSelector || "").trim();
  const selectors = configured ? [configured] : [];
  if (provider === "gmail") selectors.push("google");
  if (provider === "microsoft") selectors.push("selector1", "selector2");
  selectors.push("default", "mail");
  return Array.from(new Set(selectors.filter(Boolean)));
}

export async function auditMailDomainAuthentication(args: {
  email: string;
  provider: MailboxProvider;
  settings?: Record<string, unknown> | null;
}): Promise<MailDomainAudit> {
  const checkedAt = new Date().toISOString();
  const domain = extractMailDomain(args.email);
  if (!domain) {
    return {
      email: args.email,
      domain: null,
      customDomain: false,
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
      checkedAt,
      warnings: ["Adresse d’expédition invalide ou domaine introuvable."],
    };
  }

  if (isManagedMailboxDomain(domain)) {
    return {
      email: args.email,
      domain,
      customDomain: false,
      spf: "managed",
      dkim: "managed",
      dmarc: "managed",
      checkedAt,
      warnings: [],
    };
  }

  const [rootTxt, dmarcTxt, ...dkimTxtGroups] = await Promise.all([
    safeResolveTxt(domain),
    safeResolveTxt(`_dmarc.${domain}`),
    ...dkimSelectors(args.provider, args.settings).map((selector) => safeResolveTxt(`${selector}._domainkey.${domain}`)),
  ]);

  const spf: MailAuthStatus = rootTxt.some((value) => /^v=spf1\b/i.test(value)) ? "pass" : "warning";
  const dmarc: MailAuthStatus = dmarcTxt.some((value) => /^v=dmarc1\b/i.test(value)) ? "pass" : "warning";
  const dkim: MailAuthStatus = dkimTxtGroups.some((records) => records.some((value) => /\bv=dkim1\b/i.test(value) || /\bp=/i.test(value)))
    ? "pass"
    : "unknown";

  const warnings: string[] = [];
  if (spf !== "pass") warnings.push("Aucun enregistrement SPF détecté pour le domaine d’expédition.");
  if (dmarc !== "pass") warnings.push("Aucun enregistrement DMARC détecté pour le domaine d’expédition.");
  if (dkim !== "pass") warnings.push("DKIM n’a pas pu être confirmé automatiquement. Vérifiez le sélecteur chez le fournisseur mail.");

  return {
    email: args.email,
    domain,
    customDomain: true,
    spf,
    dkim,
    dmarc,
    checkedAt,
    warnings,
  };
}

function clampConfig(base: MailCampaignDeliveryConfig, patch: Partial<MailCampaignDeliveryConfig>): MailCampaignDeliveryConfig {
  return {
    batchSize: Math.max(1, Math.min(base.batchSize, patch.batchSize ?? base.batchSize)),
    sendDelayMs: Math.max(base.sendDelayMs, patch.sendDelayMs ?? base.sendDelayMs),
    batchPauseMs: Math.max(base.batchPauseMs, patch.batchPauseMs ?? base.batchPauseMs),
    hourlyLimit: Math.max(1, Math.min(base.hourlyLimit, patch.hourlyLimit ?? base.hourlyLimit)),
    dailyLimit: Math.max(1, Math.min(base.dailyLimit, patch.dailyLimit ?? base.dailyLimit)),
    maxActivePerIntegration: 1,
    lockLeaseSeconds: Math.max(base.lockLeaseSeconds, patch.lockLeaseSeconds ?? base.lockLeaseSeconds),
  };
}

export function buildAdaptiveMailboxConfig(args: {
  provider: MailboxProvider;
  base?: MailCampaignDeliveryConfig;
  healthStatus?: MailboxHealthStatus;
  acceptedCount?: number;
  consecutiveFailures?: number;
  domainAudit?: MailDomainAudit | null;
}) {
  const base = args.base || getMailCampaignDeliveryConfig();
  const healthStatus = args.healthStatus || "warming";
  const acceptedCount = Math.max(0, Number(args.acceptedCount || 0));
  const consecutiveFailures = Math.max(0, Number(args.consecutiveFailures || 0));

  let config = base;
  let mode: MailboxReputationPolicy["mode"] = "normal";

  if (args.provider === "imap") {
    config = clampConfig(config, {
      batchSize: 4,
      sendDelayMs: 12_000,
      batchPauseMs: 90_000,
      hourlyLimit: 100,
      dailyLimit: 250,
    });
  }

  if (healthStatus === "warming" || acceptedCount < 50) {
    mode = "warming";
    config = clampConfig(config, {
      batchSize: 3,
      sendDelayMs: 12_000,
      batchPauseMs: 90_000,
      hourlyLimit: 90,
      dailyLimit: 200,
    });
  }

  if (healthStatus === "watch" || consecutiveFailures >= 2) {
    mode = "cautious";
    config = clampConfig(config, {
      batchSize: 2,
      sendDelayMs: 20_000,
      batchPauseMs: 180_000,
      hourlyLimit: 60,
      dailyLimit: 150,
    });
  }

  if (args.domainAudit?.customDomain && (args.domainAudit.spf === "warning" || args.domainAudit.dmarc === "warning")) {
    mode = mode === "cautious" ? mode : "warming";
    config = clampConfig(config, {
      batchSize: 2,
      sendDelayMs: 15_000,
      batchPauseMs: 120_000,
      hourlyLimit: 75,
      dailyLimit: 180,
    });
  }

  return { config, mode };
}

function reputationTableMissing(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  const message = String((error as { message?: unknown } | null)?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("mailbox_reputation_state");
}

async function loadReputationRow(integrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("mailbox_reputation_state")
    .select("integration_id,health_status,accepted_count,temporary_failure_count,hard_bounce_count,complaint_count,consecutive_failures,paused_until,dns_status,spf_status,dkim_status,dmarc_status,dns_checked_at,account_email")
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (error && !reputationTableMissing(error)) throw error;
  return error ? null : (data as ReputationRow | null);
}

function auditFromRow(email: string, row: ReputationRow | null): MailDomainAudit | null {
  if (!row?.dns_checked_at) return null;
  const domain = extractMailDomain(email);
  const customDomain = Boolean(domain && !isManagedMailboxDomain(domain));
  const warnings: string[] = [];
  const spf = String(row.spf_status || "unknown") as MailAuthStatus;
  const dkim = String(row.dkim_status || "unknown") as MailAuthStatus;
  const dmarc = String(row.dmarc_status || "unknown") as MailAuthStatus;
  if (spf === "warning") warnings.push("Aucun enregistrement SPF détecté pour le domaine d’expédition.");
  if (dmarc === "warning") warnings.push("Aucun enregistrement DMARC détecté pour le domaine d’expédition.");
  if (dkim === "warning" || dkim === "unknown") warnings.push("DKIM n’a pas pu être confirmé automatiquement.");
  return { email, domain, customDomain, spf, dkim, dmarc, checkedAt: String(row.dns_checked_at), warnings };
}

async function persistDomainAudit(args: {
  integrationId: string;
  userId: string;
  provider: MailboxProvider;
  audit: MailDomainAudit;
}) {
  const payload = {
    integration_id: args.integrationId,
    user_id: args.userId,
    provider: args.provider,
    account_email: args.audit.email,
    dns_status: args.audit.warnings.length === 0 ? "pass" : "warning",
    spf_status: args.audit.spf,
    dkim_status: args.audit.dkim,
    dmarc_status: args.audit.dmarc,
    dns_checked_at: args.audit.checkedAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("mailbox_reputation_state")
    .upsert(payload, { onConflict: "integration_id" });
  if (error && !reputationTableMissing(error)) throw error;
}

export async function resolveMailboxReputationPolicy(args: {
  userId: string;
  integrationId: string;
  provider?: string | null;
  accountEmail?: string | null;
  settings?: Record<string, unknown> | null;
  forceDnsRefresh?: boolean;
}): Promise<MailboxReputationPolicy> {
  let provider = normalizeProvider(args.provider);
  let accountEmail = String(args.accountEmail || "").trim() || null;
  let settings = args.settings || null;

  if (!accountEmail || !args.provider) {
    const { data, error } = await supabaseAdmin
      .from("integrations")
      .select("account_email,provider,settings")
      .eq("id", args.integrationId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (error) throw error;
    provider = args.provider ? provider : normalizeProvider((data as any)?.provider);
    accountEmail = accountEmail || String((data as any)?.account_email || "").trim() || null;
    settings = settings || ((data as any)?.settings && typeof (data as any).settings === "object" ? (data as any).settings : null);
  }

  let row = await loadReputationRow(args.integrationId);
  let domainAudit = accountEmail ? auditFromRow(accountEmail, row) : null;
  const dnsExpired = !domainAudit || Date.now() - Date.parse(domainAudit.checkedAt) > 24 * 60 * 60_000;

  if (accountEmail && (args.forceDnsRefresh || dnsExpired)) {
    domainAudit = await auditMailDomainAuthentication({ email: accountEmail, provider, settings });
    await persistDomainAudit({ integrationId: args.integrationId, userId: args.userId, provider, audit: domainAudit });
    row = (await loadReputationRow(args.integrationId)) || row;
  }

  const healthStatus = (["warming", "healthy", "watch", "paused"].includes(String(row?.health_status || ""))
    ? String(row?.health_status)
    : "warming") as MailboxHealthStatus;
  const pausedUntil = row?.paused_until ? String(row.paused_until) : null;
  const pausedByTime = Boolean(pausedUntil && Date.parse(pausedUntil) > Date.now());
  const blocked = healthStatus === "paused" && (!pausedUntil || pausedByTime);
  const effectiveHealthStatus: MailboxHealthStatus = healthStatus === "paused" && !blocked ? "watch" : healthStatus;
  const adaptive = buildAdaptiveMailboxConfig({
    provider,
    healthStatus: effectiveHealthStatus,
    acceptedCount: Number(row?.accepted_count || 0),
    consecutiveFailures: Number(row?.consecutive_failures || 0),
    domainAudit,
  });

  return {
    config: adaptive.config,
    healthStatus: effectiveHealthStatus,
    accountEmail,
    domainAudit,
    blocked,
    blockedReason: blocked
      ? "La réputation de cette boîte nécessite une vérification avant de reprendre les campagnes."
      : null,
    resumeAt: pausedUntil,
    mode: blocked ? "paused" : adaptive.mode,
  };
}

export type MailboxOutcome = "accepted" | "temporary_failure" | "hard_bounce" | "complaint" | "account_blocked";

export async function recordMailboxReputationOutcome(args: {
  integrationId: string;
  userId: string;
  provider: MailboxProvider;
  accountEmail?: string | null;
  outcome: MailboxOutcome;
  errorKind?: string | null;
}) {
  const { error } = await supabaseAdmin.rpc("record_mailbox_reputation_outcome", {
    p_integration_id: args.integrationId,
    p_user_id: args.userId,
    p_provider: args.provider,
    p_account_email: args.accountEmail || null,
    p_outcome: args.outcome,
    p_error_kind: args.errorKind || null,
  });
  if (error && !reputationTableMissing(error) && String((error as any)?.code || "") !== "PGRST202") {
    throw error;
  }
}
