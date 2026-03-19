import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { optionalEnv, requireEnv } from "@/lib/env";
import { getAppUrl, stripePost } from "@/lib/stripeRest";

export const runtime = "nodejs";

type SubscriptionRow = {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  status?: string | null;
  plan?: string | null;
  start_date?: string | null;
  trial_end_at?: string | null;
  contact_email?: string | null;
};

function hasStripeConfig() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_STARTER_ID &&
      process.env.STRIPE_PRICE_ACCEL_ID
  );
}

export async function POST(req: Request) {
  try {
    if (!hasStripeConfig()) {
      return NextResponse.json(
        { error: "Stripe non configuré sur cet environnement." },
        { status: 503 }
      );
    }

    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body: unknown = await req.json().catch(() => ({}));
    const wantedPlan = String((body as { plan?: unknown } | null | undefined)?.plan || "Starter");
    const trialDays = Math.max(1, Number(optionalEnv("INRCY_TRIAL_DAYS", "30")) || 30);

    const priceIdByPlan: Record<string, string | undefined> = {
      Starter: requireEnv("STRIPE_PRICE_STARTER_ID"),
      Accel: requireEnv("STRIPE_PRICE_ACCEL_ID"),
      Speed: optionalEnv("STRIPE_PRICE_SPEED_ID") || optionalEnv("STRIPE_PRICE_FULL_ID"),
    };

    const priceId = priceIdByPlan[wantedPlan];
    if (!priceId) {
      return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
    }

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, plan, start_date, trial_end_at, contact_email")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);

    const row = sub as SubscriptionRow | null | undefined;
    const appUrl = getAppUrl(req) || requireEnv("NEXT_PUBLIC_APP_URL");

    let trialEndAt = row?.trial_end_at ?? undefined;
    if (!trialEndAt) {
      const startYmd = row?.start_date ?? undefined;
      if (!startYmd) {
        return NextResponse.json(
          { error: "Période d'essai introuvable. L'abonnement est indisponible." },
          { status: 403 }
        );
      }

      const start = new Date(`${startYmd}T00:00:00.000Z`);
      const computed = new Date(start);
      computed.setDate(computed.getDate() + trialDays);
      trialEndAt = computed.toISOString();

      await supabaseAdmin
        .from("subscriptions")
        .update({ trial_end_at: trialEndAt })
        .eq("user_id", userId);
    }

    const trialEndUnix = Math.floor(new Date(trialEndAt).getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(trialEndUnix) || trialEndUnix <= nowUnix + 60) {
      return NextResponse.json(
        { error: "La période d'essai est terminée. L'abonnement n'est plus disponible pour ce compte." },
        { status: 403 }
      );
    }

    const existingSubId = row?.stripe_subscription_id ?? undefined;
    const existingStatus = String(row?.status || "").toLowerCase();

    const alreadySubscribed =
      !!existingSubId &&
      existingStatus !== "canceled" &&
      existingStatus !== "cancelled" &&
      existingStatus !== "incomplete_expired";

    if (alreadySubscribed) {
      return NextResponse.json(
        { error: "Un abonnement est déjà en cours pour ce compte." },
        { status: 409 }
      );
    }

    const email = row?.contact_email || user.email;
    if (!email) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    let customerId = row?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customerParams = new URLSearchParams();
      customerParams.set("email", email);
      customerParams.set("metadata[user_id]", userId);

      const customer = await stripePost("/customers", customerParams, {
        idempotencyKey: `customer-create-${userId}`,
      });

      customerId = customer.id;

      await supabaseAdmin
        .from("subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", userId);
    }

    if (!customerId) throw new Error("Stripe customer manquant");

    const sessionParams = new URLSearchParams();
    sessionParams.set("mode", "subscription");
    sessionParams.set("customer", customerId);
    sessionParams.set("line_items[0][price]", priceId);
    sessionParams.set("line_items[0][quantity]", "1");
    sessionParams.set("success_url", `${appUrl}/dashboard?panel=abonnement&checkout=success`);
    sessionParams.set("cancel_url", `${appUrl}/dashboard?panel=abonnement&checkout=cancel`);
    sessionParams.set("metadata[user_id]", userId);
    sessionParams.set("subscription_data[metadata][user_id]", userId);
    sessionParams.set("subscription_data[trial_end]", String(trialEndUnix));
    sessionParams.set("payment_method_collection", "always");

    const session = await stripePost("/checkout/sessions", sessionParams, {
      idempotencyKey: `checkout-session-${userId}-${priceId}`,
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({
        stripe_price_id: priceId,
        scheduled_plan: wantedPlan,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erreur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}