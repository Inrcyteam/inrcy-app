import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ connected: false }, { status: 401 });
  // Agenda iNrCy natif : pas de connexion externe requise.
  return NextResponse.json({ connected: true });
}
