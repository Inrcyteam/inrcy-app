import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord } from "@/lib/tsSafe";

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
    (rows ?? []).map((r: Record<string, unknown>) => {
      const rr = asRecord(r);
      const settings = asRecord(rr["settings"]);
      return {
        id: rr["id"],
        provider: rr["provider"],
        email_address: rr["account_email"],
        display_name: settings["display_name"] ?? null,
        status: rr["status"],
        created_at: rr["created_at"],
      };
    }) ?? [];


  if (mailError) {
    return NextResponse.json({ error: mailError.message }, { status: 500 });
  }

  return NextResponse.json({
    mailAccounts: mailAccounts,
    limits: { maxMailAccounts: 4 },
  });
}
