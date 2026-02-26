import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireEnv } from "@/lib/env";
import { getAppUrl } from "@/lib/stripeRest";

export const runtime = "nodejs";

/**
 * Admin endpoint to create a 30-day trial user + subscription row.
 * Protect with ADMIN_SECRET.
 */
export async function POST(req: Request) {
  try {
    const secret = requireEnv("ADMIN_SECRET");
    const got = req.headers.get("x-admin-secret") || "";
    if (got !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const plan = String(body?.plan || "Démarrage");

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const appUrl = getAppUrl(req) || requireEnv("NEXT_PUBLIC_APP_URL");

    // Send Supabase invite email (user sets password)
    const { data: invite, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/set-password?mode=invite`,
    });

    if (invErr) throw new Error(invErr.message);

    const userId = invite.user.id;
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    // Ensure subscriptions row
    await supabaseAdmin
      .from("subscriptions")
      .upsert({
        user_id: userId,
        plan,
        status: "essai",
        monthly_price_eur: 69,
        start_date: now.toISOString().slice(0, 10),
        contact_email: email,
        trial_start_at: now.toISOString(),
        trial_end_at: end.toISOString(),
        updated_at: new Date().toISOString(),
      });

    return NextResponse.json({ ok: true, user_id: userId, trial_end_at: end.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
