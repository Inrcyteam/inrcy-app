import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { optionalEnv } from "@/lib/env";
import { sendTxMail } from "@/lib/txMailer";
import { buildTrialReminderEmail } from "@/lib/txTemplates";
import { getAppUrl, stripeGet } from "@/lib/stripeRest";
import { deleteUserAccountEverywhere } from "@/lib/deleteUserAccount";
import { sendAdminSubscriptionAlertForUser } from "@/lib/subscriptionAdmin";

export const runtime = "nodejs";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

type StripeSubscriptionSummary = { status?: string | null };
type StripeSubscriptionListResponse = { data?: StripeSubscriptionSummary[] };

type TrialRow = {
  user_id: string;
  contact_email: string | null;
  trial_start_at: string | null;
  trial_end_at: string | null;
  plan: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id?: string | null;
  stripe_price_id?: string | null;
  scheduled_plan?: string | null;
  last_trial_reminder_day: number | null;
};

type CancelledRow = {
  user_id: string;
  contact_email: string | null;
  plan: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  end_date: string | null;
  cancel_requested_at: string | null;
};

function frDate(d: Date) {
  try {
    return d.toLocaleDateString("fr-FR");
  } catch {
    return ymd(d);
  }
}

async function stripeCustomerHasAnySubscription(stripeCustomerId: string) {
  try {
    const qs = new URLSearchParams({
      customer: stripeCustomerId,
      status: "all",
      limit: "10",
    });

    const json = (await stripeGet(`/subscriptions?${qs.toString()}`)) as StripeSubscriptionListResponse;
    const subs = Array.isArray(json?.data) ? json.data : [];
    return subs.some((subscription) => subscription?.status && subscription.status !== "incomplete_expired");
  } catch {
    return true;
  }
}

