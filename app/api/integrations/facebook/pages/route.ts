import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { tryDecryptToken } from "@/lib/oauthCrypto";
import { asRecord, asString } from "@/lib/tsSafe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { extractFacebookUserTokens, listAccessibleFacebookPagesFromTokens } from "@/lib/metaBusinessAssets";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

    const userId = auth.user.id;

    const { data: integ, error: integErr } = await supabaseAdmin
      .from("integrations")
      .select("access_token_enc,status,meta")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("source", "facebook")
      .eq("product", "facebook")
      .maybeSingle();

    if (integErr) return NextResponse.json({ error: "Impossible de récupérer la connexion Facebook pour le moment." }, { status: 500 });
    if (!integ || (integ.status !== "connected" && integ.status !== "account_connected") || !integ.access_token_enc) {
      return NextResponse.json({ error: "Compte Facebook non connecté." }, { status: 400 });
    }

    const integRec = asRecord(integ);
    const metaRec = asRecord(integRec["meta"]);
    const encryptedTokens = extractFacebookUserTokens(metaRec, asString(integRec["access_token_enc"]) || null);
    const userTokens = encryptedTokens.map((raw) => tryDecryptToken(raw)).filter((v): v is string => !!v);
    if (!userTokens.length) return NextResponse.json({ error: "La connexion Facebook doit être relancée pour récupérer vos pages." }, { status: 400 });

    const pages = await listAccessibleFacebookPagesFromTokens(userTokens);
    return NextResponse.json({ pages });
  } catch (e: unknown) {
    return jsonUserFacingError(e, { status: 500 });
  }
}
