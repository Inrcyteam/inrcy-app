import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
/**
 * Déconnecte un compte Gmail (supprime la ligne mail_accounts).
 * Le front passe { accountId }.
 */
export async function POST(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;
const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();

  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  const { error } = await supabase
    .from("mail_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("provider", "gmail");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
