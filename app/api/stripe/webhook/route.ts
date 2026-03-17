import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyStripeWebhookSignature } from "@/lib/stripeRest";
import { optionalEnv } from "@/lib/env";
import { sendAdminSubscriptionAlertForUser } from "@/lib/subscriptionAdmin";

export const runtime = "nodejs";

type StripeEvent = {
  type?: string;
  data?: {
    object?: unknown;
    previous_attributes?: Record<string, unknown>;
  };
};

type StripeObjectLoose = Record<string, unknown>;

type SubscriptionSnapshot = {
  user_id?: string | null;
  contact_email?: string | null;
  plan?: string | null;
  scheduled_plan?: string | null;
  status?: string | null;
  trial_start_at?: string | null;
  trial_end_at?: string | null;
  cancel_requested_at?: string | null;
  end_date?: string | null;
  next_renewal_date?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
};

function normalizeStripeStatus(status: string): string {
  const s = String(status || "").toLowerCase();
  const allowed = new Set([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]);
  return allowed.has(s) ? s : "incomplete";
}

function planFromPriceId(priceId: string | null) {
  if (!priceId) return null;
  const starter = optionalEnv("STRIPE_PRICE_STARTER_ID");
  const accel = optionalEnv("STRIPE_PRICE_ACCEL_ID");
  const speed = optionalEnv("STRIPE_PRICE_SPEED_ID") || optionalEnv("STRIPE_PRICE_FULL_ID");
  if (starter && priceId === starter) return "Starter";
  if (accel && priceId === accel) return "Accel";
  if (speed && priceId === speed) return "Speed";
  return null;
}

function monthlyPriceFromPlan(plan: string | null): number | null {
  if (!plan) return null;
  if (plan === "Starter") return 69;
  if (plan === "Accel") return 99;
  if (plan === "Speed") return 359;
  return null;
}

