import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { tryDecryptToken } from "@/lib/oauthCrypto";

type FbPage = { id: string; name?: string; access_token?: string };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data as T;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    const { data: integ, error: integErr } = await supabase
      .from("integrations")
      .select("access_token_enc,status,meta")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (integErr) return NextResponse.json({ error: "DB error" }, { status: 500 });
    if (!integ || (integ.status !== "connected" && integ.status !== "account_connected") || !integ.access_token_enc) {
      return NextResponse.json({ error: "Facebook non connecté" }, { status: 400 });
    }

    // access_token_enc may be a PAGE token after selection.
    // For /me/accounts we need the USER token (stored in meta.user_access_token).
    const userTokenRaw = String((integ as any)?.meta?.user_access_token_enc || (integ as any)?.meta?.user_access_token || integ.access_token_enc || "").trim();
    const userToken = tryDecryptToken(userTokenRaw);
    if (!userToken) return NextResponse.json({ error: "Facebook token manquant" }, { status: 400 });

    const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token",
      access_token: userToken,
    }).toString()}`;

    const resp = await fetchJson<{ data?: FbPage[] }>(pagesUrl);
    const pages = (resp.data || []).filter((p) => p?.id);

    return NextResponse.json({ pages });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
