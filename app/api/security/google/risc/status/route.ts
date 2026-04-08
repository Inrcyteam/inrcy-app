import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { asRecord } from "@/lib/tsSafe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data } = await supabaseAdmin
    .from("integrations")
    .select("source,product,meta")
    .eq("user_id", user.id)
    .in("provider", ["google", "gmail"]);

  const result = {
    site_inrcy: { ga4: false, gsc: false },
    site_web: { ga4: false, gsc: false },
    gmb: false,
    gmail: false,
  };

  for (const row of data || []) {
    const rec = asRecord(row);
    const source = String(rec["source"] || "");
    const product = String(rec["product"] || "");
    const meta = asRecord(rec["meta"]);
    const reauth = Boolean(asRecord(meta["risc"])["reauth_required"]);
    if (!reauth) continue;

    if ((source === "site_inrcy" || source === "site_web") && (product === "ga4" || product === "gsc")) {
      (result as any)[source][product] = true;
    } else if (source === "gmb" && product === "gmb") {
      result.gmb = true;
    } else if (product === "gmail") {
      result.gmail = true;
    }
  }

  return NextResponse.json({ ok: true, reauth: result });
}
