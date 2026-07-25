import "server-only";

import {
  DASHBOARD_ONBOARDING_SELECT,
  DASHBOARD_ONBOARDING_VERSION,
  isDashboardOnboardingFirstOpening,
  normalizeDashboardOnboardingRow,
  type DashboardOnboardingInitialState,
} from "@/lib/dashboardOnboarding";
import { requireUser } from "@/lib/requireUser";

export async function getDashboardInitialOnboardingStateServer(): Promise<DashboardOnboardingInitialState | null> {
  const { supabase, activeUserId, errorResponse } = await requireUser();
  if (errorResponse || !supabase || !activeUserId) return null;

  try {
    const { data, error } = await supabase
      .from("inrcy_onboarding_states")
      .select(DASHBOARD_ONBOARDING_SELECT)
      .eq("account_id", activeUserId)
      .maybeSingle();

    if (error) return null;

    let row = normalizeDashboardOnboardingRow(data);
    const firstOpeningDetected = isDashboardOnboardingFirstOpening(row);

    if (row && firstOpeningDetected) {
      const { data: startedData, error: startedError } = await supabase.rpc(
        "inrcy_save_onboarding_state",
        {
          p_account_id: activeUserId,
          p_status: "in_progress",
          p_current_step: row.currentStep,
          p_version: DASHBOARD_ONBOARDING_VERSION,
        },
      );

      if (startedError) return null;
      row = normalizeDashboardOnboardingRow(startedData);
    }

    return {
      accountId: activeUserId,
      row,
      onboardingAvailable: Boolean(row),
      onboardingError: false,
      firstOpeningDetected,
    };
  } catch {
    return null;
  }
}
