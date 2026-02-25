import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { asRecord, asString } from "@/lib/tsSafe";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const rec = asRecord(data);
    const err = asRecord(rec["error"]);
    throw new Error(asString(err["message"]) || `HTTP ${res.status}`);
  }
  return data as T;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("status,access_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (rows?.[0] as unknown) ?? null;
  const rowRec = asRecord(row);
  const tokRaw = String(rowRec["access_token_enc"] || "");
  const tok = tryDecryptToken(tokRaw);
  if (!tok) return NextResponse.json({ error: "Instagram account not connected" }, { status: 400 });

  const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
    fields: "id,name,access_token",
    access_token: tok,
  }).toString()}`;

  const pagesResp = await fetchJson<{ data?: Array<{ id: string; name?: string; access_token?: string }> }>(pagesUrl);
  const pages = pagesResp.data || [];

  const accounts = await Promise.all(
    pages.map(async (p) => {
      try {
        const infoUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(p.id)}?${new URLSearchParams({
          fields: "instagram_business_account{username,id}",
          access_token: tok,
        }).toString()}`;
        const info = await fetchJson<unknown>(infoUrl);
        const infoRec = asRecord(info);
        const ig = asRecord(infoRec["instagram_business_account"]);
        const igId = asString(ig["id"]);
        if (!igId) return null;
        return {
          page_id: p.id,
          page_name: p.name || null,
          ig_id: igId,
          username: String(asString(ig["username"]) || ""),
          page_access_token: p.access_token || null,
        };
      } catch {
        return null;
      }
    })
  );

  const filtered = accounts.filter(Boolean);
  return NextResponse.json({ accounts: filtered });
}