import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { optionalEnv } from "@/lib/env";
import { sendTxMail } from "@/lib/txMailer";
import { buildAnnualRenewalReminderEmail, buildTrialReminderEmail } from "@/lib/txTemplates";
import { getAppUrl, stripeGet } from "@/lib/stripeRest";
import { deleteUserAccountEverywhere } from "@/lib/deleteUserAccount";
import { sendAdminSubscriptionAlertForUser } from "@/lib/subscriptionAdmin";
import { computeTrialDatesFromStartDate, TRIAL_REMINDER_OFFSETS } from "@/lib/trialSubscription";
import { getInrcyBrandInlineAttachments } from "@/lib/txEmailAssets";

export const runtime = "nodejs";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

type StripeSubscriptionSummary = { status?: string | null };
type StripeSubscriptionListResponse = { data?: StripeSubscriptionSummary[] };

const OPEN_TRIAL_STATUSES = new Set(["trialing", "trailing", "essai", "incomplete", "incomplete_expired", ""]);

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function shouldExpireTrialStatus(value: unknown) {
  const status = normalizeStatus(value);
  return OPEN_TRIAL_STATUSES.has(status);
}

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
  status?: string | null;
  last_trial_reminder_day: number | null;
};

type ProfileEmailRow = {
  user_id: string;
  admin_email?: string | null;
  contact_email?: string | null;
};

