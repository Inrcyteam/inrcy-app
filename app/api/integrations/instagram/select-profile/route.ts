import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { tryDecryptToken, encryptToken } from "@/lib/oauthCrypto";
import { invalidateUserIntegrationCaches, mergeProToolSettings } from "@/lib/integrationSync";
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

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const bodyRec = asRecord(body);
  const pageId = String(bodyRec["pageId"] || "");
  if (!pageId) return NextResponse.json({ error: "Missing pageId" }, { status: 400 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("access_token_enc,id,meta")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const rowRec = asRecord((rows?.[0] as unknown) ?? null);
  const prevMeta = asRecord(rowRec["meta"]);
  const userTokenRaw = String(rowRec["access_token_enc"] || "");
  const userToken = tryDecryptToken(userTokenRaw) || "";
  if (!userToken) return NextResponse.json({ error: "Instagram account not connected" }, { status: 400 });

  const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
    fields: "id,name,access_token",
    access_token: userToken,
  }).toString()}`;
  const pagesResp = await fetchJson<{ data?: Array<{ id: string; name?: string; access_token?: string }> }>(pagesUrl);
  const page = (pagesResp.data || []).find((p) => p.id === pageId);
  if (!page?.access_token) return NextResponse.json({ error: "Page introuvable ou token manquant" }, { status: 400 });

  const infoUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}?${new URLSearchParams({
    fields: "instagram_business_account{username,id}",
    access_token: userToken,
  }).toString()}`;
  const info = await fetchJson<unknown>(infoUrl);
  const ig = asRecord(asRecord(info)["instagram_business_account"]);
  const igId = String(asString(ig["id"]) || "");
  const username = String(asString(ig["username"]) || "");
  if (!igId) return NextResponse.json({ error: "Aucun Instagram Business relié à cette page" }, { status: 400 });

  const nextMeta = { ...prevMeta, page_id: pageId, page_name: page.name || null, picked: "selected", user_access_token_enc: userTokenRaw };

  const { error: updateErr } = await supabase
    .from("integrations")
    .update({
      status: "connected",
      resource_id: igId,
      resource_label: username || null,
      access_token_enc: encryptToken(page.access_token),
      meta: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram");

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await invalidateUserIntegrationCaches(supabase, user.id);
  const profileUrl = username ? `https://www.instagram.com/${username}/` : null;

  try {
    await mergeProToolSettings(supabase, user.id, "instagram", {
      accountConnected: true,
      connected: true,
      username: username || null,
      url: profileUrl,
      pageId,
      igId,
    });
  } catch {}

  return NextResponse.json({ ok: true, username: username || null, profileUrl });
}
