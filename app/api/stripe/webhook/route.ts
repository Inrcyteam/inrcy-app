import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyStripeWebhookSignature } from "@/lib/stripeRest";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";

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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid signature" }, { status: 400 });
  }

  let evt: any;
  try {
    evt = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const type = evt.type as string;
    const obj = evt.data?.object;

    // 1) Checkout completed -> ensure active
    if (type === "checkout.session.completed") {
      const session = obj;
      const userId = session?.metadata?.user_id;
      const customerId = session?.customer;

      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({
            stripe_customer_id: customerId || null,
          })
          .eq("user_id", userId);
      }
    }

    // 2) Subscription upserts
    if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
      const sub = obj;
      const userId = sub?.metadata?.user_id;
      const customerId = sub?.customer;
      const subId = sub?.id;
      const stripeStatus = normalizeStripeStatus(String(sub?.status || ""));

      // current_period_end is unix
      const currentPeriodEnd = sub?.current_period_end
        ? new Date(Number(sub.current_period_end) * 1000).toISOString()
        : null;

      const cancelAt = sub?.cancel_at ? new Date(Number(sub.cancel_at) * 1000).toISOString() : null;
      const cancelAtPeriodEnd = !!sub?.cancel_at_period_end;

      // find price id (first item)
      const priceId = sub?.items?.data?.[0]?.price?.id || null;

      // Trial end (if any)
      const trialEndAt = sub?.trial_end ? new Date(Number(sub.trial_end) * 1000).toISOString() : null;
      const inrcyPlan = planFromPriceId(priceId);
      const monthlyPrice = monthlyPriceFromPlan(inrcyPlan);

      if (userId) {
        // ✅ IMPORTANT UX RULE
        // Tant que Stripe est en "trialing", on garde le plan côté app sur "Trial".
        // On conserve malgré tout les IDs Stripe + dates d'essai, pour pouvoir :
        // - masquer le bouton "S'abonner" (abonnement déjà programmé)
        // - afficher la date de démarrage prévue
        // Dès que Stripe passe en "active", on applique le plan payant (Starter/Accel/Speed).
        const shouldKeepTrialPlan = stripeStatus === "trialing";

        await supabaseAdmin
          .from("subscriptions")
          .update({
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
            next_renewal_date: currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null,
            cancel_requested_at: cancelAtPeriodEnd ? new Date().toISOString() : null,
            end_date: cancelAt ? cancelAt.slice(0, 10) : null,
          })
          .eq("user_id", userId);
      }
    }

    if (type === "customer.subscription.deleted") {
      const sub = obj;
      const userId = sub?.metadata?.user_id;
      const endedAt = sub?.ended_at ? new Date(Number(sub.ended_at) * 1000).toISOString() : null;

      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "canceled",
            end_date: endedAt ? endedAt.slice(0, 10) : null,
          })
          .eq("user_id", userId);
      }
    }

    // 3) Payment events (impayés)
    if (type === "invoice.payment_failed") {
      const invoice = obj;
      const subId = invoice?.subscription;
      if (subId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subId);
      }
    }

    // NOTE: we avoid forcing "active" from invoice events.
    // Subscription status transitions are handled by customer.subscription.updated.

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Webhook error" }, { status: 500 });
  }
}
