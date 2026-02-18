import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
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
  const pageId = String(body?.pageId || "");
  if (!pageId) return NextResponse.json({ error: "Missing pageId" }, { status: 400 });

  const { data: row } = await supabase
    .from("integrations")
    .select("access_token_enc,id")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .maybeSingle();

  const userToken = String((row as any)?.access_token_enc || "");
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
  const info = await fetchJson<any>(infoUrl);
  const ig = info?.instagram_business_account;
  const igId = String(ig?.id || "");
  const username = String(ig?.username || "");
  if (!igId) return NextResponse.json({ error: "Aucun Instagram Business relié à cette page" }, { status: 400 });

  // Update integration: now connected + store page token for publishing
  await supabase
    .from("integrations")
    .update({
      status: "connected",
      resource_id: igId,
      resource_label: username || null,
      access_token_enc: page.access_token,
      meta: { page_id: pageId, page_name: page.name || null },
    })
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram");

  const profileUrl = username ? `https://www.instagram.com/${username}/` : null;

  // Mirror in pro_tools_configs
  try {
    const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
    const current = (scRow as any)?.settings ?? {};
    const merged = {
      ...current,
      instagram: {
        ...(current?.instagram ?? {}),
        accountConnected: true,
        connected: true,
        username: username || null,
        url: profileUrl,
        pageId,
        igId,
      },
    };
    await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: merged }, { onConflict: "user_id" });
  } catch {}

  return NextResponse.json({ ok: true, username: username || null, profileUrl });
}
