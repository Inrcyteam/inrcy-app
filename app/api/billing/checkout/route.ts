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

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const body: unknown = await req.json().catch(() => ({}));
    // Allowed paid plans (Trial is managed by iNrCy, not selectable here)
    const wantedPlan = String((body as { plan?: unknown } | null | undefined)?.plan || "Starter");

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
      // start_date is used as a fallback to compute trial_end_at when older rows don't have it yet.
      .select("stripe_customer_id, stripe_subscription_id, status, plan, start_date, trial_end_at, contact_email")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);

    const row = sub as SubscriptionRow | null | undefined;

    const appUrl = getAppUrl(req) || requireEnv("NEXT_PUBLIC_APP_URL");

    // ✅ iNrCy rule: user can only subscribe DURING the 30-day trial.
    // After trial end, account + data are deleted, so checkout must be blocked.
    // ✅ Trial end is stored in subscriptions.trial_end_at, but some existing rows may not have it yet.
    // In that case, we compute it from start_date (+30 days) and persist it so future checkouts work.
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
      computed.setDate(computed.getDate() + 30);
      trialEndAt = computed.toISOString();

      // Persist the computed trial_end_at for consistency
      await supabaseAdmin.from("subscriptions").update({ trial_end_at: trialEndAt }).eq("user_id", userId);
    }

    const trialEndUnix = Math.floor(new Date(trialEndAt).getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);

    // (+60s) avoids edge cases when trial_end is extremely close to now.
    if (!Number.isFinite(trialEndUnix) || trialEndUnix <= nowUnix + 60) {
      return NextResponse.json(
        {
          error:
            "La période d'essai est terminée. L'abonnement n'est plus disponible pour ce compte.",
        },
        { status: 403 }
      );
    }

    // 🔒 Prevent creating multiple subscriptions for the same user.
    // If there's already a Stripe subscription attached and it's not cancelled, block checkout.
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

    // Ensure we have an email
    const email = row?.contact_email || user.email;
    if (!email) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    // Create customer if missing
    let customerId = row?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customerParams = new URLSearchParams();
      customerParams.set("email", email);
      customerParams.set("metadata[user_id]", userId);

      const customer = await stripePost("/customers", customerParams);
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

    // Link user to the session for webhook reconciliation
    sessionParams.set("metadata[user_id]", userId);
    sessionParams.set("subscription_data[metadata][user_id]", userId);

    // ✅ Key behavior: subscription is created now, but billing starts at the END of the iNrCy trial.
    // User can subscribe anytime during trial; they will NOT be charged until trial_end.
    sessionParams.set("subscription_data[trial_end]", String(trialEndUnix));

    // ✅ Always collect a payment method, even if nothing is due today.
    sessionParams.set("payment_method_collection", "always");

    // ✅ Create checkout session
    const session = await stripePost("/checkout/sessions", sessionParams);

    // ✅ Optimistic DB update for UX:
    // - record the chosen price/plan immediately, so the dashboard can show
    //   "paiement confirmé" + chosen pack even before the webhook arrives.
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