export async function GET(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Missing cron secret env (VERCEL_CRON_SECRET or CRON_SECRET)" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  const gotBearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const gotHeader = req.headers.get("x-cron-secret") || "";
  if (gotBearer !== cronSecret && gotHeader !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const reminderOffsets = [10, 6, 3, 1];

  const { data: trials, error: tErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "user_id, contact_email, trial_start_at, trial_end_at, plan, stripe_subscription_id, stripe_customer_id, stripe_price_id, scheduled_plan, last_trial_reminder_day"
    )
    .eq("plan", "Trial")
    .is("stripe_subscription_id", null);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  let sent = 0;
  for (const s of (trials || []) as TrialRow[]) {
    const end = s.trial_end_at ? new Date(s.trial_end_at) : null;
    if (!end) continue;

    const nowDay = new Date(`${ymd(now)}T00:00:00.000Z`);
    const endDay = new Date(`${ymd(end)}T00:00:00.000Z`);
    const daysUntilEnd = Math.round((endDay.getTime() - nowDay.getTime()) / (24 * 3600 * 1000));
    if (!reminderOffsets.includes(daysUntilEnd)) continue;

    const already = Number(s.last_trial_reminder_day || 0);
    const reminderMarker = 100 - daysUntilEnd; // stable ascending marker for J-10/J-6/J-3/J-1
    if (already >= reminderMarker) continue;

    const to = s.contact_email;
    if (!to) continue;

    const subject = daysUntilEnd === 1 ? "iNrCy — Votre essai se termine demain" : "iNrCy — Votre essai se termine bientôt";
    const ctaUrl = `${getAppUrl(req)}/dashboard?panel=abonnement`;
    const { html, text } = buildTrialReminderEmail({
      endDateFr: frDate(end),
      ctaUrl,
      daysBeforeEnd: daysUntilEnd,
    });

    await sendTxMail({ to, subject, text, html });
    await supabaseAdmin
      .from("subscriptions")
      .update({ last_trial_reminder_day: reminderMarker, last_reminder_at: new Date().toISOString() })
      .eq("user_id", s.user_id);

    sent++;
  }

  const { data: maybeExpired, error: eErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "user_id, contact_email, trial_end_at, stripe_subscription_id, stripe_customer_id, scheduled_plan, stripe_price_id, plan"
    )
    .eq("plan", "Trial")
    .is("stripe_subscription_id", null);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const deleteAfterDays = Number(optionalEnv("INRCY_TRIAL_DELETE_AFTER_DAYS", "1"));
  let deletedTrialAccounts = 0;

  for (const s of (maybeExpired || []) as TrialRow[]) {
    const end = s.trial_end_at ? new Date(s.trial_end_at) : null;
    if (!end) continue;

    const deleteAfter = new Date(end);
    deleteAfter.setDate(deleteAfter.getDate() + (Number.isFinite(deleteAfterDays) ? deleteAfterDays : 1));
    if (now < deleteAfter) continue;

    if (s.stripe_customer_id) {
      const hasAnySub = await stripeCustomerHasAnySubscription(s.stripe_customer_id);
      if (hasAnySub) continue;
    } else {
      const graceDays = Number(optionalEnv("INRCY_TRIAL_DELETE_GRACE_DAYS", "2"));
      if ((s.scheduled_plan || s.stripe_price_id) && Number.isFinite(graceDays) && graceDays > 0) {
        const graceUntil = new Date(deleteAfter);
        graceUntil.setDate(graceUntil.getDate() + graceDays);
        if (now < graceUntil) continue;
      }
    }

    const deletion = await deleteUserAccountEverywhere(s.user_id);
    if (!deletion.ok) continue;

    await sendAdminSubscriptionAlertForUser({
      type: "trial_account_deleted",
      source: "cron.billing.trial-expiry",
      userId: s.user_id,
      accountEmail: s.contact_email,
      plan: s.plan,
      trialEndAt: s.trial_end_at,
      stripeCustomerId: s.stripe_customer_id ?? null,
      stripePriceId: s.stripe_price_id ?? null,
      scheduledPlan: s.scheduled_plan ?? null,
      note: `Compte supprimé automatiquement après fin d'essai. Mode suppression: ${deletion.mode}.`,
    }).catch(() => null);

    deletedTrialAccounts++;
  }

  const { data: cancelledRows, error: cErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "user_id, contact_email, plan, status, stripe_customer_id, stripe_subscription_id, stripe_price_id, end_date, cancel_requested_at"
    )
    .not("stripe_subscription_id", "is", null)
    .not("end_date", "is", null);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  let deletedCancelledAccounts = 0;

  for (const s of (cancelledRows || []) as CancelledRow[]) {
    if (!s.end_date) continue;
    const deleteAt = new Date(`${s.end_date}T23:59:59.999Z`);
    if (now < deleteAt) continue;

    if (s.stripe_customer_id) {
      const hasAnySub = await stripeCustomerHasAnySubscription(s.stripe_customer_id);
      if (hasAnySub) continue;
    }

    const deletion = await deleteUserAccountEverywhere(s.user_id);
    if (!deletion.ok) continue;

    await sendAdminSubscriptionAlertForUser({
      type: "cancelled_account_deleted",
      source: "cron.billing.cancelled-expiry",
      userId: s.user_id,
      accountEmail: s.contact_email,
      plan: s.plan,
      status: s.status,
      stripeCustomerId: s.stripe_customer_id,
      stripeSubscriptionId: s.stripe_subscription_id,
      stripePriceId: s.stripe_price_id,
      cancelRequestedAt: s.cancel_requested_at,
      endDate: s.end_date,
      note: `Compte supprimé automatiquement à la fin du préavis / période de résiliation. Mode suppression: ${deletion.mode}.`,
    }).catch(() => null);

    deletedCancelledAccounts++;
  }

  return NextResponse.json({
    ok: true,
    sent,
    deleted_trial_accounts: deletedTrialAccounts,
    deleted_cancelled_accounts: deletedCancelledAccounts,
  });
}
