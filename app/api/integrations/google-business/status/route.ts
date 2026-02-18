import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getGoogleTokenForAnyGoogle } from "@/lib/googleStats";
import { testGmbConnectivity } from "@/lib/googleBusiness";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user)
    return NextResponse.json({ connected: false, accountConnected: false, configured: false });

  try {
    // Source of truth: the integration row itself.
    const { data } = await supabase
      .from("integrations")
      .select("id,status,resource_id,resource_label,email_address,display_name")
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb")
      .maybeSingle();

    // We separate:
    // - accountConnected: OAuth token exists (the Google account is connected)
    // - configured: a specific Business Profile location has been selected
    // For the dashboard bubble, "connected" must mean "ready to fetch stats".
    const accountConnected = !!data && (data as any).status === "connected";
    const configured = accountConnected && !!(data as any)?.resource_id;
    const connected = configured;

    if (!accountConnected) {
      return NextResponse.json({ connected: false, accountConnected: false, configured: false });
    }

    // Best-effort connectivity check (do not fail the UI if quota/API disabled)
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
      connected,
      accountConnected,
      configured,
      accountsCount,
      email: (data as any)?.email_address ?? null,
      displayName: (data as any)?.display_name ?? null,
      resource_id: (data as any)?.resource_id ?? null,
      resource_label: (data as any)?.resource_label ?? null,
    });
  } catch {
    return NextResponse.json({ connected: false, accountConnected: false, configured: false });
  }
}
