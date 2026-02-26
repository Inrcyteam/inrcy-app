import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireEnv } from "@/lib/env";
import { getAppUrl, stripePost } from "@/lib/stripeRest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, contact_email")
      .eq("user_id", userId)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);

    const priceId = requireEnv("STRIPE_PRICE_STARTER_ID");
    const appUrl = getAppUrl(req) || requireEnv("NEXT_PUBLIC_APP_URL");

    // Ensure we have an email
    const email = (sub as any)?.contact_email || user.email;
    if (!email) {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }

    // Create customer if missing
    let customerId = (sub as any)?.stripe_customer_id as string | undefined;
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

    const session = await stripePost("/checkout/sessions", sessionParams);


    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
