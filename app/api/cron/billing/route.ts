import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { optionalEnv } from "@/lib/env";
import { sendTxMail } from "@/lib/txMailer";
import { buildTrialReminderEmail } from "@/lib/txTemplates";
import { getAppUrl, stripeGet } from "@/lib/stripeRest";
import { deleteUserAccountEverywhere } from "@/lib/deleteUserAccount";
import { sendAdminSubscriptionAlertForUser } from "@/lib/subscriptionAdmin";
import { computeTrialDatesFromStartDate, TRIAL_REMINDER_OFFSETS } from "@/lib/trialSubscription";

export const runtime = "nodejs";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

type StripeSubscriptionSummary = { status?: string | null };
type StripeSubscriptionListResponse = { data?: StripeSubscriptionSummary[] };

type TrialRow = {
  user_id: string;
  contact_email: string | null;
  start_date?: string | null;
  trial_start_at: string | null;
  trial_end_at: string | null;
  plan: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id?: string | null;
  stripe_price_id?: string | null;
  scheduled_plan?: string | null;
  last_trial_reminder_day: number | null;
};

type ProfileEmailRow = {
  user_id: string;
  admin_email?: string | null;
  contact_email?: string | null;
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
      { error: "Secret cron manquant côté serveur." },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  const gotBearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const gotHeader = req.headers.get("x-cron-secret") || "";
  if (gotBearer !== cronSecret && gotHeader !== cronSecret) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }

  const now = new Date();
  const reminderOffsets = [...TRIAL_REMINDER_OFFSETS];

  const { data: trials, error: tErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "user_id, contact_email, start_date, trial_start_at, trial_end_at, plan, stripe_subscription_id, stripe_customer_id, stripe_price_id, scheduled_plan, last_trial_reminder_day"
    )
    .eq("plan", "Trial");

  if (tErr) return NextResponse.json({ error: "Impossible de vérifier les essais en cours pour le moment." }, { status: 500 });

  const trialUserIds = ((trials || []) as TrialRow[]).map((row) => row.user_id);
  const profileEmails = new Map<string, ProfileEmailRow>();

  if (trialUserIds.length > 0) {
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, admin_email, contact_email")
      .in("user_id", trialUserIds);

    if (pErr) return NextResponse.json({ error: "Impossible de récupérer les coordonnées des comptes concernés pour le moment." }, { status: 500 });

    for (const profile of (profiles || []) as ProfileEmailRow[]) {
      profileEmails.set(profile.user_id, profile);
    }
  }

  let sent = 0;
  let repairedTrialDates = 0;

  for (const s of (trials || []) as TrialRow[]) {
    let trialStartAt = s.trial_start_at;
    let trialEndAt = s.trial_end_at;

    if (!trialEndAt && s.start_date) {
      const repaired = computeTrialDatesFromStartDate(s.start_date);
      trialStartAt = trialStartAt ?? repaired.trialStartAt;
      trialEndAt = repaired.trialEndAt;

      const { error: repairError } = await supabaseAdmin
        .from("subscriptions")
        .update({
          trial_start_at: trialStartAt,
          trial_end_at: trialEndAt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", s.user_id);

      if (repairError) {
        return NextResponse.json({ error: "Impossible de mettre à jour les dates d'essai pour le moment." }, { status: 500 });
      }

      repairedTrialDates++;
    }

    const end = trialEndAt ? new Date(trialEndAt) : null;
    if (!end) continue;

    const nowDay = new Date(`${ymd(now)}T00:00:00.000Z`);
    const endDay = new Date(`${ymd(end)}T00:00:00.000Z`);
    const daysUntilEnd = Math.round((endDay.getTime() - nowDay.getTime()) / (24 * 3600 * 1000));
    if (!reminderOffsets.includes(daysUntilEnd as (typeof reminderOffsets)[number])) continue;

    const already = Number(s.last_trial_reminder_day || 0);
    const reminderMarker = 100 - daysUntilEnd;
    if (already >= reminderMarker) continue;

    const profile = profileEmails.get(s.user_id);
    const to =
      profile?.admin_email?.trim() ||
      profile?.contact_email?.trim() ||
      s.contact_email?.trim() ||
      null;
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
      .update({
        contact_email: to,
        last_trial_reminder_day: reminderMarker,
        last_reminder_at: new Date().toISOString(),
      })
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

  if (eErr) return NextResponse.json({ error: "Impossible de vérifier les comptes d'essai expirés pour le moment." }, { status: 500 });

  const deleteAfterDays = Number(optionalEnv("INRCY_TRIAL_DELETE_AFTER_DAYS", "1"));
  let deletedTrialAccounts = 0;

  for (const s of (maybeExpired || []) as TrialRow[]) {
    const profile = profileEmails.get(s.user_id);
    const accountEmail =
      profile?.admin_email?.trim() ||
      profile?.contact_email?.trim() ||
      s.contact_email?.trim() ||
      null;

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
      accountEmail,
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

  if (cErr) return NextResponse.json({ error: "Impossible de vérifier les résiliations arrivées à échéance pour le moment." }, { status: 500 });

  let deletedCancelledAccounts = 0;

  for (const s of (cancelledRows || []) as CancelledRow[]) {
    const profile = profileEmails.get(s.user_id);
    const accountEmail =
      profile?.admin_email?.trim() ||
      profile?.contact_email?.trim() ||
      s.contact_email?.trim() ||
      null;

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
      accountEmail,
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
    repaired_trial_dates: repairedTrialDates,
    deleted_trial_accounts: deletedTrialAccounts,
    deleted_cancelled_accounts: deletedCancelledAccounts,
  });
}
