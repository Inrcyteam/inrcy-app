import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { clearAllToolCaches } from "@/lib/statsCache";
import { tryDecryptToken, encryptToken } from "@/lib/oauthCrypto";
import { asRecord, asString } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

async function invalidateUserStatsCache(supabase: SupabaseServerClient, userId: string) {
  await clearAllToolCaches(supabase, userId);
}

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
    .select("access_token_enc,id")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (rows?.[0] as unknown) ?? null;
  const rowRec = asRecord(row);
  const userTokenRaw = String(rowRec["access_token_enc"] || "");
  const userToken = tryDecryptToken(userTokenRaw) || "";
  if (!userToken) return NextResponse.json({ error: "Instagram account not connected" }, { status: 400 });

  // Get pages + tokens
  const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
    fields: "id,name,access_token",
    access_token: userToken,
  }).toString()}`;
  const pagesResp = await fetchJson<{ data?: Array<{ id: string; name?: string; access_token?: string }> }>(pagesUrl);
  const page = (pagesResp.data || []).find((p) => p.id === pageId);
  if (!page?.access_token) return NextResponse.json({ error: "Page introuvable ou token manquant" }, { status: 400 });

  // Get IG business account
  const infoUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}?${new URLSearchParams({
    fields: "instagram_business_account{username,id}",
    access_token: userToken,
  }).toString()}`;
  const info = await fetchJson<unknown>(infoUrl);
  const infoRec = asRecord(info);
  const ig = asRecord(infoRec["instagram_business_account"]);
  const igId = String(asString(ig["id"]) || "");
  const username = String(asString(ig["username"]) || "");
  if (!igId) return NextResponse.json({ error: "Aucun Instagram Business relié à cette page" }, { status: 400 });

  // Update integration: now connected + store page token for publishing.
  // Use supabaseAdmin here because this route must persist the selected Instagram profile
  // even if RLS blocks the regular server client update. Also fail loudly if no row was updated.
  const { data: updatedRows, error: updateErr } = await supabaseAdmin
    .from("integrations")
    .update({
      status: "connected",
      resource_id: igId,
      resource_label: username || null,
      access_token_enc: encryptToken(page.access_token),
      expires_at: null,
      meta: { page_id: pageId, page_name: page.name || null },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .select("id,status,resource_id,resource_label");

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: "Aucune ligne Instagram mise à jour." }, { status: 500 });
  }

  // Invalidate stats cache so iNrStats + Generator reflect the new selection immediately.
  await invalidateUserStatsCache(supabase, user.id);

  const profileUrl = username ? `https://www.instagram.com/${username}/` : null;

  // Mirror in pro_tools_configs
  try {
    const { data: scRow } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const scRec = asRecord(scRow);
    const current = asRecord(scRec["settings"]);
    const currentIg = asRecord(current["instagram"]);
    const merged = {
      ...current,
      instagram: {
        ...currentIg,
        accountConnected: true,
        connected: true,
        username: username || null,
        url: profileUrl,
        pageId,
        igId,
      },
    };
    await supabaseAdmin.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
  } catch {}

  return NextResponse.json({ ok: true, username: username || null, profileUrl });
}