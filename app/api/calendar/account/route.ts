import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
export async function GET() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;
const { data, error } = await supabase
    .from("integrations")
    .select("id,provider,email_address,display_name,status,created_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("category", "calendar")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ account: data?.[0] ?? null });
}
