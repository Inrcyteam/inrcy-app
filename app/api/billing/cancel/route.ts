import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { stripePost } from "@/lib/stripeRest";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const stripeSubId = (sub as any)?.stripe_subscription_id as string | undefined;
    if (!stripeSubId) {
      return NextResponse.json({ error: "Aucun abonnement Stripe trouvé" }, { status: 400 });
    }

    // 1 month notice == cancel at period end (Stripe period is monthly)
    await stripePost(
      `/subscriptions/${stripeSubId}`,
      new URLSearchParams({
        cancel_at_period_end: "true",
      })
    );

    // DB will be synced by webhook (subscription.updated)
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
