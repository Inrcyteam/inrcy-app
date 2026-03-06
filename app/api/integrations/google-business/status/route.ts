import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getGoogleTokenForAnyGoogle } from "@/lib/googleStats";
import { testGmbConnectivity } from "@/lib/googleBusiness";
import { asRecord, asString } from "@/lib/tsSafe";

function isExpired(expiresAt: unknown, skewSeconds = 60) {
  const iso = asString(expiresAt);
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user)
    return NextResponse.json({ connected: false, accountConnected: false, configured: false });

  try {
    // Source of truth: the integration row itself.
    const { data } = await supabase
      .from("integrations")
      .select("id,status,resource_id,resource_label,account_email,display_name,access_token_enc,expires_at")
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .eq("source", "gmb")
      .eq("product", "gmb")
      .maybeSingle();

    // We separate:
    // - accountConnected: OAuth token exists (the Google account is connected)
    // - configured: a specific Business Profile location has been selected
    // For the dashboard bubble, "connected" must mean "ready to fetch stats".
    const dataRec = asRecord(data);
    const expired = isExpired(dataRec["expires_at"]);
    const accountConnected = !!data && dataRec["status"] === "connected" && !!asString(dataRec["access_token_enc"]) && !expired;
    const configured = accountConnected && !!asString(dataRec["resource_id"]);
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
      email: asString(dataRec["account_email"]),
      displayName: asString(dataRec["display_name"]),
      resource_id: asString(dataRec["resource_id"]),
      resource_label: asString(dataRec["resource_label"]),
    });
  } catch {
    return NextResponse.json({ connected: false, accountConnected: false, configured: false });
  }
}