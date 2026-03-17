import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { optionalEnv, requireEnv } from "@/lib/env";
import { getAppUrl } from "@/lib/stripeRest";
import { sendAdminSubscriptionAlertForUser } from "@/lib/subscriptionAdmin";

export const runtime = "nodejs";

/**
 * Admin endpoint to create a trial user + subscription row.
 * Protect with ADMIN_SECRET.
 */
export async function POST(req: Request) {
  try {
    const secret = requireEnv("ADMIN_SECRET");
    const got = req.headers.get("x-admin-secret") || "";
    if (got !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const trialDays = Math.max(1, Number(optionalEnv("INRCY_TRIAL_DAYS", "30")) || 30);

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const appUrl = getAppUrl(req) || requireEnv("NEXT_PUBLIC_APP_URL");

    const { data: invite, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/set-password?mode=invite`,
    });

    if (invErr) throw new Error(invErr.message);

    const userId = invite.user.id;
    const now = new Date();
    const end = new Date(now.getTime() + trialDays * 24 * 3600 * 1000);

    await supabaseAdmin
      .from("subscriptions")
      .upsert({
        user_id: userId,
        plan: "Trial",
        status: "trialing",
        monthly_price_eur: 0,
        start_date: now.toISOString().slice(0, 10),
        contact_email: email,
        trial_start_at: now.toISOString(),
        trial_end_at: end.toISOString(),
        scheduled_plan: null,
        updated_at: new Date().toISOString(),
      });

    await sendAdminSubscriptionAlertForUser({
      type: "trial_started",
      source: "admin.create-trial",
      userId,
      accountEmail: email,
      plan: "Trial",
      status: "trialing",
      trialStartAt: now.toISOString(),
      trialEndAt: end.toISOString(),
      note: `Invitation envoyée pour un essai de ${trialDays} jours.`,
    }).catch(() => null);

    return NextResponse.json({ ok: true, user_id: userId, trial_end_at: end.toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erreur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
