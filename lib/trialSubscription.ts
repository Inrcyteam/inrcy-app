import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { optionalEnv } from "@/lib/env";

export const TRIAL_REMINDER_OFFSETS = [10, 7, 3, 1] as const;

export function getTrialDays() {
  return Math.max(1, Number(optionalEnv("INRCY_TRIAL_DAYS", "30")) || 30);
}

export function computeTrialWindowFromNow(trialDays = getTrialDays()) {
  const start = new Date();
  const end = new Date(start.getTime() + trialDays * 24 * 3600 * 1000);
  return { start, end };
}

export function computeTrialDatesFromStartDate(startDate: string, trialDays = getTrialDays()) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + trialDays);
  return { trialStartAt: start.toISOString(), trialEndAt: end.toISOString() };
}

export async function ensureTrialSubscription(userId: string, adminEmail: string) {
  const trialDays = getTrialDays();
  const { start, end } = computeTrialWindowFromNow(trialDays);
  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan: "Trial",
        status: "trialing",
        monthly_price_eur: 0,
        start_date: start.toISOString().slice(0, 10),
        contact_email: adminEmail,
        trial_start_at: start.toISOString(),
        trial_end_at: end.toISOString(),
        last_trial_reminder_day: 0,
        last_reminder_at: null,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        admin_email: adminEmail,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

  if (profileError) throw new Error(profileError.message);

  return { trialDays, start, end };
}
