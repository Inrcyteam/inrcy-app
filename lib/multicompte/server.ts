import "server-only";

import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { ACTIVE_INRCY_ACCOUNT_COOKIE } from "./constants";
import { isUuidLike, normalizeAccountSummary, normalizeMultiAccountConfig, pickDefaultAccount } from "./normalize";
import type { InrcyAccountScope, InrcyAccountSummary, InrcyMultiAccountConfig } from "./types";

type SupabaseLike = {
  from: (table: string) => any;
};

async function readRequestedActiveAccountId() {
  const cookieStore = await cookies();
  const value = cookieStore.get(ACTIVE_INRCY_ACCOUNT_COOKIE)?.value || null;
  return isUuidLike(value) ? value : null;
}

export async function listAccessibleInrcyAccounts(supabase: SupabaseLike, authUserId: string): Promise<InrcyAccountSummary[]> {
  const { data, error } = await supabase
    .from("inrcy_account_members")
    .select("account_id, role, is_default, inrcy_accounts!inner(display_name)")
    .eq("auth_user_id", authUserId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`INRCY_ACCOUNT_SCOPE_UNAVAILABLE:${error.message || "membership_query_failed"}`);
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

export async function getInrcyMultiAccountConfig(supabase: SupabaseLike, authUserId: string): Promise<InrcyMultiAccountConfig> {
  const { data } = await supabase
    .from("inrcy_multi_account_config")
    .select("multi_account_enabled, max_establishments")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  return normalizeMultiAccountConfig(data as Record<string, unknown> | null | undefined);
}

export function resolveActiveInrcyAccount(
  authUserId: string,
  accounts: InrcyAccountSummary[],
  requestedAccountId?: string | null,
): InrcyAccountSummary {
  if (requestedAccountId) {
    const requested = accounts.find((account) => account.id === requestedAccountId);
    if (requested) return requested;
  }

  return pickDefaultAccount(accounts, authUserId);
}



export async function resolveOAuthBoundInrcyAccountId(
  supabase: SupabaseLike,
  authUserId: string,
  stateAccountId?: unknown,
): Promise<string> {
  // Backward compatibility for an OAuth flow started just before Step 6 deployment.
  // New flows always include accountId in the state.
  if (typeof stateAccountId !== "string" || !isUuidLike(stateAccountId)) {
    return resolveActiveInrcyAccountId(supabase, authUserId);
  }

  const { data, error } = await supabase
    .from("inrcy_account_members")
    .select("account_id")
    .eq("auth_user_id", authUserId)
    .eq("account_id", stateAccountId)
    .maybeSingle();

  if (error) {
    throw new Error(`INRCY_ACCOUNT_SCOPE_UNAVAILABLE:${error.message || "oauth_membership_query_failed"}`);
  }
  if (!data) {
    throw new Error("INRCY_ACCOUNT_ACCESS_DENIED");
  }

  return stateAccountId;
}

export async function resolveActiveInrcyAccountId(supabase: SupabaseLike, authUserId: string): Promise<string> {
  const [accounts, requestedAccountId] = await Promise.all([
    listAccessibleInrcyAccounts(supabase, authUserId),
    readRequestedActiveAccountId(),
  ]);

  return resolveActiveInrcyAccount(authUserId, accounts, requestedAccountId).id;
}

export async function resolveInrcyAccountScopeForUser(supabase: SupabaseLike, user: User): Promise<InrcyAccountScope> {
  const [accounts, config, requestedAccountId] = await Promise.all([
    listAccessibleInrcyAccounts(supabase, user.id),
    getInrcyMultiAccountConfig(supabase, user.id),
    readRequestedActiveAccountId(),
  ]);

  const activeAccount = resolveActiveInrcyAccount(user.id, accounts, requestedAccountId);

  return {
    authUserId: user.id,
    activeUserId: activeAccount.id,
    activeAccount,
    accounts,
    config,
  };
}

export async function getCurrentInrcyAccountScope(): Promise<{ supabase: Awaited<ReturnType<typeof createSupabaseServer>>; user: User; scope: InrcyAccountScope } | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const scope = await resolveInrcyAccountScopeForUser(supabase, data.user);
  return { supabase, user: data.user, scope };
}
