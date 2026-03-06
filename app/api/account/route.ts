import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function safeDeleteByUserId(table: string, userId: string) {
  try {
    const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
    return error ? error.message : null;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : "unknown";
  }
}

export const DELETE = withApi(async () => {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const userId = user.id;

  // Preferred path: a dedicated SQL function that knows the full schema.
  // If the function isn't deployed yet, we fall back to best-effort deletes.
  const errors: Record<string, string> = {};
  try {
    const { error: rpcErr } = await supabaseAdmin.rpc("delete_user_rgpd", { uid: userId });
    if (!rpcErr) {
      // Delete Supabase Auth user (revokes sessions).
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authErr) errors["auth"] = authErr.message;

      // Sign out local session cookies (best-effort).
      try {
        await supabase.auth.signOut();
      } catch {
        // no-op
      }

      if (Object.keys(errors).length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Suppression partielle. Certaines opérations n'ont pas pu être terminées automatiquement.",
            details: errors,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }
    errors["rpc_delete_user_rgpd"] = rpcErr.message;
  } catch (e: unknown) {
    errors["rpc_delete_user_rgpd"] = e instanceof Error ? e.message : "unknown";
  }

  // Best-effort deletion. Order reduces FK constraint issues.
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

  // Delete Supabase Auth user (revokes sessions).
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) errors["auth"] = authErr.message;

  // Sign out local session cookies (best-effort).
  try {
    await supabase.auth.signOut();
  } catch {
    // no-op
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Suppression partielle. Certaines données n'ont pas pu être supprimées automatiquement.",
        details: errors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}, { route: "/api/account" });
