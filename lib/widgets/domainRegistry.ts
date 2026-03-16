import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { asRecord } from "@/lib/tsSafe";

export type WidgetSource = "inrcy_site" | "site_web";

export function normalizeWidgetDomain(input: string | null): string {
  if (!input) return "";
  let raw = input.trim();
  try {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const u = new URL(raw);
    return (u.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0] || "";
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function readRegistry(
  supabase: SupabaseClient,
  domain: string,
  source: WidgetSource
): Promise<string | null> {
  const { data, error } = await supabase
    .from("widget_domain_registry")
    .select("user_id")
    .eq("source", source)
    .eq("domain", domain)
    .limit(1)
    .maybeSingle();

  if (error) {
    const msg = String((error as { message?: unknown }).message || error);
    if (
      msg.includes("widget_domain_registry") ||
      msg.includes("relation") ||
      msg.includes("does not exist")
    ) {
      return null;
    }
    throw error;
  }

  return (asRecord(data)["user_id"] as string | null) ?? null;
}

async function upsertRegistry(
  supabase: SupabaseClient,
  domain: string,
  source: WidgetSource,
  userId: string
) {
  try {
    await supabase
      .from("widget_domain_registry")
      .upsert(
        {
          domain,
          source,
          user_id: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source,domain" }
      );
  } catch {
    // best-effort only; endpoint should still work even if the registry
    // table hasn't been created yet.
  }
}

async function resolveInrcySiteUserId(supabase: SupabaseClient, domain: string) {
  const { data, error } = await supabase
    .from("inrcy_site_configs")
    .select("user_id, site_url")
    .ilike("site_url", `%${domain}%`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const userId = (asRecord(data)["user_id"] as string | null) ?? null;
  if (userId) await upsertRegistry(supabase, domain, "inrcy_site", userId);
  return userId;
}

async function resolveSiteWebUserId(supabase: SupabaseClient, domain: string) {
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("pro_tools_configs")
      .select("user_id, settings")
      .range(from, to);

    if (error) throw error;

    const rows = (data || []) as unknown[];
    if (!rows.length) return null;

    const match = rows.find((r) => {
      const rr = asRecord(r);
      const settings = asRecord(rr["settings"]);
      const siteWeb = asRecord(settings["site_web"]);
      const url = String(siteWeb["url"] ?? "");
      return normalizeWidgetDomain(url) === domain;
    });

    if (match) {
      const userId = (asRecord(match)["user_id"] as string | null) ?? null;
      if (userId) await upsertRegistry(supabase, domain, "site_web", userId);
      return userId;
    }

    if (rows.length < pageSize) return null;
    from += pageSize;
  }
}

export async function resolveWidgetUserIdFromDomain(
  domainInput: string,
  source: WidgetSource
): Promise<string | null> {
  const domain = normalizeWidgetDomain(domainInput);
  if (!domain) return null;

  const supabase = getSupabaseAdmin();

  const registryUserId = await readRegistry(supabase, domain, source);
  if (registryUserId) return registryUserId;

  if (source === "inrcy_site") {
    return resolveInrcySiteUserId(supabase, domain);
  }

  return resolveSiteWebUserId(supabase, domain);
}