type AnnualSubscriptionRow = {
  user_id: string;
  contact_email: string | null;
  plan: string | null;
  status: string | null;
  monthly_price_eur: number | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  next_renewal_date: string | null;
  cancel_requested_at: string | null;
  end_date: string | null;
  last_annual_reminder_marker: number | null;
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

function annualReminderMarker(renewalDate: Date, daysUntilRenewal: number) {
  return Number(`${ymd(renewalDate).replace(/-/g, "")}${String(100 - daysUntilRenewal).padStart(2, "0")}`);
}

async function loadProfileEmails(userIds: string[]) {
  const emails = new Map<string, ProfileEmailRow>();
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return emails;

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("user_id, admin_email, contact_email")
    .in("user_id", uniqueUserIds);

  for (const profile of (data || []) as ProfileEmailRow[]) {
    emails.set(profile.user_id, profile);
  }

  return emails;
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

    await sendTxMail({ to, subject, text, html, attachments: await getInrcyBrandInlineAttachments() });
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
      "user_id, contact_email, trial_end_at, stripe_subscription_id, stripe_customer_id, scheduled_plan, stripe_price_id, plan, status"
    )
    .eq("plan", "Trial")
    .is("stripe_subscription_id", null);

  if (eErr) return NextResponse.json({ error: "Impossible de vérifier les comptes d'essai expirés pour le moment." }, { status: 500 });

  let expiredTrialAccounts = 0;

  for (const s of (maybeExpired || []) as TrialRow[]) {
    if (!shouldExpireTrialStatus(s.status)) continue;

    const profile = profileEmails.get(s.user_id);
    const accountEmail =
      profile?.admin_email?.trim() ||
      profile?.contact_email?.trim() ||
      s.contact_email?.trim() ||
      null;

    const end = s.trial_end_at ? new Date(s.trial_end_at) : null;
    if (!end || !Number.isFinite(end.getTime())) continue;
    if (now < end) continue;

    if (s.stripe_customer_id) {
      const hasAnySub = await stripeCustomerHasAnySubscription(s.stripe_customer_id);
      if (hasAnySub) continue;
    }

    const { error: expireError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "trial_expired",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", s.user_id)
      .eq("plan", "Trial");

    if (expireError) continue;

    await sendAdminSubscriptionAlertForUser({
      type: "trial_account_expired",
      source: "cron.billing.trial-expiry",
      userId: s.user_id,
      accountEmail,
      plan: s.plan,
      status: "trial_expired",
      trialEndAt: s.trial_end_at,
      stripeCustomerId: s.stripe_customer_id ?? null,
      stripePriceId: s.stripe_price_id ?? null,
      scheduledPlan: s.scheduled_plan ?? null,
      note: "Essai terminé sans abonnement : le compte est bloqué, mais les données sont conservées.",
    }).catch(() => null);

    expiredTrialAccounts++;
  }

  const annualReminderOffsets = [30, 7, 1] as const;
  const annualPriceIds = [optionalEnv("STRIPE_PRICE_YEARLY", ""), optionalEnv("STRIPE_PRICE_ACCEL_YEARLY_ID", "")].filter(Boolean);
  let sentAnnualRenewalReminders = 0;

  if (annualPriceIds.length > 0) {
    const { data: annualSubscriptions, error: annualReminderErr } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "user_id, contact_email, plan, status, monthly_price_eur, stripe_subscription_id, stripe_price_id, next_renewal_date, cancel_requested_at, end_date, last_annual_reminder_marker"
      )
      .neq("plan", "Trial")
      .eq("status", "active")
      .in("stripe_price_id", annualPriceIds)
      .not("stripe_subscription_id", "is", null)
      .not("next_renewal_date", "is", null);

    if (annualReminderErr) {
      return NextResponse.json({ error: "Impossible de vérifier les renouvellements annuels pour le moment." }, { status: 500 });
    }

    const annualRowsForReminder = ((annualSubscriptions || []) as AnnualSubscriptionRow[]).filter(
      (row) => !row.cancel_requested_at && !row.end_date
    );
    const annualProfiles = await loadProfileEmails(annualRowsForReminder.map((row) => row.user_id));

    for (const s of annualRowsForReminder) {
      if (!s.next_renewal_date) continue;
      const renewalDate = new Date(`${s.next_renewal_date}T00:00:00.000Z`);
      if (!Number.isFinite(renewalDate.getTime())) continue;

      const nowDay = new Date(`${ymd(now)}T00:00:00.000Z`);
      const renewalDay = new Date(`${ymd(renewalDate)}T00:00:00.000Z`);
      const daysUntilRenewal = Math.round((renewalDay.getTime() - nowDay.getTime()) / (24 * 3600 * 1000));
      if (!annualReminderOffsets.includes(daysUntilRenewal as (typeof annualReminderOffsets)[number])) continue;

      const reminderMarker = annualReminderMarker(renewalDate, daysUntilRenewal);
      const already = Number(s.last_annual_reminder_marker || 0);
      if (already >= reminderMarker) continue;

      const profile = annualProfiles.get(s.user_id);
      const to =
        profile?.admin_email?.trim() ||
        profile?.contact_email?.trim() ||
        s.contact_email?.trim() ||
        null;
      if (!to) continue;

      const subject =
        daysUntilRenewal === 1
          ? "iNrCy — Votre abonnement annuel se renouvelle demain"
          : "iNrCy — Votre abonnement annuel se renouvelle bientôt";
      const ctaUrl = `${getAppUrl(req)}/dashboard?panel=abonnement`;
      const amountLabel = `${Number(s.monthly_price_eur || 690).toLocaleString("fr-FR", {
        maximumFractionDigits: 2,
      })} € TTC`;
      const { html, text } = buildAnnualRenewalReminderEmail({
        renewalDateFr: frDate(renewalDate),
        ctaUrl,
        daysBeforeRenewal: daysUntilRenewal,
        amountLabel,
      });

      await sendTxMail({ to, subject, text, html, attachments: await getInrcyBrandInlineAttachments() });
      await supabaseAdmin
        .from("subscriptions")
        .update({
          contact_email: to,
          last_annual_reminder_marker: reminderMarker,
          last_reminder_at: new Date().toISOString(),
        })
        .eq("user_id", s.user_id);

      sentAnnualRenewalReminders++;
    }
  }

  const { data: cancelledRows, error: cErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "user_id, contact_email, plan, status, stripe_customer_id, stripe_subscription_id, stripe_price_id, end_date, cancel_requested_at"
    )
    .not("stripe_subscription_id", "is", null)
    .not("end_date", "is", null);

  if (cErr) return NextResponse.json({ error: "Impossible de vérifier les résiliations arrivées à échéance pour le moment." }, { status: 500 });

  let expiredAnnualAccesses = 0;

  const { data: annualRows, error: annualErr } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, end_date")
    .neq("plan", "Trial")
    .eq("status", "active")
    .is("stripe_subscription_id", null)
    .not("end_date", "is", null);

  if (annualErr) return NextResponse.json({ error: "Impossible de vérifier les accès annuels arrivés à échéance pour le moment." }, { status: 500 });

  for (const s of (annualRows || []) as { user_id: string; end_date: string | null }[]) {
    if (!s.end_date) continue;
    const expireAt = new Date(`${s.end_date}T23:59:59.999Z`);
    if (now < expireAt) continue;
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("user_id", s.user_id);
    expiredAnnualAccesses++;
  }

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
    sent_annual_renewal_reminders: sentAnnualRenewalReminders,
    repaired_trial_dates: repairedTrialDates,
    expired_trial_accounts: expiredTrialAccounts,
    deleted_trial_accounts: 0,
    deleted_cancelled_accounts: deletedCancelledAccounts,
    expired_annual_accesses: expiredAnnualAccesses,
  });
}
