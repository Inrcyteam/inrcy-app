import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { requireUser } from "@/lib/requireUser";

type ExportBlock = {
  table: string;
  rows: any[];
  error?: string;
};

async function fetchUserTable(
  supabase: any,
  table: string,
  userId: string,
  opts?: { limit?: number; orderBy?: string; desc?: boolean }
): Promise<ExportBlock> {
  try {
    let q = supabase.from(table).select("*").eq("user_id", userId);
    if (opts?.orderBy) q = q.order(opts.orderBy, { ascending: !opts.desc });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) return { table, rows: [], error: error.message };
    return { table, rows: data ?? [] };
  } catch (e: any) {
    return { table, rows: [], error: e?.message || "unknown" };
  }
}

export const GET = withApi(async () => {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  // Minimal set: add more tables if/when schema evolves.
  const tables: Array<{ table: string; opts?: { limit?: number; orderBy?: string; desc?: boolean } }> = [
    { table: "profiles" },
    { table: "business_profiles" },
    { table: "integrations" },
    { table: "doc_saves", opts: { limit: 5000, orderBy: "created_at", desc: true } },
    { table: "stats_cache", opts: { limit: 5000, orderBy: "created_at", desc: true } },
    { table: "agenda_events", opts: { limit: 1000, orderBy: "start_at" } },
    { table: "crm_contacts", opts: { limit: 5000, orderBy: "created_at", desc: true } },
    { table: "send_items", opts: { limit: 5000, orderBy: "created_at", desc: true } },
    { table: "subscriptions" },
    { table: "loyalty_ledger", opts: { limit: 5000, orderBy: "created_at", desc: true } },
    { table: "loyalty_balance" },
    { table: "boutique_orders", opts: { limit: 2000, orderBy: "created_at", desc: true } },
    { table: "inrcy_site_configs" },
    { table: "pro_tools_configs" },
    { table: "publications", opts: { limit: 2000, orderBy: "created_at", desc: true } },
    { table: "publication_deliveries", opts: { limit: 5000, orderBy: "created_at", desc: true } },
    { table: "site_articles", opts: { limit: 5000, orderBy: "created_at", desc: true } },
    // app_events can be very large; keep a bounded recent slice.
    { table: "app_events", opts: { limit: 2000, orderBy: "created_at", desc: true } },
  ];

  const blocks = await Promise.all(tables.map((t) => fetchUserTable(supabase, t.table, user.id, t.opts)));

  const payload = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email ?? null,
      created_at: (user as any).created_at ?? null,
    },
    data: blocks,
  };

  const fname = `inrcy-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename=\"${fname}\"`,
      "cache-control": "no-store",
    },
  });
}, { route: "/api/account/export" });
