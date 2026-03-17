import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DeleteResult = {
  ok: boolean;
  mode: "rpc" | "fallback";
  details: Record<string, string>;
};

async function safeDeleteByUserId(table: string, userId: string) {
  try {
    const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
    return error ? error.message : null;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : "unknown";
  }
}

export async function deleteUserAccountEverywhere(userId: string): Promise<DeleteResult> {
  const errors: Record<string, string> = {};

  try {
    const { error: rpcErr } = await supabaseAdmin.rpc("delete_user_rgpd", { uid: userId });
    if (!rpcErr) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authErr) errors["auth"] = authErr.message;
      return { ok: Object.keys(errors).length === 0, mode: "rpc", details: errors };
    }
    errors["rpc_delete_user_rgpd"] = rpcErr.message;
  } catch (e: unknown) {
    errors["rpc_delete_user_rgpd"] = e instanceof Error ? e.message : "unknown";
  }

  const tablesInOrder = [
    "publication_deliveries",
    "publications",
    "site_articles",
    "doc_saves",
    "boutique_orders",
    "send_items",
    "crm_contacts",
    "agenda_events",
    "integrations",
    "pro_tools_configs",
    "inrcy_site_configs",
    "business_profiles",
    "stats_cache",
    "loyalty_ledger",
    "loyalty_balance",
    "subscriptions",
    "app_events",
    "profiles",
  ] as const;

  for (const table of tablesInOrder) {
    const err = await safeDeleteByUserId(table, userId);
    if (err) errors[table] = err;
  }

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) errors["auth"] = authErr.message;

  return { ok: Object.keys(errors).length === 0, mode: "fallback", details: errors };
}
