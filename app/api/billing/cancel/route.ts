import { NextResponse } from "next/server";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { stripePost } from "@/lib/stripeRest";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const stripeSubId = (sub as { stripe_subscription_id?: string | null } | null | undefined)?.stripe_subscription_id ?? undefined;
    if (!stripeSubId) {
      return NextResponse.json({ error: "Aucun abonnement actif n’a été trouvé pour ce compte." }, { status: 400 });
    }

    // 1 month notice == cancel at period end (Stripe period is monthly)
    const updated = await stripePost(
      `/subscriptions/${stripeSubId}`,
      new URLSearchParams({
        cancel_at_period_end: "true",
      })
    );

    const cancelEndDate = updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString().slice(0, 10)
      : null;

    // UI immédiat : le webhook Stripe reste la source de vérité ensuite.
    await supabaseAdmin
      .from("subscriptions")
      .update({
        cancel_requested_at: new Date().toISOString(),
        end_date: cancelEndDate,
        status: updated.status,
        next_renewal_date: cancelEndDate,
      })
      .eq("user_id", userId);

    return NextResponse.json({ ok: true, end_date: cancelEndDate });
  } catch (e: unknown) {
    const msg = getSimpleFrenchErrorMessage(e, "Le service est momentanément indisponible. Merci de réessayer dans quelques minutes.");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
