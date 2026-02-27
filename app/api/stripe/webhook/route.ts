import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyStripeWebhookSignature } from "@/lib/stripeRest";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";

type StripeEvent = {
  type?: string;
  data?: {
    object?: unknown;
  };
};

type StripeObjectLoose = Record<string, unknown>;

// We store Stripe subscription statuses as-is in Supabase (enum aligned with Stripe).
function normalizeStripeStatus(status: string): string {
  const s = String(status || "").toLowerCase();
  // Official Stripe subscription statuses (plus "paused" if used)
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
  // Backward compatible env name (FULL) + new one (SPEED)
  const speed = optionalEnv("STRIPE_PRICE_SPEED_ID") || optionalEnv("STRIPE_PRICE_FULL_ID");
  if (starter && priceId === starter) return "Starter";
  if (accel && priceId === accel) return "Accel";
  if (speed && priceId === speed) return "Speed";
  return null;
}

function monthlyPriceFromPlan(plan: string | null): number | null {
  if (!plan) return null;
  // You can override via env if needed.
  const starter = Number(optionalEnv("INRCY_PRICE_STARTER_EUR", "69"));
  const accel = Number(optionalEnv("INRCY_PRICE_ACCEL_EUR", "0"));
  const speed = Number(optionalEnv("INRCY_PRICE_SPEED_EUR", optionalEnv("INRCY_PRICE_FULL_EUR", "0")));
  if (plan === "Starter") return Number.isFinite(starter) ? starter : 69;
  if (plan === "Accel") return Number.isFinite(accel) ? accel : null;
  if (plan === "Speed") return Number.isFinite(speed) ? speed : null;
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

  // Helper: update a subscription row either by user_id (preferred) or by stripe_customer_id (fallback).
  // This is important because some Stripe events (or CLI triggers) won't contain metadata.user_id.
  const updateSubscriptionRow = async (
    userId: string | null | undefined,
    customerId: string | null | undefined,
    patch: Record<string, unknown>
  ) => {
    if (userId) {
      return supabaseAdmin.from("subscriptions").update(patch).eq("user_id", userId);
    }
    if (customerId) {
      return supabaseAdmin.from("subscriptions").update(patch).eq("stripe_customer_id", customerId);
    }
    return null;
  };

  try {
    const type = String(evt.type || "");
    const obj = (evt.data?.object ?? null) as StripeObjectLoose | null;

    // 1) Checkout completed -> persist customer + subscription id ASAP
    if (type === "checkout.session.completed") {
      const session = obj;
      const metadata = (session?.metadata as StripeObjectLoose | undefined) ?? undefined;
      const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
      const customerId = typeof session?.customer === "string" ? session.customer : null;
      // In subscription-mode checkout sessions, Stripe gives you the subscription id here.
      const subId = typeof session?.subscription === "string" ? session.subscription : null;

      await updateSubscriptionRow(userId, customerId, {
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subId || null,
      });
    }

    // 2) Subscription upserts
    if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
      const sub = obj;
      const metadata = (sub?.metadata as StripeObjectLoose | undefined) ?? undefined;
      const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
      const customerId = typeof sub?.customer === "string" ? sub.customer : null;
      const subId = typeof sub?.id === "string" ? sub.id : null;
      const stripeStatus = normalizeStripeStatus(String(sub?.status || ""));

      // current_period_end is unix
      const currentPeriodEnd = sub?.current_period_end
        ? new Date(Number(sub.current_period_end) * 1000).toISOString()
        : null;

      const cancelAt = sub?.cancel_at ? new Date(Number(sub.cancel_at) * 1000).toISOString() : null;
      const cancelAtPeriodEnd = !!sub?.cancel_at_period_end;

      // find price id (first item)
      const items = (sub?.items as StripeObjectLoose | undefined) ?? undefined;
      const dataArr = (items?.data as unknown[]) || [];
      const firstItem = (dataArr[0] as StripeObjectLoose | undefined) ?? undefined;
      const priceObj = (firstItem?.price as StripeObjectLoose | undefined) ?? undefined;
      const priceId = typeof priceObj?.id === "string" ? priceObj.id : null;

      // Trial end (if any)
      const trialEndAt = sub?.trial_end ? new Date(Number(sub.trial_end) * 1000).toISOString() : null;
      const trialStartAt = sub?.trial_start ? new Date(Number(sub.trial_start) * 1000).toISOString() : null;
      const inrcyPlan = planFromPriceId(priceId);
      const monthlyPrice = monthlyPriceFromPlan(inrcyPlan);

      // ✅ IMPORTANT UX RULE
      // Tant que Stripe est en "trialing", on garde le plan côté app sur "Trial".
      // On conserve malgré tout les IDs Stripe + dates d'essai, pour pouvoir :
      // - masquer le bouton "S'abonner" (abonnement déjà programmé)
      // - afficher la date de démarrage prévue
      // Dès que Stripe passe en "active", on applique le plan payant (Starter/Accel/Speed).
      const shouldKeepTrialPlan = stripeStatus === "trialing";

      await updateSubscriptionRow(userId, customerId, {
        status: stripeStatus,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subId || null,
        stripe_price_id: priceId,
        // Always keep the selected paid plan for UI (even during trialing).
        ...(inrcyPlan ? { scheduled_plan: inrcyPlan } : {}),
        ...(shouldKeepTrialPlan
          ? { plan: "Trial", monthly_price_eur: 0 }
          : {
              ...(inrcyPlan ? { plan: inrcyPlan } : {}),
              ...(monthlyPrice != null ? { monthly_price_eur: monthlyPrice } : {}),
              // Once the paid plan is effectively running, we no longer need the scheduled marker.
              scheduled_plan: null,
            }),
        ...(trialEndAt ? { trial_end_at: trialEndAt } : {}),
        ...(trialStartAt ? { trial_start_at: trialStartAt } : {}),
        next_renewal_date: currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null,
        cancel_requested_at: cancelAtPeriodEnd ? new Date().toISOString() : null,
        end_date: cancelAt ? cancelAt.slice(0, 10) : null,
      });
    }

    if (type === "customer.subscription.deleted") {
      const sub = obj;
      const metadata = (sub?.metadata as StripeObjectLoose | undefined) ?? undefined;
      const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
      const customerId = typeof sub?.customer === "string" ? sub.customer : null;
      const endedAt = sub?.ended_at ? new Date(Number(sub.ended_at) * 1000).toISOString() : null;

      await updateSubscriptionRow(userId, customerId, {
        status: "canceled",
        end_date: endedAt ? endedAt.slice(0, 10) : null,
      });
    }

    // 3) Payment events (impayés)
    if (type === "invoice.payment_failed") {
      const invoice = obj;
      const subId = typeof invoice?.subscription === "string" ? invoice.subscription : null;
      if (subId) {
        await supabaseAdmin.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", subId);
      }
    }

    // NOTE: we avoid forcing "active" from invoice events.
    // Subscription status transitions are handled by customer.subscription.updated.

    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Webhook error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
