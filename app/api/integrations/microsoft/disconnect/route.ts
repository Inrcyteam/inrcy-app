import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * Déconnecte un compte Microsoft (provider = 'microsoft').
 * Payload: { accountId: string }
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const accountId = body?.accountId as string | undefined;
  if (!accountId) {
    return NextResponse.json({ error: "Identifiant de compte manquant." }, { status: 400 });
  }

  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("id", accountId)
    .eq("user_id", auth.user.id)
    .eq("provider", "microsoft")
    .eq("category", "mail");

  if (error) {
    return jsonUserFacingError(error, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
