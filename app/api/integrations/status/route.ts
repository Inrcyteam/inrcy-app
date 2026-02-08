import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data: mailAccounts, error: mailError } = await supabase
    .from("mail_accounts")
    .select("id, provider, email_address, display_name, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (mailError) {
    return NextResponse.json({ error: mailError.message }, { status: 500 });
  }

  const { data: messengerAccount, error: msgError } = await supabase
    .from("messenger_accounts")
    .select("id, page_id, page_name, status, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  return NextResponse.json({
    mailAccounts: mailAccounts ?? [],
    messengerAccount: messengerAccount ?? null,
    limits: { maxMailAccounts: 4 },
  });
}
