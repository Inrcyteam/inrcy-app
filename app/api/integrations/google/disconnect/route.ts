import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revokeGoogleTokensBestEffort } from "@/lib/googleOAuthRevoke";
/**
 * Déconnecte un compte Gmail (supprime la ligne integrations).
 * Le front passe { accountId }.
 */
export async function POST(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;
const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();

  if (!accountId) return NextResponse.json({ error: "Identifiant de compte manquant." }, { status: 400 });

  const { data: rowToRevoke } = await supabaseAdmin
    .from("integrations")
    .select("id,access_token_enc,refresh_token_enc")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .eq("category", "mail")
    .maybeSingle();

  await revokeGoogleTokensBestEffort({
    integrationId: String((rowToRevoke as any)?.id || ""),
    accessTokenEnc: (rowToRevoke as any)?.access_token_enc || null,
    refreshTokenEnc: (rowToRevoke as any)?.refresh_token_enc || null,
    context: "gmail_disconnect",
  });

  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .eq("category", "mail");

  if (error) {
    return jsonUserFacingError(error, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}