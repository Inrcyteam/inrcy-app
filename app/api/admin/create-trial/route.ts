import { NextResponse } from "next/server";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireEnv } from "@/lib/env";
import { sendAdminSubscriptionAlertForUser } from "@/lib/subscriptionAdmin";
import { ensureNotificationPreferences } from "@/lib/notifications";
import { ensureTrialSubscription } from "@/lib/trialSubscription";
import { ensureProfileRow } from "@/lib/ensureProfileRow";

export const runtime = "nodejs";

/**
 * Admin endpoint to create a trial user + subscription row.
 * Protect with ADMIN_SECRET.
 */
export async function POST(req: Request) {
  try {
    const secret = requireEnv("ADMIN_SECRET");
    const got = req.headers.get("x-admin-secret") || "";
    if (got !== secret) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) return NextResponse.json({ error: "Email manquant." }, { status: 400 });


    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://app.inrcy.com").replace(/\/$/, "");
    const { data: invite, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appOrigin}/auth/finish-invite`,
    });

    if (invErr) throw new Error(invErr.message);

    const userId = invite.user.id;

    await ensureProfileRow(invite.user);
    await ensureNotificationPreferences(userId);
    const { trialDays, start, end } = await ensureTrialSubscription(userId, email);

    await sendAdminSubscriptionAlertForUser({
      type: "trial_started",
      source: "admin.create-trial",
      userId,
      accountEmail: email,
      profileContactEmail: email,
      plan: "Trial",
      status: "trialing",
      trialStartAt: start.toISOString(),
      trialEndAt: end.toISOString(),
      note: `Invitation envoyée pour un essai de ${trialDays} jours.`,
    }).catch(() => null);

    return NextResponse.json({ ok: true, user_id: userId, trial_end_at: end.toISOString() });
  } catch (e: unknown) {
    const msg = getSimpleFrenchErrorMessage(e, "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes.");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
