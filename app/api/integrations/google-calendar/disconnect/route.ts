import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * Déconnecte un compte Google Calendar (supprime la ligne dans integrations).
 * Le front passe { accountId }.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();

  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("id", accountId)
    .eq("user_id", auth.user.id)
    .eq("provider", "google")
    .eq("category", "calendar");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
