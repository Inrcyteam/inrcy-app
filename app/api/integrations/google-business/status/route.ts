import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getGoogleTokenForAnyGoogle } from "@/lib/googleStats";
import { testGmbConnectivity } from "@/lib/googleBusiness";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ connected: false });

  try {
    // Source of truth: the integration row itself.
    // We still try a live API call, but we NEVER mark the integration "disconnected"
    // just because the Business APIs are not enabled / user has no accounts yet.
    const { data } = await supabase
      .from("stats_integrations")
      .select("id,status,resource_id,resource_label,email_address,display_name")
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb")
      .maybeSingle();

    const dbConnected = !!data && (data as any).status === "connected";
    if (!dbConnected) return NextResponse.json({ connected: false });

    // Best-effort connectivity check
    let accountsCount: number | null = null;
    try {
      const tok = await getGoogleTokenForAnyGoogle("gmb", "gmb");
      if (tok?.accessToken) {
        const t = await testGmbConnectivity(tok.accessToken);
        accountsCount = t.accountsCount;
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      connected: true,
      accountsCount,
      email: (data as any)?.email_address ?? null,
      displayName: (data as any)?.display_name ?? null,
      resource_id: (data as any)?.resource_id ?? null,
      resource_label: (data as any)?.resource_label ?? null,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
