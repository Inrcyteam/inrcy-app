import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyStripeWebhookSignature } from "@/lib/stripeRest";

export const runtime = "nodejs";

function mapStripeStatusToInrcy(status: string): string {
  // Stripe statuses: trialing, active, past_due, unpaid, canceled, incomplete, incomplete_expired
  if (status === "active") return "actif";
  if (status === "trialing") return "essai";
  if (status === "past_due" || status === "unpaid") return "impayé";
  if (status === "canceled") return "résilié";
  return "suspendu";
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
      const status = mapStripeStatusToInrcy(String(sub?.status || ""));

      // current_period_end is unix
      const currentPeriodEnd = sub?.current_period_end
        ? new Date(Number(sub.current_period_end) * 1000).toISOString()
        : null;

      const cancelAt = sub?.cancel_at ? new Date(Number(sub.cancel_at) * 1000).toISOString() : null;
      const cancelAtPeriodEnd = !!sub?.cancel_at_period_end;

      // find price id (first item)
      const priceId = sub?.items?.data?.[0]?.price?.id || null;

      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status,
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subId || null,
            stripe_price_id: priceId,
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
            status: "résilié",
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
          .update({ status: "impayé" })
          .eq("stripe_subscription_id", subId);
      }
    }

    if (type === "invoice.paid") {
      const invoice = obj;
      const subId = invoice?.subscription;
      if (subId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "actif" })
          .eq("stripe_subscription_id", subId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Webhook error" }, { status: 500 });
  }
}
