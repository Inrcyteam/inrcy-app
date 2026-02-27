import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { optionalEnv, requireEnv } from "@/lib/env";
import { sendTxMail } from "@/lib/txMailer";
import { buildTrialReminderEmail } from "@/lib/txTemplates";
import { getAppUrl } from "@/lib/stripeRest";

export const runtime = "nodejs";

// We drive the trial lifecycle from subscriptions.trial_start_at / trial_end_at.
// Intended to be called by a daily cron (Vercel Cron or GitHub Action).

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function frDate(d: Date) {
  try {
    return d.toLocaleDateString("fr-FR");
  } catch {
    return ymd(d);
  }
}

export async function GET(req: Request) {
  // Simple auth for cron
  const secret = requireEnv("CRON_SECRET");
  const got = req.headers.get("x-cron-secret") || "";
  if (got !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // 1) Trial reminders (J20, J24, J27, J30)
  // Rules:
  // - only for users still in app Trial (plan = Trial) AND no Stripe subscription has been created.
  // - last reminder (J30) is sent on the trial_end date (not after), then deletion happens the day after.
  const { data: trials, error: tErr } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, contact_email, trial_start_at, trial_end_at, plan, stripe_subscription_id, last_trial_reminder_day")
    .eq("plan", "Trial")
    .is("stripe_subscription_id", null);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const remindDays = [20, 24, 27, 30];
  let sent = 0;

  for (const s of trials || []) {
    const start = s.trial_start_at ? new Date(s.trial_start_at) : null;
    const end = s.trial_end_at ? new Date(s.trial_end_at) : null;
    if (!start || !end) continue;

    const d = daysBetween(start, now);
    const endYmd = ymd(end);
    const nowYmd = ymd(now);

    // J30 is special: we send it ON the end date.
    const isEndDate = nowYmd === endYmd;
    const shouldSendJ30 = isEndDate;

    const shouldSend =
      (remindDays.includes(d) && d !== 30) || // J20/J24/J27 by "days since start"
      (d >= 30 && shouldSendJ30); // J30 by "end date"

    if (!shouldSend) continue;

    const reminderDay = d >= 30 ? 30 : d;
    const already = Number(s.last_trial_reminder_day || 0);
    if (already >= reminderDay) continue;

    const to = s.contact_email;
    if (!to) continue;

    const subject =
      reminderDay === 30
        ? "iNrCy — Dernier jour d’essai"
        : "iNrCy — Ton essai se termine bientôt";

    const appUrl = getAppUrl(req);
    const ctaUrl = `${appUrl}/dashboard?panel=abonnement`;

    const { html, text } = buildTrialReminderEmail({
      endDateFr: frDate(end),
      ctaUrl,
      reminderDay: reminderDay as 20 | 24 | 27 | 30,
    });

    await sendTxMail({ to, subject, text, html });

    await supabaseAdmin
      .from("subscriptions")
      .update({ last_trial_reminder_day: reminderDay, last_reminder_at: new Date().toISOString() })
      .eq("user_id", s.user_id);

    sent++;
  }

  // 2) Auto delete AFTER the trial end date (day+1) if still not subscribed
  // This ensures the "J30" email can be delivered before deletion.
  const { data: maybeExpired, error: eErr } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, trial_end_at, stripe_subscription_id, plan")
    .eq("plan", "Trial")
    .is("stripe_subscription_id", null);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const deleteAfterDays = Number(optionalEnv("INRCY_TRIAL_DELETE_AFTER_DAYS", "1")); // default: delete the day after trial_end
  let deleted = 0;

  for (const s of maybeExpired || []) {
    const end = s.trial_end_at ? new Date(s.trial_end_at) : null;
    if (!end) continue;

    const deleteAfter = new Date(end);
    deleteAfter.setDate(deleteAfter.getDate() + (Number.isFinite(deleteAfterDays) ? deleteAfterDays : 1));

    if (now < deleteAfter) continue;

    try {
      // Delete subscription row + auth user.
      // (Other tables should rely on ON DELETE CASCADE from user_id where applicable.)
      await supabaseAdmin.from("subscriptions").delete().eq("user_id", s.user_id);
      await supabaseAdmin.auth.admin.deleteUser(s.user_id);
      deleted++;
    } catch {
      // ignore single user failures
    }
  }

  return NextResponse.json({ ok: true, sent, deleted });
}
