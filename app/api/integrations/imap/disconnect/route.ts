import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  const activeUserId = await resolveActiveInrcyAccountId(supabase, userData.user.id);

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();
  if (!accountId) return NextResponse.json({ error: "Identifiant de compte manquant." }, { status: 400 });

  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("id", accountId)
    .eq("user_id", activeUserId)
    .eq("provider", "imap")
    .eq("category", "mail");

  if (error) return jsonUserFacingError(error, { status: 500 });
  return NextResponse.json({ ok: true });
}
