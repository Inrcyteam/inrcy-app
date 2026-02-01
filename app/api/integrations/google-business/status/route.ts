import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getGoogleTokenForAnyGoogle } from "@/lib/googleStats";
import { testGmbConnectivity } from "@/lib/googleBusiness";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ connected: false });

  try {
    const tok = await getGoogleTokenForAnyGoogle("gmb", "gmb");
    if (!tok?.accessToken) return NextResponse.json({ connected: false });

    const t = await testGmbConnectivity(tok.accessToken);
    return NextResponse.json({ connected: !!t.connected, accountsCount: t.accountsCount });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
