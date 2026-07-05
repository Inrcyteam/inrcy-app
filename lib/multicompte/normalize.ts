import type { InrcyAccountRole, InrcyAccountSummary, InrcyMultiAccountConfig } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function normalizeAccountRole(value: unknown): InrcyAccountRole {
  return value === "admin" || value === "member" || value === "owner" ? value : "member";
}

function normalizeDisplayName(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

export function normalizeAccountSummary(row: Record<string, unknown>, fallbackId: string): InrcyAccountSummary {
  const account = row.inrcy_accounts && typeof row.inrcy_accounts === "object" && !Array.isArray(row.inrcy_accounts)
    ? row.inrcy_accounts as Record<string, unknown>
    : {};
  const id = typeof row.account_id === "string" ? row.account_id : fallbackId;

  return {
    id,
    displayName: normalizeDisplayName(account.display_name, "Établissement principal"),
    role: normalizeAccountRole(row.role),
    isDefault: row.is_default === true,
  };
}

export function normalizeMultiAccountConfig(row: Record<string, unknown> | null | undefined): InrcyMultiAccountConfig {
  const max = Number(row?.max_establishments);
  return {
    multiAccountEnabled: row?.multi_account_enabled === true,
    maxEstablishments: Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1,
  };
}

export function pickDefaultAccount(accounts: InrcyAccountSummary[], authUserId: string): InrcyAccountSummary {
  return (
    accounts.find((account) => account.isDefault) ||
    accounts.find((account) => account.id === authUserId) ||
    accounts[0] ||
    {
      id: authUserId,
      displayName: "Établissement principal",
      role: "owner",
      isDefault: true,
    }
  );
}

export function getAvailableEstablishmentSlots(
  config: InrcyMultiAccountConfig,
  accountCount: number,
) {
  if (!config.multiAccountEnabled) return 0;
  const safeCount = Number.isFinite(accountCount) ? Math.max(0, Math.floor(accountCount)) : 0;
  return Math.max(0, config.maxEstablishments - safeCount);
}
