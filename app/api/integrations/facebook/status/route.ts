import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord, asString } from "@/lib/tsSafe";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("integrations")
    .select("id,status,resource_id,resource_label,meta")
    .eq("user_id", authData.user.id)
    .eq("provider", "facebook")
    .eq("source", "facebook")
    .eq("product", "facebook")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 });
  }

  const rec = asRecord(data);
  const meta = asRecord(rec["meta"]);

  const status = asString(rec["status"]) ?? null;
  const accountConnected = status === "account_connected" || status === "connected";
  const pageConnected = status === "connected" && !!asString(rec["resource_id"]);

  return NextResponse.json({
    status,
    accountConnected,
    pageConnected,
    // Compat (ancien)
    connected: pageConnected,
    resource_id: asString(rec["resource_id"]) ?? null,
    resource_label: asString(rec["resource_label"]) ?? null,
    page_url: asString(meta["page_url"]) ?? null,
    user_email: asString(meta["user_email"]) ?? null,
    pages_found: meta["pages_found"] ?? null,
  });
}