async function getSubscriptionRow(userId?: string | null, customerId?: string | null) {
  if (userId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "user_id, contact_email, plan, scheduled_plan, status, trial_start_at, trial_end_at, cancel_requested_at, end_date, next_renewal_date, stripe_customer_id, stripe_subscription_id, stripe_price_id"
      )
      .eq("user_id", userId)
      .maybeSingle();
    return (data as SubscriptionSnapshot | null) ?? null;
  }

  if (customerId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "user_id, contact_email, plan, scheduled_plan, status, trial_start_at, trial_end_at, cancel_requested_at, end_date, next_renewal_date, stripe_customer_id, stripe_subscription_id, stripe_price_id"
      )
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return (data as SubscriptionSnapshot | null) ?? null;
  }

  return null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const payload = await req.text();

  try {
    verifyStripeWebhookSignature(payload, sig);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let evt: StripeEvent;
  try {
    evt = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updateSubscriptionRow = async (
    userId: string | null | undefined,
    customerId: string | null | undefined,
    patch: Record<string, unknown>
  ) => {
    if (userId) return supabaseAdmin.from("subscriptions").update(patch).eq("user_id", userId);
    if (customerId) return supabaseAdmin.from("subscriptions").update(patch).eq("stripe_customer_id", customerId);
    return null;
  };

  try {
    const type = String(evt.type || "");
    const obj = (evt.data?.object ?? null) as StripeObjectLoose | null;
    const previous = (evt.data?.previous_attributes ?? {}) as StripeObjectLoose;

    if (type === "checkout.session.completed") {
      const session = obj;
      const metadata = (session?.metadata as StripeObjectLoose | undefined) ?? undefined;
      const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
      const customerId = typeof session?.customer === "string" ? session.customer : null;
      const subId = typeof session?.subscription === "string" ? session.subscription : null;

      await updateSubscriptionRow(userId, customerId, {
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subId || null,
      });

      if (userId) {
        const row = await getSubscriptionRow(userId, customerId);
        await sendAdminSubscriptionAlertForUser({
          type: "checkout_completed",
          source: "stripe.webhook.checkout.session.completed",
          userId,
          accountEmail: row?.contact_email ?? null,
          plan: row?.plan ?? null,
          scheduledPlan: row?.scheduled_plan ?? null,
          status: row?.status ?? null,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subId,
          stripePriceId: row?.stripe_price_id ?? null,
          trialStartAt: row?.trial_start_at ?? null,
          trialEndAt: row?.trial_end_at ?? null,
          note: "Paiement confirmé dans Stripe Checkout. L'abonnement démarrera à la fin de l'essai si celui-ci est encore en cours.",
        }).catch(() => null);
      }
    }

    if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
      const sub = obj;
      const metadata = (sub?.metadata as StripeObjectLoose | undefined) ?? undefined;
      const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
      const customerId = typeof sub?.customer === "string" ? sub.customer : null;
      const subId = typeof sub?.id === "string" ? sub.id : null;
      const stripeStatus = normalizeStripeStatus(String(sub?.status || ""));
      const currentPeriodEnd = sub?.current_period_end
        ? new Date(Number(sub.current_period_end) * 1000).toISOString()
        : null;
      const cancelAt = sub?.cancel_at ? new Date(Number(sub.cancel_at) * 1000).toISOString() : null;
      const cancelAtPeriodEnd = !!sub?.cancel_at_period_end;
      const items = (sub?.items as StripeObjectLoose | undefined) ?? undefined;
      const dataArr = (items?.data as unknown[]) || [];
      const firstItem = (dataArr[0] as StripeObjectLoose | undefined) ?? undefined;
      const priceObj = (firstItem?.price as StripeObjectLoose | undefined) ?? undefined;
      const priceId = typeof priceObj?.id === "string" ? priceObj.id : null;
      const trialEndAt = sub?.trial_end ? new Date(Number(sub.trial_end) * 1000).toISOString() : null;
      const trialStartAt = sub?.trial_start ? new Date(Number(sub.trial_start) * 1000).toISOString() : null;
      const inrcyPlan = planFromPriceId(priceId);
      const monthlyPrice = monthlyPriceFromPlan(inrcyPlan);
      const shouldKeepTrialPlan = stripeStatus === "trialing";
      const cancellationTimestamp = cancelAtPeriodEnd
        ? new Date().toISOString()
        : null;

      await updateSubscriptionRow(userId, customerId, {
        status: stripeStatus,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subId || null,
        stripe_price_id: priceId,
        ...(inrcyPlan ? { scheduled_plan: inrcyPlan } : {}),
        ...(shouldKeepTrialPlan
          ? { plan: "Trial", monthly_price_eur: 0 }
          : {
              ...(inrcyPlan ? { plan: inrcyPlan } : {}),
              ...(monthlyPrice != null ? { monthly_price_eur: monthlyPrice } : {}),
              scheduled_plan: null,
            }),
        ...(trialEndAt ? { trial_end_at: trialEndAt } : {}),
        ...(trialStartAt ? { trial_start_at: trialStartAt } : {}),
        next_renewal_date: currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null,
        cancel_requested_at: cancellationTimestamp,
        end_date: cancelAt ? cancelAt.slice(0, 10) : null,
      });

      const row = await getSubscriptionRow(userId, customerId);
      const resolvedUserId = userId || row?.user_id || null;
      if (resolvedUserId) {
        const previousStatus = normalizeStripeStatus(String(previous?.status || ""));
        const previousCancelAtPeriodEnd = previous?.cancel_at_period_end;

        if (stripeStatus === "active" && previousStatus === "trialing") {
          await sendAdminSubscriptionAlertForUser({
            type: "subscription_activated",
            source: `stripe.webhook.${type}`,
            userId: resolvedUserId,
            accountEmail: row?.contact_email ?? null,
            plan: row?.plan ?? inrcyPlan,
            scheduledPlan: row?.scheduled_plan ?? null,
            status: stripeStatus,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
            stripePriceId: priceId,
            trialStartAt: row?.trial_start_at ?? trialStartAt,
            trialEndAt: row?.trial_end_at ?? trialEndAt,
            nextRenewalDate: row?.next_renewal_date ?? (currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null),
            note: "Le trial Stripe est terminé et l'abonnement payant est désormais actif.",
          }).catch(() => null);
        }

        if (cancelAtPeriodEnd && previousCancelAtPeriodEnd === false) {
          await sendAdminSubscriptionAlertForUser({
            type: "cancellation_requested",
            source: `stripe.webhook.${type}`,
            userId: resolvedUserId,
            accountEmail: row?.contact_email ?? null,
            plan: row?.plan ?? null,
            scheduledPlan: row?.scheduled_plan ?? null,
            status: stripeStatus,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
            stripePriceId: priceId,
            cancelRequestedAt: row?.cancel_requested_at ?? cancellationTimestamp,
            endDate: row?.end_date ?? (cancelAt ? cancelAt.slice(0, 10) : null),
            nextRenewalDate: row?.next_renewal_date ?? (currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null),
            note: "Résiliation programmée en fin de période Stripe.",
          }).catch(() => null);
        }

        if (!cancelAtPeriodEnd && previousCancelAtPeriodEnd === true) {
          await sendAdminSubscriptionAlertForUser({
            type: "cancellation_reversed",
            source: `stripe.webhook.${type}`,
            userId: resolvedUserId,
            accountEmail: row?.contact_email ?? null,
            plan: row?.plan ?? null,
            scheduledPlan: row?.scheduled_plan ?? null,
            status: stripeStatus,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
            stripePriceId: priceId,
            nextRenewalDate: row?.next_renewal_date ?? (currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null),
            note: "La résiliation a été annulée. L'abonnement continue.",
          }).catch(() => null);
        }
      }
    }

    if (type === "customer.subscription.deleted") {
      const sub = obj;
      const metadata = (sub?.metadata as StripeObjectLoose | undefined) ?? undefined;
      const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
      const customerId = typeof sub?.customer === "string" ? sub.customer : null;
      const subId = typeof sub?.id === "string" ? sub.id : null;
      const endedAt = sub?.ended_at ? new Date(Number(sub.ended_at) * 1000).toISOString() : null;

      await updateSubscriptionRow(userId, customerId, {
        status: "canceled",
        end_date: endedAt ? endedAt.slice(0, 10) : null,
      });

      const row = await getSubscriptionRow(userId, customerId);
      const resolvedUserId = userId || row?.user_id || null;
      if (resolvedUserId) {
        await sendAdminSubscriptionAlertForUser({
          type: "subscription_deleted",
          source: "stripe.webhook.customer.subscription.deleted",
          userId: resolvedUserId,
          accountEmail: row?.contact_email ?? null,
          plan: row?.plan ?? null,
          scheduledPlan: row?.scheduled_plan ?? null,
          status: "canceled",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subId,
          stripePriceId: row?.stripe_price_id ?? null,
          endDate: endedAt ? endedAt.slice(0, 10) : row?.end_date ?? null,
          note: "Stripe a confirmé la fin effective de l'abonnement.",
        }).catch(() => null);
      }
    }

    if (type === "invoice.payment_failed") {
      const invoice = obj;
      const subId = typeof invoice?.subscription === "string" ? invoice.subscription : null;
      if (subId) {
        await supabaseAdmin.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", subId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Webhook error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
