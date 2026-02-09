import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

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
      .from("stats_integrations")
      .select("access_token_enc,status")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (integErr) return NextResponse.json({ error: "DB error" }, { status: 500 });
    if (!integ || integ.status !== "connected" || !integ.access_token_enc) {
      return NextResponse.json({ error: "Facebook non connecté" }, { status: 400 });
    }

    // access_token_enc may be a user token or already a page token.
    // We try /me/accounts: works only with user token that has pages_show_list.
    const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token",
      access_token: String(integ.access_token_enc),
    }).toString()}`;

    const resp = await fetchJson<{ data?: FbPage[] }>(pagesUrl);
    const pages = (resp.data || []).filter((p) => p?.id);

    return NextResponse.json({ pages });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
