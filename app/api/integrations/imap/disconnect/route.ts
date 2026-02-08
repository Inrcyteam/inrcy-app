import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();
  if (!accountId) return NextResponse.json({ error: "accountId requis" }, { status: 400 });

  const { error } = await supabase
    .from("mail_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userData.user.id)
    .eq("provider", "imap");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
