import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { asRecord, asString } from "@/lib/tsSafe";
import { listAccessibleFacebookPages } from "@/lib/metaBusinessAssets";

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("status,access_token_enc,meta")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .eq("source", "instagram")
    .eq("product", "instagram")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (rows?.[0] as unknown) ?? null;
  const rowRec = asRecord(row);
  const metaRec = asRecord(rowRec["meta"]);
  const tokRaw = String(asString(metaRec["user_access_token_enc"]) || rowRec["access_token_enc"] || "");
  const tok = tryDecryptToken(tokRaw);
  if (!tok) return NextResponse.json({ error: "Compte Instagram non connecté." }, { status: 400 });

  const pages = await listAccessibleFacebookPages(tok);
  const accounts = pages
    .filter((page) => page.instagram_business_account?.id)
    .map((page) => ({
      page_id: page.id,
      page_name: page.name || null,
      ig_id: page.instagram_business_account?.id || "",
      username: page.instagram_business_account?.username || "",
      page_access_token: page.access_token || null,
      source: page.source,
      business_name: page.business_name || null,
    }));

  return NextResponse.json({ accounts });
}
