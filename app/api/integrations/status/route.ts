import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data: rows, error: mailError } = await supabase
    .from("integrations")
    .select("id, provider, account_email, settings, status, created_at")
    .eq("user_id", userId)
    .eq("category", "mail")
    .order("created_at", { ascending: true });

  const mailAccounts =
    (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      provider: r.provider,
      email_address: r.account_email,
      display_name: r.settings?.display_name ?? null,
      status: r.status,
      created_at: r.created_at,
    })) ?? [];


  if (mailError) {
    return NextResponse.json({ error: mailError.message }, { status: 500 });
  }

  return NextResponse.json({
    mailAccounts: mailAccounts,
    limits: { maxMailAccounts: 4 },
  });
}
