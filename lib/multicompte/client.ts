"use client";

import { getActiveBrowserUserId, purgeAllBrowserAccountCaches, setActiveBrowserUserId } from "@/lib/browserAccountCache";
import { ACTIVE_INRCY_ACCOUNT_EVENT } from "./constants";
import { isUuidLike, normalizeAccountSummary, normalizeMultiAccountConfig, pickDefaultAccount } from "./normalize";
import type { InrcyAccountScope, InrcyAccountSummary } from "./types";

type SupabaseLike = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from: (table: string) => any;
};

export async function listMyInrcyAccounts(supabase: SupabaseLike, authUserId: string): Promise<InrcyAccountSummary[]> {
  const { data, error } = await supabase
    .from("inrcy_account_members")
    .select("account_id, role, is_default, inrcy_accounts!inner(display_name)")
    .eq("auth_user_id", authUserId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`INRCY_ACCOUNT_SCOPE_UNAVAILABLE:${String((error as { message?: unknown }).message || "membership_query_failed")}`);
  }
  if (!Array.isArray(data)) {
    throw new Error("INRCY_ACCOUNT_SCOPE_UNAVAILABLE:invalid_membership_payload");
  }

  const accounts = data
    .map((row: unknown) => normalizeAccountSummary(row as Record<string, unknown>, authUserId))
    .filter((account) => isUuidLike(account.id));

  if (accounts.length === 0) {
    throw new Error("INRCY_ACCOUNT_SCOPE_MISSING");
  }

  return accounts;
}

export async function getMyInrcyAccountScope(supabase: SupabaseLike): Promise<InrcyAccountScope | null> {
  const { data, error } = await supabase.auth.getUser();
  const authUser = data?.user;
  if (error || !authUser) return null;

  const [accounts, configResult] = await Promise.all([
    listMyInrcyAccounts(supabase, authUser.id),
    supabase
      .from("inrcy_multi_account_config")
      .select("multi_account_enabled, max_establishments")
      .eq("auth_user_id", authUser.id)
      .maybeSingle(),
  ]);

  const activeFromBrowser = getActiveBrowserUserId();
  const activeAccount = activeFromBrowser
    ? accounts.find((account) => account.id === activeFromBrowser) || pickDefaultAccount(accounts, authUser.id)
    : pickDefaultAccount(accounts, authUser.id);

  return {
    authUserId: authUser.id,
    activeUserId: activeAccount.id,
    activeAccount,
    accounts,
    config: normalizeMultiAccountConfig(configResult.data as Record<string, unknown> | null | undefined),
  };
}

export async function switchActiveInrcyAccount(accountId: string) {
  if (!isUuidLike(accountId)) {
    throw new Error("Établissement invalide.");
  }

  const response = await fetch("/api/multicompte/active-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });

  const payload = await response.json().catch(() => null) as { ok?: boolean; activeUserId?: string; error?: string } | null;

  if (!response.ok || !payload?.ok || !payload.activeUserId) {
    throw new Error(payload?.error || "Impossible de changer d’établissement.");
  }

  purgeAllBrowserAccountCaches();
  setActiveBrowserUserId(payload.activeUserId);
  window.dispatchEvent(new CustomEvent(ACTIVE_INRCY_ACCOUNT_EVENT, { detail: { activeUserId: payload.activeUserId } }));

  return payload.activeUserId;
}
