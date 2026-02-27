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
    // Le trial est toujours un essai 30j côté app.
    // Le plan payant est choisi plus tard via le checkout.
    const _ignoredPlan = String(body?.plan || "Starter");

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
        // ✅ Pendant l'essai, plan = Trial et prix = 0
        plan: "Trial",
        status: "trialing",
        monthly_price_eur: 0,
        start_date: now.toISOString().slice(0, 10),
        contact_email: email,
        trial_start_at: now.toISOString(),
        trial_end_at: end.toISOString(),
        // marqueur utile si tu veux pré-sélectionner un pack plus tard
        scheduled_plan: null,
        updated_at: new Date().toISOString(),
      });

    return NextResponse.json({ ok: true, user_id: userId, trial_end_at: end.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
